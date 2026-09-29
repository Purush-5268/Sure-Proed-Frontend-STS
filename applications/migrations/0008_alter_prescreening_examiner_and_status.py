from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("applications", "0007_alter_prescreening_options_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="prescreening",
            name="interviewer",
            field=models.CharField(
                blank=True,
                max_length=150,
                null=True,
                verbose_name="Examiner",
            ),
        ),
        migrations.AlterField(
            model_name="prescreening",
            name="status",
            field=models.CharField(
                choices=[
                    ("SCHEDULED", "Scheduled"),
                    ("RESCHEDULED", "Rescheduled"),
                    ("PASSED", "Passed"),
                    ("FAILED", "Failed"),
                ],
                db_index=True,
                default="SCHEDULED",
                max_length=30,
            ),
        ),
    ]
