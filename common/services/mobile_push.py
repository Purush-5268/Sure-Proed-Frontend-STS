"""FCM data messages scoped to the currently registered account session."""
import logging
import re
from datetime import datetime
from functools import lru_cache
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from celery import shared_task

logger = logging.getLogger(__name__)
CLASS_ACTION = re.compile(r"^/?attendance/(?P<class_id>[0-9a-fA-F-]+)/?$")


def live_class_payload(notification, sent_at):
    """Return display-complete data only for the two urgent class events."""
    if notification is None:
        return None
    event_type = {
        "class starts soon": "CLASS_STARTING_SOON",
        "class started": "CLASS_STARTED",
    }.get(notification.title.strip().lower())
    match = CLASS_ACTION.match((notification.action_url or "").strip())
    if not event_type or not match:
        return None
    if notification.dedupe_key != f"attendance:{match.group('class_id')}:schedule":
        return None

    from attendance.models import Attendance
    session = Attendance.objects.filter(pk=match.group("class_id")).first()
    if session is None or not session.class_date or not session.start_time:
        return None
    scheduled_at = timezone.make_aware(
        datetime.combine(session.class_date, session.start_time),
        timezone.get_current_timezone(),
    )
    return {
        "type": event_type,
        "class_id": str(session.pk),
        "class_title": (session.title or "Your class")[:120],
        "scheduled_at": scheduled_at.isoformat(),
        "sent_at": sent_at.isoformat(),
    }


def android_delivery(notification, class_payload):
    if class_payload:
        ttl = "420s" if class_payload["type"] == "CLASS_STARTING_SOON" else "600s"
        return {"priority": "HIGH", "ttl": ttl}
    title = (getattr(notification, "title", "") or "").upper()
    dedupe_key = (getattr(notification, "dedupe_key", "") or "").lower()
    if dedupe_key.startswith("app-release:") or "APP UPDATE" in title or "UPDATE AVAILABLE" in title:
        return {"priority": "HIGH", "ttl": "86400s"}
    if "CLASS CANCELLED" in title or "EMERGENCY" in title:
        return {"priority": "HIGH", "ttl": "3600s"}
    return {"priority": "NORMAL", "ttl": "86400s"}


def queue_notification(notification_id, user_id=None):
    def enqueue():
        from common.tasks import send_web_push_task
        for task in (send_web_push_task, send_mobile_push):
            try:
                if user_id is not None and task == send_mobile_push:
                    task.delay(str(notification_id), recipient_id=str(user_id))
                elif user_id is None:
                    task.delay(str(notification_id))
            except Exception:
                logger.error("Could not enqueue notification delivery (%s)", task.name)
    transaction.on_commit(enqueue)


@lru_cache(maxsize=2)
def credentials_for(path):
    from google.oauth2 import service_account
    return service_account.Credentials.from_service_account_file(
        path, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
    )


@shared_task(bind=True, max_retries=4, default_retry_delay=30)
def send_mobile_push(self, notification_id, recipient_id=None):
    from common.models import Notification, MobilePushDevice
    from google.auth.transport.requests import AuthorizedSession
    path = getattr(settings, "FCM_CREDENTIALS_FILE", "")
    project = getattr(settings, "FCM_PROJECT_ID", "")
    if not path or not project:
        return {"status": "not_configured"}
    notification = Notification.objects.filter(pk=notification_id, user__is_active=True).first()
    if not notification and not recipient_id:
        return {"status": "not_found"}
    owner_id = notification.user_id if notification else recipient_id
    # Ordinary/private notifications keep the ID-only authenticated fetch path.
    # The two time-sensitive class events include the minimum display fields so
    # Android can render them synchronously inside onMessageReceived().
    try:
        credentials = credentials_for(path)
        if credentials.project_id != project:
            raise ValueError("FCM credential project mismatch")
        with AuthorizedSession(credentials) as transport:
            for device in MobilePushDevice.objects.filter(user_id=owner_id, user__is_active=True, is_active=True):
                # Capture this immediately before the request for per-device latency.
                sent_at = timezone.now()
                class_payload = live_class_payload(notification, sent_at)
                android = android_delivery(notification, class_payload)
                data = {"notification_id": str(notification_id), "account_session": str(device.account_session)}
                if class_payload:
                    data.update(class_payload)
                response = transport.post(
                    f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
                    json={"message": {"token": device.token, "data": data,
                          "android": android}}, timeout=15)
                if response.status_code == 200:
                    continue
                details = response.json().get("error", {}).get("details", [])
                if any(item.get("errorCode") == "UNREGISTERED" for item in details):
                    MobilePushDevice.objects.filter(pk=device.pk, token=device.token, account_session=device.account_session).update(is_active=False)
                elif response.status_code == 429 or response.status_code >= 500:
                    raise RuntimeError("FCM temporarily unavailable")
                else:
                    logger.error("FCM delivery rejected with HTTP %s", response.status_code)
    except Exception:
        # Never include token, credential, or response bodies in logs/task errors.
        raise self.retry(exc=RuntimeError("Mobile push delivery failed"))
    return {"status": "sent"}
