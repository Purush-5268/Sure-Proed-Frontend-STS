import uuid
from datetime import time
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from attendance.models import Attendance
from common.models import MobilePushDelivery, Notification, MobilePushDevice
from common.services.mobile_push import android_delivery, live_class_payload
from common.services.notifications import notify_user, notify_users_bulk


class MobilePushIsolationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="push-owner@example.com", password="TestPassword123!", role="STUDENT")
        self.other = User.objects.create_user(email="push-other@example.com", password="TestPassword123!", role="STUDENT")
        self.client = APIClient()
        self.payload = {"token": "test-device-token-" + "x" * 80, "account_session": str(uuid.uuid4())}

    def test_registration_requires_authentication_and_uses_authenticated_identity(self):
        url = "/api/notifications/push/mobile/"
        self.assertEqual(self.client.post(url, self.payload, format="json").status_code, 401)
        self.client.force_authenticate(self.owner)
        response = self.client.post(url, {**self.payload, "user": str(self.other.pk)}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(MobilePushDevice.objects.get().user_id, self.owner.pk)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(url, self.payload, format="json").status_code, 200)
        self.assertTrue(MobilePushDevice.objects.get().is_active)
        next_session = str(uuid.uuid4())
        self.client.post(url, {**self.payload, "account_session": next_session}, format="json")
        self.assertEqual(MobilePushDevice.objects.count(), 1)
        device = MobilePushDevice.objects.get()
        self.assertEqual(device.user_id, self.other.pk)
        self.assertEqual(str(device.account_session), next_session)

    def test_previous_account_notification_cannot_be_fetched_after_switch(self):
        notification = Notification.objects.create(user=self.owner, title="Private", message="Academic result")
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/notifications/{notification.id}/").status_code, 404)

    def test_notification_queues_once_and_only_after_commit(self):
        with patch("common.tasks.send_web_push_task.delay") as web, patch("common.services.mobile_push.send_mobile_push.delay") as mobile:
            with self.captureOnCommitCallbacks(execute=True):
                note = notify_user(self.owner, title="Class", message="Scheduled")
                web.assert_not_called()
                mobile.assert_not_called()
            web.assert_called_once_with(str(note.pk))
            mobile.assert_called_once_with(str(note.pk))

    def test_bulk_queues_only_new_notification_ids(self):
        with patch("common.services.mobile_push.send_mobile_push.delay") as mobile, patch("common.tasks.send_web_push_task.delay"):
            with self.captureOnCommitCallbacks(execute=True):
                created = notify_users_bulk([self.owner, self.other], title="Class", message="Scheduled")
            self.assertEqual({call.args[0] for call in mobile.call_args_list}, {str(item.pk) for item in created})
            mobile.reset_mock()
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(notify_users_bulk([self.owner, self.other], title="Class", message="Scheduled"), [])
            mobile.assert_not_called()

    def test_ordinary_notifications_use_normal_delivery(self):
        notification = Notification(title="Assignment published")
        self.assertEqual(
            android_delivery(notification, None),
            {"priority": "NORMAL", "ttl": "86400s"},
        )

    def test_app_update_notifications_use_high_priority_delivery(self):
        notification = Notification(
            title="SURE ProEd Update Available",
            dedupe_key="app-release:23",
        )
        self.assertEqual(
            android_delivery(notification, None),
            {"priority": "HIGH", "ttl": "86400s"},
        )

    @patch("common.services.mobile_push.queue_notification")
    def test_started_class_has_complete_high_priority_payload(self, queue):
        session = Attendance.objects.create(
            title="VLSI",
            class_date=timezone.localdate(),
            start_time=time(22, 20),
            end_time=time(23, 20),
        )
        notification = Notification.objects.create(
            user=self.owner,
            title="Class started",
            message="Your class is now live.",
            action_url=f"/attendance/{session.pk}/",
            dedupe_key=f"attendance:{session.pk}:schedule",
        )
        payload = live_class_payload(notification, timezone.now())
        self.assertEqual(payload["type"], "CLASS_STARTED")
        self.assertEqual(payload["class_id"], str(session.pk))
        self.assertEqual(payload["class_title"], "VLSI")
        self.assertIn("scheduled_at", payload)
        self.assertIn("sent_at", payload)
        self.assertEqual(
            android_delivery(notification, payload),
            {"priority": "HIGH", "ttl": "600s"},
        )

        account_session = self.payload["account_session"]
        MobilePushDevice.objects.create(
            user=self.owner,
            token=self.payload["token"],
            account_session=account_session,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            "/api/notifications/push/delivery/",
            {
                "notification_id": str(notification.pk),
                "account_session": account_session,
                "event_type": "CLASS_STARTED",
                "class_id": str(session.pk),
                "scheduled_at": payload["scheduled_at"],
                "sent_at": payload["sent_at"],
                "device_received_at": timezone.now().isoformat(),
                "notification_displayed_at": timezone.now().isoformat(),
                "transport_latency_ms": 4000,
                "schedule_lateness_ms": 240000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        delivery = MobilePushDelivery.objects.get()
        self.assertEqual(delivery.user, self.owner)
        self.assertEqual(delivery.class_id, str(session.pk))

        self.client.force_authenticate(self.other)
        denied = self.client.post(
            "/api/notifications/push/delivery/",
            {
                "notification_id": str(notification.pk),
                "account_session": account_session,
                "event_type": "CLASS_STARTED",
                "class_id": str(session.pk),
                "scheduled_at": payload["scheduled_at"],
                "sent_at": payload["sent_at"],
                "device_received_at": timezone.now().isoformat(),
                "transport_latency_ms": 4000,
                "schedule_lateness_ms": 240000,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(MobilePushDelivery.objects.count(), 1)
