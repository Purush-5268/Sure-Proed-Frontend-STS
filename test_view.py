import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from attendance.views import AttendanceViewSet
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from django.test import RequestFactory

User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")
cohort = Cohort.objects.filter(mentors=mentor).first()

factory = RequestFactory()

print(f"Mentor: {mentor.email}, Cohort: {cohort.id}")

# Simulate ACTIVE fetch
req = factory.get(f'/api/attendance/?status=ACTIVE&cohort={cohort.id}')
req.user = mentor
view = AttendanceViewSet()
view.request = req
view.format_kwarg = None
qs = view.get_queryset()
print("ACTIVE qs count:", qs.count())

# Simulate conducted=false fetch
req2 = factory.get(f'/api/attendance/?conducted=false&cohort={cohort.id}')
req2.user = mentor
view2 = AttendanceViewSet()
view2.request = req2
view2.format_kwarg = None
qs2 = view2.get_queryset()
print("conducted=false qs count:", qs2.count())

