import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import User
from applications.models import Application
from courses.models import Course


class AdminOfferLetterDownloadTests(TestCase):
    def setUp(self):
        self.private_media_root = tempfile.mkdtemp(prefix="sureproed-private-media-")
        self.settings_override = override_settings(PRIVATE_MEDIA_ROOT=self.private_media_root)
        self.settings_override.enable()

        self.admin_user = User.objects.create_superuser(
            email="admin-offer-download@example.com",
            password="admin-password",
        )
        self.student_user = User.objects.create_user(
            email="student-offer-download@example.com",
            password="student-password",
            role=User.Role.STUDENT,
        )
        self.course = Course.objects.create(
            code="ADMIN-OFFER",
            name="Admin Offer Letter Test",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )
        self.application = Application.objects.create(
            application_number="APP-ADMIN-OFFER-001",
            student=self.student_user.student_profile,
            course=self.course,
            status=Application.Status.APPLIED,
            offer_letter_status=Application.OfferLetterStatus.ISSUED,
            offer_letter_issued=True,
            offer_letter_file=SimpleUploadedFile(
                "offer.pdf",
                b"%PDF-1.4 protected admin offer letter",
                content_type="application/pdf",
            ),
        )
        self.download_url = reverse(
            "admin:application-offer-letter-download",
            args=[self.application.pk],
        )

    def force_verified_admin_login(self):
        device = TOTPDevice.objects.create(user=self.admin_user, name="test-admin", confirmed=True)
        self.client.force_login(self.admin_user)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.private_media_root, ignore_errors=True)

    def test_staff_downloads_private_offer_letter_without_public_media_url(self):
        self.force_verified_admin_login()

        change_response = self.client.get(
            reverse("admin:applications_application_change", args=[self.application.pk])
        )
        self.assertEqual(change_response.status_code, 200)
        self.assertContains(change_response, self.download_url)
        self.assertNotContains(change_response, f'/media/{self.application.offer_letter_file.name}')

        response = self.client.get(self.download_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(response["Cache-Control"], "no-store, no-cache, must-revalidate, private, max-age=0")
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 protected admin offer letter")

    def test_offer_letter_admin_download_requires_staff_authentication(self):
        anonymous_response = self.client.get(self.download_url)
        self.assertEqual(anonymous_response.status_code, 302)
        self.assertIn(reverse("admin:login"), anonymous_response.url)

        self.client.force_login(self.student_user)
        student_response = self.client.get(self.download_url)
        self.assertEqual(student_response.status_code, 302)
        self.assertIn(reverse("admin:login"), student_response.url)

    def test_missing_private_file_returns_not_found(self):
        storage = self.application.offer_letter_file.storage
        storage.delete(self.application.offer_letter_file.name)
        self.force_verified_admin_login()

        response = self.client.get(self.download_url)

        self.assertEqual(response.status_code, 404)

    def test_media_offer_letters_anonymous_returns_404(self):
        rel_path = self.application.offer_letter_file.name
        if rel_path.startswith("offer_letters/"):
            rel_path = rel_path[len("offer_letters/"):]
        response = self.client.get(f"/media/offer_letters/{rel_path}")
        self.assertEqual(response.status_code, 404)

    def test_media_offer_letters_staff_returns_200(self):
        self.client.force_login(self.admin_user)
        rel_path = self.application.offer_letter_file.name
        if rel_path.startswith("offer_letters/"):
            rel_path = rel_path[len("offer_letters/"):]
        response = self.client.get(f"/media/offer_letters/{rel_path}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 protected admin offer letter")

    def test_media_offer_letters_student_owner_returns_200(self):
        self.client.force_login(self.student_user)
        rel_path = self.application.offer_letter_file.name
        if rel_path.startswith("offer_letters/"):
            rel_path = rel_path[len("offer_letters/"):]
        response = self.client.get(f"/media/offer_letters/{rel_path}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 protected admin offer letter")

    def test_media_offer_letters_other_student_returns_404(self):
        other_student = User.objects.create_user(
            email="other-student@example.com",
            password="other-password",
            role=User.Role.STUDENT,
        )
        self.client.force_login(other_student)
        rel_path = self.application.offer_letter_file.name
        if rel_path.startswith("offer_letters/"):
            rel_path = rel_path[len("offer_letters/"):]
        response = self.client.get(f"/media/offer_letters/{rel_path}")
        self.assertEqual(response.status_code, 404)

