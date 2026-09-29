import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from cohorts.models import Cohort
from cohorts.serializers import CohortSerializer

instance = Cohort.objects.first()
print("Testing with instance:", instance.name)

data = {
    "application_end_date": None
}
serializer = CohortSerializer(instance=instance, data=data, partial=True)
if not serializer.is_valid():
    print("Errors:", serializer.errors)
else:
    print("Valid payload with None!")
