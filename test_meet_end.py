import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.services.google_meet_service import check_meet_conference_ended

link = "https://meet.google.com/zyk-aiva-hwe"
result = check_meet_conference_ended(link)
print(f"Result for {link}: {result}")
