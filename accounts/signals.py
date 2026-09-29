from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import AdministratorProfile, User
from students.models import StudentProfile


def _scrub_email_from_json(value, email):
    """Remove participant entries whose authoritative email matches the deleted user."""
    normalized_email = email.casefold()
    if isinstance(value, str):
        return None if value.strip().casefold() == normalized_email else value
    if isinstance(value, list):
        cleaned = []
        for item in value:
            scrubbed = _scrub_email_from_json(item, email)
            if scrubbed is not None:
                cleaned.append(scrubbed)
        return cleaned
    if isinstance(value, dict):
        for key, item in value.items():
            if (
                str(key).casefold() in {"email", "email_address", "participant_email"}
                and isinstance(item, str)
                and item.strip().casefold() == normalized_email
            ):
                return None
        cleaned = {}
        for key, item in value.items():
            if str(key).strip().casefold() == normalized_email:
                continue
            scrubbed = _scrub_email_from_json(item, email)
            if scrubbed is not None:
                cleaned[key] = scrubbed
        return cleaned
    return value


@receiver(post_save, sender=User)
def auto_create_user_profiles(sender, instance, created, **kwargs):
    """
    Automatically provision role-appropriate profiles upon creation or save.

    Academic records must survive password changes and role changes. Deleting
    a StudentProfile here cascades its applications, grades and attendance;
    removal belongs to the explicit account-deletion workflow instead.
    """
    if instance.role == User.Role.STUDENT:
        student_code = f"STU-{instance.id.hex[:6].upper()}"
        StudentProfile.objects.get_or_create(user=instance, defaults={"student_code": student_code})
    elif instance.role == User.Role.ADMIN:
        AdministratorProfile.objects.get_or_create(
            user=instance,
            defaults={
                "category": AdministratorProfile.Category.ADMINISTRATOR,
                "designation": "Platform Administrator",
                "department": "Platform Administration & Core Operations",
            },
        )
    elif instance.role == User.Role.TRUSTEE:
        AdministratorProfile.objects.get_or_create(
            user=instance,
            defaults={
                "category": AdministratorProfile.Category.TRUSTEE,
                "designation": "Board Trustee",
                "department": "Board of Trustees & Governance",
            },
        )


@receiver(pre_delete, sender=User)
def purge_email_only_account_records(sender, instance, **kwargs):
    """Remove account records that predate the user foreign-key relationship and invalidate caches."""
    if not instance.email:
        return
    from .models import EmailVerificationOTP, PasswordResetOTP
    from attendance.models import Attendance
    from django.core.cache import cache

    EmailVerificationOTP.objects.filter(email__iexact=instance.email).delete()
    PasswordResetOTP.objects.filter(email__iexact=instance.email).delete()
    
    # Invalidate cached user sessions, profiles, and timetables
    cache.delete_many([
        f"user_profile:{instance.id}",
        f"user_permissions:{instance.id}",
        f"otp:email_verify:{instance.email.lower().strip()}",
        f"otp:pwd_reset:{instance.email.lower().strip()}",
        f"otp:pwd_reset_limit:{instance.email.lower().strip()}",
        f"attendance:list:user_{instance.id}:ACTIVE",
        f"attendance:list:user_{instance.id}:ALL",
    ])

    for session in Attendance.objects.only(
        "pk", "guest_emails", "whitelisted_guest_emails", "google_meet_attendance_data"
    ).iterator():
        updates = {}
        for field_name in (
            "guest_emails", "whitelisted_guest_emails", "google_meet_attendance_data"
        ):
            original = getattr(session, field_name)
            scrubbed = _scrub_email_from_json(original, instance.email)
            if scrubbed != original:
                updates[field_name] = scrubbed
        if updates:
            Attendance.objects.filter(pk=session.pk).update(**updates)
