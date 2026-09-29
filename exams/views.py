from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from django.utils import timezone
from django.conf import settings
from django.core import signing
from django.db import transaction
from decimal import Decimal
from django.db.models import Q
from datetime import timedelta
from urllib.parse import urlencode

from .models import (
    ExternalExamAttempt,
    Exam,
    ExamProctoringRoom,
    InternalExamAttempt,
    ModuleTest,
    ModuleTestSubmission,
    ManualExamination,
    ManualExaminationResult,
)
from .serializers import (
    ExamSerializer,
    ModuleTestSerializer,
    ModuleTestSubmissionSerializer,
    ExternalExamResultSerializer,
    ExternalModuleTestResultSerializer,
    ExamProctoringRoomSerializer,
    ManualExaminationSerializer,
    ManualExaminationResultSerializer,
)
from applications.services.workflow_service import (
    evaluate_exam_submission,
    publish_external_exam_result,
    publish_screening_result,
)
from applications.models import Application
from applications.policy import enrolled_application_for


from common.permissions import IsAdmin, IsMentorOrAdminOrReadOnly
from rest_framework.permissions import IsAuthenticated
from common.access import has_global_cohort_access
from common.models import Notification
from common.services.notifications import notify_cohort, notify_user
from .integration import verify_result_signature
from .grading import answer_matches, response_for_question
from .attempts import (
    build_attempt_blueprint,
    candidate_questions,
    ensure_module_proctoring_rooms,
    ensure_proctoring_rooms,
    module_proctoring_scope,
    normalize_candidate_responses,
    proctoring_payload,
    proctoring_scope,
    select_balanced_paper_set,
    select_balanced_module_proctoring_room,
    select_balanced_proctoring_room,
    translate_candidate_responses,
)
from .attempt_finalization import (
    finalize_internal_attempt,
    finalize_module_attempt,
    internal_result_payload,
    module_result_payload,
)
from .google_meet import sync_module_test_google_meet


EXTERNAL_LAUNCH_SALT = "suretrust.external-exam.launch"


def active_cohort_conflict(application):
    student = getattr(application, "student", None)
    if not student:
        return None
    from cohorts.models import Cohort
    active_enrollment = Application.objects.filter(
        student=student,
        assigned_cohort__isnull=False,
    ).exclude(
        status__in=[
            Application.Status.DROPPED,
            Application.Status.COMPLETED,
            Application.Status.CANCELLED,
            Application.Status.REJECTED,
        ]
    ).exclude(
        assigned_cohort__status__in=[
            Cohort.Status.COMPLETED,
            Cohort.Status.CANCELLED,
        ]
    ).select_related("course", "assigned_cohort").first()

    if active_enrollment and active_enrollment.pk != application.pk:
        message = "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one."
        return {
            "error": message,
            "message": message,
            "code": "ACTIVE_COHORT_JOURNEY",
            "active_application_id": str(active_enrollment.pk),
            "active_course_id": str(active_enrollment.course_id),
            "active_cohort_id": str(active_enrollment.assigned_cohort_id),
            "active_status": active_enrollment.status,
        }

    enrolled = enrolled_application_for(student)
    if enrolled and enrolled.pk != application.pk:
        message = "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one."
        return {
            "error": message,
            "message": message,
            "code": "ACTIVE_COHORT_JOURNEY",
            "active_application_id": str(enrolled.pk),
            "active_course_id": str(enrolled.course_id),
            "active_cohort_id": str(enrolled.assigned_cohort_id),
            "active_status": enrolled.status,
        }
    return None

