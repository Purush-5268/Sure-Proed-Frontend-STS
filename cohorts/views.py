from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from accounts.models import User
import django_filters
from common.permissions import IsAdminOrReadOnly
from .models import Cohort
from .serializers import (
    AssignRevokeVolunteerSerializer,
    CohortSerializer,
    GrantRevokeAllCohortsAccessSerializer,
    ReassignVolunteerSerializer,
    AssignRevokeMentorSerializer,
)


class CohortFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    course = django_filters.CharFilter(method="filter_course")
    has_completed_students = django_filters.BooleanFilter(method="filter_has_completed_students")

    class Meta:
        model = Cohort
        fields = ["course", "status", "has_completed_students"]

    def filter_course(self, queryset, name, value):
        if not value:
            return queryset
        try:
            import uuid
            uuid.UUID(str(value))
            return queryset.filter(course_id=value)
        except (ValueError, TypeError):
            return queryset.filter(
                Q(course__code__iexact=value) |
                Q(course__name__icontains=value)
            )

    def filter_has_completed_students(self, queryset, name, value):
        if value is None:
            return queryset
        from applications.models import Application
        completed_q = Q(applications__status=Application.Status.COMPLETED) | Q(applications__completed_course=True)
        if value:
            return queryset.filter(completed_q).distinct()
        return queryset.exclude(completed_q).distinct()


