import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from applications.models import Application, generate_application_number

User = get_user_model()
email = "lavanyamidatala@gmail.com"

try:
    user = User.objects.get(email__iexact=email)
    print(f"User found: {user.first_name} {user.last_name}")
except User.DoesNotExist:
    print(f"User with email {email} not found.")
    exit(1)

apps = Application.objects.filter(student__user=user)
if not apps.exists():
    print("User has no applications.")
    exit(1)

target_cohort = Cohort.objects.filter(code__icontains="G8", name__icontains="Cloud").first()
if not target_cohort:
    print("Cohort G8 Cloud not found.")
    exit(1)

print(f"Target Cohort found: {target_cohort.name}")

app_to_move = apps.first()
old_num = app_to_move.application_number

app_to_move.assigned_cohort = target_cohort
app_to_move.course = target_cohort.course
new_num = generate_application_number(course=target_cohort.course, cohort=target_cohort)
app_to_move.application_number = new_num
app_to_move.save()

# Ensure the DB is updated if save() doesn't touch it
Application.objects.filter(pk=app_to_move.pk).update(application_number=new_num)

print(f"Move completed successfully. {old_num} -> {new_num}")
