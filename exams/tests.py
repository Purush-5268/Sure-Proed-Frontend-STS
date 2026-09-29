import hashlib
import hmac
import json
import time
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application
from common.models import Notification
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.models import Exam, ExternalExamAttempt, InternalExamAttempt, ModuleTest, ModuleTestSubmission
from question_bank.models import QuestionBank


class AdminExamManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(email="exam-admin@test.com", password="pwd", role="ADMIN")
        self.student_user = User.objects.create_user(email="reset-student@test.com", password="pwd", role="STUDENT")
        self.student = self.student_user.student_profile
        self.course = Course.objects.create(code="RESET", name="Reset Course", created_by=self.admin)
        self.application = Application.objects.create(
            student=self.student,
            course=self.course,
            status=Application.Status.REJECTED,
            qualified=False,
            qualification_score=20,
        )
        self.exam = Exam.objects.create(
            application=self.application,
            status=Exam.Status.EVALUATED,
            marks_obtained=2,
            percentage=20,
            qualified=False,
        )
        self.client.force_authenticate(self.admin)

    def test_exam_list_exposes_course_and_cohort_category_metadata(self):
        response = self.client.get(f"/api/exams/?course={self.course.id}&cohort=unassigned")
        self.assertEqual(response.status_code, 200)
        row = response.data[0] if isinstance(response.data, list) else response.data["results"][0]
        self.assertEqual(str(row["course_id"]), str(self.course.id))
        self.assertIsNone(row["cohort_id"])
        self.assertEqual(row["application_status"], Application.Status.REJECTED)

    def test_admin_can_reset_non_enrolled_exam_with_audited_state_repair(self):
        InternalExamAttempt.objects.create(
            student=self.student,
            exam=self.exam,
            expires_at=timezone.now() - timedelta(minutes=1),
            status=InternalExamAttempt.Status.SUBMITTED,
        )
        response = self.client.post(f"/api/exams/{self.exam.id}/reset/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.exam.refresh_from_db()
        self.application.refresh_from_db()
        self.assertEqual(self.exam.status, Exam.Status.PENDING)
        self.assertIsNone(self.exam.qualified)
        self.assertEqual(self.application.status, Application.Status.EXAM_PENDING)
        self.assertIsNone(self.application.qualified)
        self.assertFalse(InternalExamAttempt.objects.filter(exam=self.exam).exists())

    def test_admin_can_configure_and_view_cohort_module_test_rooms(self):
        cohort = Cohort.objects.create(
            code="RESET-C1", name="Reset Cohort", course=self.course,
            created_by=self.admin, start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=90),
        )
        module = CourseModule.objects.create(
            course=self.course, module_number=1, order=1, title="Module One",
            topics=["Topic One"],
        )
        module_test = ModuleTest.objects.create(
            title="Module One Test", course=self.course, cohort=cohort,
            module=module, proctoring_enabled=False,
        )
        bank = QuestionBank.objects.create(
            title="Module One Bank", bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course, cohort=cohort, module=module,
            module_test=module_test, status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN, is_active=True,
            sets_data={"A": {"label": "Paper A", "questions": []}},
        )
        module_test.question_bank = bank
        module_test.save(update_fields=["question_bank", "updated_at"])

        configure = self.client.post(
            f"/api/module-tests/{module_test.id}/configure-proctoring/",
            {
                "proctoring_enabled": True,
                "proctoring_required": True,
                "proctoring_room_count": 2,
                "proctoring_capacity_per_room": 25,
            },
            format="json",
        )
        self.assertEqual(configure.status_code, 200)
        rooms = self.client.get(f"/api/module-tests/{module_test.id}/proctoring-rooms/")
        self.assertEqual(rooms.status_code, 200)
        self.assertEqual(rooms.data["cohort_code"], cohort.code)
        self.assertEqual(len(rooms.data["rooms"]), 2)


