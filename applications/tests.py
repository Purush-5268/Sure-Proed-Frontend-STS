from datetime import timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import User
from courses.models import Course
from courses.views import CourseViewSet
from cohorts.models import Cohort
from students.models import StudentProfile
from students.views import StudentProfileViewSet

from .models import Application, PreScreeningInterview
from .serializers import ApplicationSerializer
from .admin import ApplicationAdminForm
from .policy import blocking_application_for
from .views import ApplicationViewSet, PreScreeningInterviewViewSet


class SingleCourseSelectionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="test-pass")
        self.student_user = User.objects.create_user(
            email="student@example.com", password="test-pass", role=User.Role.STUDENT
        )
        self.student = StudentProfile.objects.get(user=self.student_user)
        self.course_one = self._course("COURSE-1", "Course One")
        self.course_two = self._course("COURSE-2", "Course Two")
        self.factory = APIRequestFactory()

    def _course(self, code, name):
        c = Course.objects.create(
            code=code,
            name=name,
            category=Course.Category.NON_MEDICAL,
            domain="Technology",
            description="Test course",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        Cohort.objects.create(
            course=c,
            code=f"{code}-OPEN",
            status=Cohort.Status.OPEN,
            start_date="2026-09-01",
            end_date="2026-12-01",
        )
        return c

    def _application(self, course, status=Application.Status.APPLIED, qualified=None):
        return Application.objects.create(
            application_number=f"APP-{course.code}",
            student=self.student,
            course=course,
            status=status,
            qualified=qualified,
        )

    def test_second_course_is_locked_while_first_is_active(self):
        first = self._application(self.course_one)
        request = self.factory.post("/api/applications/", {"course": str(self.course_two.id)}, format="json")
        force_authenticate(request, user=self.student_user)

        response = ApplicationViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "COURSE_SELECTION_LOCKED")
        self.assertEqual(response.data["blocking_application"]["id"], str(first.id))

    def test_not_qualified_releases_course_selection(self):
        self._application(self.course_one, status=Application.Status.REJECTED, qualified=False)
        request = self.factory.post("/api/applications/", {"course": str(self.course_two.id)}, format="json")
        force_authenticate(request, user=self.student_user)

        response = ApplicationViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(response.data["course"]), str(self.course_two.id))

    def test_mentor_verification_failure_releases_selection(self):
        application = self._application(self.course_one, status=Application.Status.QUALIFIED, qualified=True)
        interview = PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.SCHEDULED,
        )
        request = self.factory.post(
            f"/api/pre-screening-interviews/{interview.id}/update-status/",
            {"status": "FAILED", "feedback": "Verification failed"},
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = PreScreeningInterviewViewSet.as_view({"post": "update_status"})(request, pk=interview.id)
        application.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(application.status, Application.Status.REJECTED)
        self.assertFalse(application.qualified)
        self.assertIsNone(blocking_application_for(self.student))

    def test_student_discontinue_releases_selection(self):
        cohort = Cohort.objects.create(
            code="COHORT-DROP",
            name="Discontinue Cohort",
            course=self.course_one,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        application = self._application(self.course_one, status=Application.Status.QUALIFIED, qualified=True)
        application.assigned_cohort = cohort
        application.status = Application.Status.IN_PROGRESS
        application.save(update_fields=["assigned_cohort", "status", "updated_at"])
        from accounts.otp_service import store_discontinue_otp
        otp = store_discontinue_otp(str(application.id), self.student_user.email)
        request = self.factory.post(
            f"/api/applications/{application.id}/discontinue/",
            {"reason": "Student requested discontinuation", "otp": otp},
            format="json",
        )
        force_authenticate(request, user=self.student_user)

        response = ApplicationViewSet.as_view({"post": "discontinue"})(request, pk=application.id)
        application.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(application.status, Application.Status.DROPPED)
        self.assertIsNone(blocking_application_for(self.student))

    def test_course_cancellation_releases_selection(self):
        application = self._application(self.course_one, status=Application.Status.QUALIFIED, qualified=True)
        request = self.factory.patch(
            f"/api/courses/{self.course_one.id}/",
            {"status": Course.Status.CANCELLED},
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = CourseViewSet.as_view({"patch": "partial_update"})(request, pk=self.course_one.id)
        application.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(application.status, Application.Status.CANCELLED)
        self.assertIsNone(blocking_application_for(self.student))

    @patch("applications.views.send_async_cohort_assignment.delay")
    def test_linkedin_and_github_are_required_before_cohort_assignment(self, send_assignment_email):
        application = self._application(
            self.course_one,
            status=Application.Status.QUALIFIED,
            qualified=True,
        )
        cohort = Cohort.objects.create(
            code="COHORT-LI",
            name="LinkedIn Verified Cohort",
            course=self.course_one,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=90),
            status=Cohort.Status.OPEN,
            created_by=self.admin,
        )
        PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
        )
        request = self.factory.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(cohort.id)},
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = ApplicationViewSet.as_view({"post": "assign_cohort"})(request, pk=application.id)

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["code"], "COHORT_ASSIGNMENT_PENDING_PROFILES")
        self.assertEqual(response.data["cohort_assignment_status"], "PENDING")
        self.assertEqual(response.data["application_status"], Application.Status.QUALIFIED)
        self.assertFalse(response.data["requirements"]["linkedin_connected"])
        self.assertFalse(response.data["requirements"]["github_linked"])
        application.refresh_from_db()
        self.assertIsNone(application.assigned_cohort)

        self.student.is_linkedin_connected = True
        self.student.github_url = "https://github.com/student"
        self.student.github_username = "student_user"
        self.student.github_repo_url = "https://github.com/Suretrust-Org/py-dev-stu"
        self.student.save(update_fields=["is_linkedin_connected", "github_url", "github_username", "github_repo_url", "updated_at"])
        retry = self.factory.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(cohort.id)},
            format="json",
        )
        force_authenticate(retry, user=self.admin)

        awaiting_admin = ApplicationViewSet.as_view({"post": "assign_cohort"})(retry, pk=application.id)

        self.assertEqual(awaiting_admin.status_code, 409)
        self.assertEqual(awaiting_admin.data["code"], "ROLE_VERIFICATION_REQUIRED")
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.role_verified_by = self.admin
        application.role_verified_at = timezone.now()
        application.save(update_fields=[
            "role_verification_status", "role_verified_by", "role_verified_at", "updated_at"
        ])
        approved = self.factory.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(cohort.id)},
            format="json",
        )
        force_authenticate(approved, user=self.admin)

        success = ApplicationViewSet.as_view({"post": "assign_cohort"})(approved, pk=application.id)

        self.assertEqual(success.status_code, 200)
        send_assignment_email.assert_called_once()
        application.refresh_from_db()
        self.assertEqual(application.assigned_cohort_id, cohort.id)
        application.student.refresh_from_db()
        self.assertIsNotNone(application.student.student_identity_issued_at)

    def test_legacy_staff_domain_student_cannot_be_assigned_to_cohort(self):
        application = self._application(
            self.course_one,
            status=Application.Status.QUALIFIED,
            qualified=True,
        )
        cohort = Cohort.objects.create(
            code="COHORT-RESERVED",
            name="Reserved Domain Guard",
            course=self.course_one,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=90),
            status=Cohort.Status.OPEN,
            created_by=self.admin,
        )
        # Simulate an old production row created before the reserved-domain rule.
        User.objects.filter(pk=self.student_user.pk).update(email="legacy-student@suretrust.local")
        request = self.factory.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(cohort.id)},
            format="json",
        )
        force_authenticate(request, user=self.admin)

        response = ApplicationViewSet.as_view({"post": "assign_cohort"})(request, pk=application.id)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "STAFF_DOMAIN_RESERVED")

    def test_even_superadmin_cannot_fake_cohort_assigned_status_without_cohort(self):
        application = self._application(
            self.course_one,
            status=Application.Status.QUALIFIED,
            qualified=True,
        )
        form = ApplicationAdminForm(
            instance=application,
            data={
                "application_number": application.application_number,
                "student": str(self.student.id),
                "course": str(self.course_one.id),
                "status": Application.Status.COHORT_ASSIGNED,
                "qualified": "True",
                "role_verification_status": Application.RoleVerificationStatus.PENDING,
            },
        )

        self.assertFalse(form.is_valid())
        self.assertIn("assigned_cohort", form.errors)

    def test_role_verification_requires_all_checks_and_explicit_admin_approval(self):
        application = self._application(
            self.course_one,
            status=Application.Status.QUALIFIED,
            qualified=True,
        )
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED

        with self.assertRaises(ValidationError):
            application.full_clean()

        self.student.is_linkedin_connected = True
        self.student.github_url = "https://github.com/student"
        self.student.save(update_fields=["is_linkedin_connected", "github_url", "updated_at"])
        PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
        )

        application.refresh_from_db()
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.full_clean()
        self.assertTrue(application.is_student_role_verified)

    def test_student_role_verification_requires_linkedin_and_github(self):
        self._application(
            self.course_one,
            status=Application.Status.QUALIFIED,
            qualified=True,
        )
        request = self.factory.get("/api/students/statistics/")
        force_authenticate(request, user=self.student_user)

        response = StudentProfileViewSet.as_view({"get": "statistics"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["student_role_verified"])

        self.student.is_linkedin_connected = True
        self.student.save(update_fields=["is_linkedin_connected", "updated_at"])
        refreshed = self.factory.get("/api/students/statistics/")
        force_authenticate(refreshed, user=self.student_user)

        linkedin_only = StudentProfileViewSet.as_view({"get": "statistics"})(refreshed)

        self.assertFalse(linkedin_only.data["student_role_verified"])

        self.student.github_url = "https://github.com/student"
        self.student.save(update_fields=["github_url", "updated_at"])
        complete = self.factory.get("/api/students/statistics/")
        force_authenticate(complete, user=self.student_user)

        profiles_only = StudentProfileViewSet.as_view({"get": "statistics"})(complete)

        self.assertFalse(profiles_only.data["student_role_verified"])

        application = Application.objects.get(student=self.student)
        PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
        )
        after_interview = self.factory.get("/api/students/statistics/")
        force_authenticate(after_interview, user=self.student_user)

        waiting_for_admin = StudentProfileViewSet.as_view({"get": "statistics"})(after_interview)

        self.assertFalse(waiting_for_admin.data["student_role_verified"])
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.role_verified_by = self.admin
        application.role_verified_at = timezone.now()
        application.save(update_fields=[
            "role_verification_status", "role_verified_by", "role_verified_at", "updated_at"
        ])
        after_admin_verification = self.factory.get("/api/students/statistics/")
        force_authenticate(after_admin_verification, user=self.student_user)

        verified = StudentProfileViewSet.as_view({"get": "statistics"})(after_admin_verification)

        self.assertTrue(verified.data["student_role_verified"])

    def test_profile_patch_cannot_spoof_linkedin_verification(self):
        request = self.factory.patch(
            f"/api/students/{self.student.id}/",
            {
                "is_linkedin_connected": True,
                "linkedin_id": "fake-linkedin-id",
                "linkedin_url": "https://linkedin.com/in/fake",
                "github_url": "https://github.com/student",
            },
            format="json",
        )
        force_authenticate(request, user=self.student_user)

        response = StudentProfileViewSet.as_view({"patch": "partial_update"})(
            request,
            pk=self.student.id,
        )

        self.assertEqual(response.status_code, 200)
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_linkedin_connected)
        self.assertIsNone(self.student.linkedin_id)
        self.assertEqual(self.student.linkedin_url, "https://linkedin.com/in/fake")
        self.assertEqual(self.student.github_url, "https://github.com/student")


class GitHubOAuthAndRepoSetupTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.student_user = User.objects.create_user(
            email="githubstudent@example.com",
            first_name="GitHub",
            last_name="Student",
            role="STUDENT",
        )
        self.student, _ = StudentProfile.objects.get_or_create(
            user=self.student_user,
            defaults={"student_code": "STU-GH101"},
        )

    def test_github_connect_url_endpoint(self):
        from accounts.views import GitHubConnectURLView
        request = self.factory.get("/api/auth/github/connect/")
        force_authenticate(request, user=self.student_user)

        response = GitHubConnectURLView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn("https://github.com/login/oauth/authorize", response.data["authorization_url"])
        self.assertIn("client_id=", response.data["authorization_url"])

    @override_settings(GITHUB_OAUTH_FRONTEND_URL="https://frontend.example")
    def test_github_browser_callback_connects_account_and_returns_to_web(self):
        from urllib.parse import parse_qs, urlparse

        from accounts.views import GitHubCallbackView, GitHubConnectURLView

        connect_request = self.factory.get("/api/auth/github/connect/")
        force_authenticate(connect_request, user=self.student_user)
        connect_response = GitHubConnectURLView.as_view()(connect_request)
        state = parse_qs(urlparse(connect_response.data["authorization_url"]).query)["state"][0]

        callback_request = self.factory.get(
            "/api/auth/github/callback/",
            {"code": "oauth-code", "state": state, "iss": "https://github.com/login/oauth"},
        )
        with patch(
            "accounts.views.GitHubService.exchange_code_for_token",
            return_value={"access_token": "test-token"},
        ), patch(
            "accounts.views.GitHubService.fetch_user_profile",
            return_value={
                "login": "web_student",
                "html_url": "https://github.com/web_student",
            },
        ):
            response = GitHubCallbackView.as_view()(callback_request)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://frontend.example/?github_oauth=success&github_username=web_student",
        )
        self.student.refresh_from_db()
        self.assertTrue(self.student.is_github_connected)
        self.assertEqual(self.student.github_username, "web_student")

    @override_settings(GITHUB_OAUTH_FRONTEND_URL="https://frontend.example")
    def test_github_browser_callback_rejects_unknown_or_replayed_state(self):
        from accounts.views import GitHubCallbackView

        request = self.factory.get(
            "/api/auth/github/callback/",
            {"code": "oauth-code", "state": "not-a-valid-state"},
        )
        response = GitHubCallbackView.as_view()(request)

        self.assertEqual(response.status_code, 302)
        self.assertIn("github_oauth=error", response["Location"])

    def test_github_callback_only_stores_identity_and_defers_repository(self):
        from accounts.views import GitHubCallbackView
        request = self.factory.post(
            "/api/auth/github/callback/",
            {"code": "test_dev_github_code"},
            format="json",
        )
        force_authenticate(request, user=self.student_user)

        with patch(
            "accounts.views.GitHubService.exchange_code_for_token",
            return_value={"access_token": "test-token"},
        ), patch(
            "accounts.views.GitHubService.fetch_user_profile",
            return_value={
                "login": "student_test",
                "html_url": "https://github.com/student_test",
            },
        ), patch(
            "accounts.views.GitHubService.create_and_initialize_student_repo"
        ) as create_repo:
            response = GitHubCallbackView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_github_connected"])
        self.assertEqual(response.data["github_username"], "student_test")
        self.assertIsNone(response.data["github_repo_url"])
        self.assertEqual(response.data["github_org_invite_status"], "NOT_INVITED")
        self.assertNotIn("initialized_folders", response.data)
        create_repo.assert_not_called()

        self.student.refresh_from_db()
        self.assertTrue(self.student.is_github_connected)
        self.assertIsNone(self.student.github_repo_url)

    def test_github_disconnect_resets_fields(self):
        from accounts.views import GitHubDisconnectView
        self.student.is_github_connected = True
        self.student.github_username = "test_user"
        self.student.github_repo_url = "https://github.com/Suretrust-Org/repo"
        self.student.save()

        request = self.factory.post("/api/auth/github/disconnect/")
        force_authenticate(request, user=self.student_user)

        response = GitHubDisconnectView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_github_connected"])
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_github_connected)
        self.assertIsNone(self.student.github_username)
        self.assertIsNone(self.student.github_repo_url)



