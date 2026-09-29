from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from common.models import AppRelease


class AppVersionCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("app_version_check")

    def test_version_check_no_releases(self):
        """When no active releases exist, return 404."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", response.data)

    def test_version_check_returns_latest_active_release(self):
        """Should return the highest versionCode that is active."""
        AppRelease.objects.create(
            version_code=1,
            version_name="1.0.0",
            download_url="https://example.com/app_v1.apk",
            release_notes="Initial release",
            is_mandatory=False,
            file_size_bytes=15000000,
            is_active=True,
        )
        latest_release = AppRelease.objects.create(
            version_code=2,
            version_name="1.1.0",
            download_url="https://sureproed.com/media/apk/suretrust_v2.apk",
            release_notes="• Simplified offline status banner\n• Standardized TopBar and Drawer Logout",
            is_mandatory=False,
            file_size_bytes=24680314,
            is_active=True,
        )
        # Create an inactive higher version (draft)
        AppRelease.objects.create(
            version_code=3,
            version_name="1.2.0-beta",
            download_url="https://example.com/app_v3_beta.apk",
            release_notes="Beta testing",
            is_mandatory=False,
            file_size_bytes=25000000,
            is_active=False,
        )

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["version_code"], 2)
        self.assertEqual(response.data["version_name"], "1.1.0")
        self.assertEqual(response.data["download_url"], "https://sureproed.com/media/apk/suretrust_v2.apk")
        self.assertEqual(response.data["release_notes"], "• Simplified offline status banner\n• Standardized TopBar and Drawer Logout")
        self.assertEqual(response.data["is_mandatory"], False)
        self.assertEqual(response.data["file_size_bytes"], 24680314)

    def test_version_check_mandatory_update_flag(self):
        """Mandatory updates should return is_mandatory=True."""
        AppRelease.objects.create(
            version_code=5,
            version_name="2.0.0",
            download_url="https://sureproed.com/media/apk/suretrust_v5.apk",
            release_notes="Critical security update",
            is_mandatory=True,
            file_size_bytes=20000000,
            is_active=True,
        )

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["version_code"], 5)
        self.assertTrue(response.data["is_mandatory"])
