from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0022_moduletest_created_by"),
        ("courses", "0001_initial"),
        ("cohorts", "0001_initial"),
        ("applications", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ManualExamination",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=255)),
                ("examination_date", models.DateField()),
                ("total_questions", models.PositiveIntegerField(default=0)),
                ("maximum_marks", models.DecimalField(decimal_places=2, default=100, max_digits=8)),
                ("duration_minutes", models.PositiveIntegerField(default=0)),
                ("examination_type", models.CharField(default="SCREENING", max_length=80)),
                ("reference_link", models.URLField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, null=True)),
                ("status", models.CharField(choices=[("DRAFT", "Draft"), ("COMPLETED", "Completed")], db_index=True, default="DRAFT", max_length=20)),
                ("cohort", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="manual_examinations", to="cohorts.cohort")),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="manual_examinations", to="courses.course")),
            ],
            options={"ordering": ("-examination_date", "-created_at")},
        ),
        migrations.CreateModel(
            name="ManualExaminationResult",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("marks_obtained", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("qualified", models.BooleanField(blank=True, null=True)),
                ("completed", models.BooleanField(default=False)),
                ("application", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="manual_examination_results", to="applications.application")),
                ("examination", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="results", to="exams.manualexamination")),
            ],
            options={"ordering": ("application__student__student_code",)},
        ),
        migrations.AddConstraint(
            model_name="manualexaminationresult",
            constraint=models.UniqueConstraint(fields=("examination", "application"), name="unique_manual_exam_application"),
        ),
    ]
