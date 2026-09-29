import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
try:
    a = Attendance.objects.get(id="5b51137d-1328-4113-b77c-bceefa4df769")
    print(a.title, a.class_status, a.conducted, a.cohort_id)
except Attendance.DoesNotExist:
    print("Does not exist")
