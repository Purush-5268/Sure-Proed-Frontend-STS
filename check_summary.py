import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import AttendanceSummary
from students.models import StudentProfile

sessions = ["9e0f3647-aaa9-456f-b4a9-2c074fd43ccc", "aa3893ca-353a-4905-bee5-493338c1a97e"]

summaries = AttendanceSummary.objects.filter(session_id__in=sessions)
for s in summaries:
    print(f"Session {s.session_id}, Student: {s.student.user.email}")
    print(f"Status: {s.status}")
    print(f"Percentage: {s.attendance_percentage}%")
    print("-" * 20)
