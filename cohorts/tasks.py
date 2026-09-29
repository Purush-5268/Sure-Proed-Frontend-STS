import logging
import time
from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_cohort_github_queue_task(self, cohort_id: str):
    """
    Celery background worker that processes all pending and failed queue items
    for a given cohort with rate-limit pacing and isolated error handling.
    """
    from cohorts.models import Cohort, GitHubProvisioningQueue
    from cohorts.services import process_single_github_queue_item

    try:
        cohort = Cohort.objects.get(id=cohort_id)
    except Cohort.DoesNotExist:
        logger.error(f"Cohort {cohort_id} not found for GitHub provisioning task.")
        return {"error": "Cohort not found"}

    pending_items = GitHubProvisioningQueue.objects.filter(
        cohort=cohort,
        status__in=[GitHubProvisioningQueue.Status.PENDING, GitHubProvisioningQueue.Status.FAILED],
    ).select_related("student", "student__user", "cohort", "cohort__course")

    total = pending_items.count()
    success_count = 0
    failed_count = 0
    skipped_count = 0

    logger.info(f"Starting GitHub queue processing for cohort {cohort.code} ({total} items).")

    for item in pending_items:
        try:
            status = process_single_github_queue_item(item)
            if status == GitHubProvisioningQueue.Status.SUCCESS:
                success_count += 1
            elif status == GitHubProvisioningQueue.Status.FAILED:
                failed_count += 1
            elif status == GitHubProvisioningQueue.Status.SKIPPED_NO_GITHUB:
                skipped_count += 1
        except Exception as exc:
            logger.error(f"Unhandled error processing queue item {item.id}: {exc}")
            failed_count += 1

        # Rate-limiting pacing: 0.3s delay between requests
        time.sleep(0.3)

    cohort.github_repositories_last_provisioned_at = timezone.now()
    cohort.save(update_fields=["github_repositories_last_provisioned_at", "updated_at"])

    logger.info(
        f"Finished GitHub queue for {cohort.code}: {success_count} succeeded, "
        f"{failed_count} failed (saved to Failed Queue), {skipped_count} skipped."
    )
    return {
        "cohort_code": cohort.code,
        "total": total,
        "succeeded": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
    }


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def retry_failed_github_queue_items_task(self, item_ids: list[str]):
    """
    Celery task to retry a specific batch of failed queue items.
    """
    from cohorts.models import GitHubProvisioningQueue
    from cohorts.services import process_single_github_queue_item

    items = GitHubProvisioningQueue.objects.filter(
        id__in=item_ids
    ).select_related("student", "student__user", "cohort", "cohort__course")

    success_count = 0
    failed_count = 0

    for item in items:
        try:
            status = process_single_github_queue_item(item)
            if status == GitHubProvisioningQueue.Status.SUCCESS:
                success_count += 1
            else:
                failed_count += 1
        except Exception as exc:
            logger.error(f"Error retrying queue item {item.id}: {exc}")
            failed_count += 1
        time.sleep(0.3)

    return {"retried": len(items), "succeeded": success_count, "failed": failed_count}


@shared_task
def auto_provision_eligible_cohorts_task():
    """
    Periodic task running daily via Celery Beat:
    Finds all active cohorts in TRAINING status where the 15-day grace period has passed,
    and runs the queue-based provisioning pipeline automatically.
    """
    from datetime import timedelta
    from cohorts.models import Cohort
    from cohorts.services import provision_cohort_student_repositories

    now = timezone.now()
    cutoff_date = now - timedelta(days=Cohort.GITHUB_REPOSITORY_GRACE_DAYS)

    eligible_cohorts = Cohort.objects.filter(
        status=Cohort.Status.TRAINING,
        training_started_at__isnull=False,
        training_started_at__lte=cutoff_date,
    )

    total_cohorts = eligible_cohorts.count()
    logger.info(f"Auto-provisioning GitHub repos for {total_cohorts} eligible cohorts (15-day threshold).")

    results = []
    for cohort in eligible_cohorts:
        try:
            res = provision_cohort_student_repositories(cohort, force=False)
            results.append(res)
        except Exception as exc:
            logger.error(f"Error auto-provisioning cohort {cohort.code}: {exc}")

    return results

