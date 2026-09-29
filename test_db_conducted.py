import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
for a in Attendance.objects.filter(title__icontains="Mentor"):
    print(a.title, a.conducted)
