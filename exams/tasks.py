import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .attempt_finalization import finalize_internal_attempt, finalize_module_attempt
from .models import InternalExamAttempt, ModuleTestSubmission


logger = logging.getLogger(__name__)


@shared_task
def finalize_expired_assessment_attempts():
    """Submit expired attempts from the last answers received before the deadline."""
    deadline = timezone.now() - timedelta(seconds=5)
    internal_ids = list(
        InternalExamAttempt.objects.filter(
            status=InternalExamAttempt.Status.IN_PROGRESS,
            expires_at__lte=deadline,
        ).values_list("id", flat=True)
    )
    module_ids = list(
        ModuleTestSubmission.objects.filter(
            status=ModuleTestSubmission.Status.IN_PROGRESS,
            expires_at__lte=deadline,
        ).values_list("id", flat=True)
    )

    finalized_internal = 0
    finalized_modules = 0
    for attempt_id in internal_ids:
        try:
            with transaction.atomic():
                attempt = InternalExamAttempt.objects.select_for_update().select_related(
                    "exam__application__student__user",
                    "exam__application__course",
                ).get(pk=attempt_id)
                if attempt.status == InternalExamAttempt.Status.IN_PROGRESS:
                    finalize_internal_attempt(attempt, auto_submitted=True)
                    finalized_internal += 1
        except Exception:
            logger.exception("Could not auto-finalize internal exam attempt %s", attempt_id)

    for attempt_id in module_ids:
        try:
            with transaction.atomic():
                attempt = ModuleTestSubmission.objects.select_for_update().select_related(
                    "test__course",
                    "student__user",
                ).get(pk=attempt_id)
                if attempt.status == ModuleTestSubmission.Status.IN_PROGRESS:
                    finalize_module_attempt(attempt, auto_submitted=True)
                    finalized_modules += 1
        except Exception:
            logger.exception("Could not auto-finalize module test attempt %s", attempt_id)

    return {
        "internal_exam_attempts": finalized_internal,
        "module_test_attempts": finalized_modules,
    }


@shared_task
def enforce_missed_module_tests():
    """
    Finds module tests whose official end_time has passed.
    For active students in the assigned cohort who completely failed to
    submit or attend, this records MISSED for review without changing cohort access.
    """
    from exams.models import ModuleTest
    from applications.models import Application

    # 1. Find tests whose window has ended and are active/released
    ended_tests = ModuleTest.objects.filter(
        is_active=True,
        is_released=True,
        end_time__lt=timezone.now(),
        cohort__isnull=False
    ).select_related('cohort')

    active_statuses = {
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
    }

    missed_count = 0

    for test in ended_tests:
        # 2. Find eligible active applications in the cohort
        active_apps = Application.objects.filter(
            assigned_cohort=test.cohort,
            course=test.course,
            status__in=active_statuses,
            applied_at__lte=test.end_time,
            student__user__is_active=True,
        ).select_related('student')

        for app in active_apps:
            try:
                with transaction.atomic():
                    # 3. Safely check if submission exists (lock student row to prevent concurrent submission race)
                    # We lock the application row as a proxy for the student's state
                    locked_app = Application.objects.select_for_update().get(pk=app.pk)

                    # If status changed concurrently, skip
                    if locked_app.status not in active_statuses:
                        continue

                    submission_exists = ModuleTestSubmission.objects.filter(
                        test=test,
                        student=locked_app.student
                    ).exists()

                    if not submission_exists:
                        # 4. Create MISSED submission
                        submission = ModuleTestSubmission.objects.create(
                            test=test,
                            student=locked_app.student,
                            cohort=locked_app.assigned_cohort,
                            status=ModuleTestSubmission.Status.MISSED,
                            qualified=False,
                            marks_obtained=0,
                            percentage=0,
                        )

                        # Cohort removal requires an administrator's review.
                        missed_count += 1
                        logger.info("Recorded missed module test for admin review")
            except Exception:
                logger.exception(f"Failed to enforce missed test {test.id} for student {app.student.student_code}")

    return {"enforced_missed_tests": missed_count}
