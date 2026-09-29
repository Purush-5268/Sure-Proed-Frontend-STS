import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cohorts", "0010_add_is_edited_to_cohortmessage"),
        ("courses", "0012_alter_course_created_by"),
    ]

    operations = [
        migrations.AddField(
            model_name="cohort",
            name="current_module",
            field=models.ForeignKey(
                blank=True,
                help_text="The module the cohort is currently on. Used to highlight the active module test.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="active_cohorts",
                to="courses.coursemodule",
            ),
        ),
    ]
