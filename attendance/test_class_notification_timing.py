import datetime
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from attendance.models import Attendance
from attendance.tasks import class_lifecycle_event
from attendance.views import AttendanceViewSet
from common.models import Notification


class ClassNotificationTimingTests(TestCase):
    def setUp(self):
        self.now = timezone.make_aware(
            datetime.datetime(2026, 9, 12, 22, 15),
            timezone.get_current_timezone(),
        )

    def session_at(self, hour=22, minute=20, status="SCHEDULED"):
        return SimpleNamespace(
            class_status=status,
            class_date=datetime.date(2026, 9, 12),
            start_time=datetime.time(hour, minute),
        )

    def test_t_minus_five_and_start_windows_are_distinct(self):
        self.assertEqual(class_lifecycle_event(self.session_at(), self.now), "starting_soon")
        self.assertEqual(
            class_lifecycle_event(self.session_at(), self.now + datetime.timedelta(minutes=5)),
            "started",
        )
        self.assertIsNone(
            class_lifecycle_event(self.session_at(), self.now + datetime.timedelta(minutes=8))
        )
        self.assertIsNone(class_lifecycle_event(self.session_at(status="CANCELLED"), self.now))

    @patch("common.services.mobile_push.queue_notification")
    def test_stable_notification_transitions_from_reminder_to_started(self, queue):
        user = User.objects.create_user(
            email="class-push@example.com",
            password="TestPassword123!",
            role="STUDENT",
        )
        session = Attendance.objects.create(
            title="VLSI",
            class_date=datetime.date(2026, 9, 12),
            start_time=datetime.time(22, 20),
            end_time=datetime.time(23, 20),
        )
        AttendanceViewSet._sync_session_notifications(session, {user.pk}, event="starting_soon")
        reminder = Notification.objects.get(user=user)
        self.assertEqual(reminder.title, "Class starts soon")
        AttendanceViewSet._sync_session_notifications(session, {user.pk}, event="started")
        started = Notification.objects.get(user=user)
        self.assertEqual(started.pk, reminder.pk)
        self.assertEqual(started.title, "Class started")
        self.assertEqual(queue.call_count, 2)
