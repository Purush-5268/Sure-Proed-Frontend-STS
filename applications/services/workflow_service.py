from decimal import Decimal
import uuid
from django.db import transaction
from django.utils import timezone

from attendance.models import Attendance
from assignments.models import Assignment, Submission
from certificates.models import Certificate
from common.tasks import send_async_cohort_assignment, send_async_certificate_notification
from common.models import Notification
from common.services.notifications import display_name, notify_user
from certificates.services.pdf_generator import issue_certificate_file
from applications.services.journey_service import build_student_journey
from exams.grading import answer_matches, response_for_question


@transaction.atomic
def publish_screening_result(
    exam,
    *,
    marks_obtained,
    total_marks,
    qualified=None,
    source="manual",
    actor=None,
):
    """Persist one screening result and apply the common candidate lifecycle."""
    from applications.models import Application, PreScreening
    from applications.services.state_machine import transition_application_status, repair_application_state

    marks_obtained = Decimal(str(marks_obtained))
    total_marks = Decimal(str(total_marks))
    if total_marks <= 0 or marks_obtained < 0 or marks_obtained > total_marks:
        raise ValueError("Marks must be between zero and the maximum marks.")
    percentage = round((marks_obtained / total_marks) * Decimal("100.00"), 2)
    if qualified is None:
        qualified = percentage >= exam.pass_percentage
    qualified = bool(qualified)

    exam.marks_obtained = marks_obtained
    exam.total_marks = total_marks
    exam.percentage = percentage
    exam.qualified = qualified
    exam.status = exam.Status.EVALUATED
    exam.submitted_at = timezone.now()
    exam.save(update_fields=[
        "marks_obtained", "total_marks", "percentage", "qualified",
        "status", "submitted_at", "updated_at",
    ])

    # Lock only the application row. PostgreSQL rejects FOR UPDATE across the
    # nullable assigned_cohort outer join; related objects can load normally.
    application = Application.objects.select_for_update().get(pk=exam.application_id)
    application.qualified = qualified
    application.qualification_score = percentage
    application.save(update_fields=["qualified", "qualification_score", "updated_at"])

    target = Application.Status.QUALIFIED if qualified else Application.Status.REJECTED
    try:
        transition_application_status(
            application,
            target,
            user=actor,
            reason=f"{source.title()} screening result: {marks_obtained}/{total_marks} ({percentage}%)",
        )
    except Exception:
        if not actor:
            raise
        application = repair_application_state(
            application,
            target,
            admin_user=actor,
            reason=f"{source.title()} screening result correction",
        )

    screening = getattr(application, "pre_screening", None)
    if screening:
        screening.status = PreScreening.Status.PASSED if qualified else PreScreening.Status.FAILED
        screening.is_released = False
        screening.admin_started_at = None
        screening.save(update_fields=["status", "is_released", "admin_started_at", "updated_at"])

    notify_user(
        application.student.user,
        title="Pre-screen exam result published",
        message=(
            f"Hi {display_name(application.student.user)}, your screening result for "
            f"{application.course.name} is {'Passed' if qualified else 'Failed'} "
            f"({marks_obtained}/{total_marks}, {percentage}%)."
        ),
        notification_type=Notification.Type.SUCCESS if qualified else Notification.Type.WARNING,
        action_url="grades",
        dedupe_key=f"application:{application.id}:screening:{source}:evaluated",
    )
    return exam


