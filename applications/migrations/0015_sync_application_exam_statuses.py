from django.db import migrations


def sync_application_exam_statuses(apps, schema_editor):
    Application = apps.get_model("applications", "Application")
    PreScreening = apps.get_model("applications", "PreScreening")

    # Applications with scheduled screening exams currently marked as PRESCREENING_PENDING -> update to EXAM_PENDING
    scheduled_app_ids = PreScreening.objects.filter(
        status__in=["SCHEDULED", "RESCHEDULED"]
    ).values_list("application_id", flat=True)

    Application.objects.filter(
        id__in=scheduled_app_ids,
        status="PRESCREENING_PENDING",
    ).update(status="EXAM_PENDING")


def reverse_sync(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("applications", "0014_alter_application_offer_letter_file_and_more"),
    ]

    operations = [
        migrations.RunPython(sync_application_exam_statuses, reverse_code=reverse_sync),
    ]