class OfferLetterFileCleanupTests(TestCase):
    def setUp(self):
        import os
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.admin = User.objects.create_superuser(email="offer_admin@example.com", password="test-pass")
        self.student_user = User.objects.create_user(
            email="offer_student@example.com", password="test-pass", role=User.Role.STUDENT
        )
        self.student = self.student_user.student_profile
        self.course = Course.objects.create(
            code="OFFER-101",
            name="Offer Test Course",
            category=Course.Category.NON_MEDICAL,
            domain="Tech",
            description="Test course",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        self.app = Application.objects.create(
            student=self.student,
            course=self.course,
            status=Application.Status.APPLIED,
        )
        self.app_num = self.app.application_number

        self.file1 = SimpleUploadedFile(f"{self.app_num}_old.pdf", b"%PDF-1.4 old offer letter", content_type="application/pdf")
        self.file2 = SimpleUploadedFile(f"{self.app_num}_new.pdf", b"%PDF-1.4 new offer letter", content_type="application/pdf")

    def test_offer_letter_upload_path_overwrite_and_deletion(self):
        import os

        # 1. First offer letter upload
        self.app.offer_letter_file = self.file1
        self.app.save()

        path1 = self.app.offer_letter_file.path
        self.assertIn(self.app_num, path1)
        self.assertTrue(path1.endswith(".pdf"))
        self.assertTrue(os.path.exists(path1))

        # 2. Re-upload new offer letter
        self.app.offer_letter_file = self.file2
        self.app.save()

        path2 = self.app.offer_letter_file.path
        self.assertIn(self.app_num, path2)
        self.assertTrue(path2.endswith(".pdf"))
        self.assertTrue(os.path.exists(path2))

        # 3. Deleting student profile cascades to Application and deletes offer letter file from disk
        with self.captureOnCommitCallbacks(execute=True):
            self.student.delete()
        self.assertFalse(os.path.exists(path2))


class ApplicationFilterAndStudentDetailsTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = User.objects.create_superuser(email="filteradmin@example.com", password="test-pass")
        self.student_user = User.objects.create_user(
            email="filterstudent@example.com", first_name="Filter", last_name="Student", password="test-pass", role=User.Role.STUDENT
        )
        self.student = StudentProfile.objects.get(user=self.student_user)
        self.course_a = Course.objects.create(
            code="COURSE-FA", name="Course FA", category=Course.Category.NON_MEDICAL, domain="Tech", description="Desc", status=Course.Status.PUBLISHED, created_by=self.admin
        )
        self.course_b = Course.objects.create(
            code="COURSE-FB", name="Course FB", category=Course.Category.NON_MEDICAL, domain="Tech", description="Desc", status=Course.Status.PUBLISHED, created_by=self.admin
        )
        self.cohort_a = Cohort.objects.create(
            code="COHORT-FA", name="Cohort FA", course=self.course_a, start_date=timezone.now().date(), end_date=timezone.now().date() + timezone.timedelta(days=30), max_students=50, created_by=self.admin
        )
        self.app1 = Application.objects.create(
            student=self.student,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True,
            application_number="APP-FA-001"
        )
        self.app2 = Application.objects.create(
            student=self.student,
            course=self.course_b,
            assigned_cohort=None,
            status=Application.Status.APPLIED,
            qualified=False,
            application_number="APP-FB-002"
        )

    def test_student_details_field_in_serializer(self):
        serializer = ApplicationSerializer(self.app1)
        data = serializer.data
        self.assertIn("student_details", data)
        sd = data["student_details"]
        self.assertEqual(sd["id"], str(self.student.id))
        self.assertEqual(sd["name"], "Filter Student")
        self.assertEqual(sd["student_code"], self.student.student_code)
        self.assertEqual(sd["email"], "filterstudent@example.com")

    def test_application_filtering_query_params(self):
        request = self.factory.get(f"/api/applications/?course={self.course_a.id}")
        force_authenticate(request, user=self.admin)
        view = ApplicationViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(self.app1.id))

        request_null = self.factory.get("/api/applications/?assigned_cohort__isnull=True")
        force_authenticate(request_null, user=self.admin)
        response_null = view(request_null)
        self.assertEqual(response_null.status_code, 200)
        results_null = response_null.data.get("results", response_null.data)
        self.assertEqual(len(results_null), 1)
        self.assertEqual(results_null[0]["id"], str(self.app2.id))

        request_qual = self.factory.get("/api/applications/?qualified=True")
        force_authenticate(request_qual, user=self.admin)
        response_qual = view(request_qual)
        self.assertEqual(response_qual.status_code, 200)
        results_qual = response_qual.data.get("results", response_qual.data)
        self.assertEqual(len(results_qual), 1)
        self.assertEqual(results_qual[0]["id"], str(self.app1.id))


