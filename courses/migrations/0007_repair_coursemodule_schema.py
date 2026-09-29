from django.db import migrations, models


def _column_names(schema_editor, table_name):
    with schema_editor.connection.cursor() as cursor:
        description = schema_editor.connection.introspection.get_table_description(
            cursor,
            table_name,
        )
    return {column.name for column in description}


def _add_required_text_field(schema_editor, model, field_name):
    temporary_field = models.CharField(max_length=255, null=True)
    temporary_field.set_attributes_from_name(field_name)
    temporary_field.model = model
    schema_editor.add_field(model, temporary_field)

    model.objects.using(schema_editor.connection.alias).filter(
        **{f"{field_name}__isnull": True}
    ).update(**{field_name: ""})
    schema_editor.alter_field(
        model,
        temporary_field,
        model._meta.get_field(field_name),
        strict=False,
    )


def repair_coursemodule_schema(apps, schema_editor):
    """Repair databases where an older CourseModule table was fake-migrated.

    Some deployed databases already had a legacy ``courses_coursemodule`` table
    with ``name`` instead of ``title`` and without the newer module fields.  The
    0004 migration was recorded as applied there, so a normal migration cannot
    reconcile the physical table.  This operation is deliberately idempotent:
    new installations are left untouched while legacy rows and names are kept.
    """

    course_module = apps.get_model("courses", "CourseModule")
    table_name = course_module._meta.db_table
    connection = schema_editor.connection

    if table_name not in connection.introspection.table_names():
        return

    columns = _column_names(schema_editor, table_name)

    if "title" not in columns:
        if "name" in columns:
            legacy_name = models.CharField(max_length=255)
            legacy_name.set_attributes_from_name("name")
            legacy_name.model = course_module
            schema_editor.alter_field(
                course_module,
                legacy_name,
                course_module._meta.get_field("title"),
                strict=False,
            )
        else:
            _add_required_text_field(schema_editor, course_module, "title")
        columns = _column_names(schema_editor, table_name)

    if "module_number" not in columns:
        temporary_number = models.PositiveIntegerField(null=True)
        temporary_number.set_attributes_from_name("module_number")
        temporary_number.model = course_module
        schema_editor.add_field(course_module, temporary_number)

        course_module.objects.using(connection.alias).update(
            module_number=models.F("order")
        )
        schema_editor.alter_field(
            course_module,
            temporary_number,
            course_module._meta.get_field("module_number"),
            strict=False,
        )
        columns = _column_names(schema_editor, table_name)

    for field_name in ("description", "topics"):
        if field_name not in columns:
            schema_editor.add_field(
                course_module,
                course_module._meta.get_field(field_name),
            )
            columns.add(field_name)

    with connection.cursor() as cursor:
        constraints = connection.introspection.get_constraints(cursor, table_name)
    if "unique_course_module_number" not in constraints:
        constraint = next(
            constraint
            for constraint in course_module._meta.constraints
            if constraint.name == "unique_course_module_number"
        )
        schema_editor.add_constraint(course_module, constraint)


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0006_course_default_screening_at"),
    ]

    operations = [
        migrations.RunPython(
            repair_coursemodule_schema,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
