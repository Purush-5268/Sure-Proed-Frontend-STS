import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import config.settings
config.settings.DEBUG = True
config.settings.ALLOWED_HOSTS.append('testserver')

django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from datetime import date, timedelta
import json

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

client = Client()
client.force_login(mentor)

data = {
    "title": "Mentor Client Login Test",
    "frontend_cohort_id": str(cohort.id),
    "stream_id": str(cohort.course.id) if cohort.course else None,
    "class_date": str(date.today() + timedelta(days=1)),
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "session_type": "Domain",
    "guest_emails": []
}
resp = client.post('/api/attendance/', data=json.dumps(data), content_type='application/json', follow=True)
print("Create resp:", resp.status_code)
class_id = None
if resp.status_code < 400:
    try:
        class_id = resp.json().get('id')
        print("Created ID:", class_id)
    except:
        print("Not json:", resp.content.decode()[:200])

resp2 = client.get(f'/api/attendance/?status=ACTIVE&cohort={cohort.id}', follow=True)
print("List resp ACTIVE:", resp2.status_code)
if resp2.status_code < 400:
    try:
        results = resp2.json().get('results', [])
        print("Found ACTIVE:", len(results), [r['id'] for r in results])
    except:
        pass

resp3 = client.get(f'/api/attendance/?conducted=false&cohort={cohort.id}', follow=True)
print("List resp conducted=false:", resp3.status_code)
if resp3.status_code < 400:
    try:
        results = resp3.json().get('results', [])
        print("Found conducted=false:", len(results), [r['id'] for r in results])
    except:
        pass

