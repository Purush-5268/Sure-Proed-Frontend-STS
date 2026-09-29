import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance

try:
    session = Attendance.objects.get(id="869707a3-cd82-4e84-882a-d266d2d7db1b")
    print(f"Title: {session.title}")
    print(f"Created At: {session.created_at}")
    print(f"Updated At: {session.updated_at}")
    print(f"Conducted By: {session.conducted_by.email if session.conducted_by else 'None'}")
    print(f"Cohort: {session.cohort.code if session.cohort else 'None'}")
    print(f"Status: {session.class_status}")
except Attendance.DoesNotExist:
    print("Class not found in database.")
