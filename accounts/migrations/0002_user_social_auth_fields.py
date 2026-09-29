from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_social_auth_linked',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='social_provider',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='linkedin_id',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
