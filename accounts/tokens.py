import hashlib
from rest_framework_simplejwt.tokens import RefreshToken


def get_user_password_hash(user) -> str:
    """
    Returns a deterministic fingerprint of the user's current password hash.
    Whenever user.set_password() is called, Django re-hashes the password with a fresh salt,
    which instantly changes this fingerprint and invalidates all existing JWT sessions.
    """
    if not user:
        return ""
    pwd = getattr(user, "password", "") or ""
    return hashlib.sha256(pwd.encode("utf-8")).hexdigest()[:16]


def create_tokens_for_user(user) -> RefreshToken:
    """
    Generates a RefreshToken (and corresponding AccessToken) with claims containing
    the user's role, email, profile name, and current password hash fingerprint.
    """
    refresh = RefreshToken.for_user(user)
    refresh["pwd_hash"] = get_user_password_hash(user)
    refresh["role"] = getattr(user, "role", "")
    refresh["email"] = getattr(user, "email", "")
    refresh["first_name"] = getattr(user, "first_name", "")
    refresh["last_name"] = getattr(user, "last_name", "")
    return refresh
