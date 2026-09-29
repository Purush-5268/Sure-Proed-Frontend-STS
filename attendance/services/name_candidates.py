"""Local name similarity suggestions. Scores are not verified identity or probability."""
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher


def tokens(value):
    value = re.sub(r'([a-z])([A-Z])', r'\1 \2', value or '')
    value = re.sub(r'([A-Z])([A-Z][a-z])', r'\1 \2', value)
    value = unicodedata.normalize('NFKC', value).casefold()
    return re.findall(r'[^\W_]+', value, flags=re.UNICODE)


def similarity(display_name, registered_name, suffixes=()):
    expected = tokens(registered_name)
    suffix_tokens = {token for value in suffixes for token in tokens(value)}
    actual = [t for t in tokens(display_name) if t not in suffix_tokens or t in expected]
    # Joined initial: Tpradeep -> T Pradeep only against a roster name's full token.
    expanded = []
    for token in actual:
        split = next((name for name in expected if len(name) >= 4 and len(token) == len(name)+1
                      and token[1:] == name and any(e.startswith(token[0]) for e in expected if e != name)), None)
        expanded.extend([token[0], split] if split else [token])
    actual = expanded
    if not actual or not expected:
        return 0.0
    if Counter(actual) == Counter(expected):
        return 100.0
    pairs = []
    for i, a in enumerate(actual):
        for j, b in enumerate(expected):
            if a == b:
                score = 1.0
            elif min(len(a), len(b)) == 1:
                score = .82 if a[0] == b[0] else 0.0
            elif min(len(a), len(b)) >= 4:
                score = SequenceMatcher(None, a, b, autojunk=False).ratio()
                score = score if score >= .72 else 0.0
            else:
                score = 0.0
            pairs.append((score, i, j))
    used_a, used_b, total = set(), set(), 0.0
    for score, i, j in sorted(pairs, reverse=True):
        if i not in used_a and j not in used_b:
            total += score
            used_a.add(i)
            used_b.add(j)
    return round(100 * total / max(len(actual), len(expected)), 1)


def suggest_candidates(display_name, roster, suffixes=(), limit=5):
    suggestions = []
    for email, app in roster.items():
        name = f'{app.student.user.first_name} {app.student.user.last_name}'.strip()
        score = similarity(display_name, name, suffixes)
        if score >= 70:
            suggestions.append({'student_id': str(app.student.id), 'name': name, 'email': email,
                                'similarity_score': score, 'evidence': 'NAME_SIMILARITY_REQUIRES_REVIEW'})
    return sorted(suggestions, key=lambda item: (-item['similarity_score'], item['student_id']))[:limit]
