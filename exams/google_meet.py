from attendance.services.attendee_resolver import AttendeeResolver
from attendance.services.google_meet_service import (
    generate_google_meet,
    update_google_meet,
)


class ModuleTestMeetError(RuntimeError):
    """Raised when a scheduled module test has no usable Google Meet link."""


def module_test_attendee_emails(module_test):
    """Resolve students and mentors belonging to the selected cohort, or all active students in the course."""
    if not module_test.cohort_id:
        if not module_test.course_id:
            return []
        # Get emails for all active students in the course
        from accounts.models import User
        users = User.objects.filter(
            role="STUDENT",
            is_active=True,
            student_profile__applications__course_id=module_test.course_id,
            student_profile__applications__status__in=[
                "COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED"
            ]
        ).distinct()
        return [user.email for user in users if user.email]
        
    return sorted(set(AttendeeResolver.resolve_emails_by_criteria(
        class_type="DOMAIN",
        cohort_id=module_test.cohort_id,
    )))


def sync_module_test_google_meet(module_test):
    """
    Create one Google Meet for a module-test window or update its Calendar event.

    A stored event ID is the idempotency boundary. A legacy stored Meet URL is
    reused rather than creating a second room. The cohort link is a final safe
    fallback when Calendar credentials are temporarily unavailable.
    """
    # Allow generating Google Meet even if cohort_id is not set
    if not module_test.scheduled_at or not module_test.end_time:
        raise ModuleTestMeetError("Set the module-test start and end time first.")

    attendees = module_test_attendee_emails(module_test)
    if module_test.calendar_event_id:
        try:
            link, event_id = update_google_meet(
                calendar_event_id=module_test.calendar_event_id,
                session_title=module_test.title,
                start_datetime=module_test.scheduled_at,
                end_datetime=module_test.end_time,
                attendee_emails=attendees,
            )
        except Exception:
            if module_test.meeting_link:
                return module_test.meeting_link, module_test.calendar_event_id, False
            raise
        usable_link = link or module_test.meeting_link
        if not usable_link:
            raise ModuleTestMeetError(
                "The existing Calendar event has no usable Google Meet link; the test remains locked."
            )
        return usable_link, event_id or module_test.calendar_event_id, False

    if module_test.meeting_link:
        return module_test.meeting_link, None, False

    link, event_id = generate_google_meet(
        session_title=module_test.title,
        start_datetime=module_test.scheduled_at,
        end_datetime=module_test.end_time,
        attendee_emails=attendees,
    )
    if link:
        return link, event_id, True

    if module_test.cohort and getattr(module_test.cohort, "meeting_link", None):
        return module_test.cohort.meeting_link, None, False

    raise ModuleTestMeetError(
        "Google Meet link could not be generated automatically (Google Calendar API unavailable). Please provide a meeting link manually."
    )
