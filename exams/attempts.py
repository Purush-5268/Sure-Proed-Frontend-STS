"""Server-owned paper, option, and proctor-room assignment helpers."""

import hashlib
import random
import secrets
import string
from copy import deepcopy

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count, Q
from django.utils import timezone

from .models import ExamProctoringRoom, InternalExamAttempt, ModuleTestSubmission


UNSAFE_QUESTION_FIELDS = {
    "correct",
    "correct_answer",
    "correct_index",
    "correct_option",
    "answer",
    "explanation",
    "verifier_answer",
    "verifier_result",
    "confidence",
    "validation_status",
    "approval_status",
    "validation_failures",
    "generated_by",
    "verification_reason",
    "confidence_score",
    "source_reference",
    "ai_model",
    "validation_metadata",
}


def _stable_choice(values, *parts):
    ordered = sorted(values)
    digest = hashlib.sha256(":".join(str(part) for part in parts).encode("utf-8")).digest()
    return ordered[int.from_bytes(digest[:8], "big") % len(ordered)]


def available_paper_sets(bank):
    if not isinstance(bank.sets_data, dict):
        return []
    return sorted(
        str(code).upper()
        for code, paper in bank.sets_data.items()
        if isinstance(paper, dict) and isinstance(paper.get("questions"), list) and paper["questions"]
    )


def select_balanced_paper_set(bank, attempt_model, *, student_id, assessment_id):
    """Choose the least-used set, with a stable tie-breaker for retry safety."""
    set_codes = available_paper_sets(bank)
    if not set_codes:
        raise ValueError("The approved question bank contains no usable paper sets.")

    counts = {code: 0 for code in set_codes}
    rows = (
        attempt_model.objects.filter(question_bank=bank, paper_set__in=set_codes)
        .values("paper_set")
        .annotate(total=Count("id"))
    )
    for row in rows:
        counts[row["paper_set"]] = row["total"]
    lowest = min(counts.values())
    candidates = [code for code, total in counts.items() if total == lowest]
    return _stable_choice(candidates, bank.pk, assessment_id, student_id)


def build_attempt_blueprint(bank, set_code, total_questions=None):
    paper = bank.get_paper_set(set_code)
    raw_questions = paper.get("questions", []) if isinstance(paper, dict) else []
    if not raw_questions:
        raise ValueError(f"Paper {set_code} contains no questions.")

    snapshot = []
    seen_ids = set()
    for index, raw in enumerate(raw_questions):
        if not isinstance(raw, dict):
            raise ValueError(f"Paper {set_code} question {index + 1} is not a JSON object.")
        question = deepcopy(raw)
        question_id = str(question.get("id") or f"q-{index + 1}")
        if question_id in seen_ids:
            raise ValueError(f"Paper {set_code} contains duplicate question IDs.")
        seen_ids.add(question_id)
        options = question.get("options")
        if not isinstance(options, list) or len(options) < 2:
            raise ValueError(f"Paper {set_code} question {index + 1} has invalid options.")
        question["id"] = question_id
        snapshot.append(question)

    system_random = random.SystemRandom()
    system_random.shuffle(snapshot)
    if total_questions and isinstance(total_questions, int) and total_questions > 0 and total_questions < len(snapshot):
        snapshot = snapshot[:total_questions]

    question_mapping = [question["id"] for question in snapshot]
    option_mapping = {}
    for question in snapshot:
        indices = list(range(len(question["options"])))
        system_random.shuffle(indices)
        option_mapping[question["id"]] = indices
    return snapshot, question_mapping, option_mapping


def candidate_questions(snapshot, question_mapping, option_mapping):
    question_by_id = {str(question.get("id")): question for question in snapshot}
    result = []
    for question_id in question_mapping:
        question = question_by_id.get(str(question_id))
        if not question:
            raise ValueError("The stored question order no longer matches the attempt snapshot.")
        indices = option_mapping.get(str(question_id), [])
        options = question.get("options", [])
        if sorted(indices) != list(range(len(options))):
            raise ValueError("The stored option order is invalid.")
        safe = {key: value for key, value in question.items() if key not in UNSAFE_QUESTION_FIELDS}
        safe["id"] = str(question_id)
        safe["options"] = [options[index] for index in indices]
        result.append(safe)
    return result


def normalize_candidate_responses(attempt, responses):
    if not isinstance(responses, dict):
        raise ValueError("Responses must be an object keyed by question ID.")
    if len(responses) > len(attempt.question_mapping):
        raise ValueError("The response contains more answers than the assigned paper.")

    allowed_ids = {str(question_id) for question_id in attempt.question_mapping}
    normalized = {}
    for raw_question_id, raw_answer in responses.items():
        question_id = str(raw_question_id)
        if question_id not in allowed_ids:
            raise ValueError("The response contains a question that was not assigned to this attempt.")
        indices = (attempt.option_mapping or {}).get(question_id, [])
        if isinstance(raw_answer, bool):
            raise ValueError("Answer selections must be option letters or indices.")
        if isinstance(raw_answer, int):
            display_index = raw_answer
        else:
            answer = str(raw_answer).strip().upper()
            if len(answer) == 1 and answer in string.ascii_uppercase:
                display_index = ord(answer) - ord("A")
            elif answer.isdigit():
                display_index = int(answer)
            else:
                raise ValueError("Answer selections must be option letters or indices.")
        if display_index < 0 or display_index >= len(indices):
            raise ValueError("An answer selection is outside the available options.")
        normalized[question_id] = string.ascii_uppercase[display_index]
    return normalized


