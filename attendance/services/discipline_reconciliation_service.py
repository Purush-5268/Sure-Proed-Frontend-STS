"""
Centralized Discipline Reconciliation Service

All discipline reconciliation flows through this module.
Discipline is modeled as a SET OF CAUSES — each session that has <96% attendance
(without exemption) is a separate disciplinary cause.

Removal of any single cause only restores the student if NO other valid causes remain.

Entry points that trigger reconciliation:
- Prior Permission granted/revoked → reconcile_student_discipline_for_session()
- Accepted Apology → reconcile_student_discipline_for_session()
- Session CANCELLED → reconcile_all_students_for_session()
- Session DELETED → reconcile_all_students_for_session() (called BEFORE deletion)
- Admin Reaccess → reconcile_student_discipline()
"""
import logging
from django.db import transaction
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)

DISCIPLINE_THRESHOLD = 96  # Single source of truth for the attendance threshold


def get_valid_disciplinary_causes(student):
    """
    Returns a list of dicts describing ALL currently valid disciplinary causes
    for this student. Each cause is tied to a specific session.

    A cause is VALID when:
    - Session class_status is COMPLETED
    - Google attendance data status is READY
    - Student is in expected_students
    - Student status is NOT IDENTITY_REVIEW_REQUIRED
    - Attendance percentage < DISCIPLINE_THRESHOLD (96%)
    - No PriorPermission exists for that student+session
    - No ACCEPTED AbsenceWarning exists for that student+session
    - AbsenceWarning is not resolved

    Returns:
        list[dict]: Each dict has:
            - session_id: UUID
            - session_title: str
            - attendance_percentage: float
            - warning_id: UUID or None
            - warning_status: str or None
    """
    from attendance.models import AbsenceWarning, PriorPermission, Attendance

    causes = []

    # Get all non-accepted warnings for completed sessions
    warnings = AbsenceWarning.objects.filter(
        student=student,
        session__class_status="COMPLETED",
        resolved=False,
    ).exclude(
        status="ACCEPTED"
    ).select_related('session')

    # Get all sessions with prior permission for this student
    exempted_sessions = set(
        PriorPermission.objects.filter(student=student).values_list('session_id', flat=True)
    )

    for warning in warnings:
        session = warning.session

        # Skip if prior permission exists
        if session.id in exempted_sessions:
            continue

        data = session.google_meet_attendance_data
        if not data or data.get("status") != "READY":
            continue

        student_data = data.get("expected_students", {}).get(str(student.id))
        if not student_data:
            continue

        status = student_data.get("status", "ABSENT")
        if status == "IDENTITY_REVIEW_REQUIRED":
            continue

        pct = student_data.get("attendance_percentage", 0)
        if pct < DISCIPLINE_THRESHOLD:
            causes.append({
                "session_id": session.id,
                "session_title": session.title,
                "attendance_percentage": pct,
                "warning_id": warning.id,
                "warning_status": warning.status,
                "class_date": session.class_date,
            })

    return causes


def _get_cohort_target_status(cohort):
    """Map cohort status to the appropriate Application status for restoration."""
    from applications.models import Application
    from cohorts.models import Cohort

    if not cohort:
        return Application.Status.IN_PROGRESS

    status_map = {
        Cohort.Status.TRAINING: Application.Status.TRAINING,
        Cohort.Status.INTERNSHIP: Application.Status.INTERNSHIP_ASSIGNED,
        Cohort.Status.SOFT_SKILLS: Application.Status.SOFT_SKILLS,
    }
    return status_map.get(cohort.status, Application.Status.IN_PROGRESS)


def reconcile_student_discipline(student, reason="Discipline reconciliation"):
    """
    Central reconciliation: checks ALL valid disciplinary causes for a student.

    If valid causes remain → student stays SUSPENDED (no change).
    If NO valid causes remain → student is restored to their cohort's current status.

    This function is IDEMPOTENT — safe to call multiple times.

    Args:
        student: StudentProfile instance
        reason: str describing why reconciliation was triggered

    Returns:
        dict: {
            "action": "RESTORED" | "REMAINS_SUSPENDED" | "NOT_SUSPENDED" | "NO_APP",
            "active_causes": int,
            "target_status": str or None,
        }
    """
    from applications.models import Application

    app = Application.objects.filter(
        student=student,
        status=Application.Status.SUSPENDED
    ).select_related('assigned_cohort').first()

    if not app:
        return {"action": "NOT_SUSPENDED", "active_causes": 0, "target_status": None}

    active_causes = get_valid_disciplinary_causes(student)

    if active_causes:
        logger.info(
            f"Reconciliation for {student}: {len(active_causes)} active cause(s) remain. "
            f"Student stays SUSPENDED. Causes: {[c['session_title'] for c in active_causes]}"
        )
        return {
            "action": "REMAINS_SUSPENDED",
            "active_causes": len(active_causes),
            "target_status": None,
        }

    # No valid causes remain — restore the student
    with transaction.atomic():
        # Re-lock to prevent race conditions
        app = Application.objects.select_for_update().get(id=app.id)
        if app.status != Application.Status.SUSPENDED:
            return {"action": "NOT_SUSPENDED", "active_causes": 0, "target_status": None}

        target_status = _get_cohort_target_status(app.assigned_cohort)

        User = get_user_model()
        system_user = User.objects.filter(is_superuser=True).first()

        from applications.services.state_machine import transition_application_status
        try:
            transition_application_status(
                app,
                target_status,
                user=system_user,
                reason=reason,
            )
            logger.info(
                f"Restored {student} (App: {app.application_number}) "
                f"from SUSPENDED → {target_status}. Reason: {reason}"
            )

            if student.user:
                try:
                    from common.models import Notification
                    from common.services.notifications import notify_user
                    
                    title = "Cohort Access Restored"
                    msg = f"Good news! Your cohort access has been successfully restored. Reason: {reason}"
                    
                    notify_user(
                        user=student.user,
                        title=title,
                        message=msg,
                        notification_type=Notification.Type.SUCCESS,
                        action_url="/dashboard",
                        dedupe_key=f"attendance_unsuspension_{app.id}_{target_status}"
                    )
                except Exception as notif_err:
                    logger.error(f"Failed to send unsuspension notification to {student.user}: {notif_err}")

            return {
                "action": "RESTORED",
                "active_causes": 0,
                "target_status": target_status,
            }
        except Exception as e:
            logger.error(f"Failed to restore application {app.id}: {e}")
            return {
                "action": "RESTORE_FAILED",
                "active_causes": 0,
                "target_status": target_status,
            }


