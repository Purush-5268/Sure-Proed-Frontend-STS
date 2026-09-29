from django.db import migrations, models


CONSTRAINT_NAME = "unique_course_cohort_code"


def align_cohort_code_constraints(apps, schema_editor):
    """Align older databases without recreating already-correct production constraints."""
    Cohort = apps.get_model("cohorts", "Cohort")
    table = Cohort._meta.db_table
    connection = schema_editor.connection

    if connection.vendor == "sqlite":
        old_field = Cohort._meta.get_field("code")
        new_field = old_field.clone()
        new_field._unique = False
        new_field.set_attributes_from_name(old_field.name)
        new_field.model = Cohort
        schema_editor.alter_field(Cohort, old_field, new_field, strict=False)
        constraints = connection.introspection.get_constraints(
            connection.cursor(), table
        )
        if CONSTRAINT_NAME not in constraints:
            schema_editor.execute(
                f"CREATE UNIQUE INDEX {schema_editor.quote_name(CONSTRAINT_NAME)} "
                f"ON {schema_editor.quote_name(table)} (course_id, code)"
            )
        return

    constraints = connection.introspection.get_constraints(
        connection.cursor(), table
    )
    quoted_table = schema_editor.quote_name(table)
    for name, details in constraints.items():
        if details.get("unique") and details.get("columns") == ["code"]:
            schema_editor.execute(
                f"ALTER TABLE {quoted_table} DROP CONSTRAINT {schema_editor.quote_name(name)}"
            )

    constraints = connection.introspection.get_constraints(
        connection.cursor(), table
    )
    if CONSTRAINT_NAME not in constraints:
        schema_editor.add_constraint(
            Cohort,
            models.UniqueConstraint(
                fields=("course", "code"), name=CONSTRAINT_NAME
            ),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("cohorts", "0008_alter_cohortmessage_sender"),
    ]

    operations = [
        migrations.RunPython(
            align_cohort_code_constraints,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="cohort",
                    name="code",
                    field=models.CharField(
                        help_text="Batch code. It must be unique within the selected course.",
                        max_length=30,
                    ),
                ),
                migrations.AddConstraint(
                    model_name="cohort",
                    constraint=models.UniqueConstraint(
                        fields=("course", "code"),
                        name=CONSTRAINT_NAME,
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]
