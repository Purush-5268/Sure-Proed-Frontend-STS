import io
import os
import shutil
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import User
from students.models import StudentProfile


class QuarantineOrphanStudentPhotosTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="student-photo-cleanup-")
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user(
            email="photo.cleanup@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        self.profile = self.user.student_profile
        self.photos_root = Path(self.media_root) / "students" / "photos"
        self.photos_root.mkdir(parents=True)

        self.active_name = f"{self.profile.student_code}_photo_active.jpg"
        self.orphan_name = f"{self.profile.student_code}_photo_orphan.jpg"
        (self.photos_root / self.active_name).write_bytes(b"active")
        (self.photos_root / self.orphan_name).write_bytes(b"orphan")
        StudentProfile.objects.filter(pk=self.profile.pk).update(
            profile_photo=f"students/photos/{self.active_name}"
        )

    def test_preview_keeps_all_files(self):
        output = io.StringIO()

        call_command(
            "quarantine_orphan_student_photos",
            student_code=self.profile.student_code,
            stdout=output,
        )

        self.assertTrue((self.photos_root / self.active_name).exists())
        self.assertTrue((self.photos_root / self.orphan_name).exists())
        self.assertIn("Preview only", output.getvalue())

    def test_quarantine_moves_only_unreferenced_files(self):
        call_command(
            "quarantine_orphan_student_photos",
            student_code=self.profile.student_code,
            quarantine=True,
            stdout=io.StringIO(),
        )

        self.assertTrue((self.photos_root / self.active_name).exists())
        self.assertFalse((self.photos_root / self.orphan_name).exists())
        quarantined = list(
            (Path(self.media_root) / "quarantine" / "student_photos" / self.profile.student_code).rglob(
                self.orphan_name
            )
        )
        self.assertEqual(len(quarantined), 1)

    def test_keep_latest_recovers_newest_photo_and_normalizes_filename(self):
        from PIL import Image

        StudentProfile.objects.filter(pk=self.profile.pk).update(
            profile_photo="students/photos/missing-database-photo.jpg"
        )
        old_path = self.photos_root / f"{self.profile.student_code}_photo_old.jpg"
        newest_path = self.photos_root / f"{self.profile.student_code}_photo_newest.jpg"
        Image.new("RGB", (20, 20), "red").save(old_path, format="JPEG")
        Image.new("RGB", (20, 20), "blue").save(newest_path, format="JPEG")
        os.utime(old_path, (1000, 1000))
        os.utime(newest_path, (2000, 2000))

        call_command(
            "quarantine_orphan_student_photos",
            student_code=self.profile.student_code,
            keep_latest=True,
            quarantine=True,
            stdout=io.StringIO(),
        )

        self.profile.refresh_from_db()
        deterministic = self.photos_root / f"{self.profile.student_code}_photo.jpg"
        self.assertEqual(
            self.profile.profile_photo.name,
            f"students/photos/{self.profile.student_code}_photo.jpg",
        )
        self.assertTrue(deterministic.exists())
        with Image.open(deterministic) as selected:
            self.assertEqual(selected.getpixel((0, 0))[2] > selected.getpixel((0, 0))[0], True)
        remaining = list(self.photos_root.glob(f"{self.profile.student_code}_photo*"))
        self.assertEqual(remaining, [deterministic])
