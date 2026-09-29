from django.db.migrations.operations.fields import AddField


class AddFieldIfMissing(AddField):
    """Reconcile the identical class_status additions on two historical branches."""

    def _exists(self, schema_editor, model):
        with schema_editor.connection.cursor() as cursor:
            columns = schema_editor.connection.introspection.get_table_description(cursor, model._meta.db_table)
        return any(column.name == model._meta.get_field(self.name).column for column in columns)

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        if not self._exists(schema_editor, model):
            super().database_forwards(app_label, schema_editor, from_state, to_state)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        model = from_state.apps.get_model(app_label, self.model_name)
        if self._exists(schema_editor, model):
            super().database_backwards(app_label, schema_editor, from_state, to_state)
