from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0026_manualexamination_status_and_pass_percentage"),
        ("question_bank", "0005_questionbank_lifecycle_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="manualexamination",
            name="question_bank",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="manual_examinations",
                to="question_bank.questionbank",
            ),
        ),
    ]