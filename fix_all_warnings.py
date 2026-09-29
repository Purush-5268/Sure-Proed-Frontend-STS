import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from students.models import StudentProfile
from attendance.models import AbsenceWarning
from applications.models import Application

# Get all pending warnings
warnings = AbsenceWarning.objects.filter(status="PENDING", resolved=False)
count = 0

active_statuses = [
    Application.Status.COHORT_ASSIGNED,
    Application.Status.IN_PROGRESS,
    Application.Status.TRAINING,
    Application.Status.INTERNSHIP_ASSIGNED,
    Application.Status.SOFT_SKILLS
]

for w in warnings:
    sp = w.student
    # If the student has an active application, they shouldn't have an unresolved PENDING warning
    # blocking them, because an admin already manually unsuspended them.
    active_app = sp.applications.filter(status__in=active_statuses).first()
    
    if active_app:
        if not w.apology_text:
            w.delete()
        else:
            w.resolved = True
            w.save(update_fields=['resolved'])
        count += 1

print(f"Successfully cleaned up {count} stale warnings for active students.")
