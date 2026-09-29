import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assignments", "0006_alter_assignment_created_by"),
        ("courses", "0012_alter_course_created_by"),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="elective",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "For Capstone assignments: the elective course this project is scoped to. "
                    "When set, only students whose Application course matches this elective "
                    "will see and be able to submit this capstone. Leave blank to make the "
                    "capstone available to all students in the cohort."
                ),
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="capstone_projects",
                to="courses.course",
            ),
        ),
    ]
