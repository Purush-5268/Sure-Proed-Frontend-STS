from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.contrib.sessions.middleware import SessionMiddleware
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase
from django.utils import timezone
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from accounts.admin import CustomUserAdmin, OTPAdminPasswordChangeForm
from accounts.models import PasswordResetOTP, User


class AdminPasswordOTPTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            email="otp-admin@example.com", password="admin-pass-123"
        )
        self.target = User.objects.create_user(
            email="otp-student@example.com", password="old-pass-123", role=User.Role.STUDENT, is_email_verified=True
        )

    def test_admin_password_form_requires_and_consumes_latest_otp(self):
        otp_record = PasswordResetOTP.objects.create(email=self.target.email)
        form = OTPAdminPasswordChangeForm(
            self.target,
            data={
                "password1": "New-Strong-P@ss-123!",
                "password2": "New-Strong-P@ss-123!",
                "otp": otp_record.otp,
            },
        )

        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        otp_record.refresh_from_db()
        self.target.refresh_from_db()
        self.assertTrue(otp_record.is_used)
        self.assertTrue(self.target.check_password("New-Strong-P@ss-123!"))

    def test_mobile_login_forbidden_for_admin(self):
        response = self.client.post(
            "/api/auth/token/",
            {"email": "otp-admin@example.com", "password": "admin-pass-123"},
            format="json",
            HTTP_X_CLIENT_TYPE="mobile",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Admin accounts must log in via the Web Admin Portal", response.data["detail"])

    def test_password_reset_otp_expires_after_exactly_five_minutes(self):
        issued_at = timezone.now()
        with patch("accounts.models.timezone.now", return_value=issued_at):
            otp_record = PasswordResetOTP.objects.create(email=self.target.email)

        self.assertEqual(otp_record.expires_at, issued_at + timedelta(minutes=5))
        with patch("accounts.models.timezone.now", return_value=issued_at + timedelta(minutes=4, seconds=59)):
            self.assertTrue(otp_record.is_valid())
        with patch("accounts.models.timezone.now", return_value=issued_at + timedelta(minutes=5)):
            self.assertFalse(otp_record.is_valid())

    @patch("common.tasks.send_async_password_reset_otp.delay")
    def test_opening_admin_password_form_issues_otp_without_500(self, send_otp):
        request = RequestFactory().get(f"/secure-admin/accounts/user/{self.target.pk}/password/")
        request.user = self.admin_user
        SessionMiddleware(lambda req: None).process_request(request)
        request.session.save()
        request._messages = FallbackStorage(request)

        response = CustomUserAdmin(User, AdminSite()).user_change_password(
            request, str(self.target.pk)
        )

        self.assertEqual(response.status_code, 200)
        send_otp.assert_called_once()
        self.assertEqual(send_otp.call_args[0][0], self.target.email)

    @patch("common.tasks.send_async_password_reset_otp.delay")
    def test_admin_password_page_renders_required_otp_input(self, send_otp):
        device = TOTPDevice.objects.create(user=self.admin_user, name="tests", confirmed=True)
        self.client.force_login(self.admin_user)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()

        response = self.client.get(
            f"/secure-admin/accounts/user/{self.target.pk}/password/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="otp"')
        self.assertContains(response, "Password reset OTP")
        self.assertContains(response, "fresh six-digit OTP")
        send_otp.assert_called_once()

    @patch("common.tasks.send_async_password_reset_otp.delay", side_effect=RuntimeError("broker down"))
    def test_forgot_password_still_issues_otp_when_mail_queue_is_down(self, send_otp):
        from accounts.otp_service import verify_password_reset_otp
        from django.core.cache import cache

        self.target.mapped_email = "otp-delivery@example.com"
        self.target.role = User.Role.MENTOR
        self.target.save()

        response = self.client.post(
            "/api/users/forgot_password_request/",
            {"email": self.target.email},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        cached = cache.get(f"otp:pwd_reset:{self.target.email}")
        self.assertIsNotNone(cached)
        self.assertIn("otp", cached)
        self.assertIsNone(cache.get("otp:pwd_reset:otp-delivery@example.com"))

    def test_forgot_password_ignores_unverified_accounts(self):
        unverified_user = User.objects.create_user(
            email="unverified_student@example.com",
            password="SecureP@ssw0rd123!",
            role=User.Role.STUDENT,
        )
        unverified_user.is_email_verified = False
        unverified_user.save(update_fields=["is_email_verified"])

        response = self.client.post(
            "/api/users/forgot_password_request/",
            {"email": unverified_user.email},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data.get("detail"),
            "Your account is not verified or is inactive. Please contact your admin.",
        )

    def test_forgot_password_rejects_nonexistent_account(self):
        response = self.client.post(
            "/api/users/forgot_password_request/",
            {"email": "nonexistent_user@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data.get("detail"),
            "No account found with this email address.",
        )

    def test_generate_password_setup_link_uses_frontend_url(self):
        from accounts.utils import generate_password_setup_link
        from django.conf import settings

        link = generate_password_setup_link(self.target)
        self.assertTrue(link.startswith(f"{settings.FRONTEND_URL}/setup-password?uidb64="))
        self.assertIn("&token=", link)

    @patch("common.tasks.send_async_password_reset_otp.delay")
    def test_forgot_password_allows_up_to_3_resets_per_day_and_blocks_fourth(self, send_otp):
        for i in range(3):
            response = self.client.post(
                "/api/users/forgot_password_request/",
                {"email": self.target.email},
                format="json",
            )
            self.assertEqual(response.status_code, 200)

        # 4th request within 24 hours should be rejected with 429 Too Many Requests
        response = self.client.post(
            "/api/users/forgot_password_request/",
            {"email": self.target.email},
            format="json",
        )
        self.assertEqual(response.status_code, 429)
        self.assertIn("maximum limit of 3 password resets per day", response.data["detail"])

    @patch("common.services.email_service.send_password_reset_otp", return_value=True)
    def test_forgot_password_confirm_resets_password_activates_user_and_clears_rate_limit(self, mock_send):
        from django.core.cache import cache

        # 1. Request OTP
        req_res = self.client.post(
            "/api/users/forgot_password_request/",
            {"email": self.target.email},
            format="json",
        )
        self.assertEqual(req_res.status_code, 200)

        # Retrieve stored OTP from cache
        cache_data = cache.get(f"otp:pwd_reset:{self.target.email}")
        self.assertIsNotNone(cache_data)
        otp = cache_data["otp"]

        # 2. Confirm reset with new password
        new_pass = "BrandNew@Strong123!"
        conf_res = self.client.post(
            "/api/users/forgot_password_confirm/",
            {
                "email": self.target.email,
                "otp": otp,
                "new_password": new_pass,
            },
            format="json",
        )
        self.assertEqual(conf_res.status_code, 200)
        self.assertEqual(conf_res.data["detail"], "Password has been successfully updated.")

        # Verify user password updated and account active
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password(new_pass))
        self.assertTrue(self.target.is_active)
        self.assertTrue(self.target.is_email_verified)

        # Verify rate limit and OTP keys are wiped
        self.assertIsNone(cache.get(f"otp:pwd_reset:{self.target.email}"))
        self.assertIsNone(cache.get(f"otp:pwd_reset_limit:{self.target.email}"))





class ReservedStaffDomainTests(TestCase):
    def test_staff_domains_cannot_be_registered_as_student(self):
        staff_emails = [
            "candidate@suretrust.local",
            "candidate@suretrust.org",
            "candidate@suretrust.dev",
            "candidate@suretrust.tester",
            "candidate@suretrust.advisory",
            "candidate@suretrust.admin",
            "candidate@sureproed.mentor",
            "candidate@suretrust.vol",
        ]
        for email in staff_emails:
            with self.subTest(email=email):
                with self.assertRaises(ValidationError):
                    User.objects.create_user(
                        email=email,
                        password="SecureP@ssw0rd123!",
                        role=User.Role.STUDENT,
                    )

    def test_staff_domain_prefix_blocked_for_student(self):
        blocked_student_emails = [
            "candidate@suretrust.custom",
            "candidate@sureproed.org",
            "candidate@suretrsut.admin",
        ]
        for email in blocked_student_emails:
            with self.subTest(email=email):
                with self.assertRaises(ValidationError):
                    User.objects.create_user(
                        email=email,
                        password="SecureP@ssw0rd123!",
                        role=User.Role.STUDENT,
                    )

    def test_staff_account_requires_mapped_email(self):
        with self.assertRaises(ValidationError):
            user = User(
                email="volunteer@suretrust.vol",
                password="SecureP@ssw0rd123!",
                role=User.Role.VOLUNTEER,
            )
            user.clean()

    def test_staff_domains_staff_role_is_marked_staff(self):
        mentor = User.objects.create_user(
            email="internal-mentor@suretrust.org",
            mapped_email="mentor.personal@example.com",
            password="SecureP@ssw0rd123!",
            role=User.Role.MENTOR,
        )
        self.assertTrue(mentor.is_staff)


class MentorProfessionalOAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.mentor = User.objects.create_user(
            email="oauth-mentor@suretrust.local",
            mapped_email="oauth-mentor@example.com",
            password="SecureP@ssw0rd123!",
            role=User.Role.MENTOR,
        )
        self.client.force_authenticate(self.mentor)

    @patch("accounts.views.GitHubService.exchange_code_for_token", side_effect=RuntimeError("test"))
    def test_github_connection_is_stored_on_mentor_profile_as_read_only(self, _exchange):
        response = self.client.post(
            "/api/auth/github/callback/",
            {"code": "test_dev_github_code"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        profile = self.mentor.mentor_profile
        profile.refresh_from_db()
        self.assertTrue(profile.is_github_connected)
        self.assertEqual(response.data["github_org_invite_status"], "READ_ONLY_MENTOR")
        self.assertIsNone(response.data["github_repo_url"])
        student_profile = getattr(self.mentor, "student_profile", None)
        if student_profile:
            student_profile.refresh_from_db()
            self.assertFalse(student_profile.is_github_connected)

    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token", side_effect=RuntimeError("test"))
    def test_linkedin_connection_is_exposed_on_mentor_profile(self, _exchange):
        response = self.client.post(
            "/api/auth/linkedin/callback/",
            {"code": "test_dev_code"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.mentor.refresh_from_db()
        self.assertTrue(self.mentor.is_social_auth_linked)
        self.assertEqual(self.mentor.social_provider, "linkedin")

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_mobile_linkedin_callback_returns_to_app_and_consumes_state(self, exchange, fetch):
        exchange.return_value = {"access_token": "provider-token"}
        fetch.return_value = {
            "sub": "mentor-linkedin-sub",
            "email": self.mentor.mapped_email,
            "name": "OAuth Mentor",
            "profile": "https://www.linkedin.com/in/oauth-mentor",
        }
        connect = self.client.get("/api/auth/linkedin/connect/?client=mobile")
        self.assertEqual(connect.status_code, 200, connect.data)
        auth_url = connect.data["authorization_url"]
        state = parse_qs(urlparse(auth_url).query)["state"][0]

        callback = self.client.get(
            "/api/auth/linkedin/callback/",
            {"code": "provider-code", "state": state},
        )

        self.assertEqual(callback.status_code, 302)
        self.assertTrue(callback["Location"].startswith("suretrust://linkedin-oauth?status=success"))
        replay = self.client.get(
            "/api/auth/linkedin/callback/",
            {"code": "provider-code", "state": state},
        )
        self.assertFalse(replay["Location"].startswith("suretrust://linkedin-oauth"))


class EmailVerificationOTPTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_admin_user_is_auto_verified(self):
        admin_user = User.objects.create_superuser(
            email="verify-admin@example.com",
            password="adminpassword123",
        )
        self.assertTrue(admin_user.is_email_verified)

    @patch("common.tasks.send_async_email_verification_otp.delay")
    def test_deferred_user_creation_until_otp_verified(self, mock_send_otp):
        test_email = "new-pending-student@example.com"
        self.assertFalse(User.objects.filter(email=test_email).exists())

        # 1. Send OTP & Pending Registration Data
        response = self.client.post(
            "/api/auth/send-verification-otp/",
            {
                "email": test_email,
                "password": "SecureP@ssw0rd123!",
                "first_name": "Pending",
                "last_name": "Student",
                "role": "STUDENT",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mock_send_otp.assert_called_once()
        sent_otp = mock_send_otp.call_args[0][1]

        # Verify NO User row in DB yet
        self.assertFalse(User.objects.filter(email=test_email).exists())

        # 2. Verify OTP code -> User created in DB
        verify_response = self.client.post(
            "/api/auth/verify-email-otp/",
            {"email": test_email, "otp": sent_otp},
            format="json",
        )
        self.assertEqual(verify_response.status_code, 200)
        self.assertTrue(verify_response.data.get("is_email_verified"))
        self.assertIn("access", verify_response.data)

        created_user = User.objects.get(email=test_email)
        self.assertTrue(created_user.is_email_verified)
        self.assertEqual(created_user.first_name, "Pending")
        self.assertTrue(hasattr(created_user, "student_profile"))

    @patch("common.tasks.send_async_email_verification_otp.delay")
    def test_staff_suretrust_local_dispatches_otp_to_mapped_email(self, mock_send_otp):
        staff_email = "mentor1@suretrust.local"
        mapped_email = "mentor1_personal@gmail.com"
        # Staff accounts are provisioned by an administrator before email verification.
        User.objects.create_user(email=staff_email, mapped_email=mapped_email,
                                 password="SecureP@ssw0rd123!", role=User.Role.MENTOR,
                                 is_email_verified=False)

        response = self.client.post(
            "/api/auth/send-verification-otp/",
            {
                "email": staff_email,
                "mapped_email": mapped_email,
                "password": "SecureP@ssw0rd123!",
                "first_name": "Staff",
                "last_name": "Mentor",
                "role": "MENTOR",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        sent_otp = mock_send_otp.call_args[0][1]
        mock_send_otp.assert_called_once_with(mapped_email, sent_otp)

        verify_response = self.client.post(
            "/api/auth/verify-email-otp/",
            {"email": staff_email, "otp": sent_otp},
            format="json",
        )
        self.assertEqual(verify_response.status_code, 200)
        created_staff = User.objects.get(email=staff_email)
        self.assertEqual(created_staff.mapped_email, mapped_email)
        self.assertTrue(created_staff.is_email_verified)


class RedisOTPServiceTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_email_verification_otp_stored_and_consumed_in_cache(self):
        from accounts.otp_service import store_email_verification_otp, verify_email_verification_otp
        from django.core.cache import cache

        email = "test-redis-user@example.com"
        reg_payload = {"email": email, "first_name": "Tester"}
        otp = store_email_verification_otp(email, email, reg_payload, ttl=60)

        # Check key in cache
        cached = cache.get(f"otp:email_verify:{email}")
        self.assertIsNotNone(cached)
        self.assertEqual(cached["otp"], otp)

        # Wrong OTP fails without consuming
        valid, _, err = verify_email_verification_otp(email, "000000")
        self.assertFalse(valid)
        self.assertIsNotNone(cache.get(f"otp:email_verify:{email}"))

        # Correct OTP succeeds and consumes key
        valid, data, err = verify_email_verification_otp(email, otp)
        self.assertTrue(valid)
        self.assertEqual(data["first_name"], "Tester")
        self.assertIsNone(cache.get(f"otp:email_verify:{email}"))

    def test_password_reset_otp_rate_limiting_in_cache(self):
        from accounts.otp_service import store_password_reset_otp, verify_password_reset_otp
        from django.core.cache import cache

        email = "reset-rate-limit@example.com"

        # Request 1, 2, 3 should succeed
        otp1, count1, err1 = store_password_reset_otp(email, email)
        self.assertIsNotNone(otp1)
        self.assertEqual(count1, 1)

        otp2, count2, err2 = store_password_reset_otp(email, email)
        self.assertIsNotNone(otp2)
        self.assertEqual(count2, 2)

        otp3, count3, err3 = store_password_reset_otp(email, email)
        self.assertIsNotNone(otp3)
        self.assertEqual(count3, 3)

        # Request 4 should be rejected by rate limiter
        otp4, count4, err4 = store_password_reset_otp(email, email)
        self.assertIsNone(otp4)
        self.assertIn("maximum limit", err4)

        # Verification of latest OTP
        valid, _ = verify_password_reset_otp(email, otp3)
        self.assertTrue(valid)


class StrongPasswordValidationTests(TestCase):
    def test_easy_passwords_are_rejected(self):
        from common.validators import validate_strong_password
        from django.core.exceptions import ValidationError

        invalid_passwords = [
            "12345678",           # Sequential numbers
            "1234567890",         # Sequential numbers
            "password123",        # Weak common
            "qwertyuiop",         # Keyboard sequence
            "JohnDoe123!",        # Similar to user name
            "john.doe@123",       # Similar to user email
            "ValidPass😁123!",    # Contains emoji
            "NOLOWERCASE123!",    # Missing lowercase
            "nouppercase123!",    # Missing uppercase
            "NoNumbersHere!",     # Missing number
            "NoSpecialChar123",   # Missing special char
        ]

        user_data = {"email": "john.doe@example.com", "first_name": "John", "last_name": "Doe"}

        for pwd in invalid_passwords:
            with self.subTest(pwd=pwd):
                with self.assertRaises(ValidationError):
                    validate_strong_password(pwd, user_data=user_data)

    def test_strong_valid_password_passes(self):
        from common.validators import validate_strong_password

        valid_password = "SecureP@ssw0rd2026!"
        user_data = {"email": "john.doe@example.com", "first_name": "John", "last_name": "Doe"}
        # Should not raise exception
        validate_strong_password(valid_password, user_data=user_data)


class NameValidationTests(TestCase):
    def test_invalid_names_are_rejected(self):
        from common.validators import validate_name
        from django.core.exceptions import ValidationError

        invalid_names = [
            "John123",           # Contains numbers
            "Jane😁",            # Contains emoji
            "Alex!",             # Contains special symbols
            "Robot9000",         # Name with digits
            "Test_User",         # Contains underscore
            "John@Home",         # Contains @ symbol
        ]

        for name in invalid_names:
            with self.subTest(name=name):
                with self.assertRaises(ValidationError):
                    validate_name(name, field_name="First name")

    def test_valid_names_are_accepted(self):
        from common.validators import validate_name

        valid_names = [
            "John",
            "Mary Jane",
            "Anne-Marie",
            "O'Connor",
            "Dr. Smith",
        ]

        for name in valid_names:
            with self.subTest(name=name):
                result = validate_name(name, field_name="First name")
                self.assertEqual(result, name)


class LinkedInAuthHandlingTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_linkedin_sso_blocks_unregistered_email_post(self, exchange, fetch):
        """If LinkedIn email is not registered in the system, POST callback returns 404 and does not auto-create a user."""
        exchange.return_value = {"access_token": "token-123"}
        fetch.return_value = {
            "sub": "unregistered-sub-123",
            "email": "unregistered@example.com",
            "name": "Unregistered User",
        }

        response = self.client.post(
            "/api/auth/linkedin/callback/",
            {"code": "auth-code-123"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("No account found matching this LinkedIn profile", response.data["error"])
        self.assertFalse(response.data["is_registered"])
        self.assertFalse(User.objects.filter(email="unregistered@example.com").exists())

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_linkedin_sso_blocks_unregistered_email_get(self, exchange, fetch):
        """If LinkedIn email is not registered, GET redirect callback redirects to frontend with error."""
        from urllib.parse import unquote

        exchange.return_value = {"access_token": "token-123"}
        fetch.return_value = {
            "sub": "unregistered-sub-456",
            "email": "unregistered2@example.com",
            "name": "Unregistered Two",
        }

        response = self.client.get(
            "/api/auth/linkedin/callback/",
            {"code": "auth-code-456", "state": "sso"},
        )

        self.assertEqual(response.status_code, 302)
        location = unquote(response["Location"])
        self.assertIn("error=", location)
        self.assertIn("No account found", location)
        self.assertFalse(User.objects.filter(email="unregistered2@example.com").exists())

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_linkedin_sso_succeeds_for_existing_student(self, exchange, fetch):
        """If user already exists and has social auth enabled, LinkedIn login succeeds and connects the account."""
        student = User.objects.create_user(
            email="existing_student@example.com",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
            is_social_auth_linked=True,
        )
        exchange.return_value = {"access_token": "token-123"}
        fetch.return_value = {
            "sub": "existing-student-sub",
            "email": "existing_student@example.com",
            "name": "Existing Student",
        }

        response = self.client.post(
            "/api/auth/linkedin/callback/",
            {"code": "auth-code-existing"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertTrue(response.data["is_linkedin_connected"])
        student.refresh_from_db()
        self.assertTrue(student.is_social_auth_linked)
        self.assertEqual(student.linkedin_id, "existing-student-sub")

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_linkedin_oidc_subject_is_not_used_as_public_profile_url(self, exchange, fetch):
        student = User.objects.create_user(
            email="linkedin-subject@example.com",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
            is_social_auth_linked=True,
        )
        profile = student.student_profile
        profile.linkedin_id = "opaque-linkedin-sub"
        profile.linkedin_url = "https://www.linkedin.com/in/opaque-linkedin-sub"
        profile.save(update_fields=["linkedin_id", "linkedin_url"])
        exchange.return_value = {"access_token": "token-123"}
        fetch.return_value = {
            "sub": "opaque-linkedin-sub",
            "email": student.email,
            "name": "LinkedIn Student",
        }

        response = self.client.post(
            "/api/auth/linkedin/callback/",
            {"code": "auth-code-subject"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertEqual(profile.linkedin_id, "opaque-linkedin-sub")
        self.assertFalse(profile.linkedin_url)

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_linkedin_connection_preserves_real_public_profile_url(self, exchange, fetch):
        student = User.objects.create_user(
            email="linkedin-public-url@example.com",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
            is_social_auth_linked=True,
        )
        profile = student.student_profile
        profile.linkedin_url = "https://www.linkedin.com/in/real-vanity-name"
        profile.save(update_fields=["linkedin_url"])
        exchange.return_value = {"access_token": "token-123"}
        fetch.return_value = {
            "sub": "opaque-linkedin-sub-2",
            "email": student.email,
            "name": "LinkedIn Student",
        }

        response = self.client.post(
            "/api/auth/linkedin/callback/",
            {"code": "auth-code-public-url"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertEqual(profile.linkedin_url, "https://www.linkedin.com/in/real-vanity-name")

    @patch("accounts.views.LinkedInAuthService.fetch_user_profile")
    @patch("accounts.views.LinkedInAuthService.exchange_code_for_token")
    def test_linkedin_sso_matches_staff_mapped_email(self, exchange, fetch):
        """Staff/Mentor whose personal LinkedIn email matches mapped_email is correctly logged in."""
        mentor = User.objects.create_user(
            email="mentor_official@suretrust.local",
            mapped_email="mentor_personal@gmail.com",
            password="SecurePassword123!",
            role=User.Role.MENTOR,
            is_email_verified=True,
            is_social_auth_linked=True,
        )
        exchange.return_value = {"access_token": "token-123"}
        fetch.return_value = {
            "sub": "mentor-sub-789",
            "email": "mentor_personal@gmail.com",
            "name": "Staff Mentor",
        }

        response = self.client.post(
            "/api/auth/linkedin/callback/",
            {"code": "auth-code-mentor"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "mentor_official@suretrust.local")
        self.assertEqual(response.data["user"]["role"], "MENTOR")
        mentor.refresh_from_db()
        self.assertEqual(mentor.linkedin_id, "mentor-sub-789")
        # Ensure no duplicate student account was created
        self.assertEqual(User.objects.filter(email="mentor_personal@gmail.com").count(), 0)


class UserViewSetRoleFilterTests(TestCase):
    def setUp(self):
        from django.urls import reverse
        self.url = reverse("user-list")
        from rest_framework.test import APIClient
        from accounts.models import User
        self.client = APIClient()
        self.admin = User.objects.create_user(email="admin@example.com", password="password", role=User.Role.ADMIN, is_staff=True)
        self.trustee1 = User.objects.create_user(email="trustee1@example.com", password="password", role=User.Role.TRUSTEE)
        self.trustee2 = User.objects.create_user(email="trustee2@example.com", password="password", role=User.Role.TRUSTEE)
        self.volunteer1 = User.objects.create_user(email="vol1@example.com", password="password", role=User.Role.VOLUNTEER)
        self.student1 = User.objects.create_user(email="student1@example.com", password="password", role=User.Role.STUDENT)
        self.client.force_authenticate(user=self.admin)

    def test_single_role_filter(self):
        # role=TRUSTEE
        res = self.client.get(self.url, {"role": "TRUSTEE"}, follow=True)
        self.assertEqual(res.status_code, 200)
        emails = [u["email"] for u in res.data["results"]]
        self.assertIn("trustee1@example.com", emails)
        self.assertNotIn("vol1@example.com", emails)
        self.assertEqual(len(emails), 2)

    def test_single_role_filter_volunteer(self):
        # role=VOLUNTEER
        res = self.client.get(self.url, {"role": "VOLUNTEER"}, follow=True)
        self.assertEqual(res.status_code, 200)
        emails = [u["email"] for u in res.data["results"]]
        self.assertIn("vol1@example.com", emails)
        self.assertNotIn("trustee1@example.com", emails)
        self.assertEqual(len(emails), 1)

    def test_comma_separated_roles(self):
        # role=TRUSTEE,VOLUNTEER
        res = self.client.get(self.url, {"role": "TRUSTEE,VOLUNTEER"}, follow=True)
        self.assertEqual(res.status_code, 200)
        emails = [u["email"] for u in res.data["results"]]
        self.assertIn("trustee1@example.com", emails)
        self.assertIn("vol1@example.com", emails)
        self.assertNotIn("student1@example.com", emails)
        self.assertEqual(len(emails), 3)

    def test_whitespace_around_comma_separated_roles(self):
        # whitespace around comma-separated roles
        res = self.client.get(self.url, {"role": "TRUSTEE , VOLUNTEER "}, follow=True)
        self.assertEqual(res.status_code, 200)
        emails = [u["email"] for u in res.data["results"]]
        self.assertIn("trustee1@example.com", emails)
        self.assertIn("vol1@example.com", emails)
        self.assertEqual(len(emails), 3)

    def test_case_insensitive_role_values(self):
        # case-insensitive role values
        res = self.client.get(self.url, {"role": "TrUsTeE,vOlUnTeEr"}, follow=True)
        self.assertEqual(res.status_code, 200)
        emails = [u["email"] for u in res.data["results"]]
        self.assertIn("trustee1@example.com", emails)
        self.assertIn("vol1@example.com", emails)
        self.assertEqual(len(emails), 3)

    def test_existing_authorization_behavior(self):
        # existing authorization behavior
        self.client.force_authenticate(user=self.student1)
        res = self.client.get(self.url, {"role": "TRUSTEE,VOLUNTEER"}, follow=True)
        self.assertEqual(res.status_code, 200)
        # Students shouldn't see anyone but themselves (or nobody if not matching role)
        emails = [u.get("email") for u in res.data.get("results", []) if u.get("email")]
        self.assertEqual(len(emails), 0)


