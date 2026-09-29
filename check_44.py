import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from cohorts.models import Cohort

try:
    c = Cohort.objects.get(id="44f7975f-18af-41dd-a175-70cb2eed2bb5")
    print("Cohort exists!", c.name)
except Cohort.DoesNotExist:
    print("Cohort is really deleted.")
