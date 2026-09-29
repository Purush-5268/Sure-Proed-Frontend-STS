import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance

latest = Attendance.objects.all().order_by('-id')[:5]
for c in latest:
    print(c.id, c.title, c.class_status, c.conducted, c.class_type, getattr(c.conducted_by, 'email', 'None'), getattr(c.cohort, 'id', 'None'))
