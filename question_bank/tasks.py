import string
import uuid
import secrets
import time
from datetime import timedelta
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import QuestionBank
from .deletion import QuestionBankDeletionError, delete_failed_unused_question_bank
from .services.ai.factory import get_generator_provider, get_verifier_provider
from .services.ai.base import AIProviderRateLimitError
from .services.ai.validators import question_fingerprint, validate_question_structure


def _safe_ai_error(exc):
    message = " ".join(str(exc).split())
    if not message:
        return exc.__class__.__name__
    return f"{exc.__class__.__name__}: {message[:500]}"


def _failed_bank_retention_seconds():
    hours = max(0, float(getattr(settings, "FAILED_QUESTION_BANK_RETENTION_HOURS", 1)))
    return int(hours * 60 * 60)


def _bank_retry_limit():
    return max(0, int(getattr(settings, "AI_QUESTION_BANK_MAX_RETRIES", 2)))


def _bank_retry_delay_seconds(retry_number):
    minutes = max(
        0,
        float(getattr(settings, "AI_QUESTION_BANK_RETRY_DELAY_MINUTES", 10)),
    )
    # Back off linearly: 10 minutes, then 20 minutes with the defaults.
    return int(minutes * 60 * max(1, retry_number))


def _resolve_option_index(ans, options):
    if not ans or not options:
        return -1
    import re
    ans_str = str(ans).strip().casefold()
    
    # 1. Exact match
    for idx, opt in enumerate(options):
        if ans_str == opt.strip().casefold():
            return idx
            
    # 2. Integer index match ("0", "1", "2", "3")
    if ans_str in {"0", "1", "2", "3"} and int(ans_str) < len(options):
        return int(ans_str)
        
    # 3. Letter match ("A", "B", "C", "D")
    letter_map = {"a": 0, "b": 1, "c": 2, "d": 3}
    if ans_str in letter_map and letter_map[ans_str] < len(options):
        return letter_map[ans_str]
        
    # 4. Cleaned prefix match ("Option A: ...", "A) ...", "A. ...")
    cleaned = re.sub(r"^(option\s+)?[a-d][.):\s-]+\s*", "", ans_str, flags=re.IGNORECASE).strip()
    for idx, opt in enumerate(options):
        opt_str = opt.strip().casefold()
        opt_cleaned = re.sub(r"^(option\s+)?[a-d][.):\s-]+\s*", "", opt_str, flags=re.IGNORECASE).strip()
        if cleaned == opt_cleaned or ans_str == opt_cleaned or cleaned == opt_str:
            return idx
            
    # 5. Alphanumeric match (ignoring markdown, asterisks, spaces)
    def _alphanumeric(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())
    
    ans_alpha = _alphanumeric(ans_str)
    for idx, opt in enumerate(options):
        opt_alpha = _alphanumeric(opt)
        if ans_alpha == opt_alpha or (len(ans_alpha) > 3 and (ans_alpha in opt_alpha or opt_alpha in ans_alpha)):
            return idx
            
    return -1


def _normalize_answer(ans, options):
    idx = _resolve_option_index(ans, options)
    if 0 <= idx < len(options):
        return options[idx].strip().casefold()
    if ans:
        return str(ans).strip().casefold()
    return ""


def schedule_failed_question_bank_cleanup(bank_id):
    """Schedule cleanup after commit; the Beat sweep is the broker-outage fallback."""
    def enqueue():
        try:
            delete_failed_question_bank_task.apply_async(
                args=[str(bank_id)],
                countdown=_failed_bank_retention_seconds(),
            )
        except Exception:
            # Celery Beat will collect it after the same retention period.
            pass

    transaction.on_commit(enqueue)


def _normalize_answer(ans, options):
    if not ans:
        return ""
    import re
    ans_str = str(ans).strip().casefold()
    if ans_str in {"0", "1", "2", "3"} and int(ans_str) < len(options):
        return options[int(ans_str)].strip().casefold()
    cleaned = re.sub(r"^(option\s+)?[a-d][.):\s-]+\s*", "", ans_str, flags=re.IGNORECASE).strip()
    for opt in options:
        opt_str = opt.strip().casefold()
        opt_cleaned = re.sub(r"^(option\s+)?[a-d][.):\s-]+\s*", "", opt_str, flags=re.IGNORECASE).strip()
        if cleaned == opt_cleaned or ans_str == opt_str:
            return opt_str
    return cleaned


@shared_task
def delete_failed_question_bank_task(bank_id):
    bank = QuestionBank.objects.filter(pk=bank_id).first()
    if not bank:
        return {"status": "already_deleted"}
    if bank.status != QuestionBank.Status.FAILED:
        return {"status": "skipped", "reason": "bank_is_not_failed"}
    try:
        result = delete_failed_unused_question_bank(bank)
    except QuestionBankDeletionError as exc:
        return {"status": "retained", "reason": str(exc)}
    return {"status": "deleted", **result}


