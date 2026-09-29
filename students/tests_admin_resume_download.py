import shutil
import tempfile
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import User
from students.models import StudentProfile


class AdminResumeDownloadTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="sureproed-media-")
        self.private_media_root = tempfile.mkdtemp(prefix="sureproed-private-media-")
        self.settings_override = override_settings(
            MEDIA_ROOT=self.media_root,
            PRIVATE_MEDIA_ROOT=self.private_media_root,
        )
        self.settings_override.enable()

        self.admin_user = User.objects.create_superuser(
            email="admin-resume-download@example.com",
            password="admin-password",
        )
        self.student_user = User.objects.create_user(
            email="student-resume-download@example.com",
            password="student-password",
            role=User.Role.STUDENT,
        )
        self.profile = self.student_user.student_profile
        self.profile.resume = SimpleUploadedFile(
            "my_resume.pdf",
            b"%PDF-1.4 student confidential resume content",
            content_type="application/pdf",
        )
        self.profile.save()

        self.download_url = reverse(
            "admin:studentprofile-resume-download",
            args=[self.profile.pk],
        )

    def force_verified_admin_login(self):
        device = TOTPDevice.objects.create(user=self.admin_user, name="test-admin", confirmed=True)
        self.client.force_login(self.admin_user)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)
        shutil.rmtree(self.private_media_root, ignore_errors=True)

    def test_staff_downloads_resume_without_exposing_raw_media_link(self):
        self.force_verified_admin_login()

        change_response = self.client.get(
            reverse("admin:students_studentprofile_change", args=[self.profile.pk])
        )
        self.assertEqual(change_response.status_code, 200)
        self.assertContains(change_response, self.download_url)
        # Should not expose raw href link to unauthenticated media URL
        self.assertNotContains(change_response, f'/media/{self.profile.resume.name}')

        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 student confidential resume content")

    def test_resume_admin_download_requires_staff_authentication(self):
        anonymous_response = self.client.get(self.download_url)
        self.assertEqual(anonymous_response.status_code, 302)
        self.assertIn(reverse("admin:login"), anonymous_response.url)

        self.client.force_login(self.student_user)
        student_response = self.client.get(self.download_url)
        self.assertEqual(student_response.status_code, 302)
        self.assertIn(reverse("admin:login"), student_response.url)

    def test_missing_resume_file_returns_not_found(self):
        storage = self.profile.resume.storage
        storage.delete(self.profile.resume.name)
        self.force_verified_admin_login()

        # Change view displays warning message
        change_response = self.client.get(
            reverse("admin:students_studentprofile_change", args=[self.profile.pk])
        )
        self.assertEqual(change_response.status_code, 200)
        self.assertContains(change_response, "missing from storage")

        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, 404)

    def test_media_resume_anonymous_returns_404(self):
        rel_path = self.profile.resume.name
        filename = Path(rel_path).name
        response = self.client.get(f"/media/students/resumes/{filename}")
        self.assertEqual(response.status_code, 404)

    def test_media_resume_staff_returns_200(self):
        self.client.force_login(self.admin_user)
        rel_path = self.profile.resume.name
        filename = Path(rel_path).name
        response = self.client.get(f"/media/students/resumes/{filename}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 student confidential resume content")

    def test_media_resume_student_owner_returns_200(self):
        self.client.force_login(self.student_user)
        rel_path = self.profile.resume.name
        filename = Path(rel_path).name
        response = self.client.get(f"/media/students/resumes/{filename}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 student confidential resume content")

    def test_media_resume_other_student_returns_404(self):
        other_student = User.objects.create_user(
            email="other-student@example.com",
            password="other-password",
            role=User.Role.STUDENT,
        )
        self.client.force_login(other_student)
        rel_path = self.profile.resume.name
        filename = Path(rel_path).name
        response = self.client.get(f"/media/students/resumes/{filename}")
        self.assertEqual(response.status_code, 404)

    def test_usersearch_admin_change_form_shows_download_link(self):
        self.force_verified_admin_login()
        usersearch_url = reverse("admin:accounts_usersearch_change", args=[self.student_user.pk])
        response = self.client.get(usersearch_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.download_url)
        self.assertContains(response, "Download Resume")

    def test_download_resume_with_jwt_token_in_query_param(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(self.student_user).access_token)
        download_api_url = f"/api/students/{self.profile.pk}/download-resume/?token={token}"
        response = self.client.get(download_api_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 student confidential resume content")

    def test_download_resume_with_signed_token_in_query_param(self):
        from django.core.signing import TimestampSigner
        signer = TimestampSigner()
        signed_token = signer.sign(f"resume:{self.profile.pk}:{self.student_user.pk}")
        download_api_url = f"/api/students/{self.profile.pk}/download-resume/?token={signed_token}"
        response = self.client.get(download_api_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")

    def test_download_resume_with_invalid_token_returns_401(self):
        download_api_url = f"/api/students/{self.profile.pk}/download-resume/?token=invalid-garbage-token"
        response = self.client.get(download_api_url)
        self.assertEqual(response.status_code, 401)

