from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch

from accounts.models import User
from applications.models import Application, PreScreening
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.models import ExamProctoringRoom
from question_bank.models import QuestionBank


class QuestionBankSecurityTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="bank-admin@example.com", password="pwd", role=User.Role.ADMIN
        )
        self.student = User.objects.create_user(
            email="bank-student@example.com", password="pwd", role=User.Role.STUDENT
        )
        self.course = Course.objects.create(
            code="BANK-101",
            name="Secure Bank Course",
            domain="Technology",
            description="Question-bank security tests",
            course_prerequisites=["Boolean algebra"],
            created_by=self.admin,
        )
        self.other_course = Course.objects.create(
            code="BANK-OTHER",
            name="Other Course",
            domain="Technology",
            description="Other course",
            course_prerequisites=["Python"],
            created_by=self.admin,
        )
        self.foreign_cohort = Cohort.objects.create(
            code="FOREIGN-COHORT",
            course=self.other_course,
            start_date="2026-01-01",
            end_date="2026-12-31",
            created_by=self.admin,
        )
        self.client = APIClient()

    def _paper(self, text="Which gate outputs true only when both inputs are true?"):
        return {
            "A": {
                "label": "Paper A",
                "questions": [{
                    "id": "q-1",
                    "question": text,
                    "options": ["AND", "OR", "XOR", "NOT"],
                    "correct": "AND",
                    "marks": 1,
                }],
            }
        }

    def test_student_cannot_enumerate_or_generate_question_banks(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Secret answer bank",
            sets_data=self._paper(),
            created_by=self.admin,
        )
        self.client.force_authenticate(self.student)

        self.assertEqual(self.client.get("/api/question-banks/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/question-banks/{bank.id}/paper/A/").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/question-banks/generate/",
                {
                    "course_id": str(self.course.id),
                    "bank_type": "PRESCREENING",
                    "num_sets": 4,
                    "questions_per_set": 5,
                },
                format="json",
            ).status_code,
            403,
        )

    def test_generation_rejects_cross_course_cohort_and_module(self):
        foreign_module = CourseModule.objects.create(
            course=self.other_course,
            module_number=1,
            title="Foreign module",
            topics=["Foreign topic"],
            order=1,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/question-banks/generate/",
            {
                "course_id": str(self.course.id),
                "bank_type": "MODULE_TEST",
                "cohort_id": str(self.foreign_cohort.id),
                "module_id": str(foreign_module.id),
                "num_sets": 4,
                "questions_per_set": 5,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cohort_id", response.data)

    def test_publish_opens_one_complete_bank_and_closes_competitor(self):
        old_bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Old bank",
            sets_data=self._paper("What is the output of an AND gate for inputs 1 and 1?"),
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            created_by=self.admin,
        )
        new_bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="New bank",
            sets_data=self._paper(),
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f"/api/question-banks/{new_bank.id}/publish/")

        self.assertEqual(response.status_code, 200, response.data)
        old_bank.refresh_from_db()
        new_bank.refresh_from_db()
        self.assertEqual(old_bank.lifecycle_status, QuestionBank.LifecycleStatus.CLOSED)
        self.assertFalse(old_bank.is_active)
        self.assertEqual(new_bank.lifecycle_status, QuestionBank.LifecycleStatus.OPEN)
        self.assertTrue(new_bank.is_active)

    @patch("question_bank.tasks.generate_question_bank_task.delay")
    def test_closed_legacy_bank_can_be_regenerated_with_unique_papers(self, mocked_delay):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Legacy duplicate bank",
            sets_data=self._paper(),
            total_questions_per_set=10,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.CLOSED,
            is_active=False,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f"/api/question-banks/{bank.id}/regenerate/",
            {"num_sets": 4, "questions_per_set": 10},
            format="json",
        )

        self.assertEqual(response.status_code, 202, response.data)
        bank.refresh_from_db()
        self.assertEqual(bank.status, QuestionBank.Status.GENERATING)
        self.assertEqual(bank.lifecycle_status, QuestionBank.LifecycleStatus.DRAFT)
        self.assertEqual(bank.sets_data, {})
        self.assertTrue(bank.is_ai_generated)
        mocked_delay.assert_called_once_with(bank.id, 4, 10)

    def test_editing_open_paper_returns_it_to_draft(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Open bank",
            sets_data=self._paper(),
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        edited = self._paper("Which logic gate implements conjunction?")

        response = self.client.patch(
            f"/api/question-banks/{bank.id}/",
            {"sets_data": edited},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        bank.refresh_from_db()
        self.assertEqual(bank.lifecycle_status, QuestionBank.LifecycleStatus.DRAFT)
        self.assertFalse(bank.is_active)

    def test_publish_revalidates_database_edited_paper(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Malformed database bank",
            sets_data={
                "A": {
                    "questions": [{
                        "id": "q1",
                        "question": "Malformed",
                        "options": ["Yes", "No"],
                        "correct": "Yes",
                    }]
                }
            },
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f"/api/question-banks/{bank.id}/publish/")

        self.assertEqual(response.status_code, 409)
        bank.refresh_from_db()
        self.assertEqual(bank.lifecycle_status, QuestionBank.LifecycleStatus.DRAFT)
        self.assertFalse(bank.is_active)

    def test_publish_rejects_duplicate_questions_across_paper_sets(self):
        duplicate_text = "Which gate outputs true only when both inputs are true?"
        sets_data = self._paper(duplicate_text)
        sets_data["B"] = {
            "label": "Paper B",
            "questions": [{
                **sets_data["A"]["questions"][0],
                "id": "q-2",
            }],
        }
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Duplicated papers",
            sets_data=sets_data,
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(f"/api/question-banks/{bank.id}/publish/")

        self.assertEqual(response.status_code, 409)
        self.assertIn("duplicate question", str(response.data).lower())

    def test_open_bank_must_be_closed_before_deletion(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Open bank cannot be deleted",
            sets_data=self._paper(),
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(f"/api/question-banks/{bank.id}/")

        self.assertEqual(response.status_code, 409)
        self.assertTrue(QuestionBank.objects.filter(pk=bank.pk).exists())

    def test_closed_unused_bank_can_be_deleted(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Disposable closed bank",
            sets_data=self._paper(),
            lifecycle_status=QuestionBank.LifecycleStatus.CLOSED,
            is_active=False,
            created_by=self.admin,
        )
        room = ExamProctoringRoom.objects.create(
            question_bank=bank,
            scope_key="unused-closed-bank",
            session_date="2026-08-23",
            code="A",
            room_name="unused-closed-bank-room",
            room_password="unused-password",
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(f"/api/question-banks/{bank.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(QuestionBank.objects.filter(pk=bank.pk).exists())
        self.assertFalse(ExamProctoringRoom.objects.filter(pk=room.pk).exists())

    def test_failed_unused_bank_can_be_deleted_and_schedule_is_safely_detached(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Failed AI bank",
            status=QuestionBank.Status.FAILED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=False,
            error_message="AI request failed with HTTPError",
            created_by=self.admin,
        )
        application = Application.objects.create(
            application_number="APP-FAILED-BANK",
            student=self.student.student_profile,
            course=self.course,
            status=Application.Status.APPLIED,
        )
        schedule = PreScreening.objects.create(
            application=application,
            question_bank=bank,
            paper_set="A",
            is_released=True,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(f"/api/question-banks/{bank.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(QuestionBank.objects.filter(pk=bank.pk).exists())
        schedule.refresh_from_db()
        self.assertIsNone(schedule.question_bank_id)
        self.assertEqual(schedule.paper_set, "")
        self.assertFalse(schedule.is_released)
