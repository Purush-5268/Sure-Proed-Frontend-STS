import hashlib
import logging
import secrets
import string
from datetime import datetime, timezone
from django.core.cache import cache
from django.db.models import Q

logger = logging.getLogger(__name__)

EMAIL_VERIFY_PREFIX = "otp:email_verify:"
PWD_RESET_PREFIX = "otp:pwd_reset:"
PWD_RESET_DAILY_PREFIX = "otp:pwd_reset_limit:"

# Default TTLs (in seconds)
DEFAULT_EMAIL_VERIFY_TTL = 600  # 10 minutes
DEFAULT_PWD_RESET_TTL = 300     # 5 minutes
DAILY_RATE_LIMIT_TTL = 86400    # 24 hours
MAX_DAILY_PASSWORD_RESETS = 3


def generate_secure_otp(length: int = 6) -> str:
    """Generate a cryptographically random numeric OTP code."""
    return "".join(secrets.choice(string.digits) for _ in range(length))


def _normalize_email(email: str) -> str:
    return (email or "").lower().strip()


def _get_email_cache_key(prefix: str, email: str) -> str:
    norm = _normalize_email(email)
    return f"{prefix}{norm}"


# ---------------------------------------------------------------------------
# 1. Email Verification OTPs (Registration Flow)
# ---------------------------------------------------------------------------

