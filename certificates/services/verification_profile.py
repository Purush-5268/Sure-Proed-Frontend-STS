"""Public, privacy-aware certificate and journey verification payloads."""

from __future__ import annotations

from django.db.models import Count, Q
from django.urls import reverse


def _name(user) -> str:
    if not user:
        return "Valued Recipient"
    return user.get_full_name().strip() or user.email


def _certificate_summary(certificate) -> dict:
    application = certificate.application
    return {
        "verified": True,
        "certificate_number": certificate.certificate_number,
        "verification_code": certificate.verification_code,
        "certificate_type": certificate.certificate_type,
        "certificate_type_display": certificate.get_certificate_type_display(),
        "title": certificate.title or (application.course.name if application else certificate.get_certificate_type_display()),
        "issued_at": certificate.issued_at,
        "status": certificate.status,
    }


def _student_profile(certificate, request) -> dict:
    from assignments.models import Assignment, Submission
    from exams.models import ModuleTestSubmission

    student = certificate.student
    user = student.user
    application = certificate.application
    cohort = application.assigned_cohort if application else None
    is_public = bool(student.is_public)

    links = []
    if is_public:
        for label, url in [
            ("LinkedIn", student.linkedin_url),
            ("GitHub", student.github_url),
            ("Course repository", student.github_repo_url),
            ("Portfolio", student.portfolio_url),
        ]:
            if url:
                links.append({"label": label, "url": url})

    assignment_rows = []
    assignment_summary = {"assigned": 0, "submitted": 0, "graded": 0, "passed": 0}
    if cohort:
        assignments = Assignment.objects.filter(cohort=cohort).order_by("module__order", "deadline")
        submissions = {
            row.assignment_id: row
            for row in Submission.objects.filter(student=student, assignment__cohort=cohort).select_related("assignment")
        }
        assignment_summary["assigned"] = assignments.count()
        for assignment in assignments:
            submission = submissions.get(assignment.id)
            if submission:
                assignment_summary["submitted"] += 1
                assignment_summary["graded"] += int(submission.evaluated)
                assignment_summary["passed"] += int(submission.passed is True)
            assignment_rows.append({
                "title": assignment.title,
                "type": assignment.get_assignment_type_display(),
                "module": assignment.module.title if assignment.module else None,
                "submitted": bool(submission),
                "evaluated": bool(submission and submission.evaluated),
                "marks": submission.marks_obtained if submission and submission.evaluated else None,
                "maximum_marks": assignment.max_marks,
                "passed": submission.passed if submission and submission.evaluated else None,
                "submission_url": submission.submission_url if submission and is_public else None,
            })

    module_tests = []
    module_test_query = ModuleTestSubmission.objects.filter(student=student).select_related("test", "test__module", "cohort")
    if cohort:
        module_test_query = module_test_query.filter(Q(cohort=cohort) | Q(test__cohort=cohort))
    for result in module_test_query.order_by("test__module__order", "created_at"):
        module_tests.append({
            "title": result.test.title,
            "module": result.test.module.title if result.test.module else None,
            "status": result.status,
            "marks": result.marks_obtained,
            "total_marks": result.total_marks,
            "percentage": result.percentage,
            "qualified": result.qualified,
        })

    prescreening = None
    if application and hasattr(application, "exam"):
        exam = application.exam
        prescreening = {
            "status": exam.status,
            "marks": exam.marks_obtained,
            "total_marks": exam.total_marks,
            "percentage": exam.percentage,
            "qualified": exam.qualified,
        }

    mentors = []
    if cohort:
        for mentor in cohort.mentors.select_related("mentor_profile").all():
            mentor_profile = getattr(mentor, "mentor_profile", None)
            mentors.append({
                "name": _name(mentor),
                "company": getattr(mentor_profile, "company_name", ""),
                "designation": getattr(mentor_profile, "designation", ""),
                "linkedin_url": getattr(mentor_profile, "linkedin_url", ""),
            })

    activities = []
    if application:
        for activity in application.community_activities.filter(status="VERIFIED"):
            activities.append({
                "type": activity.get_activity_type_display(),
                "title": activity.title,
                "activity_date": activity.activity_date,
                "verification_status": activity.status,
                "evidence_url": activity.evidence_url if is_public else None,
                "evidence_file_verified": bool(activity.evidence_file),
            })

    companies = []
    if cohort:
        for reference in cohort.job_references.select_related("company").filter(company__is_verified=True).distinct():
            companies.append({
                "name": reference.company.name,
                "website": reference.company.website,
                "industry": reference.company.industry,
                "relationship": "Cohort opportunity partner",
            })
    for company in student.shortlisted_by_companies.filter(is_verified=True):
        if not any(item["name"] == company.name for item in companies):
            companies.append({
                "name": company.name,
                "website": company.website,
                "industry": company.industry,
                "relationship": "Shortlisted student",
            })

    resume_url = None
    if is_public and student.resume:
        resume_url = request.build_absolute_uri(
            reverse("certificate-verification-resume") + f"?code={certificate.verification_code}"
        )

    return {
        "kind": "student",
        "recipient": {
            "name": _name(user),
            "student_code": student.student_code,
            "tagline": student.tagline if is_public else None,
            "bio": student.bio if is_public else None,
            "skills": student.skills if is_public else [],
            "verification_status": student.verification_status,
            "public_profile_enabled": is_public,
            "links": links,
            "resume_url": resume_url,
        },
        "journey": {
            "application_number": application.application_number if application else None,
            "status": application.status if application else None,
            "course": application.course.name if application else None,
            "course_code": application.course.code if application else None,
            "cohort": cohort.name if cohort else None,
            "cohort_code": cohort.code if cohort else None,
            "cohort_period": {
                "start": cohort.start_date,
                "end": cohort.end_date,
            } if cohort else None,
            "final_score": application.final_score if application else None,
            "prescreening": prescreening,
            "module_tests": module_tests,
            "assignment_summary": assignment_summary,
            "assignments": assignment_rows,
            "capstone_projects": [row for row in assignment_rows if row["type"] == "Capstone"],
            "mentors": mentors,
            "companies": companies,
            "community_activities": activities,
        },
        "privacy_notice": (
            "The recipient enabled a public portfolio profile. Private identity fields are never shown."
            if is_public
            else "The certificate is verified, but the recipient has not enabled public portfolio details."
        ),
    }


