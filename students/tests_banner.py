import base64
import io
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from students.models import StudentProfile
from volunteers.models import MentorProfile, VolunteerProfile


class StudentBannerImageTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="student-banner-tests-")
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user(
            email="banner.student@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        self.profile = self.user.student_profile
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_image_file(self, color="blue", size=(400, 200), name="test_banner.jpg", fmt="JPEG"):
        img = Image.new("RGB", size, color=color)
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        return SimpleUploadedFile(name, buf.getvalue(), content_type=f"image/{fmt.lower()}")

    def _create_base64_image(self, color="green", size=(400, 200), fmt="PNG"):
        img = Image.new("RGB", size, color=color)
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

    def test_direct_model_banner_upload_and_override(self):
        # 1. Upload initial banner
        f1 = self._create_image_file(color="red")
        self.profile.banner_image = f1
        self.profile.save()

        expected_rel = f"students/banners/{self.profile.student_code}_banner.jpg"
        self.assertEqual(self.profile.banner_image.name, expected_rel)
        full_path = Path(self.media_root) / expected_rel
        self.assertTrue(full_path.exists())

        with Image.open(full_path) as im:
            r, g, b = im.getpixel((10, 10))
            self.assertTrue(r > 200 and g < 20 and b < 20)

        # 2. Upload replacement banner (blue)
        f2 = self._create_image_file(color="blue")
        self.profile.banner_image = f2
        self.profile.save()

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.banner_image.name, expected_rel)
        with Image.open(full_path) as im:
            r, g, b = im.getpixel((10, 10))
            self.assertTrue(b > 200 and r < 20 and g < 20)

        # Only one file exists in students/banners/
        banner_files = list((Path(self.media_root) / "students" / "banners").glob("*"))
        self.assertEqual(len(banner_files), 1)

    def test_api_patch_student_me_multipart_banner(self):
        f = self._create_image_file(color="yellow")
        response = self.client.patch("/api/students/me/", {"banner_image": f}, format="multipart")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("banner_image", data)
        self.assertTrue(urlsplit(data["banner_image"]).path.startswith("/media/students/banners/"))
        self.assertIn("?v=", data["banner_image"])

        self.profile.refresh_from_db()
        self.assertTrue(self.profile.banner_image)

    def test_api_patch_student_base64_banner(self):
        b64 = self._create_base64_image(color="purple")
        response = self.client.patch(
            f"/api/students/{self.profile.id}/",
            {"banner_image": b64},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.profile.refresh_from_db()
        self.assertTrue(self.profile.banner_image)
        full_path = Path(self.media_root) / self.profile.banner_image.name
        with Image.open(full_path) as im:
            r, g, b = im.getpixel((10, 10))
            self.assertTrue(r > 100 and b > 100 and g < 20)

    def test_api_patch_student_cover_alias(self):
        f = self._create_image_file(color="cyan")
        response = self.client.patch(
            f"/api/students/{self.profile.id}/",
            {"cover_image": f},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)

        self.profile.refresh_from_db()
        self.assertTrue(self.profile.banner_image)

    def test_api_patch_user_me_banner(self):
        f = self._create_image_file(color="magenta")
        response = self.client.patch("/api/users/me/", {"banner_image": f}, format="multipart")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("banner_image", data)
        self.assertTrue(urlsplit(data["banner_image"]).path.startswith("/media/students/banners/"))
        self.assertIn("?v=", data["banner_image"])

    def test_serve_student_banner_endpoint(self):
        f = self._create_image_file(color="orange")
        self.profile.banner_image = f
        self.profile.save()

        filename = f"{self.profile.student_code}_banner.jpg"
        response = self.client.get(f"/media/students/banners/{filename}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Cache-Control"), "no-cache, must-revalidate")
        self.assertEqual(response.headers.get("Content-Type"), "image/jpeg")

    def test_mentor_and_volunteer_banner_via_user_me(self):
        # 1. Mentor
        mentor_user = User.objects.create_user(
            email="banner.mentor@example.com",
            password="StrongPassword123!",
            role=User.Role.MENTOR,
        )
        mentor_client = APIClient()
        mentor_client.force_authenticate(user=mentor_user)

        f_mentor = self._create_image_file(color="teal")
        res = mentor_client.patch("/api/users/me/", {"banner_image": f_mentor}, format="multipart")
        self.assertEqual(res.status_code, 200)
        self.assertIn("/media/mentors/banners/", res.json()["banner_image"])

        mentor_profile = MentorProfile.objects.get(user=mentor_user)
        self.assertTrue(mentor_profile.banner_image)

        # 2. Volunteer
        volunteer_user = User.objects.create_user(
            email="banner.volunteer@example.com",
            password="StrongPassword123!",
            role=User.Role.VOLUNTEER,
        )
        vol_client = APIClient()
        vol_client.force_authenticate(user=volunteer_user)

        f_vol = self._create_image_file(color="pink")
        res = vol_client.patch("/api/users/me/", {"banner_image": f_vol}, format="multipart")
        self.assertEqual(res.status_code, 200)
        self.assertIn("/media/volunteers/banners/", res.json()["banner_image"])

        volunteer_profile = VolunteerProfile.objects.get(user=volunteer_user)
        self.assertTrue(volunteer_profile.banner_image)

    def test_banner_only_patch_preserves_profile_fields(self):
        from datetime import date
        self.profile.date_of_birth = date(2003, 4, 1)
        self.profile.graduation_year = 2025
        self.profile.linkedin_url = "https://www.linkedin.com/in/banner-student"
        self.profile.portfolio_url = "https://example.com/portfolio"
        self.profile.save()
        response = self.client.patch("/api/students/me/", {"banner_image": self._create_image_file()}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.date_of_birth, date(2003, 4, 1))
        self.assertEqual(self.profile.graduation_year, 2025)
        self.assertEqual(self.profile.linkedin_url, "https://www.linkedin.com/in/banner-student")
        self.assertEqual(self.profile.portfolio_url, "https://example.com/portfolio")

    def test_invalid_banner_does_not_change_name_or_previous_banner(self):
        self.profile.banner_image = self._create_image_file()
        self.profile.save()
        old_bytes = Path(self.media_root, self.profile.banner_image.name).read_bytes()
        original_name = self.user.first_name
        response = self.client.patch("/api/users/me/", {
            "first_name": "Changed", "banner_image": SimpleUploadedFile("bad.jpg", b"\xff\xd8\xffinvalid", content_type="image/jpeg")
        }, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, original_name)
        self.assertEqual(Path(self.media_root, self.profile.banner_image.name).read_bytes(), old_bytes)

    def test_student_cannot_change_identity_or_privilege_through_me(self):
        for field, value in (("email", "other@example.com"), ("mapped_email", "staff@example.com"), ("role", "ADMIN"), ("has_all_cohorts_access", True)):
            with self.subTest(field=field):
                response = self.client.patch("/api/users/me/", {field: value}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