class ApplicationAdminChangeViewSafetyTests(TestCase):
    def setUp(self):
        from django.contrib.admin.sites import AdminSite
        from applications.admin import ApplicationAdmin
        from applications.services.journey_service import build_student_journey
        from accounts.models import User
        from students.models import StudentProfile
        from courses.models import Course
        from cohorts.models import Cohort

        self.site = AdminSite()
        self.admin_user = User.objects.create_superuser(
            email="superadmin@suretrust.org",
            password="admin-password",
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
            is_active=True,
        )
        self.student_user = User.objects.create_user(
            email="edgetest@example.com",
            password="test-password",
            first_name="",
            last_name="",
            phone_number="",
            role=User.Role.STUDENT,
        )

        self.student_profile = StudentProfile.objects.get(user=self.student_user)
        self.student_profile.college = ""
        self.student_profile.degree = ""
        self.student_profile.github_url = ""
        self.student_profile.is_linkedin_connected = False
        self.student_profile.is_github_connected = False
        self.student_profile.save()

        self.course = Course.objects.create(
            code="SAF-01",
            name="Safety Course",
            category=Course.Category.NON_MEDICAL,
            domain="Tech",
            description="Safety",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )
        self.cohort = Cohort.objects.create(
            name="Safety Cohort 1",
            code="SAF-C1",
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
        )
        self.application = Application.objects.create(
            application_number="APP-SAF-001",
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.COHORT_ASSIGNED,
        )

    def test_build_student_journey_with_null_attributes(self):
        from applications.services.journey_service import build_student_journey
        journey = build_student_journey(self.student_profile, self.application)
        self.assertIsInstance(journey, dict)
        self.assertIn("steps", journey)
        self.assertIn("blockers", journey)
        self.assertFalse(journey["requirements_verified"])

        # Also test with None student and None application
        journey_null = build_student_journey(None, None)
        self.assertEqual(journey_null["completion_percentage"], 0.0)

    def test_application_admin_change_view_renders_200(self):
        from django.urls import reverse
        self.client.force_login(self.admin_user)
        url = reverse("admin:applications_application_change", args=[self.application.pk])
        response = self.client.get(url, follow=True)
        self.assertEqual(response.status_code, 200)

    def test_application_admin_display_methods_safe(self):
        from applications.admin import ApplicationAdmin
        admin_instance = ApplicationAdmin(Application, self.site)
        
        # Test all custom display and action methods
        actions_html = admin_instance.cohort_management_actions(self.application)
        self.assertIn("Current Cohort:", str(actions_html))
        
        progress = admin_instance.journey_progress(self.application)
        self.assertIn("stages", str(progress))
        
        blockers = admin_instance.journey_blockers(self.application)
        self.assertTrue(len(str(blockers)) > 0)

        marks = admin_instance.screening_marks(self.application)
        self.assertTrue(len(str(marks)) > 0)

        interview = admin_instance.interview_result(self.application)
        self.assertTrue(len(str(interview)) > 0)

        role = admin_instance.student_role_verification(self.application)
        self.assertTrue(len(str(role)) > 0)


