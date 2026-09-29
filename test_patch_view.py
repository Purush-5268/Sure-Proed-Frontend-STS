import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from cohorts.views import CohortViewSet
from cohorts.models import Cohort
from django.contrib.auth import get_user_model

User = get_user_model()
admin = User.objects.filter(is_superuser=True).first()
cohort = Cohort.objects.first()

factory = APIRequestFactory()
request = factory.patch(f'/api/cohorts/{cohort.id}/', data={"application_end_date": None}, format='json')
force_authenticate(request, user=admin)
view = CohortViewSet.as_view({'patch': 'partial_update'})
response = view(request, pk=str(cohort.id))
print("Status Code:", response.status_code)
print("Data:", response.data)