class CohortViewSet(viewsets.ModelViewSet):
    queryset = Cohort.objects.select_related("course", "created_by").prefetch_related("mentors", "current_mentors", "volunteers").all().order_by("-created_at")
    serializer_class = CohortSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = CohortFilter
    search_fields = ["name", "code", "course__name", "course__code"]

    def get_queryset(self):
        user = self.request.user

        # Annotate counts for admin and mentor panels
        from django.db.models import Count, Q

        enrolled_statuses = [
            'COHORT_ASSIGNED', 'IN_PROGRESS', 'ACTIVE', 'TRAINING',
            'INTERNSHIP_ASSIGNED', 'SOFT_SKILLS',
            'PRE_TRAINING', 'COMPLETED'
        ]

        qs = self.queryset.annotate(
            applications_count=Count('applications__student', distinct=True),
            students_count=Count('applications__student', filter=Q(applications__status__in=enrolled_statuses), distinct=True)
        )

        if self.request.query_params.get('public_all') == 'true':
            # Exclude drafts or deleted if such statuses exist, otherwise return all
            return qs.exclude(status='DRAFT') if hasattr(Cohort.Status, 'DRAFT') else qs

        if not user.is_authenticated:
            return qs.filter(
                Q(status=Cohort.Status.OPEN) &
                (Q(application_end_date__isnull=True) | Q(application_end_date__gt=timezone.now()))
            )

        role = getattr(user, 'role', '')

        # 1. Superuser / Admin / Global Access Override
        if user.is_superuser or role == 'ADMIN' or getattr(user, 'has_all_cohorts_access', False):
            return qs

        if role in {'VOLUNTEER', 'TRUSTEE'}:
            return qs.filter(volunteers=user)

        if role == 'MENTOR':
            return qs.filter(mentors=user)

        if role == 'STUDENT':
            from applications.models import Application
            from django.db.models import Q
            from students.models import StudentProfile

            open_q = Q(status=Cohort.Status.OPEN) & (
                Q(application_end_date__isnull=True) | Q(application_end_date__gt=timezone.now())
            )

            q_objects = open_q | Q(
                applications__student__user=user,
                applications__status__in=[
                    Application.Status.APPLIED,
                    Application.Status.EXAM_PENDING,
                    Application.Status.PRESCREENING_PENDING,
                    Application.Status.EXAM_COMPLETED,
                    Application.Status.QUALIFIED,
                    Application.Status.COHORT_ASSIGNED,
                    Application.Status.IN_PROGRESS,
                    Application.Status.TRAINING,
                    Application.Status.INTERNSHIP_ASSIGNED,
                    Application.Status.TRANSFER_COHORT,
                    Application.Status.COMPLETED,
                    Application.Status.SUSPENDED
                ]
            )

            student = StudentProfile.objects.filter(user=user).first()
            if student:
                legacy_codes = []
                if getattr(student, 'course_batch', None):
                    legacy_codes.append(student.course_batch)
                if getattr(student, 'authoritative_course_batch', None):
                    legacy_codes.append(student.authoritative_course_batch)

                if legacy_codes:
                    q_objects |= Q(code__in=legacy_codes)

            return qs.filter(q_objects).distinct()

        # 3. Legacy Staff Fallback
        if user.is_staff:
            return qs

        return qs.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        cohort = serializer.save()

        if old_status != cohort.status:
            from cohorts.services import sync_cohort_application_statuses
            sync_cohort_application_statuses(
                cohort=cohort,
                user=self.request.user if hasattr(self, "request") else None,
                old_status=old_status,
                new_status=cohort.status,
            )

    def destroy(self, request, *args, **kwargs):
        cohort = self.get_object()
        
        # The UI uses the cohort code; retain the older course-code phrase for compatibility.
        course_code = cohort.course.code if cohort.course else ""
        expected_phrase = f"DELETE {cohort.code}".strip()
        legacy_expected_phrase = f"DELETE {cohort.code} {course_code}".strip()
        
        provided_phrase = request.data.get("confirmation", "") or request.query_params.get("confirmation", "")
        if str(provided_phrase).strip().upper() not in {expected_phrase.upper(), legacy_expected_phrase.upper()}:
            return Response(
                {"error": f"Invalid confirmation phrase. Expected: '{expected_phrase}'"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            # Manual examination schedules are cohort-owned setup records and
            # use PROTECT, so remove them before deleting an otherwise empty cohort.
            from exams.models import ManualExamination
            ManualExamination.objects.filter(cohort=cohort).delete()
            return super().destroy(request, *args, **kwargs)
        except Exception as e:
            from django.db.models import ProtectedError
            if isinstance(e, ProtectedError):
                return Response(
                    {"error": "Cannot delete cohort because it has active applications, students, or other protected data."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            raise e

    @extend_schema(
        request=None,
        summary="Manually create GitHub repositories for an eligible cohort",
        description=(
            "Creates repositories for enrolled students with connected GitHub accounts. "
            "Students receive write access; only trainers assigned to the cohort receive read access. "
            "Existing managed repositories have the same access policy reapplied. "
            "The cohort must be in TRAINING and its 15-day grace period must have elapsed."
        ),
    )
    @action(detail=True, methods=["post"], url_path="create-github-repositories")
    def create_github_repositories(self, request, pk=None):
        from .services import (
            RepositoryProvisioningNotAllowed,
            provision_cohort_student_repositories,
        )

        cohort = self.get_object()
        force = bool(request.data.get("force", False)) if isinstance(request.data, dict) else False
        try:
            result = provision_cohort_student_repositories(cohort, force=force)
        except RepositoryProvisioningNotAllowed as exc:
            return Response(
                {
                    "error": str(exc),
                    "code": "GITHUB_REPOSITORY_GRACE_PERIOD_NOT_COMPLETE",
                    "training_started_at": cohort.training_started_at,
                    "eligible_at": cohort.github_repository_eligible_at,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(result, status=status.HTTP_200_OK)

    @extend_schema(
        request=GrantRevokeAllCohortsAccessSerializer,
        summary="Grant global access across all cohorts",
        description="Grant a volunteer, mentor, or trustee access to view all cohorts across the platform.",
    )
    @action(detail=False, methods=["post"], serializer_class=GrantRevokeAllCohortsAccessSerializer)
    def grant_all_cohorts_access(self, request):
        """Grant a volunteer or mentor access to all cohorts across the platform."""
        if not (request.user.is_superuser or getattr(request.user, "role", "") == User.Role.ADMIN):
            return Response({"error": "Admin permission required to grant global cohort access."}, status=status.HTTP_403_FORBIDDEN)

        user_identifier = request.data.get("user_id") or request.data.get("id") or request.data.get("email")
        if not user_identifier:
            return Response({"error": "user_id is required in request body."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = None
        user_identifier_str = str(user_identifier).strip()

        # 1. Try lookup by Email or mapped_email
        if "@" in user_identifier_str:
            target_user = User.objects.filter(
                Q(email__iexact=user_identifier_str) | Q(mapped_email__iexact=user_identifier_str)
            ).first()
        else:
            # 2. Try lookup by UUID
            import uuid
            try:
                valid_uuid = uuid.UUID(user_identifier_str)
                target_user = User.objects.filter(id=valid_uuid).first()
            except (ValueError, AttributeError, TypeError):
                target_user = None

            # 3. Fallback lookup by student_code, email, or mapped_email
            if not target_user:
                target_user = User.objects.filter(
                    Q(email__iexact=user_identifier_str)
                    | Q(mapped_email__iexact=user_identifier_str)
                    | Q(student_profile__student_code__iexact=user_identifier_str)
                ).first()

        if not target_user:
            return Response({"error": f"User '{user_identifier}' not found."}, status=status.HTTP_404_NOT_FOUND)

        target_user.has_all_cohorts_access = True
        target_user.save(update_fields=["has_all_cohorts_access"])
        return Response({
            "message": f"Global cohort access granted to {target_user.email}",
            "user_id": str(target_user.id),
            "email": target_user.email,
            "has_all_cohorts_access": target_user.has_all_cohorts_access,
        }, status=status.HTTP_200_OK)

    @extend_schema(
        request=GrantRevokeAllCohortsAccessSerializer,
        summary="Revoke global access across all cohorts",
        description="Revoke platform-wide cohort access from a volunteer, mentor, or trustee.",
    )
    @action(detail=False, methods=["post"], serializer_class=GrantRevokeAllCohortsAccessSerializer)
    def revoke_all_cohorts_access(self, request):
        """Revoke global cohort access from a volunteer or mentor."""
        if not (request.user.is_superuser or getattr(request.user, "role", "") == User.Role.ADMIN):
            return Response({"error": "Admin permission required to revoke global cohort access."}, status=status.HTTP_403_FORBIDDEN)

        user_identifier = request.data.get("user_id") or request.data.get("id") or request.data.get("email")
        if not user_identifier:
            return Response({"error": "user_id is required in request body."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = None
        user_identifier_str = str(user_identifier).strip()

        # 1. Try lookup by Email or mapped_email
        if "@" in user_identifier_str:
            target_user = User.objects.filter(
                Q(email__iexact=user_identifier_str) | Q(mapped_email__iexact=user_identifier_str)
            ).first()
        else:
            # 2. Try lookup by UUID
            import uuid
            try:
                valid_uuid = uuid.UUID(user_identifier_str)
                target_user = User.objects.filter(id=valid_uuid).first()
            except (ValueError, AttributeError, TypeError):
                target_user = None

            # 3. Fallback lookup by student_code, email, or mapped_email
            if not target_user:
                target_user = User.objects.filter(
                    Q(email__iexact=user_identifier_str)
                    | Q(mapped_email__iexact=user_identifier_str)
                    | Q(student_profile__student_code__iexact=user_identifier_str)
                ).first()

        if not target_user:
            return Response({"error": f"User '{user_identifier}' not found."}, status=status.HTTP_404_NOT_FOUND)

        target_user.has_all_cohorts_access = False
        target_user.save(update_fields=["has_all_cohorts_access"])
        return Response({
            "message": f"Global cohort access revoked from {target_user.email}",
            "user_id": str(target_user.id),
            "email": target_user.email,
            "has_all_cohorts_access": target_user.has_all_cohorts_access,
        }, status=status.HTTP_200_OK)

    @extend_schema(
        request=AssignRevokeVolunteerSerializer,
        summary="Assign volunteer to cohort",
        description="Assign a volunteer or trustee to this cohort.",
    )
    @action(detail=True, methods=["post"], serializer_class=AssignRevokeVolunteerSerializer)
    def assign_volunteer(self, request, pk=None):
        """Assign a volunteer to this cohort."""
        cohort = self.get_object()
        volunteer_id = request.data.get("volunteer_id")
        if not volunteer_id:
            return Response({"error": "volunteer_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            volunteer = User.objects.get(
                id=volunteer_id,
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE],
                is_active=True,
            )
        except User.DoesNotExist:
            return Response(
                {"error": "Active Volunteer or Trustee account not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        cohort.volunteers.add(volunteer)
        return Response({"message": f"Volunteer {volunteer.email} assigned to Cohort {cohort.code}"}, status=status.HTTP_200_OK)

    @extend_schema(
        request=AssignRevokeVolunteerSerializer,
        summary="Revoke volunteer from cohort",
        description="Revoke a volunteer or trustee from this cohort.",
    )
    @action(detail=True, methods=["post"], serializer_class=AssignRevokeVolunteerSerializer)
    def revoke_volunteer(self, request, pk=None):
        """Revoke a volunteer from this cohort."""
        cohort = self.get_object()
        volunteer_id = request.data.get("volunteer_id")
        if not volunteer_id:
            return Response({"error": "volunteer_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            volunteer = User.objects.get(id=volunteer_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        cohort.volunteers.remove(volunteer)
        return Response({"message": f"Volunteer {volunteer.email} revoked from Cohort {cohort.code}"}, status=status.HTTP_200_OK)

    @extend_schema(
        request=ReassignVolunteerSerializer,
        summary="Reassign volunteer between cohorts",
        description="Revoke volunteer from current cohort and assign to a new target cohort.",
    )
    @action(detail=True, methods=["post"], serializer_class=ReassignVolunteerSerializer)
    def reassign_volunteer(self, request, pk=None):
        """Revoke volunteer from current cohort and assign to a new target cohort."""
        source_cohort = self.get_object()
        volunteer_id = request.data.get("volunteer_id")
        target_cohort_id = request.data.get("target_cohort_id")

        if not volunteer_id or not target_cohort_id:
            return Response({"error": "volunteer_id and target_cohort_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            volunteer = User.objects.get(id=volunteer_id)
        except User.DoesNotExist:
            return Response({"error": "Volunteer user not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            target_cohort = Cohort.objects.get(id=target_cohort_id)
        except Cohort.DoesNotExist:
            return Response({"error": "Target cohort not found"}, status=status.HTTP_404_NOT_FOUND)

        # 1. Revoke access from source cohort
        source_cohort.volunteers.remove(volunteer)

        # 2. Assign access to target cohort
        target_cohort.volunteers.add(volunteer)

        return Response(
            {
                "message": f"Successfully reassigned Volunteer {volunteer.email} from Cohort {source_cohort.code} to Cohort {target_cohort.code}",
                "source_cohort": source_cohort.code,
                "target_cohort": target_cohort.code,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=AssignRevokeMentorSerializer,
        summary="Assign mentor to cohort",
        description="Assign a mentor to this cohort.",
    )
    @action(detail=True, methods=["post"], serializer_class=AssignRevokeMentorSerializer)
    def assign_mentor(self, request, pk=None):
        """Assign a mentor to this cohort."""
        cohort = self.get_object()
        mentor_id = request.data.get("mentor_id")
        if not mentor_id:
            return Response({"error": "mentor_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mentor = User.objects.get(
                id=mentor_id,
                role=User.Role.MENTOR,
                is_active=True,
            )
        except User.DoesNotExist:
            return Response(
                {"error": "Active Mentor account not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        cohort.mentors.add(mentor)
        return Response({"message": f"Mentor {mentor.email} assigned to Cohort {cohort.code}"}, status=status.HTTP_200_OK)

    @extend_schema(
        request=AssignRevokeMentorSerializer,
        summary="Revoke mentor from cohort",
        description="Revoke a mentor from this cohort.",
    )
    @action(detail=True, methods=["post"], serializer_class=AssignRevokeMentorSerializer)
    def revoke_mentor(self, request, pk=None):
        """Revoke a mentor from this cohort."""
        cohort = self.get_object()
        mentor_id = request.data.get("mentor_id")
        if not mentor_id:
            return Response({"error": "mentor_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mentor = User.objects.get(id=mentor_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        cohort.mentors.remove(mentor)
        return Response({"message": f"Mentor {mentor.email} revoked from Cohort {cohort.code}"}, status=status.HTTP_200_OK)

    @extend_schema(
        request=None,
        summary="Set a current mentor for this cohort",
        description="Designates an assigned mentor as a current mentor.",
    )
    @action(detail=True, methods=["post"], url_path="set-current-mentor")
    def set_current_mentor(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser or getattr(request.user, "role", "") == User.Role.ADMIN):
            return Response({"error": "Admin permission required."}, status=status.HTTP_403_FORBIDDEN)

        cohort = self.get_object()
        mentor_id = request.data.get("mentor_id")

        if not mentor_id:
            return Response({"error": "mentor_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mentor = User.objects.get(id=mentor_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if not cohort.mentors.filter(id=mentor.id).exists():
            return Response({"error": "The selected user is not assigned as a mentor to this cohort. Assign them first before setting as current mentor."}, status=status.HTTP_400_BAD_REQUEST)

        cohort.current_mentors.add(mentor)
        cohort.save(update_fields=['updated_at'])

        return Response({"message": f"{mentor.email} is now a current mentor."})

    @extend_schema(
        request=None,
        summary="Revoke a current mentor for this cohort",
        description="Removes the current mentor designation, but does not unassign them from the cohort.",
    )
    @action(detail=True, methods=["post"], url_path="revoke-current-mentor")
    def revoke_current_mentor(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser or getattr(request.user, "role", "") == User.Role.ADMIN):
            return Response({"error": "Admin permission required."}, status=status.HTTP_403_FORBIDDEN)

        cohort = self.get_object()
        mentor_id = request.data.get("mentor_id")

        if not mentor_id:
            return Response({"error": "mentor_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mentor = User.objects.get(id=mentor_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        cohort.current_mentors.remove(mentor)
        cohort.save(update_fields=['updated_at'])

        return Response({"message": f"Current mentor designation revoked for {mentor.email}."})

    @extend_schema(
        request=None,
        summary="Schedule screening exam for all eligible applicants in this cohort",
        description="Creates PreScreening and Google Meet links for APPLIED students."
    )
    @action(detail=True, methods=["post"], url_path="schedule-screening")
    def schedule_screening(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser or getattr(request.user, "role", "") == User.Role.ADMIN):
            return Response({"error": "Admin permission required."}, status=status.HTTP_403_FORBIDDEN)

        cohort = self.get_object()
        question_bank_id = request.data.get("question_bank_id")
        scheduled_at_str = request.data.get("scheduled_at")
        end_time_str = request.data.get("end_time")

        if not question_bank_id or not scheduled_at_str or not end_time_str:
            return Response({"error": "question_bank_id, scheduled_at, and end_time are required."}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils.dateparse import parse_datetime
        scheduled_at = parse_datetime(scheduled_at_str)
        end_time = parse_datetime(end_time_str)

        if not scheduled_at or not end_time:
            return Response({"error": "Invalid date formats."}, status=status.HTTP_400_BAD_REQUEST)

        from question_bank.models import QuestionBank
        try:
            qb = QuestionBank.objects.get(id=question_bank_id)
        except QuestionBank.DoesNotExist:
            return Response({"error": "Question Bank not found."}, status=status.HTTP_404_NOT_FOUND)

        if qb.status != QuestionBank.Status.APPROVED or qb.bank_type != QuestionBank.BankType.PRESCREENING:
            return Response({"error": "Invalid Question Bank. Must be APPROVED and type PRESCREENING."}, status=status.HTTP_400_BAD_REQUEST)

        bank_total_questions = int(qb.total_questions_per_set or 0)
        requested_total_questions = request.data.get("total_questions")
        if requested_total_questions not in (None, ""):
            try:
                requested_total_questions = int(requested_total_questions)
            except (TypeError, ValueError):
                return Response({"error": "total_questions must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
            if requested_total_questions < 1 or (bank_total_questions and requested_total_questions > bank_total_questions):
                return Response({"error": f"total_questions cannot exceed the question bank total of {bank_total_questions}."}, status=status.HTTP_400_BAD_REQUEST)

        pass_percentage_val = request.data.get("pass_percentage", 40)
        from decimal import Decimal, InvalidOperation
        try:
            pass_percentage = Decimal(str(pass_percentage_val))
            if pass_percentage < 0 or pass_percentage > 100:
                raise ValueError
        except (ValueError, TypeError, InvalidOperation):
            return Response({"error": "pass_percentage must be a number between 0 and 100."}, status=status.HTTP_400_BAD_REQUEST)

        from applications.models import Application, PreScreening
        from exams.models import ManualExamination
        if ManualExamination.objects.filter(
            cohort=cohort,
            status__in=[ManualExamination.Status.DRAFT, ManualExamination.Status.IN_PROGRESS],
        ).exists():
            return Response(
                {"error": "This cohort already has a manual examination in progress. Complete or remove it before scheduling an automated screening."},
                status=status.HTTP_409_CONFLICT,
            )
        from django.db import transaction

        applications = Application.objects.filter(
            assigned_cohort=cohort,
            status__in=[
                Application.Status.APPLIED,
                Application.Status.EXAM_PENDING,
                Application.Status.PRESCREENING_PENDING,
                Application.Status.REJECTED,
            ]
        )

        if not applications.exists():
            return Response(
                {"error": "At least one eligible student is required before scheduling an automated screening."},
                status=status.HTTP_409_CONFLICT,
            )

        provided_meet = (request.data.get("meeting_link") or "").strip()
        calendar_event_id = None

        if not applications.exists():
            # Check if applicants in this cohort already completed/evaluated the exam
            evaluated_count = Application.objects.filter(
                assigned_cohort=cohort,
                status__in=[Application.Status.EXAM_COMPLETED, Application.Status.QUALIFIED]
            ).count()
            if evaluated_count > 0:
                # Update cohort-level PreScreening configuration template for future candidates
                existing_ps = PreScreening.objects.filter(application__assigned_cohort=cohort).order_by("-created_at").first()
                if existing_ps:
                    existing_ps.question_bank = qb
                    existing_ps.scheduled_at = scheduled_at
                    existing_ps.end_time = end_time
                    existing_ps.is_released = False
                    existing_ps.admin_started_at = None
                    existing_ps.status = PreScreening.Status.SCHEDULED
                    if provided_meet:
                        existing_ps.meeting_link = provided_meet
                    existing_ps.save()
                return Response(
                    {
                        "message": f"Screening schedule updated for cohort {cohort.code}. Existing evaluated candidates ({evaluated_count}) retain their scores.",
                        "meeting_link": provided_meet or (existing_ps.meeting_link if existing_ps else cohort.meeting_link),
                        "candidates_scheduled": 0,
                        "previously_evaluated": evaluated_count,
                    },
                    status=status.HTTP_200_OK,
                )
            return Response({"error": "No eligible applicants found to schedule in this cohort."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            first_app = applications.first()

            duration_minutes = request.data.get("duration_minutes") or 45
            try:
                duration_minutes = int(duration_minutes)
            except (ValueError, TypeError):
                duration_minutes = 45

            # If no explicit meeting link provided, auto-generate a new one
            if not provided_meet:
                try:
                    from attendance.services.google_meet_service import generate_google_meet
                    emails = []
                    for app in applications:
                        if app.student and app.student.user and app.student.user.email:
                            emails.append(app.student.user.email)
                    
                    meet_link, event_id = generate_google_meet(
                        session_title=f"Screening Exam: {cohort.code}",
                        start_datetime=scheduled_at,
                        end_datetime=end_time,
                        attendee_emails=emails
                    )
                    if meet_link:
                        provided_meet = meet_link
                        calendar_event_id = event_id
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to auto-generate Google Meet for PreScreening: {e}")

            # If provided_meet is still empty, check if cohort has a default meeting link
            if not provided_meet and getattr(cohort, "meeting_link", None):
                provided_meet = cohort.meeting_link

            # If still empty, automatic meeting link generation failed; prompt user to provide one
            if not provided_meet:
                return Response(
                    {
                        "error": "Google Meet link could not be generated automatically (Google Calendar API unavailable). Please provide a meeting link manually.",
                        "meeting_link_required": True,
                        "code": "MEETING_LINK_REQUIRED",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Update existing PreScreening or create new
            first_screening = PreScreening.objects.filter(application=first_app).first()
            if not first_screening:
                first_screening = PreScreening(application=first_app)

            first_screening.question_bank = qb
            first_screening.scheduled_at = scheduled_at
            first_screening.end_time = end_time
            first_screening.is_released = False
            first_screening.admin_started_at = None
            first_screening.status = PreScreening.Status.SCHEDULED
            if provided_meet:
                first_screening.meeting_link = provided_meet
            if calendar_event_id:
                first_screening.calendar_event_id = calendar_event_id
            first_screening.save()

            meeting_link = first_screening.meeting_link or provided_meet
            calendar_event_id = first_screening.calendar_event_id

            # Save or update the rest of the applicants
            for app in applications.exclude(id=first_app.id):
                ps = PreScreening.objects.filter(application=app).first()
                if not ps:
                    ps = PreScreening(application=app)
                ps.question_bank = qb
                ps.scheduled_at = scheduled_at
                ps.end_time = end_time
                ps.is_released = False
                ps.admin_started_at = None
                ps.status = PreScreening.Status.SCHEDULED
                ps.meeting_link = meeting_link
                ps.calendar_event_id = calendar_event_id
                ps.save()

            from exams.models import Exam
            bank_total_q = getattr(qb, "total_questions_per_set", 10) or 10
            req_total_q = request.data.get("total_questions")
            total_q = bank_total_q
            if req_total_q is not None and str(req_total_q).strip() != "":
                try:
                    parsed_total_q = int(req_total_q)
                    if parsed_total_q > 0:
                        total_q = min(parsed_total_q, bank_total_q)
                except (ValueError, TypeError):
                    pass

            for app in applications:
                if app.status in [Application.Status.REJECTED, Application.Status.APPLIED, Application.Status.PRESCREENING_PENDING]:
                    app.status = Application.Status.EXAM_PENDING
                    app.save(update_fields=["status", "updated_at"])

                exam, _ = Exam.objects.get_or_create(
                    application=app,
                    defaults={
                        "total_questions": total_q,
                        "total_marks": Decimal(str(total_q)),
                        "duration_minutes": duration_minutes,
                        "pass_percentage": pass_percentage,
                        "level": Exam.Level.MIXED,
                        "status": Exam.Status.PENDING,
                    }
                )
                exam.duration_minutes = duration_minutes
                exam.pass_percentage = pass_percentage
                exam.total_questions = total_q
                exam.total_marks = Decimal(str(total_q))
                exam.status = Exam.Status.PENDING
                exam.marks_obtained = None
                exam.percentage = None
                exam.qualified = None
                exam.started_at = None
                exam.submitted_at = None
                exam.save()

            # Note: Screening exam meet link is intentionally NOT copied to cohort.meeting_link
            # Regular cohort meeting links are reserved for actual classes/sessions.

            from common.services.notifications import notify_user
            from common.models import Notification
            for app in applications:
                if app.student and app.student.user:
                    notify_user(
                        app.student.user,
                        title=f"Screening Exam Scheduled: {qb.title}",
                        message=f"Your screening exam for {cohort.name} is scheduled on {scheduled_at.strftime('%b %d, %Y %I:%M %p')}. "
                                f"Please join the Google Meet exactly 10 minutes before the exam starts. "
                                f"The Meet link will be visible 10 minutes before the start time.",
                        notification_type=Notification.Type.ACTION_REQUIRED,
                        action_url="/student/exams",
                        dedupe_key=f"screening_sched_{cohort.id}_{app.id}",
                    )

        from applications.serializers import PreScreeningSerializer
        serialized_ps = PreScreeningSerializer(first_screening).data if first_screening else None

        return Response({
            "message": f"Successfully scheduled {applications.count()} applicants.",
            "meeting_link": meeting_link,
            "screening": serialized_ps,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="start-screening")
    def start_screening(self, request, pk=None):
        user = request.user
        cohort = self.get_object()
        is_admin = user.is_staff or user.is_superuser or getattr(user, "role", "") == User.Role.ADMIN
        is_mentor = getattr(user, "role", "") == "MENTOR" or cohort.mentors.filter(id=user.id).exists()
        if not (is_admin or is_mentor):
            return Response({"error": "Admin or Mentor permission required."}, status=status.HTTP_403_FORBIDDEN)

        from applications.models import PreScreening
        from django.utils import timezone

        now = timezone.now()
        count = PreScreening.objects.filter(application__assigned_cohort=cohort).update(
            admin_started_at=now,
            is_released=True
        )
        return Response({
            "message": f"Screening exam started for {count} candidates.",
            "admin_started_at": now.isoformat()
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="end-screening")
    def end_screening(self, request, pk=None):
        user = request.user
        cohort = self.get_object()
        is_admin = user.is_staff or user.is_superuser or getattr(user, "role", "") == User.Role.ADMIN
        is_mentor = getattr(user, "role", "") == "MENTOR" or cohort.mentors.filter(id=user.id).exists()
        if not (is_admin or is_mentor):
            return Response({"error": "Admin or Mentor permission required."}, status=status.HTTP_403_FORBIDDEN)

        from applications.models import PreScreening
        from applications.services.workflow_service import disqualify_for_missed_screening
        from django.utils import timezone

        now = timezone.now()
        schedules = list(PreScreening.objects.filter(application__assigned_cohort=cohort).select_related(
            "application", "application__exam", "application__student__user", "application__course"
        ))
        
        PreScreening.objects.filter(application__assigned_cohort=cohort).update(
            end_time=now,
            is_released=False
        )

        unattempted_count = 0
        attempted_count = 0

        for ps in schedules:
            app = getattr(ps, "application", None)
            if not app:
                continue

            exam = getattr(app, "exam", None)
            has_attempted = exam and exam.submitted_at is not None and exam.status in ["SUBMITTED", "EVALUATED"]

            if not has_attempted:
                disqualify_for_missed_screening(ps)
                unattempted_count += 1
            else:
                attempted_count += 1

        return Response({
            "message": f"Screening exam ended. {unattempted_count} unattempted candidates marked as Failed & Rejected. {attempted_count} attempted candidates processed.",
            "end_time": now.isoformat(),
            "unattempted_count": unattempted_count,
            "attempted_count": attempted_count
        }, status=status.HTTP_200_OK)