@override_settings(
    EXAM_PLATFORM_URL="https://exam.suretrust.test/start",
    EXAM_PLATFORM_SHARED_SECRET="test-exam-platform-shared-secret",
    EXAM_LAUNCH_TOKEN_TTL_SECONDS=300,
    EXAM_RESULT_MAX_CLOCK_SKEW_SECONDS=300,
    ALLOW_INTERNAL_EXAM_SUBMISSION=False,
)
class ExternalExamIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="exam-admin@example.com",
            password="test-pass",
        )
        self.student_user = User.objects.create_user(
            email="exam-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
            first_name="Exam",
            last_name="Student",
        )
        self.course = Course.objects.create(
            code="EXT-EXAM-101",
            name="External Examination Course",
            domain="Technology",
            description="External result integration test",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        self.application = Application.objects.create(
            application_number="APP-EXT-EXAM-001",
            student=self.student_user.student_profile,
            course=self.course,
            status=Application.Status.EXAM_PENDING,
            qualified=None,
        )
        self.exam = Exam.objects.create(
            application=self.application,
            duration_minutes=45,
            pass_percentage=Decimal("60.00"),
            status=Exam.Status.PENDING,
        )

    def _launch_and_start(self):
        self.client.force_authenticate(self.student_user)
        launched = self.client.post(
            "/api/exams/external-launch/",
            {"application_id": str(self.application.id)},
            format="json",
        )
        self.assertEqual(launched.status_code, 200, launched.data)
        self.assertIn("ticket=", launched.data["launch_url"])

        self.client.force_authenticate(user=None)
        started = self.client.post(
            "/api/exams/external-session/",
            {"launch_ticket": launched.data["launch_ticket"]},
            format="json",
        )
        self.assertEqual(started.status_code, 200, started.data)
        self.assertNotIn("questions", started.data)
        self.assertNotIn("answers", started.data)
        return started.data

    @staticmethod
    def _signed_headers(body, event_id="result-event-001"):
        timestamp = str(int(time.time()))
        signature = hmac.new(
            b"test-exam-platform-shared-secret",
            f"{timestamp}.".encode("utf-8") + body,
            hashlib.sha256,
        ).hexdigest()
        return {
            "HTTP_X_EXAM_TIMESTAMP": timestamp,
            "HTTP_X_EXAM_SIGNATURE": signature,
            "HTTP_X_EXAM_EVENT_ID": event_id,
        }

    def test_external_platform_returns_marks_only_and_backend_publishes_result(self):
        session = self._launch_and_start()
        payload = {
            "attempt_id": session["attempt_id"],
            "application_id": session["application_id"],
            "exam_id": session["exam_id"],
            "marks_obtained": "45.00",
            "total_marks": "50.00",
            "submitted_at": timezone.now().isoformat(),
            "integrity_status": "PASSED",
            "proctoring_summary": {"tab_switches": 0},
        }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = self._signed_headers(body)

        published = self.client.post(
            "/api/exams/external-result/",
            data=body,
            content_type="application/json",
            **headers,
        )

        self.assertEqual(published.status_code, 200, published.data)
        self.assertEqual(Decimal(str(published.data["percentage"])), Decimal("90.00"))
        self.assertTrue(published.data["qualified"])
        self.exam.refresh_from_db()
        self.application.refresh_from_db()
        attempt = ExternalExamAttempt.objects.get(exam=self.exam)
        self.assertEqual(self.exam.status, Exam.Status.EVALUATED)
        self.assertEqual(self.application.status, Application.Status.QUALIFIED)
        self.assertEqual(attempt.status, ExternalExamAttempt.Status.RESULT_RECEIVED)
        self.assertTrue(
            Notification.objects.filter(
                user=self.student_user,
                title="Pre-screen exam result published",
            ).exists()
        )

        duplicate = self.client.post(
            "/api/exams/external-result/",
            data=body,
            content_type="application/json",
            **headers,
        )
        self.assertEqual(duplicate.status_code, 200, duplicate.data)
        self.assertEqual(
            Notification.objects.filter(
                user=self.student_user,
                title="Pre-screen exam result published",
            ).count(),
            1,
        )

    def test_external_result_rejects_invalid_server_signature(self):
        session = self._launch_and_start()
        payload = {
            "attempt_id": session["attempt_id"],
            "application_id": session["application_id"],
            "exam_id": session["exam_id"],
            "marks_obtained": "30.00",
            "total_marks": "50.00",
        }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        response = self.client.post(
            "/api/exams/external-result/",
            data=body,
            content_type="application/json",
            HTTP_X_EXAM_TIMESTAMP=str(int(time.time())),
            HTTP_X_EXAM_SIGNATURE="invalid",
            HTTP_X_EXAM_EVENT_ID="invalid-result-event",
        )

        self.assertEqual(response.status_code, 403)
        self.exam.refresh_from_db()
        self.assertNotEqual(self.exam.status, Exam.Status.EVALUATED)

    def test_legacy_answer_submission_is_disabled_by_default(self):
        self.client.force_authenticate(self.student_user)

        response = self.client.post(
            f"/api/exams/{self.exam.id}/submit/",
            {"answers": {"question-id": "A"}},
            format="json",
        )

        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.data["code"], "EXTERNAL_EXAM_PLATFORM_REQUIRED")


class ModuleTestAutoSuspensionTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="mod-admin@example.com",
            password="test-pass",
        )
        self.student_user = User.objects.create_user(
            email="mod-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
            first_name="Mod",
            last_name="Student",
        )
        self.course = Course.objects.create(
            code="MOD-101",
            name="Module Test Course",
            domain="Tech",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        from cohorts.models import Cohort
        self.cohort = Cohort.objects.create(
            code="MOD-COHORT-1",
            name="Mod Cohort 1",
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date(),
            created_by=self.admin,
            status=Cohort.Status.ACTIVE,
        )
        self.application = Application.objects.create(
            application_number="APP-MOD-001",
            student=self.student_user.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True,
        )
        from exams.models import ModuleTest
        self.module_test = ModuleTest.objects.create(
            title="Module 1 Test",
            course=self.course,
            pass_percentage=Decimal("60.00"),
        )
        self.client = APIClient()

    def test_failed_module_test_auto_suspends_cohort(self):
        from exams.models import ModuleTestSubmission
        submission = ModuleTestSubmission.objects.create(
            test=self.module_test,
            student=self.student_user.student_profile,
            marks_obtained=Decimal("40.00"),
            total_marks=Decimal("100.00"),
        )
        self.application.refresh_from_db()
        self.assertEqual(submission.percentage, Decimal("40.00"))
        self.assertFalse(submission.qualified)
        self.assertEqual(self.application.status, Application.Status.SUSPENDED)
        self.assertIn("Auto-Suspended", self.application.remarks)

    def test_passed_module_test_does_not_suspend_cohort(self):
        from exams.models import ModuleTestSubmission
        submission = ModuleTestSubmission.objects.create(
            test=self.module_test,
            student=self.student_user.student_profile,
            marks_obtained=Decimal("80.00"),
            total_marks=Decimal("100.00"),
        )
        self.application.refresh_from_db()
        self.assertEqual(submission.percentage, Decimal("80.00"))
        self.assertTrue(submission.qualified)
        self.assertEqual(self.application.status, Application.Status.COHORT_ASSIGNED)

    @override_settings(
        EXAM_PLATFORM_SHARED_SECRET="test-exam-platform-shared-secret",
        EXAM_RESULT_MAX_CLOCK_SKEW_SECONDS=300,
    )
    def test_external_module_platform_returns_marks_by_student_and_cohort(self):
        payload = {
            "module_test_id": str(self.module_test.id),
            "student_id": self.student_user.student_profile.student_code,
            "cohort_id": self.cohort.code,
            "marks_obtained": "80.00",
            "total_marks": "100.00",
            "integrity_status": "PASSED",
        }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        timestamp = str(int(time.time()))
        signature = hmac.new(
            b"test-exam-platform-shared-secret",
            f"{timestamp}.".encode("utf-8") + body,
            hashlib.sha256,
        ).hexdigest()
        headers = {
            "HTTP_X_EXAM_TIMESTAMP": timestamp,
            "HTTP_X_EXAM_SIGNATURE": signature,
            "HTTP_X_EXAM_EVENT_ID": "module-result-event-001",
        }

        response = self.client.post(
            "/api/module-tests/external-result/",
            data=body,
            content_type="application/json",
            **headers,
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(str(response.data["percentage"])), Decimal("80.00"))
        self.assertTrue(response.data["qualified"])
        submission = ModuleTestSubmission.objects.get(test=self.module_test)
        self.assertEqual(submission.result_source, ModuleTestSubmission.ResultSource.EXTERNAL)
        self.assertEqual(submission.cohort, self.cohort)
        self.assertFalse(submission.answers)

        duplicate = self.client.post(
            "/api/module-tests/external-result/",
            data=body,
            content_type="application/json",
            **headers,
        )
        self.assertEqual(duplicate.status_code, 200, duplicate.data)
