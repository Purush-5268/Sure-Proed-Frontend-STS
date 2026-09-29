from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0011_emailverificationotp_registration_data")]
    operations = [
        migrations.AddConstraint(
            model_name="user",
            constraint=models.CheckConstraint(
                condition=~models.Q(role="STUDENT") | models.Q(mapped_email__isnull=True) | models.Q(mapped_email=""),
                name="student_has_no_mapped_email",
            ),
        ),
    ]
