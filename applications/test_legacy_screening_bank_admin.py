from unittest.mock import patch

from django.contrib import admin
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory, TestCase

from accounts.models import User
from applications.admin import PreScreeningAdminForm
from applications.models import Application, PreScreening
from courses.models import Course
from question_bank.models import QuestionBank


class LegacyScreeningBankAdminTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email="legacy-screening-admin@example.com",
            password="test-pass",
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.student_user = User.objects.create_user(
            email="legacy-screening-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
        )
        self.student = self.student_user.student_profile
        self.student.student_code = "LEGACY-QB-001"
        self.student.save(update_fields=["student_code", "updated_at"])
        self.course = Course.objects.create(
            code="LEGACY-QB",
            name="Legacy Screening Course",
            domain="Technology",
            description="Legacy applicant bank preparation test",
            course_prerequisites=["Programming fundamentals"],
            created_by=self.admin_user,
        )
        self.application = Application.objects.create(
            application_number="APP-LEGACY-QB-001",
            student=self.student,
            course=self.course,
            status=Application.Status.APPLIED,
        )

    def _request(self, method="get"):
        request = getattr(RequestFactory(), method)(
            f"/secure-admin/applications/application/{self.application.pk}/change/"
        )
        request.user = self.admin_user
        request.user.is_verified = lambda: True
        request.session = {}
        request._messages = FallbackStorage(request)
        return request

    def test_legacy_application_page_shows_prepare_button_and_schedule_inline(self):
        response = admin.site._registry[Application].change_view(
            self._request(), str(self.application.pk)
        )
        response.render()
        content = response.content.decode("utf-8")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Prepare/reuse AI screening bank", content)
        self.assertIn("pre_screening-TOTAL_FORMS", content)
        self.assertIn('value="1"', content)

    @patch("question_bank.auto_generate.auto_generate_prescreening_bank")
    def test_prepare_button_starts_generation_without_premature_schedule(self, mock_prepare):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Legacy generated bank",
            is_ai_generated=True,
            status=QuestionBank.Status.GENERATING,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
        )
        mock_prepare.return_value = bank

        response = admin.site._registry[Application].prepare_screening_bank_view(
            self._request("post"), str(self.application.pk)
        )

        self.assertEqual(response.status_code, 302)
        mock_prepare.assert_called_once_with(self.course.pk)
        self.assertFalse(PreScreening.objects.filter(application=self.application).exists())

    def test_schedule_form_auto_selects_only_published_course_bank(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Published screening papers",
            total_questions_per_set=1,
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [{
                        "id": "legacy-a-1",
                        "question": "Which value is a valid integer?",
                        "options": ["1", "one", "first", "single"],
                        "correct": "1",
                        "marks": 1,
                    }],
                }
            },
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        )
        form = PreScreeningAdminForm(instance=PreScreening(application=self.application))

        self.assertEqual(form.fields["question_bank"].initial, bank.pk)
        self.assertEqual(form.fields["paper_set"].initial, "A")

    @patch("applications.signals.auto_generate_prescreening_bank")
    def test_creation_signal_only_generates_for_unscreened_applicant(self, mock_prepare):
        second_user = User.objects.create_user(
            email="new-screening-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
        )
        with self.captureOnCommitCallbacks(execute=True):
            Application.objects.create(
                application_number="APP-NEW-QB-002",
                student=second_user.student_profile,
                course=self.course,
                status=Application.Status.APPLIED,
            )

        mock_prepare.assert_called_once_with(self.course.pk)
