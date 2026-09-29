import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.models import Attendance
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from rest_framework.test import APIRequestFactory, force_authenticate
from attendance.views import AttendanceViewSet
from attendance.serializers import AttendanceSerializer

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = APIRequestFactory()

req = factory.get(f'/api/attendance/?conducted=false&cohort={cohort.id}')
force_authenticate(req, user=mentor)

view = AttendanceViewSet.as_view({'get': 'list'})
resp = view(req)
print("status:", resp.status_code)
if resp.status_code < 400:
    results = resp.data['results']
    print(f"Total returned: {len(results)}")
    
    # Simulate frontend filter:
    filtered = [s for s in results if s['class_status'] != 'COMPLETED' and s['class_status'] != 'CANCELLED']
    print(f"Total after frontend filter: {len(filtered)}")
    for r in filtered:
        print(f"- {r['title']} | status: {r['class_status']}")

