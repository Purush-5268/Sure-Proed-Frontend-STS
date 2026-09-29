"""Shared role and cohort access helpers for dashboard API viewsets."""


def is_admin(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") == "ADMIN")
    )


def has_global_cohort_access(user):
    return bool(is_admin(user) or getattr(user, "has_all_cohorts_access", False))


def assigned_cohort_ids(user):
    """Return the cohort UUIDs explicitly assigned to a mentor/volunteer."""
    if not user or not user.is_authenticated:
        return []
    if has_global_cohort_access(user):
        from cohorts.models import Cohort

        return list(Cohort.objects.values_list("id", flat=True))

    role = getattr(user, "role", "")
    if role == "MENTOR":
        from cohorts.models import Cohort
        from django.db.models import Q
        return list(Cohort.objects.filter(Q(mentors=user) | Q(current_mentors=user)).values_list("id", flat=True).distinct())
    if role in {"VOLUNTEER", "TRUSTEE"}:
        return list(user.volunteered_cohorts.values_list("id", flat=True))
    return []


def can_manage_cohort(user, cohort):
    if not user or not user.is_authenticated or cohort is None:
        return False
    if has_global_cohort_access(user):
        return True
    role = getattr(user, "role", "")
    if role == "MENTOR":
        return cohort.pk in assigned_cohort_ids(user)
    if role in {"VOLUNTEER", "TRUSTEE"}:
        return cohort.volunteers.filter(pk=user.pk).exists()
    return False


def visible_support_requests(user):
    """Owners see their requests; reviewers see only their authorized students."""
    from common.models import UserRequest
    from applications.models import Application
    from django.db.models import Q

    qs = UserRequest.objects.select_related("sender", "resolved_by")
    if not user or not user.is_authenticated or not user.is_active:
        return qs.none()
    if is_admin(user):
        return qs.all()
    if getattr(user, "role", "") in {"VOLUNTEER", "TRUSTEE"}:
        students = Application.objects.filter(
            assigned_cohort_id__in=assigned_cohort_ids(user)
        ).values("student__user_id")
        return qs.filter(Q(sender=user) | Q(sender_id__in=students, sender__role="STUDENT"))
    return qs.filter(sender=user)


def is_advisor(user):
    """Check if user has an Advisor role (role=ADVISOR or category=ADVISORY)."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "role", "") == "ADVISOR":
        return True
    if getattr(user, "role", "") == "TRUSTEE":
        if getattr(user, "admin_category", "") == "ADVISORY":
            return True
        from accounts.models import AdministratorProfile
        cat = AdministratorProfile.objects.filter(user_id=user.pk).values_list("category", flat=True).first()
        if cat == AdministratorProfile.Category.ADVISORY:
            return True
    return False


def is_trustee(user):
    """Check if user is a standard Trustee (not Advisor)."""
    if not user or not user.is_authenticated:
        return False
    if is_advisor(user):
        return False
    return getattr(user, "role", "") == "TRUSTEE"


def is_volunteer(user):
    """Check if user is a Volunteer."""
    if not user or not user.is_authenticated:
        return False
    return getattr(user, "role", "") == "VOLUNTEER"


def get_user_communication_group(user):
    """
    Returns the communication group associated with the user's role.
    For non-admin users, returns one of:
      - 'TRUSTEE_GROUP'
      - 'ADVISOR_GROUP'
      - 'VOLUNTEER_GROUP'
    For Admin, returns None (Admin has access to all groups).
    """
    if not user or not user.is_authenticated:
        return None
    if is_admin(user):
        return None
    if is_advisor(user):
        return "ADVISOR_GROUP"
    if is_trustee(user):
        return "TRUSTEE_GROUP"
    if is_volunteer(user):
        return "VOLUNTEER_GROUP"
    return None


def can_access_communication_group(user, group_type):
    """
    Check if the user is authorized to read/send messages in group_type:
    - Admin: can access TRUSTEE_GROUP, ADVISOR_GROUP, VOLUNTEER_GROUP
    - Trustee: can ONLY access TRUSTEE_GROUP
    - Advisor: can ONLY access ADVISOR_GROUP
    - Volunteer: can ONLY access VOLUNTEER_GROUP
    """
    if not user or not user.is_authenticated:
        return False
    if is_admin(user):
        return group_type in {"TRUSTEE_GROUP", "ADVISOR_GROUP", "VOLUNTEER_GROUP"}
    if is_advisor(user):
        return group_type == "ADVISOR_GROUP"
    if is_trustee(user):
        return group_type == "TRUSTEE_GROUP"
    if is_volunteer(user):
        return group_type == "VOLUNTEER_GROUP"
    return False
