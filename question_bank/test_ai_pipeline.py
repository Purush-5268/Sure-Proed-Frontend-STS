from unittest.mock import patch, MagicMock
import requests
from django.test import TestCase, override_settings
from django.utils import timezone
from datetime import timedelta

from accounts.models import User
from cohorts.models import Cohort
from courses.models import Course
from question_bank.models import QuestionBank
from question_bank.auto_generate import auto_generate_prescreening_bank
from question_bank.services.ai.validators import validate_question_structure
from question_bank.services.ai.base import QuestionSchema, VerificationSchema
from question_bank.services.ai.gemini_provider import GeminiProvider
from question_bank.tasks import (
    cleanup_failed_question_banks_task,
    generate_question_bank_task,
    schedule_failed_question_bank_cleanup,
)

class DeterministicValidatorTests(TestCase):
    def test_valid_schema(self):
        schema = QuestionSchema(
            question="What is 2 + 2?",
            options=["1", "2", "3", "4"],
            correct_answer="4",
            explanation="Basic math.",
            topic="Math"
        )
        is_valid, reason = validate_question_structure(schema)
        self.assertTrue(is_valid)

    def test_placeholder_question(self):
        schema = QuestionSchema(
            question="[AI Generated] What is it?",
            options=["1", "2", "3", "4"],
            correct_answer="4",
            explanation="Because",
            topic="Math"
        )
        is_valid, reason = validate_question_structure(schema)
        self.assertFalse(is_valid)
        self.assertIn("Placeholder", reason)

    def test_duplicate_options(self):
        schema = QuestionSchema(
            question="What is 2 + 2?",
            options=["1", "4", "3", "4"],
            correct_answer="4",
            explanation="Because",
            topic="Math"
        )
        is_valid, reason = validate_question_structure(schema)
        self.assertFalse(is_valid)
        self.assertIn("Duplicate options", reason)

    def test_correct_answer_not_in_options(self):
        schema = QuestionSchema(
            question="What is 2 + 2?",
            options=["1", "2", "3", "4"],
            correct_answer="5",
            explanation="Because",
            topic="Math"
        )
        is_valid, reason = validate_question_structure(schema)
        self.assertFalse(is_valid)
        self.assertIn("Correct answer is not exactly matching", reason)


@override_settings(AI_GEMINI_MIN_REQUEST_INTERVAL_SECONDS=0)
class GeminiProviderSecurityTests(TestCase):
    @patch("question_bank.services.ai.gemini_provider.requests.post")
    def test_api_key_is_sent_in_header_not_url(self, mock_post):
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "{}"}]}}]
        }
        mock_post.return_value = mock_response

        provider = GeminiProvider("server-secret-key", "gemini-3.6-flash")
        provider._call_gemini_rest("test prompt")

        request_url = mock_post.call_args.args[0]
        request_headers = mock_post.call_args.kwargs["headers"]
        self.assertNotIn("server-secret-key", request_url)
        self.assertEqual(request_headers["x-goog-api-key"], "server-secret-key")

    @patch("question_bank.services.ai.gemini_provider.requests.post")
    def test_provider_preserves_safe_gemini_http_error_details(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.json.return_value = {
            "error": {
                "status": "NOT_FOUND",
                "message": "The requested model was not found.",
            }
        }
        mock_response.raise_for_status.side_effect = requests.HTTPError(
            response=mock_response
        )
        mock_post.return_value = mock_response

        provider = GeminiProvider("server-secret-key", "missing-model")

        with self.assertRaisesRegex(RuntimeError, "404.*NOT_FOUND.*model was not found"):
            provider._call_gemini_rest("test prompt")

    @patch("question_bank.services.ai.gemini_provider.requests.post")
    def test_provider_exposes_gemini_retry_after(self, mock_post):
        from question_bank.services.ai.base import AIProviderRateLimitError

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}
        mock_response.json.return_value = {
            "error": {
                "status": "RESOURCE_EXHAUSTED",
                "message": "Quota exceeded. Please retry in 33.2s.",
            }
        }
        mock_response.raise_for_status.side_effect = requests.HTTPError(
            response=mock_response
        )
        mock_post.return_value = mock_response

        with self.assertRaises(AIProviderRateLimitError) as raised:
            GeminiProvider("server-secret-key", "gemini-3.6-flash")._call_gemini_rest(
                "test prompt"
            )

        self.assertEqual(raised.exception.retry_after_seconds, 34)


