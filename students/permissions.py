from rest_framework.permissions import BasePermission, SAFE_METHODS
from common.access import has_global_cohort_access, assigned_cohort_ids, is_admin


def can_read_student_document(user, profile):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if profile.user_id == user.pk or has_global_cohort_access(user):
        return True
    return profile.applications.filter(assigned_cohort_id__in=assigned_cohort_ids(user)).exists()


class StudentProfilePermission(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return can_read_student_document(request.user, obj)
        return obj.user_id == request.user.pk or is_admin(request.user)
