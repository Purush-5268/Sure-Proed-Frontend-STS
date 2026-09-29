from .models import Application, PreScreening, PreScreeningInterview


RELEASED_STATUSES = {
    Application.Status.REJECTED,
    Application.Status.DROPPED,
    Application.Status.CANCELLED,
    Application.Status.COMPLETED,
    Application.Status.SUSPENDED,
}

ENROLLED_STATUSES = {
    Application.Status.COHORT_ASSIGNED,
    Application.Status.IN_PROGRESS,
    Application.Status.TRAINING,
    Application.Status.INTERNSHIP_ASSIGNED,
    Application.Status.TRANSFER_COHORT,
}


def application_release_reason(application):
    """Return why an application no longer blocks a new course, or None while active."""
    if application.status in RELEASED_STATUSES:
        return application.status

    if application.qualified is False:
        return "NOT_QUALIFIED"

    try:
        exam = application.exam
    except Exception:
        exam = None
    if exam is not None and exam.qualified is False:
        return "NOT_QUALIFIED"

    try:
        pre_screening = application.pre_screening
    except Exception:
        pre_screening = None
    if pre_screening is not None and pre_screening.status == PreScreening.Status.FAILED:
        return "SCREENING_FAILED"

    try:
        interview = application.pre_screening_interview
    except Exception:
        interview = None
    requires_interview = (
        application.assigned_cohort.requires_interview
        if application.assigned_cohort and hasattr(application.assigned_cohort, "requires_interview")
        else getattr(application.course, "requires_interview", True)
    )
    if (
        requires_interview
        and interview is not None
        and interview.status == PreScreeningInterview.Status.FAILED
    ):
        return "MENTOR_VERIFICATION_FAILED"

    cohort = application.assigned_cohort
    if cohort is not None and cohort.status == "CANCELLED":
        return "COHORT_CANCELLED"

    if application.course.status == "CANCELLED":
        return "COURSE_CANCELLED"

    return None


def blocking_application_for(student):
    applications = list(
        Application.objects.filter(student=student)
        .select_related(
            "course",
            "assigned_cohort",
            "exam",
            "pre_screening",
            "pre_screening_interview",
        )
        .order_by("-applied_at")
    )
    active_applications = [
        application
        for application in applications
        if application_release_reason(application) is None
    ]
    return next(
        (
            application
            for application in active_applications
            if application.assigned_cohort_id
            and application.status in ENROLLED_STATUSES
        ),
        active_applications[0] if active_applications else None,
    )


def enrolled_application_for(student):
    """Return the student's authoritative active cohort journey, if one exists."""
    application = blocking_application_for(student)
    if (
        application
        and application.assigned_cohort_id
        and application.status in ENROLLED_STATUSES
    ):
        return application
    return None


def course_selection_payload(student, serializer_class):
    blocking = blocking_application_for(student)
    if blocking is None:
        return {
            "can_apply": True,
            "reason": "AVAILABLE",
            "message": "You can select one published course.",
            "blocking_application": None,
        }

    enrolled = blocking.assigned_cohort_id is not None or blocking.status in {
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
    }
    return {
        "can_apply": False,
        "reason": "ENROLLED" if enrolled else "ACTIVE_APPLICATION",
        "message": (
            "You are already enrolled. Published courses remain visible, but a new application "
            "is available only after this course is discontinued, completed, or cancelled."
            if enrolled
            else "Only one course can be selected at a time. Other courses unlock if this "
            "application is not qualified, verification fails, or it is cancelled."
        ),
        "blocking_application": serializer_class(blocking).data,
    }
