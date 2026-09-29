import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
import json

sessions = Attendance.objects.filter(title__icontains="CAD-MECHANICAL")
for s in sessions:
    print("ID:", s.id)
    print("Title:", s.title)
    print("Class Status:", s.class_status)
    print("Time:", s.start_time, "-", s.end_time)
    if s.google_meet_attendance_data:
        print("Data Status:", s.google_meet_attendance_data.get("status"))
        print("Scraper Log:", s.google_meet_attendance_data.get("scraper_log", "No log"))
    else:
        print("Data Status: None")
    print("-" * 40)
