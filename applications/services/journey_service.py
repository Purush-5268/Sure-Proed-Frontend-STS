"""Backend-owned computation for the complete SURE TRUST student journey."""

from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from applications.models import Application, CommunityActivity, PreScreeningInterview
from assignments.models import Assignment, Submission
from attendance.models import Attendance
from certificates.models import Certificate
from exams.models import Exam, ModuleTest, ModuleTestSubmission
from trainings.models import Training, TrainingAttendance, TrainingSession


COMPLETED = "COMPLETED"
CURRENT = "CURRENT"
UPCOMING = "UPCOMING"
FAILED = "FAILED"


def _date(value):
    return value.isoformat() if value else None


def _step(number, code, title, state, subtitle, *, date=None, details=None, action_url=None):
    return {
        "step_number": number,
        "code": code,
        "title": title,
        "state": state,
        "completed": state == COMPLETED,
        "subtitle": subtitle,
        "date": _date(date),
        "details": details,
        "action_url": action_url,
    }


def _training_requirement(student, cohort, training_type):
    if cohort is None:
        return {"configured": False, "completed": False, "total": 0, "present": 0}
    sessions = TrainingSession.objects.filter(
        training__training_type=training_type,
        training__is_active=True,
    ).filter(Q(cohort=cohort) | Q(cohort__isnull=True)).distinct()
    total = sessions.count()
    finished_ids = list(
        sessions.filter(session_date__lte=timezone.localdate()).values_list("id", flat=True)
    )
    present = TrainingAttendance.objects.filter(
        session_id__in=finished_ids,
        student=student,
        status=TrainingAttendance.Status.PRESENT,
    ).values("session_id").distinct().count()
    completed = bool(total and len(finished_ids) == total and present == total)
    return {"configured": total > 0, "completed": completed, "total": total, "present": present}


