import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import RequestFactory
from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import date, timedelta

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = RequestFactory()

# 1. Create class
data = {
    "title": "Mentor Test Class Factory",
    "frontend_cohort_id": str(cohort.id),
    "class_date": str(date.today() + timedelta(days=1)),
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "session_type": "Domain"
}
request = factory.post('/api/attendance/', data, content_type='application/json')
request.user = mentor

view = AttendanceViewSet.as_view({'post': 'create'})
resp = view(request)
print("Create resp:", resp.status_code, resp.data if hasattr(resp, 'data') else '')

# 2. Fetch ACTIVE classes
request2 = factory.get(f'/api/attendance/?status=ACTIVE&cohort={cohort.id}')
request2.user = mentor

view2 = AttendanceViewSet.as_view({'get': 'list'})
resp2 = view2(request2)
print("List resp:", resp2.status_code)
if hasattr(resp2, 'data'):
    results = resp2.data.get('results', [])
    print("Found classes:", len(results))
    for r in results:
        print(r['id'], r['title'], r['class_status'], r.get('conducted'))