@transaction.atomic
def evaluate_exam_submission(exam, submitted_answers, *, question_snapshot=None):
    """
    Step 4: Evaluates MCQ answers, calculates marks/percentage/qualification,
    and updates linked Application status.
    """
    from rest_framework.exceptions import ValidationError
    
    question_bank = exam.question_banks.filter(is_active=True, status="APPROVED").first()
    if not question_bank and exam.application and exam.application.course:
        question_bank = exam.application.course.question_banks.filter(
            bank_type="PRESCREENING",
            is_active=True,
            status="APPROVED",
        ).first()
    if question_bank and not exam.question_banks.filter(id=question_bank.id).exists():
        exam.question_banks.add(question_bank)
    
    total_marks = Decimal("0.00")
    obtained_marks = Decimal("0.00")
    
    if question_snapshot is not None:
        responses = submitted_answers.get("responses", submitted_answers)
        if not isinstance(responses, dict):
            responses = {}
        questions = question_snapshot
        for idx, q in enumerate(questions):
            q_marks = Decimal(str(q.get("marks", "1.00")))
            total_marks += q_marks
            student_answer = response_for_question(responses, q, idx)
            if answer_matches(q, student_answer):
                obtained_marks += q_marks
    elif question_bank and isinstance(question_bank.sets_data, dict):
        sets_data = question_bank.sets_data
        set_code = submitted_answers.get("set_code")
        
        # Extract the responses (allow nested 'responses' key or flat dictionary)
        responses = submitted_answers.get("responses", submitted_answers)
        if not isinstance(responses, dict):
            responses = {}
        
        questions = []
        if set_code and set_code in sets_data:
            questions = sets_data[set_code].get("questions", [])
        elif len(sets_data) == 1:
            questions = list(sets_data.values())[0].get("questions", [])
        else:
            # Multiple sets exist, aggregate all questions to see if IDs are unique
            for pset in sets_data.values():
                questions.extend(pset.get("questions", []))
            
            ids = [str(q.get("id")) for q in questions if q.get("id")]
            if len(ids) != len(set(ids)) and not set_code:
                # Ambiguous question IDs without set_code
                raise ValidationError({"error": "set_code is required because question IDs are not unique across paper sets."})

        # Calculate marks based on authoritative questions
        for idx, q in enumerate(questions):
            q_id = str(q.get("id", idx + 1))
            q_marks = Decimal(str(q.get("marks", "1.00")))
            total_marks += q_marks
            
            student_answer = response_for_question(responses, q, idx)
            if answer_matches(q, student_answer):
                obtained_marks += q_marks
    else:
        # Fallback to zero if no bank is found. We DO NOT trust the frontend.
        pass

    if total_marks <= 0:
        raise ValidationError({"error": "The assigned paper has no gradable questions."})

    percentage = Decimal("0.00")
    if total_marks > 0:
        percentage = round((obtained_marks / total_marks) * Decimal("100.00"), 2)

    is_qualified = percentage >= exam.pass_percentage

    exam.answers = submitted_answers
    exam.marks_obtained = obtained_marks
    exam.total_marks = total_marks
    exam.percentage = percentage
    exam.qualified = is_qualified
    exam.status = "EVALUATED"
    exam.submitted_at = timezone.now()
    exam.save()

    # Step 4 Update Application
    from applications.services.state_machine import transition_application_status
    app = exam.application
    app.qualified = is_qualified
    app.qualification_score = percentage
    app.save(update_fields=["qualified", "qualification_score", "updated_at"])
    target_status = "EXAM_COMPLETED" if is_qualified else "REJECTED"
    transition_application_status(
        app,
        target_status,
        reason=f"Pre-screening exam evaluated: {obtained_marks}/{total_marks} ({percentage}%)",
    )

    if is_qualified:
        transition_application_status(app, "QUALIFIED", reason="Auto-qualified upon passing exam")

    notify_user(
        app.student.user,
        title="Pre-screen exam result published",
        message=(
            f"Hi {display_name(app.student.user)}, you scored {obtained_marks}/{total_marks} "
            f"({percentage}%) in the pre-screen exam for {app.course.name}. "
            f"Result: {'Qualified - enrollment is pending admin action.' if is_qualified else 'Not qualified'}."
        ),
        notification_type=Notification.Type.SUCCESS if is_qualified else Notification.Type.WARNING,
        action_url="grades",
        dedupe_key=f"application:{app.id}:exam:evaluated",
    )

    return exam


