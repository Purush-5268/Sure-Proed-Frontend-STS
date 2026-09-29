from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from students.models import StudentProfile
from applications.models import Application
from courses.models import Course
from cohorts.models import Cohort
from attendance.models import Attendance, PriorPermission, AbsenceWarning
from django.utils import timezone
import datetime

User = get_user_model()

class CumulativeAttendanceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="test_student_cumulative@example.com", 
            password="Password123!",
            first_name="Test",
            last_name="Student",
            role=User.Role.STUDENT,
        )
        self.student_profile = StudentProfile.objects.get(user=self.user)
        self.course = Course.objects.create(name="Test Course", code="TST101")
        self.now = timezone.now()
        self.cohort = Cohort.objects.create(
            name="Test Cohort", 
            course=self.course,
            start_date=self.now.date() - datetime.timedelta(days=10),
            end_date=self.now.date() + datetime.timedelta(days=30)
        )
        
        # Need an audit trail so enrollment_started_at recognizes the assignment
        self.application = Application.objects.create(
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.COHORT_ASSIGNED,
            applied_at=self.now - datetime.timedelta(days=15)
        )
        from applications.models import ApplicationStatusAudit
        ApplicationStatusAudit.objects.create(
            application=self.application,
            from_status="APPLIED",
            to_status=Application.Status.COHORT_ASSIGNED,
            created_at=self.now - datetime.timedelta(days=12)
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_session(self, date_offset=0, status="COMPLETED", percentage=None, identity_review=False):
        class_date = (self.now - datetime.timedelta(days=abs(date_offset))).date()
        session = Attendance.objects.create(
            cohort=self.cohort,
            class_date=class_date,
            start_time=datetime.time(10, 0),
            end_time=datetime.time(11, 0),
            title=f"Session {date_offset}",
            class_status=status,
            conducted=True if status == "COMPLETED" else False
        )
        if percentage is not None:
            student_status = "PRESENT" if percentage >= 96 else "ABSENT"
            if identity_review:
                student_status = "IDENTITY_REVIEW_REQUIRED"
                
            session.google_meet_attendance_data = {
                "status": "READY",
                "expected_students": {
                    str(self.student_profile.pk): {
                        "status": student_status,
                        "attendance_percentage": percentage
                    }
                }
            }
            session.save()
        return session

    def test_no_valid_sessions_returns_null(self):
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertIsNone(data['current_application']['cumulative_attendance_percentage'])

    def test_one_session_at_100_returns_100(self):
        self._create_session(date_offset=-1, percentage=100.0)
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 100.0)

    def test_100_90_80_returns_90(self):
        self._create_session(date_offset=-1, percentage=100.0)
        self._create_session(date_offset=-2, percentage=90.0)
        self._create_session(date_offset=-3, percentage=80.0)
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 90.0)

    def test_100_0_returns_50(self):
        self._create_session(date_offset=-1, percentage=100.0)
        self._create_session(date_offset=-2, percentage=0.0)
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 50.0)

    def test_cancelled_invalid_session_excluded(self):
        self._create_session(date_offset=-1, percentage=100.0)
        # Cancelled session shouldn't be counted
        self._create_session(date_offset=-2, status="CANCELLED", percentage=0.0)
        # Future session shouldn't be counted
        # Date offset +2 means future, but _create_session uses abs(date_offset). Wait, I'll pass a positive value and use timedelta directly.
        future_date = (self.now + datetime.timedelta(days=2)).date()
        Attendance.objects.create(
            cohort=self.cohort,
            class_date=future_date,
            start_time=datetime.time(10, 0),
            end_time=datetime.time(11, 0),
            title="Future Session",
            class_status="SCHEDULED",
            conducted=False
        )
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 100.0)

    def test_legitimate_zero_valid_session_included(self):
        # 1 session 0%
        self._create_session(date_offset=-1, percentage=0.0)
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 0.0)

    def test_prior_permission_does_not_change_attendance(self):
        session = self._create_session(date_offset=-1, percentage=0.0)
        PriorPermission.objects.create(session=session, student=self.student_profile, reason="Sick", granted_by=self.user)
        response = self.client.get('/api/students/me/')
        data = response.json()
        # Should still be 0.0, because PriorPermission doesn't retroactively make you PRESENT for cumulative metrics
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 0.0)

    def test_attendance_change_dynamically_changes_cumulative_percentage(self):
        session1 = self._create_session(date_offset=-1, percentage=100.0)
        session2 = self._create_session(date_offset=-2, percentage=0.0)
        response = self.client.get('/api/students/me/')
        data = response.json()
        self.assertEqual(data['current_application']['cumulative_attendance_percentage'], 50.0)

        # Update session2 attendance to 100%
        session2.google_meet_attendance_data["expected_students"][str(self.student_profile.pk)]["attendance_percentage"] = 100.0
        session2.save()
        
        response2 = self.client.get('/api/students/me/')
        data2 = response2.json()
        self.assertEqual(data2['current_application']['cumulative_attendance_percentage'], 100.0)

    def test_existing_api_fields_remain_unchanged(self):
        response = self.client.get('/api/students/me/')
        data = response.json()
        app_data = data['current_application']
        self.assertIn("application_number", app_data)
        self.assertIn("status", app_data)
        self.assertIn("qualified", app_data)
        self.assertIn("required_meet_display_name", app_data)
        self.assertIn("course", app_data)
        self.assertIn("assigned_cohort", app_data)
        self.assertIn("cumulative_attendance_percentage", app_data)
        
        # Ensure student profile structure is not broken
        self.assertIn("first_name", data)
        self.assertIn("email", data)
