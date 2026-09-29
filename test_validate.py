import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from cohorts.serializers import CohortSerializer

data = {
    "application_end_date": None
}
serializer = CohortSerializer(data=data, partial=True)
if not serializer.is_valid():
    print("Error for None:", serializer.errors)
else:
    print("None is Valid")

data2 = {
    "application_end_date": ""
}
serializer2 = CohortSerializer(data=data2, partial=True)
if not serializer2.is_valid():
    print("Error for empty string:", serializer2.errors)
else:
    print("Empty string is Valid")
