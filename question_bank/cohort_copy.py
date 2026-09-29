from copy import deepcopy

from django.core.exceptions import ValidationError
from django.db import transaction

from cohorts.models import Cohort
from courses.models import Course

from .models import QuestionBank


ELIGIBLE_COHORT_STATUSES = (
    Cohort.Status.OPEN,
    Cohort.Status.ACTIVE,
    Cohort.Status.TRAINING,
    Cohort.Status.INTERNSHIP,
    Cohort.Status.SOFT_SKILLS,
)


@transaction.atomic
def copy_bank_to_same_course_cohorts(bank, created_by=None):
    """Copy an approved module paper into missing eligible cohort scopes.

    Pre-screening banks are intentionally course-wide, so callers receive a
    no-op result instead of redundant cohort copies.
    """
    Course.objects.select_for_update().get(pk=bank.course_id)
    bank = QuestionBank.objects.select_for_update().get(pk=bank.pk)
    if bank.status != QuestionBank.Status.APPROVED or not bank.sets_data:
        raise ValidationError("Only an approved Question Bank with stored papers can be shared.")
    if bank.bank_type == QuestionBank.BankType.PRESCREENING:
        return {"course_wide": True, "created": [], "reused": []}
    if not bank.module_id:
        raise ValidationError("A module-test Question Bank must have a course module.")

    cohorts = list(
        Cohort.objects.select_for_update()
        .filter(course_id=bank.course_id, status__in=ELIGIBLE_COHORT_STATUSES)
        .order_by("code")
    )
    created = []
    reused = []
    for cohort in cohorts:
        if cohort.pk == bank.cohort_id:
            continue
        existing = (
            QuestionBank.objects.select_for_update()
            .filter(
                bank_type=QuestionBank.BankType.MODULE_TEST,
                course_id=bank.course_id,
                cohort=cohort,
                module_id=bank.module_id,
                status__in=(
                    QuestionBank.Status.GENERATING,
                    QuestionBank.Status.PROCESSING,
                    QuestionBank.Status.APPROVED,
                ),
                lifecycle_status__in=(
                    QuestionBank.LifecycleStatus.DRAFT,
                    QuestionBank.LifecycleStatus.OPEN,
                ),
            )
            .order_by("-updated_at")
            .first()
        )
        if existing:
            reused.append(existing)
            continue

        clone = QuestionBank.objects.create(
            bank_type=QuestionBank.BankType.MODULE_TEST,
            course_id=bank.course_id,
            cohort=cohort,
            module_id=bank.module_id,
            title=f"{bank.title} — {cohort.code}"[:255],
            description=bank.description,
            difficulty=bank.difficulty,
            source_topics=deepcopy(bank.source_topics),
            sets_data=deepcopy(bank.sets_data),
            total_questions_per_set=bank.total_questions_per_set,
            is_ai_generated=bank.is_ai_generated,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            created_by=created_by or bank.created_by,
        )
        created.append(clone)
    return {"course_wide": False, "created": created, "reused": reused}
