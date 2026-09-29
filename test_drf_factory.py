import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import date, timedelta

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = APIRequestFactory()

# 1. Create class
data = {
    "title": "Mentor DRF Factory",
    "frontend_cohort_id": str(cohort.id),
    "class_date": str(date.today() + timedelta(days=1)),
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "session_type": "Domain"
}
request = factory.post('/api/attendance/', data, format='json')
force_authenticate(request, user=mentor)

view = AttendanceViewSet.as_view({'post': 'create'})
resp = view(request)
print("Create resp:", resp.status_code)
class_id = None
if resp.status_code < 400:
    class_id = resp.data.get('id')
    print("Created ID:", class_id)

# 2. Fetch ACTIVE classes
request2 = factory.get(f'/api/attendance/?status=ACTIVE&cohort={cohort.id}')
force_authenticate(request2, user=mentor)
view2 = AttendanceViewSet.as_view({'get': 'list'})
resp2 = view2(request2)
print("List resp ACTIVE:", resp2.status_code)
if resp2.status_code < 400:
    results = resp2.data.get('results', [])
    print("Found ACTIVE:", len(results), [r['id'] for r in results])

# 3. Fetch conducted=false classes (ClassSchedule.jsx)
request3 = factory.get(f'/api/attendance/?conducted=false&cohort={cohort.id}')
force_authenticate(request3, user=mentor)
view3 = AttendanceViewSet.as_view({'get': 'list'})
resp3 = view3(request3)
print("List resp conducted=false:", resp3.status_code)
if resp3.status_code < 400:
    results = resp3.data.get('results', [])
    print("Found conducted=false:", len(results), [r['id'] for r in results])

