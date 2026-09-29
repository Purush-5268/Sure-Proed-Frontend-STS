from collections import Counter
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.admin import ProctoringRoomAdminForm
from exams.attempts import ensure_module_proctoring_rooms, ensure_proctoring_rooms
from exams.models import Exam, InternalExamAttempt, ModuleTest, ModuleTestSubmission
from question_bank.models import QuestionBank


@override_settings(ALLOW_INTERNAL_EXAM_SUBMISSION=True, JITSI_DOMAIN="meet.jit.si")
class SecureExamWorkflowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="exam-sec-admin@example.com", password="pwd", role=User.Role.ADMIN
        )
        self.student_user = User.objects.create_user(
            email="exam-sec-student@example.com",
            password="pwd",
            role=User.Role.STUDENT,
            first_name="Secure",
            last_name="Student",
        )
        self.course = Course.objects.create(
            code="SEC-EXAM",
            name="Secure Exam Course",
            domain="Technology",
            description="Secure exam tests",
            course_prerequisites=["Arithmetic"],
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            code="SEC-COHORT",
            course=self.course,
            start_date=timezone.localdate(),
            end_date=timezone.localdate(),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        self.application = Application.objects.create(
            student=self.student_user.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.EXAM_PENDING,
        )
        self.exam = Exam.objects.create(
            application=self.application,
            duration_minutes=45,
            pass_percentage=Decimal("60"),
            proctoring_room_count=4,
        )
        self.bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            exam=self.exam,
            title="Immutable papers",
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={
                code: {
                    "label": f"Paper {code}",
                    "questions": [{
                        "id": f"{code}-q1",
                        "question": f"Paper {code}: what is two plus two?",
                        "options": ["3", "4", "5", "6"],
                        "correct": "4",
                        "marks": 1,
                    }],
                }
                for code in "ABCD"
            },
            created_by=self.admin,
        )
        self.client.force_authenticate(self.student_user)

    def test_attempt_persists_paper_snapshot_and_proctor_room(self):
        start = self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")

        self.assertEqual(start.status_code, 200, start.data)
        self.assertNotIn("correct", start.data["questions"][0])
        self.assertTrue(start.data["proctoring"]["enabled"])
        self.assertTrue(start.data["proctoring"]["room_name"])
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        self.assertEqual(attempt.question_bank_id, self.bank.id)
        self.assertIn(attempt.paper_set, "ABCD")
        self.assertIsNotNone(attempt.proctoring_room_id)

        question = attempt.question_snapshot[0]
        original_correct_index = question["options"].index(question["correct"])
        display_index = attempt.option_mapping[question["id"]].index(original_correct_index)
        display_answer = chr(ord("A") + display_index)

        # Editing the source bank after start must not change this attempt's answer key.
        edited = self.bank.sets_data
        edited[attempt.paper_set]["questions"][0]["correct"] = "6"
        self.bank.sets_data = edited
        self.bank.save(update_fields=["sets_data", "updated_at"])
        submit = self.client.post(
            f"/api/exams/{self.exam.id}/submit/",
            {"attempt_id": str(attempt.id), "answers": {question["id"]: display_answer}},
            format="json",
        )
        self.assertEqual(submit.status_code, 200, submit.data)
        self.assertEqual(Decimal(str(submit.data["percentage"])), Decimal("100.00"))

    def test_candidate_preassignment_is_honored_before_balancing(self):
        rooms = ensure_proctoring_rooms(self.exam, self.bank)
        assigned_room = rooms[2]
        assigned_room.assigned_students.add(self.student_user.student_profile)

        start = self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")

        self.assertEqual(start.status_code, 200, start.data)
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        self.assertEqual(attempt.proctoring_room_id, assigned_room.id)

    def test_proctoring_room_admin_form_renders_assigned_and_eligible_students(self):
        room = ensure_proctoring_rooms(self.exam, self.bank)[0]
        room.assigned_students.add(self.student_user.student_profile)

        form = ProctoringRoomAdminForm(instance=room)

        self.assertIn(
            self.student_user.student_profile,
            form.fields["assigned_students"].queryset,
        )

    def test_active_cohort_journey_blocks_an_older_screening_exam(self):
        active_application = Application.objects.create(
            student=self.student_user.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS,
            qualified=True,
        )

        journey = self.client.get("/api/applications/current-journey/")
        blocked = self.client.post(
            f"/api/exams/{self.exam.id}/start-internal/",
            {},
            format="json",
        )

        self.assertEqual(journey.status_code, 200, journey.data)
        self.assertTrue(journey.data["is_enrolled"])
        self.assertEqual(journey.data["application"]["id"], str(active_application.id))
        self.assertEqual(blocked.status_code, 409, blocked.data)
        self.assertEqual(blocked.data["code"], "ACTIVE_COHORT_JOURNEY")
        self.assertEqual(blocked.data["active_application_id"], str(active_application.id))
        self.assertFalse(InternalExamAttempt.objects.filter(exam=self.exam).exists())

    def test_paper_sets_are_balanced_across_candidates(self):
        self.bank.exam = None
        self.bank.save(update_fields=["exam", "updated_at"])
        assigned_sets = []

        for index in range(8):
            if index == 0:
                student_user = self.student_user
                exam = self.exam
            else:
                student_user = User.objects.create_user(
                    email=f"balanced-student-{index}@example.com",
                    password="pwd",
                    role=User.Role.STUDENT,
                )
                application = Application.objects.create(
                    student=student_user.student_profile,
                    course=self.course,
                    status=Application.Status.EXAM_PENDING,
                )
                exam = Exam.objects.create(application=application)
            self.client.force_authenticate(student_user)
            response = self.client.post(f"/api/exams/{exam.id}/start-internal/", {}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            assigned_sets.append(response.data["paper_code"])

        counts = Counter(assigned_sets)
        self.assertEqual(set(counts), set("ABCD"))
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

        room_counts = Counter(
            str(room_id)
            for room_id in InternalExamAttempt.objects.values_list(
                "proctoring_room_id", flat=True
            )
        )
        self.assertEqual(len(room_counts), 1)
        self.assertEqual(list(room_counts.values()), [8])

    def test_autosave_rejects_unassigned_question_and_wrong_attempt(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")
        attempt = InternalExamAttempt.objects.get(exam=self.exam)

        unknown = self.client.post(
            f"/api/exams/{self.exam.id}/autosave/",
            {"attempt_id": str(attempt.id), "answers": {"not-assigned": "A"}},
            format="json",
        )
        wrong_attempt = self.client.post(
            f"/api/exams/{self.exam.id}/autosave/",
            {"attempt_id": "00000000-0000-0000-0000-000000000000", "answers": {}},
            format="json",
        )
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(wrong_attempt.status_code, 400)
        attempt.refresh_from_db()
        self.assertEqual(attempt.answers["responses"], {})

    def test_required_proctoring_rejects_start_when_shared_rooms_are_full(self):
        self.bank.exam = None
        self.bank.save(update_fields=["exam", "updated_at"])
        self.exam.proctoring_room_count = 1
        self.exam.proctoring_capacity_per_room = 1
        self.exam.save(update_fields=["proctoring_room_count", "proctoring_capacity_per_room", "updated_at"])
        first = self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")
        self.assertEqual(first.status_code, 200, first.data)

        second_user = User.objects.create_user(
            email="capacity-student@example.com", password="pwd", role=User.Role.STUDENT
        )
        second_application = Application.objects.create(
            student=second_user.student_profile,
            course=self.course,
            status=Application.Status.EXAM_PENDING,
        )
        second_exam = Exam.objects.create(application=second_application)
        self.client.force_authenticate(second_user)

        blocked = self.client.post(
            f"/api/exams/{second_exam.id}/start-internal/", {}, format="json"
        )

        self.assertEqual(blocked.status_code, 409)
        self.assertIn("capacity", blocked.data["error"].lower())
        self.assertFalse(InternalExamAttempt.objects.filter(exam=second_exam).exists())

    def test_module_test_uses_server_assigned_snapshot_not_client_set(self):
        self.application.status = Application.Status.IN_PROGRESS
        self.application.save(update_fields=["status", "updated_at"])
        module = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            title="Arithmetic Module",
            topics=["Addition"],
            order=1,
        )
        test = ModuleTest.objects.create(
            title="Addition Test",
            course=self.course,
            cohort=self.cohort,
            module=module,
            duration_minutes=20,
            pass_percentage=Decimal("60"),
            proctoring_enabled=True,
            proctoring_required=True,
            is_released=True,
            meeting_link="https://meet.google.com/module-live",
        )
        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=self.course,
            cohort=self.cohort,
            module=module,
            module_test=test,
            title="Module papers",
            total_questions_per_set=1,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data=self.bank.sets_data,
            created_by=self.admin,
        )
        test.question_bank = bank
        test.save(update_fields=["question_bank", "updated_at"])
        rooms = ensure_module_proctoring_rooms(test, bank)
        rooms[1].assigned_students.add(self.student_user.student_profile)

        blocked = self.client.post(f"/api/module-tests/{test.id}/start/", {}, format="json")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data["code"], "ADMIN_NOT_STARTED")
        self.client.force_authenticate(self.admin)
        opened = self.client.post(f"/api/module-tests/{test.id}/admin-start/", {}, format="json")
        self.assertEqual(opened.status_code, 200, opened.data)
        self.client.force_authenticate(self.student_user)
        started = self.client.post(f"/api/module-tests/{test.id}/start/", {}, format="json")
        self.assertEqual(started.status_code, 200, started.data)
        self.assertEqual(started.data["meeting_link"], "https://meet.google.com/module-live")
        self.assertTrue(started.data["proctoring"]["enabled"])
        attempt = ModuleTestSubmission.objects.get(test=test, student=self.student_user.student_profile)
        self.assertEqual(attempt.proctoring_room_id, rooms[1].id)
        question = attempt.question_snapshot[0]
        correct_index = question["options"].index(question["correct"])
        display_index = attempt.option_mapping[question["id"]].index(correct_index)
        submitted = self.client.post(
            f"/api/module-tests/{test.id}/submit/",
            {
                "attempt_id": str(attempt.id),
                "answers": {"set_code": "Z", "responses": {question["id"]: chr(65 + display_index)}},
            },
            format="json",
        )
        self.assertEqual(submitted.status_code, 200, submitted.data)
        self.assertEqual(Decimal(str(submitted.data["percentage"])), Decimal("100.00"))

    def test_unassigned_mentor_cannot_read_room_secrets(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")
        mentor = User.objects.create_user(
            email="unassigned-mentor@example.com", password="pwd", role=User.Role.MENTOR
        )
        self.client.force_authenticate(mentor)

        response = self.client.get(f"/api/exams/{self.exam.id}/proctoring-rooms/")

        self.assertEqual(response.status_code, 404)

    def test_assigned_mentor_cannot_modify_candidate_answers(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        mentor = User.objects.create_user(
            email="assigned-mentor@example.com", password="pwd", role=User.Role.MENTOR
        )
        self.cohort.mentors.add(mentor)
        self.client.force_authenticate(mentor)

        response = self.client.post(
            f"/api/exams/{self.exam.id}/autosave/",
            {
                "attempt_id": str(attempt.id),
                "answers": {attempt.question_mapping[0]: "A"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        attempt.refresh_from_db()
        self.assertEqual(attempt.answers["responses"], {})

    def test_admin_can_read_only_live_candidates_in_proctor_room(self):
        self.client.post(f"/api/exams/{self.exam.id}/start-internal/", {}, format="json")
        attempt = InternalExamAttempt.objects.get(exam=self.exam)
        self.client.force_authenticate(self.admin)

        response = self.client.get(f"/api/exams/{self.exam.id}/proctoring-rooms/")

        self.assertEqual(response.status_code, 200, response.data)
        assigned_room = next(
            room
            for room in response.data["rooms"]
            if room["id"] == str(attempt.proctoring_room_id)
        )
        self.assertTrue(assigned_room["room_name"])
        self.assertTrue(assigned_room["room_password"])
        self.assertEqual(len(assigned_room["active_attempts"]), 1)
