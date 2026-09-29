import tempfile
from pathlib import Path
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.db import transaction
from rest_framework.test import APIClient
from accounts.models import User
from students.models import StudentProfile
from students import tests as file_upload_tests


class ResumeLifecycleTests(TestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        settings = override_settings(MEDIA_ROOT=self.media.name)
        settings.enable()
        self.addCleanup(settings.disable)
        self.a = User.objects.create_user(email="file_test_student@student.example.com", password="isolated-only", first_name="File", last_name="Tester", role="STUDENT")
        self.b = User.objects.create_user(email="other@student.example.com", password="isolated-only", role="STUDENT", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.a)

    def upload(self, name="resume.pdf"):
        return file_upload_tests.StudentFileUploadsTestCase._pdf_file(name, file_upload_tests.StudentFileUploadsTestCase._resume_lines())

    def test_upload_replace_fetch_clear_and_reload_current_resume(self):
        with self.captureOnCommitCallbacks(execute=True), patch("common.tasks.process_resume_and_photo_verification.delay"):
            first = self.client.patch("/api/students/me/", {"resume": self.upload()}, format="multipart")
        self.assertEqual(first.status_code, 200, first.data)
        first_name = self.a.student_profile.resume.name
        self.a.student_profile.refresh_from_db()
        first_name = self.a.student_profile.resume.name
        with self.captureOnCommitCallbacks(execute=True), patch("common.tasks.process_resume_and_photo_verification.delay"):
            updated = self.client.patch("/api/students/me/", {"resume": self.upload("replacement.pdf")}, format="multipart")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertNotEqual(first.data["resume_url"], updated.data["resume_url"])
        self.assertEqual(updated.data["resume"], updated.data["resume_url"])
        self.assertFalse(Path(self.media.name, first_name).exists())
        reloaded = self.client.get("/api/students/me/")
        self.assertEqual(reloaded.data["resume_url"], updated.data["resume_url"])
        self.assertEqual(reloaded.data["resume"], reloaded.data["resume_url"])
        response = self.client.get(updated.data["resume_url"])
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))
        with self.captureOnCommitCallbacks(execute=True), patch("common.tasks.process_resume_and_photo_verification.delay"):
            cleared = self.client.patch("/api/students/me/", {"resume": None}, format="json")
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.assertIsNone(cleared.data["resume_url"])
        self.assertEqual(self.client.get(updated.data["resume_url"]).status_code, 404)

    def test_other_account_cannot_read_or_replace_via_any_identifier_even_if_staff(self):
        uploaded = self.client.patch("/api/students/me/", {"resume": self.upload()}, format="multipart")
        self.assertEqual(uploaded.status_code, 200, uploaded.data)
        profile = self.a.student_profile
        self.client.force_authenticate(self.b)
        for identifier in (profile.pk, self.a.pk, profile.student_code):
            self.assertEqual(self.client.get(f"/api/students/{identifier}/download-resume/").status_code, 404)
            self.assertEqual(self.client.patch(f"/api/students/{identifier}/", {"resume": None}, format="json").status_code, 404)
        # Plain Django media view accepts JWT/session authentication, not DRF force_authenticate.
        self.client.force_login(self.b)
        profile.refresh_from_db()
        self.assertEqual(self.client.get(profile.resume.url).status_code, 404)
        self.client.logout()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(uploaded.data["resume_url"]).status_code, 401)
        self.assertEqual(self.client.get(profile.resume.url).status_code, 404)

    def test_failed_replacement_does_not_delete_committed_resume(self):
        profile = self.a.student_profile
        profile.resume = self.upload()
        profile.save()
        original_name = profile.resume.name
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                profile.resume = self.upload("replacement.pdf")
                profile.save()
                raise RuntimeError("Simulated transaction rollback")
        profile.refresh_from_db()
        self.assertEqual(profile.resume.name, original_name)
        self.assertTrue(profile.resume.storage.exists(original_name))

    def test_invalid_upload_preserves_current_file(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        profile = self.a.student_profile
        profile.resume = self.upload()
        profile.save()
        name = profile.resume.name
        response = self.client.patch("/api/students/me/", {"resume": SimpleUploadedFile("fake.pdf", b"not a pdf")}, format="multipart")
        self.assertEqual(response.status_code, 400)
        profile.refresh_from_db()
        self.assertEqual(name, profile.resume.name)
        self.assertTrue(profile.resume.storage.exists(name))
