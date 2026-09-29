import datetime
from django.utils import timezone
from decimal import Decimal
from django.test import TestCase

from attendance.models import Attendance
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from students.models import StudentProfile
from django.contrib.auth import get_user_model
User = get_user_model()
from applications.models import Application
from exams.models import ModuleTest
from attendance.tasks import cleanup_completed_cohort_meet_data
from attendance.services.student_scope import attendance_metrics
from applications.services.application_service import ApplicationService

class CohortCleanupTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="student@test.com", password="pwd", role="STUDENT")
        self.student = StudentProfile.objects.get(user=self.user)
        
        self.course = Course.objects.create(
            code="TEST101",
            name="Test Course",
            status=Course.Status.PUBLISHED
        )
        self.module = CourseModule.objects.create(
            course=self.course,
            title="Module 1",
            order=1,
            module_number=1
        )
        
        # Create completed cohort (older than 30 days)
        self.completed_cohort = Cohort.objects.create(
            code="COMPLETED-26",
            course=self.course,
            start_date=timezone.now().date() - datetime.timedelta(days=100),
            end_date=timezone.now().date() - datetime.timedelta(days=40),
            status=Cohort.Status.COMPLETED
        )
        # Manually backdate updated_at (auto_now fields can be tricky to override, so we use update())
        Cohort.objects.filter(id=self.completed_cohort.id).update(
            updated_at=timezone.now() - datetime.timedelta(days=35)
        )
        
        # Create active cohort
        self.active_cohort = Cohort.objects.create(
            code="ACTIVE-26",
            course=self.course,
            start_date=timezone.now().date() - datetime.timedelta(days=10),
            end_date=timezone.now().date() + datetime.timedelta(days=20),
            status=Cohort.Status.ACTIVE
        )
        
        # Completed application
        self.old_app = Application.objects.create(
            student=self.student,
            course=self.course,
            assigned_cohort=self.completed_cohort,
            status=Application.Status.COMPLETED,
            completed_course=True,
            completed_at=timezone.now(),
            final_score=100
        )
        
        # Attendance for completed cohort
        self.old_attendance = Attendance.objects.create(
            cohort=self.completed_cohort,
            course=self.course,
            title="Old Session",
            class_date=timezone.now().date() - datetime.timedelta(days=50),
            start_time=datetime.time(10, 0),
            meeting_link="https://meet.google.com/old-link",
            calendar_event_id="old-event-123",
            class_status="COMPLETED",
            google_meet_attendance_data={
                "status": "READY",
                "expected_students": {
                    str(self.student.pk): {"status": "PRESENT", "attendance_percentage": 100}
                }
            }
        )
        self.old_attendance.attendees.add(self.student)
        
        # Attendance for active cohort
        self.new_attendance = Attendance.objects.create(
            cohort=self.active_cohort,
            course=self.course,
            title="New Session",
            class_date=timezone.now().date() - datetime.timedelta(days=5),
            start_time=datetime.time(10, 0),
            meeting_link="https://meet.google.com/new-link",
            calendar_event_id="new-event-123",
            class_status="COMPLETED",
            google_meet_attendance_data={
                "status": "READY",
                "expected_students": {
                    str(self.student.pk): {"status": "PRESENT", "attendance_percentage": 100}
                }
            }
        )
        self.new_attendance.attendees.add(self.student)
        
        # ModuleTests
        self.cohort_specific_mt = ModuleTest.objects.create(
            title="Cohort specific",
            course=self.course,
            cohort=self.completed_cohort,
            module=self.module,
            meeting_link="https://meet.google.com/mt-old",
            calendar_event_id="mt-event-old"
        )
        self.global_mt = ModuleTest.objects.create(
            title="Global specific",
            course=self.course,
            cohort=None,
            module=self.module,
            meeting_link="https://meet.google.com/mt-global",
            calendar_event_id="mt-event-global"
        )
        
    def test_cleanup(self):
        # Initial check
        metrics_before = attendance_metrics(self.student, self.old_app)
        self.assertEqual(metrics_before['percentage'], 100.0)
        self.assertEqual(metrics_before['total'], 1)
        
        # Run cleanup
        cleanup_completed_cohort_meet_data()
        
        # Reload
        self.old_attendance.refresh_from_db()
        self.new_attendance.refresh_from_db()
        self.cohort_specific_mt.refresh_from_db()
        self.global_mt.refresh_from_db()
        
        # 1. Completed cohort cleanup
        self.assertEqual(self.old_attendance.google_meet_attendance_data["status"], "READY")
        self.assertEqual(self.old_attendance.meeting_link, "")
        self.assertEqual(self.old_attendance.calendar_event_id, "")
        
        # 2. Active cohort untouched
        self.assertIsNotNone(self.new_attendance.google_meet_attendance_data)
        self.assertEqual(self.new_attendance.meeting_link, "https://meet.google.com/new-link")
        
        # 3. Module tests
        self.assertEqual(self.cohort_specific_mt.meeting_link, "")
        self.assertEqual(self.global_mt.meeting_link, "https://meet.google.com/mt-global")
        
        # 4. Attendees preserved
        self.assertTrue(self.old_attendance.attendees.filter(id=self.student.id).exists())
        
        # 5. Attendance percentage unchanged
        metrics_after = attendance_metrics(self.student, self.old_app)
        self.assertEqual(metrics_after['percentage'], 100.0)
        self.assertEqual(metrics_after['total'], 1)
        
        # 6. Reapplication eligibility
        # Should be able to apply to a different course
        course2 = Course.objects.create(code="TEST102", name="Another", status=Course.Status.PUBLISHED)
        is_eligible, _, _ = ApplicationService.can_student_apply(self.student, course2)
        self.assertTrue(is_eligible)
        
        # 7. Excel download generation for cleaned up cohort
        from rest_framework.test import APIClient
        client = APIClient()
        self.user.role = 'ADMIN' # To bypass mentor checks
        self.user.save()
        client.force_authenticate(user=self.user)
        response = client.get(f'/api/attendance/{self.old_attendance.id}/official-attendance/download/')
        
        # It should generate an Excel file (200 OK), not 400 Bad Request
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    def test_cleanup_preserves_historical_absences_without_attendee_membership(self):
        self.old_attendance.attendees.clear()
        self.old_attendance.google_meet_attendance_data["expected_students"][str(self.student.pk)] = {
            "status": "ABSENT", "attendance_percentage": 0,
        }
        self.old_attendance.save(update_fields=["google_meet_attendance_data"])
        before = attendance_metrics(self.student, self.old_app)
        self.assertEqual(before["total"], 1)
        cleanup_completed_cohort_meet_data()
        self.assertEqual(attendance_metrics(self.student, self.old_app), before)