def build_student_journey(student, application=None):
    """Return all 18 stages and the exact requirements blocking progression."""
    if not student:
        return {
            "status": "PROFILE",
            "current_step": 1,
            "completed_steps": 0,
            "total_steps": 18,
            "completion_percentage": 0.0,
            "linkedin_required": False,
            "github_required": False,
            "interview_required": False,
            "can_assign_cohort": False,
            "requirements_verified": False,
            "blockers": ["Student profile is required."],
            "steps": [],
            "metrics": {},
        }
    user = getattr(student, "user", None)
    if not user:
        return {
            "status": "PROFILE",
            "current_step": 1,
            "completed_steps": 0,
            "total_steps": 18,
            "completion_percentage": 0.0,
            "linkedin_required": False,
            "github_required": False,
            "interview_required": False,
            "can_assign_cohort": False,
            "requirements_verified": False,
            "blockers": ["Student user account is missing."],
            "steps": [],
            "metrics": {},
        }

    if application is None:
        application = student.applications.select_related("course", "assigned_cohort").order_by("-applied_at").first()

    pre_screening = None
    interview = None
    exam = None
    if application:
        try:
            pre_screening = application.pre_screening
        except Exception:
            pre_screening = None
        try:
            interview = application.pre_screening_interview
        except Exception:
            interview = None
        try:
            exam = application.exam
        except Exception:
            exam = None

    course = getattr(application, "course", None) if application else None
    cohort = getattr(application, "assigned_cohort", None) if application else None
    if cohort and hasattr(cohort, "requires_interview"):
        interview_required = bool(cohort.requires_interview)
    else:
        interview_required = bool(course and getattr(course, "requires_interview", True))

    first_name = (getattr(user, "first_name", "") or "").strip()
    last_name = (getattr(user, "last_name", "") or "").strip()
    phone_number = getattr(user, "phone_number", None)
    college = getattr(student, "college", None)
    degree = getattr(student, "degree", None)
    github_url = (getattr(student, "github_url", "") or "").strip()

    profile_complete = bool(
        first_name
        and last_name
        and phone_number
        and college
        and degree
    )
    linkedin_connected = bool(getattr(student, "is_linkedin_connected", False))
    github_linked = bool(getattr(student, "is_github_connected", False) or github_url)
    application_reviewed = bool(
        application
        and (
            application.status != Application.Status.APPLIED
            or pre_screening is not None
            or exam is not None
        )
    )
    screening_scheduled = bool(
        (pre_screening and pre_screening.scheduled_at)
        or exam is not None
        or (application and application.status in {
            Application.Status.PRESCREENING_PENDING,
            Application.Status.PRESCREENING_COMPLETED,
            Application.Status.EXAM_PENDING,
            Application.Status.EXAM_COMPLETED,
        })
    )
    screening_evaluated = bool(
        exam
        and (
            exam.status == Exam.Status.EVALUATED
            or exam.marks_obtained is not None
            or exam.percentage is not None
        )
    )
    qualified = bool(
        application
        and (
            application.qualified is True
            or (exam and exam.qualified is True)
        )
    )
    qualification_failed = bool(screening_evaluated and not qualified)
    interview_passed = bool(
        not interview_required
        or (interview and interview.status == PreScreeningInterview.Status.PASSED)
    )
    interview_failed = bool(
        interview_required
        and interview
        and interview.status == PreScreeningInterview.Status.FAILED
    )
    role_verified = bool(
        application
        and application.role_verification_status == Application.RoleVerificationStatus.VERIFIED
        and qualified
        and interview_passed
    )
    cohort_assigned = cohort is not None

    total_sessions = attended_sessions = 0
    attendance_percentage = Decimal("0.00")
    module_total = module_passed = 0
    regular_total = regular_passed = 0
    assignment_average = Decimal("0.00")
    project_total = project_passed = 0
    has_capstone = False
    if cohort:
        from attendance.services.student_scope import attendance_metrics
        metrics = attendance_metrics(student, application)
        total_sessions = metrics["total"]
        attended_sessions = metrics["present"]
        attendance_percentage = Decimal(str(metrics["percentage"]))

        module_tests = ModuleTest.objects.filter(course=course, is_active=True).filter(
            Q(cohort=cohort) | Q(cohort__isnull=True)
        )
        module_total = module_tests.count()
        module_passed = ModuleTestSubmission.objects.filter(
            test__in=module_tests,
            student=student,
            qualified=True,
        ).values("test_id").distinct().count()

        published = Assignment.objects.filter(cohort=cohort, status=Assignment.Status.PUBLISHED)
        regular = published.exclude(assignment_type__in=[Assignment.AssignmentType.PROJECT, Assignment.AssignmentType.CAPSTONE])
        projects = published.filter(assignment_type=Assignment.AssignmentType.CAPSTONE)
        regular_total = regular.count()
        regular_passed = Submission.objects.filter(
            assignment__in=regular,
            student=student,
            evaluated=True,
            passed=True,
        ).values("assignment_id").distinct().count()
        regular_submissions = Submission.objects.filter(
            assignment__in=regular,
            student=student,
            evaluated=True,
            marks_obtained__isnull=False,
        ).select_related("assignment")
        regular_percentages = [
            submission.marks_obtained / submission.assignment.max_marks * Decimal("100.00")
            for submission in regular_submissions
            if submission.assignment.max_marks > 0
        ]
        if regular_percentages:
            assignment_average = round(
                sum(regular_percentages) / Decimal(len(regular_percentages)), 2
            )
        project_total = projects.count()
        project_passed = Submission.objects.filter(
            assignment__in=projects,
            student=student,
            evaluated=True,
            passed=True,
        ).values("assignment_id").distinct().count()
        has_capstone = projects.filter(assignment_type=Assignment.AssignmentType.CAPSTONE).exists()

    # Requirement evaluation
    req_assignments = getattr(course, "requires_assignments", True) if course else True
    req_module_tests = getattr(course, "requires_module_tests", False) if course else False
    req_capstone = getattr(course, "requires_capstone", False) if course else False
    req_tree = getattr(course, "requires_tree_plantation", False) if course else False
    req_social = getattr(course, "requires_social_activity", False) if course else False
    req_soft_skills = getattr(course, "requires_soft_skills_training", False) if course else False
    req_lst = getattr(course, "requires_lst_training", False) if course else False

    # 1. Attendance
    if not cohort_assigned:
        attendance_state = UPCOMING
        attendance_met = False
    elif total_sessions == 0:
        attendance_state = CURRENT
        attendance_met = False
    elif course and attendance_percentage >= course.minimum_attendance_percentage:
        attendance_state = COMPLETED
        attendance_met = True
    else:
        attendance_state = CURRENT
        attendance_met = False

    # 2. Module Tests / Coursework
    if not req_module_tests:
        modules_state = "NOT_REQUIRED"
        modules_complete = True
    elif not cohort_assigned:
        modules_state = UPCOMING
        modules_complete = False
    elif module_total == 0:
        modules_state = CURRENT
        modules_complete = False
    elif module_passed == module_total:
        modules_state = COMPLETED
        modules_complete = True
    else:
        modules_state = CURRENT
        modules_complete = False

    # 3. Regular Assignments
    if not req_assignments:
        assignments_state = "NOT_REQUIRED"
        assignments_complete = True
    elif not cohort_assigned:
        assignments_state = UPCOMING
        assignments_complete = False
    elif regular_total == 0:
        assignments_state = CURRENT
        assignments_complete = False
    elif regular_passed == regular_total and assignment_average >= (course.minimum_assignment_percentage if course else Decimal("60.00")):
        assignments_state = COMPLETED
        assignments_complete = True
    else:
        assignments_state = CURRENT
        assignments_complete = False

    # 5. Trainings
    life_skills = _training_requirement(student, cohort, Training.TrainingType.LST)
    soft_skills = _training_requirement(student, cohort, Training.TrainingType.SOFT_SKILLS)
    lst_complete = life_skills["completed"] if req_lst else True
    soft_complete = soft_skills["completed"] if req_soft_skills else True
    trainings_complete = lst_complete and soft_complete

    if not (req_lst or req_soft_skills):
        trainings_state = "NOT_REQUIRED"
    elif not cohort_assigned:
        trainings_state = UPCOMING
    elif trainings_complete:
        trainings_state = COMPLETED
    else:
        trainings_state = CURRENT

    # 4. Capstone Project (Preceded by parallel coursework, assignments, and training)
    if not req_capstone:
        capstone_state = "NOT_REQUIRED"
        projects_complete = True
    elif not cohort_assigned:
        capstone_state = UPCOMING
        projects_complete = False
    elif not (modules_complete and assignments_complete and trainings_complete):
        capstone_state = UPCOMING
        projects_complete = False
    elif project_total == 0 or not has_capstone:
        capstone_state = CURRENT
        projects_complete = False
    elif project_passed == project_total:
        capstone_state = COMPLETED
        projects_complete = True
    else:
        capstone_state = CURRENT
        projects_complete = False

    # 6. Community Activities
    activities = CommunityActivity.objects.filter(application=application) if application else CommunityActivity.objects.none()
    tree_verified = activities.filter(
        activity_type=CommunityActivity.ActivityType.TREE_PLANTATION,
        status=CommunityActivity.Status.VERIFIED,
    ).exists()
    responsibility_verified = activities.filter(
        activity_type__in=[
            CommunityActivity.ActivityType.BLOOD_DONATION,
            CommunityActivity.ActivityType.HELPING_SOCIETY,
        ],
        status=CommunityActivity.Status.VERIFIED,
    ).exists()

    tree_state = "NOT_REQUIRED" if not req_tree else (COMPLETED if tree_verified else (CURRENT if cohort_assigned else UPCOMING))
    social_state = "NOT_REQUIRED" if not req_social else (COMPLETED if responsibility_verified else (CURRENT if cohort_assigned else UPCOMING))

    coursework_complete = bool(cohort_assigned and attendance_met and modules_complete)
    lifecycle_eligible_for_completion = bool(
        application
        and application.status in {
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
            Application.Status.COMPLETED,
        }
    )
    requirements_verified = bool(
        cohort_assigned
        and qualified
        and interview_passed
        and role_verified
        and lifecycle_eligible_for_completion
        and attendance_met
        and modules_complete
        and assignments_complete
        and projects_complete
        and trainings_complete
        and (not req_tree or tree_verified)
        and (not req_social or responsibility_verified)
    )

    certificate = Certificate.objects.filter(
        application=application,
        status=Certificate.Status.ACTIVE,
    ).first() if application else None

    application_state = COMPLETED if application else (CURRENT if profile_complete else UPCOMING)
    review_subtitle = "Application reviewed" if application_reviewed else (
        "Connect LinkedIn before review" if application and not linkedin_connected else "Awaiting administration review"
    )
    if not interview_required:
        interview_state = COMPLETED
        interview_subtitle = "Interview not required for this course"
    elif interview_passed:
        interview_state = COMPLETED
        interview_subtitle = "Interview passed"
    elif interview_failed:
        interview_state = FAILED
        interview_subtitle = "Interview failed"
    else:
        interview_state = CURRENT if qualified else UPCOMING
        interview_subtitle = (
            "Interview rescheduled"
            if interview and interview.status == PreScreeningInterview.Status.RESCHEDULED
            else ("Interview scheduled" if interview else "Schedule pending after qualification")
        )
    role_subtitle = "Verified student access" if role_verified else (
        "Add GitHub after qualification"
        if qualified and not github_linked
        else (
            "LinkedIn and GitHub are required"
            if not interview_required
            else "LinkedIn, GitHub, and passed interview are required"
        )
    )

    course_name = getattr(course, "name", "Choose one published course") if course else "Choose one published course"
    cohort_code = getattr(cohort, "code", "Cohort") if cohort else "Cohort"
    cohort_start = getattr(cohort, "start_date", None) if cohort else None
    min_att = getattr(course, "minimum_attendance_percentage", 75) if course else 75
    min_assign = getattr(course, "minimum_assignment_percentage", 60) if course else 60

    screening_grade_text = "Marks have not been published"
    if screening_evaluated and exam:
        m_obt = getattr(exam, "marks_obtained", "-")
        m_tot = getattr(exam, "total_marks", "-")
        m_pct = getattr(exam, "percentage", "-")
        screening_grade_text = f"{m_obt}/{m_tot} • {m_pct}%"

    steps = [
        _step(1, "SIGNUP", "Student Signup", COMPLETED, "Account created", date=getattr(user, "created_at", None)),
        _step(2, "PROFILE", "Student Profile", COMPLETED if profile_complete else CURRENT, "Profile completed" if profile_complete else "Add personal, contact, and education details", date=getattr(student, "updated_at", None), action_url="profile"),
        _step(3, "APPLICATION", "Apply for Course", application_state, course_name, date=getattr(application, "applied_at", None) if application else None, details=getattr(application, "application_number", None) if application else None, action_url="courses"),
        _step(4, "APPLICATION_REVIEW", "Application Review", COMPLETED if application_reviewed else (CURRENT if application else UPCOMING), review_subtitle, date=getattr(application, "updated_at", None) if application_reviewed else None, action_url="application_tracker"),
        _step(5, "SCREENING_SCHEDULED", "Screening Scheduled", COMPLETED if screening_scheduled else (CURRENT if application_reviewed and linkedin_connected else UPCOMING), "Pre-screening assessment scheduled" if screening_scheduled else "Schedule pending after profile and LinkedIn verification", date=getattr(pre_screening, "scheduled_at", None) if pre_screening else None, action_url="screening"),
        _step(6, "SCREENING_GRADE", "Screening Marks & Grade", COMPLETED if screening_evaluated else (CURRENT if screening_scheduled else UPCOMING), screening_grade_text, date=getattr(exam, "submitted_at", None) if exam else None, action_url="grades"),
        _step(7, "QUALIFICATION", "Qualification Result", COMPLETED if qualified else (FAILED if qualification_failed else (CURRENT if screening_evaluated else UPCOMING)), "Qualified" if qualified else ("Not qualified" if qualification_failed else "Awaiting evaluated result"), date=getattr(exam, "submitted_at", None) if exam else None),
        _step(
            8,
            "INTERVIEW",
            "Candidate Interview",
            interview_state,
            interview_subtitle,
            date=getattr(interview, "scheduled_at", None) if interview else None,
            action_url=(
                getattr(interview, "meeting_link", None)
                if interview
                and getattr(interview, "status", None) in {
                    PreScreeningInterview.Status.SCHEDULED,
                    PreScreeningInterview.Status.RESCHEDULED,
                }
                and getattr(interview, "meeting_link", None)
                else None
            ),
        ),
        _step(9, "ROLE_VERIFICATION", "Student Role Verification", COMPLETED if role_verified else (CURRENT if interview_passed else UPCOMING), role_subtitle, action_url="profile"),
        _step(10, "COHORT", "Assigned to Cohort", COMPLETED if cohort_assigned else (CURRENT if role_verified else UPCOMING), f"Cohort: {cohort_code}" if cohort else "Cohort assignment pending", date=cohort_start, action_url="timetable"),
        _step(11, "COURSEWORK", "Attend Classes & Module Tests", COMPLETED if coursework_complete else (attendance_state if attendance_state != COMPLETED else modules_state), f"Attendance {attendance_percentage}% • Module tests {module_passed}/{module_total}", details=f"Minimum attendance: {min_att}%" if course else None, action_url="grades"),
        _step(12, "ASSIGNMENTS", "Submit Assignments", assignments_state, f"Passed assignments {regular_passed}/{regular_total} • Average {assignment_average}%" if req_assignments else "Not required for this course", details=f"Minimum assignment average: {min_assign}%" if course and req_assignments else None, action_url="assignments"),
        _step(13, "SKILLS_TRAINING", "Life Skills & Soft Skills Training", trainings_state, f"LST {life_skills['present']}/{life_skills['total']} • Soft Skills {soft_skills['present']}/{soft_skills['total']}" if (req_lst or req_soft_skills) else "Not required for this course", action_url="training"),
        _step(14, "CAPSTONE", "Capstone Project", capstone_state, f"Passed capstone work {project_passed}/{project_total}" if req_capstone else "Not required for this course", details="The final capstone starts after coursework, assignments, and skills training are complete." if req_capstone else None, action_url="assignments"),
        _step(15, "TREE_PLANTATION", "Tree Plantation", tree_state, "Plantation activity verified" if tree_verified else ("Not required for this course" if not req_tree else "Submit evidence for verification"), action_url="community_activities"),
        _step(16, "SOCIAL_RESPONSIBILITY", "Blood Donation & Helping Society", social_state, "Community activity verified" if responsibility_verified else ("Not required for this course" if not req_social else "Complete blood donation or an approved helping-society activity"), action_url="community_activities"),
        _step(17, "REQUIREMENTS", "Requirements Verification", COMPLETED if requirements_verified else (CURRENT if cohort_assigned else UPCOMING), "All programme requirements verified" if requirements_verified else "Backend verification pending"),
        _step(18, "CERTIFICATE", "Official SURE ProEd Certificate", COMPLETED if certificate else (CURRENT if requirements_verified else UPCOMING), "Official certificate issued" if certificate else "Certificate issued after final verification", date=getattr(certificate, "issued_at", None) if certificate else None, action_url="certificates"),
    ]

    blockers = []
    if application and not profile_complete:
        blockers.append("Complete personal, contact, and education profile details.")
    if application and not linkedin_connected:
        blockers.append("Connect LinkedIn before application review and screening.")
    if application and cohort_assigned and not qualified:
        blockers.append("Publish a qualified screening result before course completion.")
    if qualified and not github_linked:
        blockers.append("Link GitHub after qualification.")
    if qualified and interview_required and not interview_passed:
        blockers.append("Pass the pre-screen interview.")
    if qualified and interview_passed and not role_verified:
        blockers.append("Obtain administrator student-role verification.")
    if application and application.status in {
        Application.Status.SUSPENDED,
        Application.Status.TRANSFER_COHORT,
    }:
        blockers.append("Return the application to an active enrolled status before completion.")
    if application and application.status in {
        Application.Status.REJECTED,
        Application.Status.DROPPED,
        Application.Status.CANCELLED,
    }:
        blockers.append("A closed application cannot be completed.")
    if cohort_assigned:
        if total_sessions == 0:
            blockers.append("No attendance sessions have been conducted for this cohort yet.")
        elif not attendance_met:
            blockers.append(f"Meet the {min_att}% minimum attendance requirement.")
        if req_module_tests:
            if module_total == 0:
                blockers.append("Module tests are required but none are configured for this course.")
            elif not modules_complete:
                blockers.append("Pass every configured module test.")
        if req_assignments:
            if regular_total == 0:
                blockers.append("Assignments are required but none are published for this cohort.")
            elif not assignments_complete:
                blockers.append(f"Pass all published assignments with minimum {min_assign}% average.")
        if req_capstone:
            if project_total == 0 or not has_capstone:
                blockers.append("Capstone project is required but not configured.")
            elif not projects_complete:
                blockers.append("Pass the final capstone project.")
        if req_lst and not life_skills["completed"]:
            blockers.append("Complete Life Skills Training (LST) attendance.")
        if req_soft_skills and not soft_skills["completed"]:
            blockers.append("Complete Soft Skills Training attendance.")
        if req_tree and not tree_verified:
            blockers.append("Obtain verification for a tree-plantation activity.")
        if req_social and not responsibility_verified:
            blockers.append("Obtain verification for blood donation or a helping-society activity.")

    completed_count = sum(1 for step in steps if step["completed"])
    current = next((step for step in steps if step["state"] in {CURRENT, FAILED, "REQUIRED_NOT_CONFIGURED"}), steps[-1])
    return {
        "status": "CERTIFICATE_ISSUED" if certificate else ("REQUIREMENTS_VERIFIED" if requirements_verified else current["code"]),
        "current_step": current["step_number"],
        "completed_steps": completed_count,
        "total_steps": len(steps),
        "completion_percentage": round(completed_count / len(steps) * 100, 2),
        "linkedin_required": application is not None and not linkedin_connected,
        "github_required": qualified and not github_linked,
        "interview_required": interview_required,
        "can_assign_cohort": role_verified,
        "requirements_verified": requirements_verified,
        "blockers": blockers,
        "steps": steps,
        "metrics": {
            "attendance_percentage": attendance_percentage,
            "attendance_sessions": total_sessions,
            "module_tests_passed": module_passed,
            "module_tests_total": module_total,
            "assignments_passed": regular_passed,
            "assignments_total": regular_total,
            "assignment_average": assignment_average,
            "projects_passed": project_passed,
            "projects_total": project_total,
            "life_skills_completed": life_skills["completed"],
            "soft_skills_completed": soft_skills["completed"],
            "tree_plantation_verified": tree_verified,
            "social_responsibility_verified": responsibility_verified,
        },
    }