def translate_candidate_responses(attempt, responses):
    normalized = normalize_candidate_responses(attempt, responses)
    question_by_id = {
        str(question.get("id")): question for question in (attempt.question_snapshot or [])
    }
    translated = {}
    for question_id, answer_letter in normalized.items():
        question = question_by_id[question_id]
        display_index = ord(answer_letter) - ord("A")
        original_index = attempt.option_mapping[question_id][display_index]
        translated[question_id] = question["options"][original_index]
    return normalized, translated


def proctoring_scope(exam, question_bank):
    """Group candidates using the same bank and scheduled calendar day."""
    scheduled_at = None
    try:
        scheduled_at = exam.application.pre_screening.scheduled_at
    except ObjectDoesNotExist:
        scheduled_at = None
    session_date = timezone.localdate(scheduled_at) if scheduled_at else timezone.localdate()
    raw_scope = f"{question_bank.pk}:{exam.application.course_id}:{session_date.isoformat()}"
    return hashlib.sha256(raw_scope.encode("utf-8")).hexdigest(), session_date


def ensure_proctoring_rooms(exam, question_bank, *, reconfigure=False):
    if not exam.proctoring_enabled:
        return []
    scope_key, session_date = proctoring_scope(exam, question_bank)
    room_count = max(1, min(int(exam.proctoring_room_count or 1), 26))
    scoped_rooms = ExamProctoringRoom.objects.filter(scope_key=scope_key)
    active_existing = list(scoped_rooms.filter(is_active=True).order_by("code"))
    if active_existing and not reconfigure:
        return active_existing

    existing = {room.code: room for room in scoped_rooms}
    rooms = []
    for index in range(room_count):
        code = string.ascii_uppercase[index]
        room = existing.get(code)
        if room is None:
            room = ExamProctoringRoom.objects.create(
                exam=exam,
                question_bank=question_bank,
                scope_key=scope_key,
                session_date=session_date,
                code=code,
                room_name=f"sureproed-{scope_key[:16]}-{secrets.token_urlsafe(18)}",
                room_password=secrets.token_urlsafe(24),
                capacity=max(1, min(int(exam.proctoring_capacity_per_room or 50), 500)),
            )
        elif not room.is_active or reconfigure:
            room.is_active = True
            if reconfigure:
                room.capacity = max(
                    1, min(int(exam.proctoring_capacity_per_room or 50), 500)
                )
            room.save(update_fields=["is_active", "capacity", "updated_at"])
        rooms.append(room)

    if reconfigure:
        extras = scoped_rooms.exclude(code__in=[room.code for room in rooms])
        for extra in extras:
            has_live_candidates = extra.attempts.filter(
                status="IN_PROGRESS",
                expires_at__gt=timezone.now(),
            ).exists()
            if not has_live_candidates and extra.is_active:
                extra.is_active = False
                extra.save(update_fields=["is_active", "updated_at"])
    return rooms


def module_proctoring_scope(module_test, question_bank):
    """Use one stable room scope for a module test and its assigned cohort."""
    session_date = timezone.localdate()
    raw_scope = (
        f"module:{question_bank.pk}:{module_test.pk}:"
        f"{module_test.cohort_id or 'all'}"
    )
    return hashlib.sha256(raw_scope.encode("utf-8")).hexdigest(), session_date


def ensure_module_proctoring_rooms(module_test, question_bank, *, reconfigure=False):
    if not module_test.proctoring_enabled:
        return []
    scope_key, session_date = module_proctoring_scope(module_test, question_bank)
    room_count = max(1, min(int(module_test.proctoring_room_count or 1), 26))
    scoped_rooms = ExamProctoringRoom.objects.filter(scope_key=scope_key)
    active_existing = list(scoped_rooms.filter(is_active=True).order_by("code"))
    if active_existing and not reconfigure:
        return active_existing

    existing = {room.code: room for room in scoped_rooms}
    rooms = []
    for index in range(room_count):
        code = string.ascii_uppercase[index]
        room = existing.get(code)
        if room is None:
            room = ExamProctoringRoom.objects.create(
                exam=None,
                question_bank=question_bank,
                scope_key=scope_key,
                session_date=session_date,
                code=code,
                room_name=f"sureproed-module-{scope_key[:16]}-{secrets.token_urlsafe(18)}",
                room_password=secrets.token_urlsafe(24),
                capacity=max(
                    1,
                    min(int(module_test.proctoring_capacity_per_room or 50), 500),
                ),
            )
        elif not room.is_active or reconfigure:
            room.is_active = True
            if reconfigure:
                room.capacity = max(
                    1,
                    min(int(module_test.proctoring_capacity_per_room or 50), 500),
                )
            room.save(update_fields=["is_active", "capacity", "updated_at"])
        rooms.append(room)

    if reconfigure:
        extras = scoped_rooms.exclude(code__in=[room.code for room in rooms])
        for extra in extras:
            has_live_candidates = (
                extra.attempts.filter(
                    status=InternalExamAttempt.Status.IN_PROGRESS,
                    expires_at__gt=timezone.now(),
                ).exists()
                or extra.module_test_submissions.filter(
                    status=ModuleTestSubmission.Status.IN_PROGRESS,
                    expires_at__gt=timezone.now(),
                ).exists()
            )
            if not has_live_candidates and extra.is_active:
                extra.is_active = False
                extra.save(update_fields=["is_active", "updated_at"])
    return rooms