def reconcile_student_discipline_for_session(student, session, reason=None):
    """
    Resolves disciplinary consequences attributable to a SPECIFIC session,
    then checks if any other valid causes remain.

    This is the primary entry point for:
    - Prior Permission granted/revoked
    - Accepted Apology
    - Session-specific reaccess

    Args:
        student: StudentProfile instance
        session: Attendance instance
        reason: str or None (auto-generated if not provided)

    Returns:
        dict from reconcile_student_discipline()
    """
    from attendance.models import AbsenceWarning

    if not reason:
        reason = f"Discipline reconciled for session '{session.title}'"

    # Resolve the warning for this specific session (mark resolved, don't delete history)
    warnings = AbsenceWarning.objects.filter(student=student, session=session)
    for w in warnings:
        if w.status == "PENDING" and not w.apology_text:
            # Pure pending with no apology — safe to delete
            w.delete()
        else:
            # Has history (apology submitted, rejected, etc.) — preserve but resolve
            if not w.resolved:
                w.resolved = True
                w.save(update_fields=['resolved'])

    return reconcile_student_discipline(student, reason=reason)


def reconcile_all_students_for_session(session, action_type="CANCELLED"):
    """
    Reconciles discipline for ALL students affected by a session change
    (cancellation, deletion, etc.).

    Called when a session is CANCELLED or about to be DELETED.

    Args:
        session: Attendance instance
        action_type: "CANCELLED" or "DELETED"

    Returns:
        dict: { student_id: reconciliation_result }
    """
    from attendance.models import AbsenceWarning
    from students.models import StudentProfile

    results = {}

    data = session.google_meet_attendance_data
    if not data or data.get("status") != "READY":
        # Even without READY data, clean up any warnings for this session
        warnings = AbsenceWarning.objects.filter(session=session)
        for w in warnings:
            if w.status == "PENDING" and not w.apology_text:
                w.delete()
            else:
                if not w.resolved:
                    w.resolved = True
                    w.save(update_fields=['resolved'])
        return results

    # Find all students who had <96% attendance for this session
    expected_students = data.get("expected_students", {})
    affected_student_ids = []
    for str_id, s_data in expected_students.items():
        if (s_data.get("attendance_percentage", 0) < DISCIPLINE_THRESHOLD
                and s_data.get("status") != "IDENTITY_REVIEW_REQUIRED"):
            affected_student_ids.append(str_id)

    if not affected_student_ids:
        logger.info(
            f"No students had <{DISCIPLINE_THRESHOLD}% attendance for session {session.id}. "
            f"No discipline reconciliation needed."
        )

    # Clean up warnings for this session regardless
    warnings = AbsenceWarning.objects.filter(session=session)
    for w in warnings:
        if w.status == "PENDING" and not w.apology_text:
            w.delete()
        else:
            if not w.resolved:
                w.resolved = True
                w.save(update_fields=['resolved'])

    # Reconcile each affected student
    for str_id in affected_student_ids:
        try:
            student = StudentProfile.objects.get(id=str_id)
            reason = f"Suspension reconciled: session '{session.title}' was {action_type}."
            result = reconcile_student_discipline(student, reason=reason)
            results[str_id] = result
        except StudentProfile.DoesNotExist:
            logger.warning(f"StudentProfile {str_id} not found during reconciliation.")
        except Exception as e:
            logger.error(f"Error reconciling student {str_id}: {e}")
            results[str_id] = {"action": "ERROR", "error": str(e)}

    return results


# ─── Legacy compatibility aliases ───────────────────────────────────────────
# These are called from existing code (models.py, views.py).
# They delegate to the new centralized functions.

def reconcile_session_discipline_after_change(session_id, action_type="DELETED"):
    """Legacy entry point for session cancellation/deletion."""
    from attendance.models import Attendance
    session = Attendance.objects.filter(id=session_id).first()
    if not session:
        logger.warning(f"Session {session_id} not found during reconciliation.")
        return
    return reconcile_all_students_for_session(session, action_type=action_type)


def reconcile_student_discipline_after_prior_permission(student, session):
    """Legacy entry point for prior permission grant/revoke."""
    return reconcile_student_discipline_for_session(
        student, session,
        reason=f"Suspension reconciled: prior permission for session '{session.title}'."
    )