@shared_task
def cleanup_failed_question_banks_task():
    cutoff = timezone.now() - timedelta(
        seconds=_failed_bank_retention_seconds()
    )
    bank_ids = list(
        QuestionBank.objects.filter(
            status=QuestionBank.Status.FAILED,
            updated_at__lte=cutoff,
        ).values_list("pk", flat=True)
    )
    summary = {"deleted": 0, "retained": 0, "skipped": 0}
    for bank_id in bank_ids:
        result = delete_failed_question_bank_task(str(bank_id))
        status_value = result.get("status", "skipped")
        if status_value in summary:
            summary[status_value] += 1
        elif status_value == "already_deleted":
            summary["skipped"] += 1
    return summary

def _retry_or_fail_question_bank(
    bank_id,
    num_sets,
    questions_per_set,
    bank_retry,
    failure_message,
):
    """Retry the same bank row, or mark it failed after the retry budget."""
    next_retry = int(bank_retry) + 1
    retry_limit = _bank_retry_limit()
    if next_retry <= retry_limit:
        delay = _bank_retry_delay_seconds(next_retry)
        QuestionBank.objects.filter(id=bank_id).update(
            status=QuestionBank.Status.GENERATING,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
            sets_data={},
            error_message=(
                f"Generation attempt {next_retry} failed. Automatic bank retry "
                f"{next_retry} of {retry_limit} is queued. Last failure: {failure_message}"
            ),
            updated_at=timezone.now(),
        )

        def enqueue_retry():
            try:
                generate_question_bank_task.apply_async(
                    args=[str(bank_id), int(num_sets), int(questions_per_set)],
                    kwargs={"bank_retry": next_retry},
                    countdown=delay,
                )
            except Exception as exc:
                QuestionBank.objects.filter(
                    id=bank_id,
                    status=QuestionBank.Status.GENERATING,
                ).update(
                    status=QuestionBank.Status.FAILED,
                    is_active=False,
                    error_message=(
                        f"{failure_message} Automatic retry could not be queued: "
                        f"{_safe_ai_error(exc)}"
                    ),
                    updated_at=timezone.now(),
                )
                schedule_failed_question_bank_cleanup(bank_id)

        transaction.on_commit(enqueue_retry)
        return "retry_queued"

    QuestionBank.objects.filter(id=bank_id).update(
        status=QuestionBank.Status.FAILED,
        is_active=False,
        sets_data={},
        error_message=(
            f"{failure_message} Automatic bank retries exhausted "
            f"({retry_limit} configured)."
        ),
        updated_at=timezone.now(),
    )
    schedule_failed_question_bank_cleanup(bank_id)
    return "failed"


