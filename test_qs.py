import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from rest_framework.test import APIRequestFactory, force_authenticate

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = APIRequestFactory()

print(f"Mentor: {mentor.email}, Cohort: {cohort.id}")

# Simulate ACTIVE fetch
req = factory.get(f'/api/attendance/?status=ACTIVE&cohort={cohort.id}')
force_authenticate(req, user=mentor)

view = AttendanceViewSet.as_view({'get': 'list'})
resp = view(req)
print("ACTIVE status:", resp.status_code)
if resp.status_code < 400:
    print("ACTIVE count:", len(resp.data['results']))
    for r in resp.data['results']:
        print(r['title'], r['class_status'], r['effective_status'])

