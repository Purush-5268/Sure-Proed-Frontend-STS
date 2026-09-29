from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from attendance.models import Attendance
from applications.models import Application, ApplicationStatusAudit
from cohorts.models import Cohort
from courses.models import Course
from students.models import StudentProfile
from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
from django.contrib.auth import get_user_model

User = get_user_model()

class TestSessionAwareAttendance(TestCase):

    def setUp(self):
        self.course = Course.objects.create(title="Test Course", domain="FSD")
        self.cohort = Cohort.objects.create(name="G2-26", course=self.course, status=Cohort.Status.ACTIVE)
        
        self.students = []
        self.apps = []
        for i in range(13):
            u = User.objects.create(email=f"student{i}@example.com", role=User.Role.STUDENT, first_name=f"Student", last_name=f"{i}")
            sp = StudentProfile.objects.create(user=u)
            app = Application.objects.create(
                student=sp, 
                course=self.course, 
                assigned_cohort=self.cohort, 
                status="TRAINING"
            )
            ApplicationStatusAudit.objects.create(
                application=app,
                from_status="COHORT_ASSIGNED",
                to_status="TRAINING",
                created_at=timezone.now() - timedelta(days=2)
            )
            self.students.append(u)
            self.apps.append(app)
            
        self.session = Attendance.objects.create(
            cohort=self.cohort,
            class_type="DOMAIN",
            date=timezone.now().date(),
            actual_start_time=timezone.now() - timedelta(hours=2)
        )

    def test_1_13_active_students_expected_13(self):
        roster = RealMeetAttendanceService.get_expected_roster(self.session)
        self.assertEqual(len(roster), 13)

    def test_2_student_suspended_before_session(self):
        app = self.apps[0]
        ApplicationStatusAudit.objects.create(
            application=app,
            from_status="TRAINING",
            to_status="SUSPENDED",
            created_at=self.session.actual_start_time - timedelta(hours=1)
        )
        app.status = "SUSPENDED"
        app.save()

        roster = RealMeetAttendanceService.get_expected_roster(self.session)
        self.assertEqual(len(roster), 12)
        self.assertNotIn(app.student.user.email.lower(), roster)

    def test_3_student_suspended_after_session(self):
        app = self.apps[0]
        ApplicationStatusAudit.objects.create(
            application=app,
            from_status="TRAINING",
            to_status="SUSPENDED",
            created_at=self.session.actual_start_time + timedelta(hours=1)
        )
        app.status = "SUSPENDED"
        app.save()

        roster = RealMeetAttendanceService.get_expected_roster(self.session)
        self.assertEqual(len(roster), 13)
        self.assertIn(app.student.user.email.lower(), roster)

    def test_4_historical_session_resync(self):
        app = self.apps[0]
        ApplicationStatusAudit.objects.create(
            application=app,
            from_status="TRAINING",
            to_status="SUSPENDED",
            created_at=self.session.actual_start_time + timedelta(hours=1)
        )
        app.status = "SUSPENDED"
        app.save()
        
        roster = RealMeetAttendanceService.get_expected_roster(self.session)
        self.assertEqual(len(roster), 13)

    def test_5_future_session_after_suspension(self):
        app = self.apps[0]
        ApplicationStatusAudit.objects.create(
            application=app,
            from_status="TRAINING",
            to_status="SUSPENDED",
            created_at=self.session.actual_start_time - timedelta(hours=1)
        )
        app.status = "SUSPENDED"
        app.save()
        
        future_session = Attendance.objects.create(
            cohort=self.cohort,
            class_type="DOMAIN",
            date=timezone.now().date(),
            actual_start_time=timezone.now() + timedelta(hours=1)
        )
        
        roster = RealMeetAttendanceService.get_expected_roster(future_session)
        self.assertEqual(len(roster), 12)
        self.assertNotIn(app.student.user.email.lower(), roster)

    def test_9_reaccess_before_future_session(self):
        app = self.apps[0]
        ApplicationStatusAudit.objects.create(
            application=app,
            from_status="TRAINING",
            to_status="SUSPENDED",
            created_at=self.session.actual_start_time - timedelta(hours=2, minutes=30)
        )
        ApplicationStatusAudit.objects.create(
            application=app,
            from_status="SUSPENDED",
            to_status="TRAINING",
            created_at=self.session.actual_start_time - timedelta(hours=1)
        )
        app.status = "TRAINING"
        app.save()
        
        roster = RealMeetAttendanceService.get_expected_roster(self.session)
        self.assertEqual(len(roster), 13)
        self.assertIn(app.student.user.email.lower(), roster)

    def test_10_no_audit_fallback(self):
        app = self.apps[0]
        app.status_audits.all().delete() 
        app.status = "TRAINING"
        app.save()
        
        roster = RealMeetAttendanceService.get_expected_roster(self.session)
        self.assertEqual(len(roster), 13)
        self.assertIn(app.student.user.email.lower(), roster)

    def test_11_no_n1_queries(self):
        with self.assertNumQueries(2): 
            RealMeetAttendanceService.get_expected_roster(self.session)