class ExamViewSet(viewsets.ModelViewSet):
    queryset = Exam.objects.select_related(
        "application", "application__student", "application__student__user",
        "application__course", "application__assigned_cohort",
    ).all().order_by("-created_at")
    serializer_class = ExamSerializer

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            course_id = self.request.query_params.get("course")
            cohort_id = self.request.query_params.get("cohort")
            if course_id:
                base = base.filter(application__course_id=course_id)
            if cohort_id == "unassigned":
                base = base.filter(application__assigned_cohort__isnull=True)
            elif cohort_id:
                base = base.filter(application__assigned_cohort_id=cohort_id)
            return base
        if role == "MENTOR":
            return base.filter(
                Q(application__assigned_cohort__mentors=user)
                | Q(proctoring_rooms__assigned_proctor=user)
                | Q(internal_attempts__proctoring_room__assigned_proctor=user)
            ).distinct()
        if role in {"VOLUNTEER", "TRUSTEE"}:
            return base.filter(
                Q(proctoring_rooms__assigned_proctor=user)
                | Q(internal_attempts__proctoring_room__assigned_proctor=user)
            ).distinct()
        if role == "STUDENT":
            return base.filter(application__student__user=user)
        return base.none()


    def get_permissions(self):
        if self.action in {"external_session", "external_result"}:
            return [AllowAny()]
        if self.action in {
            "external_launch", "submit_exam", "start_internal", "autosave",
            "proctoring_rooms", "configure_proctoring", "assign_proctor",
        }:
            return [IsAuthenticated()]
        if self.action in {"create", "update", "partial_update", "destroy", "reset_exam", "sync_quiz_result", "sync_cohort_results"}:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated(), IsMentorOrAdminOrReadOnly()]

    @action(detail=True, methods=["post"], url_path="reset")
    @transaction.atomic
    def reset_exam(self, request, pk=None):
        """Reset a non-enrolled candidate's assessment with an audited workflow repair."""
        visible_exam = self.get_object()
        exam = Exam.objects.select_for_update(of=("self",)).select_related("application").get(pk=visible_exam.pk)
        application = exam.application
        enrolled_statuses = {
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
            Application.Status.COMPLETED,
            Application.Status.SUSPENDED,
            Application.Status.TRANSFER_COHORT,
        }
        if application.status in enrolled_statuses or application.assigned_cohort_id:
            return Response(
                {"error": "An enrolled cohort journey cannot be reset from exam management."},
                status=status.HTTP_409_CONFLICT,
            )

        from applications.services.state_machine import repair_application_state
        application = repair_application_state(
            application,
            Application.Status.EXAM_PENDING,
            request.user,
            request.data.get("reason", "Administrator authorized a fresh pre-screening attempt."),
        )
        application.qualified = None
        application.qualification_score = None
        application.save(update_fields=["qualified", "qualification_score", "updated_at"])

        deleted_attempts, _ = InternalExamAttempt.objects.filter(exam=exam).delete()
        ExternalExamAttempt.objects.filter(exam=exam).delete()
        exam.status = Exam.Status.PENDING
        exam.started_at = None
        exam.submitted_at = None
        exam.marks_obtained = None
        exam.percentage = None
        exam.qualified = None
        exam.save(update_fields=[
            "status", "started_at", "submitted_at", "marks_obtained",
            "percentage", "qualified", "updated_at",
        ])
        return Response({
            "message": "Exam reset successfully. The candidate can start a fresh attempt.",
            "deleted_attempts": deleted_attempts,
            "exam": ExamSerializer(exam, context={"request": request}).data,
        })

    def _is_valid_uuid(self, val):
        if not val:
            return False
        try:
            import uuid
            uuid.UUID(str(val))
            return True
        except ValueError:
            return False

    @staticmethod
    def _proctoring_question_bank(exam):
        """Resolve the immutable attempt bank, or the current open course bank."""
        from question_bank.models import QuestionBank

        attempt = exam.internal_attempts.select_related("question_bank").order_by(
            "-created_at"
        ).first()
        if attempt and attempt.question_bank_id:
            return attempt.question_bank
        schedule = getattr(exam.application, "pre_screening", None)
        if schedule and schedule.question_bank_id:
            bank = schedule.question_bank
            if (
                bank.bank_type == QuestionBank.BankType.PRESCREENING
                and bank.status == QuestionBank.Status.APPROVED
                and bank.lifecycle_status == QuestionBank.LifecycleStatus.OPEN
                and bank.is_active
                and (not exam.application or not exam.application.course_id or bank.course_id == exam.application.course_id)
            ):
                return bank
        bank = exam.question_banks.filter(
            bank_type=QuestionBank.BankType.PRESCREENING,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        ).order_by("-updated_at").first()
        if bank and (not exam.application or not exam.application.course_id or bank.course_id == exam.application.course_id):
            return bank

        cohort_id = getattr(schedule, "cohort_id", None) or getattr(exam.application, "assigned_cohort_id", None)
        if cohort_id:
            cohort_bank = exam.application.course.question_banks.filter(
                bank_type=QuestionBank.BankType.PRESCREENING,
                cohort_id=cohort_id,
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                is_active=True,
            ).order_by("-updated_at").first()
            if cohort_bank:
                return cohort_bank

        return exam.application.course.question_banks.filter(
            bank_type=QuestionBank.BankType.PRESCREENING,
            exam__isnull=True,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        ).order_by("-updated_at").first()

    def create(self, request, *args, **kwargs):
        user = request.user
        if not (user.is_superuser or getattr(user, "role", "") == "ADMIN"):
            return Response(
                {"error": "Exam creation is restricted to administrators and scheduled triggers."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        app_param = (
            data.get("application")
            or data.get("application_id")
            or data.get("app_id")
            or data.get("applicationId")
            or data.get("application_number")
        )
        if isinstance(app_param, dict):
            app_param = app_param.get("id") or app_param.get("pk")

        app_obj = None
        from applications.models import Application

        if app_param:
            if self._is_valid_uuid(app_param):
                app_obj = Application.objects.filter(id=app_param).first()
            if not app_obj:
                app_obj = Application.objects.filter(application_number__iexact=str(app_param)).first()

        if app_obj:
            data["application"] = str(app_obj.id)
            existing_exam = Exam.objects.filter(application=app_obj).first()
            if existing_exam:
                serializer = self.get_serializer(existing_exam, data=data, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        application = serializer.validated_data["application"]
        user = self.request.user
        role = getattr(user, "role", "")
        if role == "STUDENT" and application.student.user_id != user.id:
            raise PermissionDenied("You can only create or initialize an exam for your own application.")
        if application.status in {
            Application.Status.REJECTED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.COMPLETED,
        }:
            raise ValidationError({"application": "A closed application cannot receive an exam."})
        
        save_kwargs = {}
        course = application.course
        if course:
            if "total_questions" not in serializer.validated_data and hasattr(course, "exam_total_questions"):
                save_kwargs["total_questions"] = course.exam_total_questions
            if "level" not in serializer.validated_data and hasattr(course, "exam_difficulty"):
                save_kwargs["level"] = course.exam_difficulty
            if "duration_minutes" not in serializer.validated_data and hasattr(course, "exam_duration_minutes"):
                save_kwargs["duration_minutes"] = course.exam_duration_minutes
            if "pass_percentage" not in serializer.validated_data and hasattr(course, "exam_pass_percentage"):
                save_kwargs["pass_percentage"] = course.exam_pass_percentage

        exam = serializer.save(**save_kwargs)
        if application.status == Application.Status.APPLIED:
            from applications.services.state_machine import transition_application_status
            try:
                transition_application_status(
                    application,
                    Application.Status.EXAM_PENDING,
                    user=self.request.user if hasattr(self, "request") else None,
                    reason="Pre-screen exam created",
                )
            except Exception:
                pass
        notify_user(
            application.student.user,
            title="Pre-screen exam scheduled",
            message=(
                f"Your pre-screen exam for {application.course.name} is ready. "
                f"Duration: {exam.duration_minutes} minutes."
            ),
            notification_type=Notification.Type.ACTION_REQUIRED,
            action_url="application_tracker",
            dedupe_key=f"application:{application.id}:exam:{exam.id}:scheduled",
        )
        return exam

    @action(detail=False, methods=["post"], url_path="external-launch")
    def external_launch(self, request):
        """Create a short-lived ticket that launches this student's separate exam app."""
        application_id = request.data.get("application_id")
        if not application_id:
            raise ValidationError({"application_id": "Application ID is required."})
        try:
            exam = self.queryset.get(application_id=application_id)
        except Exam.DoesNotExist as exc:
            raise ValidationError({"application_id": "No exam is configured for this application."}) from exc

        user = request.user
        if getattr(user, "role", "") == "STUDENT" and exam.application.student.user_id != user.id:
            raise PermissionDenied("This examination does not belong to the authenticated student.")
        conflict = active_cohort_conflict(exam.application)
        if getattr(user, "role", "") == "STUDENT" and conflict:
            return Response(conflict, status=status.HTTP_409_CONFLICT)
        if getattr(user, "role", "") != "STUDENT" and not has_global_cohort_access(user):
            raise PermissionDenied("Only the candidate or a global administrator can launch this exam.")
        if exam.status == Exam.Status.EVALUATED:
            return Response(
                {"error": "This examination has already been evaluated."},
                status=status.HTTP_409_CONFLICT,
            )

        attempt, _ = ExternalExamAttempt.objects.get_or_create(exam=exam)
        if attempt.status == ExternalExamAttempt.Status.RESULT_RECEIVED:
            return Response(
                {"error": "The final result has already been received."},
                status=status.HTTP_409_CONFLICT,
            )
        attempt.launched_at = timezone.now()
        attempt.save(update_fields=["launched_at", "updated_at"])
        ticket = signing.dumps(
            {
                "attempt_id": str(attempt.id),
                "application_id": str(exam.application_id),
                "exam_id": str(exam.id),
                "student_id": str(exam.application.student_id),
                "nonce": str(attempt.launch_nonce),
            },
            salt=EXTERNAL_LAUNCH_SALT,
            compress=True,
        )
        launch_url = f"{settings.EXAM_PLATFORM_URL}?{urlencode({'ticket': ticket})}"
        return Response({
            "launch_url": launch_url,
            "launch_ticket": ticket,
            "expires_in_seconds": settings.EXAM_LAUNCH_TOKEN_TTL_SECONDS,
            "application_id": str(exam.application_id),
            "exam_id": str(exam.id),
            "attempt_id": str(attempt.id),
        })

    @action(detail=False, methods=["post"], url_path="external-session")
    def external_session(self, request):
        """Exchange the short-lived launch ticket for sanitized candidate/exam metadata."""
        ticket = request.data.get("launch_ticket")
        if not ticket:
            raise ValidationError({"launch_ticket": "Launch ticket is required."})
        try:
            payload = signing.loads(
                ticket,
                salt=EXTERNAL_LAUNCH_SALT,
                max_age=settings.EXAM_LAUNCH_TOKEN_TTL_SECONDS,
            )
        except signing.SignatureExpired as exc:
            raise PermissionDenied("The examination launch ticket has expired.") from exc
        except signing.BadSignature as exc:
            raise PermissionDenied("Invalid examination launch ticket.") from exc

        try:
            attempt = ExternalExamAttempt.objects.select_related(
                "exam__application__student",
                "exam__application__course",
            ).get(
                pk=payload.get("attempt_id"),
                launch_nonce=payload.get("nonce"),
                exam_id=payload.get("exam_id"),
                exam__application_id=payload.get("application_id"),
            )
        except ExternalExamAttempt.DoesNotExist as exc:
            raise PermissionDenied("The examination attempt does not match this launch ticket.") from exc
        if attempt.status == ExternalExamAttempt.Status.RESULT_RECEIVED:
            return Response(
                {"error": "This examination attempt is already complete."},
                status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        if attempt.started_at is None:
            attempt.started_at = now
            attempt.expires_at = now + timedelta(minutes=attempt.exam.duration_minutes)
            attempt.status = ExternalExamAttempt.Status.IN_PROGRESS
            attempt.save(update_fields=["started_at", "expires_at", "status", "updated_at"])
            attempt.exam.status = Exam.Status.IN_PROGRESS
            attempt.exam.started_at = now
            attempt.exam.save(update_fields=["status", "started_at", "updated_at"])

        application = attempt.exam.application
        return Response({
            "attempt_id": str(attempt.id),
            "application_id": str(application.id),
            "application_number": application.application_number,
            "exam_id": str(attempt.exam_id),
            "student_code": application.student.student_code,
            "course_code": application.course.code,
            "course_name": application.course.name,
            "duration_minutes": attempt.exam.duration_minutes,
            "pass_percentage": attempt.exam.pass_percentage,
            "started_at": attempt.started_at,
            "expires_at": attempt.expires_at,
            "result_callback": "/api/exams/external-result/",
        })

    @action(detail=False, methods=["post"], url_path="external-result")
    def external_result(self, request):
        """Receive marks only from the HMAC-authenticated examination backend."""
        event_id, payload_hash = verify_result_signature(request)
        serializer = ExternalExamResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            try:
                attempt = ExternalExamAttempt.objects.select_for_update(of=("self",)).select_related(
                    "exam__application__student__user",
                    "exam__application__course",
                ).get(pk=data["attempt_id"])
            except ExternalExamAttempt.DoesNotExist as exc:
                raise ValidationError({"attempt_id": "Unknown examination attempt."}) from exc

            if (
                attempt.exam_id != data["exam_id"]
                or attempt.exam.application_id != data["application_id"]
            ):
                raise ValidationError(
                    {"attempt_id": "Attempt, exam, and application identifiers do not match."}
                )
            if attempt.result_event_id:
                if attempt.result_event_id == event_id and attempt.result_payload_hash == payload_hash:
                    exam = attempt.exam
                    return Response(self._external_result_payload(exam, attempt))
                return Response(
                    {"error": "A different final result has already been published."},
                    status=status.HTTP_409_CONFLICT,
                )
            if attempt.status != ExternalExamAttempt.Status.IN_PROGRESS:
                return Response(
                    {"error": "Exchange the launch ticket before publishing a result."},
                    status=status.HTTP_409_CONFLICT,
                )
            submitted_at = data.get("submitted_at") or timezone.now()
            allowed_delay = timedelta(seconds=settings.EXAM_RESULT_MAX_CLOCK_SKEW_SECONDS)
            if attempt.expires_at and submitted_at > attempt.expires_at + allowed_delay:
                raise ValidationError({"submitted_at": "The examination attempt expired before submission."})
            if attempt.started_at and submitted_at < attempt.started_at - allowed_delay:
                raise ValidationError({"submitted_at": "Submission time is before the attempt started."})

            exam = publish_external_exam_result(
                attempt.exam,
                marks_obtained=data["marks_obtained"],
                total_marks=data["total_marks"],
                submitted_at=submitted_at,
                integrity_status=data["integrity_status"],
                proctoring_summary=data.get("proctoring_summary", {}),
            )
            attempt.status = ExternalExamAttempt.Status.RESULT_RECEIVED
            attempt.result_received_at = timezone.now()
            attempt.result_event_id = event_id
            attempt.result_payload_hash = payload_hash
            attempt.integrity_status = data["integrity_status"]
            attempt.proctoring_summary = data.get("proctoring_summary", {})
            attempt.save(update_fields=[
                "status", "result_received_at", "result_event_id",
                "result_payload_hash", "integrity_status", "proctoring_summary", "updated_at",
            ])
        return Response(self._external_result_payload(exam, attempt))

    @staticmethod
    def _external_result_payload(exam, attempt):
        return {
            "message": "Final examination result published successfully.",
            "attempt_id": str(attempt.id),
            "application_id": str(exam.application_id),
            "exam_id": str(exam.id),
            "marks_obtained": exam.marks_obtained,
            "total_marks": exam.total_marks,
            "percentage": exam.percentage,
            "qualified": exam.qualified,
            "application_status": exam.application.status,
            "integrity_status": attempt.integrity_status,
            "submitted_at": exam.submitted_at,
        }


    @action(detail=True, methods=["post"], url_path="start-internal")
    @transaction.atomic
    def start_internal(self, request, pk=None):
        from question_bank.models import QuestionBank

        if not settings.ALLOW_INTERNAL_EXAM_SUBMISSION:
            raise PermissionDenied("Internal exam submission is disabled.")

        visible_exam = self.get_object()
        if getattr(request.user, "role", "") != "STUDENT" or visible_exam.application.student.user_id != request.user.id:
            raise PermissionDenied("Only the assigned candidate can start this exam.")
        conflict = active_cohort_conflict(visible_exam.application)
        if conflict:
            return Response(conflict, status=status.HTTP_409_CONFLICT)
        exam = Exam.objects.select_for_update(of=("self",)).select_related(
            "application__student__user", "application__course"
        ).get(pk=visible_exam.pk)

        schedule = getattr(exam.application, "pre_screening", None)

        # Guard: Scheduled time window and early admin start check
        now = timezone.now()
        if schedule:
            if not schedule.is_released and schedule.admin_started_at:
                attempt_exists = InternalExamAttempt.objects.filter(exam=exam).exists()
                if not attempt_exists:
                    from applications.services.workflow_service import disqualify_for_missed_screening
                    disqualify_for_missed_screening(schedule)
                return Response(
                    {
                        "error": "The exam window has closed.",
                        "message": "The exam window has closed.",
                        "code": "EXAM_WINDOW_CLOSED_DISQUALIFIED",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            is_active = bool(schedule.admin_started_at)
            if not is_active:
                if schedule.scheduled_at and now >= schedule.scheduled_at:
                    return Response(
                        {
                            "error": "The meeting time has arrived, but the administrator has not started the exam yet.",
                            "code": "ADMIN_NOT_STARTED",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                else:
                    scheduled_str = schedule.scheduled_at.isoformat() if schedule.scheduled_at else "soon"
                    return Response(
                        {
                            "error": f"The exam window has not opened yet. It is scheduled to start at {scheduled_str}.",
                            "code": "EXAM_NOT_STARTED",
                            "scheduled_at": scheduled_str,
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        qbank = schedule.question_bank if schedule and schedule.question_bank_id else None
        # Safety check: if schedule's question bank belongs to a different course than student's application course, reject it
        if qbank and exam.application and exam.application.course_id and qbank.course_id and qbank.course_id != exam.application.course_id:
            qbank = None

        # Legacy schedules fall back to an explicitly linked paper, then cohort-level, then latest course-wide open paper.
        if not qbank:
            qbank = exam.question_banks.filter(
                bank_type=QuestionBank.BankType.PRESCREENING,
                is_active=True,
                status=QuestionBank.Status.APPROVED,
            ).order_by("-updated_at").first()
            if qbank and exam.application and exam.application.course_id and qbank.course_id and qbank.course_id != exam.application.course_id:
                qbank = None

        if not qbank:
            cohort_id = getattr(schedule, "cohort_id", None) or getattr(exam.application, "assigned_cohort_id", None)
            if cohort_id:
                qbank = exam.application.course.question_banks.filter(
                    bank_type=QuestionBank.BankType.PRESCREENING,
                    cohort_id=cohort_id,
                    is_active=True,
                    status=QuestionBank.Status.APPROVED,
                    lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                ).order_by("-updated_at").first()

        if not qbank:
            qbank = exam.application.course.question_banks.filter(
                bank_type=QuestionBank.BankType.PRESCREENING,
                exam__isnull=True,
                is_active=True,
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            ).order_by("-updated_at").first()

        if not qbank:
            return Response(
                {"error": "No approved and open pre-screening question bank is assigned to this exam."},
                status=status.HTTP_409_CONFLICT,
            )
        if qbank.lifecycle_status != QuestionBank.LifecycleStatus.OPEN:
            return Response(
                {"error": "This examination question bank is not currently open."},
                status=status.HTTP_403_FORBIDDEN,
            )
        qbank = QuestionBank.objects.select_for_update().get(pk=qbank.pk)

        if exam.status in [Exam.Status.SUBMITTED, Exam.Status.EVALUATED]:
            return Response({"error": "Exam already submitted."}, status=status.HTTP_409_CONFLICT)

        student_profile = exam.application.student
        
        attempt = InternalExamAttempt.objects.select_for_update().filter(
            student=student_profile,
            exam=exam,
        ).order_by("-created_at").first()
        
        if attempt:
            if attempt.status != InternalExamAttempt.Status.IN_PROGRESS:
                return Response({"error": f"Attempt is {attempt.status}."}, status=status.HTTP_409_CONFLICT)
            
            # The server deadline is authoritative. Grade only answers that were
            # already autosaved; never accept answers delivered after expiry.
            if timezone.now() > attempt.expires_at:
                try:
                    evaluated_exam = finalize_internal_attempt(attempt, auto_submitted=True)
                except ValueError as exc:
                    return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
                return Response(
                    {
                        "error": "Time expired; the last server-saved answers were submitted.",
                        "code": "EXAM_AUTO_SUBMITTED",
                        "result": internal_result_payload(evaluated_exam, auto_submitted=True),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if not attempt.question_bank_id or not attempt.question_snapshot:
                return Response(
                    {"error": "This legacy attempt has no immutable paper snapshot. Ask an administrator to reset it."},
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            now = timezone.now()
            expires_at = now + timedelta(minutes=exam.duration_minutes)
            try:
                scheduled_set = (getattr(schedule, "paper_set", "") or "").upper()
                if scheduled_set:
                    if scheduled_set not in qbank.set_codes:
                        raise ValueError("The paper assigned in the screening schedule no longer exists.")
                    set_code = scheduled_set
                else:
                    set_code = select_balanced_paper_set(
                        qbank,
                        InternalExamAttempt,
                        student_id=student_profile.pk,
                        assessment_id=exam.pk,
                    )
                snapshot, question_mapping, option_mapping = build_attempt_blueprint(
                    qbank, set_code, total_questions=exam.total_questions
                )
                room = select_balanced_proctoring_room(
                    exam,
                    qbank,
                    student_id=student_profile.pk,
                )
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)

            attempt = InternalExamAttempt.objects.create(
                student=student_profile,
                exam=exam,
                start_time=now,
                expires_at=expires_at,
                status=InternalExamAttempt.Status.IN_PROGRESS,
                question_bank=qbank,
                paper_set=set_code,
                question_snapshot=snapshot,
                question_mapping=question_mapping,
                option_mapping=option_mapping,
                answers={"responses": {}},
                proctoring_room=room,
                proctoring_status=("PENDING" if room else "NOT_REQUIRED"),
            )
            
            exam.status = Exam.Status.IN_PROGRESS
            exam.started_at = now
            exam.save(update_fields=["status", "started_at"])

        try:
            sanitized_questions = candidate_questions(
                attempt.question_snapshot,
                attempt.question_mapping,
                attempt.option_mapping,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)

        candidate_user = exam.application.student.user
        display_name = candidate_user.get_full_name().strip() or candidate_user.email

        return Response({
            "attempt_id": str(attempt.id),
            "exam_id": str(exam.id),
            "start_time": attempt.start_time,
            "expires_at": attempt.expires_at,
            "duration_minutes": exam.duration_minutes,
            "questions": sanitized_questions,
            "saved_answers": attempt.answers.get("responses", {}),
            "paper_code": attempt.paper_set,
            "paper_label": f"Paper {attempt.paper_set}",
            "proctoring": proctoring_payload(attempt, display_name),
        })

    @action(detail=True, methods=["post"], url_path="autosave")
    @transaction.atomic
    def autosave(self, request, pk=None):
        from exams.models import ExamSecurityEvent

        if not settings.ALLOW_INTERNAL_EXAM_SUBMISSION:
            raise PermissionDenied("Internal exam submission is disabled.")

        exam = self.get_object()
        if (
            getattr(request.user, "role", "") != "STUDENT"
            or exam.application.student.user_id != request.user.id
        ):
            raise PermissionDenied("Only the candidate assigned to this exam can autosave it.")
        student_profile = exam.application.student

        attempt = InternalExamAttempt.objects.select_for_update().filter(
            student=student_profile, 
            exam=exam, 
            status=InternalExamAttempt.Status.IN_PROGRESS
        ).first()

        if not attempt:
            return Response({"error": "No active attempt found."}, status=status.HTTP_404_NOT_FOUND)
        requested_attempt_id = request.data.get("attempt_id")
        if requested_attempt_id and str(requested_attempt_id) != str(attempt.id):
            raise ValidationError({"attempt_id": "Attempt does not belong to this exam session."})

        if timezone.now() > attempt.expires_at:
            try:
                evaluated_exam = finalize_internal_attempt(attempt, auto_submitted=True)
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
            return Response(
                {
                    "error": "Time expired; the last server-saved answers were submitted.",
                    "code": "EXAM_AUTO_SUBMITTED",
                    "result": internal_result_payload(evaluated_exam, auto_submitted=True),
                },
                status=status.HTTP_409_CONFLICT,
            )

        answers = request.data.get("answers", {})
        security_events = request.data.get("security_events", [])

        try:
            normalized_answers = normalize_candidate_responses(attempt, answers)
        except ValueError as exc:
            raise ValidationError({"answers": str(exc)}) from exc

        if "answers" in request.data:
            attempt.answers = {"responses": normalized_answers}

        if security_events:
            if not isinstance(security_events, list) or len(security_events) > 50:
                raise ValidationError({"security_events": "Send at most 50 security events per autosave."})
            events_to_create = []
            for ev in security_events:
                if not isinstance(ev, dict):
                    continue
                event_type = str(ev.get("type", "UNKNOWN")).strip().upper()[:50] or "UNKNOWN"
                events_to_create.append(ExamSecurityEvent(
                    attempt=attempt,
                    event_type=event_type,
                ))
                if event_type == "JITSI_JOINED":
                    attempt.proctoring_status = "CONNECTED"
                    attempt.proctoring_connected_at = attempt.proctoring_connected_at or timezone.now()
                elif event_type in {"JITSI_LEFT", "JITSI_DISCONNECTED"}:
                    attempt.proctoring_status = "DISCONNECTED"
                elif event_type == "JITSI_ERROR":
                    attempt.proctoring_status = "FAILED"
            if events_to_create:
                ExamSecurityEvent.objects.bulk_create(events_to_create)

        attempt.save(update_fields=[
            "answers", "proctoring_status", "proctoring_connected_at", "updated_at"
        ])

        return Response({
            "message": "Autosaved successfully.",
            "attempt_id": str(attempt.id),
            "saved_answers": (attempt.answers or {}).get("responses", {}),
            "expires_at": attempt.expires_at,
            "proctoring_status": attempt.proctoring_status,
        })

    @action(detail=True, methods=["post"], url_path="submit")
    def submit_exam(self, request, pk=None):
        if not settings.ALLOW_INTERNAL_EXAM_SUBMISSION:
            return Response(
                {
                    "error": (
                        "Answer submission is handled by the separate examination platform. "
                        "Only its signed final-result callback is accepted."
                    ),
                    "code": "EXTERNAL_EXAM_PLATFORM_REQUIRED",
                },
                status=status.HTTP_410_GONE,
            )
            
        exam = self.get_object()
        if getattr(request.user, "role", "") != "STUDENT" or exam.application.student.user_id != request.user.id:
            raise PermissionDenied("Only the candidate assigned to this exam can submit it.")
            
        if exam.status == Exam.Status.EVALUATED:
            auto_attempt = exam.internal_attempts.filter(
                security_events__event_type="TIME_EXPIRED_AUTO_SUBMIT"
            ).first()
            if auto_attempt:
                payload = internal_result_payload(exam, auto_submitted=True)
                payload["already_submitted"] = True
                return Response(payload, status=status.HTTP_200_OK)
            return Response(
                {"error": "This exam has already been submitted and evaluated."},
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            exam = Exam.objects.select_for_update(of=("self",)).select_related(
                "application__student", "application__course", "application__pre_screening"
            ).get(pk=exam.pk)

            schedule = getattr(exam.application, "pre_screening", None)
            if schedule and not schedule.is_released and schedule.admin_started_at:
                return Response(
                    {
                        "error": "The screening session was ended by the administrator before you could submit.",
                        "code": "EXAM_WINDOW_CLOSED_DISQUALIFIED"
                    },
                    status=status.HTTP_403_FORBIDDEN
                )
            if exam.status == Exam.Status.EVALUATED:
                auto_attempt = exam.internal_attempts.filter(
                    security_events__event_type="TIME_EXPIRED_AUTO_SUBMIT"
                ).first()
                if auto_attempt:
                    payload = internal_result_payload(exam, auto_submitted=True)
                    payload["already_submitted"] = True
                    return Response(payload, status=status.HTTP_200_OK)
                return Response(
                    {"error": "This exam has already been submitted and evaluated."},
                    status=status.HTTP_409_CONFLICT,
                )
            attempt = InternalExamAttempt.objects.select_for_update().filter(
                student=exam.application.student, 
                exam=exam, 
            ).order_by("-created_at").first()
            
            if attempt and attempt.status == InternalExamAttempt.Status.EXPIRED:
                return Response({"error": "Attempt expired."}, status=status.HTTP_404_NOT_FOUND)
            if attempt and attempt.status == InternalExamAttempt.Status.SUBMITTED:
                return Response({"error": "Attempt already submitted."}, status=status.HTTP_409_CONFLICT)

            if not attempt:
                return Response(
                    {"error": "Start the exam before submitting answers."},
                    status=status.HTTP_409_CONFLICT,
                )
            if attempt.status != InternalExamAttempt.Status.IN_PROGRESS:
                return Response(
                    {"error": f"Attempt is {attempt.status}."},
                    status=status.HTTP_409_CONFLICT,
                )
            requested_attempt_id = request.data.get("attempt_id")
            if requested_attempt_id and str(requested_attempt_id) != str(attempt.id):
                raise ValidationError({"attempt_id": "Attempt does not belong to this exam session."})

            final_security_events = request.data.get("security_events", [])
            if final_security_events:
                from exams.models import ExamSecurityEvent

                if not isinstance(final_security_events, list) or len(final_security_events) > 50:
                    raise ValidationError({"security_events": "Send at most 50 final security events."})
                ExamSecurityEvent.objects.bulk_create([
                    ExamSecurityEvent(
                        attempt=attempt,
                        event_type=str(event.get("type", "UNKNOWN")).strip().upper()[:50] or "UNKNOWN",
                    )
                    for event in final_security_events
                    if isinstance(event, dict)
                ])
                
            now = timezone.now()
            # Verify expiry (allow a 5-second network grace period only)
            if now > attempt.expires_at + timedelta(seconds=5):
                try:
                    evaluated_exam = finalize_internal_attempt(attempt, auto_submitted=True)
                except ValueError as exc:
                    return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
                return Response(
                    internal_result_payload(evaluated_exam, auto_submitted=True),
                    status=status.HTTP_200_OK,
                )

            if not attempt.question_bank_id or not attempt.question_snapshot:
                return Response(
                    {"error": "The attempt has no immutable server-side question snapshot."},
                    status=status.HTTP_409_CONFLICT,
                )

            final_answers = request.data.get("answers", {})
            if isinstance(final_answers, dict) and "responses" in final_answers:
                final_answers = final_answers["responses"]
            current_responses = dict((attempt.answers or {}).get("responses", {}))
            try:
                normalized_final = normalize_candidate_responses(attempt, final_answers)
                current_responses.update(normalized_final)
                normalized_responses, translated_responses = translate_candidate_responses(
                    attempt, current_responses
                )
            except ValueError as exc:
                raise ValidationError({"answers": str(exc)}) from exc

            attempt.answers = {"responses": normalized_responses}
            
            attempt.status = InternalExamAttempt.Status.SUBMITTED
            attempt.submission_time = now
            attempt.save(update_fields=["status", "submission_time", "answers", "updated_at"])
            
            evaluated_exam = evaluate_exam_submission(
                exam,
                {"responses": translated_responses},
                question_snapshot=attempt.question_snapshot,
            )
            
        return Response(
            {
                "message": "Exam submitted and evaluated successfully.",
                "qualified": evaluated_exam.qualified,
                "passed": bool(evaluated_exam.qualified),
                "score": int(evaluated_exam.percentage or 0),
                "feedback": "Qualified" if evaluated_exam.qualified else "Not qualified",
                "percentage": evaluated_exam.percentage,
                "marks_obtained": evaluated_exam.marks_obtained,
                "total_marks": evaluated_exam.total_marks,
                "exam": ExamSerializer(evaluated_exam).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="configure-proctoring")
    @transaction.atomic
    def configure_proctoring(self, request, pk=None):
        user = request.user
        if not (user.is_superuser or getattr(user, "role", "") == "ADMIN"):
            raise PermissionDenied("Only an administrator can configure exam proctoring rooms.")
        visible_exam = self.get_object()
        exam = Exam.objects.select_for_update().get(pk=visible_exam.pk)
        question_bank = self._proctoring_question_bank(exam)
        serializer = ExamSerializer(
            exam,
            data={
                key: request.data[key]
                for key in [
                    "proctoring_enabled",
                    "proctoring_required",
                    "proctoring_room_count",
                    "proctoring_capacity_per_room",
                ]
                if key in request.data
            },
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        will_enable = serializer.validated_data.get(
            "proctoring_enabled", exam.proctoring_enabled
        )
        if will_enable and not question_bank:
            return Response(
                {"error": "Open an approved pre-screening question bank before configuring proctoring."},
                status=status.HTTP_409_CONFLICT,
            )
        if question_bank:
            question_bank = question_bank.__class__.objects.select_for_update().get(
                pk=question_bank.pk
            )
        exam = serializer.save()
        if exam.proctoring_enabled:
            ensure_proctoring_rooms(exam, question_bank, reconfigure=True)
        elif question_bank:
            scope_key, _ = proctoring_scope(exam, question_bank)
            ExamProctoringRoom.objects.filter(scope_key=scope_key).update(is_active=False)
        return Response(ExamSerializer(exam, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="assign-proctor")
    @transaction.atomic
    def assign_proctor(self, request, pk=None):
        from accounts.models import User

        user = request.user
        if not (user.is_superuser or getattr(user, "role", "") == "ADMIN"):
            raise PermissionDenied("Only an administrator can assign proctors.")
        exam = Exam.objects.select_for_update().get(pk=self.get_object().pk)
        question_bank = self._proctoring_question_bank(exam)
        if not question_bank:
            return Response(
                {"error": "No question-bank proctoring session exists for this exam."},
                status=status.HTTP_409_CONFLICT,
            )
        scope_key, _ = proctoring_scope(exam, question_bank)
        room_id = request.data.get("room_id")
        proctor_id = request.data.get("proctor_id")
        if not room_id:
            raise ValidationError({"room_id": "Room ID is required."})
        try:
            room = ExamProctoringRoom.objects.select_for_update().get(
                pk=room_id,
                scope_key=scope_key,
                is_active=True,
            )
        except ExamProctoringRoom.DoesNotExist as exc:
            raise ValidationError({"room_id": "Active proctoring room not found for this exam."}) from exc
        if proctor_id:
            try:
                proctor = User.objects.get(pk=proctor_id, role__in=[
                    User.Role.ADMIN, User.Role.MENTOR, User.Role.VOLUNTEER, User.Role.TRUSTEE,
                ])
            except User.DoesNotExist as exc:
                raise ValidationError({"proctor_id": "Select an eligible staff proctor."}) from exc
        else:
            proctor = None
        room.assigned_proctor = proctor
        room.save(update_fields=["assigned_proctor", "updated_at"])
        return Response(ExamProctoringRoomSerializer(room).data)

    @action(detail=True, methods=["get"], url_path="proctoring-rooms")
    def proctoring_rooms(self, request, pk=None):
        exam = self.get_object()
        question_bank = self._proctoring_question_bank(exam)
        if not question_bank:
            return Response(
                {"error": "No question-bank proctoring session exists for this exam."},
                status=status.HTTP_409_CONFLICT,
            )
        scope_key, session_date = proctoring_scope(exam, question_bank)
        actual_admin = request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"
        rooms = ExamProctoringRoom.objects.filter(
            scope_key=scope_key,
            is_active=True,
        ).select_related("assigned_proctor")
        if not actual_admin and not has_global_cohort_access(request.user):
            assigned = rooms.filter(assigned_proctor=request.user)
            is_cohort_mentor = bool(
                getattr(request.user, "role", "") == "MENTOR"
                and exam.application.assigned_cohort_id
                and exam.application.assigned_cohort.mentors.filter(pk=request.user.pk).exists()
            )
            if not assigned.exists() and not is_cohort_mentor:
                raise PermissionDenied("You are not assigned to proctor this exam.")
            if not is_cohort_mentor:
                rooms = assigned
        domain = str(getattr(settings, "JITSI_DOMAIN", "meet.jit.si")).strip()
        domain = domain.removeprefix("https://").removeprefix("http://").rstrip("/")
        return Response({
            "exam_id": str(exam.id),
            "application_number": exam.application.application_number,
            "course_name": exam.application.course.name,
            "session_date": session_date,
            "provider": "GOOGLE_MEET",
            "domain": domain,
            "rooms": ExamProctoringRoomSerializer(rooms, many=True).data,
        })

    @action(detail=False, methods=["get"], url_path="live-proctor-stream")
    def live_proctor_stream(self, request):
        user = request.user
        if not (user.is_superuser or getattr(user, "role", "") in ["ADMIN", "MENTOR", "VOLUNTEER", "TRUSTEE"]):
            raise PermissionDenied("Only proctors, mentors, and administrators can access live proctor telemetry.")

        from exams.models import ExamSecurityEvent, InternalExamAttempt

        now = timezone.now()
        active_attempts = InternalExamAttempt.objects.filter(
            status__in=[InternalExamAttempt.Status.IN_PROGRESS, InternalExamAttempt.Status.SUBMITTED]
        ).select_related(
            "student",
            "student__user",
            "exam",
            "exam__application",
            "exam__application__course",
        ).order_by("-updated_at")[:60]

        attempt_ids = [a.id for a in active_attempts]
        events = ExamSecurityEvent.objects.filter(
            attempt_id__in=attempt_ids
        ).select_related("attempt", "attempt__student", "attempt__student__user").order_by("-timestamp")[:100]

        attempts_payload = []
        for att in active_attempts:
            cand_name = att.student.user.get_full_name() or att.student.user.username
            attempts_payload.append({
                "attempt_id": str(att.id),
                "exam_id": str(att.exam_id),
                "student_code": att.student.student_code,
                "student_name": cand_name,
                "student_email": att.student.user.email,
                "course_name": att.exam.application.course.name if att.exam.application else "General",
                "status": att.status,
                "cheat_count": att.cheat_count,
                "started_at": att.created_at,
                "expires_at": att.expires_at,
                "is_expired": now > att.expires_at if att.expires_at else False,
            })

        events_payload = []
        for ev in events:
            cand_name = ev.attempt.student.user.get_full_name() or ev.attempt.student.user.username
            events_payload.append({
                "event_id": str(ev.id),
                "attempt_id": str(ev.attempt_id),
                "student_code": ev.attempt.student.student_code,
                "student_name": cand_name,
                "event_type": ev.event_type,
                "timestamp": ev.timestamp,
                "cheat_count": ev.attempt.cheat_count,
            })

        return Response({
            "timestamp": now,
            "active_attempts": attempts_payload,
            "recent_events": events_payload,
            "total_active": len(attempts_payload),
        })

    @action(detail=True, methods=["post"], url_path="disqualify-attempt")
    @transaction.atomic
    def disqualify_attempt(self, request, pk=None):
        user = request.user
        if not (user.is_superuser or getattr(user, "role", "") in ["ADMIN", "MENTOR"]):
            raise PermissionDenied("Only proctors and administrators can disqualify candidate attempts.")

        exam = self.get_object()
        from exams.models import InternalExamAttempt, ExamSecurityEvent
        attempt = InternalExamAttempt.objects.select_for_update().filter(exam=exam).first()
        if not attempt:
            return Response({"error": "No attempt found for this exam."}, status=status.HTTP_404_NOT_FOUND)

        attempt.cheat_count = 5
        attempt.status = InternalExamAttempt.Status.EVALUATED
        attempt.save(update_fields=["cheat_count", "status", "updated_at"])

        ExamSecurityEvent.objects.create(
            attempt=attempt,
            event_type="DISQUALIFIED_BY_PROCTOR",
        )

        exam.status = Exam.Status.EVALUATED
        exam.cheat_count = 5
        exam.marks_obtained = Decimal("0.0")
        exam.passed = False
        exam.save(update_fields=["status", "cheat_count", "marks_obtained", "passed", "updated_at"])

        return Response({
            "message": "Candidate has been disqualified and exam attempt terminated.",
            "exam_id": str(exam.id),
            "status": "DISQUALIFIED",
        })

    @action(detail=False, methods=["post"], url_path="sync-quiz-result")
    @transaction.atomic
    def sync_quiz_result(self, request):
        """Re-evaluate a single exam record and update its application status."""
        exam_id = request.data.get("exam_id")
        if not exam_id:
            return Response({"error": "exam_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exam = Exam.objects.select_related(
                "application", "application__student", "application__student__user",
                "application__course",
            ).get(pk=exam_id)
        except Exam.DoesNotExist:
            return Response({"error": "Exam not found."}, status=status.HTTP_404_NOT_FOUND)

        if not exam.answers:
            return Response({"error": "Exam has no submitted answers to evaluate."}, status=status.HTTP_400_BAD_REQUEST)

        # Find the question snapshot from the latest internal attempt if available
        question_snapshot = None
        latest_attempt = exam.internal_attempts.order_by("-created_at").first()
        if latest_attempt and latest_attempt.question_snapshot:
            question_snapshot = latest_attempt.question_snapshot

        try:
            evaluate_exam_submission(exam, exam.answers, question_snapshot=question_snapshot)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "message": f"Exam re-evaluated successfully.",
            "exam_id": str(exam.id),
            "marks_obtained": str(exam.marks_obtained),
            "total_marks": str(exam.total_marks),
            "percentage": str(exam.percentage),
            "qualified": exam.qualified,
            "status": exam.status,
        })

    @action(detail=False, methods=["post"], url_path="sync-cohort-results")
    @transaction.atomic
    def sync_cohort_results(self, request):
        """Re-evaluate all exam records for a given cohort and update application statuses."""
        from django.db.models import Q
        cohort_id = request.data.get("cohort_id")
        if not cohort_id:
            return Response({"error": "cohort_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        exams = Exam.objects.select_related(
            "application", "application__student", "application__student__user",
            "application__course",
        ).filter(
            Q(application__assigned_cohort_id=cohort_id) | Q(application__pre_screening__cohort_id=cohort_id)
        ).distinct()

        candidate_exams = []
        for ex in exams:
            if ex.answers and ex.answers != {} and ex.answers != {"responses": {}}:
                candidate_exams.append(ex)
            else:
                att = ex.internal_attempts.order_by("-created_at").first()
                if att and att.answers and att.answers != {} and att.answers != {"responses": {}}:
                    ex.answers = att.answers
                    ex.save(update_fields=["answers"])
                    candidate_exams.append(ex)

        if not candidate_exams:
            return Response({
                "message": "No submitted candidate exam records found to evaluate for this cohort yet.",
                "synced": 0,
                "updated": 0,
            }, status=status.HTTP_200_OK)

        synced = 0
        errors = []
        for exam in candidate_exams:
            try:
                question_snapshot = None
                latest_attempt = exam.internal_attempts.order_by("-created_at").first()
                if latest_attempt and latest_attempt.question_snapshot:
                    question_snapshot = latest_attempt.question_snapshot

                evaluate_exam_submission(exam, exam.answers, question_snapshot=question_snapshot)
                synced += 1
            except Exception as e:
                errors.append({"exam_id": str(exam.id), "error": str(e)})

        return Response({
            "message": f"Successfully re-evaluated {synced} exam(s).",
            "synced": synced,
            "updated": synced,
            "errors": errors,
            "total_attempted": len(candidate_exams),
        })

class ManualExaminationViewSet(viewsets.ModelViewSet):
    queryset = ManualExamination.objects.select_related("course", "cohort").prefetch_related(
        "results__application__student__user"
    )
    serializer_class = ManualExaminationSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    def perform_create(self, serializer):
        examination = serializer.save()
        applications = Application.objects.filter(
            course=examination.course,
            assigned_cohort=examination.cohort,
            status__in=[
                Application.Status.APPLIED,
                Application.Status.EXAM_PENDING,
                Application.Status.PRESCREENING_PENDING,
                Application.Status.PRESCREENING_COMPLETED,
                Application.Status.EXAM_COMPLETED,
            ],
        )
        ManualExaminationResult.objects.bulk_create([
            ManualExaminationResult(
                examination=examination,
                application=application,
                marks_obtained=Decimal("0"),
                qualified=False,
            )
            for application in applications
        ])
        if applications.exists():
            examination.status = ManualExamination.Status.IN_PROGRESS
            examination.save(update_fields=["status", "updated_at"])

    @action(detail=True, methods=["post"], url_path="add-candidates")
    @transaction.atomic
    def add_candidates(self, request, pk=None):
        examination = self.get_object()
        application_ids = request.data.get("application_ids", [])
        applications = Application.objects.filter(
            id__in=application_ids,
            course=examination.course,
            assigned_cohort=examination.cohort,
            status__in=[
                Application.Status.APPLIED,
                Application.Status.EXAM_PENDING,
                Application.Status.PRESCREENING_PENDING,
                Application.Status.PRESCREENING_COMPLETED,
                Application.Status.EXAM_COMPLETED,
            ],
        )
        for application in applications:
            ManualExaminationResult.objects.get_or_create(
                examination=examination,
                application=application,
                defaults={"marks_obtained": Decimal("0"), "qualified": False},
            )
        if examination.status == ManualExamination.Status.DRAFT:
            examination.status = ManualExamination.Status.IN_PROGRESS
            examination.save(update_fields=["status", "updated_at"])
        examination = self.get_queryset().get(pk=examination.pk)
        return Response(ManualExaminationSerializer(examination, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["patch"], url_path="results/(?P<result_id>[^/.]+)")
    @transaction.atomic
    def update_result(self, request, pk=None, result_id=None):
        examination = self.get_object()
        result = ManualExaminationResult.objects.select_for_update().select_related("application").get(
            pk=result_id, examination=examination
        )
        marks = request.data.get("marks_obtained", result.marks_obtained)
        if marks is not None:
            marks = Decimal(str(marks))
            maximum = result.examination.maximum_marks or Decimal("100")
            if marks < 0 or marks > maximum:
                return Response({"error": f"Marks must be between 0 and {maximum}."}, status=status.HTTP_400_BAD_REQUEST)
            expected_qualified = (marks / maximum) * Decimal("100") >= result.examination.pass_percentage
            requested_qualified = request.data.get("qualified")
            if isinstance(requested_qualified, str):
                requested_qualified = requested_qualified.lower() == "true"
            if requested_qualified is not None and bool(requested_qualified) != expected_qualified:
                return Response(
                    {"error": f"This mark is {('below' if not expected_qualified else 'at or above')} the {result.examination.pass_percentage}% pass threshold. Choose the matching result."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            result.marks_obtained = marks
            result.qualified = expected_qualified
        elif "qualified" in request.data and request.data.get("qualified") is not None:
            return Response({"error": "Enter marks before choosing Pass or Fail."}, status=status.HTTP_400_BAD_REQUEST)
        result.save(update_fields=["marks_obtained", "qualified", "updated_at"])
        if result.completed:
            self._sync_candidate(result, request.user)
        return Response(ManualExaminationResultSerializer(result, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="mark-screening-done")
    @transaction.atomic
    def mark_screening_done(self, request, pk=None):
        examination = self.get_object()
        results = list(ManualExaminationResult.objects.select_for_update().filter(examination=examination))
        if not results:
            return Response({"error": "Select at least one candidate before completing the examination."}, status=status.HTTP_400_BAD_REQUEST)
        for result in results:
            if result.marks_obtained is None:
                return Response({"error": "Enter marks for every selected candidate before completing the examination."}, status=status.HTTP_400_BAD_REQUEST)
            result.completed = True
            result.save(update_fields=["completed", "updated_at"])
            self._sync_candidate(result, request.user)
        examination.status = ManualExamination.Status.COMPLETED
        examination.save(update_fields=["status", "updated_at"])
        return Response(ManualExaminationSerializer(self.get_queryset().get(pk=examination.pk), context=self.get_serializer_context()).data)

    @staticmethod
    def _sync_candidate(result, admin_user):
        # PostgreSQL cannot apply FOR UPDATE to the nullable assigned_cohort join.
        # Lock the application row first, then resolve related objects normally.
        application = Application.objects.select_for_update().get(pk=result.application_id)
        marks = result.marks_obtained
        total = result.examination.maximum_marks or Decimal("100")
        Exam.objects.update_or_create(
            application=application,
            defaults={"status": Exam.Status.PENDING, "total_marks": total,
                      "pass_percentage": result.examination.pass_percentage},
        )
        exam = Exam.objects.get(application=application)
        published_exam = publish_screening_result(
            exam,
            marks_obtained=marks,
            total_marks=total,
            qualified=result.qualified,
            source="manual",
            actor=admin_user,
        )
        if result.qualified != published_exam.qualified:
            result.qualified = published_exam.qualified
            result.save(update_fields=["qualified", "updated_at"])


class ModuleTestViewSet(viewsets.ModelViewSet):
    queryset = ModuleTest.objects.select_related(
        "course", "module", "cohort", "question_bank"
    ).all().order_by("-created_at")
    serializer_class = ModuleTestSerializer
    permission_classes = [IsAuthenticated, IsMentorOrAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "role", "") == "MENTOR":
            qs = qs.filter(created_by=user)
        return qs

    def get_permissions(self):
        if self.action == "external_result":
            return [AllowAny()]
        if self.action in {
            "start", "autosave", "submit", "proctoring_rooms",
            "configure_proctoring", "assign_proctor",
        }:
            return [IsAuthenticated()]
        return super().get_permissions()

    @action(detail=False, methods=["post"], url_path="external-result")
    def external_result(self, request):
        """Accept final module marks only, identified by student and cohort."""
        from cohorts.models import Cohort
        from students.models import StudentProfile

        event_id, payload_hash = verify_result_signature(request)
        serializer = ExternalModuleTestResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            test = ModuleTest.objects.select_related("course", "cohort").get(
                pk=data["module_test_id"], is_active=True
            )
        except ModuleTest.DoesNotExist as exc:
            raise ValidationError({"module_test_id": "Unknown or inactive module test."}) from exc

        student_key = data["student_id"].strip()
        student = StudentProfile.objects.filter(
            Q(pk=student_key) if self._is_uuid(student_key) else Q(student_code__iexact=student_key)
        ).select_related("user").first()
        if not student:
            raise ValidationError({"student_id": "Unknown student ID or student code."})

        cohort_key = data["cohort_id"].strip()
        cohort = Cohort.objects.filter(
            Q(pk=cohort_key) if self._is_uuid(cohort_key) else Q(code__iexact=cohort_key)
        ).select_related("course").first()
        if not cohort:
            raise ValidationError({"cohort_id": "Unknown cohort ID or cohort code."})
        if cohort.course_id != test.course_id or (test.cohort_id and test.cohort_id != cohort.id):
            raise ValidationError({"cohort_id": "The cohort does not belong to this module test."})

        enrolled = Application.objects.filter(
            student=student,
            course=test.course,
            assigned_cohort=cohort,
            status__in=[
                Application.Status.COHORT_ASSIGNED,
                Application.Status.IN_PROGRESS,
                Application.Status.TRAINING,
                Application.Status.INTERNSHIP_ASSIGNED,
            ],
        ).exists()
        if not enrolled:
            raise ValidationError(
                {"student_id": "This student is not actively assigned to the supplied cohort."}
            )

        with transaction.atomic():
            attempt = ModuleTestSubmission.objects.select_for_update().filter(
                test=test, student=student
            ).first()
            if attempt and attempt.result_event_id:
                if attempt.result_event_id == event_id and attempt.result_payload_hash == payload_hash:
                    return Response(self._external_result_payload(attempt))
                return Response(
                    {"error": "A different final module-test result has already been published."},
                    status=status.HTTP_409_CONFLICT,
                )
            if attempt and attempt.status == ModuleTestSubmission.Status.SUBMITTED:
                return Response(
                    {"error": "This module test already has a final result."},
                    status=status.HTTP_409_CONFLICT,
                )

            submitted_at = data.get("submitted_at") or timezone.now()
            values = {
                "cohort": cohort,
                "started_at": attempt.started_at if attempt else submitted_at,
                "submitted_at": submitted_at,
                "status": ModuleTestSubmission.Status.SUBMITTED,
                "marks_obtained": data["marks_obtained"],
                "total_marks": data["total_marks"],
                "result_source": ModuleTestSubmission.ResultSource.EXTERNAL,
                "result_event_id": event_id,
                "result_payload_hash": payload_hash,
                "integrity_status": data["integrity_status"],
                "proctoring_summary": data.get("proctoring_summary", {}),
            }
            if attempt:
                for field, value in values.items():
                    setattr(attempt, field, value)
                attempt.save()
            else:
                attempt = ModuleTestSubmission.objects.create(
                    test=test, student=student, **values
                )

        notify_user(
            student.user,
            title="Module test result published",
            message=(
                f"{test.title}: {attempt.marks_obtained}/{attempt.total_marks} "
                f"({attempt.percentage}%)."
            ),
            notification_type=(
                Notification.Type.SUCCESS if attempt.qualified else Notification.Type.WARNING
            ),
            action_url="grades",
            dedupe_key=f"module-test:{attempt.id}:external-result",
        )
        return Response(self._external_result_payload(attempt))

    @staticmethod
    def _is_uuid(value):
        import uuid
        try:
            uuid.UUID(str(value))
            return True
        except (ValueError, TypeError, AttributeError):
            return False

    @staticmethod
    def _external_result_payload(attempt):
        return {
            "attempt_id": str(attempt.id),
            "module_test_id": str(attempt.test_id),
            "student_id": attempt.student.student_code,
            "cohort_id": attempt.cohort.code if attempt.cohort_id else None,
            "marks_obtained": attempt.marks_obtained,
            "total_marks": attempt.total_marks,
            "percentage": attempt.percentage,
            "qualified": attempt.qualified,
            "status": attempt.status,
            "result_source": attempt.result_source,
            "submitted_at": attempt.submitted_at,
        }

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            course_id = self.request.query_params.get("course")
            cohort_id = self.request.query_params.get("cohort")
            if course_id:
                base = base.filter(course_id=course_id)
            if cohort_id == "course-wide":
                base = base.filter(cohort__isnull=True)
            elif cohort_id:
                base = base.filter(cohort_id=cohort_id)
            return base
        if role == "MENTOR":
            qs = base.filter(
                Q(cohort__mentors=user)
                | Q(cohort__isnull=True, course__cohorts__mentors=user)
            ).distinct()
            cohort_id = self.request.query_params.get("cohort")
            course_id = self.request.query_params.get("course")
            if cohort_id:
                qs = qs.filter(cohort_id=cohort_id)
            if course_id:
                qs = qs.filter(course_id=course_id)
            return qs
        if role == "STUDENT":
            eligible_applications = Application.objects.filter(
                student__user=user,
                assigned_cohort__isnull=False,
                status__in=[
                    Application.Status.COHORT_ASSIGNED,
                    Application.Status.IN_PROGRESS,
                    Application.Status.TRAINING,
                    Application.Status.INTERNSHIP_ASSIGNED,
                ],
            )
            eligible_cohort_ids = eligible_applications.values("assigned_cohort_id")
            return base.filter(
                course__applications__student__user=user,
                course__applications__assigned_cohort__isnull=False,
                course__applications__status__in=[
                    Application.Status.COHORT_ASSIGNED,
                    Application.Status.IN_PROGRESS,
                    Application.Status.TRAINING,
                    Application.Status.INTERNSHIP_ASSIGNED,
                ],
                is_active=True,
            ).filter(
                Q(cohort__isnull=True) | Q(cohort_id__in=eligible_cohort_ids)
            ).distinct()
        return base.none()

    def _notify_available(self, test, title="Module test available"):
        cohorts = test.course.cohorts.exclude(status__in=["COMPLETED", "CANCELLED"])
        for cohort in cohorts:
            msg = f"{test.title} is scheduled for {test.course.name} - Cohort: {cohort.name}.\n"
            if test.scheduled_at:
                tz_time = test.scheduled_at.astimezone().strftime("%B %d, %Y at %I:%M %p %Z")
                msg += f"Scheduled Date & Time: {tz_time}.\n"
            msg += (
                f"Pass requirement: {test.pass_percentage}%.\n"
                "The Google Meet link will become visible on your dashboard exactly 10 minutes before the exam starts. "
                "Please join the Google Meet before the test starts."
            )
            notify_cohort(
                cohort,
                title=title,
                message=(
                    f"{test.title} is available for {test.course.name}. "
                    f"Pass requirement: {test.pass_percentage}%."
                ),
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="grades",
                dedupe_key=f"module-test:{test.id}:available",
            )

    @transaction.atomic
    def perform_create(self, serializer):
        course = serializer.validated_data["course"]
        cohort = serializer.validated_data.get("cohort")
        user = self.request.user
        in_scope = (
            cohort.mentors.filter(pk=user.pk).exists()
            if cohort
            else course.cohorts.filter(mentors=user).exists()
        )
        if not has_global_cohort_access(user) and not in_scope:
            raise PermissionDenied("You can create module tests only for courses in your assigned cohorts.")
            
        requested_release = serializer.validated_data.get("is_released", False)
        
        # Naming convention based on creator role
        role = getattr(user, "role", "")
        new_title = serializer.validated_data.get("title", "Module Test")
        if role == "ADMIN" or user.is_superuser:
            new_title = f"{new_title} - Admin"
        elif role == "MENTOR":
            if cohort and hasattr(cohort, "name"):
                new_title = f"{new_title} - {cohort.name}"
            else:
                new_title = f"{new_title} - Mentor"
                
        test = serializer.save(is_released=False, created_by=user, title=new_title)
        self._sync_scheduled_meet(test, requested_release)
        if test.is_active:
            self._notify_available(test)

    @transaction.atomic
    def perform_update(self, serializer):
        course = serializer.validated_data.get("course", serializer.instance.course)
        cohort = serializer.validated_data.get("cohort", serializer.instance.cohort)
        user = self.request.user
        in_scope = (
            cohort.mentors.filter(pk=user.pk).exists()
            if cohort
            else course.cohorts.filter(mentors=user).exists()
        )
        if not has_global_cohort_access(user) and not in_scope:
            raise PermissionDenied("You can update module tests only for courses in your assigned cohorts.")
            
        if serializer.instance.admin_started_at and any(field in serializer.validated_data for field in ["scheduled_at", "end_time", "cohort"]):
            raise ValidationError({"non_field_errors": "Cannot change schedule or cohort of an already started test."})
            
        was_active = serializer.instance.is_active
        requested_release = serializer.validated_data.get(
            "is_released", serializer.instance.is_released
        )
        test = serializer.save(is_released=False)
        self._sync_scheduled_meet(test, requested_release)
        if test.is_active and (not was_active or any(
            field in serializer.validated_data for field in ["title", "duration_minutes", "pass_percentage", "module"]
        )):
            self._notify_available(test, title="Module test updated")

    @staticmethod
    def _sync_scheduled_meet(test, requested_release):
        from .google_meet import sync_module_test_google_meet, ModuleTestMeetError
        
        has_complete_schedule = bool(test.cohort_id and test.scheduled_at and test.end_time)
        if requested_release and not has_complete_schedule:
            raise ValidationError({
                "is_released": (
                    "A cohort, scheduled start, and end time are required before release."
                )
            })
        if not has_complete_schedule:
            return
            
        update_fields = ["is_released", "updated_at"]
        test.is_released = requested_release
        
        # If no manual link is provided, auto-generate one
        if not test.meeting_link:
            try:
                link, event_id, created = sync_module_test_google_meet(test)
                test.meeting_link = link
                test.calendar_event_id = event_id
                update_fields.extend(["meeting_link", "calendar_event_id"])
            except ModuleTestMeetError as e:
                raise ValidationError({
                    "meeting_link": "Google Meet link could not be generated automatically (Google Calendar API unavailable). Please provide a meeting link manually.",
                    "code": "MEETING_LINK_REQUIRED",
                })
                
        test.save(update_fields=update_fields)

    def _student_is_eligible(self, test, user):
        return bool(
            getattr(user, "role", "") == "STUDENT"
            and hasattr(user, "student_profile")
            and test.is_active
            and test.course.applications.filter(
                student=user.student_profile,
                assigned_cohort__isnull=False,
                status__in=[
                    Application.Status.COHORT_ASSIGNED,
                    Application.Status.IN_PROGRESS,
                    Application.Status.TRAINING,
                    Application.Status.INTERNSHIP_ASSIGNED,
                ],
            ).filter(Q(assigned_cohort=test.cohort) if test.cohort_id else Q()).exists()
        )

    def _proctoring_question_bank(self, test):
        from question_bank.models import QuestionBank
        bank = test.question_bank
        if not bank:
            bank = test.question_banks.filter(
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                is_active=True,
            ).order_by("-updated_at").first()
        return bank

    @action(detail=True, methods=["post"], url_path="configure-proctoring")
    @transaction.atomic
    def configure_proctoring(self, request, pk=None):
        if not (request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"):
            raise PermissionDenied("Only an administrator can configure module-test proctoring rooms.")
        test = ModuleTest.objects.select_for_update().get(pk=self.get_object().pk)
        bank = self._proctoring_question_bank(test)
        if not bank:
            return Response({"error": "No approved and open question bank is assigned to this module test."}, status=status.HTTP_409_CONFLICT)
        serializer = ModuleTestSerializer(
            test,
            data={key: request.data[key] for key in [
                "proctoring_enabled", "proctoring_required",
                "proctoring_room_count", "proctoring_capacity_per_room",
            ] if key in request.data},
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        test = serializer.save()
        if test.proctoring_enabled:
            ensure_module_proctoring_rooms(test, bank, reconfigure=True)
        else:
            scope_key, _ = module_proctoring_scope(test, bank)
            ExamProctoringRoom.objects.filter(scope_key=scope_key).update(is_active=False)
        return Response(ModuleTestSerializer(test, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="assign-proctor")
    @transaction.atomic
    def assign_proctor(self, request, pk=None):
        from accounts.models import User
        if not (request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"):
            raise PermissionDenied("Only an administrator can assign proctors.")
        test = ModuleTest.objects.select_for_update().get(pk=self.get_object().pk)
        bank = self._proctoring_question_bank(test)
        if not bank:
            raise ValidationError({"module_test": "No approved question bank is assigned."})
        scope_key, _ = module_proctoring_scope(test, bank)
        try:
            room = ExamProctoringRoom.objects.select_for_update().get(
                pk=request.data.get("room_id"), scope_key=scope_key, is_active=True,
            )
        except ExamProctoringRoom.DoesNotExist as exc:
            raise ValidationError({"room_id": "Select an active room for this module test."}) from exc
        proctor_id = request.data.get("proctor_id")
        if proctor_id:
            try:
                proctor = User.objects.get(pk=proctor_id, role__in=[
                    User.Role.ADMIN, User.Role.MENTOR, User.Role.VOLUNTEER, User.Role.TRUSTEE,
                ])
            except User.DoesNotExist as exc:
                raise ValidationError({"proctor_id": "Select an eligible staff proctor."}) from exc
        else:
            proctor = None
        room.assigned_proctor = proctor
        room.save(update_fields=["assigned_proctor", "updated_at"])
        return Response(ExamProctoringRoomSerializer(room).data)

    @action(detail=True, methods=["get"], url_path="proctoring-rooms")
    def proctoring_rooms(self, request, pk=None):
        test = self.get_object()
        bank = self._proctoring_question_bank(test)
        if not bank:
            return Response({"error": "No approved and open question bank is assigned to this module test."}, status=status.HTTP_409_CONFLICT)
        scope_key, session_date = module_proctoring_scope(test, bank)
        actual_admin = request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"
        rooms = ExamProctoringRoom.objects.filter(scope_key=scope_key, is_active=True)
        if not actual_admin:
            rooms = rooms.filter(assigned_proctor=request.user)
        rooms = rooms.select_related("assigned_proctor", "question_bank__course").prefetch_related("assigned_students__user").order_by("code")
        return Response({
            "module_test_id": str(test.id),
            "title": test.title,
            "course_name": test.course.name,
            "cohort_code": test.cohort.code if test.cohort_id else "COURSE-WIDE",
            "session_date": session_date,
            "provider": "JITSI",
            "domain": getattr(settings, "JITSI_DOMAIN", "meet.jit.si"),
            "rooms": ExamProctoringRoomSerializer(rooms, many=True).data,
        })

    @action(detail=True, methods=["post"], url_path="admin-start")
    @transaction.atomic
    def admin_start(self, request, pk=None):
        if not (request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"):
            raise PermissionDenied("Only Platform Admins can start the exam.")
            
        test = ModuleTest.objects.select_for_update().get(pk=self.get_object().pk)
        now = timezone.now()
            
        if test.end_time and now > test.end_time:
            return Response(
                {"error": "Cannot start test after end time.", "code": "TOO_LATE"},
                status=status.HTTP_400_BAD_REQUEST
            )

        test.is_released = True
        test.admin_started_at = now
        test.save(update_fields=["is_released", "admin_started_at", "updated_at"])
            
        return Response({"status": "Test started for eligible students.", "admin_started_at": test.admin_started_at})

    @action(detail=True, methods=["post"], url_path="admin-end")
    @transaction.atomic
    def admin_end(self, request, pk=None):
        if not (request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"):
            raise PermissionDenied("Only Platform Admins can end the exam.")
            
        test = ModuleTest.objects.select_for_update().get(pk=self.get_object().pk)
        now = timezone.now()
        test.end_time = now
        test.save(update_fields=["end_time", "updated_at"])
            
        return Response({"status": "Test ended early.", "end_time": test.end_time})

    @action(detail=True, methods=["post"], url_path="start")
    @transaction.atomic
    def start(self, request, pk=None):
        from question_bank.models import QuestionBank

        visible_test = self.get_object()
        if not self._student_is_eligible(visible_test, request.user):
            raise PermissionDenied("This module test is not unlocked for your assigned cohort.")
        test = ModuleTest.objects.select_for_update(of=("self",)).select_related(
            "course", "module", "cohort", "question_bank"
        ).get(pk=visible_test.pk)

        now = timezone.now()
        if test.end_time and now > test.end_time:
            return Response(
                {
                    "error": "The module test window has closed.",
                    "code": "MODULE_TEST_WINDOW_CLOSED",
                    "end_time": test.end_time.isoformat(),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        is_active = bool(test.admin_started_at) or (
            test.scheduled_at and now >= test.scheduled_at
        )
        if not is_active:
            scheduled_str = test.scheduled_at.isoformat() if test.scheduled_at else "soon"
            return Response(
                {
                    "error": f"The module test window has not opened yet. It is scheduled to open at {scheduled_str}.",
                    "code": "MODULE_TEST_NOT_STARTED",
                    "scheduled_at": scheduled_str,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        bank = test.question_bank
        if not bank:
            bank = test.question_banks.filter(
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                is_active=True,
            ).order_by("-updated_at").first()
        if not bank or not bank.is_active or bank.status != QuestionBank.Status.APPROVED:
            return Response(
                {"error": "No approved and open syllabus question bank is assigned to this module test."},
                status=status.HTTP_409_CONFLICT,
            )

        if (
            bank.bank_type != QuestionBank.BankType.MODULE_TEST
            or bank.course_id != test.course_id
            or (bank.module_id and bank.module_id != test.module_id)
            or (bank.cohort_id and bank.cohort_id != test.cohort_id)
        ):
            return Response(
                {"error": "The assigned question bank does not match this module test."},
                status=status.HTTP_409_CONFLICT,
            )
        if bank.lifecycle_status != QuestionBank.LifecycleStatus.OPEN:
            return Response({"error": "This module test is not currently open."}, status=status.HTTP_403_FORBIDDEN)
        bank = QuestionBank.objects.select_for_update().get(pk=bank.pk)

        student = request.user.student_profile
        attempt = ModuleTestSubmission.objects.select_for_update().filter(
            test=test, student=student
        ).first()
        now = timezone.now()
        if attempt:
            if attempt.status == ModuleTestSubmission.Status.SUBMITTED:
                return Response({"error": "Module test already submitted."}, status=status.HTTP_409_CONFLICT)
            if attempt.expires_at and now > attempt.expires_at:
                try:
                    finalized = finalize_module_attempt(attempt, auto_submitted=True)
                except ValueError as exc:
                    return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
                return Response(
                    {
                        "error": "Time expired; the last server-saved answers were submitted.",
                        "code": "EXAM_AUTO_SUBMITTED",
                        "result": module_result_payload(finalized, auto_submitted=True),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if not attempt.question_snapshot:
                return Response(
                    {"error": "This legacy module-test attempt has no immutable paper snapshot."},
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            try:
                set_code = select_balanced_paper_set(
                    bank,
                    ModuleTestSubmission,
                    student_id=student.pk,
                    assessment_id=test.pk,
                )
                snapshot, question_mapping, option_mapping = build_attempt_blueprint(
                    bank, set_code, total_questions=test.total_questions
                )
                room = select_balanced_module_proctoring_room(
                    test,
                    bank,
                    student_id=student.pk,
                )
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
            attempt = ModuleTestSubmission.objects.create(
                test=test,
                student=student,
                cohort=test.cohort,
                started_at=now,
                expires_at=now + timedelta(minutes=test.duration_minutes),
                status=ModuleTestSubmission.Status.IN_PROGRESS,
                question_bank=bank,
                paper_set=set_code,
                question_snapshot=snapshot,
                question_mapping=question_mapping,
                option_mapping=option_mapping,
                answers={"responses": {}},
                proctoring_room=room,
                proctoring_status=("PENDING" if room else "NOT_REQUIRED"),
            )

        if test.proctoring_enabled and not attempt.proctoring_room_id:
            try:
                attempt.proctoring_room = select_balanced_module_proctoring_room(
                    test,
                    bank,
                    student_id=student.pk,
                )
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
            attempt.proctoring_status = "PENDING"
            attempt.save(update_fields=[
                "proctoring_room", "proctoring_status", "updated_at",
            ])

        candidate_user = student.user
        display_name = candidate_user.get_full_name().strip() or candidate_user.email

        return Response({
            "attempt_id": str(attempt.id),
            "module_test_id": str(test.id),
            "assessment_type": "MODULE_TEST",
            "title": test.title,
            "course_id": str(test.course_id),
            "course_name": test.course.name,
            "module_title": test.module.title if test.module_id else None,
            "start_time": attempt.started_at,
            "expires_at": attempt.expires_at,
            "duration_minutes": test.duration_minutes,
            "pass_percentage": test.pass_percentage,
            "paper_code": attempt.paper_set,
            "paper_label": f"Paper {attempt.paper_set}",
            "questions": candidate_questions(
                attempt.question_snapshot, attempt.question_mapping, attempt.option_mapping
            ),
            "saved_answers": (attempt.answers or {}).get("responses", {}),
            "meeting_link": test.meeting_link,
            "proctoring": proctoring_payload(attempt, display_name),
        })

    @action(detail=True, methods=["post"], url_path="autosave")
    @transaction.atomic
    def autosave(self, request, pk=None):
        test = self.get_object()
        if not self._student_is_eligible(test, request.user):
            raise PermissionDenied("This module test is not unlocked for your assigned cohort.")
        attempt = ModuleTestSubmission.objects.select_for_update().filter(
            test=test,
            student=request.user.student_profile,
            status=ModuleTestSubmission.Status.IN_PROGRESS,
        ).first()
        if not attempt:
            return Response({"error": "No active module-test attempt found."}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get("attempt_id") and str(request.data["attempt_id"]) != str(attempt.id):
            raise ValidationError({"attempt_id": "Attempt does not belong to this module test."})
        if attempt.expires_at and timezone.now() > attempt.expires_at:
            try:
                finalized = finalize_module_attempt(attempt, auto_submitted=True)
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
            return Response(
                {
                    "error": "Time expired; the last server-saved answers were submitted.",
                    "code": "EXAM_AUTO_SUBMITTED",
                    "result": module_result_payload(finalized, auto_submitted=True),
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            responses = normalize_candidate_responses(attempt, request.data.get("answers", {}))
        except ValueError as exc:
            raise ValidationError({"answers": str(exc)}) from exc
        current = responses if "answers" in request.data else dict((attempt.answers or {}).get("responses", {}))
        attempt.answers = {"responses": current}
        security_events = request.data.get("security_events", [])
        if security_events:
            if not isinstance(security_events, list) or len(security_events) > 50:
                raise ValidationError({"security_events": "Send at most 50 security events per autosave."})
            for event in security_events:
                if not isinstance(event, dict):
                    continue
                event_type = str(event.get("type", "")).strip().upper()
                if event_type == "JITSI_JOINED":
                    attempt.proctoring_status = "CONNECTED"
                    attempt.proctoring_connected_at = (
                        attempt.proctoring_connected_at or timezone.now()
                    )
                elif event_type in {"JITSI_LEFT", "JITSI_DISCONNECTED"}:
                    attempt.proctoring_status = "DISCONNECTED"
                elif event_type == "JITSI_ERROR":
                    attempt.proctoring_status = "FAILED"
        attempt.save(update_fields=[
            "answers", "proctoring_status", "proctoring_connected_at", "updated_at",
        ])
        return Response({
            "attempt_id": str(attempt.id),
            "saved_answers": current,
            "expires_at": attempt.expires_at,
            "proctoring_status": attempt.proctoring_status,
        })

    @action(detail=True, methods=["post"], url_path="submit")
    @transaction.atomic
    def submit(self, request, pk=None):
        test = self.get_object()
        if not self._student_is_eligible(test, request.user):
            raise PermissionDenied("This module test is not unlocked for your assigned cohort.")
        attempt = ModuleTestSubmission.objects.select_for_update().filter(
            test=test, student=request.user.student_profile
        ).first()
        if not attempt:
            return Response({"error": "Start the module test before submitting."}, status=status.HTTP_409_CONFLICT)
        if attempt.status == ModuleTestSubmission.Status.SUBMITTED:
            was_auto_submitted = bool(
                attempt.expires_at
                and attempt.submitted_at
                and attempt.submitted_at >= attempt.expires_at
            )
            if was_auto_submitted:
                payload = module_result_payload(attempt, auto_submitted=True)
                payload["already_submitted"] = True
                return Response(payload, status=status.HTTP_200_OK)
            return Response({"error": "Module test already submitted."}, status=status.HTTP_409_CONFLICT)
        if request.data.get("attempt_id") and str(request.data["attempt_id"]) != str(attempt.id):
            raise ValidationError({"attempt_id": "Attempt does not belong to this module test."})
        if attempt.expires_at and timezone.now() > attempt.expires_at + timedelta(seconds=5):
            try:
                finalized = finalize_module_attempt(attempt, auto_submitted=True)
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
            return Response(
                module_result_payload(finalized, auto_submitted=True),
                status=status.HTTP_200_OK,
            )

        final_answers = request.data.get("answers", {})
        if isinstance(final_answers, dict) and "responses" in final_answers:
            final_answers = final_answers["responses"]
        current = dict((attempt.answers or {}).get("responses", {}))
        try:
            current.update(normalize_candidate_responses(attempt, final_answers))
            normalized, translated = translate_candidate_responses(attempt, current)
        except ValueError as exc:
            raise ValidationError({"answers": str(exc)}) from exc

        total_marks = Decimal("0.00")
        obtained_marks = Decimal("0.00")
        for index, question in enumerate(attempt.question_snapshot or []):
            question_marks = Decimal(str(question.get("marks", 1)))
            total_marks += question_marks
            if answer_matches(question, response_for_question(translated, question, index)):
                obtained_marks += question_marks
        if total_marks <= 0:
            raise ValidationError({"test": "The assigned paper has no gradable marks."})
        percentage = round((obtained_marks / total_marks) * Decimal("100.00"), 2)
        attempt.answers = {"responses": normalized}
        attempt.submitted_at = timezone.now()
        attempt.status = ModuleTestSubmission.Status.SUBMITTED
        attempt.marks_obtained = obtained_marks
        attempt.total_marks = total_marks
        attempt.percentage = percentage
        attempt.qualified = percentage >= test.pass_percentage
        attempt.save(update_fields=[
            "answers", "submitted_at", "status", "marks_obtained", "total_marks",
            "percentage", "qualified", "updated_at",
        ])
        notify_user(
            request.user,
            title="Module test result published",
            message=f"{test.title}: {obtained_marks}/{total_marks} ({percentage}%).",
            notification_type=Notification.Type.SUCCESS if attempt.qualified else Notification.Type.WARNING,
            action_url="grades",
            dedupe_key=f"module-test:{attempt.id}:evaluated",
        )
        return Response({
            "message": "Module test submitted and evaluated successfully.",
            "status": attempt.status,
            "qualified": attempt.qualified,
            "passed": bool(attempt.qualified),
            "marks_obtained": attempt.marks_obtained,
            "total_marks": attempt.total_marks,
            "percentage": attempt.percentage,
            "pass_percentage": test.pass_percentage,
            "submitted_at": attempt.submitted_at,
            "total_questions": len(attempt.question_snapshot or []),
            "course_name": test.course.name,
            "title": test.title,
        })


class ModuleTestSubmissionViewSet(viewsets.ModelViewSet):
    queryset = ModuleTestSubmission.objects.select_related(
        "test", "test__course", "test__module", "student", "student__user",
    ).all().order_by("-created_at")
    serializer_class = ModuleTestSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            student_id = self.request.query_params.get("student")
            test_id = self.request.query_params.get("test")
            if student_id:
                base = base.filter(student_id=student_id)
            if test_id:
                base = base.filter(test_id=test_id)
            return base
        if role == "MENTOR":
            qs = base.filter(
                Q(test__cohort__mentors=user)
                | Q(test__cohort__isnull=True, test__course__cohorts__mentors=user)
            ).distinct()
            student_id = self.request.query_params.get("student")
            test_id = self.request.query_params.get("test")
            cohort_id = self.request.query_params.get("cohort")
            if student_id:
                qs = qs.filter(student_id=student_id)
            if test_id:
                qs = qs.filter(test_id=test_id)
            if cohort_id:
                qs = qs.filter(test__cohort_id=cohort_id)
            return qs
        if role == "STUDENT":
            return base.filter(student__user=user)
        return base.none()

    def get_permissions(self):
        return [IsAuthenticated(), IsMentorOrAdminOrReadOnly()]

    def create(self, request, *args, **kwargs):
        return Response(
            {
                "error": (
                    "Direct module-test submission is disabled. Start and submit through "
                    "/api/module-tests/{id}/start/ and /api/module-tests/{id}/submit/."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )
