import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.filter(email="pradeep@sureproed.org").first()
client = APIClient()
client.force_authenticate(user=user)
res = client.get('/api/attendance/?conducted=false')
print("Status:", res.status_code)
print("Content:", res.content)
