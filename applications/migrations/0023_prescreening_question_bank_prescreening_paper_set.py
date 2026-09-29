from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("applications", "0022_remove_application_cohort_status_requires_assigned_cohort_and_more"),
        ("question_bank", "0005_questionbank_lifecycle_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescreening",
            name="paper_set",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Paper code from the selected question bank, for example A, B, C, or D.",
                max_length=10,
                verbose_name="Assigned Paper Set",
            ),
        ),
        migrations.AddField(
            model_name="prescreening",
            name="question_bank",
            field=models.ForeignKey(
                blank=True,
                help_text="Approved, open pre-screening question bank assigned to this candidate.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="screening_schedules",
                to="question_bank.questionbank",
            ),
        ),
    ]
