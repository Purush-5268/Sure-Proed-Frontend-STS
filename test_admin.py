import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.filter(is_staff=True).first()
client = APIClient(SERVER_NAME='api.sureproed.com')
client.force_authenticate(user=user)
res = client.get('/api/attendance/admin_active_classes/', HTTP_HOST='api.sureproed.com')
print(res.status_code)
if res.status_code == 500:
    print(res.content)
