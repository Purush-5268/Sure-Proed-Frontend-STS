# Generated manually to expand application_number length for Postgres VARCHAR(100)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0012_application_training_batch'),
    ]

    operations = [
        migrations.AlterField(
            model_name='application',
            name='application_number',
            field=models.CharField(max_length=100, unique=True),
        ),
    ]
