import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()
mentor = User.objects.get(pk="2ed90c0a-68c2-4767-a84b-3f04532c0813")

print("Mentor role:", mentor.role)
print("Mentored cohorts:", mentor.mentored_cohorts.all().values_list('id', flat=True))
print("Current mentored cohorts:", mentor.current_mentored_cohorts_plural.all().values_list('id', flat=True))

