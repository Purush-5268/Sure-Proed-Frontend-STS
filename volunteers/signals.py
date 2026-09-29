from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import User

from .models import MentorProfile, VolunteerProfile


@receiver(post_save, sender=User)
def ensure_staff_profile(sender, instance, **kwargs):
    """Keep the role-specific profile available as soon as Admin assigns a role."""
    if instance.role == User.Role.MENTOR:
        MentorProfile.objects.get_or_create(user=instance)
    elif instance.role in {User.Role.VOLUNTEER, User.Role.TRUSTEE}:
        VolunteerProfile.objects.get_or_create(user=instance)
