"""Authoritative role and cohort routing for announcements."""

from django.db.models import Q
from django.db import transaction

from accounts.models import User
from applications.models import Application
from common.models import Announcement, Notification


ROLE_AUDIENCE = {
    User.Role.STUDENT: Announcement.TargetAudience.STUDENTS,
    User.Role.MENTOR: Announcement.TargetAudience.MENTORS,
    User.Role.VOLUNTEER: Announcement.TargetAudience.VOLUNTEERS,
}


def is_platform_admin(user):
    """Staff status alone must never broaden a functional account's audience."""
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and (getattr(user, "is_superuser", False) or getattr(user, "role", "") == User.Role.ADMIN)
    )


def _is_assigned_to_cohort(user, cohort):
    role = getattr(user, "role", "")
    if role == User.Role.STUDENT:
        return Application.objects.filter(
            student__user=user,
            assigned_cohort=cohort,
        ).exists()
    if role == User.Role.MENTOR:
        return cohort.mentors.filter(pk=user.pk, role=User.Role.MENTOR, is_active=True).exists()
    if role == User.Role.VOLUNTEER:
        return cohort.volunteers.filter(pk=user.pk, role=User.Role.VOLUNTEER, is_active=True).exists()
    return False


def visible_announcements_for_user(user, queryset=None):
    """Return only announcements explicitly addressed to this role and assignment."""
    qs = queryset if queryset is not None else Announcement.objects.all()
    qs = qs.filter(is_active=True)

    if not user or not getattr(user, "is_authenticated", False):
        return qs.none()
    if is_platform_admin(user):
        return qs

    role = getattr(user, "role", "")
    role_audience = ROLE_AUDIENCE.get(role)
    all_users = Q(target_audience=Announcement.TargetAudience.ALL, cohort__isnull=True)
    if role_audience is None:
        # Trustee and Company accounts receive intentional All Users broadcasts
        # plus their personalized Notification rows.
        return qs.filter(all_users)

    role_wide = Q(target_audience=role_audience, cohort__isnull=True)
    if role == User.Role.STUDENT:
        assigned_ids = Application.objects.filter(
            student__user=user,
            assigned_cohort__isnull=False,
        ).exclude(
            status__in=["DROPPED", "CANCELLED", "REJECTED", "SUSPENDED"]
        ).values_list("assigned_cohort_id", flat=True)
        assigned_scope = Q(cohort_id__in=assigned_ids)
    elif role == User.Role.MENTOR:
        assigned_scope = Q(cohort__mentors=user)
    else:
        assigned_scope = Q(cohort__volunteers=user)

    return qs.filter(
        all_users
        | role_wide
        | (Q(target_audience=role_audience) & assigned_scope)
        | (Q(target_audience=Announcement.TargetAudience.COHORT) & assigned_scope)
    ).distinct()


def announcement_recipients(announcement):
    """Resolve exact active recipients for a role, cohort, or intentional all-user broadcast."""
    cohort = announcement.cohort
    audience = announcement.target_audience

    if audience == Announcement.TargetAudience.ALL:
        if cohort is not None:
            return User.objects.none()
        return User.objects.filter(
            role__in=[choice.value for choice in User.Role],
            is_active=True,
        ).distinct()

    if audience == Announcement.TargetAudience.COHORT:
        if cohort is None:
            return User.objects.none()
        students = User.objects.filter(
            role=User.Role.STUDENT,
            is_active=True,
            student_profile__applications__assigned_cohort=cohort,
        ).exclude(
            student_profile__applications__status__in=["DROPPED", "CANCELLED", "REJECTED", "SUSPENDED"]
        )
        mentors = User.objects.filter(
            role=User.Role.MENTOR,
            is_active=True,
            mentored_cohorts=cohort,
        )
        volunteers = User.objects.filter(
            role=User.Role.VOLUNTEER,
            is_active=True,
            volunteered_cohorts=cohort,
        )
        return (students | mentors | volunteers).distinct()

    role_by_audience = {audience_value: role for role, audience_value in ROLE_AUDIENCE.items()}
    role = role_by_audience.get(audience)
    if role is None:
        return User.objects.none()

    users = User.objects.filter(role=role, is_active=True)
    if cohort is None:
        return users.distinct()
    if role == User.Role.STUDENT:
        return users.filter(
            student_profile__applications__assigned_cohort=cohort
        ).exclude(
            student_profile__applications__status__in=["DROPPED", "CANCELLED", "REJECTED", "SUSPENDED"]
        ).distinct()
    if role == User.Role.MENTOR:
        return users.filter(mentored_cohorts=cohort).distinct()
    return users.filter(volunteered_cohorts=cohort).distinct()


@transaction.atomic
def dispatch_announcement(announcement):
    """Materialize one personal bell notification for every resolved recipient."""
    announcement = Announcement.objects.select_for_update().get(pk=announcement.pk)
    recipients = list(announcement_recipients(announcement)) if announcement.is_active else []
    action_url = f"announcements?announcement_id={announcement.pk}"
    # Revoke old recipients when the audience changes, including legacy rows.
    Notification.objects.filter(Q(announcement=announcement) | Q(action_url=action_url)).exclude(user__in=recipients).delete()
    notifications = []
    from common.services.notifications import notify_user
    for recipient in recipients:
        notification = notify_user(
            recipient, action_url=action_url, dedupe_key=f"announcement:{announcement.pk}",
            announcement=announcement, title=f"Announcement: {announcement.title}",
            message=announcement.message,
        )
        notifications.append(notification)
    return notifications
