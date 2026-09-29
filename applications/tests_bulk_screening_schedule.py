from datetime import timedelta
from django.contrib import admin
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory, TestCase
from django.utils import timezone

from accounts.models import User
from applications.admin import ApplicationAdmin, PreScreeningAdmin
from applications.models import Application, PreScreening
from cohorts.models import Cohort
from courses.models import Course
from question_bank.models import QuestionBank


class BulkScreeningScheduleTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.admin_user = User.objects.create_superuser(
            email="bulk-admin@example.com",
            password="testpass123",
            role=User.Role.ADMIN,
        )
        self.course = Course.objects.create(
            code="BULK-CRS-1",
            name="Bulk Course",
            domain="Technology",
            description="Testing bulk scheduling",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )
        self.cohort = Cohort.objects.create(
            course=self.course,
            code="BULK-COH-1",
            name="Bulk Cohort 1",
            status=Cohort.Status.OPEN,
            start_date="2026-10-01",
            end_date="2026-12-01",
            created_by=self.admin_user,
        )
        self.question_bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=self.course,
            title="[BULK-CRS-1] Pre-Screening Bank",
            sets_data={"A": [], "B": []},
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        )

        # Create 3 student applications
        self.apps = []
        for i in range(3):
            u = User.objects.create_user(
                email=f"bulk-student-{i}@example.com",
                password="testpass123",
                role=User.Role.STUDENT,
            )
            app = Application.objects.create(
                application_number=f"APP-BULK-{i:03d}",
                student=u.student_profile,
                course=self.course,
                assigned_cohort=self.cohort,
                status=Application.Status.APPLIED,
            )
            self.apps.append(app)

    def _auth_request(self, method="get", path="/", data=None):
        req_func = getattr(self.factory, method.lower())
        req = req_func(path, data or {})
        req.user = self.admin_user
        req.user.is_verified = lambda: True
        req.session = {}
        req._messages = FallbackStorage(req)
        return req

    def test_override_guardrail_protects_existing_schedules(self):
        # Mark 1 applicant as EXAM_PENDING with a fixed slot
        app0 = self.apps[0]
        app0.status = Application.Status.EXAM_PENDING
        app0.save()
        old_time = timezone.now() + timedelta(days=10)
        ps0 = PreScreening.objects.create(
            application=app0,
            scheduled_at=old_time,
            end_time=old_time + timedelta(hours=2),
            status=PreScreening.Status.SCHEDULED,
        )

        model_admin = PreScreeningAdmin(PreScreening, admin.site)
        # Without override_existing, count excludes EXAM_PENDING
        req = self._auth_request(
            "get",
            f"/secure-admin/applications/prescreening/bulk-schedule-count/?course_id={self.course.id}&cohort_id={self.cohort.id}&statuses=APPLIED,EXAM_PENDING",
        )
        resp = model_admin.bulk_schedule_count_api(req)
        import json
        self.assertEqual(json.loads(resp.content)["count"], 2)

        # With override_existing, count includes EXAM_PENDING
        req_override = self._auth_request(
            "get",
            f"/secure-admin/applications/prescreening/bulk-schedule-count/?course_id={self.course.id}&cohort_id={self.cohort.id}&statuses=APPLIED,EXAM_PENDING&override_existing=1",
        )
        resp_override = model_admin.bulk_schedule_count_api(req_override)
        self.assertEqual(json.loads(resp_override.content)["count"], 3)

        # Execute POST without override -> app0 must remain untouched
        new_start = timezone.now() + timedelta(days=2)
        new_end = new_start + timedelta(hours=2)
        post_data = {
            "course": str(self.course.id),
            "cohort": str(self.cohort.id),
            "statuses": ["APPLIED", "EXAM_PENDING"],
            "scheduled_at": new_start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": new_end.strftime("%Y-%m-%dT%H:%M"),
            "question_bank": str(self.question_bank.id),
            "paper_set": "A",
            "meeting_link": "https://meet.google.com/bulk-safe",
            "is_released": "1",
        }
        req_post = self._auth_request("post", "/secure-admin/applications/prescreening/bulk-schedule-cohort/", post_data)
        model_admin.bulk_schedule_cohort_view(req_post)

        ps0.refresh_from_db()
        self.assertEqual(ps0.scheduled_at, old_time)

    def test_cohort_default_meeting_link_used_when_blank(self):
        self.cohort.meeting_link = "https://meet.google.com/master-cohort-link"
        self.cohort.save()

        model_admin = PreScreeningAdmin(PreScreening, admin.site)
        now = timezone.now()
        start = (now + timedelta(days=5)).replace(microsecond=0)
        end = start + timedelta(hours=2)

        data = {
            "course": str(self.course.id),
            "cohort": str(self.cohort.id),
            "statuses": ["APPLIED"],
            "scheduled_at": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.strftime("%Y-%m-%dT%H:%M"),
            "question_bank": str(self.question_bank.id),
            "paper_set": "B",
            "meeting_link": "",  # Blank -> auto fallback to cohort.meeting_link
            "is_released": "1",
        }

        req = self._auth_request("post", "/secure-admin/applications/prescreening/bulk-schedule-cohort/", data)
        model_admin.bulk_schedule_cohort_view(req)

        for app in self.apps:
            ps = PreScreening.objects.get(application=app)
            self.assertEqual(ps.meeting_link, "https://meet.google.com/master-cohort-link")

    def test_bulk_schedule_cohort_view_get(self):
        model_admin = PreScreeningAdmin(PreScreening, admin.site)
        req = self._auth_request("get", "/secure-admin/applications/prescreening/bulk-schedule-cohort/")
        resp = model_admin.bulk_schedule_cohort_view(req)
        self.assertEqual(resp.status_code, 200)
        content = resp.rendered_content
        self.assertIn("Bulk Schedule Screening Exams (Course &amp; Cohort Wide)", content)
        self.assertIn(self.course.name, content)

    def test_bulk_schedule_cohort_view_post_schedules_all_matching_candidates(self):
        model_admin = PreScreeningAdmin(PreScreening, admin.site)
        now = timezone.now()
        start = (now + timedelta(days=2)).replace(microsecond=0)
        end = start + timedelta(hours=2)

        data = {
            "course": str(self.course.id),
            "cohort": str(self.cohort.id),
            "statuses": ["APPLIED"],
            "scheduled_at": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.strftime("%Y-%m-%dT%H:%M"),
            "question_bank": str(self.question_bank.id),
            "paper_set": "A",
            "meeting_link": "https://meet.google.com/test-bulk",
            "is_released": "1",
            "notify_candidates": "1",
        }

        req = self._auth_request("post", "/secure-admin/applications/prescreening/bulk-schedule-cohort/", data)
        resp = model_admin.bulk_schedule_cohort_view(req)
        self.assertEqual(resp.status_code, 302)

        # Check that PreScreening records exist and are configured
        for app in self.apps:
            app.refresh_from_db()
            self.assertEqual(app.status, Application.Status.EXAM_PENDING)
            ps = PreScreening.objects.get(application=app)
            self.assertEqual(ps.status, PreScreening.Status.SCHEDULED)
            self.assertEqual(ps.paper_set, "A")
            self.assertEqual(ps.question_bank, self.question_bank)
            self.assertEqual(ps.meeting_link, "https://meet.google.com/test-bulk")
            self.assertTrue(ps.is_released)
            # Notification check
            self.assertTrue(
                app.student.user.notifications.filter(title__icontains="scheduled").exists()
            )

    def test_selection_action_on_prescreening_admin(self):
        # Create PreScreenings first
        for app in self.apps:
            PreScreening.objects.create(
                application=app,
                status=PreScreening.Status.SCHEDULED,
            )

        model_admin = PreScreeningAdmin(PreScreening, admin.site)
        qs = PreScreening.objects.filter(application__in=self.apps[:2])

        now = timezone.now()
        start = (now + timedelta(days=3)).replace(microsecond=0)
        end = start + timedelta(hours=2)

        post_data = {
            "apply": "1",
            "scheduled_at": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.strftime("%Y-%m-%dT%H:%M"),
            "paper_set": "B",
            "meeting_link": "https://meet.google.com/selected-meet",
            "is_released": "1",
            "notify_candidates": "1",
        }

        req = self._auth_request("post", "/secure-admin/applications/prescreening/", post_data)
        model_admin.bulk_schedule_selected_exams(req, qs)

        for app in self.apps[:2]:
            app.refresh_from_db()
            self.assertEqual(app.status, Application.Status.EXAM_PENDING)
            ps = PreScreening.objects.get(application=app)
            self.assertEqual(ps.status, PreScreening.Status.RESCHEDULED)
            self.assertEqual(ps.paper_set, "B")

        # 3rd app was not selected -> its PreScreening was not updated with Paper B
        third_ps = PreScreening.objects.get(application=self.apps[2])
        self.assertNotEqual(third_ps.paper_set, "B")

    def test_selection_action_on_application_admin(self):
        model_admin = ApplicationAdmin(Application, admin.site)
        qs = Application.objects.filter(id__in=[self.apps[0].id])

        now = timezone.now()
        start = (now + timedelta(days=4)).replace(microsecond=0)
        end = start + timedelta(hours=2)

        post_data = {
            "apply": "1",
            "scheduled_at": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.strftime("%Y-%m-%dT%H:%M"),
            "paper_set": "C",
            "meeting_link": "",
            "is_released": "1",
            "notify_candidates": "1",
        }

        req = self._auth_request("post", "/secure-admin/applications/application/", post_data)
        model_admin.bulk_schedule_selected_applications(req, qs)

        self.apps[0].refresh_from_db()
        self.assertEqual(self.apps[0].status, Application.Status.EXAM_PENDING)
        ps = PreScreening.objects.get(application=self.apps[0])
        self.assertEqual(ps.status, PreScreening.Status.SCHEDULED)
        self.assertEqual(ps.paper_set, "C")

    def test_remove_candidate_from_screening_meet(self):
        from unittest.mock import patch
        from applications.services.google_meet_screening import remove_candidate_from_screening_meet

        ps = PreScreening.objects.create(
            application=self.apps[0],
            scheduled_at=timezone.now() + timedelta(days=2),
            end_time=timezone.now() + timedelta(days=2, hours=2),
            calendar_event_id="test-cal-event-123",
            meeting_link="https://meet.google.com/test-room",
        )

        with patch("attendance.services.google_meet_service.remove_attendee_from_google_event") as mock_remove:
            mock_remove.return_value = True
            result = remove_candidate_from_screening_meet(ps)
            self.assertTrue(result)
            mock_remove.assert_called_once_with("test-cal-event-123", self.apps[0].student.user.email)
