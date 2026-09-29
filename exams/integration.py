import hashlib
import hmac
import time

from django.conf import settings
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError


class ExamIntegrationUnavailable(APIException):
    status_code = 503
    default_detail = "The examination-platform integration secret is not configured."


def verify_result_signature(request):
    """Authenticate an exact result payload sent by the external exam backend."""
    secret = settings.EXAM_PLATFORM_SHARED_SECRET
    if not secret:
        raise ExamIntegrationUnavailable()

    timestamp_value = request.headers.get("X-Exam-Timestamp", "")
    supplied_signature = request.headers.get("X-Exam-Signature", "")
    event_id = request.headers.get("X-Exam-Event-ID", "").strip()
    if not timestamp_value or not supplied_signature or not event_id:
        raise PermissionDenied(
            "X-Exam-Timestamp, X-Exam-Signature, and X-Exam-Event-ID are required."
        )
    if len(event_id) > 120:
        raise ValidationError({"X-Exam-Event-ID": "Event ID is too long."})
    try:
        timestamp = int(timestamp_value)
    except ValueError as exc:
        raise PermissionDenied("Invalid examination result timestamp.") from exc
    if abs(int(time.time()) - timestamp) > settings.EXAM_RESULT_MAX_CLOCK_SKEW_SECONDS:
        raise PermissionDenied("The examination result signature has expired.")

    signed_payload = f"{timestamp}.".encode("utf-8") + request.body
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, supplied_signature.lower()):
        raise PermissionDenied("Invalid examination result signature.")
    return event_id, hashlib.sha256(request.body).hexdigest()
