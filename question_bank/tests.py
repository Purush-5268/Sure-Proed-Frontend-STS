from django.core.exceptions import ValidationError
from django.test import TestCase
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from .models import QuestionBank
from .serializers import PaperSetSerializer


class QuestionBankModelTests(TestCase):
    """Tests for the QuestionBank model."""

    def setUp(self):
        self.admin_user = User.objects.create_user(
            email="qb_admin@test.com",
            password="TestPass123!",
            role=User.Role.ADMIN,
            is_email_verified=True,
        )
        self.course = Course.objects.create(
            code="TEST-VLSI-01",
            name="VLSI Design",
            domain="Electronics",
            description="VLSI course",
            course_prerequisites=["C Programming", "Digital Electronics", "Basic Electronics"],
            created_by=self.admin_user,
        )
        self.cohort = Cohort.objects.create(
            code="C25-VLSI-01",
            course=self.course,
            start_date="2025-01-01",
            end_date="2025-06-01",
            created_by=self.admin_user,
        )
        self.module = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            title="Digital Design Fundamentals",
            topics=["Combinational Logic", "Flip-Flops", "FSMs"],
            order=1,
        )

    def test_create_prescreening_bank(self):
        """Pre-screening bank auto-populates source_topics from course_prerequisites."""
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="VLSI Pre-Screening",
            difficulty=QuestionBank.Difficulty.EASY,
            created_by=self.admin_user,
        )
        self.assertEqual(bank.bank_type, "PRESCREENING")
        self.assertEqual(bank.source_topics, ["C Programming", "Digital Electronics", "Basic Electronics"])
        self.assertTrue(bank.is_active)

    def test_create_module_test_bank(self):
        """Module test bank auto-populates source_topics from module.topics."""
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Module 1 Test",
            difficulty=QuestionBank.Difficulty.MEDIUM,
            created_by=self.admin_user,
        )
        self.assertEqual(bank.bank_type, "MODULE_TEST")
        self.assertEqual(bank.source_topics, ["Combinational Logic", "Flip-Flops", "FSMs"])

    def test_module_test_requires_cohort(self):
        """Module test bank validation requires cohort."""
        bank = QuestionBank(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            module=self.module,
            title="Missing Cohort",
        )
        with self.assertRaises(ValidationError) as ctx:
            bank.full_clean()
        self.assertIn("cohort", ctx.exception.message_dict)

    def test_module_test_requires_module(self):
        """Module test bank validation requires module."""
        bank = QuestionBank(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            title="Missing Module",
        )
        with self.assertRaises(ValidationError) as ctx:
            bank.full_clean()
        self.assertIn("module", ctx.exception.message_dict)

    def test_sets_data_and_paper_retrieval(self):
        """Test JSON sets_data storage and get_paper_set retrieval."""
        sets = {
            "A": {
                "label": "Paper A",
                "questions": [
                    {"id": 1, "question": "What is C?", "options": ["a", "b", "c", "d"], "correct": "a", "marks": 1}
                ],
            },
            "B": {
                "label": "Paper B",
                "questions": [
                    {"id": 1, "question": "What is DE?", "options": ["a", "b", "c", "d"], "correct": "b", "marks": 1}
                ],
            },
        }
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Test Sets",
            sets_data=sets,
            created_by=self.admin_user,
        )
        self.assertEqual(bank.total_sets, 2)
        self.assertEqual(bank.set_codes, ["A", "B"])

        paper_a = bank.get_paper_set("A")
        self.assertEqual(paper_a["label"], "Paper A")
        self.assertEqual(len(paper_a["questions"]), 1)

        paper_c = bank.get_paper_set("C")
        self.assertIsNone(paper_c)

    def test_str_representation(self):
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="VLSI Screening",
            created_by=self.admin_user,
        )
        self.assertIn("Pre-Screening", str(bank))
        self.assertIn("VLSI Screening", str(bank))


