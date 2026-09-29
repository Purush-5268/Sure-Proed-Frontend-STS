from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from django.test import TransactionTestCase
from django.db import connection, connections
from accounts.models import User
from common.models import Notification
from common.services.notifications import notify_user


class NotificationConcurrencyTests(TransactionTestCase):
    def test_simultaneous_updates_keep_one_row(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock race verification runs against isolated PostgreSQL")
        user = User.objects.create_user(email="concurrency@example.test", password="TestPassword123!", role="STUDENT")
        barrier = Barrier(2)
        def update(message):
            try:
                current = User.objects.get(pk=user.pk)
                barrier.wait(timeout=10)
                return notify_user(current, title="Class", message=message, dedupe_key="class:race").pk
            finally:
                connections.close_all()
        with patch("common.services.mobile_push.queue_notification"), ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(update, ["Version one", "Version two"]))
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(Notification.objects.filter(user=user).count(), 1)
