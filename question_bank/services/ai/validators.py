from typing import Tuple, List
from .base import QuestionSchema


def question_fingerprint(question_text: str) -> str:
    """Normalize question text for bank-wide duplicate detection."""
    return " ".join(str(question_text or "").casefold().split())

def validate_question_structure(question_schema: QuestionSchema) -> Tuple[bool, str]:
    """
    Deterministically validate a generated question.
    Returns (True, "") if valid, else (False, "reason").
    """
    if not question_schema.question or len(question_schema.question.strip()) < 10:
        return False, "Question text is too short or empty."

    if "[AI Generated]" in question_schema.question or "Option 1" in question_schema.question:
        return False, "Placeholder text detected in question."

    options = question_schema.options
    if len(options) != 4:
        return False, f"Expected exactly 4 options, got {len(options)}."

    options_stripped = [opt.strip() for opt in options]
    if len(set(options_stripped)) != 4:
        return False, "Duplicate options detected."
        
    for opt in options_stripped:
        if not opt:
            return False, "Empty option detected."

    correct_answer = question_schema.correct_answer.strip()
    if correct_answer not in options_stripped:
        return False, "Correct answer is not exactly matching any of the options."

    if not question_schema.explanation or len(question_schema.explanation.strip()) < 5:
        return False, "Explanation is too short or empty."

    return True, ""
