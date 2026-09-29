from unittest.mock import patch
from django.test import TestCase
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient
from accounts.models import User
from common.models import Announcement, Notification
from common.services.notifications import notify_user, notify_users_bulk
from common.services.announcement_routing import dispatch_announcement


class NotificationLifecycleTests(TestCase):
    def setUp(self):
        self.a = User.objects.create_user(email="isolation-a@example.test", password="test-password", role="STUDENT", is_active=True)
        self.b = User.objects.create_user(email="isolation-b@example.test", password="test-password", role="STUDENT", is_active=True)
        self.client = APIClient()
        self.client.force_authenticate(self.a)

    def notify(self, user=None, **kwargs):
        return notify_user(user or self.a, title="Class", message="Original", dedupe_key="class:123", **kwargs)

    def test_update_retains_identity_and_replay_preserves_read_state(self):
        original = self.notify()
        original.is_read = True
        original.save()
        replay = self.notify()
        self.assertTrue(replay.is_read)
        updated = notify_user(self.a, title="Updated class", message="New time", dedupe_key="class:123")
        self.assertEqual(updated.pk, original.pk)
        self.assertFalse(updated.is_read)
        self.assertEqual(Notification.objects.filter(user=self.a).count(), 1)
        self.assertEqual(self.client.get("/api/notifications/").data["results"][0]["message"], "New time")

    def test_legacy_migration_reconciles_duplicates_and_advances_changed_version(self):
        import importlib
        from django.apps import apps
        announcement = Announcement.objects.create(title='Current', message='Current body', target_audience='STUDENTS')
        path = f'announcements?announcement_id={announcement.pk}'
        old = Notification.objects.create(user=self.a, title='Old', message='Old body', action_url=path, is_read=True)
        latest = Notification.objects.create(user=self.a, title='Old', message='Old body', action_url=path, is_read=True)
        previous_version = latest.updated_at
        importlib.import_module('common.migrations.0012_reconcile_notification_history').reconcile(apps, None)
        self.assertFalse(Notification.objects.filter(pk=old.pk).exists())
        latest.refresh_from_db()
        self.assertEqual(latest.message, 'Current body')
        self.assertFalse(latest.is_read)
        self.assertGreater(latest.updated_at, previous_version)
        self.assertEqual(latest.announcement_id, announcement.pk)

    def test_two_accounts_cannot_read_write_delete_or_reassign_others_data(self):
        own, other = self.notify(), self.notify(self.b)
        for user, visible, hidden in [(self.a, own, other), (self.b, other, own)]:
            self.client.force_authenticate(user)
            response = self.client.get("/api/notifications/", {"user": str(hidden.user_id)})
            self.assertEqual({n["id"] for n in response.data["results"]}, {str(visible.pk)})
            self.assertIn("no-store", response["Cache-Control"])
            self.assertEqual(self.client.get(f"/api/notifications/{hidden.pk}/").status_code, 404)
            self.assertEqual(self.client.post(f"/api/notifications/{hidden.pk}/mark-read/").status_code, 404)
            self.assertEqual(self.client.post(f"/api/notifications/{hidden.pk}/mark-unread/").status_code, 404)
            self.assertEqual(self.client.delete(f"/api/notifications/{hidden.pk}/").status_code, 404)
        self.a.role = "MENTOR"
        self.a.save()
        self.client.force_authenticate(self.a)
        response = self.client.patch(f"/api/notifications/{own.pk}/", {"user": str(self.b.pk)}, format="json")
        self.assertEqual(response.status_code, 200)
        own.refresh_from_db()
        self.assertEqual(own.user_id, self.a.pk)

    def test_read_unread_all_read_and_delete_reload(self):
        own, other = self.notify(), self.notify(self.b)
        self.assertTrue(self.client.post(f"/api/notifications/{own.pk}/mark-read/").data["is_read"])
        self.assertFalse(self.client.post(f"/api/notifications/{own.pk}/mark-unread/").data["is_read"])
        self.assertEqual(self.client.post("/api/notifications/mark-all-read/").data["updated"], 1)
        self.assertEqual(self.client.get('/api/notifications/', {'is_read': 'false'}).data['results'], [])
        self.assertEqual(self.client.get('/api/notifications/', {'is_read': 'invalid'}).status_code, 400)
        other.refresh_from_db()
        self.assertFalse(other.is_read)
        self.assertEqual(self.client.delete(f"/api/notifications/{own.pk}/").status_code, 204)
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)

    @patch("common.services.mobile_push.send_mobile_push.delay")
    @patch("common.tasks.send_web_push_task.delay")
    def test_deletion_sends_only_session_scoped_invalidation_after_commit(self, web, mobile):
        own = self.notify()
        with self.captureOnCommitCallbacks(execute=True):
            notification_id = own.pk
            own.delete()
            mobile.assert_not_called()
        mobile.assert_called_once_with(str(notification_id), recipient_id=str(self.a.pk))
        web.assert_not_called()

    def test_unique_constraint_and_bulk_repeated_recipients(self):
        self.notify()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Notification.objects.create(user=self.a, title="Duplicate", message="x", dedupe_key="class:123")
        notify_users_bulk([self.a, self.a, self.b], title="New", message="Changed", dedupe_key="class:123")
        self.assertEqual(Notification.objects.count(), 2)

    def test_real_jwt_two_account_transitions_and_anonymous_denial(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        own, other = self.notify(), self.notify(self.b)
        self.client.force_authenticate(user=None)
        for user, expected in [(self.a, own), (self.b, other), (self.a, own)]:
            self.client.credentials(HTTP_AUTHORIZATION="Bearer " + str(RefreshToken.for_user(user).access_token))
            response = self.client.get("/api/notifications/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["id"] for row in response.data["results"]], [str(expected.pk)])
            self.assertEqual(self.client.get("/api/users/me/").data["id"], str(user.pk))
        self.client.credentials()
        self.assertEqual(self.client.get("/api/notifications/").status_code, 401)

    def test_announcement_update_audience_revocation_and_delete(self):
        announcement = Announcement.objects.create(title="Old", message="Old body", target_audience="STUDENTS")
        first = dispatch_announcement(announcement)
        old_ids = {n.user_id: n.pk for n in first}
        announcement.title, announcement.message = "New", "New body"
        announcement.save()
        second = dispatch_announcement(announcement)
        self.assertEqual({n.user_id: n.pk for n in second}, old_ids)
        self.assertEqual(Notification.objects.count(), 2)
        announcement.target_audience = "MENTORS"
        announcement.save()
        dispatch_announcement(announcement)
        self.assertFalse(Notification.objects.exists())
        announcement.target_audience = "STUDENTS"
        announcement.save()
        dispatch_announcement(announcement)
        announcement.delete()
        self.assertFalse(Notification.objects.exists())

    @patch("common.services.mobile_push.send_mobile_push.delay")
    @patch("common.tasks.send_web_push_task.delay")
    def test_push_queued_only_after_commit_and_on_updates(self, web, mobile):
        with self.captureOnCommitCallbacks(execute=True):
            item = self.notify()
            mobile.assert_not_called()
        mobile.assert_called_once_with(str(item.pk))
        with self.captureOnCommitCallbacks(execute=True):
            notify_user(self.a, title="New", message="Update", dedupe_key="class:123")
        self.assertEqual(mobile.call_count, 2)
