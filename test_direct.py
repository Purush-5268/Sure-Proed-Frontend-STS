import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import RequestFactory
from rest_framework.test import force_authenticate
from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import datetime
import json

User = get_user_model()
user = User.objects.filter(email="pradeep@sureproed.org").first()
cohort = Cohort.objects.filter(name__icontains="G2-26").first()
if not cohort:
    cohort = Cohort.objects.first()

now = datetime.now()
data = {
    "cohort": str(cohort.id),
    "title": "Test Present Time Class",
    "class_date": now.strftime("%Y-%m-%d"),
    "start_time": now.strftime("%H:%M"),
    "end_time": "23:59:00",
    "session_type": "DOMAIN",
}

factory = RequestFactory()
request = factory.post('/api/attendance/', data, content_type='application/json')
force_authenticate(request, user=user)

view = AttendanceViewSet.as_view({'post': 'create'})
try:
    response = view(request)
    print("Status:", response.status_code)
    if response.status_code >= 400:
        print("Content:", response.data)
except Exception as e:
    import traceback
    traceback.print_exc()

