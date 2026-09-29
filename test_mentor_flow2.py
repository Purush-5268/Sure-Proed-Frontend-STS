import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import config.settings
config.settings.DEBUG = True
config.settings.ALLOWED_HOSTS.append("localhost")

django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from attendance.models import Attendance
from datetime import datetime, date, timedelta

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

cohort = Cohort.objects.filter(mentors=mentor).first()
client = APIClient(SERVER_NAME='localhost')
client.force_authenticate(user=mentor)

payload = {
    "title": "Mentor Test Class 2",
    "frontend_cohort_id": str(cohort.id),
    "stream_id": str(cohort.course.id) if cohort.course else None,
    "class_date": str(date.today() + timedelta(days=1)),
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "session_type": "Domain",
    "guest_emails": []
}

resp = client.post("/api/attendance/", payload, format='json')
print("Create response:", resp.status_code)
if resp.status_code >= 400:
    print(resp.content.decode('utf-8')[:500])
else:
    new_class = resp.json()
    class_id = new_class['id']
    print("Created class ID:", class_id)

    resp_dashboard = client.get(f"/api/attendance/?status=ACTIVE&cohort={cohort.id}")
    print("Dashboard fetch status:", resp_dashboard.status_code)
    found_in_dashboard = any(c['id'] == class_id for c in resp_dashboard.json().get('results', []))
    print("Found in Dashboard?", found_in_dashboard)

    resp_schedule = client.get(f"/api/attendance/?conducted=false&cohort={cohort.id}")
    print("Schedule fetch status:", resp_schedule.status_code)
    found_in_schedule = any(c['id'] == class_id for c in resp_schedule.json().get('results', []))
    print("Found in Schedule?", found_in_schedule)

