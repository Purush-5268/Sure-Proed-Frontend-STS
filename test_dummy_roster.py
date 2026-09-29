import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from attendance.models import Attendance
from attendance.serializers import AttendanceSerializer
session = Attendance.objects.get(id="869707a3-cd82-4e84-882a-d266d2d7db1b")
data = AttendanceSerializer(session).data
print("Is null?", data.get('google_meet_attendance_data') is None)
print("Data:", data.get('google_meet_attendance_data'))
