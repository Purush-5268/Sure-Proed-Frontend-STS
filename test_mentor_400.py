import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import config.settings
config.settings.DEBUG = True

django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

client = APIClient()
client.force_authenticate(user=user)

try:
    resp = client.get("/api/attendance/classschedule/?status=ACTIVE")
    print("Status Code:", resp.status_code)
    print("Content:", resp.content.decode('utf-8')[:500])
except Exception as e:
    import traceback
    traceback.print_exc()
