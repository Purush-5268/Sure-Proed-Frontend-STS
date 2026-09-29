import logging
from datetime import datetime, time, timedelta
from django.db import models
from django.utils import timezone
from attendance.services.google_meet_service import generate_google_meet, update_google_meet

logger = logging.getLogger(__name__)


def resolve_or_create_prescreening_google_meet(
    pre_screening,
    *,
    sync_cohort_students=True,
    attendee_emails=None,
):
    """
    Manage Google Meet links for Pre-Screening Exam Schedules automatically:
    Pre-Screening Exam Schedule + Cohort -> Check Existing Meet Link -> Reuse Existing Link OR Generate Once -> Assign Same Link to All Scheduled Students.
    """
    if not pre_screening or not getattr(pre_screening, "application", None):
        return getattr(pre_screening, "meeting_link", None)

    application = pre_screening.application
    course = getattr(application, "course", None)
    cohort = getattr(application, "assigned_cohort", None)
    scheduled_at = pre_screening.scheduled_at
    end_time = pre_screening.end_time

    if not scheduled_at or not end_time:
        return pre_screening.meeting_link

    cohort_name = cohort.name if cohort else "Entrance Assessment"
    course_code = course.code if course else "COURSE"
    title = f"[{course_code}] Pre-Screening Exam - {cohort_name}"

    if attendee_emails is None:
        if cohort:
            from applications.models import Application
            attendee_emails = list(Application.objects.filter(
                course=course,
                assigned_cohort=cohort,
                status__in=[Application.Status.APPLIED, Application.Status.EXAM_PENDING],
            ).exclude(student__user__email="").values_list("student__user__email", flat=True))
        elif application.student and application.student.user and application.student.user.email:
            attendee_emails = [application.student.user.email]
        else:
            attendee_emails = []

    def sync_existing_calendar_event():
        if not getattr(pre_screening, "calendar_event_id", None):
            return
        try:
            link, event_id = update_google_meet(
                calendar_event_id=pre_screening.calendar_event_id,
                session_title=title,
                start_datetime=scheduled_at,
                end_datetime=end_time,
                attendee_emails=attendee_emails,
            )
            pre_screening.meeting_link = link or pre_screening.meeting_link
            pre_screening.calendar_event_id = event_id or pre_screening.calendar_event_id
        except Exception as exc:
            logger.warning(
                "Could not synchronize Google Calendar event %s: %s",
                pre_screening.calendar_event_id,
                exc,
            )

    # 1. Keep the same Meet room, but update its Calendar dates, times, and
    # attendees whenever an admin overrides the schedule in Start Test Hub.
    if pre_screening.meeting_link:
        sync_existing_calendar_event()
        if sync_cohort_students and cohort:
            _sync_peer_students_meeting_link(pre_screening, pre_screening.meeting_link)
        return pre_screening.meeting_link

    from applications.models import PreScreening

    # 2. Check for an existing Google Meet link in the same Course + Cohort + Schedule Date window
    peer_filter = PreScreening.objects.filter(
        application__course=course,
        meeting_link__isnull=False,
    ).exclude(meeting_link="")

    if pre_screening.pk:
        peer_filter = peer_filter.exclude(pk=pre_screening.pk)

    if cohort:
        peer_filter = peer_filter.filter(application__assigned_cohort=cohort)

    # Check for same schedule window (within 18 hours to be timezone agnostic)
    window_start = scheduled_at - timedelta(hours=18)
    window_end = scheduled_at + timedelta(hours=18)
    existing_peer = peer_filter.filter(
        scheduled_at__range=(window_start, window_end)
    ).order_by("-updated_at").first()

    if existing_peer and existing_peer.meeting_link:
        logger.info(
            f"Reusing existing Google Meet link ({existing_peer.meeting_link}) from schedule {existing_peer.id} "
            f"for course {course.code if course else 'N/A'} and cohort {cohort.code if cohort else 'General'}."
        )
        pre_screening.meeting_link = existing_peer.meeting_link
        if hasattr(existing_peer, "calendar_event_id") and existing_peer.calendar_event_id:
            pre_screening.calendar_event_id = existing_peer.calendar_event_id
            sync_existing_calendar_event()
        return pre_screening.meeting_link

    # 3. Check if the cohort itself has a dedicated meeting link
    if cohort and cohort.meeting_link:
        logger.info(f"Using cohort default meeting link ({cohort.meeting_link}) for pre-screening.")
        pre_screening.meeting_link = cohort.meeting_link
        return pre_screening.meeting_link

    # 4. Generate a new Google Meet link ONCE for this exam schedule and cohort
    try:
        link, event_id = generate_google_meet(
            session_title=title,
            start_datetime=scheduled_at,
            end_datetime=end_time,
            attendee_emails=attendee_emails,
        )
        if link:
            pre_screening.meeting_link = link
            if hasattr(pre_screening, "calendar_event_id"):
                pre_screening.calendar_event_id = event_id
            logger.info(f"Generated new Google Meet link ({link}) for course {course_code}, cohort {cohort_name}.")
    except Exception as exc:
        logger.warning(f"Could not generate Google Meet link via Google Calendar API: {exc}")

    # Fallback to cohort meeting link if API failed
    if not pre_screening.meeting_link and cohort and cohort.meeting_link:
        pre_screening.meeting_link = cohort.meeting_link

    # 5. Assign same link to all students scheduled in that cohort and schedule window
    if pre_screening.meeting_link and sync_cohort_students and cohort:
        _sync_peer_students_meeting_link(pre_screening, pre_screening.meeting_link)

    return pre_screening.meeting_link


