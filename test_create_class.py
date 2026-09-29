import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import RequestFactory
from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import date, timedelta
import json

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = RequestFactory()
stream_id = str(cohort.course.id) if cohort.course else None

data = {
    "title": "Mentor Creation Test",
    "frontend_cohort_id": str(cohort.id),
    "stream_id": stream_id,
    "class_date": str(date.today() + timedelta(days=1)),
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "session_type": "Domain",
    "guest_emails": []
}

request = factory.post('/api/attendance/', data=json.dumps(data), content_type='application/json')
request.user = mentor

view = AttendanceViewSet.as_view({'post': 'create'})
resp = view(request)
print("Create resp:", resp.status_code)
if resp.status_code < 400:
    from attendance.models import Attendance
    c = Attendance.objects.get(pk=resp.data['id'])
    print(f"Class created: {c.id}")
    print(f"Cohort ID: {c.cohort_id}")
    print(f"Course ID: {c.course_id}")
else:
    print(resp.data)

