from django.test import TransactionTestCase
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory
from PIL import Image
import io
import tempfile

from accounts.models import User
from students.models import StudentProfile


class MissingProfileMediaTests(TransactionTestCase):
    def test_missing_existing_photo_does_not_block_unrelated_profile_save(self):
        user = User.objects.create_user(
            email="missing.photo@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        profile = user.student_profile
        missing_name = "students/photos/file-that-does-not-exist.jpg"
        StudentProfile.objects.filter(pk=profile.pk).update(profile_photo=missing_name)
        profile.refresh_from_db()

        self.assertFalse(profile.profile_photo.storage.exists(missing_name))

        profile.college = "Safe Profile Update College"
        profile.save()

        profile.refresh_from_db()
        self.assertEqual(profile.college, "Safe Profile Update College")
        self.assertEqual(profile.profile_photo.name, missing_name)

    def test_local_photo_url_contains_cache_version(self):
        from students.serializers import StudentProfileSerializer

        user = User.objects.create_user(
            email="photo.cache@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        profile = user.student_profile
        buffer = io.BytesIO()
        Image.new("RGB", (20, 20), "green").save(buffer, format="JPEG")
        profile.profile_photo = SimpleUploadedFile(
            "photo.jpg", buffer.getvalue(), content_type="image/jpeg"
        )
        profile.save()

        photo_url = StudentProfileSerializer(profile).data["profile_photo"]

        self.assertIn(f"{profile.student_code}_photo.jpg", photo_url)
        self.assertIn("?v=", photo_url)

    @override_settings(ALLOWED_HOSTS=["api.sureproed.com"])
    def test_local_photo_url_uses_api_request_origin(self):
        from students.serializers import StudentProfileSerializer

        user = User.objects.create_user(
            email="photo.origin@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        profile = user.student_profile
        buffer = io.BytesIO()
        Image.new("RGB", (20, 20), "purple").save(buffer, format="JPEG")
        profile.profile_photo = SimpleUploadedFile(
            "photo.jpg", buffer.getvalue(), content_type="image/jpeg"
        )
        profile.save()
        request = APIRequestFactory().get(
            "/api/students/me/",
            secure=True,
            HTTP_HOST="api.sureproed.com",
        )
        request.user = user

        photo_url = StudentProfileSerializer(
            profile,
            context={"request": request},
        ).data["profile_photo"]

        self.assertTrue(photo_url.startswith("https://api.sureproed.com/media/"))
        self.assertIn("?v=", photo_url)

    def test_profile_photo_is_served_when_reverse_proxy_does_not_serve_media(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            user = User.objects.create_user(
                email="photo.delivery@example.com",
                password="StrongPassword123!",
                role=User.Role.STUDENT,
            )
            profile = user.student_profile
            buffer = io.BytesIO()
            Image.new("RGB", (20, 20), "blue").save(buffer, format="JPEG")
            profile.profile_photo = SimpleUploadedFile(
                "photo.jpg", buffer.getvalue(), content_type="image/jpeg"
            )
            profile.save()

            response = self.client.get(profile.profile_photo.url)

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "image/jpeg")
            self.assertEqual(response["X-Content-Type-Options"], "nosniff")
            response.close()

    def test_student_resume_is_served_when_reverse_proxy_does_not_serve_media(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            user = User.objects.create_user(
                email="resume.delivery@example.com",
                password="StrongPassword123!",
                role=User.Role.STUDENT,
            )
            profile = user.student_profile
            pdf_content = b"%PDF-1.4 header and mock resume content for testing"
            profile.resume = SimpleUploadedFile(
                "sample_resume.pdf", pdf_content, content_type="application/pdf"
            )
            profile.save()

            self.assertEqual(self.client.get(profile.resume.url).status_code, 404)
            self.client.force_login(user)
            response = self.client.get(profile.resume.url)

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "application/pdf")
            self.assertEqual(response["X-Content-Type-Options"], "nosniff")
            self.assertIn("no-store", response["Cache-Control"])
            self.assertIn("no-cache", response["Cache-Control"])
            self.assertIn("inline", response["Content-Disposition"])
            self.assertEqual(b"".join(response.streaming_content), pdf_content)
            response.close()

    def test_public_media_file_serves_arbitrary_media_and_blocks_directory_traversal(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            import os
            cert_dir = os.path.join(media_root, "certificates")
            os.makedirs(cert_dir, exist_ok=True)
            cert_file = os.path.join(cert_dir, "CERT-12345.pdf")
            with open(cert_file, "wb") as f:
                f.write(b"%PDF-1.4 certificate data")

            # Valid media request
            response = self.client.get("/media/certificates/CERT-12345.pdf")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "application/pdf")
            response.close()

            # Non-existent file
            response_404 = self.client.get("/media/certificates/nonexistent.pdf")
            self.assertEqual(response_404.status_code, 404)

            # Directory traversal attempt
            response_traversal = self.client.get("/media/../etc/passwd")
            self.assertEqual(response_traversal.status_code, 404)

    def test_private_offer_letter_cannot_be_read_via_public_media_url(self):
        import os
        with tempfile.TemporaryDirectory() as media_root, tempfile.TemporaryDirectory() as priv_root:
            with override_settings(MEDIA_ROOT=media_root, PRIVATE_MEDIA_ROOT=priv_root):
                offer_dir = os.path.join(priv_root, "offer_letters", "2026", "VLSI-DESIGN", "G2-26")
                os.makedirs(offer_dir, exist_ok=True)
                pdf_path = os.path.join(offer_dir, "APP-2026-G226-529A07_offer_letter.pdf")
                with open(pdf_path, "wb") as f:
                    f.write(b"%PDF-1.4 mock offer letter")

                response = self.client.get("/media/offer_letters/2026/VLSI-DESIGN/G2-26/APP-2026-G226-529A07_offer_letter.pdf")
                self.assertEqual(response.status_code, 404)
                response.close()

    def test_resume_upload_with_openaction_and_matching_email_passes(self):
        from common.validators import validate_resume_file
        user = User.objects.create_user(
            email="pooja.sharma@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            first_name="Pooja",
            last_name="Sharma",
        )
        profile = user.student_profile

        # PDF containing /OpenAction (standard for Word/Canva exports) and candidate's email
        from reportlab.pdfgen import canvas
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer)
        p.drawString(50, 750, "Pooja S. - Resume")
        p.drawString(50, 730, "Email: pooja.sharma@example.com | Phone: 9876543210")
        p.drawString(50, 700, "Education")
        p.drawString(50, 680, "Bachelor of Technology in Electronics, 2026")
        p.drawString(50, 650, "Technical Skills")
        p.drawString(50, 630, "VLSI Design, Verilog, FPGA, C++, Python")
        p.drawString(50, 600, "Projects")
        p.drawString(50, 580, "Designed 8-bit ALU using Verilog HDL")
        p.save()

        # Inject an /OpenAction [1 0 R /Fit] into raw PDF bytes like Microsoft Word / Canva does
        raw_pdf = buffer.getvalue().replace(b"/Type /Catalog", b"/Type /Catalog /OpenAction [1 0 R /Fit]")
        resume_upload = SimpleUploadedFile("pooja_resume.pdf", raw_pdf, content_type="application/pdf")

        # Must validate cleanly without error
        self.assertIsNone(validate_resume_file(resume_upload, student_profile=profile))
