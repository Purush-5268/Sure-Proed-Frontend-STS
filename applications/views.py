from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from .models import Application, CommunityActivity, PreScreening, PreScreeningInterview, ApplicationStatusAudit
from .serializers import (
    ApplicationSerializer,
    CommunityActivitySerializer,
    PreScreeningSerializer,
    PreScreeningInterviewSerializer,
    ApplicationStatusAuditSerializer,
)
from .services.workflow_service import calculate_and_process_course_completion
from .services.journey_service import build_student_journey
from .services.screening_schedule_service import (
    create_course_default_screening_schedule,
    publish_screening_schedule,
)
from cohorts.models import Cohort
from courses.models import Course
from common.tasks import send_async_cohort_assignment
from common.models import Notification, UserRequest
from common.services.notifications import display_name, notify_user


from common.permissions import IsOwnerOrAdmin, IsAdmin, IsVolunteerOrAdmin, IsVolunteerOrMentorOrAdmin
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from common.access import can_manage_cohort, has_global_cohort_access
from .policy import blocking_application_for, course_selection_payload, enrolled_application_for
import django_filters
from django_filters.rest_framework import DjangoFilterBackend


class ApplicationFilter(django_filters.FilterSet):
    course = django_filters.CharFilter(method="filter_course")
    assigned_cohort = django_filters.CharFilter(method="filter_assigned_cohort")
    cohort = django_filters.CharFilter(method="filter_assigned_cohort")
    student = django_filters.CharFilter(method="filter_student")
    assigned_cohort__isnull = django_filters.BooleanFilter(field_name="assigned_cohort", lookup_expr="isnull")
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    qualified = django_filters.BooleanFilter(method="filter_qualified")

    class Meta:
        model = Application
        fields = ["course", "assigned_cohort", "cohort", "student", "assigned_cohort__isnull", "status", "qualified"]

    def filter_course(self, queryset, name, value):
        if not value:
            return queryset
        if self._is_uuid(value):
            return queryset.filter(course_id=value)
        return queryset.filter(course__code__iexact=value)

    def filter_assigned_cohort(self, queryset, name, value):
        if not value:
            return queryset
        if self._is_uuid(value):
            return queryset.filter(assigned_cohort_id=value)
        return queryset.filter(
            Q(assigned_cohort__code__iexact=value) |
            Q(assigned_cohort__name__icontains=value)
        )

    def filter_student(self, queryset, name, value):
        if not value:
            return queryset
        if self._is_uuid(value):
            return queryset.filter(student_id=value)
        return queryset.filter(
            Q(student__student_code__iexact=value) |
            Q(student__user__email__iexact=value)
        )

    def filter_qualified(self, queryset, name, value):
        if value is None:
            return queryset
        return queryset.filter(qualified=value)

    def _is_uuid(self, val):
        try:
            import uuid
            uuid.UUID(str(val))
            return True
        except ValueError:
            return False


