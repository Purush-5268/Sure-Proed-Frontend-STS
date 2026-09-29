from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from common.permissions import IsVolunteerOrMentorOrAdmin
from common.access import can_manage_cohort, has_global_cohort_access
from .models import MentorProfile, VolunteerHelpRequest, VolunteerProfile, VolunteerTask
from .serializers import (
    MentorProfileSerializer,
    VolunteerHelpRequestSerializer,
    VolunteerProfileSerializer,
    VolunteerTaskSerializer,
)


class OwnStaffProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "put", "head", "options"]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["user"]

    def get_queryset(self):
        queryset = self.queryset.select_related("user").order_by("user__email")
        user = self.request.user
        if user.is_superuser or getattr(user, "role", "") == "ADMIN":
            return queryset
        return queryset.filter(user=user)

    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        from attendance.models import Attendance
        from datetime import datetime, timedelta
        
        profile = self.get_object()
        user_id = profile.user_id
        
        attendances = Attendance.objects.filter(conducted_by_id=user_id).select_related('cohort', 'cohort__course', 'course')
        
        stats = {
            "classes_generated": 0,
            "classes_completed": 0,
            "classes_cancelled": 0,
            "currently_scheduled_classes": 0,
            "total_completed_class_hours": 0.0,
            "first_contribution_date": None,
            "latest_contribution_date": None,
            "cohort_breakdown": {},
            "class_type_breakdown": {}
        }
        
        for att in attendances:
            stats["classes_generated"] += 1
            
            status = att.class_status
            c_type = att.class_type
            hours = 0.0
            
            if status == "COMPLETED":
                stats["classes_completed"] += 1
                if not stats["first_contribution_date"] or att.class_date < stats["first_contribution_date"]:
                    stats["first_contribution_date"] = att.class_date
                if not stats["latest_contribution_date"] or att.class_date > stats["latest_contribution_date"]:
                    stats["latest_contribution_date"] = att.class_date
                    
                if att.start_time and att.end_time:
                    # Calculate hours
                    start_dt = datetime.combine(att.class_date, att.start_time)
                    end_dt = datetime.combine(att.class_date, att.end_time)
                    if end_dt < start_dt:
                        end_dt += timedelta(days=1)
                    hours = round((end_dt - start_dt).total_seconds() / 3600.0, 2)
                    stats["total_completed_class_hours"] += hours
            elif status == "CANCELLED":
                stats["classes_cancelled"] += 1
            elif status == "SCHEDULED":
                stats["currently_scheduled_classes"] += 1
                
            # Class Type Breakdown
            if c_type not in stats["class_type_breakdown"]:
                stats["class_type_breakdown"][c_type] = {
                    "class_type": c_type,
                    "generated": 0, "completed": 0, "cancelled": 0, "completed_hours": 0.0
                }
            
            ct_stats = stats["class_type_breakdown"][c_type]
            ct_stats["generated"] += 1
            if status == "COMPLETED":
                ct_stats["completed"] += 1
                if att.start_time and att.end_time:
                    ct_stats["completed_hours"] += hours
            elif status == "CANCELLED":
                ct_stats["cancelled"] += 1
                
            # Cohort Breakdown
            cohort_id = str(att.cohort_id) if att.cohort_id else "No Cohort"
            if cohort_id not in stats["cohort_breakdown"]:
                stats["cohort_breakdown"][cohort_id] = {
                    "cohort_id": cohort_id if att.cohort_id else None,
                    "cohort_name": att.cohort.name if att.cohort else "N/A",
                    "course_name": att.course.name if att.course else (att.cohort.course.name if att.cohort and att.cohort.course else "N/A"),
                    "classes_generated": 0,
                    "classes_completed": 0,
                    "classes_cancelled": 0,
                    "total_completed_hours": 0.0,
                    "last_class_date": None
                }
                
            ch_stats = stats["cohort_breakdown"][cohort_id]
            ch_stats["classes_generated"] += 1
            if status == "COMPLETED":
                ch_stats["classes_completed"] += 1
                if att.start_time and att.end_time:
                    ch_stats["total_completed_hours"] += hours
                if not ch_stats["last_class_date"] or att.class_date > ch_stats["last_class_date"]:
                    ch_stats["last_class_date"] = att.class_date
            elif status == "CANCELLED":
                ch_stats["classes_cancelled"] += 1
                
        # Format for JSON response
        stats["cohort_breakdown"] = list(stats["cohort_breakdown"].values())
        stats["class_type_breakdown"] = list(stats["class_type_breakdown"].values())
        
        return Response(stats, status=status.HTTP_200_OK)


class MentorProfileViewSet(OwnStaffProfileViewSet):
    queryset = MentorProfile.objects.all()
    serializer_class = MentorProfileSerializer


class VolunteerProfileViewSet(OwnStaffProfileViewSet):
    queryset = VolunteerProfile.objects.all()
    serializer_class = VolunteerProfileSerializer


class VolunteerTaskViewSet(viewsets.ModelViewSet):
    queryset = VolunteerTask.objects.select_related("cohort", "assigned_to", "assigned_by").all().order_by("-created_at")
    serializer_class = VolunteerTaskSerializer
    permission_classes = [IsAuthenticated, IsVolunteerOrMentorOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if has_global_cohort_access(user):
            return self.queryset
        if getattr(user, "role", "") == "MENTOR":
            return self.queryset.filter(cohort__mentors=user).distinct()
        if getattr(user, "role", "") in {"VOLUNTEER", "TRUSTEE"}:
            return self.queryset.filter(
                Q(cohort__volunteers=user) | Q(cohort__isnull=True, assigned_to=user)
            ).distinct()
        return self.queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        cohort = serializer.validated_data.get("cohort")
        assigned_to = serializer.validated_data.get("assigned_to")
        if not has_global_cohort_access(user):
            if cohort is not None and not can_manage_cohort(user, cohort):
                raise PermissionDenied("This task is not for one of your assigned cohorts.")
            if cohort is None and assigned_to != user:
                raise ValidationError({"cohort": "Choose an assigned cohort when assigning a task to another person."})
            if cohort is not None and assigned_to is not None:
                is_member = cohort.volunteers.filter(pk=assigned_to.pk).exists() or cohort.mentors.filter(pk=assigned_to.pk).exists()
                if not is_member:
                    raise ValidationError({"assigned_to": "The assignee must be a mentor or volunteer in this cohort."})
        serializer.save(assigned_by=self.request.user)

    def perform_update(self, serializer):
        from common.access import can_manage_cohort
        instance = serializer.instance
        cohort = serializer.validated_data.get("cohort", instance.cohort)
        assignee = serializer.validated_data.get("assigned_to", instance.assigned_to)
        if not has_global_cohort_access(self.request.user):
            if cohort is not None and not can_manage_cohort(self.request.user, cohort):
                raise PermissionDenied("This cohort is not assigned to your account.")
            if cohort is None and assignee != self.request.user:
                raise PermissionDenied("Unscoped tasks must belong to your account.")
            if cohort and assignee and not (cohort.volunteers.filter(pk=assignee.pk).exists() or cohort.mentors.filter(pk=assignee.pk).exists()):
                raise ValidationError({"assigned_to": "The assignee must belong to this cohort."})
        serializer.save()


class VolunteerHelpRequestViewSet(viewsets.ModelViewSet):
    queryset = VolunteerHelpRequest.objects.select_related("task", "cohort", "requested_by").prefetch_related("assisting_volunteers").all().order_by("-created_at")
    serializer_class = VolunteerHelpRequestSerializer
    permission_classes = [IsAuthenticated, IsVolunteerOrMentorOrAdmin]

    def get_queryset(self):
        from common.access import assigned_cohort_ids
        if has_global_cohort_access(self.request.user):
            return self.queryset
        return self.queryset.filter(Q(cohort_id__in=assigned_cohort_ids(self.request.user)) | Q(requested_by=self.request.user)).distinct()

    def _validate_scope(self, serializer):
        instance = serializer.instance
        cohort = serializer.validated_data.get("cohort", getattr(instance, "cohort", None))
        task = serializer.validated_data.get("task", getattr(instance, "task", None))
        if not has_global_cohort_access(self.request.user):
            if cohort and not can_manage_cohort(self.request.user, cohort):
                raise PermissionDenied("This cohort is not assigned to your account.")
            if task and not (task.assigned_to_id == self.request.user.pk or can_manage_cohort(self.request.user, task.cohort)):
                raise PermissionDenied("This task is not assigned to your account.")

    def perform_create(self, serializer):
        self._validate_scope(serializer)
        serializer.save(requested_by=self.request.user)

    def perform_update(self, serializer):
        self._validate_scope(serializer)
        serializer.save(requested_by=serializer.instance.requested_by)

    @action(detail=True, methods=["post"])
    def offer_help(self, request, pk=None):
        """Action for a co-volunteer to step in and offer help on a request."""
        help_request = self.get_object()
        if request.user not in help_request.assisting_volunteers.all():
            help_request.assisting_volunteers.add(request.user)
            if help_request.status == VolunteerHelpRequest.Status.OPEN:
                help_request.status = VolunteerHelpRequest.Status.IN_PROGRESS
            help_request.save()
        return Response(
            {"message": "Thank you for offering help!", "status": help_request.status},
            status=status.HTTP_200_OK,
        )
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q, Sum, F, ExpressionWrapper, FloatField
from django.utils import timezone
from collections import defaultdict
import datetime
import calendar

from attendance.models import Attendance
from cohorts.models import Cohort
from students.models import StudentProfile
from applications.models import Application

class VolunteerContributionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        role = getattr(user, 'role', None)

        user_id = kwargs.get('user_id')
        if user_id:
            if not (user.is_superuser or role == 'TRUSTEE'):
                return Response({"detail": "You do not have permission to view other users' contributions."}, status=403)
            from django.contrib.auth import get_user_model
            user = get_user_model().objects.filter(pk=user_id).first()
            if not user:
                return Response({"detail": "User not found."}, status=404)
        else:
            if role not in ['VOLUNTEER', 'TRUSTEE'] and not user.is_superuser:
                return Response({"detail": "You do not have permission to view volunteer contributions."}, status=403)

        # 1. Authoritative Classes Conducted or Assisted
        conducted_sessions = Attendance.objects.filter(
            conducted_by=user,
            class_status='COMPLETED'
        ).select_related('cohort', 'course').order_by('-class_date', '-start_time').distinct()

        # Compute Total Hours, Avg Attendance, Monthly Hours, Recent Activity
        total_seconds = 0
        sum_attendance_pct = 0.0
        expected_students_count = 0
        monthly_map = defaultdict(int)
        recent_activity = []
        cohort_classes_count = defaultdict(int)

        raw_activities = []

        for session in conducted_sessions[:10]:
            metrics = session.google_meet_attendance_data.get('class_metrics', {}) if isinstance(session.google_meet_attendance_data, dict) else {}
            duration_sec = metrics.get('duration_seconds', 0)
            try:
                duration_sec = int(duration_sec)
            except (ValueError, TypeError):
                duration_sec = 0

            total_seconds += duration_sec

            month_key = session.class_date.strftime("%Y-%m")
            monthly_map[month_key] += duration_sec

            if session.cohort_id:
                cohort_classes_count[session.cohort_id] += 1

            cohort_name = session.cohort.code if session.cohort else (session.course.name if session.course else "General")
            raw_activities.append({
                "timestamp": session.created_at,
                "id": f"class_{session.id}",
                "title": f"Hosted {session.class_type} session",
                "subtitle": cohort_name,
                "meta_text": f"{duration_sec // 60} mins" if duration_sec else "0 mins",
                "date": session.created_at.isoformat()
            })

        # Attendance
            if isinstance(session.google_meet_attendance_data, dict):
                expected = session.google_meet_attendance_data.get('expected_students', {})
                if isinstance(expected, dict):
                    for _, p_data in expected.items():
                        sum_attendance_pct += p_data.get('attendance_percentage', 0.0)
                        expected_students_count += 1

        from attendance.models import PriorPermission
        granted_permissions = PriorPermission.objects.filter(granted_by=user).select_related('student__user', 'session')
        
        for perm in granted_permissions.order_by('-created_at')[:10]:
            student_name = perm.student.user.get_full_name() if hasattr(perm.student, 'user') else str(perm.student)
            cohort_str = perm.session.cohort.code if (perm.session and perm.session.cohort) else 'General'
            raw_activities.append({
                "timestamp": perm.created_at,
                "id": f"perm_{perm.id}",
                "title": "Granted Prior Permission",
                "subtitle": f"For {student_name} in {cohort_str}",
                "meta_text": "Permission",
                "date": perm.created_at.isoformat()
            })
            
        raw_activities.sort(key=lambda x: x["timestamp"], reverse=True)
        recent_activity = raw_activities[:5]
        for act in recent_activity:
            act.pop("timestamp", None)

        total_hours = round(total_seconds / 3600, 1)
        average_attendance = round(sum_attendance_pct / expected_students_count, 1) if expected_students_count > 0 else 0.0

        # Monthly formatting
        monthly_hours = []
        for month_str in sorted(monthly_map.keys()):
            monthly_hours.append({
                "month": month_str,
                "hours": round(monthly_map[month_str] / 3600, 1)
            })

        # 2. Students Impacted (Distinct)
        students_impacted = StudentProfile.objects.filter(
            applications__assigned_cohort__volunteers=user,
            applications__status__in=[
                'COHORT_ASSIGNED', 'IN_PROGRESS', 'TRAINING',
                'INTERNSHIP_ASSIGNED', 'SOFT_SKILLS', 'COMPLETED'
            ]
        ).distinct().count()

        # 3. Cohorts Overview
        my_cohorts_qs = Cohort.objects.filter(volunteers=user).select_related('course').annotate(active_students=Count('applications', filter=Q(applications__status__in=['COHORT_ASSIGNED', 'IN_PROGRESS', 'TRAINING', 'INTERNSHIP_ASSIGNED', 'SOFT_SKILLS', 'COMPLETED'])))
        cohorts_list = []
        for c in my_cohorts_qs:
            # Active students in this cohort
            active_students = getattr(c, 'active_students', 0)
            # old query removed
            # removed
            # removed
            # removed
            # removed
            # removed
            # removed

            cohorts_list.append({
                "id": str(c.id),
                "name": c.name,
                "code": c.code,
                "course": c.course.name if c.course else None,
                "status": c.status,
                "students_count": active_students,
                "classes_conducted": cohort_classes_count.get(c.id, 0)
            })

        return Response({
            "summary": {
                "total_hours": total_hours,
                "classes_conducted": conducted_sessions.count(),
                "students_impacted": students_impacted,
                "average_attendance": average_attendance,
                "permissions_granted": granted_permissions.count()
            },
            "cohorts": cohorts_list,
            "recent_activity": recent_activity,
            "monthly_hours": monthly_hours
        })
