from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib import admin
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application, CommunityActivity, PreScreening, PreScreeningInterview
from applications.services.journey_service import build_student_journey
from applications.services.workflow_service import calculate_and_process_course_completion
from assignments.models import Assignment, Submission
from attendance.models import Attendance
from certificates.models import Certificate
from cohorts.models import Cohort
from cohorts.admin import CohortAdminForm
from courses.models import Course, CourseModule
from courses.serializers import CourseSerializer
from exams.models import Exam, ModuleTest, ModuleTestSubmission
from trainings.models import Training, TrainingAttendance, TrainingSession


class CompleteStudentJourneyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(email="journey-admin@example.com", password="test-pass")
        self.mentor = User.objects.create_user(
            email="journey-mentor@example.com",
            password="test-pass",
            role=User.Role.MENTOR,
        )
        self.student_user = User.objects.create_user(
            email="journey-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
            first_name="Journey",
            last_name="Student",
            phone_number="9999999999",
        )
        self.student = self.student_user.student_profile
        self.student.college = "SURE College"
        self.student.degree = "B.Tech"
        self.student.is_linkedin_connected = True
        self.student.linkedin_url = "https://linkedin.com/in/journey-student"
        self.student.github_url = "https://github.com/journey-student"
        self.student.is_github_connected = True
        self.student.save()
        self.course = Course.objects.create(
            code="JOURNEY-101",
            name="Complete Student Journey",
            domain="Technology",
            description="End-to-end journey test",
            status=Course.Status.PUBLISHED,
            minimum_attendance_percentage=Decimal("75.00"),
            minimum_assignment_percentage=Decimal("60.00"),
            created_by=self.admin,
        )
        today = timezone.localdate()
        self.cohort = Cohort.objects.create(
            code="JOURNEY-C1",
            name="Journey Cohort",
            course=self.course,
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        self.cohort.mentors.add(self.mentor)
        self.open_cohort = Cohort.objects.create(
            code="JOURNEY-OPEN",
            name="Journey Open Cohort",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=90),
            status=Cohort.Status.OPEN,
            created_by=self.admin,
        )

    def _application(self, **overrides):
        defaults = {
            "application_number": "APP-JOURNEY-001",
            "student": self.student,
            "course": self.course,
            "status": Application.Status.QUALIFIED,
            "qualified": True,
        }
        defaults.update(overrides)
        return Application.objects.create(**defaults)

    def test_admin_cohort_choices_are_role_filtered_and_course_eligible(self):
        volunteer = User.objects.create_user(
            email="journey-volunteer@example.com", password="test-pass", role=User.Role.VOLUNTEER
        )
        trustee = User.objects.create_user(
            email="journey-trustee@example.com", password="test-pass", role=User.Role.TRUSTEE
        )
        application = self._application()
        PreScreeningInterview.objects.create(
            application=application,
            status=PreScreeningInterview.Status.PASSED,
        )
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.save(update_fields=["role_verification_status", "updated_at"])

        form = CohortAdminForm(instance=self.cohort)

        self.assertQuerySetEqual(form.fields["mentors"].queryset, [self.mentor])
        self.assertQuerySetEqual(form.fields["volunteers"].queryset, [trustee, volunteer])
        self.assertQuerySetEqual(form.fields["applications_to_assign"].queryset, [application])
        self.assertIn("Eligible now: 1", form.fields["applications_to_assign"].help_text)
        option_label = form.fields["applications_to_assign"].label_from_instance(application)
        self.assertIn(application.application_number, option_label)
        self.assertIn(self.student.student_code, option_label)
        self.assertIn("Current cohort: Not assigned", option_label)
        request = RequestFactory().get(f"/secure-admin/cohorts/cohort/{self.cohort.id}/change/")
        request.user = self.admin
        admin_form = admin.site._registry[Cohort].get_form(request, self.cohort)
        if "volunteers" in admin_form.base_fields:
            volunteer_widget = admin_form.base_fields["volunteers"].widget
            self.assertFalse(volunteer_widget.can_add_related)

    def test_existing_trustee_account_can_be_assigned_as_cohort_volunteer(self):
        trustee = User.objects.create_user(
            email="existing-volunteer@example.com",
            password="test-pass",
            role=User.Role.TRUSTEE,
        )
        self.client.force_authenticate(self.admin)

        assigned = self.client.post(
            f"/api/cohorts/{self.cohort.id}/assign_volunteer/",
            {"volunteer_id": str(trustee.id)},
            format="json",
        )

        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.assertTrue(self.cohort.volunteers.filter(pk=trustee.pk).exists())

        self.client.force_authenticate(trustee)
        visible = self.client.get("/api/cohorts/")
        self.assertEqual(visible.status_code, 200, visible.data)
        rows = visible.data.get("results", visible.data) if isinstance(visible.data, dict) else visible.data
        cohort_ids = {str(row["id"]) for row in rows}
        self.assertIn(str(self.cohort.id), cohort_ids)

    def test_course_api_exposes_real_ordered_modules(self):
        CourseModule.objects.create(
            course=self.course,
            module_number=1,
            order=1,
            title="Foundation",
            topics=["Basics", "Practice"],
            duration_weeks=2,
        )

        payload = CourseSerializer(self.course).data

        self.assertEqual(len(payload["modules"]), 1)
        self.assertEqual(payload["modules"][0]["title"], "Foundation")

    def test_course_default_screening_date_is_assigned_when_student_applies(self):
        screening_at = timezone.now() + timedelta(days=5)
        self.course.default_screening_at = screening_at
        self.course.save(update_fields=["default_screening_at", "updated_at"])
        self.client.force_authenticate(self.student_user)

        response = self.client.post(
            "/api/applications/",
            {"course": str(self.course.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        application = Application.objects.get(pk=response.data["id"])
        pre_screening = application.pre_screening
        self.assertEqual(pre_screening.scheduled_at, screening_at)
        self.assertEqual(application.status, Application.Status.EXAM_PENDING)
        self.assertEqual(
            parse_datetime(response.data["pre_screening"]["scheduled_at"]),
            screening_at,
        )
        self.assertTrue(
            self.student_user.notifications.filter(title="Pre-screen exam scheduled").exists()
        )

    def test_empty_course_screening_date_can_be_scheduled_manually_later(self):
        self.client.force_authenticate(self.student_user)
        applied = self.client.post(
            "/api/applications/",
            {"course": str(self.course.id)},
            format="json",
        )
        self.assertEqual(applied.status_code, 201, applied.data)
        application = Application.objects.get(pk=applied.data["id"])
        self.assertFalse(hasattr(application, "pre_screening"))

        screening_at = timezone.now() + timedelta(days=4)
        self.client.force_authenticate(self.admin)
        scheduled = self.client.post(
            "/api/pre-screenings/",
            {
                "application": str(application.id),
                "scheduled_at": screening_at.isoformat(),
                "status": "SCHEDULED",
            },
            format="json",
        )

        self.assertEqual(scheduled.status_code, 201, scheduled.data)
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.EXAM_PENDING)
        self.assertEqual(application.pre_screening.scheduled_at, screening_at)

    def test_screening_exam_can_be_rescheduled_and_notifies_student(self):
        application = self._application(status=Application.Status.EXAM_PENDING)
        old_time = timezone.now() + timedelta(days=1)
        pre_screening = PreScreening.objects.create(
            application=application,
            interviewer="SURE Examiner",
            status=PreScreening.Status.SCHEDULED,
            scheduled_at=old_time,
        )
        self.client.force_authenticate(self.admin)

        missing_new_time = self.client.post(
            f"/api/pre-screenings/{pre_screening.id}/update-status/",
            {"status": PreScreening.Status.RESCHEDULED},
            format="json",
        )
        self.assertEqual(missing_new_time.status_code, 400)
        self.assertIn("scheduled_at", missing_new_time.data)

        new_time = timezone.now() + timedelta(days=3)
        rescheduled = self.client.post(
            f"/api/pre-screenings/{pre_screening.id}/update-status/",
            {
                "status": PreScreening.Status.RESCHEDULED,
                "scheduled_at": new_time.isoformat(),
            },
            format="json",
        )

        self.assertEqual(rescheduled.status_code, 200, rescheduled.data)
        pre_screening.refresh_from_db()
        application.refresh_from_db()
        self.assertEqual(pre_screening.status, PreScreening.Status.RESCHEDULED)
        self.assertEqual(pre_screening.scheduled_at, new_time)
        self.assertEqual(application.status, Application.Status.EXAM_PENDING)
        self.assertEqual(
            PreScreening._meta.get_field("interviewer").verbose_name,
            "Examiner",
        )
        self.assertTrue(
            self.student_user.notifications.filter(title="Pre-screen exam rescheduled").exists()
        )

    @override_settings(ALLOW_INTERNAL_EXAM_SUBMISSION=True)
    def test_android_string_answers_are_evaluated_and_publish_result(self):
        from question_bank.models import QuestionBank
        
        application = self._application(status=Application.Status.EXAM_PENDING, qualified=None)
        exam = Exam.objects.create(
            application=application,
            status=Exam.Status.PENDING,
            pass_percentage=Decimal("60.00"),
        )
        
        # Create a QuestionBank linked to the exam
        QuestionBank.objects.create(
            course=self.course,
            exam=exam,
            bank_type=QuestionBank.BankType.PRESCREENING,
            title="Test Bank",
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [
                        {"id": "1", "question": "Q1", "options": ["A", "B"], "correct": "A", "marks": 5},
                        {"id": "2", "question": "Q2", "options": ["A", "B"], "correct": "B", "marks": 5},
                    ]
                }
            },
            is_active=True,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
        )
        
        self.client.force_authenticate(self.student_user)

        started = self.client.post(
            f"/api/exams/{exam.id}/start-internal/",
            {},
            format="json",
        )
        self.assertEqual(started.status_code, 200, started.data)

        # Mobile clients answer the randomized display options. Convert the
        # known correct values to the displayed A/B positions returned by the
        # server instead of assuming the source-bank order was preserved.
        correct_values = {"1": "A", "2": "B"}
        displayed_responses = {}
        for question in started.data["questions"]:
            correct_index = question["options"].index(correct_values[question["id"]])
            displayed_responses[question["id"]] = chr(ord("A") + correct_index)

        response = self.client.post(
            f"/api/exams/{exam.id}/submit/",
            {
                "attempt_id": started.data["attempt_id"],
                "answers": displayed_responses,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["passed"])
        self.assertEqual(response.data["score"], 100)
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.EXAM_COMPLETED)
        self.assertTrue(application.qualified)

    @patch("applications.views.send_async_cohort_assignment.delay")
    def test_cohort_assignment_requires_passed_interview_and_matching_course(self, send_assignment_email):
        application = self._application()
        self.client.force_authenticate(self.admin)

        blocked = self.client.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(self.cohort.id)},
            format="json",
        )

        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data["code"], "INTERVIEW_REQUIRED")
        PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
        )
        role_blocked = self.client.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(self.cohort.id)}, format="json",
        )
        self.assertEqual(role_blocked.status_code, 409)
        self.assertEqual(role_blocked.data["code"], "ROLE_VERIFICATION_REQUIRED")
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.role_verified_by = self.admin
        application.role_verified_at = timezone.now()
        application.save(update_fields=[
            "role_verification_status", "role_verified_by", "role_verified_at", "updated_at"
        ])

        assigned = self.client.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(self.cohort.id)},
            format="json",
        )

        self.assertEqual(assigned.status_code, 200, assigned.data)
        application.refresh_from_db()
        self.assertEqual(application.assigned_cohort, self.cohort)
        send_assignment_email.assert_called_once()

    @patch("applications.views.send_async_cohort_assignment.delay")
    def test_course_can_skip_interview_without_blocking_journey_or_cohort(self, send_assignment_email):
        self.course.requires_interview = False
        self.course.save(update_fields=["requires_interview", "updated_at"])
        application = self._application()
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.role_verified_by = self.admin
        application.role_verified_at = timezone.now()
        application.save(update_fields=[
            "role_verification_status", "role_verified_by", "role_verified_at", "updated_at"
        ])

        journey = build_student_journey(self.student, application)

        interview_step = next(step for step in journey["steps"] if step["code"] == "INTERVIEW")
        self.assertFalse(journey["interview_required"])
        self.assertTrue(interview_step["completed"])
        self.assertEqual(interview_step["subtitle"], "Interview not required for this course")
        self.assertTrue(journey["can_assign_cohort"])

        form = CohortAdminForm(instance=self.cohort)
        self.assertIn(application, form.fields["applications_to_assign"].queryset)

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/applications/{application.id}/assign-cohort/",
            {"cohort_id": str(self.cohort.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        application.refresh_from_db()
        self.assertEqual(application.assigned_cohort, self.cohort)
        send_assignment_email.assert_called_once()

    def test_interview_reschedule_requires_and_publishes_new_datetime(self):
        application = self._application()
        old_time = timezone.now() + timedelta(days=1)
        interview = PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.SCHEDULED,
            scheduled_at=old_time,
        )
        self.client.force_authenticate(self.admin)

        missing_time = self.client.post(
            f"/api/pre-screening-interviews/{interview.id}/update-status/",
            {"status": PreScreeningInterview.Status.RESCHEDULED},
            format="json",
        )
        self.assertEqual(missing_time.status_code, 400)
        self.assertIn("scheduled_at", missing_time.data)

        new_time = timezone.now() + timedelta(days=3)
        updated = self.client.post(
            f"/api/pre-screening-interviews/{interview.id}/update-status/",
            {
                "status": PreScreeningInterview.Status.RESCHEDULED,
                "scheduled_at": new_time.isoformat(),
            },
            format="json",
        )

        self.assertEqual(updated.status_code, 200, updated.data)
        interview.refresh_from_db()
        self.assertEqual(interview.status, PreScreeningInterview.Status.RESCHEDULED)
        self.assertEqual(interview.scheduled_at, new_time)
        self.assertTrue(
            self.student_user.notifications.filter(title="Interview rescheduled").exists()
        )

    def test_interview_join_link_only_appears_while_scheduled(self):
        application = self._application()
        interview = PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.SCHEDULED,
            scheduled_at=timezone.now() + timedelta(days=1),
            meeting_link="https://meet.google.com/abc-defg-hij",
        )

        scheduled = build_student_journey(self.student, application)
        interview_step = next(step for step in scheduled["steps"] if step["code"] == "INTERVIEW")
        self.assertEqual(interview_step["action_url"], interview.meeting_link)

        interview.status = PreScreeningInterview.Status.PASSED
        interview.save(update_fields=["status", "updated_at"])
        passed = build_student_journey(self.student, application)
        interview_step = next(step for step in passed["steps"] if step["code"] == "INTERVIEW")
        self.assertIsNone(interview_step["action_url"])

    def test_post_cohort_parallel_phase_precedes_capstone(self):
        application = self._application(
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS,
        )
        PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
        )

        journey = build_student_journey(self.student, application)
        by_number = {step["step_number"]: step for step in journey["steps"]}

        self.assertEqual(by_number[11]["code"], "COURSEWORK")
        self.assertEqual(by_number[12]["code"], "ASSIGNMENTS")
        self.assertEqual(by_number[13]["code"], "SKILLS_TRAINING")
        self.assertEqual(by_number[14]["code"], "CAPSTONE")
        self.assertEqual(by_number[11]["state"], "CURRENT")
        self.assertEqual(by_number[12]["state"], "CURRENT")
        self.assertEqual(by_number[13]["state"], "CURRENT")
        self.assertEqual(by_number[14]["state"], "UPCOMING")

    @patch("applications.services.workflow_service.send_async_certificate_notification.delay")
    def test_certificate_is_issued_only_after_all_18_requirements(self, send_certificate_email):
        application = self._application(
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS,
        )
        PreScreeningInterview.objects.create(
            application=application,
            interviewer=self.admin,
            status=PreScreeningInterview.Status.PASSED,
            scheduled_at=timezone.now() - timedelta(days=20),
        )
        application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        application.role_verified_by = self.admin
        application.role_verified_at = timezone.now() - timedelta(days=19)
        application.save(update_fields=[
            "role_verification_status", "role_verified_by", "role_verified_at", "updated_at"
        ])
        Exam.objects.create(
            application=application,
            status=Exam.Status.EVALUATED,
            submitted_at=timezone.now() - timedelta(days=25),
            marks_obtained=Decimal("80.00"),
            total_marks=Decimal("100.00"),
            percentage=Decimal("80.00"),
            qualified=True,
        )
        session = Attendance.objects.create(
            cohort=self.cohort,
            title="Journey class",
            class_date=timezone.localdate() - timedelta(days=10),
            start_time=time(10, 0),
            end_time=time(11, 0),
            class_status=Attendance.ClassStatus.COMPLETED,
            conducted=True,
            conducted_by=self.mentor,
        )
        session.attendees.add(self.student)

        module_test = ModuleTest.objects.create(
            title="Module One",
            course=self.course,
            is_active=True,
        )
        ModuleTestSubmission.objects.create(
            test=module_test,
            student=self.student,
            submitted_at=timezone.now(),
            marks_obtained=Decimal("80.00"),
            total_marks=Decimal("100.00"),
            percentage=Decimal("80.00"),
            qualified=True,
        )

        for index, assignment_type in enumerate([
            Assignment.AssignmentType.CODING,
            Assignment.AssignmentType.PROJECT,
            Assignment.AssignmentType.CAPSTONE,
        ], start=1):
            assignment = Assignment.objects.create(
                cohort=self.cohort,
                title=f"Journey requirement {index}",
                description="Required work",
                assignment_type=assignment_type,
                created_by=self.mentor,
                begin_date=timezone.now() - timedelta(days=15),
                deadline=timezone.now() - timedelta(days=5),
                max_marks=Decimal("100.00"),
                pass_percentage=Decimal("60.00"),
                status=Assignment.Status.PUBLISHED,
            )
            Submission.objects.create(
                assignment=assignment,
                student=self.student,
                submitted_at=timezone.now() - timedelta(days=6),
                evaluated=True,
                evaluated_by=self.mentor,
                evaluated_at=timezone.now() - timedelta(days=4),
                marks_obtained=Decimal("80.00"),
                passed=True,
            )

        for training_type in [Training.TrainingType.LST, Training.TrainingType.SOFT_SKILLS]:
            training = Training.objects.create(
                title=f"{training_type} training",
                training_type=training_type,
                is_active=True,
            )
            training_session = TrainingSession.objects.create(
                training=training,
                cohort=self.cohort,
                title="Required session",
                session_date=timezone.localdate() - timedelta(days=3),
                start_time=time(14, 0),
                end_time=time(15, 0),
                conducted_by=self.mentor,
            )
            TrainingAttendance.objects.create(
                session=training_session,
                student=self.student,
                status=TrainingAttendance.Status.PRESENT,
            )

        CommunityActivity.objects.create(
            application=application,
            activity_type=CommunityActivity.ActivityType.TREE_PLANTATION,
            title="Tree plantation",
            activity_date=timezone.localdate() - timedelta(days=2),
            status=CommunityActivity.Status.VERIFIED,
            verified_by=self.mentor,
            verified_at=timezone.now(),
        )
        CommunityActivity.objects.create(
            application=application,
            activity_type=CommunityActivity.ActivityType.HELPING_SOCIETY,
            title="Helping society",
            activity_date=timezone.localdate() - timedelta(days=1),
            status=CommunityActivity.Status.VERIFIED,
            verified_by=self.mentor,
            verified_at=timezone.now(),
        )

        before = build_student_journey(self.student, application)
        self.assertTrue(before["requirements_verified"])
        self.assertEqual(before["steps"][16]["state"], "COMPLETED")
        self.assertEqual(before["steps"][17]["state"], "CURRENT")

        with self.captureOnCommitCallbacks(execute=True):
            completed, message = calculate_and_process_course_completion(application)

        self.assertTrue(completed, message)
        self.assertTrue(Certificate.objects.filter(application=application).exists())
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.COMPLETED)
        after = build_student_journey(self.student, application)
        self.assertEqual(after["completed_steps"], 18)
        self.assertEqual(after["status"], "CERTIFICATE_ISSUED")
        send_certificate_email.assert_called_once()

    def test_assigned_mentor_can_verify_student_community_evidence(self):
        application = self._application(
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS,
        )
        self.client.force_authenticate(self.student_user)
        created = self.client.post(
            "/api/community-activities/",
            {
                "application": str(application.id),
                "activity_type": CommunityActivity.ActivityType.TREE_PLANTATION,
                "title": "Campus plantation",
                "activity_date": str(timezone.localdate()),
                "description": "Planted native trees.",
                "evidence_url": "https://example.com/evidence/tree",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["status"], CommunityActivity.Status.PENDING)

        self.client.force_authenticate(self.mentor)
        verified = self.client.post(
            f"/api/community-activities/{created.data['id']}/verify/",
            {"status": CommunityActivity.Status.VERIFIED, "verification_remarks": "Evidence checked."},
            format="json",
        )

        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertEqual(verified.data["status"], CommunityActivity.Status.VERIFIED)

    def test_student_training_schedule_is_limited_to_assigned_cohort(self):
        self._application(assigned_cohort=self.cohort, status=Application.Status.IN_PROGRESS)
        other_cohort = Cohort.objects.create(
            code="JOURNEY-C2",
            name="Other Journey Cohort",
            course=self.course,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        training = Training.objects.create(
            title="Scoped LST",
            training_type=Training.TrainingType.LST,
            is_active=True,
        )
        own = TrainingSession.objects.create(
            training=training,
            cohort=self.cohort,
            title="Own cohort session",
            session_date=timezone.localdate(),
            start_time=time(10, 0),
            conducted_by=self.mentor,
        )
        TrainingSession.objects.create(
            training=training,
            cohort=other_cohort,
            title="Other cohort session",
            session_date=timezone.localdate(),
            start_time=time(11, 0),
            conducted_by=self.admin,
        )
        shared = TrainingSession.objects.create(
            training=training,
            cohort=None,
            title="Shared session",
            session_date=timezone.localdate(),
            start_time=time(12, 0),
            conducted_by=self.admin,
        )
        self.client.force_authenticate(self.student_user)

        response = self.client.get("/api/training-sessions/")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["results"]
        self.assertEqual({row["id"] for row in rows}, {str(own.id), str(shared.id)})

    @override_settings(ALLOW_INTERNAL_EXAM_SUBMISSION=True)
    def test_fabricated_marks_are_ignored(self):
        from question_bank.models import QuestionBank
        
        application = self._application(status=Application.Status.EXAM_PENDING, qualified=None)
        exam = Exam.objects.create(
            application=application,
            status=Exam.Status.PENDING,
            pass_percentage=Decimal("60.00"),
        )
        
        QuestionBank.objects.create(
            course=self.course,
            exam=exam,
            bank_type=QuestionBank.BankType.PRESCREENING,
            title="Test Bank",
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [
                        {"id": "1", "question": "Q1", "options": ["A", "B"], "correct": "A", "marks": 5},
                        {"id": "2", "question": "Q2", "options": ["A", "B"], "correct": "B", "marks": 5},
                    ]
                }
            },
            is_active=True,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
        )
        
        self.client.force_authenticate(self.student_user)

        started = self.client.post(
            f"/api/exams/{exam.id}/start-internal/",
            {},
            format="json",
        )
        self.assertEqual(started.status_code, 200, started.data)

        # Submit deliberately wrong answers in the randomized display order,
        # while also fabricating score fields that the server must ignore.
        correct_values = {"1": "A", "2": "B"}
        wrong_responses = {}
        for question in started.data["questions"]:
            wrong_index = next(
                index
                for index, option in enumerate(question["options"])
                if option != correct_values[question["id"]]
            )
            wrong_responses[question["id"]] = chr(ord("A") + wrong_index)
        response = self.client.post(
            f"/api/exams/{exam.id}/submit/",
            {
                "attempt_id": started.data["attempt_id"],
                "answers": {
                    "set_code": "A",
                    "responses": wrong_responses,
                    "marks_obtained": 100,
                    "total_marks": 100,
                    "passed": True,
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["passed"])
        self.assertEqual(response.data["score"], 0)
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.REJECTED)
        self.assertFalse(application.qualified)
