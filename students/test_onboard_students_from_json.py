import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course
from students.models import StudentProfile


class OnboardStudentsFromJsonTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name="Data Analytics", code="DATA-ANALYTICS")
        self.cohort = Cohort.objects.create(
            code="G3-DA",
            name="G3 DA",
            course=self.course,
            start_date="2026-01-01",
            end_date="2026-06-01",
        )
        self.row = {
            "source_row": 10,
            "cohort_code": "G3-DA",
            "first_name": "Test",
            "last_name": "Student",
            "gender": "F",
            "date_of_birth": "2002-01-02",
            "college": "Example College",
            "degree": "B.Tech",
            "education_level": "UG",
            "specialization": "CSE",
            "graduation_year": 2027,
            "country": "India",
            "state": "Karnataka",
            "city": "Bengaluru",
            "linkedin_url": "https://www.linkedin.com/in/test-student",
            "github_username": "test-student",
            "email": "test.student@example.com",
            "phone_number": "9876543210",
        }

    def run_command(self, rows, apply=False):
        with TemporaryDirectory() as directory:
            source = Path(directory) / "students.json"
            report = Path(directory) / "report.json"
            source.write_text(json.dumps(rows), encoding="utf-8")
            args = [str(source), "--report", str(report)]
            if apply:
                args.append("--apply")
            call_command("onboard_students_from_json", *args)
            return json.loads(report.read_text(encoding="utf-8"))

    def test_dry_run_makes_no_changes(self):
        report = self.run_command([self.row])
        self.assertEqual(report["decision_counts"], {"CREATE": 1})
        self.assertFalse(User.objects.filter(email=self.row["email"]).exists())

    def test_apply_creates_user_profile_and_training_application(self):
        report = self.run_command([self.row], apply=True)
        user = User.objects.get(email=self.row["email"])
        profile = StudentProfile.objects.get(user=user)
        application = Application.objects.get(student=profile)

        self.assertEqual(report["created_users"], 1)
        self.assertTrue(user.has_usable_password())
        self.assertTrue(user.check_password("Cohorts@2026"))
        self.assertTrue(user.is_email_verified)
        self.assertEqual(user.gender, User.Gender.FEMALE)
        self.assertEqual(profile.education_level, StudentProfile.EducationLevel.UNDERGRADUATE)
        self.assertIsNone(profile.linkedin_url)
        self.assertEqual(profile.github_url, "https://github.com/test-student")
        self.assertEqual(application.assigned_cohort, self.cohort)
        self.assertEqual(application.status, Application.Status.TRAINING)
        self.assertTrue(application.qualified)

    def test_preserved_cohort_is_rejected(self):
        row = {**self.row, "cohort_code": "G40"}
        with self.assertRaisesMessage(CommandError, "preserved cohorts"):
            self.run_command([row], apply=True)

    def test_duplicate_email_is_rejected_before_writes(self):
        second = {**self.row, "source_row": 11, "phone_number": "9876543211"}
        with self.assertRaisesMessage(CommandError, "duplicate email"):
            self.run_command([self.row, second], apply=True)
        self.assertEqual(User.objects.count(), 0)

    def test_existing_phone_conflict_is_rejected_before_writes(self):
        User.objects.create_user(
            email="existing@example.com",
            role=User.Role.STUDENT,
            phone_number=self.row["phone_number"],
        )
        with self.assertRaisesMessage(CommandError, "blocking conflicts"):
            self.run_command([self.row], apply=True)
        self.assertFalse(User.objects.filter(email=self.row["email"]).exists())