@transaction.atomic
def publish_external_exam_result(
    exam,
    *,
    marks_obtained,
    total_marks,
    submitted_at=None,
    integrity_status="PASSED",
    proctoring_summary=None,
):
    """Publish only the final result received from the trusted examination server."""
    marks_obtained = Decimal(marks_obtained)
    total_marks = Decimal(total_marks)
    percentage = round(
        marks_obtained / total_marks * Decimal("100.00"),
        2,
    )
    is_qualified = bool(
        integrity_status == "PASSED" and percentage >= exam.pass_percentage
    )

    exam.marks_obtained = marks_obtained
    exam.total_marks = total_marks
    exam.percentage = percentage
    exam.qualified = is_qualified
    exam.status = exam.Status.EVALUATED
    exam.submitted_at = submitted_at or timezone.now()
    if isinstance(proctoring_summary, dict) and "proctor_name" in proctoring_summary:
        exam.proctor_name = str(proctoring_summary["proctor_name"])
    exam.save()

    application = exam.application
    application.qualified = is_qualified
    application.qualification_score = percentage
    application.save(update_fields=["qualified", "qualification_score", "updated_at"])
    target_status = application.Status.QUALIFIED if is_qualified else application.Status.REJECTED
    from applications.services.state_machine import transition_application_status
    transition_application_status(
        application,
        target_status,
        reason=f"External exam result published: {marks_obtained}/{total_marks} ({percentage}%)",
    )

    integrity_text = "Integrity check failed. " if integrity_status == "FAILED" else ""
    notify_user(
        application.student.user,
        title="Pre-screen exam result published",
        message=(
            f"Hi {display_name(application.student.user)}, you scored "
            f"{marks_obtained}/{total_marks} ({percentage}%) in the pre-screen exam "
            f"for {application.course.name}. {integrity_text}"
            f"Result: {'Qualified' if is_qualified else 'Not qualified'}."
        ),
        notification_type=(
            Notification.Type.SUCCESS if is_qualified else Notification.Type.WARNING
        ),
        action_url="grades",
        dedupe_key=f"application:{application.id}:external-exam:evaluated",
    )
    return exam


