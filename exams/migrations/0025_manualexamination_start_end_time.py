from django.db import migrations, models
from django.utils import timezone
from datetime import timedelta


def default_end_time():
    return timezone.now() + timedelta(hours=1)


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0024_alter_manualexamination_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="manualexamination",
            name="start_time",
            field=models.DateTimeField(default=timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="manualexamination",
            name="end_time",
            field=models.DateTimeField(default=default_end_time),
            preserve_default=False,
        ),
    ]
