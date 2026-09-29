import json
from pathlib import Path
from tempfile import TemporaryDirectory
from django.core.management import call_command
from django.test import TestCase

from accounts.models import User
from students.models import StudentProfile
from volunteers.models import MentorProfile


class CleanupSyntheticLinkedInUrlsTests(TestCase):
    def setUp(self):
        self.student_user = User.objects.create_user(
            email="student_synthetic@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
        )
        self.student_profile = self.student_user.student_profile
        self.student_profile.linkedin_id = "opaque-sub-123"
        self.student_profile.linkedin_url = "https://www.linkedin.com/in/opaque-sub-123"
        self.student_profile.is_linkedin_connected = True
        self.student_profile.save(update_fields=["linkedin_id", "linkedin_url", "is_linkedin_connected"])

        self.student_user_valid = User.objects.create_user(
            email="student_valid@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
        )
        self.student_profile_valid = self.student_user_valid.student_profile
        self.student_profile_valid.linkedin_id = "opaque-sub-456"
        self.student_profile_valid.linkedin_url = "https://www.linkedin.com/in/real-vanity-name"
        self.student_profile_valid.is_linkedin_connected = True
        self.student_profile_valid.save(update_fields=["linkedin_id", "linkedin_url", "is_linkedin_connected"])

    def test_dry_run_identifies_synthetic_without_modifying(self):
        with TemporaryDirectory() as tmp_dir:
            report_file = Path(tmp_dir) / "report.json"
            call_command("cleanup_synthetic_linkedin_urls", report=str(report_file))

            report = json.loads(report_file.read_text(encoding="utf-8"))
            self.assertEqual(report["mode"], "dry-run")
            self.assertEqual(report["cleaned_student_count"], 1)
            self.assertEqual(report["cleaned_students"][0]["email"], "student_synthetic@example.com")

            self.student_profile.refresh_from_db()
            self.assertEqual(self.student_profile.linkedin_url, "https://www.linkedin.com/in/opaque-sub-123")

    def test_apply_clears_synthetic_and_preserves_valid(self):
        with TemporaryDirectory() as tmp_dir:
            report_file = Path(tmp_dir) / "report.json"
            call_command("cleanup_synthetic_linkedin_urls", apply=True, report=str(report_file))

            report = json.loads(report_file.read_text(encoding="utf-8"))
            self.assertEqual(report["mode"], "apply")
            self.assertEqual(report["cleaned_student_count"], 1)

            self.student_profile.refresh_from_db()
            self.assertIsNone(self.student_profile.linkedin_url)
            self.assertEqual(self.student_profile.linkedin_id, "opaque-sub-123")
            self.assertTrue(self.student_profile.is_linkedin_connected)

            self.student_profile_valid.refresh_from_db()
            self.assertEqual(self.student_profile_valid.linkedin_url, "https://www.linkedin.com/in/real-vanity-name")
