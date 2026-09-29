from unittest.mock import patch
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from applications.admin import PreScreeningAdminForm
from applications.models import Application, PreScreening
from applications.services.google_meet_screening import (
    find_existing_cohort_screening_meeting_link,
    resolve_or_create_prescreening_google_meet,
)
from cohorts.models import Cohort
from courses.models import Course
from question_bank.models import QuestionBank


class PreScreeningGoogleMeetTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="meet-admin@test.com",
            password="pwd",
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.course = Course.objects.create(
            code="MEET-COURSE",
            name="Google Meet Test Course",
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            code="COHORT-A",
            name="Cohort Alpha",
            course=self.course,
            created_by=self.admin,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        self.bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="Screening Bank A",
            sets_data={"A": {"label": "Paper A", "questions": []}},
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        )

        # Create 3 student applications in the same cohort
        self.students = []
        self.applications = []
        for i in range(1, 4):
            user = User.objects.create_user(
                email=f"student{i}@test.com",
                password="pwd",
                role=User.Role.STUDENT,
            )
            profile = user.student_profile
            profile.student_code = f"STU-{i}"
            profile.save(update_fields=["student_code", "updated_at"])
            self.students.append(profile)

            app = Application.objects.create(
                application_number=f"APP-00{i}",
                student=profile,
                course=self.course,
                assigned_cohort=self.cohort,
                status=Application.Status.APPLIED,
            )
            self.applications.append(app)

    @patch("applications.services.google_meet_screening.generate_google_meet")
    def test_google_meet_generated_once_and_reused_for_all_cohort_students(self, mock_generate):
        mock_generate.return_value = ("https://meet.google.com/shared-cohort-a", "cal-event-001")

        now = timezone.now()
        start_time = now + timedelta(hours=1)
        end_time = now + timedelta(hours=3)

        # Schedule Student 1
        ps1 = PreScreening.objects.create(
            application=self.applications[0],
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=start_time,
            end_time=end_time,
            status=PreScreening.Status.SCHEDULED,
        )

        self.assertEqual(ps1.meeting_link, "https://meet.google.com/shared-cohort-a")
        self.assertEqual(mock_generate.call_count, 1)

        # Schedule Student 2 in the same cohort & window
        ps2 = PreScreening.objects.create(
            application=self.applications[1],
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=start_time,
            end_time=end_time,
            status=PreScreening.Status.SCHEDULED,
        )

        # Schedule Student 3 in the same cohort & window
        ps3 = PreScreening.objects.create(
            application=self.applications[2],
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=start_time,
            end_time=end_time,
            status=PreScreening.Status.SCHEDULED,
        )

        # Re-check Google Meet generation: must only be called ONCE
        self.assertEqual(mock_generate.call_count, 1)

        # All three students MUST share the exact same Google Meet link
        self.assertEqual(ps2.meeting_link, "https://meet.google.com/shared-cohort-a")
        self.assertEqual(ps3.meeting_link, "https://meet.google.com/shared-cohort-a")

    @patch("applications.services.google_meet_screening.generate_google_meet")
    def test_admin_form_prefills_existing_cohort_meet_link(self, mock_generate):
        mock_generate.return_value = ("https://meet.google.com/cohort-prefill", "cal-event-002")

        now = timezone.now()
        # Schedule first student to establish the cohort meet link
        PreScreening.objects.create(
            application=self.applications[0],
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=now,
            end_time=now + timedelta(hours=2),
            meeting_link="https://meet.google.com/cohort-prefill",
            status=PreScreening.Status.SCHEDULED,
        )

        # Now load admin form for student 2 in the same cohort
        form = PreScreeningAdminForm(
            instance=PreScreening(application=self.applications[1]),
            initial={"application": self.applications[1].pk},
        )

        self.assertEqual(
            form.fields["meeting_link"].initial,
            "https://meet.google.com/cohort-prefill",
        )

    @patch("applications.services.google_meet_screening.generate_google_meet")
    def test_different_cohort_gets_its_own_meet_link(self, mock_generate):
        cohort_b = Cohort.objects.create(
            code="COHORT-B",
            name="Cohort Beta",
            course=self.course,
            created_by=self.admin,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=30),
        )
        user_b = User.objects.create_user(email="cohortb-student@test.com", password="pwd", role=User.Role.STUDENT)
        app_b = Application.objects.create(
            application_number="APP-COHORTB-01",
            student=user_b.student_profile,
            course=self.course,
            assigned_cohort=cohort_b,
            status=Application.Status.APPLIED,
        )

        mock_generate.side_effect = [
            ("https://meet.google.com/cohort-a-room", "event-a"),
            ("https://meet.google.com/cohort-b-room", "event-b"),
        ]

        now = timezone.now()
        ps_a = PreScreening.objects.create(
            application=self.applications[0],
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=now,
            end_time=now + timedelta(hours=2),
            status=PreScreening.Status.SCHEDULED,
        )

        ps_b = PreScreening.objects.create(
            application=app_b,
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=now,
            end_time=now + timedelta(hours=2),
            status=PreScreening.Status.SCHEDULED,
        )

        self.assertEqual(ps_a.meeting_link, "https://meet.google.com/cohort-a-room")
        self.assertEqual(ps_b.meeting_link, "https://meet.google.com/cohort-b-room")
        self.assertEqual(mock_generate.call_count, 2)

    @patch("applications.services.google_meet_screening.update_google_meet")
    def test_existing_calendar_event_uses_admin_overridden_window(self, mock_update):
        mock_update.return_value = (
            "https://meet.google.com/shared-cohort-a",
            "cal-event-001",
        )
        new_start = timezone.now() + timedelta(days=2)
        new_end = new_start + timedelta(hours=3)
        screening = PreScreening.objects.create(
            application=self.applications[0],
            question_bank=self.bank,
            paper_set="A",
            scheduled_at=new_start,
            end_time=new_end,
            meeting_link="https://meet.google.com/shared-cohort-a",
            calendar_event_id="cal-event-001",
            status=PreScreening.Status.RESCHEDULED,
        )

        resolve_or_create_prescreening_google_meet(screening)

        call = mock_update.call_args.kwargs
        self.assertEqual(call["calendar_event_id"], "cal-event-001")
        self.assertEqual(call["start_datetime"], new_start)
        self.assertEqual(call["end_datetime"], new_end)