@transaction.atomic
def calculate_and_process_course_completion(application):
    """
    Verify every backend-owned journey requirement before issuing a certificate.
    """
    from applications.models import Application

    application = Application.objects.select_for_update().select_related(
        "student", "student__user", "course", "assigned_cohort"
    ).get(pk=application.pk)

    if not application.assigned_cohort:
        return False, "Application is not assigned to any cohort."

    student = application.student
    course = application.course
    journey = build_student_journey(student, application)
    if journey["requirements_verified"]:
        evaluated_submissions = Submission.objects.filter(
            assignment__cohort=application.assigned_cohort,
            student=student,
            evaluated=True,
            marks_obtained__isnull=False,
        ).select_related("assignment")
        percentages = [
            submission.marks_obtained / submission.assignment.max_marks * Decimal("100.00")
            for submission in evaluated_submissions
            if submission.assignment.max_marks > 0
        ]
        final_score = round(sum(percentages) / Decimal(len(percentages)), 2) if percentages else Decimal("0.00")
        now = timezone.now()
        application.completed_course = True
        application.completed_at = now
        application.final_score = final_score
        application.save(update_fields=["completed_course", "completed_at", "final_score", "updated_at"])

        from applications.services.state_machine import transition_application_status
        transition_application_status(
            application,
            "COMPLETED",
            reason="All course completion requirements met and verified.",
        )

        # Step 9: Create or reactivate the one certificate owned by the application.
        cert, created = Certificate.objects.get_or_create(
            application=application,
            defaults={
                "certificate_number": f"CERT-{now.strftime('%Y%m')}-{str(uuid.uuid4())[:8].upper()}",
                "verification_code": f"VERIFY-{str(uuid.uuid4())[:12].upper()}",
                "student": student,
                "certificate_type": Certificate.CertificateType.COURSE,
                "issued_at": now,
                "status": Certificate.Status.ACTIVE,
            },
        )
        reactivated = False
        if not created and cert.status == Certificate.Status.REVOKED:
            reactivated = True
            cert.status = Certificate.Status.ACTIVE
            cert.issued_at = now
            cert.revoked_at = None
            cert.revocation_reason = None
            cert.save(update_fields=[
                "status", "issued_at", "revoked_at", "revocation_reason", "updated_at"
            ])

        # Trigger async email notification if user email exists
        if hasattr(student.user, "email") and student.user.email:
            transaction.on_commit(
                lambda: send_async_certificate_notification.delay(
                    student.user.email,
                    cert.certificate_number,
                    f"/api/certificates/{cert.id}/",
                )
            )

        notify_user(
            student.user,
            title="Programme completed",
            message=(
                f"Congratulations {display_name(student.user)}! You completed {course.name}. "
                f"Certificate {cert.certificate_number} is now available."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="certificates",
            dedupe_key=f"application:{application.id}:certificate:{cert.id}",
        )

        # Generate from backend-owned completion data before returning success.
        if created or reactivated or not cert.certificate_file:
            issue_certificate_file(cert)

        return True, "Course requirements completed! Certificate issued."

    blocker_text = " ".join(journey["blockers"]) or "Journey requirements are not yet verified."
    return False, f"Requirements not met. {blocker_text}"


def disqualify_for_missed_screening(pre_screening):
    """
    Automatically disqualifies a candidate who missed their scheduled pre-screening exam window:
    - Sets application.qualified = False
    - Marks pre_screening.status = PreScreening.Status.FAILED
    - Disables exam release gate
    - Transitions application status to EXAM_FAILED
    - Revokes candidate from Google Meet screening event
    - Sends in-app notification & transactional email with the reason
    """
    from applications.models import Application, PreScreening
    from applications.services.state_machine import transition_application_status
    from common.models import Notification
    from common.services.notifications import notify_user, display_name
    from common.services.email_service import send_transactional_email

    app = getattr(pre_screening, "application", None)
    if not app:
        return False

    # If already evaluated, passed, or enrolled, do not overwrite
    if app.status in {
        Application.Status.EXAM_COMPLETED,
        Application.Status.QUALIFIED,
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.COMPLETED,
    }:
        return False

    # Check if candidate submitted an exam
    exam = getattr(app, "exam", None)
    if exam and exam.submitted_at:
        return False

    pre_screening.status = PreScreening.Status.FAILED
    pre_screening.is_released = False
    pre_screening.remarks = (pre_screening.remarks or "") + "\nCandidate did not attend or complete the exam within the scheduled window."
    pre_screening.save(update_fields=["status", "is_released", "remarks", "updated_at"])

    app.qualified = False
    app.final_score = Decimal("0.00")
    app.save(update_fields=["qualified", "final_score", "updated_at"])

    try:
        transition_application_status(
            app,
            Application.Status.REJECTED,
            reason="Missed scheduled pre-screening examination window.",
        )
    except Exception:
        pass

    # Revoke calendar invite if any
    try:
        from applications.services.google_meet_screening import remove_candidate_from_screening_meet
        remove_candidate_from_screening_meet(pre_screening)
    except Exception:
        pass

    # Send notification & email
    user = getattr(app.student, "user", None)
    if user:
        course_name = app.course.name if app.course else "Course"
        sched_str = pre_screening.scheduled_at.strftime("%Y-%m-%d %H:%M") if pre_screening.scheduled_at else "scheduled time"
        end_str = pre_screening.end_time.strftime("%Y-%m-%d %H:%M") if pre_screening.end_time else "deadline"
        title = "Pre-Screening Exam Missed - Not Qualified"
        message = (
            f"Hi {display_name(user)}, you have been marked as Not Qualified for {course_name} "
            f"because you did not attend or complete the scheduled pre-screening examination within the assigned time window "
            f"({sched_str} to {end_str}). You may apply for a new course when open."
        )
        notify_user(
            user,
            title=title,
            message=message,
            notification_type=Notification.Type.WARNING,
            action_url="course_selection",
            dedupe_key=f"application:{app.id}:missed_screening",
        )

        if user.email:
            subject = f"Sure ProEd - Pre-Screening Exam Missed: {course_name}"
            html_message = (
                f"<h2>Sure ProEd Application Update</h2>"
                f"<p>Hi {display_name(user)},</p>"
                f"<p>You were scheduled to take the pre-screening examination for <strong>{course_name}</strong> between {sched_str} and {end_str}.</p>"
                f"<p style='color: #DC2626; font-weight: bold;'>Reason: The examination window has elapsed and your submission was not received.</p>"
                f"<p>As a result, your application has been automatically marked as <strong>Not Qualified</strong>.</p>"
                f"<p>You are now eligible to browse and apply for another open course on the platform.</p>"
            )
            try:
                send_transactional_email(subject, message, [user.email], html_message=html_message)
            except Exception:
                pass

    return True


def mark_missed_prescreening_exams():
    """
    Scans for all pre-screening exam schedules whose end_time has elapsed
    without submission, and disqualifies them.
    """
    from applications.models import Application, PreScreening

    now = timezone.now()
    missed_schedules = PreScreening.objects.filter(
        status__in=[PreScreening.Status.SCHEDULED, PreScreening.Status.RESCHEDULED],
        end_time__isnull=False,
        end_time__lt=now,
    ).exclude(
        application__status__in=[
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.REJECTED,
            Application.Status.COMPLETED,
            Application.Status.QUALIFIED,
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
        ]
    ).select_related("application", "application__student__user", "application__course")

    processed = 0
    for ps in missed_schedules:
        if disqualify_for_missed_screening(ps):
            processed += 1
    return processed

