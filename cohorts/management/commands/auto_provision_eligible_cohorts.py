import logging
from django.core.management.base import BaseCommand
from cohorts.tasks import auto_provision_eligible_cohorts_task

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Auto-provisions GitHub repositories and sends organization invites for all "
        "active cohorts in TRAINING status whose 15-day grace period has elapsed."
    )

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Checking for cohorts eligible for GitHub provisioning (15-day threshold)..."))
        results = auto_provision_eligible_cohorts_task()
        total_cohorts = len(results)
        self.stdout.write(
            self.style.SUCCESS(
                f"Completed auto-provisioning for {total_cohorts} eligible cohort(s)."
            )
        )
