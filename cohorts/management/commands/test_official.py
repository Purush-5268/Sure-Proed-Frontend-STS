from django.core.management.base import BaseCommand
from django.test import Client
from accounts.models import User
from attendance.models import Attendance
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        c = Client()
        admin = User.objects.filter(role='ADMIN').first()
        c.force_login(admin)

        session = Attendance.objects.exclude(meeting_link__isnull=True).exclude(meeting_link='').order_by('-created_at').first()

        res = c.get(f'/api/attendance/{session.id}/official-attendance/')
        print("Status:", res.status_code)
        try:
            print("Response JSON length:", len(json.dumps(res.json())))
        except Exception:
            print("Response TEXT:", res.content)
