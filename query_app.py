import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from applications.serializers import ApplicationSerializer
from applications.models import Application
app = Application.objects.filter(application_number="APP-2026-00376-63E7C7-NMED-CYBERSEC-G17CS").first()
data = ApplicationSerializer(app).data
print("course:", data.get('course'), type(data.get('course')))
print("course_title:", data.get('course_title'))
print("course_name:", data.get('course_name', 'not found'))
