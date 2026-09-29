import os
import shutil
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from PIL import Image

from accounts.models import User
from students.models import StudentProfile


class AutomaticStudentPhotoCleanupTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="automatic-student-photo-cleanup-")
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user(
            email="automatic.photo.cleanup@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        self.profile = self.user.student_profile
        self.photos_root = Path(self.media_root) / "students" / "photos"
        self.photos_root.mkdir(parents=True)

    @staticmethod
    def _write_jpeg(path, color):
        Image.new("RGB", (20, 20), color).save(path, format="JPEG")

    def test_save_normalizes_current_photo_and_removes_same_student_duplicates(self):
        active = self.photos_root / f"{self.profile.student_code}_photo_active.jpg"
        duplicate = self.photos_root / f"{self.profile.student_code}_photo_duplicate.jpg"
        self._write_jpeg(active, "blue")
        self._write_jpeg(duplicate, "red")
        StudentProfile.objects.filter(pk=self.profile.pk).update(
            profile_photo=f"students/photos/{active.name}"
        )
        self.profile.refresh_from_db()

        self.profile.college = "Unrelated profile update"
        self.profile.save()

        self.profile.refresh_from_db()
        deterministic = self.photos_root / f"{self.profile.student_code}_photo.jpg"
        self.assertEqual(
            self.profile.profile_photo.name,
            f"students/photos/{self.profile.student_code}_photo.jpg",
        )
        self.assertTrue(deterministic.exists())
        self.assertEqual(
            list(self.photos_root.glob(f"{self.profile.student_code}_photo*")),
            [deterministic],
        )

    def test_save_recovers_newest_file_when_database_photo_is_missing(self):
        older = self.photos_root / f"{self.profile.student_code}_photo_older.jpg"
        newest = self.photos_root / f"{self.profile.student_code}_photo_newest.jpg"
        self._write_jpeg(older, "red")
        self._write_jpeg(newest, "blue")
        os.utime(older, (1000, 1000))
        os.utime(newest, (2000, 2000))
        StudentProfile.objects.filter(pk=self.profile.pk).update(
            profile_photo="students/photos/missing-photo.jpg"
        )
        self.profile.refresh_from_db()

        self.profile.save()

        self.profile.refresh_from_db()
        deterministic = self.photos_root / f"{self.profile.student_code}_photo.jpg"
        self.assertEqual(
            self.profile.profile_photo.name,
            f"students/photos/{self.profile.student_code}_photo.jpg",
        )
        self.assertEqual(
            list(self.photos_root.glob(f"{self.profile.student_code}_photo*")),
            [deterministic],
        )
        with Image.open(deterministic) as selected:
            pixel = selected.getpixel((0, 0))
        self.assertGreater(pixel[2], pixel[0])

    def test_cleanup_failure_never_breaks_profile_save(self):
        StudentProfile.objects.filter(pk=self.profile.pk).update(
            profile_photo="students/photos/missing-photo.jpg"
        )
        self.profile.refresh_from_db()

        self.profile.college = "Save must still succeed"
        self.profile.save()

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.college, "Save must still succeed")
