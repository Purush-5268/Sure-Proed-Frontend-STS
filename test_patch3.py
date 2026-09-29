import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from cohorts.models import Cohort
from cohorts.serializers import CohortSerializer

instance = Cohort.objects.first()

data = {
    "application_end_date": "2030-01-01T00:00:00Z"
}
serializer = CohortSerializer(instance=instance, data=data, partial=True)
if not serializer.is_valid():
    print("Errors:", serializer.errors)
else:
    print("Valid payload!")
