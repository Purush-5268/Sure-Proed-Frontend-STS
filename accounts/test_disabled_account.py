from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from accounts.otp_service import store_password_reset_otp


class DisabledAccountTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="disabled-student@example.com", role="STUDENT",
            password="Original@Pass123!", is_email_verified=True, is_active=False,
        )
        self.client = APIClient()

    def test_login_never_reactivates_disabled_account_even_with_correct_password(self):
        for password in ["Wrong@Pass123!", "Original@Pass123!"]:
            response = self.client.post("/api/auth/token/", {"email": self.user.email, "password": password}, format="json")
            self.assertEqual(response.status_code, 401, response.data)
            self.user.refresh_from_db()
            self.assertFalse(self.user.is_active)

    @patch("common.services.email_service.send_password_reset_otp")
    def test_disabled_account_cannot_request_reset(self, delivery):
        response = self.client.post("/api/users/forgot_password_request/", {"email": self.user.email}, format="json")
        self.assertEqual(response.status_code, 400)
        delivery.assert_not_called()

    def test_code_issued_before_admin_disable_cannot_reset_or_reactivate(self):
        otp, _, error = store_password_reset_otp(self.user.email, self.user.email)
        self.assertIsNone(error)
        response = self.client.post("/api/users/forgot_password_confirm/", {
            "email": self.user.email, "otp": otp, "new_password": "New@Pass987!",
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertTrue(self.user.check_password("Original@Pass123!"))
