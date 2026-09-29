from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0025_manualexamination_start_end_time"),
    ]

    operations = [
        migrations.AddField(
            model_name="manualexamination",
            name="pass_percentage",
            field=models.DecimalField(decimal_places=2, default=40, max_digits=5),
        ),
        migrations.AlterField(
            model_name="manualexamination",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Draft"),
                    ("IN_PROGRESS", "In Progress"),
                    ("COMPLETED", "Completed"),
                ],
                db_index=True,
                default="DRAFT",
                max_length=20,
            ),
        ),
    ]
