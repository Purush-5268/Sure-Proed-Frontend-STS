from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("courses", "0002_course_category_course_eligibility_criteria")]

    operations = [
        migrations.AlterField(
            model_name="course",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Draft"),
                    ("PUBLISHED", "Published"),
                    ("ARCHIVED", "Archived"),
                    ("CANCELLED", "Cancelled"),
                ],
                default="DRAFT",
                max_length=20,
            ),
        )
    ]
