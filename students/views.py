import logging
from functools import wraps

from rest_framework import status, viewsets, permissions, mixins
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.exceptions import ValidationError, PermissionDenied, APIException
from django.http import Http404
from rest_framework.views import APIView

from django.db import transaction
from django.db.models import Count, Prefetch, Q

from .models import StudentProfile, StudentPlacement
from .serializers import StudentProfileSerializer, StudentPlacementSerializer
from .permissions import StudentProfilePermission, can_read_student_document
from common.permissions import IsOwnerOrAdmin
from applications.models import Application, PreScreeningInterview
from common.models import Notification
from common.services.notifications import notify_user
from certificates.models import Certificate


from rest_framework.authentication import BaseAuthentication, SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

logger = logging.getLogger(__name__)


class QueryParamJWTAuthentication(BaseAuthentication):
    """
    Authenticate a user via a JWT token or signed token in the 'token' query parameter.
    Useful for secure browser downloads where custom headers cannot be passed (e.g. <a> tags / new tabs).
    """
    def authenticate(self, request):
        raw_token = request.query_params.get("token") if hasattr(request, "query_params") else request.GET.get("token")
        if not raw_token:
            return None
        from rest_framework_simplejwt.backends import TokenBackend
        from django.conf import settings
        from django.contrib.auth import get_user_model
        User = get_user_model()
        # 1. Try JWT access token
        try:
            jwt_conf = getattr(settings, "SIMPLE_JWT", {})
            token_backend = TokenBackend(
                algorithm=jwt_conf.get('ALGORITHM', 'HS256'),
                signing_key=jwt_conf.get('SIGNING_KEY', settings.SECRET_KEY)
            )
            valid_data = token_backend.decode(raw_token, verify=True)
            user_id = valid_data.get('user_id')
            user = User.objects.filter(id=user_id, is_active=True).first()
            if user:
                return (user, raw_token)
        except Exception:
            pass

        # 2. Try signed token
        try:
            from django.core.signing import TimestampSigner
            signer = TimestampSigner()
            val = signer.unsign(raw_token, max_age=86400 * 7)
            parts = val.split(":")
            if len(parts) >= 3 and parts[0] == "resume":
                user = User.objects.filter(id=parts[2], is_active=True).first()
                if user:
                    return (user, raw_token)
        except Exception:
            pass

        return None



def log_student_update_errors(view_method):
    @wraps(view_method)
    def wrapped(self, request, *args, **kwargs):
        try:
            return view_method(self, request, *args, **kwargs)
        except (APIException, Http404):
            raise
        except Exception:
            logger.exception(
                "Student profile update crashed: profile=%s user=%s content_type=%s file_fields=%s",
                kwargs.get(self.lookup_url_kwarg or self.lookup_field),
                getattr(getattr(request, "user", None), "id", None),
                getattr(request, "content_type", None),
                sorted(getattr(request, "FILES", {}).keys()),
            )
            raise
    return wrapped


