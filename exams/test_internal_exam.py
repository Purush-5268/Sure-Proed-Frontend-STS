
from unittest.mock import patch
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from django.test import override_settings

from accounts.models import User
from students.models import StudentProfile
from courses.models import Course
from cohorts.models import Cohort
from applications.models import Application, PreScreening
from exams.models import Exam, InternalExamAttempt, ExamSecurityEvent
from exams.tasks import finalize_expired_assessment_attempts
from question_bank.models import QuestionBank

@override_settings(ALLOW_INTERNAL_EXAM_SUBMISSION=True)
class InternalExamTests(APITestCase):
    def setUp(self):
        # Create test users and models
        self.admin = User.objects.create_user(email="admin@test.com", password="pwd", role="ADMIN")
        self.student_user = User.objects.create_user(email="student@test.com", password="pwd", role="STUDENT")
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.student_user, defaults={"student_code": "STU-123"})
        
        self.course = Course.objects.create(code="TESTC", name="Test Course", created_by=self.admin)
        self.cohort = Cohort.objects.create(code="COHORT1", name="Test Cohort", course=self.course, created_by=self.admin, start_date=timezone.now().date(), end_date=timezone.now().date())
        
        self.app = Application.objects.create(student=self.student_profile, course=self.course, assigned_cohort=self.cohort, status=Application.Status.EXAM_PENDING)
        
        self.exam = Exam.objects.create(
            application=self.app,
            duration_minutes=60,
            status=Exam.Status.PENDING,
            total_questions=2
        )
        
        # Create an approved QuestionBank
        self.bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            exam=self.exam,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [
                        {
                            "id": "q1",
                            "question": "What is 1+1?",
                            "options": ["1", "2", "3", "4"],
                            "correct": "2",
                            "marks": 1
                        },
                        {
                            "id": "q2",
                            "question": "What is 2+2?",
                            "options": ["3", "4", "5", "6"],
                            "correct": "4",
                            "marks": 1
                        }
                    ]
                }
            }
        )
        
        self.client.force_authenticate(user=self.student_user)

    def test_start_internal_exam_enforces_lifecycle(self):
        # Close the exam
        self.bank.lifecycle_status = QuestionBank.LifecycleStatus.CLOSED
        self.bank.save()
        
        url = f"/api/exams/{self.exam.id}/start-internal/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Open it back up
        self.bank.lifecycle_status = QuestionBank.LifecycleStatus.OPEN
        self.bank.save()
        
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_duplicate_attempt_prevention(self):
        url = f"/api/exams/{self.exam.id}/start-internal/"
        self.client.post(url)
        
        # Attempt to start again
        response = self.client.post(url)
        # Should return the active attempt info, not a new attempt
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        attempts = InternalExamAttempt.objects.filter(exam=self.exam)
        self.assertEqual(attempts.count(), 1)

    def test_start_uses_paper_assigned_on_screening_schedule(self):
        self.bank.sets_data["B"] = {
            "label": "Paper B",
            "questions": [
                {
                    "id": "b1",
                    "question": "Paper B question?",
                    "options": ["A", "B", "C", "D"],
                    "correct": "B",
                    "marks": 1,
                }
            ],
        }
        self.bank.save(update_fields=["sets_data", "updated_at"])
        PreScreening.objects.create(
            application=self.app,
            question_bank=self.bank,
            paper_set="B",
            scheduled_at=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            is_released=True,
            admin_started_at=timezone.now(),
        )

        response = self.client.post(f"/api/exams/{self.exam.id}/start-internal/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        self.assertEqual(attempt.question_bank_id, self.bank.id)
        self.assertEqual(attempt.paper_set, "B")
        self.assertEqual(attempt.question_snapshot[0]["id"], "b1")

    def test_released_schedule_still_requires_admin_start_timestamp(self):
        PreScreening.objects.create(
            application=self.app,
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            is_released=True,
            admin_started_at=None,
        )

        response = self.client.post(f"/api/exams/{self.exam.id}/start-internal/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "ADMIN_NOT_STARTED")

    def test_randomization_and_answer_key_protection(self):
        url = f"/api/exams/{self.exam.id}/start-internal/"
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK, f"Response: {response.data}")
        data = response.json()
        questions = data["questions"]

        
        # Ensure correct answer is NOT exposed
        for q in questions:
            self.assertNotIn("correct", q)
            self.assertNotIn("correct_answer", q)
            self.assertEqual(len(q["options"]), 4)
            
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        self.assertTrue(len(attempt.question_mapping) > 0)
        self.assertTrue(len(attempt.option_mapping) > 0)

    def test_autosave_idempotency_and_security_events(self):
        url = f"/api/exams/{self.exam.id}/start-internal/"
        self.client.post(url)
        
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        
        autosave_url = f"/api/exams/{self.exam.id}/autosave/"
        
        # First autosave
        payload1 = {
            "answers": {"q1": 2},
            "security_events": [{"type": "TAB_SWITCH"}]
        }
        res1 = self.client.post(autosave_url, payload1, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        
        attempt.refresh_from_db()
        self.assertEqual(attempt.answers["responses"]["q1"], "C")
        
        # Second autosave (idempotent, modifies q2)
        payload2 = {
            "answers": {"q2": 1, "q1": 2}
        }
        self.client.post(autosave_url, payload2, format='json')
        
        attempt.refresh_from_db()
        self.assertEqual(attempt.answers["responses"]["q1"], "C")
        self.assertEqual(attempt.answers["responses"]["q2"], "B")
        
        self.assertEqual(ExamSecurityEvent.objects.count(), 1)
        self.assertEqual(ExamSecurityEvent.objects.first().event_type, "TAB_SWITCH")

    def test_submit_mapping_reversal_and_scoring(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/")
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        
        # We need to find what index corresponds to the correct answer for q1
        q1_opts = attempt.option_mapping["q1"]
        # The correct answer for q1 is "2", which is index 1 in the original options.
        # Find where 1 is in q1_opts
        student_idx = q1_opts.index(1)
        
        # Submit
        submit_url = f"/api/exams/{self.exam.id}/submit/"
        payload = {
            "answers": {
                "q1": student_idx
            }
        }
        response = self.client.post(submit_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, f"Response: {response.data}")
        
        self.exam.refresh_from_db()
        # Q1 is correct (1 mark). Q2 is unanswered (0 marks). Total 2 marks. Score = 50%.
        self.assertEqual(self.exam.marks_obtained, 1.0)
        self.assertEqual(self.exam.total_marks, 2.0)
        self.assertEqual(self.exam.percentage, 50.0)
        
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, InternalExamAttempt.Status.SUBMITTED)

    def test_timer_expiry(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/")
        attempt = InternalExamAttempt.objects.get(exam=self.exam)

        correct_index = attempt.question_snapshot[0]["options"].index(
            attempt.question_snapshot[0]["correct"]
        )
        display_index = attempt.option_mapping["q1"].index(correct_index)
        saved = self.client.post(
            f"/api/exams/{self.exam.id}/autosave/",
            {"attempt_id": str(attempt.id), "answers": {"q1": display_index}},
            format="json",
        )
        self.assertEqual(saved.status_code, status.HTTP_200_OK)
        
        # Artificially expire the attempt
        InternalExamAttempt.objects.filter(pk=attempt.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        
        autosave_url = f"/api/exams/{self.exam.id}/autosave/"
        response = self.client.post(autosave_url, {"answers": {"q2": 1}}, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, f"Autosave Response: {response.data}")
        self.assertEqual(response.data["code"], "EXAM_AUTO_SUBMITTED")
        
        submit_url = f"/api/exams/{self.exam.id}/submit/"
        response = self.client.post(submit_url, {"answers": {"q2": 1}}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, f"Submit Response: {response.data}")
        self.assertTrue(response.data["already_submitted"])
        
        attempt.refresh_from_db()
        self.exam.refresh_from_db()
        self.assertEqual(attempt.status, InternalExamAttempt.Status.SUBMITTED)
        self.assertIn("q1", attempt.answers["responses"])
        self.assertNotIn("q2", attempt.answers["responses"])
        self.assertEqual(self.exam.marks_obtained, 1)
        self.assertTrue(
            ExamSecurityEvent.objects.filter(
                attempt=attempt,
                event_type="TIME_EXPIRED_AUTO_SUBMIT",
            ).exists()
        )

    def test_periodic_task_finalizes_disconnected_attempt(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/")
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        attempt.expires_at = timezone.now() - timedelta(seconds=10)
        attempt.save(update_fields=["expires_at", "updated_at"])

        result = finalize_expired_assessment_attempts.run()

        attempt.refresh_from_db()
        self.exam.refresh_from_db()
        self.assertEqual(result["internal_exam_attempts"], 1)
        self.assertEqual(attempt.status, InternalExamAttempt.Status.SUBMITTED)
        self.assertEqual(self.exam.status, Exam.Status.EVALUATED)

    def test_double_submission(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/")
        
        submit_url = f"/api/exams/{self.exam.id}/submit/"
        payload = {"answers": {"q1": 1}}
        
        response1 = self.client.post(submit_url, payload, format='json')
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        
        response2 = self.client.post(submit_url, payload, format='json')
        self.assertEqual(response2.status_code, status.HTTP_409_CONFLICT)