class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = ApplicationFilter
    search_fields = ['application_number', 'student__user__email', 'student__user__first_name']

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Application.objects.none()
        base = Application.objects.select_related(
            "student",
            "student__user",
            "course",
            "assigned_cohort",
            "pre_screening",
            "pre_screening_interview",
            "pre_screening_interview__interviewer",
            "exam",
        ).order_by("-applied_at")
        if has_global_cohort_access(user):
            qs = base
        else:
            role = getattr(user, "role", "")
            if role == "MENTOR":
                qs = base.filter(assigned_cohort__mentors=user).distinct()
            elif role in {"VOLUNTEER", "TRUSTEE"}:
                qs = base.filter(assigned_cohort__volunteers=user).distinct()
            else:
                qs = base.filter(student__user=user)

        params = self.request.query_params
        course_param = params.get("course") or params.get("course_id")
        if course_param:
            if self._is_valid_uuid(course_param):
                qs = qs.filter(course_id=course_param)
            else:
                qs = qs.filter(course__code__iexact=course_param)

        cohort_param = params.get("assigned_cohort") or params.get("cohort") or params.get("assigned_cohort_id")
        if cohort_param:
            if self._is_valid_uuid(cohort_param):
                qs = qs.filter(assigned_cohort_id=cohort_param)
            else:
                qs = qs.filter(assigned_cohort__code__iexact=cohort_param)

        cohort_isnull = params.get("assigned_cohort__isnull")
        if cohort_isnull is not None:
            if str(cohort_isnull).lower() in ["true", "1", "t", "yes"]:
                qs = qs.filter(assigned_cohort__isnull=True)
            elif str(cohort_isnull).lower() in ["false", "0", "f", "no"]:
                qs = qs.filter(assigned_cohort__isnull=False)

        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status__iexact=status_param.strip())

        qualified_param = params.get("qualified")
        if qualified_param is not None:
            if str(qualified_param).lower() in ["true", "1", "t", "yes"]:
                qs = qs.filter(qualified=True)
            elif str(qualified_param).lower() in ["false", "0", "f", "no"]:
                qs = qs.filter(qualified=False)

        return qs

    def get_permissions(self):
        from rest_framework.permissions import AllowAny
        if self.action == 'verify_offer_letter':
            return [AllowAny()]
        if self.action in [
            'assign_cohort', 'transfer_cohort', 'transfer_course_cohort',
            'repair_state', 'review_role_verification',
            'suspend_cohort', 'unsuspend_cohort',
            'generate_offer_letter', 'generate_offer_letters_for_cohort',
            'revoke_offer_letter', 'restore_offer_letter', 'reset_offer_letter',
            'delete_application',
        ]:
            return [IsAuthenticated(), IsAdmin()]
        if self.action in ["list", "retrieve", "download_offer_letter"]:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsOwnerOrAdmin()]

    @action(detail=True, methods=["post"], url_path="delete-application")
    @transaction.atomic
    def delete_application(self, request, pk=None):
        """Delete one application from the admin cohort-student management view."""
        application = self.get_object()
        application_number = application.application_number
        try:
            application.delete()
        except ProtectedError as exc:
            protected = ", ".join(str(obj) for obj in list(exc.protected_objects)[:3])
            return Response(
                {"error": f"This application cannot be deleted because it is referenced by protected records{': ' + protected if protected else '.'}"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {"message": f"Application {application_number} was deleted successfully."},
            status=status.HTTP_200_OK,
        )

    def create(self, request, *args, **kwargs):
        user = request.user
        from accounts.models import User
        from students.models import StudentProfile
        from courses.models import Course
        from cohorts.models import Cohort

        # 1. Safe StudentProfile resolution for authenticated student
        student_profile = None
        if user and user.is_authenticated and getattr(user, "role", "") == "STUDENT":
            student_profile = StudentProfile.objects.filter(user=user).first()
            if not student_profile:
                user_hex = str(user.id).replace("-", "")[:6].upper()
                student_profile, _ = StudentProfile.objects.get_or_create(
                    user=user,
                    defaults={"student_code": f"STU-{user_hex}"}
                )

        # 2. Normalize payload data
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        is_staff_or_admin = bool(user and (user.is_staff or getattr(user, "role", "") == "ADMIN"))

        def _get_val(param):
            if isinstance(param, dict):
                return param.get("id") or param.get("pk") or param.get("code") or param.get("value")
            return param

        # Smart cohort resolution (accepts UUID, dict, or cohort code)
        cohort_raw = data.get("assigned_cohort") or data.get("cohort") or data.get("cohort_id") or data.get("cohort_code")
        cohort_param = _get_val(cohort_raw)
        resolved_cohort = None
        if cohort_param:
            if self._is_valid_uuid(cohort_param):
                resolved_cohort = Cohort.objects.filter(id=cohort_param).first()
            if not resolved_cohort:
                resolved_cohort = Cohort.objects.filter(code__iexact=str(cohort_param)).first()
            if not resolved_cohort:
                resolved_cohort = Cohort.objects.filter(name__iexact=str(cohort_param)).first()
            if resolved_cohort and is_staff_or_admin:
                data["assigned_cohort"] = str(resolved_cohort.id)

        # For student self-applications, sanitize inputs to ensure standard APPLIED start
        if not is_staff_or_admin:
            data.pop("status", None)
            data.pop("qualified", None)
            data.pop("qualification_score", None)
            data.pop("role_verification_status", None)
            is_admin_assignment = False
            
            course_id = _get_val(data.get("course") or data.get("course_id"))
            student_chosen_cohort_id = _get_val(data.get("assigned_cohort") or data.get("cohort") or data.get("cohort_id") or data.get("cohort_code"))
            valid_cohort = None
            if course_id and student_chosen_cohort_id:
                if self._is_valid_uuid(student_chosen_cohort_id):
                    valid_cohort = Cohort.objects.filter(id=student_chosen_cohort_id, course_id=course_id, status=Cohort.Status.OPEN).first()
                if not valid_cohort:
                    valid_cohort = Cohort.objects.filter(code__iexact=str(student_chosen_cohort_id), course_id=course_id, status=Cohort.Status.OPEN).first()
                    
            if valid_cohort:
                data["assigned_cohort"] = str(valid_cohort.id)
            else:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"assigned_cohort": "You must select a valid OPEN cohort for this course."})
        else:
            if resolved_cohort:
                status_map = {
                    Cohort.Status.DRAFT: Application.Status.COHORT_ASSIGNED,
                    Cohort.Status.OPEN: Application.Status.COHORT_ASSIGNED,
                    Cohort.Status.ACTIVE: Application.Status.IN_PROGRESS,
                    Cohort.Status.TRAINING: Application.Status.TRAINING,
                    Cohort.Status.INTERNSHIP: Application.Status.INTERNSHIP_ASSIGNED,
                    Cohort.Status.SOFT_SKILLS: Application.Status.IN_PROGRESS,
                    Cohort.Status.COMPLETED: Application.Status.COMPLETED,
                    Cohort.Status.CANCELLED: Application.Status.CANCELLED,
                }
                data["status"] = status_map.get(resolved_cohort.status, Application.Status.COHORT_ASSIGNED)
                data["qualified"] = True
                data["role_verification_status"] = Application.RoleVerificationStatus.VERIFIED
                is_admin_assignment = True
            elif data.get("qualified"):
                data["status"] = data.get("status") or Application.Status.QUALIFIED
                data["role_verification_status"] = Application.RoleVerificationStatus.VERIFIED
                is_admin_assignment = False
            else:
                is_admin_assignment = False

        # Smart course resolution (accepts UUID, dict, course code, or course name, or derived from cohort)
        course_raw = (
            data.get("course")
            or data.get("course_id")
            or data.get("course_code")
            or data.get("course_name")
            or (str(resolved_cohort.course_id) if resolved_cohort else None)
        )
        course_param = _get_val(course_raw)
        resolved_course_id = None
        course_obj = None
        if course_param:
            if self._is_valid_uuid(course_param):
                course_obj = Course.objects.filter(id=course_param).first()
            if not course_obj:
                course_obj = Course.objects.filter(code__iexact=str(course_param)).first()
            if not course_obj:
                course_obj = Course.objects.filter(name__iexact=str(course_param)).first()
            if not course_obj:
                course_obj = Course.objects.filter(name__icontains=str(course_param)).first()

            if course_obj:
                resolved_course_id = str(course_obj.id)
                data["course"] = resolved_course_id

        # Smart student resolution (accepts StudentProfile ID, dict, User ID, email, or student code)
        student_raw = (
            data.get("student")
            or data.get("student_id")
            or data.get("user_id")
            or data.get("student_code")
            or data.get("email")
        )
        student_param = _get_val(student_raw)
        resolved_student = None

        if student_profile and not is_staff_or_admin:
            resolved_student = student_profile
        elif is_staff_or_admin and student_param:
            if self._is_valid_uuid(student_param):
                resolved_student = StudentProfile.objects.filter(id=student_param).first()
                if not resolved_student:
                    resolved_student = StudentProfile.objects.filter(user_id=student_param).first()
                    if not resolved_student:
                        target_user = User.objects.filter(id=student_param, role=User.Role.STUDENT).first()
                        if target_user:
                            user_hex = str(target_user.id).replace("-", "")[:6].upper()
                            resolved_student, _ = StudentProfile.objects.get_or_create(
                                user=target_user,
                                defaults={"student_code": f"STU-{user_hex}"}
                            )
            if not resolved_student:
                resolved_student = StudentProfile.objects.filter(student_code__iexact=str(student_param)).first()
            if not resolved_student:
                resolved_student = StudentProfile.objects.filter(user__email__iexact=str(student_param)).first()
                if not resolved_student:
                    target_user = User.objects.filter(email__iexact=str(student_param), role=User.Role.STUDENT).first()
                    if target_user:
                        user_hex = str(target_user.id).replace("-", "")[:6].upper()
                        resolved_student, _ = StudentProfile.objects.get_or_create(
                            user=target_user,
                            defaults={"student_code": f"STU-{user_hex}"}
                        )
        elif student_profile:
            resolved_student = student_profile

        if resolved_student:
            data["student"] = str(resolved_student.id)
        else:
            return Response(
                {"error": "A valid student account is required to submit an application.", "code": "STUDENT_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        course = course_obj or Course.objects.filter(id=resolved_course_id).first()
        if course is None or course.status != Course.Status.PUBLISHED:
            return Response(
                {"error": "Only a published course can be selected.", "code": "COURSE_NOT_PUBLISHED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_staff_or_admin and not course.cohorts.filter(status=Cohort.Status.OPEN).exists():
            return Response(
                {"error": "No open cohorts are currently accepting applications for this course.", "code": "NO_OPEN_COHORT"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce single-course & eligibility policies per student in atomic transaction
        with transaction.atomic():
            locked_student = StudentProfile.objects.select_for_update().get(id=resolved_student.id)

            from applications.services.application_service import ApplicationService
            can_apply, err_msg, err_code = ApplicationService.can_student_apply(
                student=locked_student,
                course=course,
                cohort=resolved_cohort,
                is_admin_assignment=is_admin_assignment,
            )
            
            print(f"DEBUG: is_staff_or_admin={is_staff_or_admin}, is_admin_assignment={is_admin_assignment}, resolved_cohort={resolved_cohort}")
            print(f"DEBUG: can_apply={can_apply}, err_msg={err_msg}, err_code={err_code}")
            
            if not can_apply:
                active_app = blocking_application_for(locked_student)
                payload = {
                    "error": err_msg,
                    "message": err_msg,
                    "code": err_code,
                }
                if active_app:
                    payload["blocking_application"] = ApplicationSerializer(active_app, context=self.get_serializer_context()).data
                print(f"DEBUG: Returning 409 from can_student_apply failed. Payload: {payload}")
                return Response(
                    payload,
                    status=status.HTTP_409_CONFLICT,
                )

            active_app = blocking_application_for(locked_student)

            if active_app:
                if resolved_course_id and str(active_app.course_id) == str(resolved_course_id):
                    return Response(ApplicationSerializer(active_app, context=self.get_serializer_context()).data, status=status.HTTP_200_OK)
                is_admin_user = bool(user and (user.is_staff or getattr(user, "role", "") == "ADMIN"))
                if not is_admin_user:
                    print(f"DEBUG: Returning 409 from active_app course mismatch (not admin)")
                    return Response(
                        {
                            "error": "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one." if active_app.assigned_cohort_id else "Only one course can be selected at a time.",
                            "message": "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one." if active_app.assigned_cohort_id else "Only one course can be selected at a time.",
                            "code": "ACTIVE_COHORT_RESTRICTION" if active_app.assigned_cohort_id else "COURSE_SELECTION_LOCKED",
                            "blocking_application": ApplicationSerializer(active_app, context=self.get_serializer_context()).data,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                else:
                    print(f"DEBUG: Returning 409 from active_app course mismatch (IS admin). active_app.course_id={active_app.course_id}, resolved_course_id={resolved_course_id}")
                    return Response(
                        {
                            "code": "STUDENT_ALREADY_ENROLLED",
                            "message": "This student is already enrolled. Choose the required transfer.",
                            "current_application": {
                                "application_id": str(active_app.id),
                                "application_number": active_app.application_number,
                                "course": active_app.course.name if active_app.course else "",
                                "cohort": active_app.assigned_cohort.name if active_app.assigned_cohort else "",
                                "status": active_app.status,
                            },
                            "allowed_actions": [
                                "TRANSFER_COHORT",
                                "TRANSFER_COURSE_AND_COHORT",
                            ],
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

            from .models import generate_application_number
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            application = serializer.save(
                student=locked_student,
                application_number=generate_application_number(course=course, cohort=resolved_cohort),
                is_admin_assigned=is_admin_assignment,
            )
            if is_staff_or_admin and application.qualified is True:
                from exams.models import Exam
                Exam.objects.update_or_create(
                    application=application,
                    defaults={
                        "status": Exam.Status.EVALUATED,
                        "marks_obtained": 100,
                        "total_marks": 100,
                        "percentage": 100,
                        "qualified": True,
                        "submitted_at": timezone.now(),
                    }
                )
                if resolved_cohort and locked_student.student_identity_issued_at is None:
                    locked_student.student_identity_issued_at = timezone.now()
                    locked_student.save(update_fields=["student_identity_issued_at", "updated_at"])

            try:
                from applications.services.screening_schedule_service import create_course_default_screening_schedule
                create_course_default_screening_schedule(application)
            except Exception:
                pass

            try:
                self._notify_application_created(application)
            except Exception:
                pass
            output_serializer = ApplicationSerializer(application, context=self.get_serializer_context())
            headers = self.get_success_headers(output_serializer.data)
            return Response(output_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def _is_valid_uuid(self, val):
        if not val:
            return False
        try:
            import uuid
            uuid.UUID(str(val))
            return True
        except ValueError:
            return False

    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user
        student = serializer.validated_data.get("student")
        if not student:
            if hasattr(user, "student_profile"):
                student = user.student_profile
            else:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"student": "A Student Profile is required before applying for a course."})

        from .models import generate_application_number
        app_number = generate_application_number(course=serializer.validated_data.get("course"))
        application = serializer.save(student=student, application_number=app_number)
        
        # If an admin assigns a cohort directly during creation (e.g. seeded accounts),
        # automatically qualify them and skip the screening pipeline.
        if application.assigned_cohort and (user.is_superuser or user.role == "ADMIN"):
            application.qualified = True
            application.save(update_fields=['qualified'])
            from applications.services.state_machine import transition_application_status
            if application.status == application.Status.APPLIED:
                transition_application_status(application, application.Status.QUALIFIED, user=user,
                                              reason="Administrator assigned enrollment during creation")
            transition_application_status(application, application.Status.COHORT_ASSIGNED, user=user,
                                          reason="Administrator assigned cohort during creation")
            self._notify_application_created(application)
            return

        self._notify_application_created(application)
        create_course_default_screening_schedule(application)

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        target_status = serializer.validated_data.pop("status", previous_status)
        with transaction.atomic():
            application = serializer.save()
            if target_status != previous_status:
                from applications.services.state_machine import transition_application_status

                transition_application_status(
                    application,
                    target_status,
                    user=self.request.user,
                    reason=str(
                        self.request.data.get("reason")
                        or "Application status updated through the API"
                    ).strip(),
                )
        if application.status != previous_status:
            notify_user(
                application.student.user,
                title="Application status updated",
                message=(
                    f"Hi {display_name(application.student.user)}, your application "
                    f"{application.application_number} is now {application.get_status_display()}."
                ),
                notification_type=Notification.Type.INFO,
                action_url="application_tracker",
                dedupe_key=f"application:{application.id}:status:{application.status}",
            )

    @staticmethod
    def _notify_application_created(application):
        notify_user(
            application.student.user,
            title="Application received",
            message=(
                f"Hi {display_name(application.student.user)}, your application for "
                f"{application.course.name} was submitted successfully. Your application ID is "
                f"{application.application_number}."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:submitted",
        )

    @action(detail=False, methods=["get"], url_path="course-selection")
    def course_selection(self, request):
        from students.models import StudentProfile

        student = StudentProfile.objects.filter(user=request.user).first()
        if student is None:
            return Response(
                {
                    "can_apply": True,
                    "reason": "AVAILABLE",
                    "message": "You can select one published course.",
                    "blocking_application": None,
                }
            )
        return Response(course_selection_payload(student, ApplicationSerializer))

    @action(detail=False, methods=["get"], url_path="current-journey")
    def current_journey(self, request):
        """Return the single backend-authoritative journey for the signed-in student."""
        from students.models import StudentProfile

        student = StudentProfile.objects.filter(user=request.user).first()
        if student is None:
            return Response({"application": None, "is_enrolled": False})

        application = blocking_application_for(student)
        enrolled = enrolled_application_for(student)
        return Response(
            {
                "application": (
                    ApplicationSerializer(
                        application,
                        context=self.get_serializer_context(),
                    ).data
                    if application
                    else None
                ),
                "is_enrolled": bool(enrolled),
            }
        )

    @action(detail=True, methods=["post"], url_path="send-discontinue-otp")
    def send_discontinue_otp(self, request, pk=None):
        """
        Dispatches a 6-digit confirmation OTP to the student's registered email
        before allowing course / cohort discontinuation.
        """
        if request.user.is_staff or getattr(request.user, "role", "") == "ADMIN":
            application = Application.objects.filter(pk=pk).first()
        else:
            application = Application.objects.filter(pk=pk, student__user=request.user).first()

        if application is None:
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

        if application.status in {
            Application.Status.REJECTED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.COMPLETED,
        }:
            return Response(
                {"error": "This course application is already closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_user = application.student.user
        email = student_user.email
        course_title = getattr(application.course, "title", "Enrolled Course")

        from accounts.otp_service import store_discontinue_otp
        from common.services.email_service import send_course_discontinue_otp

        otp = store_discontinue_otp(str(application.id), email)
        try:
            send_course_discontinue_otp(email, course_title, otp)
        except Exception as e:
            logger.error(f"Failed to send discontinue OTP to {email}: {e}")

        return Response(
            {
                "detail": f"Confirmation OTP sent to {email}. Please enter the OTP to confirm course discontinuation.",
                "delivery_email": email,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="discontinue")
    def discontinue(self, request, pk=None):
        if request.user.is_staff or getattr(request.user, "role", "") == "ADMIN":
            application = Application.objects.filter(pk=pk).first()
            is_admin = True
        else:
            application = Application.objects.filter(pk=pk, student__user=request.user).first()
            is_admin = False

        if application is None:
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

        if application.status in {
            Application.Status.REJECTED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.COMPLETED,
        }:
            return Response(
                {"error": "This course application is already closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # For student requests, OTP verification is required to confirm discontinuation
        if not is_admin:
            otp_val = str(request.data.get("otp", "")).strip()
            if not otp_val:
                return Response(
                    {"error": "Confirmation OTP is required. Please request an OTP to discontinue your course."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from accounts.otp_service import verify_discontinue_otp
            ok, err = verify_discontinue_otp(str(application.id), otp_val)
            if not ok:
                return Response({"error": err or "Invalid or expired confirmation OTP."}, status=status.HTTP_400_BAD_REQUEST)

        reason = str(request.data.get("reason", "Student discontinued the course via verified OTP.")).strip()
        application.remarks = "\n".join(filter(None, [application.remarks, reason]))
        application.save(update_fields=["remarks", "updated_at"])

        from applications.services.state_machine import transition_application_status
        transition_application_status(
            application,
            Application.Status.DROPPED,
            user=request.user,
            reason=reason,
        )
        return Response(
            {
                "message": "Course discontinued successfully. You may now select another published course.",
                "application": ApplicationSerializer(application).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="assign-cohort")
    def assign_cohort(self, request, pk=None):
        """
        Step 5: Admin assigns cohort to qualified application.
        """
        application = self.get_object()
        cohort_id = request.data.get("cohort_id")

        if application.student.user.uses_reserved_staff_email:
            return Response(
                {
                    "error": "The @suretrust.local domain is reserved for staff and cannot be assigned as a student.",
                    "code": "STAFF_DOMAIN_RESERVED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        interview = getattr(application, "pre_screening_interview", None)
        if application.qualified is not True or application.status not in {
            Application.Status.QUALIFIED,
            Application.Status.WAITLISTED,
        }:
            return Response(
                {"error": "The application must have a published qualified screening result first.", "code": "QUALIFICATION_REQUIRED"},
                status=status.HTTP_409_CONFLICT,
            )
        interview = getattr(application, "pre_screening_interview", None)
        if application.course.requires_interview and (
            interview is None or interview.status != PreScreeningInterview.Status.PASSED
        ):
            return Response(
                {"error": "The pre-screen interview must be passed before cohort assignment.", "code": "INTERVIEW_REQUIRED"},
                status=status.HTTP_409_CONFLICT,
            )

        github_linked = bool(
            application.student.is_github_connected or
            (application.student.github_url and application.student.github_url.strip())
        )
        has_repo = bool(application.student.github_repo_url)

        if not application.student.is_linkedin_connected or not github_linked:
            return Response(
                {
                    "message": (
                        "Cohort and timetable assignment remain pending until the student "
                        "connects LinkedIn and adds their GitHub profile."
                    ),
                    "code": "COHORT_ASSIGNMENT_PENDING_PROFILES",
                    "cohort_assignment_status": "PENDING",
                    "application_status": application.status,
                    "requirements": {
                        "linkedin_connected": application.student.is_linkedin_connected,
                        "github_linked": github_linked,
                        "github_repo_created": has_repo,
                    },
                },
                status=status.HTTP_202_ACCEPTED,
            )

        if not application.is_student_role_verified:
            return Response(
                {
                    "error": "An admin must verify the student role before cohort assignment.",
                    "code": "ROLE_VERIFICATION_REQUIRED",
                    "role_verification_status": application.role_verification_status,
                    "blockers": application.role_verification_blockers(),
                },
                status=status.HTTP_409_CONFLICT,
            )

        if not cohort_id:
            return Response({"error": "cohort_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        from applications.services.state_machine import transition_application_status

        with transaction.atomic():
            app = Application.objects.select_for_update().get(pk=application.pk)
            try:
                cohort = Cohort.objects.select_for_update().get(id=cohort_id)
            except Cohort.DoesNotExist:
                return Response({"error": "Cohort not found."}, status=status.HTTP_404_NOT_FOUND)

            if cohort.course_id != app.course_id:
                return Response(
                    {"error": "The selected cohort belongs to a different course."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if cohort.status not in {Cohort.Status.OPEN, Cohort.Status.ACTIVE}:
                return Response(
                    {"error": "Students can be assigned only to an open or active cohort."},
                    status=status.HTTP_409_CONFLICT,
                )
            enrolled_count = cohort.applications.exclude(
                status__in=[Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.REJECTED]
            ).exclude(pk=app.pk).count()
            if enrolled_count >= cohort.max_students:
                return Response(
                    {
                        "error": f"Cohort {cohort.code} has reached its maximum student capacity of {cohort.max_students}.",
                        "code": "COHORT_FULL",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            app.assigned_cohort = cohort
            app.save(update_fields=["assigned_cohort", "updated_at"])
            
            # Map cohort status to application status
            status_map = {
                Cohort.Status.DRAFT: Application.Status.COHORT_ASSIGNED,
                Cohort.Status.OPEN: Application.Status.COHORT_ASSIGNED,
                Cohort.Status.ACTIVE: Application.Status.COHORT_ASSIGNED,
                Cohort.Status.TRAINING: Application.Status.TRAINING,
                Cohort.Status.INTERNSHIP: Application.Status.INTERNSHIP_ASSIGNED,
                Cohort.Status.SOFT_SKILLS: Application.Status.IN_PROGRESS,
                Cohort.Status.COMPLETED: Application.Status.COMPLETED,
                Cohort.Status.CANCELLED: Application.Status.CANCELLED,
            }
            target_status = status_map.get(cohort.status, Application.Status.COHORT_ASSIGNED)
            
            transition_application_status(
                app,
                target_status,
                user=request.user,
                reason=f"Assigned to cohort {cohort.code}",
            )
            if app.student.student_identity_issued_at is None:
                app.student.student_identity_issued_at = timezone.now()
                app.student.save(update_fields=["student_identity_issued_at", "updated_at"])

        notify_user(
            app.student.user,
            title="Cohort assigned",
            message=(
                f"Hi {display_name(app.student.user)}, you have been assigned to "
                f"{cohort.name} ({cohort.code}) for {app.course.name}. Your timetable is now available."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="timetable",
            dedupe_key=f"application:{app.id}:cohort:{cohort.id}",
        )

        # Trigger async email notification
        if hasattr(app.student.user, "email") and app.student.user.email:
            send_async_cohort_assignment.delay(
                app.student.user.email,
                cohort.name,
                app.course.name,
            )

        return Response(
            {
                "message": f"Assigned to cohort '{cohort.name}' successfully.",
                "application": ApplicationSerializer(app).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="transfer-cohort")
    def transfer_cohort(self, request, pk=None):
        """
        Admin transfers student from current cohort to another cohort of the same course.
        """
        application = self.get_object()
        new_cohort_id = request.data.get("cohort_id")
        transfer_reason = str(request.data.get("reason", "")).strip()

        if not new_cohort_id:
            return Response({"error": "cohort_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        from applications.services.state_machine import transition_application_status

        with transaction.atomic():
            app = Application.objects.select_for_update().get(pk=application.pk)
            try:
                new_cohort = Cohort.objects.select_for_update().get(id=new_cohort_id)
            except Cohort.DoesNotExist:
                return Response({"error": "Target cohort not found."}, status=status.HTTP_404_NOT_FOUND)

            if app.status in {
                Application.Status.COMPLETED,
                Application.Status.REJECTED,
                Application.Status.DROPPED,
                Application.Status.CANCELLED,
            }:
                return Response(
                    {"error": "A closed application cannot be transferred. Reopen it through an audited state repair first."},
                    status=status.HTTP_409_CONFLICT,
                )

            if new_cohort.course_id != app.course_id:
                return Response(
                    {"error": "The selected target cohort belongs to a different course."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if new_cohort.status not in {Cohort.Status.OPEN, Cohort.Status.ACTIVE}:
                return Response(
                    {"error": "Students can be transferred only to an open or active cohort."},
                    status=status.HTTP_409_CONFLICT,
                )

            enrolled_count = new_cohort.applications.exclude(
                status__in=[Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.REJECTED]
            ).exclude(pk=app.pk).count()
            if enrolled_count >= new_cohort.max_students:
                return Response(
                    {
                        "error": f"Target cohort {new_cohort.code} has reached its student capacity of {new_cohort.max_students}.",
                        "code": "COHORT_FULL",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            old_cohort = app.assigned_cohort
            if old_cohort and old_cohort.id == new_cohort.id:
                return Response(
                    {"error": "The student is already assigned to this cohort."},
                    status=status.HTTP_409_CONFLICT,
                )
            app.assigned_cohort = new_cohort
            app.save(update_fields=["assigned_cohort", "updated_at"])
            target_status = app.status if app.status in [Application.Status.IN_PROGRESS, Application.Status.TRAINING, Application.Status.INTERNSHIP_ASSIGNED] else Application.Status.COHORT_ASSIGNED
            if app.status != target_status:
                transition_application_status(
                    app,
                    target_status,
                    user=request.user,
                    reason=(
                        f"Transferred from {old_cohort.code if old_cohort else 'None'} to {new_cohort.code}"
                        + (f": {transfer_reason}" if transfer_reason else "")
                    ),
                )
            else:
                from .models import ApplicationStatusAudit
                ApplicationStatusAudit.objects.create(
                    application=app,
                    from_status=app.status,
                    to_status=app.status,
                    actor=request.user,
                    reason=(
                        f"Cohort transferred from {old_cohort.code if old_cohort else 'None'} to {new_cohort.code}"
                        + (f": {transfer_reason}" if transfer_reason else "")
                    ),
                )

        old_cohort_str = f"{old_cohort.name} ({old_cohort.code})" if old_cohort else "None"
        notify_user(
            app.student.user,
            title="Cohort transferred",
            message=(
                f"Hi {display_name(app.student.user)}, your cohort for {app.course.name} "
                f"has been transferred to {new_cohort.name} ({new_cohort.code}). Your timetable is updated."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="timetable",
            dedupe_key=f"application:{app.id}:transfer:{new_cohort.id}",
        )

        return Response(
            {
                "message": f"Successfully transferred student from '{old_cohort_str}' to cohort '{new_cohort.name}'.",
                "previous_cohort": old_cohort.code if old_cohort else None,
                "new_cohort": new_cohort.code,
                "application": ApplicationSerializer(app).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="transfer-course-cohort")
    def transfer_course_cohort(self, request, pk=None):
        """
        Explicit admin override: Transfer a student to a different course and cohort.
        Safely cancels old application academic state and creates a clean linked application.
        """
        if not (request.user and (request.user.is_staff or getattr(request.user, "role", "") == "ADMIN")):
            raise PermissionDenied("Course and cohort transfer is restricted to administrators.")

        application = self.get_object()
        target_course_id = request.data.get("course_id") or request.data.get("target_course_id")
        target_cohort_id = request.data.get("cohort_id") or request.data.get("target_cohort_id")
        reason = request.data.get("reason", "Administrative course and cohort transfer")

        if not target_course_id:
            return Response({"error": "Target course_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        target_course = Course.objects.filter(id=target_course_id).first()
        if not target_course:
            return Response({"error": "Target course not found."}, status=status.HTTP_404_NOT_FOUND)
        if target_course.status != Course.Status.PUBLISHED:
            return Response(
                {"error": "Students can be transferred only to a published course."},
                status=status.HTTP_409_CONFLICT,
            )
        if target_course.id == application.course_id:
            return Response(
                {"error": "Use the cohort-transfer action when the course is unchanged."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            from .services.state_machine import transition_application_status
            from .models import ApplicationStatusAudit, generate_application_number
            from students.models import StudentProfile

            app = Application.objects.select_for_update().select_related(
                "student", "student__user", "course", "assigned_cohort"
            ).get(pk=application.pk)
            StudentProfile.objects.select_for_update().get(pk=app.student_id)
            target_course = Course.objects.select_for_update().get(pk=target_course.pk)

            if app.status in {
                Application.Status.COMPLETED,
                Application.Status.REJECTED,
                Application.Status.DROPPED,
                Application.Status.CANCELLED,
            }:
                return Response(
                    {"error": "A closed application cannot be transferred. Reopen it through an audited state repair first."},
                    status=status.HTTP_409_CONFLICT,
                )

            target_cohort = None
            if target_cohort_id:
                try:
                    target_cohort = Cohort.objects.select_for_update().get(
                        id=target_cohort_id,
                        course=target_course,
                    )
                except Cohort.DoesNotExist:
                    return Response(
                        {"error": "Target cohort not found for this course."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                if target_cohort.status not in {Cohort.Status.OPEN, Cohort.Status.ACTIVE}:
                    return Response(
                        {"error": "Students can be transferred only to an open or active cohort."},
                        status=status.HTTP_409_CONFLICT,
                    )
                enrolled_count = target_cohort.applications.exclude(
                    status__in=[
                        Application.Status.DROPPED,
                        Application.Status.CANCELLED,
                        Application.Status.REJECTED,
                    ]
                ).count()
                if enrolled_count >= target_cohort.max_students:
                    return Response(
                        {
                            "error": f"Target cohort {target_cohort.code} has reached its student capacity.",
                            "code": "COHORT_FULL",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

            # Cancel old application state
            transition_application_status(
                app,
                Application.Status.CANCELLED,
                user=request.user,
                reason=f"Superseded by course transfer to {target_course.code}: {reason}",
            )
            if app.offer_letter_status == Application.OfferLetterStatus.ISSUED:
                app.offer_letter_status = Application.OfferLetterStatus.REVOKED
                app.offer_letter_revoked_at = timezone.now()
                app.offer_letter_revoked_by = request.user
                app.offer_letter_revoke_reason = (
                    f"Automatically revoked during course transfer: {reason}"
                )
                app.save(update_fields=[
                    "offer_letter_status",
                    "offer_letter_revoked_at",
                    "offer_letter_revoked_by",
                    "offer_letter_revoke_reason",
                    "updated_at",
                ])

            # Create replacement application for new course
            new_status = Application.Status.COHORT_ASSIGNED if target_cohort else Application.Status.QUALIFIED
            new_app = Application.objects.create(
                student=app.student,
                course=target_course,
                assigned_cohort=target_cohort,
                status=new_status,
                qualified=True,
                role_verification_status=Application.RoleVerificationStatus.VERIFIED,
                role_verified_by=request.user,
                role_verified_at=timezone.now(),
                role_verification_remarks=f"Administrative course transfer override: {reason}",
                application_number=generate_application_number(course=target_course, cohort=target_cohort),
            )
            ApplicationStatusAudit.objects.create(
                application=new_app,
                from_status=Application.Status.APPLIED,
                to_status=new_status,
                actor=request.user,
                reason=f"Created via course transfer from {app.course.code} ({app.application_number}): {reason}",
            )

        return Response(
            {
                "message": f"Successfully transferred student to {target_course.name}.",
                "previous_application_id": str(app.id),
                "new_application": ApplicationSerializer(new_app, context=self.get_serializer_context()).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="repair-state")
    def repair_state(self, request, pk=None):
        """Explicit, audited administrator override for exceptional remediation."""
        application = self.get_object()
        target_status = request.data.get("status")
        reason = str(request.data.get("reason", "")).strip()
        if target_status not in dict(Application.Status.choices):
            return Response({"error": "A valid target status is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({"error": "A repair reason is required."}, status=status.HTTP_400_BAD_REQUEST)

        from applications.services.state_machine import repair_application_state

        repaired = repair_application_state(
            application,
            target_status,
            admin_user=request.user,
            reason=reason,
        )
        return Response(
            {
                "message": "Application state repaired with an audit record.",
                "application": ApplicationSerializer(
                    repaired,
                    context=self.get_serializer_context(),
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="role-verification")
    def review_role_verification(self, request, pk=None):
        """Admin review equivalent of the Django Admin role-verification field."""
        target_status = str(request.data.get("status", "")).strip().upper()
        remarks = str(request.data.get("remarks", "")).strip()
        valid_statuses = dict(Application.RoleVerificationStatus.choices)

        if target_status not in valid_statuses:
            return Response(
                {"error": "Choose Pending, Verified, or Rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_status == Application.RoleVerificationStatus.REJECTED and not remarks:
            return Response(
                {"error": "Remarks are required when rejecting student-role verification."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            application = Application.objects.select_for_update().select_related(
                "student", "student__user", "course"
            ).get(pk=self.get_object().pk)

            if target_status == Application.RoleVerificationStatus.VERIFIED:
                blockers = application.role_verification_blockers()
                if blockers:
                    return Response(
                        {
                            "error": "Student role cannot be verified until all checks pass.",
                            "code": "ROLE_VERIFICATION_BLOCKED",
                            "blockers": blockers,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                application.role_verified_by = request.user
                application.role_verified_at = timezone.now()
            else:
                application.role_verified_by = None
                application.role_verified_at = None

            application.role_verification_status = target_status
            application.role_verification_remarks = remarks
            application.save(update_fields=[
                "role_verification_status",
                "role_verified_by",
                "role_verified_at",
                "role_verification_remarks",
                "updated_at",
            ])

        if target_status == Application.RoleVerificationStatus.VERIFIED:
            title = "Student role verified"
            message = (
                f"Your student role for {application.course.name} has been verified. "
                "You are now eligible for cohort assignment."
            )
            notification_type = Notification.Type.SUCCESS
        else:
            title = "Student role verification updated"
            message = (
                f"Your student-role verification for {application.course.name} is now "
                f"{application.get_role_verification_status_display()}."
                + (f" Remarks: {remarks}" if remarks else "")
            )
            notification_type = Notification.Type.WARNING

        notify_user(
            application.student.user,
            title=title,
            message=message,
            notification_type=notification_type,
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:role-verification:{target_status}",
        )
        return Response(
            {
                "message": f"Student-role verification updated to {valid_statuses[target_status]}.",
                "application": ApplicationSerializer(
                    application,
                    context=self.get_serializer_context(),
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="suspend", permission_classes=[IsAuthenticated, IsVolunteerOrAdmin])
    def suspend_cohort(self, request, pk=None):
        """
        Admin only: Suspend student from active cohort.
        """
        application = self.get_object()
        if application.status == Application.Status.SUSPENDED:
            return Response({"message": "Application is already suspended."}, status=status.HTTP_200_OK)

        from applications.services.state_machine import transition_application_status
        transition_application_status(
            application,
            Application.Status.SUSPENDED,
            user=request.user,
            reason=request.data.get("reason", "Administrative cohort suspension"),
        )

        notify_user(
            application.student.user,
            title="Cohort access suspended",
            message=(
                f"Hi {display_name(application.student.user)}, your cohort status for {application.course.name} "
                "has been suspended. Timetable and meeting links are temporarily disabled."
            ),
            notification_type=Notification.Type.WARNING,
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:suspended",
        )
        return Response(
            {
                "message": f"Suspended application {application.application_number} successfully.",
                "application": ApplicationSerializer(application).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="unsuspend", permission_classes=[IsAuthenticated, IsVolunteerOrAdmin])
    def unsuspend_cohort(self, request, pk=None):
        """
        Admin only: Grant re-access to a suspended student.
        Maps the student to the cohort's current phase so they rejoin
        at the correct stage. Requires a mandatory reason.
        """
        application = self.get_object()
        if application.status != Application.Status.SUSPENDED:
            return Response({"error": "Application is not currently suspended."}, status=status.HTTP_400_BAD_REQUEST)

        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response(
                {"error": "A reason is required when granting re-access to a suspended student."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine target status from the cohort's current phase
        cohort = application.assigned_cohort
        if cohort:
            COHORT_PHASE_TO_APP_STATUS = {
                "ACTIVE": Application.Status.IN_PROGRESS,
                "TRAINING": Application.Status.TRAINING,
                "INTERNSHIP": Application.Status.INTERNSHIP_ASSIGNED,
                "SOFT_SKILLS": Application.Status.SOFT_SKILLS,
            }
            target_status = COHORT_PHASE_TO_APP_STATUS.get(
                cohort.status, Application.Status.COHORT_ASSIGNED
            )
        else:
            target_status = Application.Status.QUALIFIED

        from applications.services.state_machine import transition_application_status
        transition_application_status(
            application,
            target_status,
            user=request.user,
            reason=f"[REACCESS_GRANTED] {reason}",
        )

        cohort_name = f"{cohort.name} ({cohort.code})" if cohort else "course"
        notify_user(
            application.student.user,
            title="Cohort access restored",
            message=(
                f"Hi {display_name(application.student.user)}, your cohort access for {application.course.name} "
                f"({cohort_name}) has been restored. Timetable and meeting links are active."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="timetable",
            dedupe_key=f"application:{application.id}:unsuspended",
        )
        return Response(
            {
                "message": f"Re-access granted for application {application.application_number}.",
                "application": ApplicationSerializer(application).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="generate-offer-letter")
    def generate_offer_letter(self, request, pk=None):
        """
        Admin only: Generate Offer Letter PDF for a student's cohort membership.
        """
        from django.db import transaction
        
        # select_for_update ensures no concurrent rapid clicks can bypass idempotency
        try:
            with transaction.atomic():
                application = Application.objects.select_for_update().get(pk=pk)
                
                # 1. Ensure application is assigned to a cohort
                if not application.assigned_cohort:
                    return Response({"error": "Application is not assigned to a cohort."}, status=status.HTTP_400_BAD_REQUEST)
                
                # 2. Repair only the narrow legacy case where cohort assignment,
                # qualification, and admin verification were persisted but the
                # lifecycle status was not advanced. This remains privileged and
                # creates an ApplicationStatusAudit entry.
                eligible_statuses = {
                    Application.Status.COHORT_ASSIGNED,
                    Application.Status.IN_PROGRESS,
                    Application.Status.TRAINING,
                    Application.Status.INTERNSHIP_ASSIGNED,
                    Application.Status.COMPLETED,
                }
                legacy_pre_enrolment_statuses = {
                    Application.Status.PRESCREENING_PENDING,
                    Application.Status.PRESCREENING_COMPLETED,
                    Application.Status.QUALIFIED,
                    Application.Status.WAITLISTED,
                }
                if (
                    application.status in legacy_pre_enrolment_statuses
                    and application.qualified is True
                    and application.role_verification_status
                    == Application.RoleVerificationStatus.VERIFIED
                ):
                    from applications.services.state_machine import repair_application_state

                    application = repair_application_state(
                        application,
                        Application.Status.COHORT_ASSIGNED,
                        request.user,
                        (
                            "Offer-letter generation repaired a historical application "
                            "whose verified cohort assignment had a stale pre-enrolment status."
                        ),
                    )
                if application.status not in eligible_statuses:
                    return Response(
                        {
                            "error": (
                                f"Cannot generate an offer letter without an active enrolled lifecycle status; "
                                f"this application is {application.get_status_display()}."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                
                # 3. Verify 1 calendar month has passed
                cohort_start = application.assigned_cohort.start_date
                if not cohort_start:
                    return Response({"error": "Cohort has no start date."}, status=status.HTTP_400_BAD_REQUEST)
                    
                from dateutil.relativedelta import relativedelta
                from django.utils import timezone
                
                eligibility_date = cohort_start + relativedelta(months=1)
                
                if timezone.now().date() < eligibility_date:
                    return Response({"error": "Student has not completed one calendar month in the cohort yet."}, status=status.HTTP_400_BAD_REQUEST)
                    
                # 4. Idempotency - If already generated, return existing URL
                if application.offer_letter_status == Application.OfferLetterStatus.ISSUED and application.offer_letter_file:
                    try:
                        if application.offer_letter_file.storage.exists(application.offer_letter_file.name):
                            return Response({
                                "message": "Offer letter already generated.",
                                "url": request.build_absolute_uri(
                                    f"/api/applications/{application.id}/download-offer-letter/"
                                ),
                            }, status=status.HTTP_200_OK)
                    except Exception:
                        pass
                    
                # 5. Generate PDF using new robust service
                from applications.services.offer_letter_generator import issue_offer_letter
                application = issue_offer_letter(application)
        except Application.DoesNotExist:
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            "message": "Offer letter generated successfully.",
            "url": request.build_absolute_uri(
                f"/api/applications/{application.id}/download-offer-letter/"
            ),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="generate-offer-letters-for-cohort")
    def generate_offer_letters_for_cohort(self, request):
        """
        Admin only: Bulk generate offer letters for an entire cohort.
        """
        cohort_id = request.data.get("cohort_id")
        if not cohort_id:
            return Response({"error": "cohort_id is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            cohort = Cohort.objects.get(id=cohort_id)
        except Cohort.DoesNotExist:
            return Response({"error": "Cohort not found."}, status=status.HTTP_404_NOT_FOUND)
            
        from applications.tasks import bulk_generate_cohort_offer_letters
        # Enqueue the Celery job
        bulk_generate_cohort_offer_letters.delay(cohort.id, request.user.id)
        
        return Response({
            "message": f"Bulk offer letter generation queued for cohort {cohort.code}. You will be notified when complete."
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"], url_path="request-offer-letter")
    def request_offer_letter(self, request, pk=None):
        """
        Student facing: Request an offer letter early/manually.
        """
        from django.db import transaction, IntegrityError
        from common.models import UserRequest, Notification
        from common.services.notifications import notify_admins, display_name

        application = self.get_object()
        
        # Verify student is the owner
        if not getattr(request.user, "is_staff", False) and getattr(request.user, "role", "") != "ADMIN":
            if application.student.user != request.user:
                return Response({"error": "You can only request an offer letter for your own application."}, status=status.HTTP_403_FORBIDDEN)
                
        try:
            with transaction.atomic():
                locked_application = Application.objects.select_for_update().get(id=application.id)
                
                # Verify physical existence before throwing 409
                if locked_application.offer_letter_status == Application.OfferLetterStatus.ISSUED and locked_application.offer_letter_file:
                    try:
                        if locked_application.offer_letter_file.storage.exists(locked_application.offer_letter_file.name):
                            return Response({"error": "Offer letter has already been issued."}, status=status.HTTP_409_CONFLICT)
                    except Exception:
                        pass
                    
                # Check for any existing request
                existing_request = UserRequest.objects.filter(
                    related_application=locked_application,
                    category=UserRequest.Category.OFFER_LETTER
                ).order_by("-created_at").first()
                
                if existing_request:
                    if existing_request.status in [UserRequest.Status.PENDING, UserRequest.Status.IN_PROGRESS]:
                        return Response({"error": "You already have a pending request for an offer letter."}, status=status.HTTP_409_CONFLICT)
                    elif existing_request.status in [UserRequest.Status.REJECTED, UserRequest.Status.CLOSED]:
                        return Response({"error": f"Your previous request was {existing_request.status.lower()}. Please contact support for clarification."}, status=status.HTTP_409_CONFLICT)
                    elif existing_request.status == UserRequest.Status.RESOLVED:
                        pass # Allowed to continue if physically missing (handled by the file check above)
                    
                subject = f"Offer Letter Request for Application {locked_application.application_number}"
                
                # Create UserRequest
                user_req = UserRequest.objects.create(
                    sender=locked_application.student.user,
                    category=UserRequest.Category.OFFER_LETTER,
                    subject=subject,
                    description=request.data.get("reason", "Student requested an offer letter."),
                    related_application=locked_application
                )
                
                # Notify admins
                notify_admins(
                    title="Offer Letter Requested",
                    message=f"Student {display_name(locked_application.student.user)} requested an offer letter for {locked_application.course.name}.",
                    notification_type=Notification.Type.ACTION_REQUIRED,
                    dedupe_key=f"offer_request_{user_req.id}"
                )
                
                return Response({
                    "message": "Offer letter request submitted successfully.",
                    "request_id": user_req.request_number
                }, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response({"error": "You already have a pending request for an offer letter."}, status=status.HTTP_409_CONFLICT)

    @action(detail=True, methods=["get"], url_path="download-offer-letter")
    def download_offer_letter(self, request, pk=None):
        """
        Authenticated endpoint to safely fetch the offer letter URL.
        Prevents unauthorized downloading.
        """
        application = self.get_object()
        
        if not getattr(request.user, "is_staff", False) and getattr(request.user, "role", "") != "ADMIN":
            if application.student.user != request.user:
                return Response({"error": "You can only download your own offer letter."}, status=status.HTTP_403_FORBIDDEN)
                
        if application.offer_letter_status == Application.OfferLetterStatus.REVOKED:
            return Response({"error": "Offer letter has been revoked."}, status=status.HTTP_410_GONE)

        if application.offer_letter_status != Application.OfferLetterStatus.ISSUED:
            return Response({"error": "Offer letter has not been issued."}, status=status.HTTP_404_NOT_FOUND)

        if not application.offer_letter_file or not application.offer_letter_file.storage.exists(application.offer_letter_file.name):
            if application.offer_letter_status == Application.OfferLetterStatus.ISSUED:
                try:
                    from applications.services.offer_letter_generator import issue_offer_letter
                    application = issue_offer_letter(application)
                except Exception:
                    pass
            if not application.offer_letter_file or not application.offer_letter_file.storage.exists(application.offer_letter_file.name):
                return Response({"error": "Offer letter file not found in storage."}, status=status.HTTP_404_NOT_FOUND)

        from django.http import FileResponse
        return FileResponse(
            application.offer_letter_file.open("rb"),
            as_attachment=True,
            filename=f"offer_letter_{application.application_number}.pdf",
            content_type="application/pdf",
        )

    @action(detail=False, methods=["get"], url_path="verify-offer-letter")
    def verify_offer_letter(self, request):
        """
        Legacy or backward compatible verify offer letter endpoint for any code that used it.
        """
        hash_val = request.query_params.get("hash")
        
        if not hash_val:
            return Response(
                {"error": "Please provide 'hash' query parameter to verify offer letter."},
                status=status.HTTP_400_BAD_REQUEST,
            )
            
        application = Application.objects.filter(offer_letter_hash=str(hash_val).strip()).select_related(
            "student__user", "assigned_cohort", "course"
        ).first()
        
        if not application:
            return Response(
                {"valid": False, "message": "Offer letter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.offer_letter_status == Application.OfferLetterStatus.REVOKED:
            return Response(
                {
                    "valid": False,
                    "status": "REVOKED",
                    "message": "This offer letter has been revoked.",
                    "uuid": hash_val,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if application.status in [
            Application.Status.SUSPENDED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.REJECTED,
        ]:
            return Response(
                {
                    "valid": False,
                    "status": application.status,
                    "message": f"This offer letter cannot be verified because the application is {application.get_status_display().lower()}.",
                    "uuid": hash_val,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            application.offer_letter_status != Application.OfferLetterStatus.ISSUED
            or not application.offer_letter_issued
            or not application.offer_letter_file
            or not application.offer_letter_file.storage.exists(application.offer_letter_file.name)
        ):
            return Response(
                {
                    "valid": False,
                    "status": application.offer_letter_status,
                    "message": "Offer letter is not active or verified in storage.",
                    "uuid": hash_val,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
            
        return Response({
            "valid": True,
            "status": application.status,
            "uuid": application.offer_letter_hash,
            "full_name": application.student.user.get_full_name(),
            "domain_of_internship": getattr(application.course, "category", application.course.name),
            "duration": str(application.course.duration_weeks // 4) if getattr(application.course, "duration_weeks", None) else "3",
            "start_date": application.assigned_cohort.start_date.strftime("%d-%m-%Y") if application.assigned_cohort and application.assigned_cohort.start_date else "TBD",
            "mentor": "assigned mentor",
            "verified": True,
            "student_name": application.student.user.get_full_name(),
            "course": application.course.name,
            "cohort": application.assigned_cohort.name,
            "issue_date": application.offer_letter_issued_at.strftime("%Y-%m-%d") if application.offer_letter_issued_at else None,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="check-completion")
    def check_completion(self, request, pk=None):
        """
        Step 8 & 9: Evaluates attendance & assignment scores to trigger course completion & certificate.
        """
        application = self.get_object()
        completed, message = calculate_and_process_course_completion(application)
        application.refresh_from_db()

        return Response(
            {
                "completed": completed,
                "message": message,
                "application": ApplicationSerializer(application).data,
                "journey": build_student_journey(application.student, application),
            },
            status=status.HTTP_200_OK if completed else status.HTTP_400_BAD_REQUEST,
        )


    @action(detail=True, methods=["post"], url_path="revoke-offer-letter")
    @transaction.atomic
    def revoke_offer_letter(self, request, pk=None):
        """
        Admin only: Revoke an issued Offer Letter.
        """
        if not getattr(request.user, "is_staff", False) and getattr(request.user, "role", "") != "ADMIN":
            return Response({"error": "Only admins can revoke offer letters."}, status=status.HTTP_403_FORBIDDEN)
            
        from django.db import transaction
        from common.models import Notification
        from common.services.notifications import notify_user
        
        try:
            with transaction.atomic():
                application = Application.objects.select_for_update().get(pk=pk)
                
                if application.offer_letter_status != Application.OfferLetterStatus.ISSUED:
                    return Response({"error": "Only issued offer letters can be revoked."}, status=status.HTTP_400_BAD_REQUEST)
                    
                reason = request.data.get("reason", "Revoked by admin")
                
                from django.utils import timezone
                application.offer_letter_status = Application.OfferLetterStatus.REVOKED
                application.offer_letter_revoked_at = timezone.now()
                application.offer_letter_revoked_by = request.user
                application.offer_letter_revoke_reason = reason
                application.save(update_fields=["offer_letter_status", "offer_letter_revoked_at", "offer_letter_revoked_by", "offer_letter_revoke_reason", "updated_at"])
                
                # Notify the student
                notify_user(
                    user=application.student.user,
                    title="Offer Letter Revoked",
                    message=f"Your Offer Letter for {application.course.name} has been revoked. Reason: {reason}",
                    notification_type=Notification.Type.WARNING
                )
                
                return Response({"message": "Offer letter successfully revoked."}, status=status.HTTP_200_OK)
        except Application.DoesNotExist:
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["post"], url_path="restore-offer-letter")
    def restore_offer_letter(self, request, pk=None):
        """
        Admin only: Restore a revoked Offer Letter.
        """
        if not getattr(request.user, "is_staff", False) and getattr(request.user, "role", "") != "ADMIN":
            return Response({"error": "Only admins can restore offer letters."}, status=status.HTTP_403_FORBIDDEN)
            
        from django.db import transaction
        from common.models import Notification
        from common.services.notifications import notify_user
        
        try:
            with transaction.atomic():
                application = Application.objects.select_for_update().get(pk=pk)
                
                if application.offer_letter_status != Application.OfferLetterStatus.REVOKED:
                    return Response({"error": "Only revoked offer letters can be restored."}, status=status.HTTP_400_BAD_REQUEST)
                    
                reason = request.data.get("reason", "Restored by admin")
                
                from django.utils import timezone
                application.offer_letter_status = Application.OfferLetterStatus.ISSUED
                application.offer_letter_revoked_at = None
                application.offer_letter_revoked_by = None
                application.offer_letter_revoke_reason = ""
                # Could optionally track restore time/reason in new fields, but for now just revert the revoked state
                application.save(update_fields=["offer_letter_status", "offer_letter_revoked_at", "offer_letter_revoked_by", "offer_letter_revoke_reason", "updated_at"])
                
                # Notify the student
                notify_user(
                    user=application.student.user,
                    title="Offer Letter Restored",
                    message=f"Your Offer Letter for {application.course.name} has been restored and is available for download again. Remarks: {reason}",
                    notification_type=Notification.Type.INFO
                )
                
                return Response({"message": "Offer letter successfully restored."}, status=status.HTTP_200_OK)
        except Application.DoesNotExist:
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)
        
        return Response({"message": "Offer letter revoked successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reset-offer-letter")
    def reset_offer_letter(self, request, pk=None):
        """
        Admin only: Hard reset an offer letter back to NOT_GENERATED and delete its files.
        """
        if not getattr(request.user, "is_staff", False) and getattr(request.user, "role", "") != "ADMIN":
            return Response({"error": "Only admins can reset offer letters."}, status=status.HTTP_403_FORBIDDEN)
            
        from django.db import transaction
        from common.models import Notification, UserRequest
        from common.services.notifications import notify_user
        
        try:
            with transaction.atomic():
                application = Application.objects.select_for_update().get(pk=pk)
                
                # 1. Physically delete the PDF if it exists
                if application.offer_letter_file:
                    application.offer_letter_file.delete(save=False)
                    
                # 2. Reset the Application status & hash
                application.offer_letter_status = Application.OfferLetterStatus.NOT_GENERATED
                application.offer_letter_issued = False
                application.offer_letter_hash = ""
                application.offer_letter_file = None
                application.offer_letter_revoked_at = None
                application.offer_letter_revoked_by = None
                application.offer_letter_revoke_reason = ""
                application.save(update_fields=[
                    "offer_letter_status", 
                    "offer_letter_issued", 
                    "offer_letter_hash",
                    "offer_letter_file", 
                    "offer_letter_revoked_at", 
                    "offer_letter_revoked_by", 
                    "offer_letter_revoke_reason", 
                    "updated_at"
                ])
                
                # 3. Close all existing Offer Letter requests with audit remarks rather than hard deletion
                UserRequest.objects.filter(
                    related_application=application, 
                    category=UserRequest.Category.OFFER_LETTER
                ).update(
                    status=UserRequest.Status.CLOSED,
                    admin_remarks=f"Offer letter reset by admin {request.user.email} on {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}.",
                    resolved_by=request.user,
                    resolved_at=timezone.now(),
                )
                
                # 4. Notify the student
                notify_user(
                    user=application.student.user,
                    title="Offer Letter Reset",
                    message=f"Your Offer Letter for {application.course.name} has been reset by an administrator. You may submit a new request if required.",
                    notification_type=Notification.Type.INFO
                )
                
                return Response({"message": "Offer letter successfully reset. The student can now request it freshly."}, status=status.HTTP_200_OK)
        except Application.DoesNotExist:
            return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)


    @action(detail=True, methods=["post"], url_path="confirm-whatsapp-join")
    def confirm_whatsapp_join(self, request, pk=None):
        """Allows a student to confirm they have joined the WhatsApp group for their application."""
        application = self.get_object()
        
        # Verify the student actually has access to the whatsapp link before allowing confirmation
        serializer = self.get_serializer(application)
        if not serializer.data.get("whatsapp_group_link"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not currently eligible to join this WhatsApp group.")
            
        application.whatsapp_joined = True
        application.save(update_fields=["whatsapp_joined", "updated_at"])
        
        return Response({"status": "success", "message": "WhatsApp join confirmed."})

    @action(detail=True, methods=["get"], url_path="journey")
    def journey(self, request, pk=None):
        application = self.get_object()
        return Response(build_student_journey(application.student, application))

    @action(detail=True, methods=["post"], url_path="generate-question-bank")
    def generate_question_bank(self, request, pk=None):
        application = self.get_object()
        course = application.course
        if not course:
            return Response({"error": "No course associated with this application."}, status=status.HTTP_400_BAD_REQUEST)
        
        from question_bank.auto_generate import auto_generate_prescreening_bank
        bank = auto_generate_prescreening_bank(course.id)
        if bank:
            ps, _ = PreScreening.objects.get_or_create(application=application)
            ps.question_bank = bank
            if bank.set_codes:
                ps.paper_set = bank.set_codes[0]
            ps.save(update_fields=["question_bank", "paper_set", "updated_at"])
            return Response({
                "message": f"AI Question Bank generation triggered for {course.name} ({course.code}).",
                "question_bank_id": str(bank.id),
                "title": bank.title,
                "status": bank.status,
                "paper_set": ps.paper_set,
            }, status=status.HTTP_200_OK)
        return Response({"error": "Failed to initialize AI Question Bank."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PreScreeningViewSet(viewsets.ModelViewSet):
    serializer_class = PreScreeningSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    queryset = PreScreening.objects.all()

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return PreScreening.objects.none()
        if user.is_staff or getattr(user, 'role', '') == 'ADMIN':
            qs = PreScreening.objects.select_related(
                "application", "application__student", "application__student__user",
                "application__assigned_cohort", "application__course", "application__exam",
                "question_bank"
            ).all().order_by("-created_at")
        else:
            qs = PreScreening.objects.select_related(
                "application", "application__student", "application__student__user",
                "application__assigned_cohort", "application__course", "application__exam",
                "question_bank"
            ).filter(application__student__user=user)

        cohort_id = self.request.query_params.get("cohort") or self.request.query_params.get("cohort_id")
        if cohort_id:
            qs = qs.filter(application__assigned_cohort_id=cohort_id)
        return qs

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'update_status', 'release_exam', 'bulk_release', 'generate_question_bank', 'admin_start']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated(), IsOwnerOrAdmin()]

    @action(detail=True, methods=["post"], url_path="release-exam")
    def release_exam(self, request, pk=None):
        pre_screening = self.get_object()
        is_released = request.data.get("is_released", True)
        pre_screening.is_released = bool(is_released)
        pre_screening.save(update_fields=["is_released", "updated_at"])

        publish_screening_schedule(
            pre_screening,
            notification_key=f"release:{pre_screening.updated_at.isoformat()}",
        )
        return Response({
            "message": f"Pre-screening exam {'released' if pre_screening.is_released else 'locked'} successfully.",
            "is_released": pre_screening.is_released,
            "scheduled_at": pre_screening.scheduled_at,
            "end_time": pre_screening.end_time,
        })

    @action(detail=True, methods=["post"], url_path="admin-start")
    def admin_start(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"):
            return Response({"error": "Only Platform Admins can start the screening exam."}, status=status.HTTP_403_FORBIDDEN)
            
        from django.db import transaction
        from django.utils import timezone
        
        with transaction.atomic():
            pre_screening = PreScreening.objects.select_for_update().get(pk=pk)
            now = timezone.now()
            pre_screening.admin_started_at = now
            pre_screening.is_released = True
            
            cohort = getattr(pre_screening.application, "assigned_cohort", None)
            if cohort:
                PreScreening.objects.filter(
                    application__assigned_cohort=cohort,
                    question_bank=pre_screening.question_bank
                ).update(admin_started_at=now, is_released=True)
            else:
                pre_screening.save(update_fields=["admin_started_at", "is_released"])
                
        return Response({
            "message": "Screening exam started successfully.",
            "admin_started_at": pre_screening.admin_started_at
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="admin-end")
    def admin_end(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"):
            return Response({"error": "Only Platform Admins can end the screening exam."}, status=status.HTTP_403_FORBIDDEN)
            
        from django.db import transaction
        from django.utils import timezone
        
        with transaction.atomic():
            pre_screening = PreScreening.objects.select_for_update().get(pk=pk)
            now = timezone.now()
            pre_screening.end_time = now
            
            cohort = getattr(pre_screening.application, "assigned_cohort", None)
            if cohort:
                PreScreening.objects.filter(
                    application__assigned_cohort=cohort,
                    question_bank=pre_screening.question_bank
                ).update(end_time=now)
            else:
                pre_screening.save(update_fields=["end_time"])
                
        return Response({
            "message": "Screening exam ended successfully.",
            "end_time": pre_screening.end_time
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="bulk-release")
    def bulk_release(self, request):
        application_ids = request.data.get("application_ids", [])
        is_released = request.data.get("is_released", True)
        scheduled_at = request.data.get("scheduled_at")
        end_time = request.data.get("end_time")

        if not application_ids:
            return Response({"error": "application_ids list is required."}, status=status.HTTP_400_BAD_REQUEST)

        schedules = PreScreening.objects.filter(application_id__in=application_ids)
        updated_count = 0
        for ps in schedules:
            ps.is_released = bool(is_released)
            if scheduled_at:
                ps.scheduled_at = scheduled_at
            if end_time:
                ps.end_time = end_time
            ps.save()
            publish_screening_schedule(
                ps,
                notification_key=f"bulk-release:{ps.updated_at.isoformat()}",
            )
            updated_count += 1

        return Response({
            "message": f"Updated examination release gate for {updated_count} application(s).",
            "updated_count": updated_count,
            "is_released": bool(is_released),
        })

    @action(detail=True, methods=["post"], url_path="generate-question-bank")
    def generate_question_bank(self, request, pk=None):
        pre_screening = self.get_object()
        course = pre_screening.application.course if pre_screening.application else None
        if not course:
            return Response({"error": "No course associated with this pre-screening schedule."}, status=status.HTTP_400_BAD_REQUEST)
        
        from question_bank.auto_generate import auto_generate_prescreening_bank
        bank = auto_generate_prescreening_bank(course.id)
        if bank:
            pre_screening.question_bank = bank
            if bank.set_codes:
                pre_screening.paper_set = bank.set_codes[0]
            pre_screening.save(update_fields=["question_bank", "paper_set", "updated_at"])
            return Response({
                "message": f"AI Question Bank generation triggered for {course.name} ({course.code}).",
                "question_bank_id": str(bank.id),
                "title": bank.title,
                "status": bank.status,
                "paper_set": pre_screening.paper_set,
            }, status=status.HTTP_200_OK)
        return Response({"error": "Failed to initialize AI Question Bank."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def perform_create(self, serializer):
        application = serializer.validated_data["application"]
        journey = build_student_journey(application.student, application)
        if not journey["steps"][1]["completed"]:
            raise ValidationError({"profile": "The student profile must be completed before screening is scheduled."})
        student = application.student
        has_linkedin = bool(student and (student.is_linkedin_connected or (student.linkedin_url and student.linkedin_url.strip())))
        if not has_linkedin:
            raise ValidationError({"linkedin": "LinkedIn verification or profile URL is required before screening is scheduled."})
        if application.status in {
            Application.Status.REJECTED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.COMPLETED,
        }:
            raise ValidationError({"application": "A closed application cannot be scheduled for screening."})
        pre_screening = serializer.save()
        publish_screening_schedule(
            pre_screening,
            notification_key=f"api:{pre_screening.scheduled_at.isoformat() if pre_screening.scheduled_at else pre_screening.updated_at.isoformat()}",
        )

    def perform_update(self, serializer):
        pre_screening = serializer.save()
        publish_screening_schedule(
            pre_screening,
            notification_key=f"api-update:{pre_screening.updated_at.isoformat()}",
        )

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        pre_screening = self.get_object()
        new_status = request.data.get("status")
        if new_status not in dict(PreScreening.Status.choices):
            return Response({"error": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        update_data = {
            key: request.data[key]
            for key in ["status", "remarks", "scheduled_at", "meeting_link", "interviewer"]
            if key in request.data
        }
        serializer = self.get_serializer(pre_screening, data=update_data, partial=True)
        serializer.is_valid(raise_exception=True)
        pre_screening = serializer.save()

        # Update application status based on prescreening
        application = pre_screening.application
        from applications.services.state_machine import transition_application_status
        if new_status == PreScreening.Status.PASSED:
            application.qualified = None
            application.save(update_fields=["qualified", "updated_at"])
            try:
                transition_application_status(
                    application,
                    Application.Status.PRESCREENING_COMPLETED,
                    user=request.user,
                    reason="Pre-screening exam passed",
                )
            except Exception:
                pass
        elif new_status == PreScreening.Status.FAILED:
            application.qualified = False
            application.save(update_fields=["qualified", "updated_at"])
            try:
                transition_application_status(
                    application,
                    Application.Status.REJECTED,
                    user=request.user,
                    reason="Pre-screening exam failed",
                )
            except Exception:
                pass

        if new_status == PreScreening.Status.RESCHEDULED:
            publish_screening_schedule(
                pre_screening,
                notification_key=f"api-status:{pre_screening.updated_at.isoformat()}",
            )
            return Response(
                {
                    "message": "Pre-screening exam rescheduled.",
                    "pre_screening": PreScreeningSerializer(pre_screening).data,
                },
                status=status.HTTP_200_OK,
            )

        notify_user(
            application.student.user,
            title="Pre-screening status updated",
            message=(
                f"Hi {display_name(application.student.user)}, your pre-screening status is now "
                f"{pre_screening.get_status_display()}."
            ),
            notification_type=(Notification.Type.SUCCESS if new_status == PreScreening.Status.PASSED else Notification.Type.WARNING),
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:prescreening:{new_status}",
        )

        return Response(
            {
                "message": "Pre-screening status updated.",
                "pre_screening": PreScreeningSerializer(pre_screening).data,
            },
            status=status.HTTP_200_OK,
        )


class PreScreeningInterviewViewSet(viewsets.ModelViewSet):
    serializer_class = PreScreeningInterviewSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    queryset = PreScreeningInterview.objects.all()

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return PreScreeningInterview.objects.none()
        base = PreScreeningInterview.objects.select_related(
            "application", "application__student", "application__student__user",
            "application__assigned_cohort", "interviewer",
        ).order_by("-created_at")
        if has_global_cohort_access(user):
            return base
        role = getattr(user, "role", "")
        if role == "MENTOR":
            return base.filter(application__assigned_cohort__mentors=user).distinct()
        if role in {"VOLUNTEER", "TRUSTEE"}:
            return base.filter(application__assigned_cohort__volunteers=user).distinct()
        return base.filter(application__student__user=user)

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsVolunteerOrMentorOrAdmin()]
        if self.action == 'destroy':
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    def check_interview_permission(self, interview):
        user = self.request.user
        is_admin = user and (user.is_staff or getattr(user, "role", "") == "ADMIN")
        is_assigned_interviewer = interview.interviewer_id == user.id
        is_assigned_cohort_manager = can_manage_cohort(user, interview.application.assigned_cohort)
        if not (is_admin or is_assigned_interviewer or is_assigned_cohort_manager):
            raise PermissionDenied("Only an assigned cohort mentor, volunteer, interviewer, or administrator can update this interview.")

    def perform_update(self, serializer):
        self.check_interview_permission(serializer.instance)
        serializer.save()

    def perform_create(self, serializer):
        application = serializer.validated_data["application"]
        user = self.request.user
        if not has_global_cohort_access(user) and not can_manage_cohort(user, application.assigned_cohort):
            raise PermissionDenied("This candidate is not in one of your assigned cohorts.")
        if application.qualified is not True or application.status not in {
            Application.Status.QUALIFIED,
            Application.Status.WAITLISTED,
        }:
            raise ValidationError({"application": "Only a qualified application can be scheduled for interview."})
        if not application.student.is_linkedin_connected:
            raise ValidationError({"linkedin": "LinkedIn verification is required before interview scheduling."})
        save_kwargs = {} if has_global_cohort_access(user) and serializer.validated_data.get("interviewer") else {"interviewer": user}
        interview = serializer.save(**save_kwargs)
        notify_user(
            application.student.user,
            title="Pre-screen interview scheduled",
            message=(
                f"Hi {display_name(application.student.user)}, your pre-screen interview for "
                f"{application.course.name} has been scheduled."
            ),
            notification_type=Notification.Type.ACTION_REQUIRED,
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:interview:scheduled",
        )

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        interview = self.get_object()
        self.check_interview_permission(interview)
        new_status = request.data.get("status")

        if new_status not in dict(PreScreeningInterview.Status.choices):
            return Response({"error": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        update_data = {
            key: request.data[key]
            for key in ["status", "feedback", "score", "scheduled_at", "meeting_link"]
            if key in request.data
        }
        serializer = self.get_serializer(interview, data=update_data, partial=True)
        serializer.is_valid(raise_exception=True)
        interview = serializer.save()

        application = interview.application
        if new_status == PreScreeningInterview.Status.FAILED:
            application.qualified = False
            application.save(update_fields=["qualified", "updated_at"])
            from applications.services.state_machine import transition_application_status
            try:
                transition_application_status(
                    application,
                    Application.Status.REJECTED,
                    user=request.user,
                    reason="Pre-screening interview failed",
                )
            except Exception:
                pass

        notify_user(
            application.student.user,
            title=(
                "Interview rescheduled"
                if new_status == PreScreeningInterview.Status.RESCHEDULED
                else "Interview result published"
            ),
            message=(
                f"Hi {display_name(application.student.user)}, your pre-screen interview status is now "
                f"{interview.get_status_display()}."
                + (
                    f" New date and time: {timezone.localtime(interview.scheduled_at):%d %b %Y, %I:%M %p}."
                    if interview.scheduled_at else ""
                )
            ),
            notification_type=(
                Notification.Type.ACTION_REQUIRED
                if new_status == PreScreeningInterview.Status.RESCHEDULED
                else (
                    Notification.Type.SUCCESS
                    if new_status == PreScreeningInterview.Status.PASSED
                    else Notification.Type.INFO
                )
            ),
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:interview:{new_status}",
        )

        return Response(
            {
                "message": "Interview status updated.",
                "interview": self.get_serializer(interview).data,
            },
            status=status.HTTP_200_OK,
        )


class CommunityActivityViewSet(viewsets.ModelViewSet):
    serializer_class = CommunityActivitySerializer
    permission_classes = [IsAuthenticated]
    queryset = CommunityActivity.objects.select_related(
        "application", "application__student", "application__student__user",
        "application__assigned_cohort", "verified_by",
    ).all()

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            return base
        if role == "MENTOR":
            return base.filter(application__assigned_cohort__mentors=user).distinct()
        if role in {"VOLUNTEER", "TRUSTEE"}:
            return base.filter(application__assigned_cohort__volunteers=user).distinct()
        if role == "STUDENT":
            return base.filter(application__student__user=user)
        return base.none()

    def perform_create(self, serializer):
        application = serializer.validated_data["application"]
        user = self.request.user
        role = getattr(user, "role", "")
        if role == "STUDENT":
            if application.student.user_id != user.id:
                raise PermissionDenied("You can submit activity evidence only for your own journey.")
        elif not has_global_cohort_access(user):
            if application.assigned_cohort is None or not can_manage_cohort(user, application.assigned_cohort):
                raise PermissionDenied("This student is not in one of your assigned cohorts.")
        if application.assigned_cohort is None:
            raise ValidationError({"application": "Community activities unlock after cohort assignment."})
        serializer.save()

    def perform_update(self, serializer):
        if getattr(self.request.user, "role", "") == "STUDENT":
            if serializer.instance.status != CommunityActivity.Status.PENDING:
                raise PermissionDenied("Verified activity evidence cannot be edited.")
            serializer.save()
            return
        activity = serializer.instance
        if activity.application.assigned_cohort and not can_manage_cohort(
            self.request.user, activity.application.assigned_cohort
        ):
            raise PermissionDenied("This student is not in one of your assigned cohorts.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        activity = self.get_object()
        user = request.user
        role = getattr(user, "role", "")
        if role not in {"ADMIN", "MENTOR", "VOLUNTEER", "TRUSTEE"} and not user.is_staff:
            raise PermissionDenied("Only an assigned mentor, volunteer, trustee, or admin can verify activity evidence.")
        if activity.application.assigned_cohort and not can_manage_cohort(user, activity.application.assigned_cohort):
            raise PermissionDenied("This student is not in one of your assigned cohorts.")
        new_status = request.data.get("status", CommunityActivity.Status.VERIFIED)
        if new_status not in {CommunityActivity.Status.VERIFIED, CommunityActivity.Status.REJECTED}:
            raise ValidationError({"status": "Use VERIFIED or REJECTED."})
        activity.status = new_status
        activity.verified_by = user
        activity.verified_at = timezone.now()
        activity.verification_remarks = request.data.get("verification_remarks")
        activity.save(update_fields=[
            "status", "verified_by", "verified_at", "verification_remarks", "updated_at",
        ])
        notify_user(
            activity.application.student.user,
            title="Community activity reviewed",
            message=f"{activity.get_activity_type_display()} evidence was {activity.get_status_display().lower()}.",
            notification_type=Notification.Type.SUCCESS if new_status == CommunityActivity.Status.VERIFIED else Notification.Type.WARNING,
            action_url="application_tracker",
            dedupe_key=f"community:{activity.id}:{new_status}",
        )
        return Response(self.get_serializer(activity).data)


from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

class VerifyOfferLetterAPIView(APIView):
    """
    Exact public verification endpoint expected by frontend:
    /api/offer-letters/verify/{uuid}/
    """
    permission_classes = [AllowAny]
    
    def get(self, request, uuid):
        if not uuid or not str(uuid).strip():
            return Response(
                {"valid": False, "message": "Verification code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        application = Application.objects.filter(offer_letter_hash=str(uuid).strip()).select_related(
            "student__user", "assigned_cohort", "course"
        ).first()
        
        if not application:
            return Response(
                {"valid": False, "message": "Offer letter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if application.offer_letter_status == Application.OfferLetterStatus.REVOKED:
            return Response(
                {
                    "valid": False,
                    "status": "REVOKED",
                    "message": "This offer letter has been revoked.",
                    "uuid": uuid
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if application.status in [
            Application.Status.SUSPENDED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.REJECTED,
        ]:
            return Response(
                {
                    "valid": False,
                    "status": application.status,
                    "message": f"This offer letter cannot be verified because the application is {application.get_status_display().lower()}.",
                    "uuid": uuid
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            application.offer_letter_status != Application.OfferLetterStatus.ISSUED
            or not application.offer_letter_issued
            or not application.offer_letter_file
            or not application.offer_letter_file.storage.exists(application.offer_letter_file.name)
        ):
            return Response(
                {
                    "valid": False,
                    "status": application.offer_letter_status,
                    "message": "Offer letter is not active or verified in storage.",
                    "uuid": uuid
                },
                status=status.HTTP_403_FORBIDDEN,
            )
            
        return Response({
            "valid": True,
            "status": application.status,
            "uuid": application.offer_letter_hash,
            "full_name": application.student.user.get_full_name(),
            "domain_of_internship": application.course.name if application.course else "Technical Domain",
            "internship_phase": "Training",
            "duration": str(application.course.duration_weeks // 4) if getattr(application.course, "duration_weeks", None) else "3",
            "start_date": application.assigned_cohort.start_date.strftime("%d-%m-%Y") if application.assigned_cohort and application.assigned_cohort.start_date else "TBD",
            "mentor": "assigned mentor"
        }, status=status.HTTP_200_OK)


class ApplicationStatusAuditViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for Admins and Trustees to view historical application status transitions.
    """
    queryset = ApplicationStatusAudit.objects.select_related("application", "actor").all().order_by("-created_at")
    serializer_class = ApplicationStatusAuditSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_permissions(self):
        # Override to allow Trustees as well
        from common.permissions import IsAnnouncementManager
        return [IsAuthenticated(), IsAnnouncementManager()]