class QuestionBankAPITests(TestCase):
    """Tests for the QuestionBank API endpoints."""

    def setUp(self):
        self.admin_user = User.objects.create_user(
            email="qb_api_admin@test.com",
            password="TestPass123!",
            role=User.Role.ADMIN,
            is_email_verified=True,
        )
        self.course = Course.objects.create(
            code="TEST-PY-01",
            name="Python Fullstack",
            domain="Software",
            description="Python course",
            course_prerequisites=["Python Basics", "HTML", "SQL"],
            created_by=self.admin_user,
        )
        self.cohort = Cohort.objects.create(
            code="C25-PY-01",
            course=self.course,
            start_date="2025-01-01",
            end_date="2025-06-01",
            created_by=self.admin_user,
        )
        self.module = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            title="Django REST Framework",
            topics=["Serializers", "Views", "Authentication"],
            order=1,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)

    def test_create_prescreening_bank_via_api(self):
        """POST /api/question-banks/ creates a pre-screening bank."""
        resp = self.client.post(
            "/api/question-banks/",
            {
                "bank_type": "PRESCREENING",
                "course": str(self.course.id),
                "title": "Python Pre-Screening",
                "difficulty": "EASY",
                "total_questions_per_set": 10,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["bank_type"], "PRESCREENING")
        self.assertEqual(resp.data["source_topics"], ["Python Basics", "HTML", "SQL"])

    def test_create_module_test_bank_via_api(self):
        """POST /api/question-banks/ creates a module test bank."""
        resp = self.client.post(
            "/api/question-banks/",
            {
                "bank_type": "MODULE_TEST",
                "course": str(self.course.id),
                "cohort": str(self.cohort.id),
                "module": str(self.module.id),
                "title": "DRF Module Test",
                "difficulty": "MEDIUM",
                "total_questions_per_set": 10,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["bank_type"], "MODULE_TEST")

    def test_list_banks(self):
        """GET /api/question-banks/ returns all banks."""
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Bank 1",
            created_by=self.admin_user,
        )
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Bank 2",
            created_by=self.admin_user,
        )
        resp = self.client.get("/api/question-banks/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data) if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(results), 2)

    def test_filter_by_bank_type(self):
        """GET /api/question-banks/?bank_type=PRESCREENING filters correctly."""
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="PS Bank",
            created_by=self.admin_user,
        )
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="MT Bank",
            created_by=self.admin_user,
        )
        resp = self.client.get("/api/question-banks/?bank_type=PRESCREENING")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data) if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["bank_type"], "PRESCREENING")

    def test_paper_set_endpoint(self):
        """GET /api/question-banks/{id}/paper/A/ returns paper set A."""
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Paper Test",
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [
                        {"id": 1, "question": "Q1", "options": ["a", "b"], "correct": "a", "marks": 1}
                    ],
                }
            },
            created_by=self.admin_user,
        )
        resp = self.client.get(f"/api/question-banks/{bank.id}/paper/A/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["set_code"], "A")
        self.assertEqual(resp.data["label"], "Paper A")
        self.assertEqual(resp.data["total_questions"], 1)
        self.assertEqual(resp.data["questions"][0]["correct"], "a")

    def test_paper_set_not_found(self):
        """GET /api/question-banks/{id}/paper/Z/ returns 404."""
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Paper Test",
            sets_data={"A": {"label": "Paper A", "questions": []}},
            created_by=self.admin_user,
        )
        resp = self.client.get(f"/api/question-banks/{bank.id}/paper/Z/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    @patch("question_bank.tasks.generate_question_bank_task.delay")
    def test_generate_prescreening_bank(self, mock_task):
        """Repeated generation POSTs reuse one scoped pre-screening bank."""
        payload = {
            "course_id": str(self.course.id),
            "bank_type": "PRESCREENING",
            "num_sets": 4,
            "questions_per_set": 5,
        }
        resp = self.client.post(
            "/api/question-banks/generate/",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["bank_type"], "PRESCREENING")
        self.assertEqual(resp.data["total_sets"], 0)
        self.assertFalse(resp.data["is_active"])
        mock_task.assert_called_once()

        repeated = self.client.post(
            "/api/question-banks/generate/", payload, format="json"
        )
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated["X-Question-Bank-Reused"], "true")
        self.assertEqual(repeated.data["id"], resp.data["id"])
        self.assertEqual(
            QuestionBank.objects.filter(
                course=self.course,
                bank_type=QuestionBank.BankType.PRESCREENING,
            ).count(),
            1,
        )
        mock_task.assert_called_once()

    @patch("question_bank.tasks.generate_question_bank_task.delay")
    def test_generate_module_test_bank(self, mock_task):
        """POST /api/question-banks/generate/ creates placeholder module test bank."""
        resp = self.client.post(
            "/api/question-banks/generate/",
            {
                "course_id": str(self.course.id),
                "cohort_id": str(self.cohort.id),
                "module_id": str(self.module.id),
                "bank_type": "MODULE_TEST",
                "num_sets": 2,
                "questions_per_set": 10,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["bank_type"], "MODULE_TEST")
        self.assertEqual(resp.data["total_sets"], 0)
        self.assertFalse(resp.data["is_active"])
        mock_task.assert_called_once()

    def test_by_cohort_endpoint(self):
        """GET /api/question-banks/by-cohort/{cohort_id}/ returns banks for that cohort."""
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=self.module,
            title="Cohort Bank",
            sets_data={"A": {"label": "Paper A", "questions": []}},
            created_by=self.admin_user,
        )
        resp = self.client.get(f"/api/question-banks/by-cohort/{self.cohort.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(str(resp.data[0]["cohort"]), str(self.cohort.id))

    def test_by_exam_endpoint(self):
        """GET /api/question-banks/by-exam/{exam_id}/ returns bank linked to exam."""
        from applications.models import Application
        from exams.models import Exam
        from students.models import StudentProfile

        student_user = User.objects.create_user(
            email="exam_student@test.com",
            password="TestPass123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        student_profile = student_user.student_profile
        app = Application.objects.create(
            student=student_profile,
            course=self.course,
            application_number="APP-QB-TEST-01",
        )
        exam = Exam.objects.create(
            application=app,
            total_questions=10,
        )
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            exam=exam,
            title="Exam Linked Bank",
            sets_data={"A": {"label": "Paper A", "questions": []}},
            created_by=self.admin_user,
        )
        resp = self.client.get(f"/api/question-banks/by-exam/{exam.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(str(resp.data["id"]), str(bank.id))
        self.assertEqual(str(resp.data["exam"]), str(exam.id))

    def test_unauthenticated_blocked(self):
        """Unauthenticated requests are rejected."""
        anon_client = APIClient()
        resp = anon_client.get("/api/question-banks/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


    def test_admin_paper_preview_includes_answer_key(self):
        """Admin paper preview includes answers needed for question review."""
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Secure Paper Test",
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [
                        {
                            "id": 1, 
                            "question": "Q1", 
                            "options": ["a", "b"], 
                            "correct": "a", 
                            "marks": 1,
                            "explanation": "Because a is a",
                            "verifier_answer": "a",
                            "verifier_result": "MATCH",
                            "confidence": 0.99,
                            "validation_status": "APPROVED",
                            "approval_status": "AUTO_APPROVED",
                            "validation_failures": [],
                            "generated_by": "Gemini-Pro"
                        }
                    ],
                }
            },
            created_by=self.admin_user,
        )
        resp = self.client.get(f"/api/question-banks/{bank.id}/paper/A/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        question = resp.data["questions"][0]
        self.assertEqual(question["correct"], "a")
        self.assertEqual(question["explanation"], "Because a is a")
        self.assertEqual(question["verifier_answer"], "a")
        self.assertEqual(question["confidence"], 0.99)
        self.assertEqual(question["generated_by"], "Gemini-Pro")
        self.assertIn("question", question)
        self.assertIn("options", question)
        self.assertIn("marks", question)
        self.assertIn("id", question)

    def test_paper_serializer_hides_answers_unless_explicitly_enabled(self):
        serializer = PaperSetSerializer({
            "set_code": "A",
            "label": "Paper A",
            "questions": [{
                "id": "A-1",
                "question": "Q1",
                "options": ["a", "b"],
                "correct": "a",
                "marks": 1,
            }],
            "total_questions": 1,
            "bank_title": "Safe default",
            "bank_type": QuestionBank.BankType.PRESCREENING,
            "course_code": self.course.code,
            "difficulty": QuestionBank.Difficulty.EASY,
        })

        self.assertNotIn("correct", serializer.data["questions"][0])

    def test_student_gets_stripped_by_exam(self):
        """GET /api/question-banks/by-exam/{exam_id}/ strips correct answer from sets_data."""
        from applications.models import Application
        from exams.models import Exam
        from students.models import StudentProfile

        student_user = User.objects.create_user(
            email="secure_student@test.com",
            password="TestPass123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        app = Application.objects.create(
            student=student_user.student_profile,
            course=self.course,
            application_number="APP-SECURE-01",
        )
        exam = Exam.objects.create(
            application=app,
            total_questions=10,
        )
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            exam=exam,
            title="Secure Exam Bank",
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [
                        {
                            "id": 1, 
                            "question": "Q1", 
                            "options": ["a", "b"], 
                            "correct": "a", 
                            "marks": 1,
                            "explanation": "Because a is a",
                            "confidence": 0.99
                        }
                    ],
                }
            },
            created_by=self.admin_user,
        )
        resp = self.client.get(f"/api/question-banks/by-exam/{exam.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        question = resp.data["sets_data"]["A"]["questions"][0]
        self.assertNotIn("correct", question)
        self.assertNotIn("explanation", question)
        self.assertNotIn("confidence", question)
        self.assertIn("question", question)
        self.assertIn("options", question)
        
        # Verify backend grading still sees it by re-fetching from DB
        bank.refresh_from_db()
        db_question = bank.sets_data["A"]["questions"][0]
        self.assertIn("correct", db_question)
        self.assertEqual(db_question["correct"], "a")
