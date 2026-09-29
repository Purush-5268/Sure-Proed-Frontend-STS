from django.db import transaction

from .models import QuestionBank


class QuestionBankDeletionError(RuntimeError):
    pass


def has_question_bank_attempt_history(bank):
    return (
        bank.internal_exam_attempts.exists()
        or bank.module_test_attempts.exists()
        or bank.proctoring_rooms.filter(
            attempts__isnull=False
        ).exists()
        or bank.proctoring_rooms.filter(
            module_test_submissions__isnull=False
        ).exists()
    )


@transaction.atomic
def delete_failed_unused_question_bank(bank):
    """Delete a failed bank while retaining and safely detaching schedule records."""
    bank = QuestionBank.objects.select_for_update().get(pk=bank.pk)
    if bank.status != QuestionBank.Status.FAILED:
        raise QuestionBankDeletionError("Only a failed Question Bank can use this cleanup action.")
    if has_question_bank_attempt_history(bank):
        raise QuestionBankDeletionError(
            "This Question Bank has candidate attempt history and must be retained for audit."
        )

    detached_schedules = bank.screening_schedules.update(
        question_bank=None,
        paper_set="",
        is_released=False,
    )
    removed_rooms = bank.proctoring_rooms.count()
    bank.proctoring_rooms.all().delete()
    bank.delete()
    return {
        "detached_schedules": detached_schedules,
        "removed_rooms": removed_rooms,
    }
