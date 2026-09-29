import importlib
from datetime import time, timedelta

from django.apps import apps
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import Attendance
from cohorts.models import Cohort
from courses.models import Course


class AttendanceGuestEmailTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="attendance-admin@example.com",
            password="test-pass",
        )
        self.course = Course.objects.create(
            code="GUEST-101",
            name="Guest Email Course",
            domain="Technology",
            description="Guest email migration test",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            code="GUEST-C1",
            name="Guest Cohort",
            course=self.course,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=30),
            created_by=self.admin,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_legacy_whitelisted_guest_note_moves_to_separate_field(self):
        session = Attendance.objects.create(
            cohort=self.cohort,
            title="Guest-enabled class",
            class_date=timezone.localdate(),
            start_time=time(10, 0),
            end_time=time(11, 0),
            conducted_by=self.admin,
            notes=(
                "Whitelisted Guests: Guest.One@example.com, guest.two@example.com\n"
                "Bring the lab workbook."
            ),
        )
        migration = importlib.import_module(
            "attendance.migrations.0004_attendance_whitelisted_guest_emails"
        )

        migration.move_legacy_guest_emails(apps, None)

        session.refresh_from_db()
        self.assertEqual(
            session.whitelisted_guest_emails,
            ["guest.one@example.com", "guest.two@example.com"],
        )
        self.assertEqual(session.notes, "Bring the lab workbook.")

    def test_timetable_history_can_be_filtered_by_exact_date(self):
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        for class_date, title in [(today, "Today class"), (yesterday, "History class")]:
            Attendance.objects.create(
                cohort=self.cohort,
                title=title,
                class_date=class_date,
                start_time=time(10, 0),
                end_time=time(11, 0),
                conducted_by=self.admin,
            )

        response = self.client.get("/api/attendance/", {"class_date": yesterday.isoformat()})

        self.assertEqual(response.status_code, 200)
        rows = response.data.get("results", response.data)
        self.assertEqual([row["title"] for row in rows], ["History class"])
        # A past date alone does not end a class; completion is an explicit action.
        self.assertEqual(rows[0]["effective_status"], "ONGOING")
        self.assertEqual(rows[0]["course_name"], self.course.name)
        self.assertEqual(rows[0]["cohort_code"], self.cohort.code)
        self.assertEqual(rows[0]["conducted_by_name"], self.admin.email)

        invalid = self.client.get("/api/attendance/", {"class_date": "23-08-2026"})
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("class_date", invalid.data)
