import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


def create_existing_staff_profiles(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    MentorProfile = apps.get_model("volunteers", "MentorProfile")
    VolunteerProfile = apps.get_model("volunteers", "VolunteerProfile")
    MentorProfile.objects.bulk_create(
        [MentorProfile(user_id=user_id) for user_id in User.objects.filter(role="MENTOR").values_list("id", flat=True)],
        ignore_conflicts=True,
    )
    VolunteerProfile.objects.bulk_create(
        [
            VolunteerProfile(user_id=user_id)
            for user_id in User.objects.filter(role__in=["VOLUNTEER", "TRUSTEE"]).values_list("id", flat=True)
        ],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("volunteers", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MentorProfile",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("company_name", models.CharField(blank=True, max_length=180)),
                ("designation", models.CharField(blank=True, max_length=150)),
                ("expertise", models.TextField(blank=True, help_text="Skills, domains, and technologies mentored.")),
                ("years_of_experience", models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("bio", models.TextField(blank=True)),
                ("linkedin_url", models.URLField(blank=True)),
                ("user", models.OneToOneField(limit_choices_to={"role": "MENTOR"}, on_delete=django.db.models.deletion.CASCADE, related_name="mentor_profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "Mentor Profile", "verbose_name_plural": "Mentor Profiles"},
        ),
        migrations.CreateModel(
            name="VolunteerProfile",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization_name", models.CharField(blank=True, max_length=180)),
                ("occupation", models.CharField(blank=True, max_length=150)),
                ("skills", models.TextField(blank=True, help_text="Volunteer skills and areas of support.")),
                ("availability_notes", models.TextField(blank=True)),
                ("bio", models.TextField(blank=True)),
                ("linkedin_url", models.URLField(blank=True)),
                ("user", models.OneToOneField(limit_choices_to={"role__in": ["VOLUNTEER", "TRUSTEE"]}, on_delete=django.db.models.deletion.CASCADE, related_name="volunteer_profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "Volunteer Profile", "verbose_name_plural": "Volunteer Profiles"},
        ),
        migrations.RunPython(create_existing_staff_profiles, migrations.RunPython.noop),
    ]
