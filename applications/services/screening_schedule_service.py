from django.utils import timezone

from applications.models import Application, PreScreening
from common.models import Notification
from common.services.notifications import display_name, notify_user


CLOSED_APPLICATION_STATUSES = {
    Application.Status.REJECTED,
    Application.Status.DROPPED,
    Application.Status.CANCELLED,
    Application.Status.COMPLETED,
}


def publish_screening_schedule(pre_screening, *, notification_key):
    """Update journey state and notify the candidate about one screening schedule."""
    if pre_screening.status not in {
        PreScreening.Status.SCHEDULED,
        PreScreening.Status.RESCHEDULED,
    }:
        return pre_screening
    application = pre_screening.application
    if application.status not in CLOSED_APPLICATION_STATUSES:
        from applications.services.state_machine import transition_application_status
        try:
            transition_application_status(
                application,
                Application.Status.EXAM_PENDING,
                reason="Screening schedule published",
            )
        except Exception:
            pass

    local_schedule = (
        timezone.localtime(pre_screening.scheduled_at).strftime("%d %b %Y, %I:%M %p")
        if pre_screening.scheduled_at
        else "to be confirmed"
    )
    notify_user(
        application.student.user,
        title=(
            "Pre-screen exam rescheduled"
            if pre_screening.status == PreScreening.Status.RESCHEDULED
            else "Pre-screen exam scheduled"
        ),
        message=(
            f"Hi {display_name(application.student.user)}, your pre-screen exam for "
            f"{application.course.name} "
            f"{'has been rescheduled' if pre_screening.status == PreScreening.Status.RESCHEDULED else 'is scheduled'} "
            f"for {local_schedule}."
        ),
        notification_type=Notification.Type.ACTION_REQUIRED,
        action_url="application_tracker",
        dedupe_key=f"application:{application.id}:screening-schedule:{notification_key}",
    )
    return pre_screening


def create_course_default_screening_schedule(application):
    """Create the per-application schedule when the cohort or course supplies a default."""
    if not application or application.status in CLOSED_APPLICATION_STATUSES:
        return None

    scheduled_at = None
    if application.assigned_cohort and getattr(application.assigned_cohort, "default_screening_at", None):
        scheduled_at = application.assigned_cohort.default_screening_at
    elif getattr(application.course, "default_screening_at", None):
        scheduled_at = application.course.default_screening_at

    if scheduled_at is None or scheduled_at <= timezone.now():
        return None
    pre_screening, created = PreScreening.objects.get_or_create(
        application=application,
        defaults={
            "scheduled_at": scheduled_at,
            "status": PreScreening.Status.SCHEDULED,
            "remarks": "Automatically scheduled from cohort/course default pre-screen date.",
        },
    )
    if created:
        publish_screening_schedule(
            pre_screening,
            notification_key=f"screening-default:{scheduled_at.isoformat()}",
        )
    return pre_screening


def bulk_schedule_applications(
    applications,
    *,
    scheduled_at,
    end_time=None,
    question_bank=None,
    paper_set=None,
    meeting_link=None,
    is_released=False,
    notify_candidates=True,
    actor=None,
):
    """
    Bulk schedule pre-screening examination for a collection or queryset of Applications.
    Creates or updates PreScreening records, sets examination slot, transitions application
    to EXAM_PENDING, and optionally dispatches candidate notifications.
    """
    from django.db import transaction
    from applications.services.state_machine import transition_application_status

    if not applications:
        return {"total": 0, "scheduled": 0, "failed": 0, "errors": []}

    scheduled_count = 0
    failed_count = 0
    errors = []
    now = timezone.now()

    if scheduled_at and timezone.is_naive(scheduled_at):
        scheduled_at = timezone.make_aware(scheduled_at)
    if end_time and timezone.is_naive(end_time):
        end_time = timezone.make_aware(end_time)

    # Normalize applications iterable / queryset with select_related
    if hasattr(applications, "select_related"):
        apps_list = list(applications.select_related("student__user", "course", "assigned_cohort"))
    else:
        apps_list = list(applications)

    with transaction.atomic():
        for app in apps_list:
            try:
                if app.status in CLOSED_APPLICATION_STATUSES:
                    continue

                ps, created = PreScreening.objects.select_for_update().get_or_create(
                    application=app,
                    defaults={
                        "scheduled_at": scheduled_at,
                        "end_time": end_time,
                        "question_bank": question_bank,
                        "paper_set": paper_set or (question_bank.set_codes[0] if question_bank and question_bank.set_codes else "A"),
                        "meeting_link": meeting_link or "",
                        "is_released": is_released,
                        "status": PreScreening.Status.SCHEDULED,
                    },
                )

                if not created:
                    new_status = (
                        PreScreening.Status.RESCHEDULED
                        if ps.status in {PreScreening.Status.SCHEDULED, PreScreening.Status.RESCHEDULED}
                        else PreScreening.Status.SCHEDULED
                    )
                    ps.status = new_status
                    ps.scheduled_at = scheduled_at
                    if end_time:
                        ps.end_time = end_time
                    if question_bank:
                        ps.question_bank = question_bank
                    if paper_set:
                        ps.paper_set = paper_set
                    elif question_bank and question_bank.set_codes and not ps.paper_set:
                        ps.paper_set = question_bank.set_codes[0]
                    if meeting_link is not None:
                        ps.meeting_link = meeting_link
                    ps.is_released = is_released
                    ps.save()

                if app.status in {
                    Application.Status.APPLIED,
                    Application.Status.EXAM_PENDING,
                }:
                    try:
                        transition_application_status(
                            app,
                            Application.Status.EXAM_PENDING,
                            user=actor,
                            reason=f"Bulk scheduled screening exam for {scheduled_at.strftime('%Y-%m-%d %H:%M')}",
                        )
                    except Exception:
                        pass

                if notify_candidates:
                    publish_screening_schedule(
                        ps,
                        notification_key=f"bulk-admin:{now.isoformat()}:{ps.updated_at.isoformat()}",
                    )

                scheduled_count += 1
            except Exception as exc:
                failed_count += 1
                errors.append(f"App {app.application_number}: {str(exc)}")

    return {
        "total": len(apps_list),
        "scheduled": scheduled_count,
        "failed": failed_count,
        "errors": errors,
    }

