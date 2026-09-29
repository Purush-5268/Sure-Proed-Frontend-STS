import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
for a in Attendance.objects.filter(title__icontains="fj"):
    print(a.title, a.class_status, a.conducted, a.cohort_id)
