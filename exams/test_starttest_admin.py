from datetime import date, timedelta
from unittest.mock import patch

from django.contrib import admin
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory, TestCase
from django.utils import timezone

from accounts.models import User
from applications.models import Application, PreScreening
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.models import ExamProctoringRoom, ModuleTest, StartTest
from question_bank.models import QuestionBank
from students.models import StudentProfile


class StartTestAdminHubTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin_user = User.objects.create_superuser(
            email="starttest-admin@example.com", password="admin-pass-123"
        )
        cls.course_one = cls._course("COURSE-ONE", "Course One")
        cls.course_two = cls._course("COURSE-TWO", "Course Two")
        cls.cohort_one = cls._cohort(cls.course_one, "COHORT-ONE")
        cls.cohort_two = cls._cohort(cls.course_two, "COHORT-TWO")
        cls.module_one = CourseModule.objects.create(
            course=cls.course_one, module_number=1, order=1, title="Course One Module"
        )
        cls.module_two = CourseModule.objects.create(
            course=cls.course_two, module_number=1, order=1, title="Course Two Module"
        )
        cls.pending_one = cls._application(cls.course_one, "PENDING-1", Application.Status.APPLIED)
        cls.pending_two = cls._application(cls.course_two, "PENDING-2", Application.Status.EXAM_PENDING)
        cls._application(cls.course_one, "FINISHED-1", Application.Status.EXAM_COMPLETED)
        cls.enrolled_one = cls._application(
            cls.course_one,
            "ENROLLED-1",
            Application.Status.IN_PROGRESS,
            cohort=cls.cohort_one,
        )
        cls._application(
            cls.course_two,
            "ENROLLED-2",
            Application.Status.IN_PROGRESS,
            cohort=cls.cohort_two,
        )
        cls.cohort_one.mentors.add(cls.admin_user)
        cls.module_bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course=cls.course_one,
            cohort=cls.cohort_one,
            module=cls.module_one,
            title="Course One Module Bank",
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={"A": {"questions": []}},
        )
        cls.prescreen_bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=cls.course_one,
            title="Course One Pre-screen Bank",
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={"A": {"questions": []}},
        )

    @classmethod
    def _course(cls, code, name):
        return Course.objects.create(
            code=code,
            name=name,
            domain="Technology",
            description=f"{name} description",
            status=Course.Status.PUBLISHED,
            created_by=cls.admin_user,
        )

    @classmethod
    def _cohort(cls, course, code):
        return Cohort.objects.create(
            code=code,
            course=course,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            status=Cohort.Status.ACTIVE,
            created_by=cls.admin_user,
        )

    @classmethod
    def _application(cls, course, suffix, status, cohort=None):
        user = User.objects.create_user(email=f"{suffix.lower()}@example.com", password="pass")
        student = StudentProfile.objects.get(user=user)
        student.student_code = f"ST-{suffix}"
        student.save(update_fields=["student_code", "updated_at"])
        return Application.objects.create(
            application_number=f"APP-{suffix}",
            student=student,
            course=course,
            assigned_cohort=cohort,
            status=status,
        )

    def setUp(self):
        verification_patch = patch.object(User, "is_verified", return_value=True, create=True)
        verification_patch.start()
        self.addCleanup(verification_patch.stop)
        self.client.force_login(self.admin_user)
        self.factory = RequestFactory()
        self.model_admin = admin.site._registry[StartTest]

    def _request(self, method="get", path="/secure-admin/exams/starttest/", data=None):
        request = getattr(self.factory, method)(path, data=data or {})
        request.user = self.admin_user
        request.session = {}
        request._messages = FallbackStorage(request)
        return request

    def test_changelist_uses_native_admin_structure(self):
        request = self._request()

        response = self.model_admin.changelist_view(request)
        response.render()

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Start Test Hub")
        self.assertContains(response, 'class="module aligned"')
        self.assertNotContains(response, "hub-header")
        self.assertNotContains(response, "color-scheme: light")

    def test_legacy_proctoring_rooms_are_not_exposed_in_admin(self):
        self.assertNotIn(ExamProctoringRoom, admin.site._registry)

    def test_pending_total_and_per_course_counts_share_one_definition(self):
        response = self.model_admin.changelist_view(self._request())
        response.render()

        self.assertEqual(response.context_data["pending_screening_count"], 2)
        counts = {course.code: course.pending_count for course in response.context_data["courses"]}
        self.assertEqual(counts, {"COURSE-ONE": 1, "COURSE-TWO": 1})
        self.assertContains(response, "Course One — 1 pending")
        self.assertContains(response, "Course Two — 1 pending")

    def test_bulk_start_gate_is_visible_when_course_has_no_open_bank(self):
        response = self.model_admin.changelist_view(
            self._request(data={
                "section": "prescreening",
                "course_id": self.course_two.id,
            })
        )
        response.render()

        self.assertContains(response, "Question Bank required before bulk start")
        self.assertContains(response, "Generate new AI Question Bank")
        self.assertContains(
            response,
            "Bulk start unavailable — publish Question Bank first",
        )

    def test_hub_prefers_existing_cohort_scoped_approved_bank_over_ai_job(self):
        self.prescreen_bank.course = self.course_two
        self.prescreen_bank.cohort = self.cohort_two
        self.prescreen_bank.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
        self.prescreen_bank.is_active = False
        self.prescreen_bank.save(update_fields=[
            "course", "cohort", "lifecycle_status", "is_active", "updated_at",
        ])
        QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course_two,
            title="Unneeded AI generation",
            status=QuestionBank.Status.PROCESSING,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        )

        response = self.model_admin.changelist_view(
            self._request(data={
                "section": "prescreening",
                "course_id": self.course_two.id,
            })
        )
        response.render()

        self.assertEqual(response.context_data["latest_course_bank"], self.prescreen_bank)
        self.assertContains(response, "Reuse existing Question Bank")
        self.assertContains(response, "Continue current AI generation")

    def test_explicit_reuse_cancels_empty_ai_job_and_opens_existing_bank(self):
        approved = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course_two,
            cohort=self.cohort_two,
            title="Existing curated papers",
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            total_questions_per_set=1,
            sets_data={
                "A": {
                    "label": "Paper A",
                    "questions": [{
                        "id": "reuse-a-1",
                        "question": "Which value represents one?",
                        "options": ["0", "1", "2", "3"],
                        "correct": "1",
                        "marks": 1,
                    }],
                }
            },
        )
        redundant = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course_two,
            title="Empty AI job",
            status=QuestionBank.Status.GENERATING,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            sets_data={},
        )

        response = self.model_admin.generate_bank_now_view(
            self._request(method="post", data={
                "course_id": self.course_two.id,
                "bank_action": "reuse",
            })
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("question_bank_id=", response.url)
        self.assertIn(str(approved.pk), response.url)
        approved.refresh_from_db()
        self.assertIsNone(approved.cohort_id)
        self.assertEqual(approved.lifecycle_status, QuestionBank.LifecycleStatus.OPEN)
        self.assertTrue(approved.is_active)
        redundant.refresh_from_db()
        self.assertEqual(redundant.status, QuestionBank.Status.FAILED)
        self.assertEqual(redundant.lifecycle_status, QuestionBank.LifecycleStatus.CLOSED)
        self.assertFalse(redundant.is_active)

        hub_request = self._request(data={
            "section": "prescreening",
            "course_id": self.course_two.id,
            "question_bank_id": approved.id,
        })
        hub_response = self.model_admin.changelist_view(hub_request)
        hub_response.render()
        self.assertContains(
            hub_response,
            f'value="{approved.id}" selected',
            html=False,
        )
        self.assertContains(hub_response, "Bulk schedule/start selected applicants")

    @patch("question_bank.auto_generate.auto_generate_prescreening_bank")
    def test_explicit_ai_choice_requests_new_generation_mode(self, mock_generate):
        mock_generate.return_value = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course_two,
            title="Explicit AI papers",
            status=QuestionBank.Status.GENERATING,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        )

        response = self.model_admin.generate_bank_now_view(
            self._request(method="post", data={
                "course_id": self.course_two.id,
                "bank_action": "generate",
            })
        )

        self.assertEqual(response.status_code, 302)
        mock_generate.assert_called_once_with(str(self.course_two.id), force_new=True)

    def test_bulk_start_action_is_visible_when_open_bank_exists(self):
        response = self.model_admin.changelist_view(
            self._request(data={
                "section": "prescreening",
                "course_id": self.course_one.id,
            })
        )
        response.render()

        self.assertContains(response, "Bulk schedule/start selected applicants")
        self.assertNotContains(
            response,
            "Bulk start unavailable — publish Question Bank first",
        )

    def test_hub_datetime_defaults_use_configured_local_timezone(self):
        response = self.model_admin.changelist_view(self._request())
        local_now = timezone.localtime(timezone.now())

        self.assertEqual(
            response.context_data["default_start_time"],
            local_now.strftime("%Y-%m-%dT%H:%M"),
        )

    def test_module_filters_only_show_related_cohorts_and_modules(self):
        response = self.model_admin.changelist_view(
            self._request(data={"section": "module", "mt_course_id": self.course_one.id})
        )
        response.render()

        self.assertContains(response, "COHORT-ONE")
        self.assertNotContains(response, "COHORT-TWO")
        self.assertContains(response, "Course One Module")
        self.assertNotContains(response, "Course Two Module")

    def test_prescreen_launch_only_schedules_selected_eligible_applicants(self):
        start = timezone.localtime().strftime("%Y-%m-%dT%H:%M")
        end = (timezone.localtime() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        response = self.model_admin.bulk_release_prescreening_view(
            self._request(method="post", data={
                "course_id": self.course_one.id,
                "application_ids": [self.pending_one.id],
                "question_bank_id": self.prescreen_bank.id,
                "paper_set": "A",
                "scheduled_at": start,
                "end_time": end,
                "is_released": "1",
            })
        )

        self.assertEqual(response.status_code, 302)
        screening = PreScreening.objects.get(application=self.pending_one)
        self.assertEqual(screening.question_bank, self.prescreen_bank)
        self.assertEqual(screening.paper_set, "A")
        self.assertTrue(screening.is_released)
        self.assertIsNotNone(screening.admin_started_at)
        self.assertFalse(PreScreening.objects.filter(application=self.pending_two).exists())

    @patch("applications.services.google_meet_screening.update_google_meet")
    def test_prescreen_launch_overrides_database_and_calendar_window(self, mock_update):
        old_start = timezone.now() + timedelta(days=1)
        existing = PreScreening.objects.create(
            application=self.pending_one,
            question_bank=self.prescreen_bank,
            paper_set="A",
            scheduled_at=old_start,
            end_time=old_start + timedelta(hours=1),
            meeting_link="https://meet.google.com/admin-window",
            calendar_event_id="calendar-admin-window",
        )
        mock_update.return_value = (
            existing.meeting_link,
            existing.calendar_event_id,
        )
        new_start = timezone.localtime(timezone.now() + timedelta(days=3)).replace(
            second=0,
            microsecond=0,
        )
        new_end = new_start + timedelta(hours=2)

        response = self.model_admin.bulk_release_prescreening_view(
            self._request(method="post", data={
                "course_id": self.course_one.id,
                "application_ids": [self.pending_one.id],
                "question_bank_id": self.prescreen_bank.id,
                "paper_set": "A",
                "scheduled_at": new_start.strftime("%Y-%m-%dT%H:%M"),
                "end_time": new_end.strftime("%Y-%m-%dT%H:%M"),
                "is_released": "1",
            })
        )

        self.assertEqual(response.status_code, 302)
        existing.refresh_from_db()
        self.assertEqual(existing.scheduled_at, new_start)
        self.assertEqual(existing.end_time, new_end)
        self.assertEqual(existing.status, PreScreening.Status.RESCHEDULED)
        self.assertTrue(existing.is_released)
        self.assertIsNotNone(existing.admin_started_at)
        call = mock_update.call_args.kwargs
        self.assertEqual(call["start_datetime"], new_start)
        self.assertEqual(call["end_datetime"], new_end)

    def test_module_launch_rejects_cross_course_cohort(self):
        start = timezone.localtime().strftime("%Y-%m-%dT%H:%M")
        end = (timezone.localtime() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        response = self.model_admin.bulk_release_moduletest_view(
            self._request(method="post", data={
                "course_id": self.course_one.id,
                "cohort_id": self.cohort_two.id,
                "module_id": self.module_one.id,
                "question_bank_id": self.module_bank.id,
                "title": "Invalid cross-course test",
                "scheduled_at": start,
                "end_time": end,
                "is_released": "1",
            }),
        )

        self.assertEqual(response.status_code, 302)
        self.assertFalse(ModuleTest.objects.filter(title="Invalid cross-course test").exists())

    @patch(
        "exams.google_meet.generate_google_meet",
        return_value=("https://meet.google.com/scoped-test", "calendar-event-1"),
    )
    def test_module_launch_creates_exact_scoped_test(self, generate_meet):
        start = timezone.localtime().strftime("%Y-%m-%dT%H:%M")
        end = (timezone.localtime() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        response = self.model_admin.bulk_release_moduletest_view(
            self._request(method="post", data={
                "course_id": self.course_one.id,
                "cohort_id": self.cohort_one.id,
                "module_id": self.module_one.id,
                "question_bank_id": self.module_bank.id,
                "title": "Scoped module test",
                "scheduled_at": start,
                "end_time": end,
                "duration_minutes": "45",
                "pass_percentage": "70",
                "is_released": "1",
            }),
        )

        self.assertEqual(response.status_code, 302)
        test = ModuleTest.objects.get(title="Scoped module test")
        self.assertEqual(test.course, self.course_one)
        self.assertEqual(test.cohort, self.cohort_one)
        self.assertEqual(test.module, self.module_one)
        self.assertEqual(test.question_bank, self.module_bank)
        self.assertTrue(test.is_released)
        self.assertEqual(test.meeting_link, "https://meet.google.com/scoped-test")
        self.assertEqual(test.calendar_event_id, "calendar-event-1")
        attendee_emails = generate_meet.call_args.kwargs["attendee_emails"]
        self.assertIn(self.enrolled_one.student.user.email, attendee_emails)
        self.assertIn(self.admin_user.email, attendee_emails)
        self.assertNotIn(self.pending_two.student.user.email, attendee_emails)

    @patch(
        "exams.google_meet.update_google_meet",
        return_value=("https://meet.google.com/same-test", "calendar-event-same"),
    )
    @patch(
        "exams.google_meet.generate_google_meet",
        return_value=("https://meet.google.com/same-test", "calendar-event-same"),
    )
    def test_repeated_identical_module_launch_reuses_test_and_calendar_event(
        self, generate_meet, update_meet
    ):
        start = timezone.localtime().strftime("%Y-%m-%dT%H:%M")
        end = (timezone.localtime() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        payload = {
            "course_id": self.course_one.id,
            "cohort_id": self.cohort_one.id,
            "module_id": self.module_one.id,
            "question_bank_id": self.module_bank.id,
            "title": "Idempotent module test",
            "scheduled_at": start,
            "end_time": end,
            "is_released": "1",
        }

        self.model_admin.bulk_release_moduletest_view(
            self._request(method="post", data=payload)
        )
        self.model_admin.bulk_release_moduletest_view(
            self._request(method="post", data=payload)
        )

        tests = ModuleTest.objects.filter(
            course=self.course_one,
            cohort=self.cohort_one,
            module=self.module_one,
            question_bank=self.module_bank,
        )
        self.assertEqual(tests.count(), 1)
        self.assertEqual(generate_meet.call_count, 1)
        self.assertEqual(update_meet.call_count, 1)

    @patch("exams.google_meet.generate_google_meet", return_value=(None, None))
    def test_module_launch_stays_locked_when_no_meet_is_available(self, _generate_meet):
        start = timezone.localtime().strftime("%Y-%m-%dT%H:%M")
        end = (timezone.localtime() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")

        self.model_admin.bulk_release_moduletest_view(
            self._request(method="post", data={
                "course_id": self.course_one.id,
                "cohort_id": self.cohort_one.id,
                "module_id": self.module_one.id,
                "question_bank_id": self.module_bank.id,
                "title": "Meet failure test",
                "scheduled_at": start,
                "end_time": end,
                "is_released": "1",
            })
        )

        test = ModuleTest.objects.get(title="Meet failure test")
        self.assertFalse(test.is_released)
        self.assertFalse(test.meeting_link)

    def test_close_module_window_locks_access_and_retains_meet_audit_fields(self):
        test = ModuleTest.objects.create(
            title="Close me",
            course=self.course_one,
            cohort=self.cohort_one,
            module=self.module_one,
            question_bank=self.module_bank,
            scheduled_at=timezone.now() - timedelta(minutes=5),
            end_time=timezone.now() + timedelta(hours=1),
            meeting_link="https://meet.google.com/close-test",
            calendar_event_id="calendar-close",
            is_released=True,
        )

        response = self.model_admin.close_window_view(
            self._request(method="post", data={
                "assessment_type": "moduletest",
                "item_id": test.id,
            })
        )

        self.assertEqual(response.status_code, 302)
        test.refresh_from_db()
        self.assertFalse(test.is_released)
        self.assertLessEqual(test.end_time, timezone.now())
        self.assertEqual(test.meeting_link, "https://meet.google.com/close-test")
        self.assertEqual(test.calendar_event_id, "calendar-close")