@override_settings(AI_QUESTION_BANK_MAX_RETRIES=0)
class AIProviderPipelineTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="test@test.com", password="pwd")
        self.course = Course.objects.create(code="TEST", name="Test", created_by=self.admin)
        self.bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Test Bank",
            total_questions_per_set=2,
            is_active=False,
            status=QuestionBank.Status.GENERATING,
            created_by=self.admin,
        )

    @patch("question_bank.tasks.get_verifier_provider")
    @patch("question_bank.tasks.get_generator_provider")
    def test_concurrent_claim(self, mock_get_gen, mock_get_ver):
        # First execution claims the bank and sets status to PROCESSING
        generate_question_bank_task(self.bank.id, 1, 1)
        self.bank.refresh_from_db()
        self.assertNotEqual(self.bank.status, QuestionBank.Status.GENERATING)
        
        # Reset mocks
        mock_get_gen.reset_mock()
        
        # Second execution runs concurrently (or immediately after) 
        # but shouldn't execute AI logic since it can't update status from GENERATING to PROCESSING
        generate_question_bank_task(self.bank.id, 1, 1)
        
        # The generator should not have been fetched or called a second time
        mock_get_gen.assert_not_called()

    @patch("question_bank.tasks.get_verifier_provider")
    @patch("question_bank.tasks.get_generator_provider")
    def test_successful_generation(self, mock_get_gen, mock_get_ver):
        # Setup mocks
        mock_gen = MagicMock()
        mock_ver = MagicMock()
        mock_get_gen.return_value = mock_gen
        mock_get_ver.return_value = mock_ver

        mock_gen.generate_question.side_effect = [
            QuestionSchema(
                question=f"Generated Question {number} that is long enough",
                options=["A", "B", "C", "D"],
                correct_answer="A",
                explanation="Explanation that is long enough",
                topic="Top",
            )
            for number in (1, 2, 3, 4)
        ]
        
        mock_ver.verify_question.return_value = VerificationSchema(
            correct_answer="A",
            explanation="Yes",
            confidence=0.9
        )

        generate_question_bank_task(self.bank.id, 2, 2)
        
        self.bank.refresh_from_db()
        self.assertEqual(self.bank.status, QuestionBank.Status.APPROVED)
        self.assertFalse(self.bank.is_active)
        self.assertEqual(self.bank.lifecycle_status, QuestionBank.LifecycleStatus.DRAFT)
        self.assertEqual(len(self.bank.sets_data["A"]["questions"]), 2)
        self.assertEqual(len(self.bank.sets_data["B"]["questions"]), 2)
        all_questions = [
            question["question"]
            for paper in self.bank.sets_data.values()
            for question in paper["questions"]
        ]
        self.assertEqual(len(all_questions), 4)
        self.assertEqual(len(set(all_questions)), 4)
        first_question = self.bank.sets_data["A"]["questions"][0]
        self.assertEqual(first_question["verifier_result"], "MATCH")
        self.assertEqual(first_question["confidence"], 0.9)
        self.assertIn("verified_by", first_question)
        self.assertIn("verification_explanation", first_question)
        self.assertEqual(mock_gen.generate_question.call_count, 4)
        first_context = mock_gen.generate_question.call_args_list[0].kwargs["context"]
        self.assertIn("1 of 4", first_context)
        self.assertIn("2 papers", first_context)

    @patch("question_bank.tasks.get_verifier_provider")
    @patch("question_bank.tasks.get_generator_provider")
    def test_mismatch_triggers_retry_and_exhausts(self, mock_get_gen, mock_get_ver):
        mock_gen = MagicMock()
        mock_ver = MagicMock()
        mock_get_gen.return_value = mock_gen
        mock_get_ver.return_value = mock_ver

        mock_gen.generate_question.return_value = QuestionSchema(
            question="Generated Question that is long enough",
            options=["A", "B", "C", "D"],
            correct_answer="A",
            explanation="Explanation that is long enough",
            topic="Top"
        )
        
        mock_ver.verify_question.return_value = VerificationSchema(
            correct_answer="B",  # Mismatch!
            explanation="Yes",
            confidence=0.9
        )

        generate_question_bank_task(self.bank.id, 1, 2)
        
        self.bank.refresh_from_db()
        self.assertEqual(self.bank.status, QuestionBank.Status.FAILED)
        self.assertFalse(self.bank.is_active)
        self.assertIn("attempts", self.bank.error_message.lower())

    @patch("question_bank.tasks.get_verifier_provider")
    @patch("question_bank.tasks.get_generator_provider")
    def test_low_verifier_confidence_is_not_persisted(self, mock_get_gen, mock_get_ver):
        mock_get_gen.return_value.generate_question.return_value = QuestionSchema(
            question="Generated Question that is long enough",
            options=["A", "B", "C", "D"],
            correct_answer="A",
            explanation="Explanation that is long enough",
            topic="Top",
        )
        mock_get_ver.return_value.verify_question.return_value = VerificationSchema(
            correct_answer="A",
            explanation="The answer appears correct but evidence is weak.",
            confidence=0.25,
        )

        generate_question_bank_task(self.bank.id, 1, 1)

        self.bank.refresh_from_db()
        self.assertEqual(self.bank.status, QuestionBank.Status.FAILED)
        self.assertEqual(self.bank.sets_data, {})
        self.assertIn("confidence", self.bank.error_message.lower())

    @override_settings(
        AI_QUESTION_BANK_MAX_RETRIES=2,
        AI_QUESTION_BANK_RETRY_DELAY_MINUTES=10,
    )
    @patch("question_bank.tasks.generate_question_bank_task.apply_async")
    @patch("question_bank.tasks.get_verifier_provider")
    @patch("question_bank.tasks.get_generator_provider")
    def test_whole_bank_failure_retries_same_row_without_cleanup(
        self,
        mock_get_gen,
        mock_get_ver,
        mocked_apply_async,
    ):
        mock_get_gen.side_effect = RuntimeError("temporary provider outage")

        with self.captureOnCommitCallbacks(execute=True):
            generate_question_bank_task(self.bank.id, 2, 4)

        self.bank.refresh_from_db()
        self.assertEqual(self.bank.status, QuestionBank.Status.GENERATING)
        self.assertIn("retry 1 of 2", self.bank.error_message.lower())
        mocked_apply_async.assert_called_once_with(
            args=[str(self.bank.id), 2, 4],
            kwargs={"bank_retry": 1},
            countdown=600,
        )
        self.assertEqual(QuestionBank.objects.filter(pk=self.bank.pk).count(), 1)
        mock_get_ver.assert_not_called()

    @override_settings(FAILED_QUESTION_BANK_RETENTION_HOURS=0.5)
    @patch("question_bank.tasks.delete_failed_question_bank_task.apply_async")
    def test_failed_bank_cleanup_is_queued_after_configured_retention(
        self, mocked_cleanup
    ):
        with self.captureOnCommitCallbacks(execute=True):
            schedule_failed_question_bank_cleanup(self.bank.id)

        mocked_cleanup.assert_called_once_with(
            args=[str(self.bank.id)], countdown=1800
        )

    @override_settings(FAILED_QUESTION_BANK_RETENTION_HOURS=1)
    def test_beat_sweep_deletes_only_expired_failed_banks(self):
        self.bank.status = QuestionBank.Status.FAILED
        self.bank.is_active = False
        self.bank.save(update_fields=["status", "is_active", "updated_at"])
        QuestionBank.objects.filter(pk=self.bank.pk).update(
            updated_at=timezone.now() - timedelta(hours=2)
        )
        recent = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Recent failure retained for diagnosis",
            status=QuestionBank.Status.FAILED,
            is_active=False,
            created_by=self.admin,
        )

        result = cleanup_failed_question_banks_task()

        self.assertEqual(result["deleted"], 1)
        self.assertFalse(QuestionBank.objects.filter(pk=self.bank.pk).exists())
        self.assertTrue(QuestionBank.objects.filter(pk=recent.pk).exists())

    @patch("question_bank.auto_generate.generate_question_bank_task.delay")
    def test_auto_generation_reuses_approved_draft_bank(self, mock_delay):
        self.bank.status = QuestionBank.Status.APPROVED
        self.bank.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
        self.bank.is_active = False
        self.bank.save(update_fields=["status", "lifecycle_status", "is_active", "updated_at"])

        reused = auto_generate_prescreening_bank(self.course.pk)

        self.assertEqual(reused.pk, self.bank.pk)
        self.assertEqual(
            QuestionBank.objects.filter(
                course=self.course,
                bank_type=QuestionBank.BankType.PRESCREENING,
            ).count(),
            1,
        )
        mock_delay.assert_not_called()

    @patch("question_bank.auto_generate.generate_question_bank_task.delay")
    def test_auto_generation_prefers_legacy_cohort_bank_without_new_ai_job(self, mock_delay):
        cohort = Cohort.objects.create(
            course=self.course,
            code="LEGACY-SCREENING",
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        self.bank.cohort = cohort
        self.bank.status = QuestionBank.Status.APPROVED
        self.bank.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
        self.bank.sets_data = {"A": {"label": "Paper A", "questions": []}}
        self.bank.save(update_fields=[
            "cohort", "status", "lifecycle_status", "sets_data", "updated_at",
        ])
        redundant = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Redundant empty AI job",
            status=QuestionBank.Status.PROCESSING,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={},
        )

        reused = auto_generate_prescreening_bank(self.course.pk)

        self.assertEqual(reused.pk, self.bank.pk)
        redundant.refresh_from_db()
        self.assertEqual(redundant.status, QuestionBank.Status.PROCESSING)
        self.assertEqual(
            QuestionBank.objects.filter(
                course=self.course,
                bank_type=QuestionBank.BankType.PRESCREENING,
            ).count(),
            2,
        )
        mock_delay.assert_not_called()
