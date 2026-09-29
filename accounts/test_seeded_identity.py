"""Shared inboxes select an explicit existing role without mixing academic data."""

from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application
from attendance.models import Attendance
from cohorts.models import Cohort
from courses.models import Course
from exams.models import Exam, ModuleTest, ModuleTestSubmission


class SeededIdentityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        # The old OR query selected this staff UUID first, despite the student
        # owning the requested primary address.
        self.staff = User.objects.create_user(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            email="volunteer@suretrust.local", mapped_email="learner@example.com",
            password="Initial@Pass123!", role="VOLUNTEER", is_email_verified=True,
        )
        self.student = User.objects.create_user(
            id=UUID("ffffffff-ffff-ffff-ffff-ffffffffffff"),
            email="learner@example.com", password="Initial@Pass123!", role="STUDENT",
            is_email_verified=True, first_name="Seeded", last_name="Learner", phone_number="1234567890",
        )
        self.profile = self.student.student_profile
        self.profile.college = "Seeded College"
        self.profile.degree = "BTech"
        self.profile.save()
        course = Course.objects.create(code="IDENTITY", name="Seeded VLSI", domain="Technology", status="PUBLISHED", requires_interview=False)
        self.cohort = Cohort.objects.create(
            code="G2-26", course=course, status="TRAINING",
            start_date=timezone.localdate() - timedelta(days=60), end_date=timezone.localdate() + timedelta(days=60),
        )
        self.application = Application.objects.create(
            application_number="IDENTITY-001", student=self.profile, course=course,
            assigned_cohort=self.cohort, status="TRAINING", qualified=True,
        )
        Exam.objects.create(application=self.application, status="EVALUATED", marks_obtained=42, total_marks=50, percentage=84, qualified=True)
        module_test = ModuleTest.objects.create(course=course, cohort=self.cohort, title="Seeded module")
        self.module = ModuleTestSubmission.objects.create(
            test=module_test, student=self.profile, status="SUBMITTED", marks_obtained=81,
            total_marks=100, percentage=81, qualified=True, submitted_at=timezone.now(),
        )
        self.attendance = Attendance.objects.create(
            cohort=self.cohort, title="Seeded session", class_date=timezone.localdate() - timedelta(days=30),
            start_time=time(10), end_time=time(11), conducted=True, class_status="COMPLETED",
            google_meet_attendance_data={"status": "READY", "expected_students": {str(self.profile.pk): {"attendance_percentage": 100}}},
        )

    def login(self, email, password, role=None):
        data = {"email": email, "password": password}
        role = role or ("STUDENT" if email.strip().lower() == self.student.email else None)
        if role: data["role"] = role
        return self.client.post("/api/auth/token/", data, format="json")

    def request_otp(self, email, delivery, role=None):
        data = {"email": email}
        role = role or ("STUDENT" if email.strip().lower() == self.student.email else None)
        if role: data["role"] = role
        result = self.client.post("/api/users/forgot_password_request/", data, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        return delivery.call_args.args[1]

    def confirm(self, email, otp, password="Personal@Pass987!", role=None):
        data = {"email": email, "otp": otp, "new_password": password}
        role = role or ("STUDENT" if email.strip().lower() == self.student.email else None)
        if role: data["role"] = role
        return self.client.post("/api/users/forgot_password_confirm/", data, format="json")

    def test_chosen_student_and_staff_accounts_keep_their_own_identity(self):
        result = self.login(" LEARNER@EXAMPLE.COM ", "Initial@Pass123!")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["user"]["id"], str(self.student.pk))
        self.assertEqual(result.data["user"]["role"], "STUDENT")
        staff_login = self.login(self.staff.email, "Initial@Pass123!")
        self.assertEqual(staff_login.status_code, 200, staff_login.data)
        self.assertEqual(staff_login.data["user"]["id"], str(self.staff.pk))
        mapped_login = self.login(self.student.email, "Initial@Pass123!", role="VOLUNTEER")
        self.assertEqual(mapped_login.status_code, 200, mapped_login.data)
        self.assertEqual(mapped_login.data["user"]["id"], str(self.staff.pk))

    def test_only_multi_role_addresses_require_a_choice_and_expose_no_profiles(self):
        for url, data in [
            ("/api/auth/token/", {"password": "Initial@Pass123!"}),
            ("/api/users/forgot_password_request/", {}),
            ("/api/users/forgot_password_confirm/", {"otp": "123456", "new_password": "Personal@Pass987!"}),
        ]:
            response = self.client.post(url, {"email": self.student.email, **data}, format="json")
            self.assertEqual(response.status_code, 409, response.data)
            self.assertEqual(set(response.data), {"code", "detail", "roles"})
            self.assertEqual(set(response.data["roles"]), {"STUDENT", "VOLUNTEER"})
        single = self.client.post("/api/auth/token/", {"email": self.staff.email, "password": "Initial@Pass123!"}, format="json")
        self.assertEqual(single.status_code, 200, single.data)

    def test_a_role_choice_cannot_grant_an_unowned_role_or_use_another_password(self):
        self.assertEqual(self.login(self.student.email, "Initial@Pass123!", role="MENTOR").status_code, 401)
        self.staff.set_password("StaffOnly@Pass987!")
        self.staff.save(update_fields=["password"])
        self.assertEqual(self.login(self.student.email, "Initial@Pass123!", role="VOLUNTEER").status_code, 401)
        self.assertEqual(self.login(self.student.email, "StaffOnly@Pass987!", role="VOLUNTEER").status_code, 200)

    @patch("accounts.otp_service.generate_secure_otp", side_effect=["123456", "654321"])
    @patch("common.services.email_service.send_password_reset_otp", return_value=True)
    def test_shared_email_reset_changes_only_selected_role(self, delivery, generated):
        student_otp = self.request_otp(self.student.email, delivery, role="STUDENT")
        volunteer_otp = self.request_otp(self.student.email, delivery, role="VOLUNTEER")
        self.assertEqual(self.confirm(self.student.email, student_otp, role="VOLUNTEER").status_code, 400)
        self.assertEqual(self.confirm(self.student.email, volunteer_otp, role="VOLUNTEER").status_code, 200)
        self.student.refresh_from_db()
        self.staff.refresh_from_db()
        self.assertTrue(self.student.check_password("Initial@Pass123!"))
        self.assertTrue(self.staff.check_password("Personal@Pass987!"))
        self.assertEqual(self.confirm(self.student.email, student_otp, role="STUDENT").status_code, 200)

    def test_primary_address_never_falls_back_to_an_alias_password(self):
        self.staff.set_password("StaffOnly@Pass987!")
        self.staff.save(update_fields=["password"])
        response = self.login(self.student.email, "StaffOnly@Pass987!")
        self.assertEqual(response.status_code, 401, response.data)

    @patch("common.services.email_service.send_password_reset_otp", return_value=True)
    def test_reset_then_real_jwt_login_preserves_seeded_api_data(self, delivery):
        otp = self.request_otp(self.student.email, delivery)
        reset = self.confirm(self.student.email, otp)
        self.assertEqual(reset.status_code, 200, reset.data)
        login = self.login(self.student.email, "Personal@Pass987!")
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(login.data["user"]["id"], str(self.student.pk))
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
        stats = self.client.get("/api/students/statistics/")
        self.assertEqual(stats.status_code, 200, stats.data)
        self.assertEqual(stats.data["student_code"], self.profile.student_code)
        self.assertEqual(stats.data["active_cohort"]["code"], "G2-26")
        self.assertEqual(stats.data["application_number"], self.application.application_number)
        self.assertEqual(stats.data["screening_marks_obtained"], Decimal("42"))
        self.assertEqual(stats.data["module_grades"][0]["id"], str(self.module.pk))
        self.assertEqual(stats.data["attendance_percentage"], 100)
        journey = self.client.get("/api/applications/current-journey/")
        self.assertEqual(journey.status_code, 200, journey.data)
        self.assertTrue(journey.data["is_enrolled"])
        self.assertEqual(str(journey.data["application"]["id"]), str(self.application.pk))
        attendance = self.client.get("/api/attendance/")
        self.assertEqual(attendance.status_code, 200, attendance.data)
        self.assertEqual([str(row["id"]) for row in attendance.data["results"]], [str(self.attendance.pk)])
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("Initial@Pass123!"))
        self.assertEqual(self.student.student_profile.pk, self.profile.pk)

    @patch("accounts.otp_service.generate_secure_otp", side_effect=["123456", "654321"])
    @patch("common.services.email_service.send_password_reset_otp", return_value=True)
    def test_two_resets_to_shared_inbox_cannot_consume_each_others_otp(self, delivery, generated):
        student_otp = self.request_otp(self.student.email, delivery)
        staff_otp = self.request_otp(self.staff.email, delivery)
        self.assertEqual(delivery.call_args.args[0], self.student.email)
        self.assertEqual(self.confirm(self.student.email, staff_otp).status_code, 400)
        self.assertEqual(self.confirm(self.staff.email, student_otp).status_code, 400)
        self.assertEqual(self.confirm(self.student.email, student_otp).status_code, 200)
        self.assertEqual(self.confirm(self.staff.email, staff_otp, "StaffNew@Pass987!").status_code, 200)
        self.student.refresh_from_db()
        self.staff.refresh_from_db()
        self.assertTrue(self.student.check_password("Personal@Pass987!"))
        self.assertTrue(self.staff.check_password("StaffNew@Pass987!"))

    def test_ambiguous_notification_alias_is_rejected_for_login_and_reset(self):
        self.staff.mapped_email = "shared@example.com"
        self.staff.save(update_fields=["mapped_email"])
        User.objects.create_user(email="second@suretrust.local", mapped_email="shared@example.com", password="Initial@Pass123!", role="VOLUNTEER", is_email_verified=True)
        self.assertEqual(self.login("shared@example.com", "Initial@Pass123!").status_code, 400)
        self.assertEqual(self.client.post("/api/users/forgot_password_request/", {"email": "shared@example.com"}, format="json").status_code, 400)
        self.assertEqual(self.confirm("shared@example.com", "123456").status_code, 400)

    @patch("common.services.email_service.send_password_reset_otp", return_value=True)
    def test_unique_staff_alias_still_resolves_to_its_existing_account(self, delivery):
        self.staff.mapped_email = "unique-staff@example.com"
        self.staff.save(update_fields=["mapped_email"])
        otp = self.request_otp(self.staff.mapped_email, delivery)
        self.assertEqual(self.confirm(self.staff.mapped_email, otp).status_code, 200)
        login = self.login(self.staff.mapped_email, "Personal@Pass987!")
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(login.data["user"]["id"], str(self.staff.pk))

    def test_legacy_cache_payload_for_another_account_is_rejected(self):
        cache.set("otp:pwd_reset:" + self.student.email, {"email": self.staff.email, "delivery_email": self.student.email, "otp": "123456"})
        self.assertEqual(self.confirm(self.student.email, "123456").status_code, 400)
