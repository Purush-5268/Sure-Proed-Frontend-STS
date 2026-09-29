import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from cohorts.serializers import CohortSerializer
from courses.models import Course

course = Course.objects.first()
data = {
    "code": "G99",
    "course": str(course.id),
    "start_date": "2026-09-01",
    "end_date": "2026-12-01",
    "application_end_date": None,
    "max_students": 30,
    "status": "OPEN"
}
serializer = CohortSerializer(data=data, partial=True)
if not serializer.is_valid():
    print(serializer.errors)
else:
    print("Valid")
