import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from students.models import StudentProfile
from attendance.models import AbsenceWarning
from attendance.services.discipline_reconciliation_service import reconcile_student_discipline

sp = StudentProfile.objects.filter(user__email="ganeswararaoryalig16autocad@gmail.com").first()
if sp:
    print("Found student:", sp.user.email)
    warnings = AbsenceWarning.objects.filter(student=sp, status="PENDING")
    for w in warnings:
        if not w.apology_text:
            w.delete()
        else:
            w.resolved = True
            w.save(update_fields=['resolved'])
    print("Cleaned up warnings.")
    
    # Re-evaluate
    res = reconcile_student_discipline(sp, reason="Manual fix")
    print("Reconciliation result:", res)
else:
    print("Student not found.")

