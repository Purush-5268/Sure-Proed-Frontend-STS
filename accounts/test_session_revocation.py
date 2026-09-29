from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import User, PasswordResetOTP


class SessionRevocationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.email = "multisession.student@gmail.com"
        self.old_password = "SecurePassword@123"
        self.new_password = "UpdatedPassword@987"
        self.user = User.objects.create_user(
            email=self.email,
            password=self.old_password,
            first_name="Multi",
            last_name="Session",
            role=User.Role.STUDENT,
            is_email_verified=True,
            is_active=True,
        )

    def test_multi_session_revocation_on_password_change(self):
        """
        Validation: If a user is logged into the app on Phone A and Phone B,
        and they update their password on Phone A, Phone B must immediately
        kick the user out to the login screen with HTTP 401 password_changed.
        """
        # 1. Simulate Phone A and Phone B both logging in
        res_a = self.client.post("/api/auth/token/", {"email": self.email, "password": self.old_password})
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        phone_a_access = res_a.data["access"]
        phone_a_refresh = res_a.data["refresh"]

        res_b = self.client.post("/api/auth/token/", {"email": self.email, "password": self.old_password})
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        phone_b_access = res_b.data["access"]
        phone_b_refresh = res_b.data["refresh"]

        # Both phones have active, valid sessions
        client_b = APIClient()
        client_b.credentials(HTTP_AUTHORIZATION=f"Bearer {phone_b_access}")
        me_b = client_b.get("/api/users/me/")
        self.assertEqual(me_b.status_code, status.HTTP_200_OK)

        # 2. Phone A changes their password
        client_a = APIClient()
        client_a.credentials(HTTP_AUTHORIZATION=f"Bearer {phone_a_access}")
        change_res = client_a.post("/api/users/change-password/", {
            "old_password": self.old_password,
            "new_password": self.new_password,
            "confirm_password": self.new_password,
        })
        self.assertEqual(change_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", change_res.data)
        self.assertIn("refresh", change_res.data)

        # 3. Phone B attempts to use its existing access token -> Must fail with 401 password_changed
        me_b_after = client_b.get("/api/users/me/")
        self.assertEqual(me_b_after.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(me_b_after.data.get("code"), "password_changed")

        # 4. Phone B attempts to refresh with its existing refresh token -> Must fail with 401 password_changed
        refresh_b = self.client.post("/api/auth/token/refresh/", {"refresh": phone_b_refresh})
        self.assertEqual(refresh_b.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(refresh_b.data.get("code"), "password_changed")

        # 5. Re-authentication: Phone B logs in using the new password
        login_new = self.client.post("/api/auth/token/", {"email": self.email, "password": self.new_password})
        self.assertEqual(login_new.status_code, status.HTTP_200_OK)
        new_access = login_new.data["access"]

        # 6. Verify Phone B now has clean access with new credentials
        client_b.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
        me_b_new = client_b.get("/api/users/me/")
        self.assertEqual(me_b_new.status_code, status.HTTP_200_OK)
        self.assertEqual(me_b_new.data["email"], self.email)

    def test_multi_session_revocation_on_forgot_password_confirm(self):
        """
        Validation: When a user resets their password via forgot-password OTP,
        all existing active sessions across all devices are immediately invalidated.
        """
        # Phone B logs in
        res_b = self.client.post("/api/auth/token/", {"email": self.email, "password": self.old_password})
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        phone_b_access = res_b.data["access"]
        phone_b_refresh = res_b.data["refresh"]

        client_b = APIClient()
        client_b.credentials(HTTP_AUTHORIZATION=f"Bearer {phone_b_access}")
        self.assertEqual(client_b.get("/api/users/me/").status_code, status.HTTP_200_OK)

        # Phone A resets password via OTP
        from accounts.otp_service import store_password_reset_otp
        otp, _, _ = store_password_reset_otp(self.email, self.email)

        confirm_res = self.client.post("/api/users/forgot_password_confirm/", {
            "email": self.email,
            "otp": otp,
            "new_password": "ForgotResetPass@999",
            "role": "STUDENT",
        })
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

        # Phone B is immediately rejected with 401 password_changed
        me_b_after = client_b.get("/api/users/me/")
        self.assertEqual(me_b_after.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(me_b_after.data.get("code"), "password_changed")

        # Phone B cannot refresh
        refresh_b = self.client.post("/api/auth/token/refresh/", {"refresh": phone_b_refresh})
        self.assertEqual(refresh_b.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(refresh_b.data.get("code"), "password_changed")

        # Re-login with the reset password works
        relogin = self.client.post("/api/auth/token/", {"email": self.email, "password": "ForgotResetPass@999"})
        self.assertEqual(relogin.status_code, status.HTTP_200_OK)

    def test_signup_otp_endpoints_ignore_stale_bearer_tokens(self):
        """
        Verify SendEmailVerificationOTPView and VerifyEmailOTPView are not blocked
        by DRF JWT authentication when called with invalid/stale Bearer headers.
        """
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer totally_invalid_expired_token")

        # Send OTP call with stale header
        res = client.post("/api/auth/send-verification-otp/", {
            "email": "new.student@gmail.com",
            "password": "ValidPassword@123",
            "first_name": "New",
            "last_name": "Student",
            "phone_number": "9876543210",
            "gender": "MALE",
            "date_of_birth": "2000-01-01",
            "role": "STUDENT",
        })
        # Should not be 401 Unauthorized
        self.assertNotEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
