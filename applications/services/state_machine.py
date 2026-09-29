import logging
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied

logger = logging.getLogger(__name__)


class ApplicationStateTransitionError(ValidationError):
    """Raised when an invalid state transition is attempted."""
    pass


class ApplicationStateInvariantError(ValidationError):
    """Raised when invariant conditions for a status are not satisfied."""
    pass


# ──────────────────────────────────────────────────────────────────────────────
# Allowed Transitions State Matrix
# ──────────────────────────────────────────────────────────────────────────────
# Universal discontinuation paths: Any active non-terminal status can transition
# to DROPPED (student drops out) or CANCELLED (admin/system cancels application/cohort).

ALLOWED_TRANSITIONS = {
    "APPLIED": {
        "EXAM_PENDING",
        "PRESCREENING_PENDING",
        "QUALIFIED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "EXAM_PENDING": {
        "EXAM_COMPLETED",
        "QUALIFIED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "EXAM_COMPLETED": {
        "PRESCREENING_PENDING",
        "QUALIFIED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "PRESCREENING_PENDING": {
        "PRESCREENING_COMPLETED",
        "QUALIFIED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "PRESCREENING_COMPLETED": {
        "QUALIFIED",
        "WAITLISTED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "QUALIFIED": {
        "COHORT_ASSIGNED",
        "WAITLISTED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "WAITLISTED": {
        "COHORT_ASSIGNED",
        "QUALIFIED",
        "REJECTED",
        "DROPPED",
        "CANCELLED",
    },
    "COHORT_ASSIGNED": {
        "QUALIFIED",
        "IN_PROGRESS",
        "TRAINING",
        "INTERNSHIP_ASSIGNED",
        "COMPLETED",
        "SUSPENDED",
        "TRANSFER_COHORT",
        "DROPPED",
        "CANCELLED",
    },
    "IN_PROGRESS": {
        "TRAINING",
        "INTERNSHIP_ASSIGNED",
        "COMPLETED",
        "SUSPENDED",
        "TRANSFER_COHORT",
        "DROPPED",
        "CANCELLED",
    },
    "TRAINING": {
        "IN_PROGRESS",
        "INTERNSHIP_ASSIGNED",
        "COMPLETED",
        "SUSPENDED",
        "TRANSFER_COHORT",
        "DROPPED",
        "CANCELLED",
    },
    "INTERNSHIP_ASSIGNED": {
        "IN_PROGRESS",
        "TRAINING",
        "COMPLETED",
        "SUSPENDED",
        "TRANSFER_COHORT",
        "DROPPED",
        "CANCELLED",
    },
    "SUSPENDED": {
        "COHORT_ASSIGNED",
        "IN_PROGRESS",
        "TRAINING",
        "INTERNSHIP_ASSIGNED",
        "SOFT_SKILLS",
        "TRANSFER_COHORT",
        "DROPPED",
        "CANCELLED",
    },
    "TRANSFER_COHORT": {
        "COHORT_ASSIGNED",
        "IN_PROGRESS",
        "TRAINING",
        "INTERNSHIP_ASSIGNED",
        "SUSPENDED",
        "DROPPED",
        "CANCELLED",
    },
    "COMPLETED": set(),  # Terminal; use privileged repair to reopen it.
    "REJECTED": {"QUALIFIED", "COHORT_ASSIGNED", "APPLIED", "WAITLISTED"},   # Reinstatable by admin
    "DROPPED": set(),    # Terminal
    "CANCELLED": set(),  # Terminal
}


