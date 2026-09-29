"""Idempotent, candidate-specific in-app notification helpers."""

from common.models import Notification
from django.db import transaction


def display_name(user):
    full_name = user.get_full_name().strip() if user else ""
    return full_name or getattr(user, "email", "Student")


def notify_user(
    user,
    *,
    title,
    message,
    notification_type=Notification.Type.INFO,
    action_url=None,
    dedupe_key=None,
    announcement=None,
):
    if user is None:
        return None
    payload = dict(title=title, message=message, notification_type=notification_type,
                   action_url=action_url, announcement=announcement)
    if not dedupe_key:
        notification = Notification.objects.create(user=user, **payload)
        from common.services.mobile_push import queue_notification
        queue_notification(notification.id)
        return notification
    if len(dedupe_key) > 255:
        raise ValueError("Notification deduplication key exceeds 255 characters")
    with transaction.atomic():
        # Serialize per recipient, including the first insert and legacy adoption.
        type(user).objects.select_for_update().get(pk=user.pk)
        notification = Notification.objects.select_for_update().filter(user=user, dedupe_key=dedupe_key).first()
        if notification is None:
            legacy = Notification.objects.filter(user=user, dedupe_key__isnull=True,
                title=title, message=message, action_url=action_url)
            notification = legacy.first()
            if notification is not None:
                legacy.exclude(pk=notification.pk).delete()
                notification.dedupe_key = dedupe_key
                notification.save(update_fields=["dedupe_key"])
        if notification is None:
            notification = Notification.objects.create(user=user, dedupe_key=dedupe_key, **payload)
            from common.services.mobile_push import queue_notification
            queue_notification(notification.id)
            return notification
        changed = [field for field, value in payload.items() if getattr(notification, field) != value]
        if changed:
            for field, value in payload.items():
                setattr(notification, field, value)
            notification.is_read = False
            notification.save(update_fields=[*changed, "is_read", "updated_at"])
            from common.services.mobile_push import queue_notification
            queue_notification(notification.id)
        return notification


@transaction.atomic
def notify_users_bulk(users, *, title, message, notification_type=Notification.Type.INFO, action_url=None, dedupe_key=None, prevent_duplicate_hours=24):
    """
    Send notifications to multiple users efficiently using bulk_create.
    Prevents duplicates based on title and action_url over a given time window.
    """
    from django.utils import timezone
    from datetime import timedelta
    
    if not users:
        return []

    users = list({user.pk: user for user in users}.values())
    users.sort(key=lambda user: str(user.pk))
    # Serialize first inserts in deterministic recipient order, including calls without a key.
    list(type(users[0]).objects.select_for_update().filter(pk__in=[u.pk for u in users]).order_by("pk"))
    if dedupe_key:
        return [notify_user(user, title=title, message=message,
            notification_type=notification_type, action_url=action_url, dedupe_key=dedupe_key)
            for user in users]

    recent_cutoff = timezone.now() - timedelta(hours=prevent_duplicate_hours)
    
    qs = Notification.objects.filter(
        user__in=users,
        title=title,
        created_at__gte=recent_cutoff
    )
    if action_url:
        qs = qs.filter(action_url=action_url)
    
    already_notified_user_ids = set(qs.values_list('user_id', flat=True))
    
    to_create = []
    for user in users:
        if user.id not in already_notified_user_ids:
            to_create.append(Notification(
                user=user,
                title=title,
                message=message,
                notification_type=notification_type,
                action_url=action_url
            ))
    
    if to_create:
        created = Notification.objects.bulk_create(to_create)
        from common.services.mobile_push import queue_notification
        for notification in created:
            queue_notification(notification.id)
        return to_create
    return []


def notify_cohort(cohort, **notification):
    """Create one personal notification for every active student in a cohort."""
    from accounts.models import User

    users = User.objects.filter(
        role=User.Role.STUDENT,
        is_active=True,
        student_profile__applications__assigned_cohort=cohort,
    ).distinct()
    return notify_users_bulk(list(users), **notification)

def notify_course(course, **notification):
    """Create one personal notification for every active student in a course (via active cohorts)."""
    from accounts.models import User
    
    users = User.objects.filter(
        role=User.Role.STUDENT,
        is_active=True,
        student_profile__applications__assigned_cohort__course=course,
        student_profile__applications__assigned_cohort__status__in=["ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS"]
    ).distinct()
    return notify_users_bulk(list(users), **notification)

def notify_mentors(cohort, **notification):
    """Create one personal notification for every mentor assigned to a cohort. Falls back to ADMINs."""
    from accounts.models import User
    
    mentors = list(cohort.mentors.filter(role=User.Role.MENTOR, is_active=True))
    if not mentors:
        return notify_admins(**notification)
        
    return notify_users_bulk(mentors, **notification)

def notify_admins(**notification):
    """Create one personal notification for every admin user."""
    from accounts.models import User
    
    admins = User.objects.filter(is_active=True, role='ADMIN').distinct()
    return notify_users_bulk(list(admins), **notification)