@shared_task(bind=True)
def generate_question_bank_task(
    self,
    bank_id: str,
    num_sets: int,
    questions_per_set: int,
    bank_retry: int = 0,
):
    updated_count = QuestionBank.objects.filter(
        id=bank_id,
        status=QuestionBank.Status.GENERATING
    ).update(
        status=QuestionBank.Status.PROCESSING
    )

    if updated_count == 0:
        return

    try:
        bank = QuestionBank.objects.get(id=bank_id)
    except QuestionBank.DoesNotExist:
        return

    try:
        generator = get_generator_provider()
        verifier = get_verifier_provider()
    except Exception as exc:
        _retry_or_fail_question_bank(
            bank_id,
            num_sets,
            questions_per_set,
            bank_retry,
            "AI provider configuration failed. " f"{_safe_ai_error(exc)}",
        )
        return
    
    max_attempts = getattr(settings, "AI_MAX_ATTEMPTS_PER_QUESTION", 3)
    minimum_confidence = getattr(settings, "AI_VERIFIER_MIN_CONFIDENCE", 0.80)
    
    set_labels = list(string.ascii_uppercase[:num_sets])
    total_questions = num_sets * questions_per_set
    question_pool = []
    question_fingerprints = set()

    # Gemini produces one globally unique, independently verified pool. Paper
    # membership is deliberately not assigned by AI; Django shuffles and splits
    # the completed pool only after every requested question passes validation.
    for pool_index in range(total_questions):
        if bank.source_topics and isinstance(bank.source_topics, list):
            base_topic = str(bank.source_topics[pool_index % len(bank.source_topics)])
        elif bank.course:
            base_topic = f"{bank.course.name} Prerequisites"
        else:
            base_topic = "General Technical Aptitude"

        ASPECTS = [
            "Core Fundamentals & Principles",
            "Practical Design & Syntax",
            "Logic & Analytical Reasoning",
            "Calculations & Quantitative Metrics",
            "Trade-offs & Optimization",
            "Troubleshooting & Debugging",
            "Standard Conventions & Best Practices",
            "Architecture & System Overview",
        ]
        sub_aspect = ASPECTS[pool_index % len(ASPECTS)]
        current_topic = f"{base_topic} ({sub_aspect})"

        difficulty = bank.difficulty or "MIXED"
        question_approved = False
        last_failure = "AI generation did not return a valid question."

        for attempt in range(max_attempts):
            try:
                attempt_context = (
                    f"Generate unique question {pool_index + 1} of {total_questions} for one assessment pool. "
                    f"The backend will shuffle this pool into {num_sets} papers with "
                    f"{questions_per_set} questions each. Cover distinct concept areas."
                )
                recent_snippets = [q["question"][:60] for q in question_pool[-3:]]
                if recent_snippets:
                    attempt_context += f" Do not repeat earlier concepts like: {'; '.join(recent_snippets)}."
                if attempt > 0:
                    attempt_context += (
                        f" (Attempt {attempt + 1}: Select a completely fresh, distinct sub-topic with exactly one undisputed correct answer.)"
                    )

                gen_schema = generator.generate_question(
                    topic=current_topic,
                    difficulty=difficulty,
                    context=attempt_context,
                )

                is_valid, reason = validate_question_structure(gen_schema)
                if not is_valid:
                    last_failure = reason
                    continue

                fingerprint = question_fingerprint(gen_schema.question)
                if fingerprint in question_fingerprints:
                    last_failure = "Duplicate question text was generated."
                    continue

                ver_schema = verifier.verify_question(gen_schema.question, gen_schema.options)
                gen_idx = _resolve_option_index(gen_schema.correct_answer, gen_schema.options)
                ver_idx = _resolve_option_index(ver_schema.correct_answer, gen_schema.options)
                gen_norm = _normalize_answer(gen_schema.correct_answer, gen_schema.options)
                ver_norm = _normalize_answer(ver_schema.correct_answer, gen_schema.options)
                answers_match = (
                    (gen_idx == ver_idx and gen_idx != -1)
                    or (gen_norm == ver_norm and bool(gen_norm))
                    or (gen_schema.correct_answer.strip().casefold() == ver_schema.correct_answer.strip().casefold())
                )
                verifier_confidence = float(getattr(ver_schema, "confidence", 0.0))
                if answers_match and verifier_confidence >= minimum_confidence:
                    question_approved = True
                    question_fingerprints.add(fingerprint)
                    question_pool.append({
                        "id": str(uuid.uuid4()),
                        "question": gen_schema.question,
                        "options": gen_schema.options,
                        "correct": gen_schema.correct_answer,
                        "marks": 1,
                        "topic": gen_schema.topic or topic,
                        "explanation": gen_schema.explanation,
                        "verifier_answer": ver_schema.correct_answer,
                        "verifier_result": "MATCH",
                        "confidence": verifier_confidence,
                        "verification_explanation": ver_schema.explanation,
                        "verified_by": getattr(settings, "AI_VERIFIER_MODEL", "gemini-3.5-flash"),
                        "validation_status": "PASSED",
                        "approval_status": "AUTO_APPROVED",
                        "validation_failures": [],
                        "generated_by": getattr(settings, "AI_GENERATOR_MODEL", "gemini-3.6-flash"),
                    })
                    break
                if not answers_match:
                    last_failure = "The independent verifier selected a different answer."
                else:
                    last_failure = (
                        f"Verifier confidence {verifier_confidence:.2f} was below the "
                        f"required {minimum_confidence:.2f}."
                    )
            except AIProviderRateLimitError as exc:
                last_failure = f"AI rate limit: {_safe_ai_error(exc)}"
                time.sleep(min(300, max(1, exc.retry_after_seconds)))
            except Exception as exc:
                last_failure = f"AI request failed: {_safe_ai_error(exc)}"

        if not question_approved:
            failure_message = (
                f"Failed to generate unique question {pool_index + 1} of {total_questions} "
                f"after {max_attempts} attempts. Last failure: {last_failure}"
            )
            _retry_or_fail_question_bank(
                bank.id,
                num_sets,
                questions_per_set,
                bank_retry,
                failure_message,
            )
            return

    secrets.SystemRandom().shuffle(question_pool)
    sets_data = {
        code: {
            "label": f"Paper {code}",
            "questions": question_pool[
                index * questions_per_set:(index + 1) * questions_per_set
            ],
        }
        for index, code in enumerate(set_labels)
    }
                
    # Store every set before it can be published to students.
    with transaction.atomic():
        locked_bank = QuestionBank.objects.select_for_update().get(id=bank_id)
        if locked_bank.status != QuestionBank.Status.PROCESSING:
            return
        locked_bank.sets_data = sets_data
        locked_bank.status = QuestionBank.Status.APPROVED
        locked_bank.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
        locked_bank.is_active = False
        locked_bank.error_message = None
        locked_bank.save(update_fields=[
            "sets_data", "status", "lifecycle_status", "is_active", "error_message", "updated_at"
        ])
