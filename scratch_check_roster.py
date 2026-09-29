import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
session = Attendance.objects.get(id="869707a3-cd82-4e84-882a-d266d2d7db1b")
print(f"Meet data: {session.google_meet_attendance_data}")
from attendance.serializers import AttendanceSerializer
print(f"Serialized: {AttendanceSerializer(session).data.get('google_meet_attendance_data')}")
