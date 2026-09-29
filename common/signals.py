from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache

from students.models import StudentProfile, StudentPlacement
from applications.models import Application
from certificates.models import Certificate
from cohorts.models import Cohort
from companies.models import Company
from common.models import Notification


@receiver(post_delete, sender=Notification)
def notification_deleted(sender, instance, **kwargs):
    from common.services.mobile_push import queue_notification
    queue_notification(instance.pk, user_id=instance.user_id)

# List of models that affect the platform statistics
STATS_MODELS = [
    StudentProfile,
    StudentPlacement,
    Application,
    Certificate,
    Cohort,
    Company
]

@receiver([post_save, post_delete], sender=StudentProfile)
@receiver([post_save, post_delete], sender=StudentPlacement)
@receiver([post_save, post_delete], sender=Application)
@receiver([post_save, post_delete], sender=Certificate)
@receiver([post_save, post_delete], sender=Cohort)
@receiver([post_save, post_delete], sender=Company)
def invalidate_platform_stats_cache(sender, instance, **kwargs):
    """
    Invalidates the platform analytics cache whenever a related model is saved or deleted.
    This ensures the landing page statistics are always strictly in sync with the database.
    """
    cache.delete('platform:analytics:stats')
