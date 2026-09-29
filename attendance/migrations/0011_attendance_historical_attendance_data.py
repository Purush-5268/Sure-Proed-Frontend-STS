from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("attendance", "0010_alter_attendance_class_date_and_more")]
    operations = [migrations.AddField(
        model_name="attendance", name="historical_attendance_data",
        field=models.JSONField(blank=True, null=True),
    )]
