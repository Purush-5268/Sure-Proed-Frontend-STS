from django.db import migrations
from django.utils import timezone


def reconcile(apps, schema_editor):
    Notification = apps.get_model("common", "Notification")
    Announcement = apps.get_model("common", "Announcement")
    # Only merge records with provable source identity, never by similar text.
    for announcement in Announcement.objects.all().iterator():
        rows = Notification.objects.filter(action_url=f"announcements?announcement_id={announcement.pk}")
        recipients = rows.values_list("user_id", flat=True).distinct()
        for user_id in list(recipients):
            versions = rows.filter(user_id=user_id).order_by("-updated_at", "-id")
            latest = versions.first()
            versions.exclude(pk=latest.pk).delete()
            payload = dict(announcement_id=announcement.pk, dedupe_key=f"announcement:{announcement.pk}",
                           title=f"Announcement: {announcement.title}", message=announcement.message)
            if latest.title != payload['title'] or latest.message != payload['message']:
                payload.update(updated_at=timezone.now(), is_read=False)
            Notification.objects.filter(pk=latest.pk).update(**payload)
    # Exact duplicate deliveries have no independent state to preserve.
    from django.db.models import Count
    fields = ("user_id", "title", "message", "notification_type", "action_url")
    duplicates = Notification.objects.filter(dedupe_key__isnull=True).values(*fields).annotate(n=Count("id")).filter(n__gt=1)
    for signature in list(duplicates):
        signature.pop("n")
        rows = Notification.objects.filter(dedupe_key__isnull=True, **signature).order_by("-updated_at", "-id")
        latest = rows.first()
        rows.exclude(pk=latest.pk).delete()


class Migration(migrations.Migration):
    dependencies = [("common", "0011_alter_notification_options_notification_announcement_and_more")]
    operations = [migrations.RunPython(reconcile, migrations.RunPython.noop)]
