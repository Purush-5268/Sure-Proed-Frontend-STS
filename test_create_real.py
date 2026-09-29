import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import date, timedelta
import json

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = APIRequestFactory()
stream_id = str(cohort.course.id) if cohort.course else None

data = {
    "title": "Mentor Creation Real Test",
    "frontend_cohort_id": str(cohort.id),
    "stream_id": stream_id,
    "class_date": str(date.today() + timedelta(days=1)),
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "session_type": "Domain",
    "guest_emails": []
}

request = factory.post('/api/attendance/', data=json.dumps(data), content_type='application/json')
force_authenticate(request, user=mentor)

view = AttendanceViewSet.as_view({'post': 'create'})
resp = view(request)
print("Create resp:", resp.status_code)
if resp.status_code < 400:
    from attendance.models import Attendance
    c = Attendance.objects.get(pk=resp.data['id'])
    print(f"Class created: {c.id}")
    print(f"Cohort ID: {c.cohort_id}")
    print(f"Course ID: {c.course_id}")
    
    # NOW TEST LIST WITH STATUS=ACTIVE
    print("Testing LIST...")
    req2 = factory.get(f'/api/attendance/?status=ACTIVE&cohort={cohort.id}')
    force_authenticate(req2, user=mentor)
    view2 = AttendanceViewSet.as_view({'get': 'list'})
    resp2 = view2(req2)
    print("List count:", len(resp2.data['results']) if resp2.status_code < 400 else resp2.data)
else:
    print(resp.data)

