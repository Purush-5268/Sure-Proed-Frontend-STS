from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0027_manualexamination_question_bank"),
    ]

    operations = [
        migrations.AlterField(
            model_name="manualexamination",
            name="reference_link",
            field=models.TextField(blank=True, null=True),
        ),
    ]