def validate_status_invariants(application, target_status):
    """
    Validates database/domain invariants for an application entering target_status.
    """
    errors = {}

    # 1. Cohort requirement
    if target_status in {"COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "COMPLETED", "SUSPENDED", "TRANSFER_COHORT"}:
        if not application.assigned_cohort_id:
            errors["assigned_cohort"] = f"Application status '{target_status}' requires an assigned cohort."

    # 2. Completion requirements
    if target_status == "COMPLETED":
        if not application.completed_course:
            errors["completed_course"] = "Application entering COMPLETED status must have completed_course=True."
        if not application.completed_at:
            errors["completed_at"] = "Application entering COMPLETED status must have completed_at timestamp."
        if application.final_score is None:
            errors["final_score"] = "Application entering COMPLETED status must have a recorded final_score."

    if errors:
        raise ApplicationStateInvariantError(errors)


def transition_application_status(
    application,
    new_status,
    user=None,
    reason="",
    save=True,
    is_repair=False,
):
    """
    Central state transition function for Application.
    Enforces the transition matrix, validates invariants, and creates an audit record.
    """
    from applications.models import Application, ApplicationStatusAudit

    with transaction.atomic():
        current_status = application.status

        # save=False is used only by Django admin before ModelAdmin persists the
        # same object.  Validate that pending object, but still serialize the
        # transition decision against the current database row.
        if application.pk:
            locked_app = Application.objects.select_for_update().get(pk=application.pk)
            current_status = locked_app.status
        else:
            locked_app = application

        if current_status == new_status:
            application.status = new_status
            return application

        if not is_repair:
            allowed = ALLOWED_TRANSITIONS.get(current_status, set())
            if new_status not in allowed:
                raise ApplicationStateTransitionError(
                    f"Illegal state transition from '{current_status}' to '{new_status}'."
                )

        invariant_source = locked_app if save else application
        validate_status_invariants(invariant_source, new_status)

        if save:
            # Save only the lifecycle columns on the locked row.  Saving the
            # caller's potentially stale instance could overwrite concurrent
            # updates to unrelated application fields.
            locked_app.status = new_status
            locked_app.save(update_fields=["status", "updated_at"])
        application.status = new_status

        # Record audit entry
        ApplicationStatusAudit.objects.create(
            application=locked_app,
            from_status=current_status,
            to_status=new_status,
            actor=user if user and user.is_authenticated else None,
            reason=reason or "",
            is_repair=is_repair,
        )

    logger.info(
        f"Application {application.application_number} transitioned from "
        f"{current_status} -> {new_status} (Actor: {user}, Repair: {is_repair})"
    )
    
    from django.core.cache import cache
    cache.delete('platform:analytics:stats')

    from applications.models import Application
    if new_status in {Application.Status.DROPPED, Application.Status.CANCELLED}:
        _handle_application_dropped_or_cancelled(locked_app, new_status, user=user, reason=reason)
        
    if current_status == Application.Status.SUSPENDED and new_status in {
        Application.Status.COHORT_ASSIGNED,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
        Application.Status.SOFT_SKILLS
    }:
        from attendance.models import AbsenceWarning
        warnings = AbsenceWarning.objects.filter(
            student=application.student,
            resolved=False
        )
        for w in warnings:
            if w.status == "PENDING" and not w.apology_text:
                w.delete()
            else:
                w.resolved = True
                w.save(update_fields=['resolved'])
    
    return application


def _handle_application_dropped_or_cancelled(application, new_status, user=None, reason=""):
    """
    Safeguard hook executed when an application transitions to DROPPED or CANCELLED:
    1. Cancels active/scheduled PreScreening and revokes Google Meet/Calendar attendee access.
    2. Cancels active/scheduled PreScreeningInterview.
    3. Cleans up unsubmitted / pending Exam records.
    4. Dispatches in-app notification, Web Push, and transactional email to the candidate.
    5. Clears student dashboard and attendance cache keys.
    """
    from applications.models import Application, PreScreening, PreScreeningInterview
    from exams.models import Exam
    from common.models import Notification
    from common.services.notifications import notify_user, display_name
    from common.services.email_service import send_course_dropout_notification_email

    # 1. Cancel PreScreening and revoke Google Meet/Calendar attendee access
    try:
        ps = getattr(application, "pre_screening", None)
        if ps and ps.status in {
            PreScreening.Status.SCHEDULED,
            PreScreening.Status.RESCHEDULED,
        }:
            try:
                from applications.services.google_meet_screening import remove_candidate_from_screening_meet
                remove_candidate_from_screening_meet(ps)
            except Exception as exc:
                logger.warning(f"Failed to revoke calendar invite for dropped app {application.id}: {exc}")

            ps.status = PreScreening.Status.CANCELLED
            ps.is_released = False
            status_label = "dropped" if new_status == Application.Status.DROPPED else "cancelled"
            ps.remarks = (ps.remarks or "") + f"\nCancelled automatically: application {status_label}."
            ps.save(update_fields=["status", "is_released", "remarks", "updated_at"])
    except Exception as exc:
        logger.error(f"Error cancelling prescreening for app {application.id}: {exc}")

    # 2. Cancel PreScreeningInterview
    try:
        psi = getattr(application, "pre_screening_interview", None)
        if psi and psi.status in {
            PreScreeningInterview.Status.SCHEDULED,
            PreScreeningInterview.Status.RESCHEDULED,
        }:
            psi.status = PreScreeningInterview.Status.CANCELLED
            status_label = "dropped" if new_status == Application.Status.DROPPED else "cancelled"
            psi.feedback = (psi.feedback or "") + f"\nCancelled automatically: application {status_label}."
            psi.save(update_fields=["status", "feedback", "updated_at"])
    except Exception as exc:
        logger.error(f"Error cancelling interview for app {application.id}: {exc}")

    # 3. Clean up unsubmitted / pending Exam
    try:
        exam = getattr(application, "exam", None)
        if exam and exam.status in {Exam.Status.PENDING, Exam.Status.IN_PROGRESS}:
            exam.delete()
    except Exception as exc:
        logger.error(f"Error cleaning up pending exam for app {application.id}: {exc}")

    # 4. Invalidate caches
    student = getattr(application, "student", None)
    student_user = getattr(student, "user", None) if student else None
    if student_user:
        try:
            from django.core.cache import cache
            cache.delete_many([
                f"attendance:list:user_{student_user.id}:ACTIVE",
                f"attendance:list:user_{student_user.id}:ALL",
                f"user_profile:{student_user.id}",
            ])
        except Exception:
            pass

        # 5. Send in-app notification & Web Push
        try:
            cohort = getattr(application, "assigned_cohort", None)
            course = getattr(application, "course", None)
            course_name = course.name if course else "Course"
            cohort_name = cohort.name if cohort else None
            cohort_info = f" ({cohort_name})" if cohort_name else ""

            if new_status == Application.Status.DROPPED:
                title = "Dropped from Cohort / Course"
                msg = (
                    f"Hi {display_name(student_user)}, your application for {course_name}{cohort_info} "
                    "has been marked as Dropped. Any scheduled pre-screen exams have been cancelled. "
                    "You are now eligible to apply for another course."
                )
            else:
                title = "Application Cancelled"
                msg = (
                    f"Hi {display_name(student_user)}, your application for {course_name}{cohort_info} "
                    "has been cancelled. Any scheduled pre-screen exams have been cancelled. "
                    "You may apply for another active course."
                )

            notify_user(
                student_user,
                title=title,
                message=msg,
                notification_type=Notification.Type.WARNING,
                action_url="course_selection",
                dedupe_key=f"application:{application.id}:{new_status.lower()}",
            )

            # 6. Send transactional email
            if student_user.email:
                try:
                    send_course_dropout_notification_email(
                        student_user.email,
                        course_name=course_name,
                        cohort_name=cohort_name,
                    )
                except Exception as exc:
                    logger.warning(f"Failed to send dropout email to {student_user.email}: {exc}")
        except Exception as exc:
            logger.error(f"Failed to dispatch dropout notifications for app {application.id}: {exc}")



def repair_application_state(
    application,
    target_status,
    admin_user,
    reason,
):
    """
    Privileged administrator remediation routine for inconsistent historical records.
    Deliberately bypasses standard forward transition checks with full audit trail.
    If downgrading from COMPLETED to IN_PROGRESS, revokes associated certificates and
    logs audit record in UserRequest.
    """
    from applications.models import Application
    from certificates.models import Certificate
    from common.models import UserRequest

    if not admin_user or not (getattr(admin_user, "is_staff", False) or getattr(admin_user, "role", "") == "ADMIN"):
        raise PermissionDenied("Only administrators can perform privileged application state repairs.")

    with transaction.atomic():
        application = Application.objects.select_for_update().get(pk=application.pk)
        old_status = application.status
        # Change status first.  The database completion constraint permits the
        # old evidence on a reopened row, but it correctly forbids clearing that
        # evidence while the row still says COMPLETED.
        transition_application_status(
            application=application,
            new_status=target_status,
            user=admin_user,
            reason=f"Privileged Repair: {reason}",
            save=True,
            is_repair=True,
        )
        
        # If repaired to a qualified or enrolled status, ensure the qualified boolean is True
        if target_status in {
            Application.Status.QUALIFIED,
            Application.Status.WAITLISTED,
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
            Application.Status.COMPLETED,
        }:
            application.qualified = True
            application.save(update_fields=["qualified", "updated_at"])
        # Handle certificate revocation on completion downgrade
        if old_status == Application.Status.COMPLETED and target_status != Application.Status.COMPLETED:
            application.completed_course = False
            application.completed_at = None
            application.final_score = None
            application.save(update_fields=[
                "completed_course", "completed_at", "final_score", "updated_at"
            ])

            # Revoke linked active certificates
            certs = Certificate.objects.filter(application=application, status=Certificate.Status.ACTIVE)
            for cert in certs:
                cert.status = Certificate.Status.REVOKED
                cert.revocation_reason = f"Audited: Completion downgraded during system repair ({reason})"
                cert.revoked_at = timezone.now()
                cert.save(update_fields=["status", "revocation_reason", "revoked_at", "updated_at"])

            # Create UserRequest audit trail
            user_hex = str(application.student.user.id).replace("-", "")[:6].upper()
            now_ts = timezone.now().strftime("%Y%m%d%H%M%S")
            UserRequest.objects.create(
                request_number=f"REQ-REPAIR-{user_hex}-{now_ts}",
                sender=application.student.user,
                sender_role="STUDENT",
                category=UserRequest.Category.OTHER,
                subject=f"System Repair: Application {application.application_number} status corrected",
                description=(
                    f"Application status downgraded from {old_status} to {target_status} by admin {admin_user.email}. "
                    f"Reason: {reason}"
                ),
                status=UserRequest.Status.CLOSED,
                admin_remarks=f"Repair action performed by {admin_user.email}: {reason}",
                resolved_by=admin_user,
                resolved_at=timezone.now(),
                related_application=application,
            )

    return application
