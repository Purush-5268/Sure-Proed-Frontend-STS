import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from attendance.models import Attendance
from attendance.serializers import AttendanceSerializer
import json

session = Attendance.objects.exclude(cohort=None).first()
data = AttendanceSerializer(session).data
try:
    json.dumps(data.get('google_meet_attendance_data'))
    print("Success")
except Exception as e:
    print(f"Error: {e}")
