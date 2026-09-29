import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
from django.contrib.auth import get_user_model

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

qs = Attendance.objects.filter(conducted_by=mentor, class_status__in=['SCHEDULED', 'RESCHEDULED'])
print("Mentor's active classes:", qs.count())
for q in qs:
    print(q.id, q.title, q.class_status, q.conducted, q.conducted_by_id)