def _sync_peer_students_meeting_link(source_screening, meeting_link):
    """Synchronize the same Google Meet link to all students in the same cohort & screening window."""
    application = source_screening.application
    if not application or not application.assigned_cohort:
        return

    from applications.models import PreScreening

    scheduled_at = source_screening.scheduled_at or timezone.now()
    window_start = scheduled_at - timedelta(hours=18)
    window_end = scheduled_at + timedelta(hours=18)

    peer_schedules = PreScreening.objects.filter(
        application__course=application.course,
        application__assigned_cohort=application.assigned_cohort,
        scheduled_at__range=(window_start, window_end),
    ).filter(
        models.Q(meeting_link__isnull=True) | models.Q(meeting_link="")
    )

    if source_screening.pk:
        peer_schedules = peer_schedules.exclude(pk=source_screening.pk)

    update_data = {"meeting_link": meeting_link, "updated_at": timezone.now()}
    if getattr(source_screening, "calendar_event_id", None):
        update_data["calendar_event_id"] = source_screening.calendar_event_id

    updated_count = peer_schedules.update(**update_data)
    if updated_count:
        logger.info(
            f"Synchronized Google Meet link to {updated_count} student schedule(s) in cohort {application.assigned_cohort.code}."
        )


def remove_candidate_from_screening_meet(pre_screening):
    """
    Revoke student's Google Meet access by removing their email address from the Calendar event.
    """
    if not pre_screening:
        return False

    calendar_event_id = getattr(pre_screening, "calendar_event_id", None)
    if not calendar_event_id:
        return False

    application = getattr(pre_screening, "application", None)
    if not application or not application.student or not application.student.user:
        return False

    student_email = application.student.user.email
    if not student_email:
        return False

    from attendance.services.google_meet_service import remove_attendee_from_google_event
    success = remove_attendee_from_google_event(calendar_event_id, student_email)
    if success:
        logger.info(f"Removed student {student_email} from screening meet calendar event {calendar_event_id}.")
    return success


def find_existing_cohort_screening_meeting_link(course, cohort, schedule_date=None):
    """Query helper to locate an existing Google Meet link for a Course + Cohort schedule."""
    if not course:
        return None

    from applications.models import PreScreening

    qs = PreScreening.objects.filter(
        application__course=course,
        meeting_link__isnull=False,
    ).exclude(meeting_link="")

    if cohort:
        qs = qs.filter(application__assigned_cohort=cohort)

    if schedule_date:
        day_start = timezone.make_aware(datetime.combine(schedule_date, time.min))
        day_end = timezone.make_aware(datetime.combine(schedule_date, time.max))
        match = qs.filter(scheduled_at__range=(day_start, day_end)).order_by("-updated_at").first()
        if match and match.meeting_link:
            return match.meeting_link

    match = qs.order_by("-updated_at").first()
    if match and match.meeting_link:
        return match.meeting_link

    if cohort and cohort.meeting_link:
        return cohort.meeting_link

    return None
