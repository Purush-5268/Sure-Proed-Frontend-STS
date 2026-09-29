import logging
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from applications.models import Application
from question_bank.auto_generate import auto_generate_prescreening_bank

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Application)
def trigger_auto_question_bank_generation(sender, instance, created, **kwargs):
    """
    When an application is created for a course, automatically ensure a
    Pre-Screening Question Bank is generated in the background if none exists yet.
    Uses on_commit to ensure the application record is committed first.
    """
    # Only new applicants who still need the entrance assessment require a
    # pre-screening bank. Imported/already-enrolled rows must not launch an AI
    # job merely because their Application record was created later.
    needs_prescreening = (
        created
        and instance.course_id
        and not instance.assigned_cohort_id
        and instance.status in {
            Application.Status.APPLIED,
            Application.Status.EXAM_PENDING,
        }
    )
    if needs_prescreening:
        def on_commit_generate():
            try:
                auto_generate_prescreening_bank(instance.course_id)
            except Exception as exc:
                logger.error(
                    f"Error in auto_generate_prescreening_bank for Course {instance.course_id} on Application {instance.id}: {exc}"
                )

        transaction.on_commit(on_commit_generate)
