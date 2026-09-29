import logging
from django.db import transaction
from courses.models import Course
from question_bank.models import QuestionBank
from question_bank.tasks import (
    generate_question_bank_task,
    schedule_failed_question_bank_cleanup,
)

logger = logging.getLogger(__name__)


def find_reusable_prescreening_bank(course, *, for_update=False):
    """Prefer existing reviewed papers before considering an in-flight AI job.

    Older data may have a cohort on a pre-screening bank. Scheduling is course
    based, so that legacy metadata must not cause a second AI paper to be made.
    """
    banks = QuestionBank.objects.filter(
        course=course,
        bank_type=QuestionBank.BankType.PRESCREENING,
        exam__isnull=True,
        status__in=[
            QuestionBank.Status.GENERATING,
            QuestionBank.Status.PROCESSING,
            QuestionBank.Status.APPROVED,
        ],
        lifecycle_status__in=[
            QuestionBank.LifecycleStatus.DRAFT,
            QuestionBank.LifecycleStatus.OPEN,
        ],
    )
    if for_update:
        banks = banks.select_for_update()

    approved = banks.filter(status=QuestionBank.Status.APPROVED)
    reusable = approved.exclude(sets_data={}).order_by("-is_active", "-updated_at").first()
    if reusable:
        return reusable
    reusable = approved.order_by("-is_active", "-updated_at").first()
    if reusable:
        return reusable
    return banks.order_by("-updated_at").first()


def auto_generate_prescreening_bank(
    course_id,
    num_sets=4,
    questions_per_set=None,
    *,
    force_new=False,
):
    """
    Called automatically when an application arrives for a course.
    Uses atomic locking with SELECT FOR UPDATE to prevent duplicate AI generation tasks
    when hundreds of applications arrive simultaneously for the same course.
    """
    try:
        course = Course.objects.get(pk=course_id)
    except Course.DoesNotExist:
        logger.warning(f"Course {course_id} not found for auto question bank generation.")
        return None

    # Determine question count (defaults to course screening configuration or 10)
    per_set = questions_per_set or getattr(course, "total_screening_questions", None) or 10

    with transaction.atomic():
        # Lock the scope owner as well as existing rows. Locking only a queryset
        # cannot serialize the "no bank exists yet" case.
        course = Course.objects.select_for_update().get(pk=course.pk)
        if force_new:
            # An explicit AI choice may bypass approved papers, but it still
            # reuses an in-flight task so repeated clicks cannot spend quota.
            existing = QuestionBank.objects.select_for_update().filter(
                course=course,
                bank_type=QuestionBank.BankType.PRESCREENING,
                exam__isnull=True,
                status__in=[
                    QuestionBank.Status.GENERATING,
                    QuestionBank.Status.PROCESSING,
                ],
            ).order_by("-updated_at").first()
        else:
            # Automatic application creation always prefers reviewed papers.
            # A legacy cohort value must not trigger duplicate AI.
            existing = find_reusable_prescreening_bank(course, for_update=True)

        if existing:
            logger.info(
                f"Prescreening question bank already active/generating for course {course.code} "
                f"(Bank ID: {existing.id}, Status: {existing.status}). Reusing existing bank."
            )
            return existing

        # Extract topics from Course.course_prerequisites
        source_topics = []
        if isinstance(course.course_prerequisites, list) and course.course_prerequisites:
            source_topics = [str(t).strip() for t in course.course_prerequisites if str(t).strip()]
        elif course.prerequisites:
            source_topics = [p.strip() for p in str(course.prerequisites).split(",") if p.strip()]

        if not source_topics:
            source_topics = [f"{course.name} Fundamentals", f"{course.name} Prerequisites"]

        title = f"[{course.code}] Pre-Screening Assessment Paper (Prerequisites)"

        bank = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.PRESCREENING,
            course=course,
            title=title,
            description=f"Auto-generated entrance assessment for {course.name} applicants.",
            difficulty=QuestionBank.Difficulty.EASY,
            source_topics=source_topics,
            total_questions_per_set=per_set,
            is_ai_generated=True,
            status=QuestionBank.Status.GENERATING,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        )
        logger.info(f"Created QuestionBank {bank.id} for course {course.code}. Dispatching AI generation task...")

        # Fire background Celery task
        try:
            generate_question_bank_task.delay(str(bank.id), num_sets=num_sets, questions_per_set=per_set)
        except Exception as exc:
            logger.error(f"Failed to dispatch Celery task for QuestionBank {bank.id}: {exc}")
            bank.status = QuestionBank.Status.FAILED
            bank.is_active = False
            bank.error_message = f"Could not dispatch AI generation: {exc.__class__.__name__}."
            bank.save(update_fields=[
                "status", "is_active", "error_message", "updated_at",
            ])
            schedule_failed_question_bank_cleanup(bank.id)

        return bank
