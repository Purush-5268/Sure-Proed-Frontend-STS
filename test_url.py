import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.urls import resolve
print(resolve('/api/attendance/'))
