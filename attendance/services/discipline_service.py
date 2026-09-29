import logging
from django.contrib.auth import get_user_model
from applications.models import Application
from cohorts.models import Cohort
from attendance.models import AbsenceWarning, PriorPermission
from applications.services.state_machine import transition_application_status
from common.services.notifications import notify_user
from common.models import Notification
from attendance.services.discipline_reconciliation_service import DISCIPLINE_THRESHOLD

logger = logging.getLogger(__name__)

def evaluate_session_discipline(session):
    """
    Evaluates and applies attendance discipline (warnings and suspensions) for a finalized session.
    Uses authoritative percentage from session.google_meet_attendance_data.
    Safely handles PriorPermission and resolves/cleans up stale warnings without destroying history.
    """
    if not session.google_meet_attendance_data or session.google_meet_attendance_data.get("status") != "READY":
        return

    result = session.google_meet_attendance_data
    User = get_user_model()
    system_user = User.objects.filter(is_superuser=True).first()

    if session.class_type == "DOMAIN":
        active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
    elif session.class_type == "SOFTSKILLS":
        active_statuses = ["SOFT_SKILLS"]
    else:
        active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]

    apps = Application.objects.filter(
        status__in=active_statuses,
        student__user__email__isnull=False
    ).select_related('student', 'student__user')

    if session.class_type == "DOMAIN":
        apps = apps.filter(assigned_cohort_id=session.cohort_id) if session.cohort_id else apps.none()
    elif session.class_type == "LST":
        apps = apps.filter(
            assigned_cohort__lst_batch=session.lst_batch,
            assigned_cohort__status__in=[
                Cohort.Status.ACTIVE,
                Cohort.Status.TRAINING,
                Cohort.Status.INTERNSHIP,
                Cohort.Status.SOFT_SKILLS
            ]
        ) if session.lst_batch and session.lst_batch not in ["COMBINED", "GENERAL"] else apps.filter(
            assigned_cohort__lst_batch__isnull=False,
            assigned_cohort__status__in=[
                Cohort.Status.ACTIVE,
                Cohort.Status.TRAINING,
                Cohort.Status.INTERNSHIP,
                Cohort.Status.SOFT_SKILLS
            ]
        )
    elif session.class_type == "SOFTSKILLS":
        apps = apps.filter(
            assigned_cohort__status=Cohort.Status.SOFT_SKILLS
        )
    elif session.class_type == "CELEBRATION":
        apps = apps.filter(assigned_cohort__isnull=False)

    warnings_to_create = []

    # Pre-fetch prior permissions for this session
    prior_permissions = set(
        PriorPermission.objects.filter(session=session).values_list('student_id', flat=True)
    )

    def _cleanup_stale_warnings(student):
        # Delete purely PENDING warnings. Preserve historical ones (apologized/accepted/rejected)
        warnings = AbsenceWarning.objects.filter(student=student, session=session)
        for w in warnings:
            if w.status == "PENDING" and not w.apology_text:
                w.delete()
            else:
                if not w.resolved:
                    w.resolved = True
                    w.save(update_fields=['resolved'])

    for app in apps:
        student = app.student
        student_data = result.get('expected_students', {}).get(str(student.id))
        
        if not student_data:
            # New or excluded students are not absent from a finalized roster.
            continue
            
        pct = student_data.get('attendance_percentage', 0)
        status = student_data.get('status', 'ABSENT')

        # 1. Prior Permission Exemption
        if student.id in prior_permissions:
            _cleanup_stale_warnings(student)
            continue

        # 2. Identity Review Exemption (temporary until resolved)
        if status == "IDENTITY_REVIEW_REQUIRED":
            _cleanup_stale_warnings(student)
            continue

        # 3. >= Threshold Attendance Exemption
        if pct >= DISCIPLINE_THRESHOLD:
            _cleanup_stale_warnings(student)
            continue

        # 4. Create disciplinary cause and trigger automatic suspension if < Threshold
        if pct < DISCIPLINE_THRESHOLD:
            # Create or ensure the AbsenceWarning exists to record this valid disciplinary cause
            warning, created = AbsenceWarning.objects.get_or_create(
                student=student,
                session=session,
                defaults={"status": "PENDING"}
            )
            
            # If the warning was already resolved (e.g. apology accepted), don't re-suspend
            if not created and warning.resolved:
                continue

            # Only suspend if they aren't already suspended
            if app.status != Application.Status.SUSPENDED:
                try:
                    transition_application_status(
                        app,
                        Application.Status.SUSPENDED,
                        user=system_user,
                        reason=f"Automatic suspension due to attendance ({pct:.1f}%) in {session.title}",
                    )
                    logger.info(f"Automatically suspended {student} (App: {app.application_number}) for <{DISCIPLINE_THRESHOLD}% attendance.")
                    
                    if student.user:
                        action_url = f"/attendance/{session.id}/"
                        title = "Cohort Access Suspended"
                        msg = (
                            f"Your attendance was {pct:.1f}% for {session.title}. "
                            f"Your current cohort access has been suspended. "
                            f"Please contact support for review and possible re-access."
                        )
                        notify_user(
                            user=student.user,
                            title=title,
                            message=msg,
                            notification_type=Notification.Type.WARNING,
                            action_url=action_url,
                            dedupe_key="attendance_suspension_generated"
                        )
                except Exception as e:
                    logger.error(f"Failed to automatically suspend application {app.id}: {e}")
