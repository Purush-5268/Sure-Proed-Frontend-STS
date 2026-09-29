import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Course
from cohorts.models import Cohort
from applications.models import Application

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Course)
def on_course_status_changed(sender, instance, **kwargs):
    """
    When a course status transitions to CANCELLED:
    - Automatically updates all linked open/active cohorts to CANCELLED.
    - Automatically cancels all open applications for those cohorts.
    """
    if instance.status == Course.Status.CANCELLED:
        # 1. Update all linked open/active cohorts to CANCELLED
        updated_cohorts = Cohort.objects.filter(
            course=instance,
            status__in=[
                Cohort.Status.OPEN,
                Cohort.Status.ACTIVE,
                Cohort.Status.TRAINING,
                Cohort.Status.DRAFT,
                Cohort.Status.SOFT_SKILLS,
                Cohort.Status.INTERNSHIP,
            ],
        ).update(status=Cohort.Status.CANCELLED)
        if updated_cohorts:
            logger.info(f"Course '{instance.code}' cancelled: updated {updated_cohorts} cohort(s) to CANCELLED.")

        # 2. Immediately close and cancel open applications for this course/cohorts
        from applications.services.state_machine import transition_application_status

        open_apps = Application.objects.filter(course=instance).exclude(
            status__in=[
                Application.Status.DROPPED,
                Application.Status.COMPLETED,
                Application.Status.CANCELLED,
                Application.Status.REJECTED,
            ]
        )
        for app in open_apps:
            try:
                transition_application_status(
                    app,
                    Application.Status.CANCELLED,
                    reason=f"Course '{instance.name}' was cancelled.",
                )
            except Exception as e:
                logger.error(f"Error cancelling application {app.id} on course cancellation: {e}")
