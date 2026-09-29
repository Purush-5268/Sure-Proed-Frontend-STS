"""Resolve sign-in addresses without allowing notification aliases to shadow users."""

from django.db.models import Q
from rest_framework.exceptions import APIException
from .models import User


class AmbiguousEmailIdentity(ValueError):
    """An address does not identify exactly one account."""


class AccountRoleRequired(APIException):
    status_code = 409
    default_code = "account_role_required"

    def __init__(self, roles):
        super().__init__({
            "code": "ACCOUNT_ROLE_REQUIRED",
            "detail": "This email is linked to more than one role. Choose the account you want to use.",
            "roles": sorted(roles),
        })


def resolve_email_identity(email, role=None):
    """Select an existing account; a role choice never grants or changes a role.

    Primary and mapped addresses participate equally across different roles.
    Multiple roles require an explicit choice. Within one role a unique primary
    address is authoritative; shared aliases alone never select by UUID order.
    """
    normalized = str(email or "").strip().lower()
    if not normalized:
        return None
    candidates = User.objects.filter(Q(email__iexact=normalized) | Q(mapped_email__iexact=normalized))
    if role:
        candidates = candidates.filter(role=role)
    else:
        roles = set(candidates.values_list("role", flat=True))
        if len(roles) > 1:
            raise AccountRoleRequired(roles)
    primary = list(candidates.filter(email__iexact=normalized)[:2])
    if len(primary) > 1:
        raise AmbiguousEmailIdentity("Multiple primary accounts use this address. Contact your administrator.")
    if primary:
        return primary[0]
    aliases = list(candidates.filter(mapped_email__iexact=normalized)[:2])
    if len(aliases) > 1:
        raise AmbiguousEmailIdentity("This notification address is shared. Use your account's primary login email.")
    return aliases[0] if aliases else None
