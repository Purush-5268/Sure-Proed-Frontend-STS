from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User


class StudentUpdateLoggingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="update.logging@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        self.profile = self.user.student_profile
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_unexpected_update_error_is_logged_and_transaction_rolls_back(self):
        original_first_name = self.user.first_name

        with patch("students.views.StudentProfile.save", side_effect=RuntimeError("test crash")):
            with patch("students.views.logger.exception") as log_exception:
                with self.assertRaises(RuntimeError):
                    self.client.patch(
                        f"/api/students/{self.profile.id}/",
                        {"first_name": "Should Roll Back", "college": "Should Roll Back"},
                        format="json",
                    )

        self.user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(self.user.first_name, original_first_name)
        self.assertIsNone(self.profile.college)
        log_exception.assert_called_once()
