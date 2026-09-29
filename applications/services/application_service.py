import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class ApplicationService:
    """
    Authoritative domain service for student application, course, and cohort eligibility validation.
    """

    @staticmethod
    def can_student_apply(
        student,
        course,
        cohort=None,
        is_admin_assignment=False,
    ) -> Tuple[bool, str, str]:
        """
        Validate whether a student is eligible to apply for a course and (optionally) cohort.

        Returns:
            (is_eligible: bool, error_message: str, error_code: str)
        """
        from applications.models import Application
        from cohorts.models import Cohort
        from courses.models import Course
        from applications.policy import blocking_application_for

        if student is None:
            return False, "A valid student account is required to submit an application.", "STUDENT_REQUIRED"

        course_id = getattr(course, "id", course)
        cohort_id = getattr(cohort, "id", cohort) if cohort else None

        # 1. Duplicate Course Completion Restriction:
        # A student who successfully completed a course cannot re-apply to the same course.
        completed_prior = Application.objects.filter(
            student=student,
            course_id=course_id,
        ).filter(
            status=Application.Status.COMPLETED
        ).exists()

        if completed_prior:
            return (
                False,
                "You have already successfully completed this course and cannot re-apply.",
                "COURSE_ALREADY_COMPLETED",
            )

        # 2. Active Cohort Restriction (One Active Cohort at a Time):
        # A student who is currently assigned to an active cohort cannot take an exam or apply
        # for any other course cohort until their status in their current cohort is Dropped Out or Completed.
        active_cohort_app = Application.objects.filter(
            student=student,
            assigned_cohort__isnull=False,
        ).exclude(
            status__in=[
                Application.Status.DROPPED,
                Application.Status.COMPLETED,
                Application.Status.CANCELLED,
                Application.Status.REJECTED,
                Application.Status.SUSPENDED,
            ]
        ).exclude(
            assigned_cohort__status__in=[
                Cohort.Status.COMPLETED,
                Cohort.Status.CANCELLED,
            ]
        ).select_related("course", "assigned_cohort").first()

        if active_cohort_app:
            # Check if this is an attempt to apply for another course or another cohort
            is_different_course = str(active_cohort_app.course_id) != str(course_id)
            is_different_cohort = cohort_id and str(active_cohort_app.assigned_cohort_id) != str(cohort_id)
            if is_different_course or is_different_cohort:
                return (
                    False,
                    "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one.",
                    "ACTIVE_COHORT_RESTRICTION",
                )

        # 3. Ongoing Pre-Enrollment Application Lock:
        # Students can only apply for one course at a time.
        active_app = blocking_application_for(student)
        if active_app:
            if str(active_app.course_id) != str(course_id):
                if active_app.assigned_cohort_id:
                    return (
                        False,
                        "You are currently enrolled in an active cohort. You must complete or drop out of your existing cohort before applying to a new one.",
                        "ACTIVE_COHORT_RESTRICTION",
                    )
                return (
                    False,
                    "Only one course can be selected at a time. Other courses unlock if this application is not qualified, verification fails, or it is cancelled.",
                    "COURSE_SELECTION_LOCKED",
                )

        # 4. Target Course Status Check:
        course_obj = course if isinstance(course, Course) else Course.objects.filter(id=course_id).first()
        if not course_obj or course_obj.status != Course.Status.PUBLISHED:
            return False, "Applications are only accepted for active, published courses.", "COURSE_NOT_PUBLISHED"

        # 5. Cohort Application Deadline Check (if cohort is explicitly provided)
        if cohort:
            cohort_obj = cohort if isinstance(cohort, Cohort) else Cohort.objects.filter(id=cohort_id).first()
            if cohort_obj:
                if not is_admin_assignment and cohort_obj.status != Cohort.Status.OPEN:
                    return (
                        False,
                        "Selected cohort is not currently open for student applications.",
                        "COHORT_NOT_OPEN",
                    )
                if cohort_obj.application_end_date:
                    from django.utils import timezone
                    if not is_admin_assignment and timezone.now() > cohort_obj.application_end_date:
                        return (
                            False,
                            "The application deadline for this cohort has passed.",
                            "APPLICATION_DEADLINE_PASSED",
                        )

        # 6. Profile Completion Check
        user = getattr(student, "user", None)
        first_name = (getattr(user, "first_name", "") or "").strip()
        last_name = (getattr(user, "last_name", "") or "").strip()
        phone_number = getattr(user, "phone_number", None)
        college = getattr(student, "college", None)
        degree = getattr(student, "degree", None)

        is_profile_complete = bool(
            first_name
            and last_name
            and phone_number
            and college
            and degree
        )
        if not is_admin_assignment and not is_profile_complete:
            return (
                False,
                "A complete student profile is required before applying for a course.",
                "PROFILE_INCOMPLETE",
            )

        return True, "Eligible to apply.", "OK"