def store_email_verification_otp(
    email: str,
    delivery_email: str,
    registration_data: dict,
    ttl: int = DEFAULT_EMAIL_VERIFY_TTL,
) -> str:
    """
    Generate and store an Email Verification OTP in Redis cache with automatic TTL.
    Stores under keys for both primary email and delivery email (if different).
    """
    otp = generate_secure_otp(6)
    primary_email = _normalize_email(email)
    deliv_email = _normalize_email(delivery_email)

    payload = {
        "otp": otp,
        "email": primary_email,
        "delivery_email": deliv_email,
        "registration_data": registration_data or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Store under primary email key
    cache.set(_get_email_cache_key(EMAIL_VERIFY_PREFIX, primary_email), payload, timeout=ttl)
    
    # Also index under delivery_email if different (e.g. staff mapped_email)
    if deliv_email and deliv_email != primary_email:
        cache.set(_get_email_cache_key(EMAIL_VERIFY_PREFIX, deliv_email), payload, timeout=ttl)

    # Invalidate legacy database records if any exist
    try:
        from accounts.models import EmailVerificationOTP
        EmailVerificationOTP.objects.filter(
            Q(email__iexact=primary_email) | Q(email__iexact=deliv_email),
            is_used=False,
        ).update(is_used=True)
    except Exception:
        pass

    return otp


def verify_email_verification_otp(
    email: str,
    otp_val: str,
) -> tuple[bool, dict | None, str | None]:
    """
    Verify the Email Verification OTP against Redis cache.
    On success: atomically removes the key from cache and returns (True, registration_data, None).
    On failure: returns (False, None, error_message).
    """
    norm_email = _normalize_email(email)
    otp_val = (otp_val or "").strip()
    cache_key = _get_email_cache_key(EMAIL_VERIFY_PREFIX, norm_email)

    cached_payload = cache.get(cache_key)

    if cached_payload and isinstance(cached_payload, dict):
        expected_otp = str(cached_payload.get("otp", "")).strip()
        if expected_otp and secrets.compare_digest(expected_otp, otp_val):
            # Consume OTP atomically from cache
            cache.delete(cache_key)
            deliv_email = cached_payload.get("delivery_email")
            if deliv_email and deliv_email != norm_email:
                cache.delete(_get_email_cache_key(EMAIL_VERIFY_PREFIX, deliv_email))
            primary_email = cached_payload.get("email")
            if primary_email and primary_email != norm_email:
                cache.delete(_get_email_cache_key(EMAIL_VERIFY_PREFIX, primary_email))

            reg_data = cached_payload.get("registration_data") or {}
            return True, reg_data, None
        return False, None, "Invalid or expired verification OTP code."

    # Fallback to database for in-flight DB OTPs issued prior to migration
    try:
        from accounts.models import EmailVerificationOTP
        db_record = EmailVerificationOTP.objects.filter(
            Q(email__iexact=norm_email)
            | Q(registration_data__email__iexact=norm_email)
            | Q(registration_data__mapped_email__iexact=norm_email),
            otp=otp_val,
            is_used=False,
        ).order_by("-created_at").first()

        if db_record and db_record.is_valid():
            db_record.is_used = True
            db_record.save(update_fields=["is_used"])
            return True, db_record.registration_data or {}, None
    except Exception:
        pass

    return False, None, "Invalid or expired verification OTP code."


# ---------------------------------------------------------------------------
# 2. Password Reset OTPs (Forgot Password Flow)
# ---------------------------------------------------------------------------

def get_daily_password_reset_count(email: str) -> int:
    """Get the number of password reset OTP requests made for this email in the last 24h."""
    norm_email = _normalize_email(email)
    count = cache.get(_get_email_cache_key(PWD_RESET_DAILY_PREFIX, norm_email))
    return int(count) if count is not None else 0


def store_password_reset_otp(
    email: str,
    delivery_email: str,
    ttl: int = DEFAULT_PWD_RESET_TTL,
    bypass_rate_limit: bool = False,
) -> tuple[str | None, int, str | None]:
    """
    Check daily limit, then generate and store a Password Reset OTP in Redis cache with TTL.
    Returns (otp, daily_count, error_message).
    """
    primary_email = _normalize_email(email)
    deliv_email = _normalize_email(delivery_email)
    rate_key = _get_email_cache_key(PWD_RESET_DAILY_PREFIX, deliv_email)

    current_count = 0
    if not bypass_rate_limit:
        # Check 24-hour rate limit in Redis
        cached_count = cache.get(rate_key)
        current_count = int(cached_count) if cached_count is not None else 0

        if current_count >= MAX_DAILY_PASSWORD_RESETS:
            return (
                None,
                current_count,
                "You have reached the maximum limit of 3 password resets per day. Please try again after 24 hours or contact support.",
            )

    otp = generate_secure_otp(6)
    payload = {
        "otp": otp,
        "email": primary_email,
        "delivery_email": deliv_email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # A notification inbox can serve several accounts. Bind the reset to the
    # canonical login address, never to the destination mailbox.
    cache.set(_get_email_cache_key(PWD_RESET_PREFIX, primary_email), payload, timeout=ttl)

    # Increment rate limit counter
    new_count = current_count + 1
    cache.set(rate_key, new_count, timeout=DAILY_RATE_LIMIT_TTL)

    # Invalidate old unused DB OTPs and persist new OTP in database
    try:
        from datetime import timedelta
        from django.utils import timezone as django_timezone
        from accounts.models import PasswordResetOTP

        PasswordResetOTP.objects.filter(
            email__iexact=primary_email,
            is_used=False,
        ).update(is_used=True)
        PasswordResetOTP.objects.create(
            email=primary_email,
            otp=otp,
            expires_at=django_timezone.now() + timedelta(seconds=ttl),
            is_used=False,
        )
    except Exception as db_err:
        logger.warning(f"Could not persist PasswordResetOTP to DB: {db_err}")

    logger.info("Password reset OTP generated.")

    return otp, new_count, None


def verify_password_reset_otp(
    email: str,
    otp_val: str,
) -> tuple[bool, str | None]:
    """
    Verify an OTP for the canonical login email, independently of its mailbox.
    On success: consumes the database record and removes the cached challenge.
    On failure: returns (False, error_message).
    """
    norm_email = _normalize_email(email)
    otp_val = (otp_val or "").strip()
    cache_key = _get_email_cache_key(PWD_RESET_PREFIX, norm_email)

    cached_payload = cache.get(cache_key)

    if cached_payload and isinstance(cached_payload, dict):
        if _normalize_email(cached_payload.get("email")) != norm_email:
            return False, "Invalid or expired OTP code. Please request a new code."
        expected_otp = str(cached_payload.get("otp", "")).strip()
        if expected_otp and secrets.compare_digest(expected_otp, otp_val):
            cache.delete(cache_key)
            from accounts.models import PasswordResetOTP
            PasswordResetOTP.objects.filter(email__iexact=norm_email, is_used=False).update(is_used=True)
            return True, None
        return False, "Invalid or expired OTP code."

    # Fallback to database for in-flight DB OTPs
    try:
        from accounts.models import PasswordResetOTP
        db_record = PasswordResetOTP.objects.filter(
            email__iexact=norm_email,
            otp=otp_val,
            is_used=False,
        ).order_by("-created_at").first()

        if db_record and db_record.is_valid():
            db_record.is_used = True
            db_record.save(update_fields=["is_used"])
            return True, None
    except Exception:
        pass

    return False, "Invalid or expired OTP code."


# ---------------------------------------------------------------------------
# 3. Course Discontinuation Confirmation OTPs
# ---------------------------------------------------------------------------

DISCONTINUE_PREFIX = "otp:discontinue:"
DEFAULT_DISCONTINUE_TTL = 600  # 10 minutes


def store_discontinue_otp(
    application_id: str,
    email: str,
    ttl: int = DEFAULT_DISCONTINUE_TTL,
) -> str:
    """
    Generate and store a Course Discontinuation OTP in Redis cache with automatic TTL.
    """
    otp = generate_secure_otp(6)
    cache_key = f"{DISCONTINUE_PREFIX}{str(application_id)}"
    payload = {
        "otp": otp,
        "application_id": str(application_id),
        "email": _normalize_email(email),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    cache.set(cache_key, payload, timeout=ttl)
    return otp


def verify_discontinue_otp(
    application_id: str,
    otp_val: str,
) -> tuple[bool, str | None]:
    """
    Verify the Course Discontinuation OTP against Redis cache.
    On success: atomically removes the key from cache and returns (True, None).
    On failure: returns (False, error_message).
    """
    cache_key = f"{DISCONTINUE_PREFIX}{str(application_id)}"
    cached_payload = cache.get(cache_key)
    otp_val = (otp_val or "").strip()

    if cached_payload and isinstance(cached_payload, dict):
        expected_otp = str(cached_payload.get("otp", "")).strip()
        if expected_otp and secrets.compare_digest(expected_otp, otp_val):
            cache.delete(cache_key)
            return True, None
        return False, "Invalid or expired confirmation OTP code."

    return False, "Invalid or expired confirmation OTP code. Please request a new code."
