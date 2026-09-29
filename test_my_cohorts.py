import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from cohorts.views import CohortViewSet

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
factory = APIRequestFactory()

req = factory.get('/api/cohorts/my_cohorts/')
force_authenticate(req, user=mentor)

try:
    view = CohortViewSet.as_view({'get': 'my_cohorts'})
    resp = view(req)
    print("my_cohorts status:", resp.status_code)
except Exception as e:
    print("Error:", e)
