from django.test import TestCase
from django.utils import timezone
from attendance.models import Attendance, AbsenceWarning
from cohorts.models import Cohort
from applications.models import Application
from students.models import StudentProfile
from django.contrib.auth import get_user_model
from attendance.services.discipline_service import evaluate_session_discipline
from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
from datetime import time

User = get_user_model()

class AttendanceSafetyTest(TestCase):
    def setUp(self):
        self.user = User.objects.create(email="test@example.com")
        self.student = self.user.student_profile
        from courses.models import Course
        self.course = Course.objects.create(name="Test Course", code="TST")
        self.cohort = Cohort.objects.create(name="Test Cohort", status=Cohort.Status.ACTIVE, course=self.course, start_date=timezone.localdate(), end_date=timezone.localdate())
        self.app = Application.objects.create(
            student=self.student,
            course=self.course,
            assigned_cohort=self.cohort, 
            status="TRAINING"
        )
        self.session = Attendance.objects.create(
            class_type="DOMAIN",
            cohort=self.cohort,
            class_date=timezone.now().date(),
            start_time=time(10, 0),
            end_time=time(11, 0),
            meeting_link="https://meet.google.com/abc-defg-hij",
            class_status=Attendance.ClassStatus.SCHEDULED
        )

    def test_operational_session_not_historical(self):
        """
        Proves that an operational session with a valid Google Meet link 
        cannot be incorrectly treated as a "historical" or "offline" session, 
        even if historical_attendance_data is injected into it.
        """
        # Inject historical data manually (simulating the bug)
        self.session.historical_attendance_data = {
            "status": "READY",
            "expected_students": {
                str(self.student.id): {"status": "ABSENT"}
            }
        }
        self.session.save()

        # Ask RealMeetAttendanceService if it considers this a valid online meet
        self.assertTrue(bool(self.session.meeting_link))
        # Wait, the rule is enforced when resolving attendance.
        # We can check the get_structured_attendance logic.
        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        # If it has a meeting link, it should look for google_meet_attendance_data, NOT historical
        # Wait, let's just make sure it doesn't prioritize historical data when it has a google meet link.
        self.assertNotIn("historical_attendance_data", result)

    def test_api_failure_resilience(self):
        """
        Proves that if Google Meet APIs fail or return a NOT_READY/FAILED status,
        the discipline service safely skips execution instead of defaulting to 
        0% attendance and suspending students.
        """
        self.session.class_status = Attendance.ClassStatus.COMPLETED
        self.session.google_meet_attendance_data = {
            "status": "NOT_READY",
            "message": "API Failure"
        }
        self.session.save()

        # Run discipline
        evaluate_session_discipline(self.session)
        
        # Application should still be TRAINING, not suspended
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, "TRAINING")
        
        # No warnings should be created
        self.assertFalse(AbsenceWarning.objects.filter(student=self.student).exists())
        