class StudentProfileViewSet(viewsets.ModelViewSet):
    serializer_class = StudentProfileSerializer
    permission_classes = [IsAuthenticated, StudentProfilePermission]

    @staticmethod
    def _validation_message(exc):
        messages = getattr(exc, "messages", None)
        return " ".join(str(message) for message in messages) if messages else str(exc)

    @staticmethod
    def _profile_complete(profile):
        user = profile.user
        return bool(
            user.first_name.strip()
            and user.last_name.strip()
            and user.phone_number
            and profile.college
            and profile.degree
        )

    @log_student_update_errors
    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Serialize replacement uploads; never save a stale pre-lock profile over
        # another request's completed update.
        instance = StudentProfile.objects.select_for_update().get(pk=instance.pk)
        self.check_object_permissions(request, instance)

        was_complete = self._profile_complete(instance)
        had_github = bool(instance.is_github_connected or instance.github_url)

        # 1. Update user fields
        user = instance.user
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        user_updated = False
        if "first_name" in data and data["first_name"] is not None:
            user.first_name = str(data["first_name"]).strip()
            user_updated = True
        if "last_name" in data and data["last_name"] is not None:
            user.last_name = str(data["last_name"]).strip()
            user_updated = True
        phone_val = data.get("phone_number") or data.get("phone") or data.get("phoneNumber")
        if phone_val is not None:
            user.phone_number = str(phone_val).strip()
            user_updated = True
        if user_updated:
            user.save(update_fields=["first_name", "last_name", "phone_number", "updated_at"])

        # 2. Directly update profile fields safely
        if "college" in data:
            instance.college = str(data["college"]).strip() if data["college"] else None
        if "degree" in data:
            instance.degree = str(data["degree"]).strip() if data["degree"] else None
        if "specialization" in data:
            instance.specialization = str(data["specialization"]).strip() if data["specialization"] else None
        if "tagline" in data:
            instance.tagline = str(data["tagline"]).strip() if data["tagline"] else None
        if "bio" in data:
            instance.bio = str(data["bio"]).strip() if data["bio"] else None
        if "city" in data:
            instance.city = str(data["city"]).strip() if data["city"] else None
        if "state" in data:
            instance.state = str(data["state"]).strip() if data["state"] else None
        if "country" in data:
            instance.country = str(data["country"]).strip() if data["country"] else "India"
        if "is_public" in data:
            instance.is_public = str(data["is_public"]).lower() in ["true", "1", "t", "yes"]

        # Date of birth
        dob_val = data.get("date_of_birth") or data.get("dob")
        if dob_val:
            dob_str = str(dob_val).strip().split("T")[0].split(" ")[0]
            try:
                import datetime
                if "-" in dob_str and len(dob_str.split("-")[0]) == 2:
                    p = dob_str.split("-")
                    dob_str = f"{p[2]}-{p[1]}-{p[0]}"
                elif "/" in dob_str:
                    # Handle MM/DD/YYYY
                    p = dob_str.split("/")
                    if len(p) == 3 and len(p[2]) == 4:
                        dob_str = f"{p[2]}-{p[0].zfill(2)}-{p[1].zfill(2)}"
                
                datetime.date.fromisoformat(dob_str)
                instance.date_of_birth = dob_str
            except Exception:
                pass
        elif any(k in data for k in ("date_of_birth", "dob", "dateOfBirth")):
            instance.date_of_birth = None
            
        # Prevent DRF from trying to validate an incorrectly formatted date string
        if "date_of_birth" in data:
            data.pop("date_of_birth")
        if "dob" in data:
            data.pop("dob")

        # Graduation year
        grad_val = data.get("graduation_year") or data.get("graduationYear") or data.get("year")
        if grad_val:
            try:
                instance.graduation_year = int(str(grad_val).strip())
            except (ValueError, TypeError):
                pass
        elif any(k in data for k in ("graduation_year", "graduationYear", "year")):
            instance.graduation_year = None

        # Education level
        ed_val = data.get("education_level") or data.get("educationLevel")
        if ed_val:
            ed_str = str(ed_val).strip().upper()
            if ed_str in [c[0] for c in StudentProfile.EducationLevel.choices]:
                instance.education_level = ed_str
            elif "POST" in ed_str or "MASTER" in ed_str or "PG" in ed_str:
                instance.education_level = StudentProfile.EducationLevel.POSTGRADUATE
            elif "DIP" in ed_str:
                instance.education_level = StudentProfile.EducationLevel.DIPLOMA
            elif "OTHER" in ed_str:
                instance.education_level = StudentProfile.EducationLevel.OTHER
            else:
                instance.education_level = StudentProfile.EducationLevel.UNDERGRADUATE

        # URL fields
        for url_f in ["linkedin_url", "github_url", "portfolio_url", "github_repo_url"]:
            if url_f not in data and url_f.replace("_", "") not in data:
                continue
            val = data.get(url_f) or data.get(url_f.replace("_", ""))
            if val:
                u = str(val).strip()
                if u and not u.startswith("http://") and not u.startswith("https://"):
                    u = f"https://{u}"
                setattr(instance, url_f, u)
            elif val == "" or val is None:
                setattr(instance, url_f, None)

        # Skills / hobbies / languages
        for list_f in ["skills", "hobbies", "languages"]:
            if list_f in data:
                val = data[list_f]
                if isinstance(val, str):
                    val = [item.strip() for item in val.split(",") if item.strip()]
                elif not isinstance(val, list):
                    val = []
                setattr(instance, list_f, val)

        # Uploaded files
        file_uploaded = False
        from common.validators import (
            extract_banner_image_from_request,
            extract_profile_photo_from_request,
            extract_resume_from_request,
            NO_FILE_UPDATE,
        )

        try:
            photo_result = extract_profile_photo_from_request(request)
        except Exception as e:
            raise ValidationError({"profile_photo": self._validation_message(e)})

        if photo_result is not NO_FILE_UPDATE:
            instance.profile_photo = photo_result
            file_uploaded = True

        try:
            banner_result = extract_banner_image_from_request(request)
        except Exception as e:
            raise ValidationError({"banner_image": self._validation_message(e)})

        if banner_result is not NO_FILE_UPDATE:
            instance.banner_image = banner_result
            file_uploaded = True

        try:
            resume_result = extract_resume_from_request(request, student_profile=instance)
        except Exception as e:
            raise ValidationError({"resume": self._validation_message(e)})

        if resume_result is not NO_FILE_UPDATE:
            instance.resume = resume_result
            file_uploaded = True

        instance.save()
        instance.refresh_from_db()

        if file_uploaded:
            try:
                from common.tasks import process_resume_and_photo_verification
                transaction.on_commit(lambda: process_resume_and_photo_verification.delay(str(instance.id)), robust=True)
            except Exception:
                pass

        if not was_complete and self._profile_complete(instance):
            notify_user(
                instance.user,
                title="Student profile completed",
                message="Your candidate profile is complete and ready for application review.",
                notification_type=Notification.Type.SUCCESS,
                action_url="application_tracker",
                dedupe_key=f"student:{instance.id}:profile:complete",
            )
        if not had_github and (instance.is_github_connected or instance.github_url):
            notify_user(
                instance.user,
                title="GitHub profile added",
                message="Your GitHub profile is available for student-role verification.",
                notification_type=Notification.Type.SUCCESS,
                action_url="application_tracker",
                dedupe_key=f"student:{instance.id}:github:linked",
            )

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        pk = self.kwargs.get(lookup_url_kwarg)
        if pk in ["me", "current", "self"]:
            user = self.request.user
            user_hex = str(user.id).replace("-", "")[:6].upper()
            profile, _ = StudentProfile.objects.get_or_create(
                user=user,
                defaults={"student_code": f"STU-{user_hex}"}
            )
            return profile

        from django.shortcuts import get_object_or_404
        import uuid
        lookup = Q(student_code__iexact=str(pk))
        try:
            identifier = uuid.UUID(str(pk))
            lookup |= Q(pk=identifier) | Q(user_id=identifier)
        except (ValueError, TypeError, AttributeError):
            pass
        obj = get_object_or_404(self.get_queryset(), lookup)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return StudentProfile.objects.none()

        base_qs = StudentProfile.objects.select_related("user", "google_identity").prefetch_related(
            Prefetch(
                "applications",
                queryset=Application.objects.select_related(
                    "course", "assigned_cohort"
                ).prefetch_related(
                    "assigned_cohort__mentors", "status_audits"
                ).order_by("-applied_at"),
            ),
            Prefetch(
                "certificates",
                queryset=Certificate.objects.select_related("application__course").order_by("-issued_at"),
            ),
        )

        if user.is_superuser or getattr(user, 'role', '') == 'ADMIN':
            qs = base_qs.all().order_by("-created_at")
        elif getattr(user, "role", "") == "MENTOR":
            if getattr(user, "has_all_cohorts_access", False):
                qs = base_qs.all().order_by("student_code")
            else:
                qs = base_qs.filter(applications__assigned_cohort__mentors=user).distinct().order_by("student_code")
        elif getattr(user, "role", "") in {"VOLUNTEER", "TRUSTEE"}:
            if getattr(user, "has_all_cohorts_access", False):
                qs = base_qs.all().order_by("student_code")
            else:
                qs = base_qs.filter(applications__assigned_cohort__volunteers=user).distinct().order_by("student_code")
        else:
            qs = base_qs.filter(user=user)

        course = self.request.query_params.get("course")
        cohort = self.request.query_params.get("cohort")
        application_status = self.request.query_params.get("application_status")
        qualified_param = self.request.query_params.get("qualified")
        seeded = self.request.query_params.get("seeded")
        is_seeded = self.request.query_params.get("is_seeded")

        # 1. First apply 'seeded' (no applications) filter if requested
        if seeded and str(seeded).strip().lower() in ["true", "1", "yes"]:
            qs = qs.filter(
                applications__isnull=True,
                user__last_login__isnull=True,
                user__is_email_verified=False
            )
        elif is_seeded and str(is_seeded).strip().lower() in ["true", "1", "yes"]:
            qs = qs.filter(applications__isnull=True)

        # Ensure only users with STUDENT role are returned (to guarantee no mentors/volunteers appear)
        qs = qs.filter(user__role='STUDENT')

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search) |
                Q(student_code__icontains=search)
            )

        if course or cohort or application_status or qualified_param is not None:
            filters = Q()
            if course:
                import uuid
                is_uuid = False
                try:
                    uuid.UUID(str(course))
                    is_uuid = True
                except (ValueError, AttributeError, TypeError):
                    pass

                if is_uuid:
                    filters &= (Q(applications__course_id=course) | Q(applications__course__code__iexact=course) | Q(applications__course__name__icontains=course))
                else:
                    filters &= (Q(applications__course__code__iexact=course) | Q(applications__course__name__icontains=course))

            if cohort:
                import uuid
                is_uuid = False
                try:
                    uuid.UUID(str(cohort))
                    is_uuid = True
                except (ValueError, AttributeError, TypeError):
                    pass

                if is_uuid:
                    filters &= (Q(applications__assigned_cohort__id=cohort) | Q(applications__assigned_cohort__code__iexact=cohort) | Q(applications__assigned_cohort__name__icontains=cohort))
                else:
                    filters &= (Q(applications__assigned_cohort__code__iexact=cohort) | Q(applications__assigned_cohort__name__icontains=cohort))
            if application_status:
                filters &= (
                    Q(applications__status__iexact=application_status) |
                    (Q(applications__completed_course=True) if str(application_status).upper() == "COMPLETED" else Q())
                )
            if qualified_param is not None:
                q_val = str(qualified_param).strip().lower()
                if q_val in ["true", "1", "t", "yes"]:
                    filters &= Q(applications__qualified=True)
                elif q_val in ["false", "0", "f", "no"]:
                    filters &= Q(applications__qualified=False)
                elif q_val in ["null", "none", "pending", ""]:
                    filters &= Q(applications__qualified__isnull=True)
            qs = qs.filter(filters)

        return qs.distinct()

    def create(self, request, *args, **kwargs):
        target_user = request.user
        user_id_param = request.data.get("user")
        from common.access import is_admin
        if user_id_param and str(user_id_param) != str(request.user.pk) and not is_admin(request.user):
            raise PermissionDenied("You cannot create or replace another account's profile.")
        if is_admin(request.user) and user_id_param:
            from accounts.models import User
            try:
                target_user = User.objects.get(id=user_id_param)
            except User.DoesNotExist:
                return Response({"user": "User not found."}, status=status.HTTP_400_BAD_REQUEST)

        existing_profile = StudentProfile.objects.filter(user=target_user).first()
        if existing_profile:
            self.check_object_permissions(request, existing_profile)
            serializer = self.get_serializer(existing_profile, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student_code = request.data.get("student_code") or f"STU-{target_user.id.hex[:6].upper()}"
        serializer.save(user=target_user, student_code=student_code)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def statistics(self, request):
        """
        Returns real-time aggregated metrics for the logged-in student's dashboard.
        """
        user = request.user
        try:
            profile = StudentProfile.objects.get(user=user)
        except StudentProfile.DoesNotExist:
            return Response(
                {
                    "student_code": None,
                    "total_applications": 0,
                    "qualified_applications": 0,
                    "active_cohort": None,
                    "exams_taken": 0,
                    "module_tests_passed": 0,
                    "attendance_percentage": 0.0,
                    "application_status": None,
                    "application_number": None,
                    "application_course_title": None,
                    "applied_at": None,
                    "screening_status": None,
                    "screening_scheduled_at": None,
                    "screening_meeting_link": None,
                    "screening_marks_obtained": None,
                    "screening_total_marks": None,
                    "screening_percentage": None,
                    "screening_grade": None,
                    "screening_qualified": False,
                    "interview_status": None,
                    "interview_scheduled_at": None,
                    "interview_meeting_link": None,
                    "interview_score": None,
                    "interview_required": None,
                    "student_role_verified": False,
                    "certificate_count": 0,
                    "unread_notification_count": 0,
                    "is_linkedin_connected": False,
                    "github_url": None,
                    "is_github_linked": False,
                    "portfolio_url": None,
                    "is_portfolio_linked": False,
                    "open_request_count": 0,
                    "upcoming_sessions": [],
                    "module_grades": [],
                    "journey": None,
                },
                status=status.HTTP_200_OK,
            )

        apps = list(Application.objects.filter(student=profile).select_related(
            "course",
            "assigned_cohort",
            "exam",
            "pre_screening",
            "pre_screening_interview",
        ).prefetch_related("assigned_cohort__mentors", "course__modules").order_by("-applied_at"))
        total_apps = len(apps)
        qualified_apps = sum(1 for app in apps if app.qualified is True)
        latest_app = apps[0] if apps else None
        from attendance.services.student_scope import ENROLLED_STATUSES, attendance_metrics
        active_app = next((app for app in apps if app.assigned_cohort_id and app.status in ENROLLED_STATUSES), None)
        active_cohort_info = None
        if active_app and active_app.assigned_cohort:
            cohort_obj = active_app.assigned_cohort
            mentors_qs = cohort_obj.mentors.filter(is_active=True)
            mentor = mentors_qs.first()
            mentor_names = [
                (m.get_full_name().strip() or m.email)
                for m in mentors_qs
            ]
            if not mentor_names and mentor:
                mentor_names = [(mentor.get_full_name().strip() or mentor.email)]

            modules_list = []
            if active_app.course:
                modules_qs = active_app.course.modules.filter(is_active=True).order_by("order", "module_number")
                modules_list = [
                    f"Module {m.module_number}: {m.title}"
                    for m in modules_qs
                ]
                if not modules_list and isinstance(active_app.course.curriculum, list):
                    for idx, item in enumerate(active_app.course.curriculum, start=1):
                        if isinstance(item, dict):
                            t = item.get("title") or item.get("name") or str(item)
                        else:
                            t = str(item)
                        if t.strip():
                            modules_list.append(f"Module {idx}: {t.strip()}")

            active_mentors_list = [
                {
                    "id": str(m.id),
                    "first_name": m.first_name or "",
                    "last_name": m.last_name or "",
                    "email": m.email,
                    "name": (m.get_full_name().strip() or m.email),
                }
                for m in mentors_qs
            ]

            active_cohort_info = {
                "id": str(cohort_obj.id),
                "code": cohort_obj.code,
                "name": cohort_obj.name,
                "course_id": str(active_app.course.id) if active_app.course else None,
                "course_title": active_app.course.name if active_app.course else "",
                "status": cohort_obj.status,
                "start_date": cohort_obj.start_date.isoformat() if cohort_obj.start_date else None,
                "end_date": cohort_obj.end_date.isoformat() if cohort_obj.end_date else None,
                "mentor_name": ", ".join(mentor_names) if mentor_names else None,
                "mentors": mentor_names,
                "active_mentors": active_mentors_list,
                "modules": modules_list,
            }

        # Exam performance
        from exams.models import ModuleTestSubmission
        def _safe_rel(obj, name):
            if not obj:
                return None
            try:
                return getattr(obj, name, None)
            except Exception:
                return None

        exams_taken = sum(1 for app in apps if _safe_rel(app, "exam") is not None)
        module_submissions = list(
            ModuleTestSubmission.objects.filter(student=profile)
            .select_related("test", "test__course", "test__module")
            .order_by("submitted_at")
        )
        # Count all passed tests across all courses for the general stats
        total_module_tests_passed = sum(1 for submission in module_submissions if submission.qualified is True)

        # Count passed tests specifically for the active course for accurate progress percentage
        active_course_tests_passed = 0
        if active_app and active_app.course:
            active_course_tests_passed = len({
                submission.test.module_id for submission in module_submissions
                if submission.qualified is True and submission.test
                and submission.test.course_id == active_app.course.id
                and submission.test.module_id and submission.test.module.is_active
            })
        latest_exam = _safe_rel(latest_app, "exam")
        published_exam = latest_exam if (
            latest_exam and latest_exam.status == "EVALUATED"
            and (latest_exam.marks_obtained is not None or latest_exam.percentage is not None)
        ) else None
        pre_screening = _safe_rel(latest_app, "pre_screening")
        interview = _safe_rel(latest_app, "pre_screening_interview")

        def grade_from_percentage(percentage):
            if percentage is None:
                return None
            value = float(percentage)
            if value >= 90:
                return "A+"
            if value >= 80:
                return "A"
            if value >= 70:
                return "B"
            if value >= 60:
                return "C"
            if value >= 50:
                return "D"
            return "F"

        # Attendance calculation
        from attendance.models import Attendance
        from attendance.serializers import AttendanceSerializer
        from common.models import Notification, UserRequest
        from django.utils import timezone
        from applications.services.journey_service import build_student_journey
        metrics = attendance_metrics(profile, active_app)
        attendance_pct = metrics["percentage"]

        upcoming_sessions = []
        if active_app and active_app.assigned_cohort:
            sessions = Attendance.objects.filter(
                cohort=active_app.assigned_cohort,
                class_date__gte=timezone.localdate(),
            ).select_related("cohort", "conducted_by").prefetch_related("attendees").order_by("class_date", "start_time")[:5]
            upcoming_sessions = AttendanceSerializer(sessions, many=True, context={"request": request}).data

        module_grades = [
            {
                "id": str(submission.id),
                "test": str(submission.test_id),
                "module_number": index,
                "title": submission.test.title,
                "marks_obtained": submission.marks_obtained,
                "total_marks": submission.total_marks,
                "percentage": submission.percentage,
                "qualified": bool(submission.qualified),
                "submitted_at": submission.submitted_at,
            }
            for index, submission in enumerate(module_submissions, start=1)
        ]

        verified_statuses = {
            Application.Status.QUALIFIED,
            Application.Status.WAITLISTED,
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.COMPLETED,
        }
        target_app = active_app or latest_app
        interview_passed = bool(
            target_app
            and (
                not target_app.course.requires_interview
                or (interview and interview.status == PreScreeningInterview.Status.PASSED)
            )
        )
        workflow_role_verified = bool(
            target_app and
            target_app.role_verification_status == Application.RoleVerificationStatus.VERIFIED and
            target_app.status in verified_statuses and
            (
                interview_passed or
                target_app.status in {
                    Application.Status.COHORT_ASSIGNED,
                    Application.Status.IN_PROGRESS,
                    Application.Status.COMPLETED,
                }
            )
        )
        is_direct_admin_assignment = bool(target_app and getattr(target_app, 'is_admin_assigned', False))

        # Course Progress Calculation (Strictly Modules)
        course_percentage = 0.0
        if active_app and active_app.course:
            total_modules_count = active_app.course.modules.filter(is_active=True).count()
            # We use active_course_tests_passed calculated earlier in the view
            if total_modules_count > 0:
                course_percentage = min(100.0, round((active_course_tests_passed / total_modules_count * 100), 2))

        # Time Elapsed Progress Calculation
        time_elapsed_percentage = 0.0
        if active_app:
            from django.utils import timezone
            from datetime import timedelta

            today = timezone.localdate()

            # Robust fallback logic for start_date
            start = None
            if active_app.assigned_cohort and active_app.assigned_cohort.start_date:
                start = active_app.assigned_cohort.start_date
            elif active_app.applied_at:
                start = timezone.localtime(active_app.applied_at).date()

            if start:
                # Robust fallback logic for end_date (180 days after start if not set)
                end = None
                if active_app.assigned_cohort and active_app.assigned_cohort.end_date:
                    end = active_app.assigned_cohort.end_date
                else:
                    end = start + timedelta(days=180)

                if active_app.status == Application.Status.COMPLETED:
                    time_elapsed_percentage = 100.0
                elif today < start:
                    time_elapsed_percentage = 0.0
                elif today >= end:
                    time_elapsed_percentage = 100.0
                else:
                    total_days = (end - start).days
                    passed_days = (today - start).days
                    if total_days > 0:
                        time_elapsed_percentage = round((passed_days / total_days * 100), 2)

        return Response(
            {
                "student_code": profile.student_code,
                "course_percentage": course_percentage,
                "time_elapsed_percentage": time_elapsed_percentage,
                "attendance_present": metrics["present"],
                "attendance_total": metrics["total"],
                "is_student_id_issued": profile.is_official_student,
                "student_id_issued_at": profile.student_identity_issued_at,
                "issued_student_code": profile.student_code if profile.is_official_student else None,
                "total_applications": total_apps,
                "qualified_applications": qualified_apps,
                "active_cohort": active_cohort_info,
                "cohort_start_date": active_app.assigned_cohort.start_date if active_app and active_app.assigned_cohort else None,
                "cohort_end_date": active_app.assigned_cohort.end_date if active_app and active_app.assigned_cohort else None,
                "exams_taken": exams_taken,
                "module_tests_passed": total_module_tests_passed,
                "attendance_percentage": attendance_pct,
                "application_status": latest_app.status if latest_app else None,
                "application_number": latest_app.application_number if latest_app else None,
                "application_course_title": latest_app.course.name if latest_app and latest_app.course else None,
                "assessment_track": latest_app.course.name if latest_app and latest_app.course else None,
                "applied_at": latest_app.applied_at if latest_app else None,
                "screening_status": latest_exam.status if latest_exam else None,
                "screening_scheduled_at": pre_screening.scheduled_at if pre_screening else None,
                "screening_end_time": pre_screening.end_time if pre_screening else None,
                "screening_meeting_link": pre_screening.meeting_link if pre_screening else None,
                "screening_marks_obtained": published_exam.marks_obtained if published_exam else None,
                "screening_total_marks": published_exam.total_marks if published_exam else None,
                "screening_percentage": published_exam.percentage if published_exam else None,
                "screening_grade": grade_from_percentage(published_exam.percentage) if published_exam else None,
                "screening_qualified": bool(
                    latest_exam and latest_exam.status == "EVALUATED"
                    and latest_exam.marks_obtained is not None
                    and latest_exam.qualified is True
                ),
                "interview_status": interview.status if interview else None,
                "interview_scheduled_at": interview.scheduled_at if interview else None,
                "interview_end_time": interview.end_time if interview else None,
                "interview_meeting_link": interview.meeting_link if interview else None,
                "interview_score": interview.score if interview else None,
                "interview_required": latest_app.course.requires_interview if latest_app else None,
                "student_role_verified": bool(
                    is_direct_admin_assignment or (
                        (profile.is_linkedin_connected or bool(profile.linkedin_url and profile.linkedin_url.strip())) and
                        (profile.is_github_connected or bool(profile.github_url and profile.github_url.strip()) or bool(profile.github_username and profile.github_username.strip())) and
                        workflow_role_verified
                    )
                ),
                "certificate_count": Certificate.objects.filter(student=profile).count(),
                "unread_notification_count": Notification.objects.filter(user=user, is_read=False).count(),
                "is_linkedin_connected": bool(profile.is_linkedin_connected or bool(profile.linkedin_url and profile.linkedin_url.strip())),
                "github_url": profile.github_url or (f"https://github.com/{profile.github_username}" if profile.github_username else None),
                "is_github_linked": bool(
                    profile.is_github_connected or
                    bool(profile.github_url and profile.github_url.strip()) or
                    bool(profile.github_username and profile.github_username.strip())
                ),
                "portfolio_url": profile.portfolio_url,
                "is_portfolio_linked": bool(profile.portfolio_url and profile.portfolio_url.strip()),
                "open_request_count": UserRequest.objects.filter(
                    sender=user,
                    status__in=[UserRequest.Status.PENDING, UserRequest.Status.IN_PROGRESS],
                ).count(),
                "upcoming_sessions": upcoming_sessions,
                "module_grades": module_grades,
                "journey": build_student_journey(profile, latest_app),
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="download-resume",
        authentication_classes=[JWTAuthentication, SessionAuthentication, QueryParamJWTAuthentication],
        permission_classes=[IsAuthenticated],
    )
    def download_resume(self, request, pk=None):
        profile = self.get_object()
        if not can_read_student_document(request.user, profile):
            raise PermissionDenied("You do not have permission to download this resume.")
        if not profile.resume:
            return Response({"error": "No resume file uploaded."}, status=status.HTTP_404_NOT_FOUND)

        from common.storage import private_storage
        from django.core.files.storage import default_storage
        storage = getattr(profile.resume, "storage", None)
        file_handle = None
        if storage and storage.exists(profile.resume.name):
            try:
                file_handle = profile.resume.open("rb")
            except Exception:
                file_handle = None
        if not file_handle and private_storage.exists(profile.resume.name):
            try:
                file_handle = private_storage.open(profile.resume.name, "rb")
            except Exception:
                file_handle = None
        if not file_handle and default_storage.exists(profile.resume.name):
            try:
                file_handle = default_storage.open(profile.resume.name, "rb")
            except Exception:
                file_handle = None
        if not file_handle:
            clean_base = profile.resume.name.split("/")[-1]
            alt_name = f"students/resumes/{clean_base}"
            if private_storage.exists(alt_name):
                try:
                    file_handle = private_storage.open(alt_name, "rb")
                except Exception:
                    file_handle = None
            elif default_storage.exists(alt_name):
                try:
                    file_handle = default_storage.open(alt_name, "rb")
                except Exception:
                    file_handle = None

        if not file_handle:
            return Response({"error": "Resume file not found in storage."}, status=status.HTTP_404_NOT_FOUND)

        from django.http import FileResponse
        import mimetypes
        content_type, _ = mimetypes.guess_type(profile.resume.name)
        response = FileResponse(file_handle, content_type=content_type or "application/pdf")
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
        response["Pragma"] = "no-cache"
        response["Expires"] = "0"
        response["X-Content-Type-Options"] = "nosniff"
        filename = profile.resume.name.split("/")[-1]
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response

class StudentPlacementViewSet(mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    Student Placement API:
    - Students can list, create, and update their own placements.
    - Creating/updating sets status to PENDING_VERIFICATION.
    - Cannot modify verified_by or verified_at.
    """
    serializer_class = StudentPlacementSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        if not getattr(user, 'role', None) == 'STUDENT':
            return StudentPlacement.objects.none()
        return StudentPlacement.objects.filter(student__user=user).order_by('-created_at')

    def perform_create(self, serializer):
        student_profile = getattr(self.request.user, 'student_profile', None)
        if not student_profile:
            raise PermissionDenied("You must have a student profile to submit a placement.")

        # Ensure student has at least one application with an assigned cohort
        from applications.models import Application
        has_cohort = Application.objects.filter(student=student_profile, assigned_cohort__isnull=False).exists()
        if not has_cohort:
            raise PermissionDenied("You must be assigned to a cohort before you can report a placement.")

        serializer.save(student=student_profile)

class AdminPlacementVerificationView(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Admin endpoint to list and verify/reject placements.
    """
    permission_classes = [IsAuthenticated, IsAdminUser]
    queryset = StudentPlacement.objects.all().order_by('-id')
    serializer_class = StudentPlacementSerializer

    @action(detail=True, methods=['patch'], url_path='verify')
    def verify(self, request, pk=None):
        placement = self.get_object()
        action_status = request.data.get("status")
        remarks = request.data.get("verification_remarks", "")

        if action_status not in [StudentPlacement.Status.VERIFIED, StudentPlacement.Status.REJECTED]:
            return Response({"error": "Status must be VERIFIED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils import timezone
        placement.status = action_status
        if remarks:
            placement.verification_remarks = remarks
        placement.verified_by = request.user
        placement.verified_at = timezone.now()
        placement.save()

        return Response({"message": f"Placement marked as {action_status}."})

class PublicPlacementListView(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Public endpoint to fetch verified placements for the landing page.
    """
    permission_classes = [AllowAny]
    serializer_class = StudentPlacementSerializer

    def get_queryset(self):
        return StudentPlacement.objects.filter(status='VERIFIED').order_by('-verified_at')
