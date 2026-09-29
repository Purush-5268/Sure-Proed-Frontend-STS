import logging
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def handle_course_cancellation(course, actor=None):
    """
    When a course status is changed to CANCELLED:
    1. All linked non-cancelled cohorts are automatically updated to CANCELLED.
    2. All active/non-terminal applications linked to this course are transitioned to CANCELLED.
    """
    from cohorts.models import Cohort
    from applications.models import Application
    from applications.services.state_machine import transition_application_status

    if not course or course.status != course.Status.CANCELLED:
        return

    with transaction.atomic():
        # 1. Update all linked non-cancelled cohorts to CANCELLED
        cohorts_to_cancel = list(course.cohorts.exclude(status=Cohort.Status.CANCELLED))
        for cohort in cohorts_to_cancel:
            cohort.status = Cohort.Status.CANCELLED
            cohort.save(update_fields=["status", "updated_at"])

        # 2. Cancel all non-terminal applications under this course
        terminal_statuses = [
            Application.Status.REJECTED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.COMPLETED,
        ]
        active_apps = list(
            Application.objects.filter(course=course).exclude(status__in=terminal_statuses)
        )
        for app in active_apps:
            try:
                transition_application_status(
                    app,
                    Application.Status.CANCELLED,
                    user=actor if actor and getattr(actor, "is_authenticated", False) else None,
                    reason="Course was cancelled.",
                )
            except Exception as exc:
                logger.warning(
                    f"Directly setting CANCELLED on application {app.application_number} due to transition exception: {exc}"
                )
                app.status = Application.Status.CANCELLED
                app.updated_at = timezone.now()
                app.save(update_fields=["status", "updated_at"])

        logger.info(
            f"Handled course cancellation for course {course.code}: "
            f"cancelled {len(cohorts_to_cancel)} cohort(s) and {len(active_apps)} application(s)."
        )
