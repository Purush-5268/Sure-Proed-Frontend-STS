from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from common.permissions import IsAdminOrReadOnly
from students.models import StudentProfile
from django.db.models import Q
from django.utils import timezone

from .models import Company, JobPosting, JobReference
from .serializers import (
    CompanySerializer,
    JobPostingSerializer,
    JobReferenceSerializer,
    ShortlistStudentSerializer,
)
from common.access import can_manage_cohort, has_global_cohort_access
from common.access import is_admin
from common.models import Notification
from common.services.notifications import notify_cohort


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.select_related("user").prefetch_related("shortlisted_students").all().order_by("-created_at")
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Company.objects.select_related("user").prefetch_related("shortlisted_students").filter(is_verified=True).order_by("-created_at")
        if is_admin(user):
            return Company.objects.select_related("user").prefetch_related("shortlisted_students").all().order_by("-created_at")
        return Company.objects.select_related("user").prefetch_related("shortlisted_students").filter(
            Q(is_verified=True) | Q(user=user)
        ).order_by("-created_at").distinct()

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, "role", "") not in ["MENTOR", "COMPANY", "ADMIN"] and not is_admin(user):
            raise PermissionDenied("Only mentors, companies, and admins can create company profiles.")
        
        if is_admin(user):
            serializer.save(user=None)
        else:
            if Company.objects.filter(user=user).exists():
                raise PermissionDenied("This account already has a company profile.")
            serializer.save(user=user)

    def perform_update(self, serializer):
        company = serializer.instance
        user = self.request.user
        if not (is_admin(user) or company.user_id == user.id):
            raise PermissionDenied("You can update only your own company profile.")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if not (is_admin(user) or instance.user_id == user.id):
            raise PermissionDenied("You can delete only your own company profile.")
        instance.delete()

    @extend_schema(
        request=ShortlistStudentSerializer,
        summary="Shortlist student candidate for hiring",
        description="Action for a corporate partner or admin to shortlist a student candidate.",
    )
    @action(detail=True, methods=["post"], serializer_class=ShortlistStudentSerializer)
    def shortlist_student(self, request, pk=None):
        """Action for a company/admin to shortlist a student candidate."""
        company = self.get_object()
        if not (
            is_admin(request.user) or company.user_id == request.user.id
        ):
            raise PermissionDenied("You can shortlist students only for your own company.")
        student_id = request.data.get("student_id")
        if not student_id:
            return Response({"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = StudentProfile.objects.get(id=student_id)
            company.shortlisted_students.add(student)
            return Response({"message": f"Student {student.student_code} successfully shortlisted by {company.name}"}, status=status.HTTP_200_OK)
        except StudentProfile.DoesNotExist:
            return Response({"error": "Student profile not found"}, status=status.HTTP_404_NOT_FOUND)


class JobPostingViewSet(viewsets.ModelViewSet):
    queryset = JobPosting.objects.select_related("company").prefetch_related("applicants").all().order_by("-created_at")
    serializer_class = JobPostingSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def apply(self, request, pk=None):
        """Action for a graduating student to apply for a job posting."""
        job = self.get_object()
        user = request.user
        try:
            student_profile = user.student_profile
            job.applicants.add(student_profile)
            return Response({"message": f"Successfully applied for {job.title} at {job.company.name}"}, status=status.HTTP_200_OK)
        except AttributeError:
            return Response({"error": "Only student profiles can apply for jobs."}, status=status.HTTP_400_BAD_REQUEST)


class JobReferenceViewSet(viewsets.ModelViewSet):
    queryset = JobReference.objects.select_related("cohort", "company", "created_by").all()
    serializer_class = JobReferenceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            return base
        if role == "MENTOR":
            return base.filter(cohort__mentors=user).distinct()
        if role == "COMPANY":
            return base.filter(company__user=user)
        if role == "STUDENT":
            return base.filter(
                cohort__applications__student__user=user,
                is_active=True,
            ).filter(Q(deadline__isnull=True) | Q(deadline__gte=timezone.localdate())).distinct()
        return base.none()

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, "role", "") not in ["MENTOR", "ADMIN"] and not user.is_staff:
            raise PermissionDenied("Only mentors and admins can publish job references.")
        cohort = serializer.validated_data["cohort"]
        company = serializer.validated_data["company"]
        if not can_manage_cohort(user, cohort):
            raise PermissionDenied("You can publish jobs only to your assigned cohorts.")
        if not (user.is_staff or getattr(user, "role", "") == "ADMIN" or company.user_id == user.id):
            raise PermissionDenied("Use the company profile linked to your mentor account.")
        if cohort.status in ["COMPLETED", "CANCELLED"]:
            raise PermissionDenied("Completed or cancelled cohorts are read-only.")
        should_notify = serializer.validated_data.get("notify_students", True)
        job = serializer.save(created_by=user)
        if should_notify:
            notify_cohort(
                cohort,
                title="New job reference",
                message=f"{company.name} is hiring for {job.title}. Apply before {job.deadline or 'the closing date'}.",
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url=job.apply_url,
                dedupe_key=f"job-reference:{job.id}:published",
            )

    def perform_update(self, serializer):
        job = serializer.instance
        cohort = serializer.validated_data.get("cohort", job.cohort)
        company = serializer.validated_data.get("company", job.company)
        if not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can update only job references in your assigned cohorts.")
        if not (
            self.request.user.is_staff or getattr(self.request.user, "role", "") == "ADMIN" or
            company.user_id == self.request.user.id
        ):
            raise PermissionDenied("Use the company profile linked to your mentor account.")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_cohort(self.request.user, instance.cohort):
            raise PermissionDenied("You can delete only job references in your assigned cohorts.")
        instance.delete()
