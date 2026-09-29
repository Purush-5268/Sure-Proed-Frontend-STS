from django.utils import timezone
from django.db.models import Count, Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Assignment, Submission
from .serializers import AssignmentSerializer, SubmissionSerializer


from common.permissions import IsMentorOrAdminOrReadOnly
from rest_framework.permissions import IsAuthenticated
from common.access import can_manage_cohort, has_global_cohort_access
from common.models import Notification
from common.services.notifications import display_name, notify_cohort, notify_user

class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.select_related(
        "cohort", "cohort__course", "module", "created_by"
    ).annotate(
        submission_count=Count("submissions", distinct=True),
        evaluated_count=Count("submissions", filter=Q(submissions__evaluated=True), distinct=True),
    ).all().order_by("-created_at")
    serializer_class = AssignmentSerializer
    permission_classes = [IsAuthenticated, IsMentorOrAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        base = self.queryset
        if not user.is_authenticated:
            return base.none()
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            cohort_id = self.request.query_params.get("cohort")
            return base.filter(cohort_id=cohort_id) if cohort_id else base
        if role == "MENTOR":
            return base.filter(cohort__mentors=user).distinct()
        if role == "VOLUNTEER":
            return base.filter(cohort__volunteers=user).distinct()
        if role == "STUDENT":
            active_statuses = [
                "COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED",
            ]
            student_profile = getattr(user, "student_profile", None)
            if not student_profile:
                return base.none()

            # Courses the student is actively enrolled in (via their Applications)
            enrolled_course_ids = list(
                student_profile.applications.filter(
                    status__in=active_statuses
                ).values_list("course_id", flat=True)
            )

            student_qs = base.filter(
                cohort__applications__student__user=user,
                cohort__applications__status__in=active_statuses,
                status=Assignment.Status.PUBLISHED,
                begin_date__lte=timezone.now(),
            )

            # For capstone assignments with an elective restriction, only include
            # those where the student's enrolled course matches the elective.
            # Capstones without an elective (null) remain visible to all students.
            student_qs = student_qs.filter(
                Q(assignment_type=Assignment.AssignmentType.CAPSTONE, elective__isnull=True)
                | Q(assignment_type=Assignment.AssignmentType.CAPSTONE, elective_id__in=enrolled_course_ids)
                | ~Q(assignment_type=Assignment.AssignmentType.CAPSTONE)
            )

            return student_qs.prefetch_related(
                Prefetch(
                    "submissions",
                    queryset=Submission.objects.filter(student=student_profile),
                    to_attr="prefetched_student_submissions",
                )
            ).distinct()
        return base.none()

    def perform_create(self, serializer):
        cohort = serializer.validated_data["cohort"]
        if getattr(self.request.user, "role", "") not in ["ADMIN", "MENTOR"] and not self.request.user.is_staff:
            raise PermissionDenied("Only mentors and admins can create assignments.")
        if not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can create assignments only for an assigned cohort.")
        if cohort.status in ["COMPLETED", "CANCELLED"]:
            raise ValidationError({"cohort": "Completed or cancelled cohorts are read-only."})
        assignment = serializer.save(created_by=self.request.user)
        if assignment.status == Assignment.Status.PUBLISHED:
            notify_cohort(
                cohort,
                title="New assignment published",
                message=f"{assignment.title} is now available for cohort {cohort.code}. Deadline: {assignment.deadline:%d %b %Y, %I:%M %p}.",
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="assignments",
                dedupe_key=f"assignment:{assignment.id}:published",
            )

    @action(detail=True, methods=["get"], url_path="submissions")
    def assignment_submissions(self, request, pk=None):
        assignment = self.get_object()
        if not can_manage_cohort(request.user, assignment.cohort):
            raise PermissionDenied("You can review submissions only for your assigned cohorts.")
        rows = assignment.submissions.select_related("student", "student__user").order_by("-submitted_at")
        return Response(SubmissionSerializer(rows, many=True, context={"request": request}).data)

    def perform_update(self, serializer):
        cohort = serializer.validated_data.get("cohort", serializer.instance.cohort)
        if not can_manage_cohort(self.request.user, cohort):
            raise PermissionDenied("You can update assignments only in your assigned cohorts.")
        assignment = serializer.instance
        was_published = assignment.status == Assignment.Status.PUBLISHED
        previous_deadline = assignment.deadline
        assignment = serializer.save()
        if assignment.status == Assignment.Status.PUBLISHED and (
            not was_published or assignment.deadline != previous_deadline
        ):
            notify_cohort(
                cohort,
                title="New assignment published" if not was_published else "Assignment deadline updated",
                message=(
                    f"{assignment.title} is available for cohort {cohort.code}. "
                    f"Deadline: {assignment.deadline:%d %b %Y, %I:%M %p}."
                ),
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="assignments",
                dedupe_key=f"assignment:{assignment.id}:published",
            )

    def perform_destroy(self, instance):
        if not can_manage_cohort(self.request.user, instance.cohort):
            raise PermissionDenied("You can delete assignments only in your assigned cohorts.")
        instance.delete()

class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Submission.objects.none()
        base = Submission.objects.select_related(
            "assignment", "assignment__cohort", "student", "student__user", "evaluated_by"
        ).order_by("-submitted_at")
        role = getattr(user, "role", "")
        if has_global_cohort_access(user):
            scoped = base
        elif role == "MENTOR":
            scoped = base.filter(assignment__cohort__mentors=user).distinct()
        elif role == "VOLUNTEER":
            scoped = base.filter(assignment__cohort__volunteers=user).distinct()
        else:
            scoped = base.filter(student__user=user)

        # Query parameters narrow the already-authorized queryset. Applying them
        # after role scoping prevents both over-broad mentor results and access
        # to submissions outside the caller's permitted cohorts.
        student_id = self.request.query_params.get("student")
        assignment_id = self.request.query_params.get("assignment")
        if student_id:
            scoped = scoped.filter(student_id=student_id)
        if assignment_id:
            scoped = scoped.filter(assignment_id=assignment_id)
        return scoped

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, "role", "") != "STUDENT" or not hasattr(user, "student_profile"):
            raise PermissionDenied("Only students can submit assignments.")
        assignment = serializer.validated_data["assignment"]
        student_profile = user.student_profile
        allowed = assignment.status == Assignment.Status.PUBLISHED and assignment.cohort.applications.filter(
            student=student_profile,
            status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED"],
        ).exists()
        if not allowed:
            raise PermissionDenied("This assignment is not available to your cohort.")

        # ── Elective gate (Capstone only) ─────────────────────────────────────
        if (
            assignment.assignment_type == Assignment.AssignmentType.CAPSTONE
            and assignment.elective_id is not None
        ):
            enrolled_in_elective = student_profile.applications.filter(
                course_id=assignment.elective_id,
                status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED"],
            ).exists()
            if not enrolled_in_elective:
                elective_code = getattr(assignment.elective, "code", "")
                raise PermissionDenied(
                    f"This capstone project is only available to students enrolled in the "
                    f"{elective_code} elective. You are not currently enrolled in that elective."
                )
        # ─────────────────────────────────────────────────────────────────────

        submitted_at = timezone.now()
        if assignment.begin_date > submitted_at:
            raise ValidationError({"assignment": "This assignment is not open yet."})
            
        if submitted_at > assignment.deadline:
            if not assignment.allow_late_submissions:
                raise ValidationError({"detail": "Submissions are closed for this assignment."})

        existing_sub = Submission.objects.filter(assignment=assignment, student=student_profile).first()
        if existing_sub:
            if existing_sub.evaluated and not existing_sub.resubmission_requested:
                raise ValidationError({
                    "assignment": "This assignment has already been evaluated. Resubmission is only allowed when requested by your mentor."
                })
            is_resubmit_request = (
                self.request.data.get("resubmit") is True
                or str(self.request.data.get("resubmit", "")).lower() in {"true", "1"}
                or self.request.query_params.get("resubmit") == "true"
                or existing_sub.resubmission_requested
            )
            if not is_resubmit_request:
                raise ValidationError(
                    {"assignment": "You already submitted this assignment. Update the existing submission instead."}
                )
            # Resubmission Flow: update existing submission and increment resubmission_count
            existing_sub.submission_text = serializer.validated_data.get("submission_text", existing_sub.submission_text)
            existing_sub.submission_url = serializer.validated_data.get("submission_url", existing_sub.submission_url)
            existing_sub.commit_sha = serializer.validated_data.get("commit_sha", existing_sub.commit_sha)
            existing_sub.files = serializer.validated_data.get("files", existing_sub.files)
            existing_sub.submitted_at = submitted_at
            existing_sub.is_late = submitted_at > assignment.deadline
            existing_sub.resubmission_count += 1
            existing_sub.resubmission_requested = False
            existing_sub.evaluated = False
            existing_sub.evaluated_by = None
            existing_sub.evaluated_at = None
            existing_sub.marks_obtained = None
            existing_sub.passed = None
            existing_sub.feedback = None
            if assignment.autograding_enabled:
                existing_sub.autograding_status = Submission.AutoGradingStatus.QUEUED
                existing_sub.auto_marks = None
                existing_sub.auto_feedback = ""
                existing_sub.auto_report = {}
                existing_sub.auto_graded_at = None
            existing_sub.save()
            serializer.instance = existing_sub
            if assignment.autograding_enabled:
                from .tasks import auto_grade_submission_task
                auto_grade_submission_task.delay(str(existing_sub.id))
            return

        submission = serializer.save(
            student=student_profile,
            submitted_at=submitted_at,
            is_late=submitted_at > assignment.deadline,
        )
        if assignment.autograding_enabled:
            from .tasks import auto_grade_submission_task
            submission.autograding_status = Submission.AutoGradingStatus.QUEUED
            submission.save(update_fields=["autograding_status", "updated_at"])
            auto_grade_submission_task.delay(str(submission.id))

    def perform_update(self, serializer):
        user = self.request.user
        role = getattr(user, "role", "")
        if role not in ["ADMIN", "MENTOR"] and not user.is_staff:
            # Student updating their own submission counts as a resubmission
            submission = serializer.instance
            if submission.student.user_id != user.id:
                raise PermissionDenied("You can only update your own submission.")
            if submission.evaluated and not submission.resubmission_requested:
                raise ValidationError({
                    "assignment": "This assignment has already been evaluated. Resubmission is only allowed when requested by your mentor."
                })
            submitted_at = timezone.now()
            assignment = submission.assignment
            
            if submitted_at > assignment.deadline:
                if not assignment.allow_late_submissions:
                    raise ValidationError({"detail": "Submissions are closed for this assignment."})
                    
            submission.submitted_at = submitted_at
            submission.is_late = submitted_at > assignment.deadline
            submission.resubmission_count += 1
            submission.resubmission_requested = False
            submission.evaluated = False
            submission.evaluated_by = None
            submission.evaluated_at = None
            submission.marks_obtained = None
            submission.passed = None
            submission.feedback = None
            if assignment.autograding_enabled:
                submission.autograding_status = Submission.AutoGradingStatus.QUEUED
                submission.auto_marks = None
                submission.auto_feedback = ""
                submission.auto_report = {}
                submission.auto_graded_at = None
            serializer.save()
            if assignment.autograding_enabled:
                from .tasks import auto_grade_submission_task
                auto_grade_submission_task.delay(str(submission.id))
            return

        submission = serializer.instance
        if not can_manage_cohort(user, submission.assignment.cohort):
            raise PermissionDenied("You can grade only submissions from your assigned cohorts.")
        marks = serializer.validated_data.get("marks_obtained", submission.marks_obtained)
        passed = None
        if marks is not None and submission.assignment.max_marks:
            passed = (marks / submission.assignment.max_marks * 100) >= submission.assignment.pass_percentage
        submission = serializer.save(
            evaluated=True,
            evaluated_by=user,
            evaluated_at=timezone.now(),
            passed=passed,
        )
        notify_user(
            submission.student.user,
            title="Assignment graded",
            message=(
                f"Hi {display_name(submission.student.user)}, {submission.assignment.title} was graded: "
                f"{submission.marks_obtained}/{submission.assignment.max_marks}."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="assignments",
            dedupe_key=f"submission:{submission.id}:graded",
        )

    @action(detail=True, methods=["post"], url_path="request-autograde")
    def request_autograde(self, request, pk=None):
        submission = self.get_object()
        user = request.user
        is_owner = submission.student.user_id == user.id
        if not (is_owner or can_manage_cohort(user, submission.assignment.cohort)):
            raise PermissionDenied("You cannot request review for this submission.")
        if not submission.assignment.autograding_enabled:
            raise ValidationError({"assignment": "Automated review is not enabled for this assignment."})
        if submission.autograding_status in {
            Submission.AutoGradingStatus.QUEUED,
            Submission.AutoGradingStatus.PROCESSING,
        }:
            return Response(SubmissionSerializer(submission, context={"request": request}).data)
        from .tasks import auto_grade_submission_task
        submission.autograding_status = Submission.AutoGradingStatus.QUEUED
        submission.auto_feedback = ""
        submission.save(update_fields=["autograding_status", "auto_feedback", "updated_at"])
        auto_grade_submission_task.delay(str(submission.id))
        return Response(SubmissionSerializer(submission, context={"request": request}).data, status=202)

    @action(detail=True, methods=["post"], url_path="resubmit")
    def resubmit(self, request, pk=None):
        submission = self.get_object()
        user = request.user
        if getattr(user, "role", "") != "STUDENT" or submission.student.user_id != user.id:
            raise PermissionDenied("You can resubmit only your own assignment submissions.")

        assignment = submission.assignment
        submitted_at = timezone.now()
        if assignment.begin_date > submitted_at:
            raise ValidationError({"assignment": "This assignment is not open yet."})
            
        if submitted_at > assignment.deadline:
            if not assignment.allow_late_submissions:
                raise ValidationError({"detail": "Submissions are closed for this assignment."})

        if submission.evaluated and not submission.resubmission_requested:
            raise ValidationError({
                "assignment": "This assignment has already been evaluated. Resubmission is only allowed when requested by your mentor."
            })

        serializer = self.get_serializer(submission, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        submission.submission_text = serializer.validated_data.get("submission_text", submission.submission_text)
        submission.submission_url = serializer.validated_data.get("submission_url", submission.submission_url)
        submission.commit_sha = serializer.validated_data.get("commit_sha", submission.commit_sha)
        submission.files = serializer.validated_data.get("files", submission.files)
        submission.submitted_at = submitted_at
        submission.is_late = submitted_at > assignment.deadline
        submission.resubmission_count += 1
        submission.resubmission_requested = False
        submission.evaluated = False
        submission.evaluated_by = None
        submission.evaluated_at = None
        submission.marks_obtained = None
        submission.passed = None
        submission.feedback = None

        if assignment.autograding_enabled:
            submission.autograding_status = Submission.AutoGradingStatus.QUEUED
            submission.auto_marks = None
            submission.auto_feedback = ""
            submission.auto_report = {}
            submission.auto_graded_at = None

        submission.save()

        if assignment.autograding_enabled:
            from .tasks import auto_grade_submission_task
            auto_grade_submission_task.delay(str(submission.id))

        return Response(SubmissionSerializer(submission, context={"request": request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="request-resubmission")
    def request_resubmission(self, request, pk=None):
        submission = self.get_object()
        user = request.user
        if not can_manage_cohort(user, submission.assignment.cohort):
            raise PermissionDenied("You can request resubmissions only for your assigned cohorts.")

        remarks = request.data.get("remarks", "").strip() or "Mentor requested resubmission. Please update your work and resubmit."
        submission.resubmission_requested = True
        submission.resubmission_remarks = remarks
        submission.save(update_fields=["resubmission_requested", "resubmission_remarks", "updated_at"])

        if submission.student and submission.student.user:
            notify_user(
                submission.student.user,
                title="Resubmission requested",
                message=f"Your mentor has asked you to resubmit '{submission.assignment.title}'. Remarks: {remarks}",
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="assignments",
                dedupe_key=f"submission:{submission.id}:resubmit_requested:{timezone.now().timestamp()}",
            )

        return Response(
            SubmissionSerializer(submission, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

