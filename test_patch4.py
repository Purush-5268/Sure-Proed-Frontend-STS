import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from cohorts.models import Cohort
from cohorts.serializers import CohortSerializer

instance = Cohort.objects.first()

data = {
    "code": "G99",
    "name": "",
    "course": str(instance.course.id),
    "start_date": "2026-09-01",
    "end_date": "2026-12-01",
    "application_end_date": None,
    "max_students": 30,
    "status": "OPEN",
    "whatsapp_group_link": None,
    "meeting_link": None,
    "rules_and_regulations": None,
    "lst_batch": None
}
serializer = CohortSerializer(instance=instance, data=data, partial=True)
if not serializer.is_valid():
    print("Errors:", serializer.errors)
else:
    print("Valid payload!")
