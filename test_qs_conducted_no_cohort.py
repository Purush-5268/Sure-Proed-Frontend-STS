import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

factory = APIRequestFactory()

req = factory.get('/api/attendance/?conducted=false')
force_authenticate(req, user=mentor)

view = AttendanceViewSet.as_view({'get': 'list'})
resp = view(req)
print("No cohort CONDUCTED=false status:", resp.status_code)
if resp.status_code < 400:
    print("No cohort CONDUCTED=false count:", len(resp.data['results']))
    for r in resp.data['results']:
        print(r['title'])