class ApplicationDropoutGuardrailTests(TestCase):
    def setUp(self):
        from accounts.models import User
        from courses.models import Course
        from cohorts.models import Cohort
        from students.models import StudentProfile
        from applications.models import Application, PreScreening, PreScreeningInterview

        self.admin = User.objects.create_superuser(email="admin_drop@example.com", password="test-pass")
        self.student_user = User.objects.create_user(
            email="drop_student@example.com", password="test-pass", role=User.Role.STUDENT
        )
        self.student = StudentProfile.objects.get(user=self.student_user)
        self.course = Course.objects.create(
            code="DROP-101",
            name="Dropout Guardrail Course",
            category=Course.Category.NON_MEDICAL,
            domain="Engineering",
            description="Testing dropout guardrails",
            status=Course.Status.PUBLISHED,
            default_screening_at=timezone.now() + timedelta(days=5),
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            course=self.course,
            code="DROP-COHORT",
            name="Dropout Test Cohort",
            status=Cohort.Status.OPEN,
            start_date="2026-09-01",
            end_date="2026-12-01",
            default_screening_at=timezone.now() + timedelta(days=3),
        )
        self.application = Application.objects.create(
            application_number="APP-DROP-001",
            student=self.student,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.APPLIED,
        )

    def test_dropout_cancels_scheduled_prescreening_and_interview_and_notifies(self):
        from applications.models import PreScreening, PreScreeningInterview
        from applications.services.state_machine import transition_application_status
        from common.models import Notification

        # Create scheduled prescreening and interview
        ps = PreScreening.objects.create(
            application=self.application,
            status=PreScreening.Status.SCHEDULED,
            scheduled_at=timezone.now() + timedelta(days=2),
            is_released=True,
        )
        psi = PreScreeningInterview.objects.create(
            application=self.application,
            status=PreScreeningInterview.Status.SCHEDULED,
            scheduled_at=timezone.now() + timedelta(days=4),
        )

        # Transition application to DROPPED
        transition_application_status(
            self.application,
            Application.Status.DROPPED,
            user=self.admin,
            reason="Student dropped out without cohort start",
        )

        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.DROPPED)

        ps.refresh_from_db()
        self.assertEqual(ps.status, PreScreening.Status.CANCELLED)
        self.assertFalse(ps.is_released)
        self.assertIn("application dropped", ps.remarks.lower())

        psi.refresh_from_db()
        self.assertEqual(psi.status, PreScreeningInterview.Status.CANCELLED)

        # Check notification sent to student
        notif = Notification.objects.filter(
            user=self.student_user,
            title__icontains="Dropped",
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("Dropout Guardrail Course", notif.message)
        self.assertIn("cancelled", notif.message.lower())

    def test_create_course_default_screening_schedule_ignores_dropped_app(self):
        from applications.services.screening_schedule_service import create_course_default_screening_schedule
        from applications.models import PreScreening

        self.application.status = Application.Status.DROPPED
        self.application.save(update_fields=["status"])

        result = create_course_default_screening_schedule(self.application)
        self.assertIsNone(result)
        self.assertFalse(PreScreening.objects.filter(application=self.application).exists())

    def test_bulk_schedule_applications_excludes_dropped_candidates(self):
        from applications.services.screening_schedule_service import bulk_schedule_applications
        from applications.models import PreScreening

        app2 = Application.objects.create(
            application_number="APP-DROP-002",
            student=self.student,
            course=self.course,
            status=Application.Status.DROPPED,
        )

        sched_time = timezone.now() + timedelta(days=2)
        result = bulk_schedule_applications(
            [self.application, app2],
            scheduled_at=sched_time,
            notify_candidates=False,
        )

        self.assertEqual(result["scheduled"], 1)
        self.assertTrue(PreScreening.objects.filter(application=self.application).exists())
        self.assertFalse(PreScreening.objects.filter(application=app2).exists())

    def test_prescreening_admin_get_queryset_excludes_dropped(self):
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory
        from applications.admin import PreScreeningAdmin
        from applications.models import PreScreening

        ps = PreScreening.objects.create(
            application=self.application,
            status=PreScreening.Status.SCHEDULED,
            scheduled_at=timezone.now() + timedelta(days=2),
        )

        site = AdminSite()
        admin_instance = PreScreeningAdmin(PreScreening, site)
        rf = RequestFactory()

        # When application is APPLIED, queryset includes it
        req = rf.get("/admin/applications/prescreening/")
        qs = admin_instance.get_queryset(req)
        self.assertIn(ps, qs)

        # When application is DROPPED, default queryset excludes it
        self.application.status = Application.Status.DROPPED
        self.application.save(update_fields=["status"])

        qs_dropped = admin_instance.get_queryset(req)
        self.assertNotIn(ps, qs_dropped)


class EligibilityAndSafeguardTests(TestCase):
    def setUp(self):
        from decimal import Decimal
        from rest_framework.test import APIClient
        from applications.models import PreScreening
        self.client = APIClient()

        self.user1 = User.objects.create_user(
            email="student_eligible1@gmail.com",
            password="Password123!",
            role="STUDENT",
            first_name="Eligible",
            last_name="One",
        )
        self.student1 = StudentProfile.objects.get(user=self.user1)

        self.user2 = User.objects.create_user(
            email="student_eligible2@gmail.com",
            password="Password123!",
            role="STUDENT",
            first_name="Eligible",
            last_name="Two",
        )
        self.student2 = StudentProfile.objects.get(user=self.user2)

        self.course_a = Course.objects.create(
            name="Data Science Master",
            code="DSM-101",
            category="AI",
            domain="Data",
            difficulty="BEGINNER",
            status=Course.Status.PUBLISHED,
        )
        self.cohort_a = Cohort.objects.create(
            code="DSM-2026-C1",
            name="DSM Batch 1",
            course=self.course_a,
            status=Cohort.Status.OPEN,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
        )

        self.course_b = Course.objects.create(
            name="Cloud Engineering Pro",
            code="CEP-102",
            category="Cloud",
            domain="DevOps",
            difficulty="INTERMEDIATE",
            status=Course.Status.PUBLISHED,
        )
        self.cohort_b = Cohort.objects.create(
            code="CEP-2026-C1",
            name="CEP Batch 1",
            course=self.course_b,
            status=Cohort.Status.OPEN,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
        )

        self.cohort_draft = Cohort.objects.create(
            code="CEP-DRAFT",
            name="CEP Draft Batch",
            course=self.course_b,
            status=Cohort.Status.DRAFT,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
        )
        self.cohort_training = Cohort.objects.create(
            code="CEP-TRAIN",
            name="CEP Training Batch",
            course=self.course_b,
            status=Cohort.Status.TRAINING,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
        )

    def test_cannot_reapply_to_completed_course(self):
        from decimal import Decimal
        # Create a completed application for student1 on course_a with full completion fields
        Application.objects.create(
            application_number="APP-COMP-001",
            student=self.student1,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.COMPLETED,
            completed_course=True,
            completed_at=timezone.now(),
            final_score=Decimal("85.00"),
        )

        # Attempting to re-apply for course_a must be blocked
        from applications.services.application_service import ApplicationService
        can_apply, msg, code = ApplicationService.can_student_apply(self.student1, self.course_a)
        self.assertFalse(can_apply)
        self.assertEqual(code, "COURSE_ALREADY_COMPLETED")
        self.assertEqual(msg, "You have already successfully completed this course and cannot re-apply.")

        # API check
        self.client.force_authenticate(user=self.user1)
        resp = self.client.post("/api/applications/", {
            "course": str(self.course_a.id),
            "assigned_cohort": str(self.cohort_a.id),
        })
        self.assertEqual(resp.status_code, 409)
        self.assertIn("You have already successfully completed this course and cannot re-apply.", resp.data.get("message", ""))

    def test_active_cohort_student_cannot_apply_to_another_course_or_cohort(self):
        # Student1 is enrolled in an active cohort for course_a
        Application.objects.create(
            application_number="APP-ENR-001",
            student=self.student1,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.COHORT_ASSIGNED,
        )

        # Attempting to apply for course_b must be blocked
        from applications.services.application_service import ApplicationService
        can_apply, msg, code = ApplicationService.can_student_apply(self.student1, self.course_b, self.cohort_b)
        self.assertFalse(can_apply)
        self.assertEqual(code, "ACTIVE_COHORT_RESTRICTION")
        self.assertEqual(
            msg,
            "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one.",
        )

        # API check
        self.client.force_authenticate(user=self.user1)
        resp = self.client.post("/api/applications/", {
            "course": str(self.course_b.id),
            "assigned_cohort": str(self.cohort_b.id),
        })
        self.assertEqual(resp.status_code, 409)
        self.assertIn(
            "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one.",
            resp.data.get("message", ""),
        )

    def test_active_cohort_conflict_in_exam_gatekeeper(self):
        from exams.views import active_cohort_conflict

        # App 1: Student1 in active cohort for course_a
        Application.objects.create(
            application_number="APP-ACT-001",
            student=self.student1,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.IN_PROGRESS,
        )

        # App 2: An older or other course application
        app_old = Application.objects.create(
            application_number="APP-OLD-001",
            student=self.student1,
            course=self.course_b,
            status=Application.Status.EXAM_PENDING,
        )

        conflict = active_cohort_conflict(app_old)
        self.assertIsNotNone(conflict)
        self.assertEqual(conflict["code"], "ACTIVE_COHORT_JOURNEY")
        self.assertEqual(
            conflict["message"],
            "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one.",
        )

    def test_course_cancellation_signal_cascades_to_cohorts_and_applications(self):
        app_open = Application.objects.create(
            application_number="APP-CASCADE-001",
            student=self.student2,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.APPLIED,
        )

        # Cancelling course_a triggers signal
        self.course_a.status = Course.Status.CANCELLED
        self.course_a.save()

        # Linked cohort must be updated to CANCELLED
        self.cohort_a.refresh_from_db()
        self.assertEqual(self.cohort_a.status, Cohort.Status.CANCELLED)

        # Linked open application must be transitioned to CANCELLED
        app_open.refresh_from_db()
        self.assertEqual(app_open.status, Application.Status.CANCELLED)

    def test_missed_prescreening_exam_auto_disqualifies_and_notifies(self):
        from applications.models import PreScreening
        from applications.services.workflow_service import mark_missed_prescreening_exams
        from common.models import Notification

        app = Application.objects.create(
            application_number="APP-MISS-001",
            student=self.student2,
            course=self.course_b,
            assigned_cohort=self.cohort_b,
            status=Application.Status.EXAM_PENDING,
        )

        # Create pre-screening whose end_time elapsed in the past
        past_start = timezone.now() - timedelta(hours=3)
        past_end = timezone.now() - timedelta(hours=1)
        ps = PreScreening.objects.create(
            application=app,
            status=PreScreening.Status.SCHEDULED,
            scheduled_at=past_start,
            end_time=past_end,
            is_released=True,
        )

        # Run scanner
        processed = mark_missed_prescreening_exams()
        self.assertGreaterEqual(processed, 1)

        ps.refresh_from_db()
        app.refresh_from_db()

        self.assertEqual(ps.status, PreScreening.Status.FAILED)
        self.assertFalse(ps.is_released)
        self.assertFalse(app.qualified)
        self.assertEqual(app.status, Application.Status.REJECTED)

        # Notification check
        notif = Notification.objects.filter(user=self.user2, title__icontains="Missed").first()
        self.assertIsNotNone(notif)
        self.assertIn("Not Qualified", notif.message)

    def test_bulk_schedule_cohort_view_excludes_draft_cohorts(self):
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory
        from applications.admin import PreScreeningAdmin
        from applications.models import PreScreening

        staff_user = User.objects.create_superuser(
            email="admin_sched@suretrust.org",
            password="Password123!",
            role="ADMIN",
        )
        site = AdminSite()
        admin_instance = PreScreeningAdmin(PreScreening, site)
        rf = RequestFactory()
        req = rf.get("/admin/applications/prescreening/bulk-schedule-cohort/")
        req.user = staff_user

        resp = admin_instance.bulk_schedule_cohort_view(req)
        cohorts_in_context = resp.context_data["cohorts"]

        self.assertIn(self.cohort_a, cohorts_in_context)
        self.assertIn(self.cohort_b, cohorts_in_context)
        self.assertNotIn(self.cohort_draft, cohorts_in_context)
        self.assertNotIn(self.cohort_training, cohorts_in_context)

    def test_application_course_banks_api_returns_course_and_banks(self):
        import json
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory
        from applications.admin import PreScreeningAdmin
        from applications.models import PreScreening
        from question_bank.models import QuestionBank

        bank = QuestionBank.objects.create(
            title="Course A Screening Bank",
            course=self.course_a,
            bank_type=QuestionBank.BankType.PRESCREENING,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={"A": {}, "B": {}, "C": {}},
            total_questions_per_set=10,
        )

        app = Application.objects.create(
            application_number="APP-API-TEST-001",
            student=self.student1,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.APPLIED,
        )

        staff_user = User.objects.create_superuser(
            email="admin_api@suretrust.org",
            password="Password123!",
            role="ADMIN",
        )
        site = AdminSite()
        admin_instance = PreScreeningAdmin(PreScreening, site)
        rf = RequestFactory()
        req = rf.get(f"/admin/applications/prescreening/application-course-banks/?application_id={app.id}")
        req.user = staff_user

        resp = admin_instance.application_course_banks_api(req)
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.content)
        self.assertTrue(data["success"])
        self.assertEqual(data["course"]["id"], str(self.course_a.id))
        self.assertEqual(data["cohort"]["id"], str(self.cohort_a.id))
        self.assertEqual(len(data["banks"]), 1)
        self.assertEqual(data["banks"][0]["id"], str(bank.id))
        self.assertEqual(data["banks"][0]["set_codes"], ["A", "B", "C"])

    def test_prescreening_admin_form_unbound_and_bound_validation(self):
        from applications.admin import PreScreeningAdminForm
        from applications.models import PreScreening
        from question_bank.models import QuestionBank

        bank = QuestionBank.objects.create(
            title="Course B Screening Bank",
            course=self.course_b,
            bank_type=QuestionBank.BankType.PRESCREENING,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={"A": {}, "B": {}},
            total_questions_per_set=15,
        )

        app = Application.objects.create(
            application_number="APP-FORM-TEST-002",
            student=self.student2,
            course=self.course_b,
            status=Application.Status.APPLIED,
        )

        # Unbound form (as loaded on /add/)
        form_unbound = PreScreeningAdminForm()
        self.assertIn(bank, form_unbound.fields["question_bank"].queryset)

        # Bound form with application and bank
        start = timezone.now() + timedelta(days=1)
        end = start + timedelta(hours=2)
        form_bound = PreScreeningAdminForm(data={
            "application": str(app.id),
            "question_bank": str(bank.id),
            "paper_set": "B",
            "status": PreScreening.Status.SCHEDULED,
            "scheduled_at": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end_time": end.strftime("%Y-%m-%d %H:%M:%S"),
            "is_released": False,
        })
        self.assertTrue(form_bound.is_valid(), form_bound.errors)

    def test_bulk_schedule_count_api_filters_statuses_and_cohort(self):
        import json
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory
        from applications.admin import PreScreeningAdmin
        from applications.models import PreScreening

        # Create an unassigned application for course_a (typical student self-application)
        app_unassigned = Application.objects.create(
            application_number="APP-COUNT-001",
            student=self.student1,
            course=self.course_a,
            assigned_cohort=None,
            status=Application.Status.APPLIED,
        )

        # Create an exam pending application for course_a
        app_pending = Application.objects.create(
            application_number="APP-COUNT-002",
            student=self.student2,
            course=self.course_a,
            assigned_cohort=self.cohort_a,
            status=Application.Status.EXAM_PENDING,
        )

        staff_user = User.objects.create_superuser(
            email="admin_count_test@suretrust.org",
            password="Password123!",
            role="ADMIN",
        )
        admin_instance = PreScreeningAdmin(PreScreening, AdminSite())
        rf = RequestFactory()

        # 1. Query with APPLIED status for cohort_a
        req1 = rf.get(f"/admin/applications/prescreening/bulk-schedule-count/?cohort_id={self.cohort_a.id}&statuses=APPLIED")
        req1.user = staff_user
        resp1 = admin_instance.bulk_schedule_count_api(req1)
        data1 = json.loads(resp1.content.decode("utf-8"))
        self.assertEqual(data1["count"], 1)

        # 2. Query with EXAM_PENDING status for cohort_a
        req2 = rf.get(f"/admin/applications/prescreening/bulk-schedule-count/?cohort_id={self.cohort_a.id}&statuses=EXAM_PENDING")
        req2.user = staff_user
        resp2 = admin_instance.bulk_schedule_count_api(req2)
        data2 = json.loads(resp2.content.decode("utf-8"))
        self.assertEqual(data2["count"], 1)

        # 3. Query with both APPLIED and EXAM_PENDING
        req3 = rf.get(f"/admin/applications/prescreening/bulk-schedule-count/?cohort_id={self.cohort_a.id}&statuses=APPLIED,EXAM_PENDING")
        req3.user = staff_user
        resp3 = admin_instance.bulk_schedule_count_api(req3)
        data3 = json.loads(resp3.content.decode("utf-8"))
        self.assertEqual(data3["count"], 2)




