from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


def generate_password_setup_link(user):
    """
    Generates a password setup link for a user using FRONTEND_URL from settings.
    Format: {FRONTEND_URL}/setup-password?uidb64={uid}&token={token}
    """
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    setup_link = f"{settings.FRONTEND_URL}/setup-password?uidb64={uid}&token={token}"
    return setup_link