def eligible_students_for_proctoring_room(room):
    """Return candidates who are allowed to take the room's assessment."""
    from applications.models import Application
    from question_bank.models import QuestionBank
    from students.models import StudentProfile

    bank = room.question_bank
    applications = Application.objects.filter(course_id=bank.course_id)
    if bank.bank_type == QuestionBank.BankType.MODULE_TEST:
        cohort_id = bank.cohort_id
        if bank.module_test_id and bank.module_test.cohort_id:
            cohort_id = bank.module_test.cohort_id
        applications = applications.filter(
            assigned_cohort_id=cohort_id,
            status__in=[
                Application.Status.COHORT_ASSIGNED,
                Application.Status.IN_PROGRESS,
                Application.Status.TRAINING,
                Application.Status.INTERNSHIP_ASSIGNED,
            ],
        )
    else:
        applications = applications.filter(
            exam__isnull=False,
            status__in=[Application.Status.APPLIED, Application.Status.EXAM_PENDING],
        )
        if room.session_date:
            applications = applications.filter(
                Q(pre_screening__scheduled_at__date=room.session_date)
                | Q(pre_screening__scheduled_at__isnull=True)
            )
    return StudentProfile.objects.filter(
        applications__in=applications
    ).select_related("user").distinct().order_by("student_code")


def _live_room_counts(rooms):
    counts = {str(room.pk): 0 for room in rooms}
    for model, relation in (
        (InternalExamAttempt, "proctoring_room"),
        (ModuleTestSubmission, "proctoring_room"),
    ):
        rows = (
            model.objects.filter(
                **{
                    f"{relation}__in": rooms,
                    "status": model.Status.IN_PROGRESS,
                    "expires_at__gt": timezone.now(),
                }
            )
            .values(relation)
            .annotate(total=Count("id"))
        )
        for row in rows:
            counts[str(row[relation])] += row["total"]
    return counts


def _select_room(rooms, *, student_id, assessment_id):
    if not rooms:
        return None
    counts = _live_room_counts(rooms)
    assigned = [
        room
        for room in rooms
        if room.assigned_students.filter(pk=student_id).exists()
    ]
    if assigned:
        room = sorted(assigned, key=lambda item: item.code)[0]
        if counts[str(room.pk)] >= int(room.capacity or 1):
            raise ValueError(f"Assigned proctoring Room {room.code} is at capacity.")
        return room

    candidates = [
        room for room in rooms if counts[str(room.pk)] < int(room.capacity or 1)
    ]
    if not candidates:
        raise ValueError("All proctoring rooms for this assessment window are at capacity.")

    # Default: Everyone is assigned to Room A first unless Room A is at capacity
    room_a = next((room for room in candidates if str(room.code).strip().upper() == "A"), None)
    if room_a is not None:
        return room_a

    return sorted(candidates, key=lambda item: item.code)[0]


def select_balanced_proctoring_room(exam, question_bank, *, student_id):
    rooms = ensure_proctoring_rooms(exam, question_bank)
    return _select_room(rooms, student_id=student_id, assessment_id=exam.pk)


def select_balanced_module_proctoring_room(module_test, question_bank, *, student_id):
    rooms = ensure_module_proctoring_rooms(module_test, question_bank)
    return _select_room(rooms, student_id=student_id, assessment_id=module_test.pk)


def proctoring_payload(attempt, display_name):
    room = attempt.proctoring_room
    if not room:
        return {
            "enabled": False,
            "required": False,
            "provider": "JITSI",
        }
    domain = str(getattr(settings, "JITSI_DOMAIN", "meet.jit.si")).strip()
    domain = domain.removeprefix("https://").removeprefix("http://").rstrip("/")
    assessment = getattr(attempt, "exam", None) or getattr(attempt, "test", None)
    return {
        "enabled": True,
        "required": bool(assessment and assessment.proctoring_required),
        "provider": "JITSI",
        "domain": domain,
        "room_code": room.code,
        "room_name": room.room_name,
        "room_password": room.room_password,
        "display_name": display_name,
    }
