from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from .tokens import get_user_password_hash


class CustomJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that verifies the password fingerprint ('pwd_hash')
    embedded in the token. If the user changed their password, the fingerprint in the
    token will not match the current password hash in the database, instantly revoking
    the session with HTTP 401 (code: password_changed).
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_pwd_hash = validated_token.get("pwd_hash")
        if token_pwd_hash is not None:
            current_pwd_hash = get_user_password_hash(user)
            if token_pwd_hash != current_pwd_hash:
                raise AuthenticationFailed(
                    {
                        "detail": _("Session has expired due to a password change. Please log in again."),
                        "code": "password_changed",
                    },
                    code="password_changed",
                )
        return user
