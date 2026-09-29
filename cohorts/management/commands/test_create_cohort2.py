from django.core.management.base import BaseCommand
from django.test import Client
from accounts.models import User
from courses.models import Course
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        c = Client()
        admin = User.objects.filter(role='ADMIN').first()
        c.force_login(admin)

        course = Course.objects.first()

        payload = {
            "code": "API-TEST-100",
            "course": str(course.id),
            "start_date": "2027-01-01",
            "end_date": "2027-06-01",
            "status": "DRAFT"
        }

        res = c.post('/api/cohorts/', data=json.dumps(payload), content_type='application/json')
        print("Status:", res.status_code)
        try:
            print("Response JSON:", res.json())
        except Exception:
            print("Response TEXT:", res.content)
