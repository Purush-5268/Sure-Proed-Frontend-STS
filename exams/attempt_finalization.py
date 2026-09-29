"""Server-authoritative finalization for timed internal assessments."""

from decimal import Decimal

from django.utils import timezone

from applications.services.workflow_service import evaluate_exam_submission
from common.models import Notification
from common.services.notifications import notify_user

from .attempts import translate_candidate_responses
from .grading import answer_matches, response_for_question
from .models import Exam, ExamSecurityEvent, InternalExamAttempt, ModuleTestSubmission
from .serializers import ExamSerializer


def internal_result_payload(exam, *, auto_submitted=False):
    return {
        "message": (
            "Time expired; the answers saved before the deadline were submitted and evaluated."
            if auto_submitted
            else "Exam submitted and evaluated successfully."
        ),
        "auto_submitted": auto_submitted,
        "qualified": exam.qualified,
        "passed": bool(exam.qualified),
        "score": int(exam.percentage or 0),
        "feedback": "Qualified" if exam.qualified else "Not qualified",
        "percentage": exam.percentage,
        "marks_obtained": exam.marks_obtained,
        "total_marks": exam.total_marks,
        "exam": ExamSerializer(exam).data,
    }


def finalize_internal_attempt(attempt, *, auto_submitted=True):
    """Grade only responses already stored on the server for this attempt."""
    exam = attempt.exam
    if exam.status == Exam.Status.EVALUATED:
        if attempt.status != InternalExamAttempt.Status.SUBMITTED:
            attempt.status = InternalExamAttempt.Status.SUBMITTED
            attempt.submission_time = attempt.submission_time or timezone.now()
            attempt.save(update_fields=["status", "submission_time", "updated_at"])
        return exam
    if not attempt.question_bank_id or not attempt.question_snapshot:
        raise ValueError("The attempt has no immutable server-side question snapshot.")

    saved_responses = dict((attempt.answers or {}).get("responses", {}))
    normalized, translated = translate_candidate_responses(attempt, saved_responses)
    attempt.answers = {"responses": normalized}
    attempt.status = InternalExamAttempt.Status.SUBMITTED
    attempt.submission_time = timezone.now()
    attempt.save(update_fields=["answers", "status", "submission_time", "updated_at"])
    if auto_submitted:
        ExamSecurityEvent.objects.get_or_create(
            attempt=attempt,
            event_type="TIME_EXPIRED_AUTO_SUBMIT",
        )
    return evaluate_exam_submission(
        exam,
        {"responses": translated},
        question_snapshot=attempt.question_snapshot,
    )


def module_result_payload(attempt, *, auto_submitted=False):
    test = attempt.test
    return {
        "message": (
            "Time expired; the answers saved before the deadline were submitted and evaluated."
            if auto_submitted
            else "Module test submitted and evaluated successfully."
        ),
        "auto_submitted": auto_submitted,
        "status": attempt.status,
        "qualified": attempt.qualified,
        "passed": bool(attempt.qualified),
        "marks_obtained": attempt.marks_obtained,
        "total_marks": attempt.total_marks,
        "percentage": attempt.percentage,
        "pass_percentage": test.pass_percentage,
        "submitted_at": attempt.submitted_at,
        "total_questions": len(attempt.question_snapshot or []),
        "course_name": test.course.name,
        "title": test.title,
    }


def finalize_module_attempt(attempt, *, auto_submitted=True):
    """Grade a module test from its last server-side autosave."""
    if attempt.status == ModuleTestSubmission.Status.SUBMITTED:
        return attempt
    if not attempt.question_snapshot:
        raise ValueError("The module-test attempt has no immutable server-side question snapshot.")

    saved_responses = dict((attempt.answers or {}).get("responses", {}))
    normalized, translated = translate_candidate_responses(attempt, saved_responses)
    total_marks = Decimal("0.00")
    obtained_marks = Decimal("0.00")
    for index, question in enumerate(attempt.question_snapshot):
        question_marks = Decimal(str(question.get("marks", 1)))
        total_marks += question_marks
        if answer_matches(question, response_for_question(translated, question, index)):
            obtained_marks += question_marks
    if total_marks <= 0:
        raise ValueError("The assigned paper has no gradable marks.")

    percentage = round((obtained_marks / total_marks) * Decimal("100.00"), 2)
    attempt.answers = {"responses": normalized}
    attempt.submitted_at = timezone.now()
    attempt.status = ModuleTestSubmission.Status.SUBMITTED
    attempt.marks_obtained = obtained_marks
    attempt.total_marks = total_marks
    attempt.percentage = percentage
    attempt.qualified = percentage >= attempt.test.pass_percentage
    attempt.save(update_fields=[
        "answers",
        "submitted_at",
        "status",
        "marks_obtained",
        "total_marks",
        "percentage",
        "qualified",
        "updated_at",
    ])
    notify_user(
        attempt.student.user,
        title="Module test result published",
        message=(
            f"{attempt.test.title}: {obtained_marks}/{total_marks} ({percentage}%)."
            + (" Automatically submitted when time expired." if auto_submitted else "")
        ),
        notification_type=(
            Notification.Type.SUCCESS if attempt.qualified else Notification.Type.WARNING
        ),
        action_url="grades",
        dedupe_key=f"module-test:{attempt.id}:evaluated",
    )
    return attempt