def _service_profile(certificate) -> dict:
    from applications.models import Application
    from assignments.models import Assignment, Submission
    from attendance.models import Attendance

    user = certificate.recipient_user
    role = getattr(user, "role", "")
    cohorts = user.mentored_cohorts.all() if role == "MENTOR" else user.volunteered_cohorts.all()
    cohort_ids = list(cohorts.values_list("id", flat=True))
    students_taught = Application.objects.filter(
        assigned_cohort_id__in=cohort_ids,
        status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "COMPLETED"],
    ).values("student_id").distinct().count()
    profile = getattr(user, "mentor_profile", None) if role == "MENTOR" else getattr(user, "volunteer_profile", None)
    return {
        "kind": "mentor" if role == "MENTOR" else "volunteer",
        "recipient": {
            "name": _name(user),
            "role": user.get_role_display(),
            "bio": getattr(profile, "bio", ""),
            "linkedin_url": getattr(profile, "linkedin_url", ""),
            "organization": getattr(profile, "company_name", "") or getattr(profile, "organization_name", ""),
            "designation": getattr(profile, "designation", "") or getattr(profile, "occupation", ""),
            "expertise": getattr(profile, "expertise", "") or getattr(profile, "skills", ""),
        },
        "service": {
            "cohort_count": len(cohort_ids),
            "students_supported": students_taught,
            "classes_conducted": Attendance.objects.filter(conducted_by=user, class_status="COMPLETED").count(),
            "assignments_created": Assignment.objects.filter(created_by=user).count(),
            "submissions_graded": Submission.objects.filter(evaluated_by=user, evaluated=True).count(),
            "cohorts": [
                {"code": cohort.code, "name": cohort.name, "course": cohort.course.name, "status": cohort.status}
                for cohort in cohorts.select_related("course")
            ],
        },
        "privacy_notice": "Only professional service statistics and public profile fields are shown.",
    }


def _company_profile(certificate) -> dict:
    user = certificate.recipient_user
    company = getattr(user, "company", None)
    return {
        "kind": "company",
        "recipient": {
            "name": company.name if company else _name(user),
            "industry": getattr(company, "industry", ""),
            "location": getattr(company, "location", ""),
            "website": getattr(company, "website", ""),
            "verified_partner": bool(getattr(company, "is_verified", False)),
        },
        "service": {
            "job_opportunities": company.job_postings.count() if company else 0,
            "cohort_references": company.job_references.count() if company else 0,
            "students_shortlisted": company.shortlisted_students.count() if company else 0,
        },
        "privacy_notice": "Only verified partner information is shown.",
    }


def build_verification_profile(certificate, request) -> dict:
    payload = {"certificate": _certificate_summary(certificate)}
    if certificate.student_id:
        payload.update(_student_profile(certificate, request))
    elif certificate.recipient_user and certificate.recipient_user.role in {"MENTOR", "VOLUNTEER", "TRUSTEE"}:
        payload.update(_service_profile(certificate))
    elif certificate.recipient_user and certificate.recipient_user.role == "COMPANY":
        payload.update(_company_profile(certificate))
    else:
        payload.update({
            "kind": "recognition",
            "recipient": {"name": certificate.recipient_name or _name(certificate.recipient_user)},
            "privacy_notice": "This page verifies the issued recognition only.",
        })
    return payload

