import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
from django.contrib.auth import get_user_model

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

qs = Attendance.objects.filter(cohort_id="8b74746a-4cd6-4b55-b4ae-8f32ec9fb92e")
print(f"G7 Classes ({qs.count()}):")
for q in qs:
    print(f"- {q.title} | {q.class_status} | {q.conducted} | By: {q.conducted_by.email if q.conducted_by else 'None'}")
