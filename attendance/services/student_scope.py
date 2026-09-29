"""Student attendance visibility and scoring share the same enrollment boundary."""
from datetime import datetime, timedelta

from django.db.models import Q
from django.utils import timezone

from applications.models import Application
from attendance.models import Attendance
from cohorts.models import Cohort


ENROLLED_STATUSES = (
    "COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED",
    "SOFT_SKILLS", "TRANSFER_COHORT", "COMPLETED",
)


def enrollment_started_at(application):
    """Prefer audited enrollment; imported records retain their explicit history.

    Older applications without an assignment audit use applied_at, never the
    mutable updated_at value. Snapshot/attendee evidence is handled separately.
    """
    audits = list(application.status_audits.all())
    entries = [
        audit.created_at for audit in audits
        if audit.to_status in ENROLLED_STATUSES
        and audit.from_status not in ENROLLED_STATUSES
    ]
    transfers = [
        audit.created_at for audit in audits
        if audit.from_status == Application.Status.TRANSFER_COHORT
        and audit.to_status in ENROLLED_STATUSES
    ]
    if transfers:
        return max(transfers)
    if entries:
        return min(entries)
    issued = application.student.student_identity_issued_at
    return max(application.applied_at, issued) if issued else application.applied_at


def _after_enrollment(application):
    started = timezone.localtime(enrollment_started_at(application))
    return Q(class_date__gt=started.date()) | Q(
        class_date=started.date(), start_time__gte=started.time()
    )


def student_attendance_queryset(student, queryset=None, applications=None):
    if queryset is None:
        queryset = Attendance.objects.all()
    if applications is None:
        applications = student.applications.filter(
            assigned_cohort__isnull=False, status__in=ENROLLED_STATUSES,
        ).select_related("assigned_cohort").prefetch_related("status_audits")

    # Imported rosters explicitly identify both present AND absent students.
    # Do not infer historical membership merely from today's cohort assignment.
    visible = (
        Q(attendees=student) | Q(joined_students=student)
        | Q(google_meet_attendance_data__expected_students__has_key=str(student.pk))
        | Q(historical_attendance_data__expected_students__has_key=str(student.pk))
    )
    for application in applications:
        if not application.assigned_cohort_id or application.status not in ENROLLED_STATUSES:
            continue
        cohort = application.assigned_cohort
        targets = Q(cohort_id=cohort.pk)
        if application.status != Application.Status.COMPLETED:
            targets |= Q(class_type__in=["CELEBRATION", "UNIVERSAL"], cohort__isnull=True)
            if cohort.status in {
                Cohort.Status.ACTIVE, Cohort.Status.TRAINING,
                Cohort.Status.INTERNSHIP, Cohort.Status.SOFT_SKILLS,
            }:
                batches = Q(lst_batch__in=["GENERAL", ""]) | Q(lst_batch__isnull=True)
                if cohort.lst_batch:
                    batches |= Q(lst_batch=cohort.lst_batch)
                if cohort.lst_batch in {'BATCH_1', 'BATCH_2'}:
                    batches |= Q(lst_batch="COMBINED")
                targets |= Q(class_type="LST", cohort__isnull=True) & batches
            if cohort.status == Cohort.Status.SOFT_SKILLS:
                targets |= Q(class_type="SOFTSKILLS", cohort__isnull=True) & (
                    Q(lst_batch=cohort.lst_batch) | Q(lst_batch__isnull=True) | Q(lst_batch="")
                )
        eligible = targets & _after_enrollment(application) & (
            Q(historical_attendance_data__isnull=True) | Q(historical_attendance_data={})
        )
        if application.completed_at:
            eligible &= Q(class_date__lte=timezone.localtime(application.completed_at).date())
        visible |= eligible
    return queryset.filter(visible).distinct()


def attendance_metrics(student, application):
    """Count completed, eligible records; never turn an unpublished report into absence."""
    if not application or not application.assigned_cohort_id or application.status not in ENROLLED_STATUSES:
        return {"total": 0, "present": 0, "percentage": 0.0}
    # End Class sets conducted=False; completed academic records still count.
    now = timezone.localtime()
    sessions = student_attendance_queryset(
        student,
        Attendance.objects.filter(
            cohort_id=application.assigned_cohort_id,
            class_date__lte=now.date(),
        ).exclude(class_status__in=["CANCELLED", "RESCHEDULED"])
        .filter(Q(class_status="COMPLETED") | Q(google_meet_attendance_data__status="READY"))
        .prefetch_related("attendees", "joined_students"),
        applications=[application],
    )
    total = present = 0
    total_percentage = 0.0
    for session in sessions:
        if session.end_time:
            end = timezone.make_aware(datetime.combine(session.class_date, session.end_time))
            if session.end_time <= session.start_time:
                end += timedelta(days=1)
            if end > now:
                continue
        elif session.class_date >= now.date():
            continue
        data = session.google_meet_attendance_data or {}
        historical = session.historical_attendance_data or {}
        if historical:
            result = (historical.get("expected_students") or {}).get(str(student.pk))
            if result is None:
                continue
            is_present = result.get("status") == "PRESENT"
            pct = 100.0 if is_present else 0.0
        elif data.get("status") == "READY":
            result = (data.get("expected_students") or {}).get(str(student.pk))
            if result is None:
                continue
            if result.get("status") == "IDENTITY_REVIEW_REQUIRED":
                continue
            pct = float(result.get("attendance_percentage") or 0.0)
            if "status" in result:
                is_present = result.get("status") == "PRESENT"
            else:
                is_present = pct > 0
        else:
            is_present = any(record.pk == student.pk for record in session.attendees.all())
            pct = 100.0 if is_present else 0.0
        total += 1
        present += int(is_present)
        total_percentage += pct
    arith_pct = round(total_percentage / total, 2) if total else 0.0
    return {
        "total": total, 
        "present": present, 
        "percentage": arith_pct,
        "arithmetic_percentage": arith_pct
    }
