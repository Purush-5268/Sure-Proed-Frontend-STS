from django.http import Http404
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from common.permissions import IsOwnerOrAdmin, IsMentorOrAdminOrReadOnly
from common.access import can_manage_cohort, has_global_cohort_access
from common.models import Notification
from common.services.notifications import notify_cohort, notify_user
from cohorts.models import Cohort

from .models import Training, TrainingSession, TrainingAttendance
from .serializers import (
    TrainingSerializer,
    TrainingSessionSerializer,
    TrainingAttendanceSerializer,
)

class TrainingViewSet(viewsets.ModelViewSet):
    queryset = Training.objects.all().order_by("-created_at")
    serializer_class = TrainingSerializer
    permission_classes = [IsAuthenticated, IsMentorOrAdminOrReadOnly]

    def get_queryset(self):
        if has_global_cohort_access(self.request.user):
            return self.queryset
        return self.queryset.filter(is_active=True)


class TrainingSessionViewSet(viewsets.ModelViewSet):
    queryset = TrainingSession.objects.select_related("training", "cohort", "conducted_by").all().order_by("-session_date", "-start_time")
    serializer_class = TrainingSessionSerializer
    permission_classes = [IsAuthenticated, IsMentorOrAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            return base
        if role == "MENTOR":
            return base.filter(cohort__mentors=user).distinct()
        if role in ["VOLUNTEER", "TRUSTEE"]:
            return base.filter(cohort__volunteers=user).distinct()
        if role == "STUDENT":
            cohort_ids = user.student_profile.applications.filter(
                assigned_cohort__isnull=False,
            ).exclude(status__in=["DROPPED", "CANCELLED", "REJECTED", "SUSPENDED"]).values_list("assigned_cohort_id", flat=True)
            if not cohort_ids:
                return base.none()
            return base.filter(Q(cohort_id__in=cohort_ids) | Q(cohort__isnull=True)).distinct()
        return base.none()

    def perform_create(self, serializer):
        cohort = serializer.validated_data.get("cohort")
        if cohort is None and not has_global_cohort_access(self.request.user):
            raise ValidationError({"cohort": "Only admins can create a session shared across cohorts."})
        if cohort is not None and not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can schedule training only for an assigned cohort.")
        session = serializer.save(conducted_by=self.request.user)
        cohorts = [session.cohort] if session.cohort else list(
            Cohort.objects.filter(status__in=[Cohort.Status.OPEN, Cohort.Status.ACTIVE])
        )
        for target_cohort in cohorts:
            notify_cohort(
                target_cohort,
                title=f"{session.training.get_training_type_display()} scheduled",
                message=(
                    f"{session.title} is scheduled for {session.session_date:%d %b %Y} "
                    f"at {session.start_time:%I:%M %p}."
                ),
                notification_type=Notification.Type.INFO,
                action_url="training",
                dedupe_key=f"training-session:{session.id}:scheduled",
            )

    def perform_update(self, serializer):
        cohort = serializer.validated_data.get("cohort", serializer.instance.cohort)
        if cohort is None and not has_global_cohort_access(self.request.user):
            raise PermissionDenied("Only admins can manage a shared training session.")
        if cohort is not None and not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can update training only for an assigned cohort.")
        session = serializer.instance
        previous = (session.title, session.session_date, session.start_time, session.end_time, session.meeting_link)
        session = serializer.save()
        current = (session.title, session.session_date, session.start_time, session.end_time, session.meeting_link)
        if previous != current:
            cohorts = [session.cohort] if session.cohort else list(
                Cohort.objects.filter(status__in=[Cohort.Status.OPEN, Cohort.Status.ACTIVE])
            )
            for target_cohort in cohorts:
                notify_cohort(
                    target_cohort,
                    title=f"{session.training.get_training_type_display()} updated",
                    message=(
                        f"{session.title} is now scheduled for {session.session_date:%d %b %Y} "
                        f"at {session.start_time:%I:%M %p}."
                    ),
                    notification_type=Notification.Type.INFO,
                    action_url="training",
                    dedupe_key=f"training-session:{session.id}:scheduled",
                )

    def partial_update(self, request, *args, **kwargs):
        from rest_framework.response import Response
        try:
            return super().partial_update(request, *args, **kwargs)
        except Http404:
            # Frontend bug workaround: 'End Class' on Attendance might hit /api/training-sessions/
            pk = kwargs.get('pk')
            from attendance.models import Attendance
            from attendance.views import AttendanceViewSet
            if Attendance.objects.filter(pk=pk).exists():
                view = AttendanceViewSet.as_view({'patch': 'partial_update'})
                return view(request._request, *args, **kwargs)
            raise

class TrainingAttendanceViewSet(viewsets.ModelViewSet):
    queryset = TrainingAttendance.objects.select_related(
        "session", "session__cohort", "student", "student__user"
    ).all().order_by("-created_at")
    serializer_class = TrainingAttendanceSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsMentorOrAdminOrReadOnly()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            return base
        if role == "MENTOR":
            return base.filter(student__applications__assigned_cohort__mentors=user).distinct()
        if role in ["VOLUNTEER", "TRUSTEE"]:
            return base.filter(student__applications__assigned_cohort__volunteers=user).distinct()
        if role == "STUDENT":
            return base.filter(student__user=user)
        return base.none()

    def _student_cohort(self, student):
        application = student.applications.filter(assigned_cohort__isnull=False).exclude(
            status__in=["DROPPED", "CANCELLED", "REJECTED"]
        ).select_related("assigned_cohort").order_by("-applied_at").first()
        return application.assigned_cohort if application else None

    def perform_create(self, serializer):
        student = serializer.validated_data["student"]
        session = serializer.validated_data["session"]
        cohort = self._student_cohort(student)
        if cohort is None:
            raise ValidationError({"student": "The student has no assigned cohort."})
        if session.cohort_id not in {None, cohort.id}:
            raise ValidationError({"session": "This training session belongs to another cohort."})
        if not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can record training only for students in an assigned cohort.")
        if TrainingAttendance.objects.filter(session=session, student=student).exists():
            raise ValidationError({"session": "Attendance for this student and session already exists."})
        attendance = serializer.save()
        notify_user(
            student.user,
            title="Training attendance updated",
            message=(
                f"Your attendance for {session.title} is "
                f"{attendance.get_status_display()}."
            ),
            notification_type=(
                Notification.Type.SUCCESS
                if attendance.status == TrainingAttendance.Status.PRESENT
                else Notification.Type.WARNING
            ),
            action_url="training",
            dedupe_key=f"training-attendance:{attendance.id}:{attendance.status}",
        )

    def perform_update(self, serializer):
        student = serializer.validated_data.get("student", serializer.instance.student)
        cohort = self._student_cohort(student)
        if cohort is None or not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can update training only for students in an assigned cohort.")
        attendance = serializer.save()
        notify_user(
            student.user,
            title="Training attendance updated",
            message=(
                f"Your attendance for {attendance.session.title} is "
                f"{attendance.get_status_display()}."
            ),
            notification_type=(
                Notification.Type.SUCCESS
                if attendance.status == TrainingAttendance.Status.PRESENT
                else Notification.Type.WARNING
            ),
            action_url="training",
            dedupe_key=f"training-attendance:{attendance.id}:{attendance.status}",
        )
