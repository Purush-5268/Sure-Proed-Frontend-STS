from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("applications", "0004_application_offer_letter_file_and_more")]

    operations = [
        migrations.AlterField(
            model_name="application",
            name="status",
            field=models.CharField(
                choices=[
                    ("APPLIED", "Applied"),
                    ("PRESCREENING_PENDING", "Pre-Screening Pending"),
                    ("PRESCREENING_COMPLETED", "Pre-Screening Completed"),
                    ("EXAM_PENDING", "Exam Pending"),
                    ("EXAM_COMPLETED", "Exam Completed"),
                    ("QUALIFIED", "Qualified"),
                    ("REJECTED", "Rejected"),
                    ("WAITLISTED", "Waitlisted"),
                    ("COHORT_ASSIGNED", "Cohort Assigned"),
                    ("IN_PROGRESS", "In Progress"),
                    ("COMPLETED", "Completed"),
                    ("DROPPED", "Dropped"),
                    ("CANCELLED", "Cancelled"),
                ],
                db_index=True,
                default="APPLIED",
                max_length=30,
            ),
        )
    ]
