import json
from unittest.mock import patch

from django.contrib import admin
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory, TestCase

from accounts.models import User
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from question_bank.admin import QuestionBankAdminForm
from question_bank.models import QuestionBank


class QuestionBankAdminFormTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email="manual-bank-admin@example.com",
            password="test-pass",
            role=User.Role.ADMIN,
        )
        self.admin_user.is_staff = True
        self.admin_user.is_superuser = True
        self.admin_user.save(update_fields=["is_staff", "is_superuser"])
        self.course = Course.objects.create(
            code="MANUAL-QB",
            name="Manual Question Bank",
            domain="Technology",
            description="Manual question bank admin tests",
            course_prerequisites=["Arithmetic"],
            created_by=self.admin_user,
        )
        self.cohort = Cohort.objects.create(
            course=self.course,
            code="MANUAL-QB-C1",
            name="Manual Bank Cohort",
            status=Cohort.Status.TRAINING,
            start_date="2026-08-01",
            end_date="2026-11-01",
        )
        self.module = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            order=1,
            title="Logic Fundamentals",
            topics=["Boolean algebra"],
        )

    def form_data(self, **overrides):
        data = {
            "bank_type": QuestionBank.BankType.PRESCREENING,
            "course": str(self.course.pk),
            "cohort": "",
            "module": "",
            "exam": "",
            "module_test": "",
            "title": "Human-authored prerequisite papers",
            "description": "",
            "difficulty": QuestionBank.Difficulty.EASY,
            "source_topics": "[]",
            "sets_data": "{}",
            "total_questions_per_set": "1",
            "status": QuestionBank.Status.APPROVED,
            "lifecycle_status": QuestionBank.LifecycleStatus.DRAFT,
            "error_message": "",
            "is_active": "on",
            "created_by": str(self.admin_user.pk),
            "manual_set_a": json.dumps(
                [{
                    "question": "What is two plus two?",
                    "options": ["3", "4", "5", "6"],
                    "correct": "B",
                }]
            ),
            "manual_set_b": "",
            "manual_set_c": "",
            "manual_set_d": "",
        }
        data.update(overrides)
        return data

    def test_manual_inputs_build_canonical_paper_set_json(self):
        form = QuestionBankAdminForm(data=self.form_data())

        self.assertTrue(form.is_valid(), form.errors)
        paper = form.cleaned_data["sets_data"]["A"]
        self.assertEqual(paper["label"], "Paper A")
        self.assertEqual(paper["questions"][0]["id"], "A-1")
        self.assertEqual(paper["questions"][0]["correct"], "4")
        self.assertEqual(paper["questions"][0]["marks"], 1)

    def test_manual_mode_requires_at_least_one_paper(self):
        form = QuestionBankAdminForm(
            data=self.form_data(manual_set_a="")
        )

        self.assertFalse(form.is_valid())
        self.assertIn("manual_set_a", form.errors)

    def test_manual_mode_rejects_same_question_in_two_papers(self):
        paper_b = json.dumps(
            [{
                "question": "What is two plus two?",
                "options": ["3", "4", "5", "6"],
                "correct": "B",
            }]
        )
        form = QuestionBankAdminForm(
            data=self.form_data(manual_set_b=paper_b)
        )

        self.assertFalse(form.is_valid())
        self.assertIn("manual_set_b", form.errors)
        self.assertIn("duplicates Paper A", str(form.errors["manual_set_b"]))

    def test_admin_add_page_renders_manual_paper_controls(self):
        request = RequestFactory().get(
            "/secure-admin/question_bank/questionbank/add/"
        )
        request.user = self.admin_user
        request.user.is_verified = lambda: True
        model_admin = admin.site._registry[QuestionBank]

        response = model_admin.add_view(request)
        response.render()
        content = response.content.decode("utf-8")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Paper A questions", content)
        self.assertIn("Paper D questions", content)
        self.assertIn("Create question templates", content)
        self.assertIn("Manual mode: enter Paper A", content)
        self.assertIn("AI paper sets", content)
        self.assertIn("Save and generate AI papers once", content)

    def test_ai_button_enables_ai_mode_without_manual_questions(self):
        form = QuestionBankAdminForm(
            data=self.form_data(
                is_ai_generated="",
                manual_set_a="",
                _generate_ai="Save and generate AI papers once",
                ai_num_sets="4",
            )
        )

        self.assertTrue(form.is_valid(), form.errors)
        self.assertTrue(form.cleaned_data["is_ai_generated"])

    def test_ai_button_rejects_duplicate_exact_module_scope(self):
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Existing module papers",
            is_ai_generated=True,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
        )
        form = QuestionBankAdminForm(
            data=self.form_data(
                bank_type=QuestionBank.BankType.MODULE_TEST,
                cohort=str(self.cohort.pk),
                module=str(self.module.pk),
                title="Duplicate module papers",
                is_ai_generated="on",
                manual_set_a="",
                _generate_ai="Save and generate AI papers once",
                ai_num_sets="4",
            )
        )

        self.assertFalse(form.is_valid())
        self.assertIn("bank_type", form.errors)
        self.assertIn("exact course/cohort/module scope", str(form.errors["bank_type"]))

    def test_admin_change_page_previews_stored_questions_and_ai_verdict(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Verified AI paper",
            is_ai_generated=True,
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [{
                        "id": "A-1",
                        "question": "Which number is the sum of two and two?",
                        "options": ["3", "4", "5", "6"],
                        "correct": "4",
                        "verifier_result": "MATCH",
                        "confidence": 0.99,
                    }],
                }
            },
            created_by=self.admin_user,
        )
        request = RequestFactory().get(
            f"/secure-admin/question_bank/questionbank/{bank.pk}/change/"
        )
        request.user = self.admin_user
        request.user.is_verified = lambda: True

        response = admin.site._registry[QuestionBank].change_view(request, str(bank.pk))
        response.render()
        content = response.content.decode("utf-8")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Stored Examination Papers", content)
        self.assertIn("Which number is the sum of two and two?", content)
        self.assertIn("MATCH", content)
        self.assertIn("Save and generate AI papers once", content)

    def test_admin_failed_bank_page_offers_safe_cleanup_action(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Failed AI generation",
            status=QuestionBank.Status.FAILED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            error_message="AI request failed with HTTPError",
            created_by=self.admin_user,
        )
        request = RequestFactory().get(
            f"/secure-admin/question_bank/questionbank/{bank.pk}/change/"
        )
        request.user = self.admin_user
        request.user.is_verified = lambda: True

        response = admin.site._registry[QuestionBank].change_view(request, str(bank.pk))
        response.render()

        self.assertContains(response, "Delete failed unused bank")

    def test_admin_can_publish_verified_papers_for_scheduling(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Ready to publish",
            total_questions_per_set=1,
            is_ai_generated=True,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [{
                        "id": "publish-a-1",
                        "question": "Which number is the sum of two and two?",
                        "options": ["3", "4", "5", "6"],
                        "correct": "4",
                        "marks": 1,
                    }],
                }
            },
            created_by=self.admin_user,
        )
        request = RequestFactory().post(
            f"/secure-admin/question_bank/questionbank/{bank.pk}/publish-verified/"
        )
        request.user = self.admin_user
        request.session = {}
        request._messages = FallbackStorage(request)

        response = admin.site._registry[QuestionBank].publish_verified_view(
            request, str(bank.pk)
        )

        bank.refresh_from_db()
        self.assertEqual(response.status_code, 302)
        self.assertEqual(bank.lifecycle_status, QuestionBank.LifecycleStatus.OPEN)
        self.assertTrue(bank.is_active)

    def test_admin_shares_module_bank_only_to_missing_same_course_cohorts(self):
        target_cohort = Cohort.objects.create(
            course=self.course,
            code="MANUAL-QB-C2",
            name="Second Manual Bank Cohort",
            status=Cohort.Status.ACTIVE,
            start_date="2026-09-01",
            end_date="2026-12-01",
        )
        other_course = Course.objects.create(
            code="OTHER-QB",
            name="Other Course",
            created_by=self.admin_user,
        )
        Cohort.objects.create(
            course=other_course,
            code="OTHER-C1",
            status=Cohort.Status.ACTIVE,
            start_date="2026-09-01",
            end_date="2026-12-01",
        )
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Logic module paper",
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [{
                        "id": "logic-a-1",
                        "question": "Which Boolean value represents true?",
                        "options": ["0", "1", "X", "Z"],
                        "correct": "1",
                        "marks": 1,
                    }],
                }
            },
            created_by=self.admin_user,
        )
        model_admin = admin.site._registry[QuestionBank]

        for _ in range(2):
            request = RequestFactory().post(
                f"/secure-admin/question_bank/questionbank/{bank.pk}/copy-to-course-cohorts/"
            )
            request.user = self.admin_user
            request.session = {}
            request._messages = FallbackStorage(request)
            response = model_admin.copy_to_course_cohorts_view(request, str(bank.pk))
            self.assertEqual(response.status_code, 302)

        copies = QuestionBank.objects.filter(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=target_cohort,
            module=self.module,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
        )
        self.assertEqual(copies.count(), 1)
        copied = copies.get()
        self.assertEqual(copied.sets_data, bank.sets_data)
        self.assertFalse(copied.is_active)
        self.assertFalse(QuestionBank.objects.filter(course=other_course).exists())

    @patch("question_bank.tasks.generate_question_bank_task.delay")
    def test_admin_ai_generation_is_posted_only_once(self, mock_delay):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Generate once",
            is_ai_generated=True,
            sets_data={},
            created_by=self.admin_user,
        )
        request = RequestFactory().post(
            f"/secure-admin/question_bank/questionbank/{bank.pk}/change/",
            {"ai_num_sets": "3"},
        )
        request.user = self.admin_user
        request.session = {}
        request._messages = FallbackStorage(request)
        model_admin = admin.site._registry[QuestionBank]

        model_admin._queue_ai_generation_once(request, bank)
        model_admin._queue_ai_generation_once(request, bank)

        bank.refresh_from_db()
        self.assertEqual(bank.status, QuestionBank.Status.GENERATING)
        mock_delay.assert_called_once_with(
            str(bank.pk), num_sets=3,
            questions_per_set=bank.total_questions_per_set,
        )

    @patch("question_bank.tasks.generate_question_bank_task.delay")
    def test_admin_generation_reuses_existing_exact_scope(self, mock_delay):
        existing = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Existing scoped papers",
            is_ai_generated=True,
            status=QuestionBank.Status.GENERATING,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
        )
        duplicate = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Concurrent duplicate request",
            is_ai_generated=True,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
        )
        request = RequestFactory().post(
            f"/secure-admin/question_bank/questionbank/{duplicate.pk}/change/",
            {"ai_num_sets": "4"},
        )
        request.user = self.admin_user
        request.session = {}
        request._messages = FallbackStorage(request)

        target = admin.site._registry[QuestionBank]._queue_ai_generation_once(request, duplicate)

        self.assertEqual(target.pk, existing.pk)
        mock_delay.assert_not_called()
