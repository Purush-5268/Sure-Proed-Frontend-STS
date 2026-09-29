import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import datetime
User = get_user_model()
user = User.objects.filter(email="pradeep@sureproed.org").first()
cohort = Cohort.objects.filter(name__icontains="G2-26").first()
if not cohort:
    cohort = Cohort.objects.first()

client = APIClient()
client.force_authenticate(user=user)
now = datetime.now()
data = {
    "cohort_id": str(cohort.id),
    "title": "Test Present Time Class",
    "class_date": now.strftime("%Y-%m-%d"),
    "start_time": now.strftime("%H:%M:%S"),
    "end_time": "23:59:00",
    "session_type": "DOMAIN",
}
res = client.post('/api/attendance/', data, format='json')
print("Status:", res.status_code)
if res.status_code >= 400:
    print("Content:", res.content)
