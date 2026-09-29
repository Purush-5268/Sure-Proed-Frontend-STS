from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course
from trainings.models import Training, TrainingAttendance, TrainingSession


class TrainingAttendanceAutoSuspensionTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="train-admin@example.com",
            password="test-pass",
        )
        self.student_user = User.objects.create_user(
            email="train-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
            first_name="Train",
            last_name="Student",
        )
        self.course = Course.objects.create(
            code="TRAIN-101",
            name="Training Course",
            domain="Tech",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            code="TRAIN-COHORT-1",
            name="Train Cohort 1",
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date(),
            created_by=self.admin,
            status=Cohort.Status.ACTIVE,
        )
        self.application = Application.objects.create(
            application_number="APP-TRAIN-001",
            student=self.student_user.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True,
        )
        self.training = Training.objects.create(
            title="Soft Skills Training",
            training_type=Training.TrainingType.SOFT_SKILLS,
        )
        self.session = TrainingSession.objects.create(
            training=self.training,
            cohort=self.cohort,
            title="Communication Session 1",
            session_date=timezone.now().date(),
            start_time=timezone.now().time(),
        )

    def test_absent_training_attendance_auto_suspends_cohort(self):
        attendance = TrainingAttendance.objects.create(
            session=self.session,
            student=self.student_user.student_profile,
            status=TrainingAttendance.Status.ABSENT,
        )
        self.application.refresh_from_db()
        self.assertEqual(attendance.status, TrainingAttendance.Status.ABSENT)
        self.assertEqual(self.application.status, Application.Status.SUSPENDED)
        self.assertIn("Auto-Suspended", self.application.remarks)

    def test_present_training_attendance_does_not_suspend_cohort(self):
        attendance = TrainingAttendance.objects.create(
            session=self.session,
            student=self.student_user.student_profile,
            status=TrainingAttendance.Status.PRESENT,
        )
        self.application.refresh_from_db()
        self.assertEqual(attendance.status, TrainingAttendance.Status.PRESENT)
        self.assertEqual(self.application.status, Application.Status.COHORT_ASSIGNED)
