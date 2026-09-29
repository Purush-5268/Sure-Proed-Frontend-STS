"""Validate VM prior-permission payloads without exposing unrelated students."""
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from students.models import StudentProfile
from common.access import can_manage_cohort, has_global_cohort_access


def validate_prior_permissions(payload, user, cohort, class_type='DOMAIN', lst_batch=None):
    class Item(serializers.Serializer):
        student_id = serializers.UUIDField()
        reason = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    serializer = Item(data=payload, many=True)
    serializer.is_valid(raise_exception=True)
    if not serializer.validated_data:
        return []
    if (cohort is not None and not can_manage_cohort(user, cohort)) or (cohort is None and not has_global_cohort_access(user)):
        raise PermissionDenied("Prior permissions require an assigned cohort.")
    ids = {row["student_id"] for row in serializer.validated_data}
    eligible = StudentProfile.objects.filter(pk__in=ids, user__is_active=True)
    if cohort is not None:
        eligible = eligible.filter(applications__assigned_cohort=cohort)
    else:
        from attendance.services.student_scope import ENROLLED_STATUSES
        from applications.models import Application
        applications = Application.objects.filter(assigned_cohort__isnull=False, status__in=ENROLLED_STATUSES).exclude(status='COMPLETED')
        if class_type == 'LST':
            applications = applications.filter(assigned_cohort__status__in=['ACTIVE','TRAINING','INTERNSHIP','SOFT_SKILLS'])
        elif class_type == 'SOFTSKILLS':
            applications = applications.filter(assigned_cohort__status='SOFT_SKILLS')
        else:
            raise PermissionDenied('A cohort is required for this class type.')
        if lst_batch == 'COMBINED':
            applications = applications.filter(assigned_cohort__lst_batch__in=['BATCH_1','BATCH_2'])
        elif lst_batch and lst_batch != 'GENERAL':
            applications = applications.filter(assigned_cohort__lst_batch=lst_batch)
        eligible = eligible.filter(applications__in=applications)
    students = {student.pk: student for student in eligible.distinct()}
    if ids != students.keys():
        raise PermissionDenied("All students must belong to the selected cohort.")
    return [(students[row["student_id"]], row["reason"]) for row in serializer.validated_data]
