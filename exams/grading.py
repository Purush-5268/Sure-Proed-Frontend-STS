"""Shared, server-side normalization for authoritative multiple-choice answers."""

_MISSING = object()


def _normalized_text(value):
    return str(value).strip().casefold()


def _option_value(options, raw, *, explicit_index=False):
    if isinstance(options, dict):
        if raw in options:
            return options[raw]
        raw_text = _normalized_text(raw)
        for key, value in options.items():
            if _normalized_text(key) == raw_text:
                return value
            if _normalized_text(value) == raw_text:
                return value
        if explicit_index or isinstance(raw, int):
            try:
                return list(options.values())[int(raw)]
            except (IndexError, TypeError, ValueError):
                return raw
        return raw

    if isinstance(options, list):
        raw_text = _normalized_text(raw)
        # An exact option value is authoritative, even when it is numeric.
        for option in options:
            if _normalized_text(option) == raw_text:
                return option
        if isinstance(raw, str) and len(raw.strip()) == 1 and raw.strip().isalpha():
            index = ord(raw.strip().upper()) - ord("A")
            if 0 <= index < len(options):
                return options[index]
        if explicit_index or isinstance(raw, int) or raw_text.isdigit():
            try:
                return options[int(raw)]
            except (IndexError, TypeError, ValueError):
                return raw
    return raw


def _canonical(value, options, *, explicit_index=False):
    if isinstance(value, (list, tuple, set)):
        return tuple(sorted(
            _normalized_text(_option_value(options, item, explicit_index=explicit_index))
            for item in value
        ))
    return _normalized_text(_option_value(options, value, explicit_index=explicit_index))


def correct_answer(question):
    """Return ``(value, explicit_index)`` without treating zero as missing."""
    for key in ("correct", "correct_option", "answer", "correct_answer"):
        if key in question and question[key] is not None:
            return question[key], False
    if "correct_index" in question and question["correct_index"] is not None:
        return question["correct_index"], True
    return _MISSING, False


def answer_matches(question, submitted_answer):
    value, explicit_index = correct_answer(question)
    if value is _MISSING or submitted_answer is None:
        return False
    options = question.get("options", [])
    return _canonical(value, options, explicit_index=explicit_index) == _canonical(
        submitted_answer,
        options,
    )


def response_for_question(responses, question, index):
    """Look up a response without losing valid falsy values such as index 0."""
    question_id = str(question.get("id", ""))
    candidates = []
    if question_id:
        candidates.extend([question_id, question.get("id")])
    candidates.extend([str(index + 1), index + 1, str(index), index])
    question_text = str(question.get("question", ""))
    if question_text:
        candidates.append(question_text)
    for key in candidates:
        if key in responses:
            return responses[key]
    return None
