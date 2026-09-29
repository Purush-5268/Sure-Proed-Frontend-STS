from datetime import timedelta
from decimal import Decimal
import uuid

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import User
from applications.models import (
    Application,
    ApplicationStatusAudit,
    PreScreening,
    PreScreeningInterview,
)
from applications.serializers import ApplicationSerializer
from applications.services.journey_service import build_student_journey
from applications.services.offer_letter_generator import issue_offer_letter
from applications.services.state_machine import (
    ApplicationStateInvariantError,
    ApplicationStateTransitionError,
    repair_application_state,
    transition_application_status,
)
from certificates.models import Certificate
from cohorts.models import Cohort
from courses.models import Course
from exams.models import Exam, ModuleTest, ModuleTestSubmission
from question_bank.models import QuestionBank
from exams.serializers import ExamSerializer
from students.models import StudentProfile


class SecurityAndStateMachineTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@suretrust.org", password="admin-password")
        self.student_user = User.objects.create_user(
            email="student@gmail.com", password="student-password", role=User.Role.STUDENT
        )
        self.student = StudentProfile.objects.get(user=self.student_user)
        self.course = Course.objects.create(
            code="PY-101",
            name="Python Fundamentals",
            category=Course.Category.NON_MEDICAL,
            domain="Engineering",
            description="Python introductory course",
            status=Course.Status.PUBLISHED,
            requires_assignments=True,
            requires_module_tests=False,
            requires_capstone=False,
            requires_tree_plantation=False,
            requires_social_activity=False,
            requires_soft_skills_training=False,
            requires_lst_training=False,
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            code="PY101-C1",
            name="Python Cohort 1",
            course=self.course,
            status=Cohort.Status.OPEN,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
            max_students=30,
            created_by=self.admin,
        )
        self.application = Application.objects.create(
            student=self.student,
            course=self.course,
            status=Application.Status.APPLIED,
        )
        self.factory = APIRequestFactory()

    def test_state_machine_forward_lifecycle(self):
        # APPLIED -> EXAM_PENDING
        app = transition_application_status(
            self.application, Application.Status.EXAM_PENDING, user=self.admin, reason="Exam scheduled"
        )
        self.assertEqual(app.status, Application.Status.EXAM_PENDING)

        # EXAM_PENDING -> EXAM_COMPLETED
        app = transition_application_status(
            app, Application.Status.EXAM_COMPLETED, user=self.student_user, reason="Exam submitted"
        )
        self.assertEqual(app.status, Application.Status.EXAM_COMPLETED)

        # EXAM_COMPLETED -> QUALIFIED
        app = transition_application_status(
            app, Application.Status.QUALIFIED, user=self.admin, reason="Scored 90%"
        )
        self.assertEqual(app.status, Application.Status.QUALIFIED)

        # QUALIFIED -> COHORT_ASSIGNED (requires assigned_cohort)
        app.assigned_cohort = self.cohort
        app.save()
        app = transition_application_status(
            app, Application.Status.COHORT_ASSIGNED, user=self.admin, reason="Cohort Py101 assigned"
        )
        self.assertEqual(app.status, Application.Status.COHORT_ASSIGNED)

        # COHORT_ASSIGNED -> IN_PROGRESS
        app = transition_application_status(
            app, Application.Status.IN_PROGRESS, user=self.admin, reason="Batch started"
        )
        self.assertEqual(app.status, Application.Status.IN_PROGRESS)

        # IN_PROGRESS -> COMPLETED (requires completion invariants)
        with self.assertRaises(ApplicationStateInvariantError):
            transition_application_status(
                app, Application.Status.COMPLETED, user=self.admin, reason="Attempted complete without final score"
            )

        app.completed_course = True
        app.completed_at = timezone.now()
        app.final_score = Decimal("88.50")
        app.save()
        app = transition_application_status(
            app, Application.Status.COMPLETED, user=self.admin, reason="Graduated"
        )
        self.assertEqual(app.status, Application.Status.COMPLETED)

        # Verify audit logs
        audits = ApplicationStatusAudit.objects.filter(application=app).order_by("created_at")
        self.assertGreaterEqual(audits.count(), 6)
        self.assertEqual(audits.last().to_status, Application.Status.COMPLETED)

    def test_state_machine_universal_discontinuation(self):
        # Any active state can drop to DROPPED or CANCELLED
        for initial_status in [
            Application.Status.APPLIED,
            Application.Status.EXAM_PENDING,
            Application.Status.EXAM_COMPLETED,
            Application.Status.PRESCREENING_PENDING,
            Application.Status.PRESCREENING_COMPLETED,
            Application.Status.QUALIFIED,
            Application.Status.WAITLISTED,
        ]:
            app = Application.objects.create(
                student=self.student,
                course=self.course,
                status=initial_status,
            )
            dropped = transition_application_status(
                app, Application.Status.DROPPED, user=self.student_user, reason="Student opted out"
            )
            self.assertEqual(dropped.status, Application.Status.DROPPED)

    def test_state_machine_privileged_repair(self):
        self.application.assigned_cohort = self.cohort
        self.application.completed_course = True
        self.application.completed_at = timezone.now()
        self.application.final_score = Decimal("95.00")
        self.application.status = Application.Status.COMPLETED
        self.application.save()

        # Create issued certificate
        cert = Certificate.objects.create(
            application=self.application,
            student=self.student,
            certificate_number="CERT-PY-12345",
            verification_code="VERIFY-12345",
            certificate_type=Certificate.CertificateType.COURSE,
            status=Certificate.Status.ACTIVE,
            issued_at=timezone.now(),
        )

        # Normal transition from COMPLETED is rejected
        with self.assertRaises(ApplicationStateTransitionError):
            transition_application_status(
                self.application, Application.Status.IN_PROGRESS, user=self.admin, reason="Admin repair"
            )

        # Privileged repair succeeds and cascades certificate revocation
        repaired = repair_application_state(
            self.application,
            Application.Status.IN_PROGRESS,
            admin_user=self.admin,
            reason="Remediation for academic audit recalculation",
        )
        self.assertEqual(repaired.status, Application.Status.IN_PROGRESS)
        cert.refresh_from_db()
        self.assertEqual(cert.status, Certificate.Status.REVOKED)

        # Verify audit marked as is_repair
        repair_audit = ApplicationStatusAudit.objects.filter(application=self.application, is_repair=True).first()
        self.assertIsNotNone(repair_audit)
        self.assertEqual(repair_audit.from_status, Application.Status.COMPLETED)
        self.assertEqual(repair_audit.to_status, Application.Status.IN_PROGRESS)

    def test_offer_letter_two_phase_staging_and_verification(self):
        self.application.assigned_cohort = self.cohort
        self.application.qualified = True
        self.application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        self.application.status = Application.Status.COHORT_ASSIGNED
        self.application.save()

        issued_app = issue_offer_letter(self.application)
        self.assertEqual(issued_app.offer_letter_status, Application.OfferLetterStatus.ISSUED)
        self.assertTrue(issued_app.offer_letter_issued)
        self.assertTrue(bool(issued_app.offer_letter_hash))

        # Public verification
        request = self.factory.get(f"/api/applications/verify-offer-letter/?hash={issued_app.offer_letter_hash}")
        from applications.views import ApplicationViewSet
        view = ApplicationViewSet.as_view({"get": "verify_offer_letter"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])

    def test_non_staff_application_serializer_rejection(self):
        # Non-staff student attempting to change workflow fields must get 400 ValidationError
        serializer = ApplicationSerializer(
            instance=self.application,
            data={"status": "QUALIFIED", "qualified": True},
            partial=True,
            context={"request": type("Req", (), {"user": self.student_user})()},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("status", serializer.errors)
        self.assertIn("qualified", serializer.errors)

    def test_admin_role_verification_action_enforces_checks(self):
        from applications.views import ApplicationViewSet

        view = ApplicationViewSet.as_view({"post": "review_role_verification"})
        blocked_request = self.factory.post(
            f"/api/applications/{self.application.id}/role-verification/",
            {"status": "VERIFIED", "remarks": "Reviewed"},
            format="json",
        )
        force_authenticate(blocked_request, user=self.admin)
        blocked_response = view(blocked_request, pk=self.application.id)

        self.assertEqual(blocked_response.status_code, 409)
        self.assertTrue(blocked_response.data["blockers"])

        self.application.status = Application.Status.QUALIFIED
        self.application.qualified = True
        self.application.save(update_fields=["status", "qualified", "updated_at"])
        self.student.is_linkedin_connected = True
        self.student.github_url = "https://github.com/verified-student"
        self.student.save(update_fields=["is_linkedin_connected", "github_url", "updated_at"])
        PreScreeningInterview.objects.create(
            application=self.application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
        )

        verified_request = self.factory.post(
            f"/api/applications/{self.application.id}/role-verification/",
            {"status": "VERIFIED", "remarks": "All checks completed"},
            format="json",
        )
        force_authenticate(verified_request, user=self.admin)
        verified_response = view(verified_request, pk=self.application.id)

        self.assertEqual(verified_response.status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(
            self.application.role_verification_status,
            Application.RoleVerificationStatus.VERIFIED,
        )
        self.assertEqual(self.application.role_verified_by, self.admin)
        self.assertIsNotNone(self.application.role_verified_at)

    def test_application_owner_cannot_change_course_or_student(self):
        other_course = Course.objects.create(
            code="JS-101",
            name="JavaScript Fundamentals",
            category=Course.Category.NON_MEDICAL,
            domain="Engineering",
            description="JavaScript introductory course",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        other_user = User.objects.create_user(
            email="other-student@gmail.com",
            password="student-password",
            role=User.Role.STUDENT,
        )
        other_student = StudentProfile.objects.get(user=other_user)
        serializer = ApplicationSerializer(
            instance=self.application,
            data={"course": str(other_course.id), "student": str(other_student.id)},
            partial=True,
            context={"request": type("Req", (), {"user": self.student_user})()},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("course", serializer.errors)
        self.assertIn("student", serializer.errors)

    def test_completed_interview_does_not_mean_passed(self):
        self.application.status = Application.Status.EXAM_COMPLETED
        self.application.save(update_fields=["status", "updated_at"])
        interview = PreScreeningInterview.objects.create(
            application=self.application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.COMPLETED,
        )
        self.application.refresh_from_db()
        self.assertEqual(interview.status, PreScreeningInterview.Status.COMPLETED)
        self.assertNotEqual(
            self.application.status,
            Application.Status.PRESCREENING_COMPLETED,
        )

    def test_completed_is_terminal_for_ordinary_transitions(self):
        self.application.assigned_cohort = self.cohort
        self.application.completed_course = True
        self.application.completed_at = timezone.now()
        self.application.final_score = Decimal("90.00")
        self.application.status = Application.Status.COMPLETED
        self.application.save()
        with self.assertRaises(ApplicationStateTransitionError):
            transition_application_status(
                self.application,
                Application.Status.COHORT_ASSIGNED,
                user=self.admin,
                reason="Attempted ordinary reopen",
            )

    def test_cohort_and_course_transfer_actions_are_audited(self):
        from applications.views import ApplicationViewSet

        self.application.assigned_cohort = self.cohort
        self.application.status = Application.Status.IN_PROGRESS
        self.application.save()
        second_cohort = Cohort.objects.create(
            code="PY101-C2",
            name="Python Cohort 2",
            course=self.course,
            status=Cohort.Status.OPEN,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
            max_students=30,
            created_by=self.admin,
        )
        request = self.factory.post(
            "/api/applications/transfer-cohort/",
            {"cohort_id": str(second_cohort.id)},
            format="json",
        )
        force_authenticate(request, user=self.admin)
        response = ApplicationViewSet.as_view({"post": "transfer_cohort"})(
            request,
            pk=self.application.id,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(
            ApplicationStatusAudit.objects.filter(
                application=self.application,
                actor=self.admin,
                reason__icontains="Cohort transferred",
            ).exists()
        )

        target_course = Course.objects.create(
            code="GO-101",
            name="Go Fundamentals",
            category=Course.Category.NON_MEDICAL,
            domain="Engineering",
            description="Go introductory course",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        target_cohort = Cohort.objects.create(
            code="GO101-C1",
            name="Go Cohort 1",
            course=target_course,
            status=Cohort.Status.OPEN,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
            max_students=30,
            created_by=self.admin,
        )
        request = self.factory.post(
            "/api/applications/transfer-course-cohort/",
            {
                "course_id": str(target_course.id),
                "cohort_id": str(target_cohort.id),
                "reason": "Student requested a different programme",
            },
            format="json",
        )
        force_authenticate(request, user=self.admin)
        response = ApplicationViewSet.as_view({"post": "transfer_course_cohort"})(
            request,
            pk=self.application.id,
        )
        self.assertEqual(response.status_code, 201, response.data)
        new_application = Application.objects.get(id=response.data["new_application"]["id"])
        self.assertEqual(new_application.course, target_course)
        self.assertEqual(new_application.assigned_cohort, target_cohort)
        self.assertTrue(
            ApplicationStatusAudit.objects.filter(
                application=new_application,
                actor=self.admin,
            ).exists()
        )

    @override_settings(ALLOW_INTERNAL_EXAM_SUBMISSION=True)
    def test_internal_exam_submission_requires_started_attempt(self):
        from exams.views import ExamViewSet

        exam = Exam.objects.create(application=self.application)
        request = self.factory.post(
            "/api/exams/submit/",
            {"answers": {"q1": 0}},
            format="json",
        )
        force_authenticate(request, user=self.student_user)
        response = ExamViewSet.as_view({"post": "submit_exam"})(
            request,
            pk=exam.id,
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("Start the exam", response.data["error"])

    def test_grading_supports_zero_index_and_correct_index(self):
        from exams.grading import answer_matches

        question = {
            "options": ["Alpha", "Beta", "Gamma"],
            "correct_index": 0,
        }
        self.assertTrue(answer_matches(question, 0))
        self.assertTrue(answer_matches(question, "Alpha"))
        self.assertFalse(answer_matches(question, 1))

    def test_non_staff_exam_serializer_rejection(self):
        exam = Exam.objects.create(
            application=self.application,
            total_marks=100,
            pass_percentage=60,
            status=Exam.Status.PENDING,
        )
        serializer = ExamSerializer(
            instance=exam,
            data={"marks_obtained": 100, "qualified": True, "status": "EVALUATED"},
            partial=True,
            context={"request": type("Req", (), {"user": self.student_user})()},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("marks_obtained", serializer.errors)
        self.assertIn("qualified", serializer.errors)

    def test_dynamic_course_completion_evaluation(self):
        journey = build_student_journey(self.student, self.application)
        steps_by_code = {s["code"]: s for s in journey["steps"]}
        self.assertEqual(steps_by_code["CAPSTONE"]["state"], "NOT_REQUIRED")
        self.assertEqual(steps_by_code["TREE_PLANTATION"]["state"], "NOT_REQUIRED")
        self.assertEqual(steps_by_code["SKILLS_TRAINING"]["state"], "NOT_REQUIRED")
        self.assertEqual(steps_by_code["SOCIAL_RESPONSIBILITY"]["state"], "NOT_REQUIRED")

    def test_cohort_capacity_enforcement(self):
        # Disable interview requirement for course and set student profile requirements
        self.course.requires_interview = False
        self.course.save()

        # Create a small cohort with max_students = 1
        limited_cohort = Cohort.objects.create(
            code="PY101-LIMIT",
            name="Limited Cohort",
            course=self.course,
            status=Cohort.Status.OPEN,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=90),
            max_students=1,
            created_by=self.admin,
        )
        self.application.assigned_cohort = limited_cohort
        self.application.status = Application.Status.COHORT_ASSIGNED
        self.application.save()

        # Create a second student and application
        student2_user = User.objects.create_user(email="student2@gmail.com", password="password", role=User.Role.STUDENT)
        student2_profile = StudentProfile.objects.get(user=student2_user)
        student2_profile.is_linkedin_connected = True
        student2_profile.is_github_connected = True
        student2_profile.save()

        app2 = Application.objects.create(
            student=student2_profile,
            course=self.course,
            status=Application.Status.QUALIFIED,
            qualified=True,
            role_verification_status=Application.RoleVerificationStatus.VERIFIED,
        )

        from applications.views import ApplicationViewSet
        request = self.factory.post(
            f"/api/applications/{app2.id}/assign-cohort/",
            {"cohort_id": str(limited_cohort.id)},
            format="json",
        )
        force_authenticate(request, user=self.admin)
        response = ApplicationViewSet.as_view({"post": "assign_cohort"})(request, pk=app2.id)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data.get("code"), "COHORT_FULL")

    def test_reset_offer_letter_cleans_hash_and_closes_requests(self):
        from common.models import UserRequest
        from applications.views import ApplicationViewSet

        self.application.assigned_cohort = self.cohort
        self.application.qualified = True
        self.application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        self.application.status = Application.Status.COHORT_ASSIGNED
        self.application.save()

        issued_app = issue_offer_letter(self.application)
        self.assertEqual(issued_app.offer_letter_status, Application.OfferLetterStatus.ISSUED)
        self.assertTrue(bool(issued_app.offer_letter_hash))

        # Create an associated user request
        user_req = UserRequest.objects.create(
            request_number="REQ-OFFER-1",
            sender=self.student_user,
            sender_role="STUDENT",
            related_application=issued_app,
            category=UserRequest.Category.OFFER_LETTER,
            subject="Offer letter request",
            status=UserRequest.Status.IN_PROGRESS,
        )

        request = self.factory.post(f"/api/applications/{issued_app.id}/reset-offer-letter/", {}, format="json")
        force_authenticate(request, user=self.admin)
        response = ApplicationViewSet.as_view({"post": "reset_offer_letter"})(request, pk=issued_app.id)

        self.assertEqual(response.status_code, 200)
        issued_app.refresh_from_db()
        self.assertEqual(issued_app.offer_letter_status, Application.OfferLetterStatus.NOT_GENERATED)
        self.assertFalse(bool(issued_app.offer_letter_hash))
        self.assertFalse(bool(issued_app.offer_letter_file))

        user_req.refresh_from_db()
        self.assertEqual(user_req.status, UserRequest.Status.CLOSED)

    def test_server_side_module_test_grading(self):
        from question_bank.models import QuestionBank
        from exams.views import ModuleTestViewSet

        self.application.assigned_cohort = self.cohort
        self.application.status = Application.Status.IN_PROGRESS
        self.application.save()

        module_test = ModuleTest.objects.create(
            course=self.course,
            cohort=self.cohort,
            title="Module 1 Test",
            pass_percentage=50,
            is_active=True,
            is_released=True,
            admin_started_at=timezone.now(),
        )
        qb = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            title="Module 1 QB",
            course=self.course,
            cohort=self.cohort,
            module_test=module_test,
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={
                "A": {
                    "questions": [{
                        "id": "q1",
                        "question": "What is Python?",
                        "options": ["A language", "A snake", "A database", "An operating system"],
                        "correct": "A language",
                        "marks": 1,
                    }]
                }
            },
            created_by=self.admin,
        )
        module_test.question_bank = qb
        module_test.save(update_fields=["question_bank", "is_released", "updated_at"])

        start_request = self.factory.post(
            f"/api/module-tests/{module_test.id}/start/", {}, format="json"
        )
        force_authenticate(start_request, user=self.student_user)
        started = ModuleTestViewSet.as_view({"post": "start"})(
            start_request, pk=module_test.id
        )
        self.assertEqual(started.status_code, 200, started.data)
        question = started.data["questions"][0]
        answer_index = question["options"].index("A language")
        displayed_answer = chr(ord("A") + answer_index)

        submit_request = self.factory.post(
            f"/api/module-tests/{module_test.id}/submit/",
            {
                "attempt_id": started.data["attempt_id"],
                "answers": {"q1": displayed_answer},
                "marks_obtained": 0,  # Untrusted client input is ignored.
                "passed": False,
            },
            format="json",
        )
        force_authenticate(submit_request, user=self.student_user)
        response = ModuleTestViewSet.as_view({"post": "submit"})(
            submit_request, pk=module_test.id
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["marks_obtained"], Decimal("1.00"))
        self.assertTrue(response.data["qualified"])

        # Second submission should be rejected (duplicate constraint)
        second_request = self.factory.post(
            f"/api/module-tests/{module_test.id}/submit/",
            {
                "attempt_id": started.data["attempt_id"],
                "answers": {"q1": displayed_answer},
            },
            format="json",
        )
        force_authenticate(second_request, user=self.student_user)
        response2 = ModuleTestViewSet.as_view({"post": "submit"})(
            second_request, pk=module_test.id
        )
        self.assertEqual(response2.status_code, 409)

    def test_static_code_audit_no_uncontrolled_status_writes(self):
        """
        Static verification using Python AST parser scanning all backend Python source files
        to guarantee no direct Application status mutations bypass transition_application_status().
        """
        import ast
        import os

        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        violating_files = []

        class StatusWriteDetector(ast.NodeVisitor):
            def __init__(self, filename):
                self.filename = filename
                self.violations = []

            def visit_Assign(self, node):
                # Detect `app.status = ...` or `application.status = ...`
                for target in node.targets:
                    if isinstance(target, ast.Attribute) and target.attr == "status":
                        # Allow model definitions (e.g. status = models.CharField...)
                        if not (isinstance(node.value, ast.Call) and getattr(node.value.func, "id", "") in ["CharField", "IntegerField", "TextChoices"]):
                            val_str = ast.unparse(node.value) if hasattr(ast, "unparse") else ""
                            target_str = ast.unparse(target) if hasattr(ast, "unparse") else ""
                            if "Application.Status" in val_str or target_str.startswith(("app.", "application.")):
                                self.violations.append(f"{self.filename}:{node.lineno} -> {target_str} = {val_str}")
                self.generic_visit(node)

            def visit_Call(self, node):
                # Detect `Application.objects.filter(...).update(status=...)`
                if isinstance(node.func, ast.Attribute) and node.func.attr == "update":
                    for kw in node.keywords:
                        if kw.arg == "status":
                            call_str = ast.unparse(node.func) if hasattr(ast, "unparse") else ""
                            if "Application" in call_str:
                                self.violations.append(f"{self.filename}:{node.lineno} -> {call_str}(status=...)")
                self.generic_visit(node)

        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Review source once; archived review checkouts and build outputs
            # are not part of the application's executable source tree.
            dirnames[:] = [d for d in dirnames if d not in {"output", "build", ".venv", "venv", ".git", "__pycache__"}]
            if any(p in dirpath for p in ["migrations", "tests", ".venv", "venv", ".git", "scratch"]):
                continue
            for f in filenames:
                if f.endswith(".py") and not f.startswith("test") and f not in {"state_machine.py", "models.py", "services.py"}:
                    file_path = os.path.join(dirpath, f)
                    try:
                        with open(file_path, "r", encoding="utf-8") as src_file:
                            tree = ast.parse(src_file.read(), filename=file_path)
                            detector = StatusWriteDetector(f)
                            detector.visit(tree)
                            violating_files.extend(detector.violations)
                    except Exception:
                        pass

        self.assertEqual(
            violating_files,
            [],
            f"Found direct Application status writes bypassing transition_application_status: {violating_files}",
        )
