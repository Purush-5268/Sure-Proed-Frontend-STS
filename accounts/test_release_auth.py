from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application
from courses.models import Course
from cohorts.models import Cohort
from exams.models import Exam


class ReleaseAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(email="seeded@example.com", password="Initial@Pass123!", role="STUDENT", is_email_verified=True)

    def test_self_update_cannot_grant_role_or_global_access(self):
        self.client.force_authenticate(self.user)
        for field, value in [("role", "ADMIN"), ("has_all_cohorts_access", True), ("is_email_verified", False)]:
            response = self.client.patch(f"/api/users/{self.user.pk}/", {field: value}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "STUDENT")
        self.assertFalse(self.user.has_all_cohorts_access)
        response = self.client.patch(f"/api/users/{self.user.pk}/", {"first_name": "Learner"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_public_registration_cannot_create_staff_or_assign_enrollment(self):
        for extra in [{"role": "ADMIN"}, {"has_all_cohorts_access": True}, {"type": "VOLUNTEER"}, {"course": "untrusted"}]:
            response = self.client.post("/api/users/", {"email": "new@example.com", "password": "Unique@Pass123!", **extra}, format="json")
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    @patch("common.tasks.send_async_email_verification_otp.delay")
    def test_public_otp_cannot_create_an_admin(self, delivery):
        response = self.client.post("/api/auth/send-verification-otp/", {"email": "fake-admin@example.com", "role": "ADMIN", "password": "Unique@Pass123!"}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        delivery.assert_not_called()

    def test_staff_flag_does_not_allow_editing_another_account(self):
        volunteer = User.objects.create_user(email="staff@example.com", password="Unique@Pass123!", role="VOLUNTEER", is_staff=True)
        self.client.force_authenticate(volunteer)
        response = self.client.patch(f"/api/users/{self.user.pk}/", {"password": "Hijacked@Pass123!"}, format="json")
        self.assertIn(response.status_code, [403, 404], response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Initial@Pass123!"))

    def test_admin_can_provision_staff_and_grant_access(self):
        admin = User.objects.create_superuser(email="release-admin@example.com", password="Admin@Pass123!")
        self.client.force_authenticate(admin)
        response = self.client.post("/api/users/", {
            "email": "new-mentor@example.com", "role": "MENTOR", "first_name": "Mentor",
            "password": "Unique@Pass987!", "has_all_cohorts_access": True,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        mentor = User.objects.get(email="new-mentor@example.com")
        self.assertTrue(mentor.has_all_cohorts_access)
        self.assertTrue(hasattr(mentor, "mentor_profile"))

    @patch("common.services.email_service.send_password_reset_otp", return_value=True)
    def test_seeded_reset_preserves_identity_marks_and_other_password(self, delivery):
        other = User.objects.create_user(email="other-seeded@example.com", password="Initial@Pass123!", role="STUDENT")
        course = Course.objects.create(code="RESET", name="Reset course", domain="Technology")
        cohort = Cohort.objects.create(code="RESET-COHORT", course=course, status="TRAINING", start_date=timezone.localdate(), end_date=timezone.localdate())
        application = Application.objects.create(student=self.user.student_profile, course=course, assigned_cohort=cohort, status="TRAINING", qualified=True)
        exam = Exam.objects.create(application=application, status="EVALUATED", marks_obtained=Decimal("42"), total_marks=Decimal("50"), qualified=True)
        identity = (self.user.pk, self.user.student_profile.pk, application.pk, exam.pk)
        before_users = User.objects.count()
        requested = self.client.post("/api/users/forgot_password_request/", {"email": self.user.email}, format="json")
        self.assertEqual(requested.status_code, 200, requested.data)
        otp = delivery.call_args.args[1]
        payload = {"email": self.user.email, "otp": otp, "new_password": "Personal@Pass987!"}
        reset = self.client.post("/api/users/forgot_password_confirm/", payload, format="json")
        self.assertEqual(reset.status_code, 200, reset.data)
        login = self.client.post("/api/auth/token/", {"email": self.user.email, "password": payload["new_password"]}, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        self.assertNotIn("password", login.data)
        self.user.refresh_from_db()
        application.refresh_from_db()
        exam.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(identity, (self.user.pk, self.user.student_profile.pk, application.pk, exam.pk))
        self.assertEqual(exam.marks_obtained, Decimal("42"))
        self.assertEqual(application.student_id, self.user.student_profile.pk)
        self.assertEqual(application.assigned_cohort_id, cohort.pk)
        self.assertEqual(User.objects.count(), before_users)
        self.assertTrue(other.check_password("Initial@Pass123!"))
        self.assertFalse(self.user.check_password("Initial@Pass123!"))
        self.assertEqual(self.client.post("/api/users/forgot_password_confirm/", payload, format="json").status_code, 400)
