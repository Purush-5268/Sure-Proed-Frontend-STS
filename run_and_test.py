import subprocess
import time
import requests
import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

refresh = RefreshToken.for_user(mentor)
access_token = str(refresh.access_token)

# Start server
server = subprocess.Popen(["/home/dev1/pradeep-backend/venv/bin/python", "manage.py", "runserver", "8080"])
time.sleep(3) # Wait for server to start

headers = {"Authorization": f"Bearer {access_token}"}

try:
    print("Fetching active classes...")
    r = requests.get("http://127.0.0.1:8080/api/attendance/?status=ACTIVE", headers=headers)
    print("ACTIVE:", r.status_code, len(r.json().get('results', [])))

    print("Fetching conducted=false...")
    r = requests.get("http://127.0.0.1:8080/api/attendance/?conducted=false", headers=headers)
    print("CONDUCTED=FALSE:", r.status_code, len(r.json().get('results', [])))
finally:
    server.terminate()

