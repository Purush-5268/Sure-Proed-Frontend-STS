import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from cohorts.models import Cohort
from django.contrib.auth import get_user_model

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

print(f"Cohort {cohort.id}, course: {cohort.course_id}")
