import tempfile

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application
from certificates.models import Certificate
from courses.models import Course
from certificates.services.pdf_generator import build_certificate_context


class CertificateApiTests(TestCase):
    def setUp(self):
        self.media_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_override = override_settings(MEDIA_ROOT=self.media_directory.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="certificate-admin@example.com", password="pwd"
        )
        self.student_user = User.objects.create_user(
            email="certificate-student@example.com",
            password="pwd",
            role=User.Role.STUDENT,
        )
        self.other_student_user = User.objects.create_user(
            email="other-certificate-student@example.com",
            password="pwd",
            role=User.Role.STUDENT,
        )
        self.course = Course.objects.create(
            code="CERT-COURSE",
            name="Certificate Course",
            domain="Technology",
            description="Certificate API tests",
            created_by=self.admin,
        )
        self.application = Application.objects.create(
            student=self.student_user.student_profile,
            course=self.course,
            status=Application.Status.QUALIFIED,
            qualified=True,
        )
        self.client.force_authenticate(self.admin)

    def test_metadata_exposes_all_django_certificate_choices(self):
        response = self.client.get("/api/certificates/metadata/")

        self.assertEqual(response.status_code, 200, response.data)
        values = {item["value"] for item in response.data["certificate_types"]}
        self.assertEqual(values, {value for value, _ in Certificate.CertificateType.choices})

    def test_student_certificate_rejects_another_students_application(self):
        response = self.client.post(
            "/api/certificates/",
            {
                "certificate_number": "CERT-MISMATCH",
                "verification_code": "VERIFY-MISMATCH",
                "student": str(self.other_student_user.student_profile.id),
                "application": str(self.application.id),
                "certificate_type": Certificate.CertificateType.COURSE,
                "issued_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("application", response.data)

    def test_staff_recipient_can_read_their_non_student_certificate(self):
        mentor = User.objects.create_user(
            email="certificate-mentor@example.com",
            password="pwd",
            role=User.Role.MENTOR,
        )
        certificate = Certificate.objects.create(
            certificate_number="CERT-MENTOR",
            verification_code="VERIFY-MENTOR",
            recipient_user=mentor,
            certificate_type=Certificate.CertificateType.MENTOR,
            issued_at=timezone.now(),
            issued_by=self.admin,
        )
        self.client.force_authenticate(mentor)

        response = self.client.get(f"/api/certificates/{certificate.id}/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["certificate_type"], Certificate.CertificateType.MENTOR)

    def test_api_issuance_generates_backend_owned_pdf(self):
        self.application.final_score = "91.25"
        self.application.save(update_fields=["final_score", "updated_at"])

        response = self.client.post(
            "/api/certificates/",
            {
                "certificate_number": "CERT-GENERATED",
                "verification_code": "VERIFY-GENERATED",
                "student": str(self.student_user.student_profile.id),
                "application": str(self.application.id),
                "certificate_type": Certificate.CertificateType.COURSE,
                "issued_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        certificate = Certificate.objects.get(certificate_number="CERT-GENERATED")
        self.assertTrue(certificate.certificate_file)
        self.assertTrue(certificate.certificate_file.storage.exists(certificate.certificate_file.name))
        with certificate.certificate_file.open("rb") as generated_file:
            self.assertTrue(generated_file.read(5).startswith(b"%PDF"))
        self.assertTrue(response.data["download_url"].endswith(f"/api/certificates/{certificate.id}/download/"))

        context = build_certificate_context(certificate)
        self.assertEqual(context.recipient_name, self.student_user.student_profile.student_code)
        self.assertEqual(context.subject, self.course.name)
        self.assertEqual(context.score_text, "Final Score: 91.25%")
        self.assertNotIn("Mr.", context.recipient_name)

    def test_generated_certificate_download_is_available_to_recipient(self):
        response = self.client.post(
            "/api/certificates/",
            {
                "certificate_number": "CERT-DOWNLOAD",
                "verification_code": "VERIFY-DOWNLOAD",
                "student": str(self.student_user.student_profile.id),
                "application": str(self.application.id),
                "certificate_type": Certificate.CertificateType.COURSE,
                "issued_at": timezone.now().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        certificate = Certificate.objects.get(certificate_number="CERT-DOWNLOAD")

        self.client.force_authenticate(self.student_user)
        download = self.client.get(f"/api/certificates/{certificate.id}/download/")

        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/pdf")
        download.close()

    def test_public_verification_accepts_number_and_reflects_revocation_immediately(self):
        certificate = Certificate.objects.create(
            certificate_number="CERT-PUBLIC",
            verification_code="VERIFY-PUBLIC",
            student=self.student_user.student_profile,
            certificate_type=Certificate.CertificateType.PARTICIPATION,
            issued_at=timezone.now(),
            issued_by=self.admin,
        )
        self.client.force_authenticate(user=None)

        valid = self.client.get("/api/certificates/verify/?code=CERT-PUBLIC")
        self.assertEqual(valid.status_code, 200, valid.data)
        self.assertTrue(valid.data["verified"])

        certificate.status = Certificate.Status.REVOKED
        certificate.save(update_fields=["status", "updated_at"])
        revoked = self.client.get("/api/certificates/verify/?code=CERT-PUBLIC")
        self.assertEqual(revoked.status_code, 404, revoked.data)
        self.assertFalse(revoked.data["verified"])

    def test_public_verification_profile_uses_authoritative_journey_and_privacy_flag(self):
        self.student_user.first_name = "Journey"
        self.student_user.last_name = "Student"
        self.student_user.save(update_fields=["first_name", "last_name", "updated_at"])
        profile = self.student_user.student_profile
        profile.linkedin_url = "https://www.linkedin.com/in/journey-student"
        profile.github_url = "https://github.com/journey-student"
        profile.is_public = False
        profile.save(update_fields=["linkedin_url", "github_url", "is_public", "updated_at"])
        certificate = Certificate.objects.create(
            certificate_number="CERT-JOURNEY",
            verification_code="VERIFY-JOURNEY",
            student=profile,
            application=self.application,
            certificate_type=Certificate.CertificateType.COURSE,
            issued_at=timezone.now(),
            issued_by=self.admin,
        )
        self.client.force_authenticate(user=None)

        private_response = self.client.get(
            "/api/certificates/verification-profile/?code=VERIFY-JOURNEY"
        )
        self.assertEqual(private_response.status_code, 200, private_response.data)
        self.assertEqual(private_response.data["recipient"]["name"], "Journey Student")
        self.assertEqual(private_response.data["journey"]["course"], self.course.name)
        self.assertEqual(private_response.data["recipient"]["links"], [])
        self.assertIsNone(private_response.data["recipient"]["resume_url"])

        profile.is_public = True
        profile.save(update_fields=["is_public", "updated_at"])
        public_response = self.client.get(
            "/api/certificates/verification-profile/?code=CERT-JOURNEY"
        )
        self.assertEqual(public_response.status_code, 200, public_response.data)
        labels = {link["label"] for link in public_response.data["recipient"]["links"]}
        self.assertEqual(labels, {"LinkedIn", "GitHub"})

        certificate.status = Certificate.Status.REVOKED
        certificate.save(update_fields=["status", "updated_at"])
        revoked = self.client.get(
            "/api/certificates/verification-profile/?code=VERIFY-JOURNEY"
        )
        self.assertEqual(revoked.status_code, 404, revoked.data)
