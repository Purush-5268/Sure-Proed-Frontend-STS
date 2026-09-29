import logging
import uuid

from django.conf import settings
from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from common.models import TimeStampedUUIDModel
from common.validators import validate_banner_image_file, validate_profile_photo_file


logger = logging.getLogger(__name__)


def mentor_photo_path(instance, filename):
    """Store mentor photos under a stable user directory with unique filenames."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        ext = "jpg"
    user_key = str(instance.user_id or instance.id or "unassigned")
    return f"mentors/photos/{user_key}/{uuid.uuid4().hex}.{ext}"


def mentor_banner_path(instance, filename):
    """Store mentor banners under a stable user directory with unique filenames."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        ext = "jpg"
    user_key = str(instance.user_id or instance.id or "unassigned")
    return f"mentors/banners/{user_key}/{uuid.uuid4().hex}.{ext}"


def volunteer_photo_path(instance, filename):
    """Store volunteer/trustee photos under a stable user directory."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        ext = "jpg"
    user_key = str(instance.user_id or instance.id or "unassigned")
    return f"volunteers/photos/{user_key}/{uuid.uuid4().hex}.{ext}"


def volunteer_banner_path(instance, filename):
    """Store volunteer/trustee banners under a stable user directory."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        ext = "jpg"
    user_key = str(instance.user_id or instance.id or "unassigned")
    return f"volunteers/banners/{user_key}/{uuid.uuid4().hex}.{ext}"


class MentorProfile(TimeStampedUUIDModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mentor_profile",
        limit_choices_to={"role": "MENTOR"},
    )
    company_name = models.CharField(max_length=180, blank=True)
    designation = models.CharField(max_length=150, blank=True)
    expertise = models.TextField(blank=True, help_text="Skills, domains, and technologies mentored.")
    years_of_experience = models.DecimalField(max_digits=5, decimal_places=1, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True, help_text="Date of birth.")
    profile_photo = models.ImageField(
        upload_to=mentor_photo_path,
        validators=[validate_profile_photo_file],
        blank=True,
        null=True,
        help_text="Mentor profile photo. Maximum 5 MB; JPG, PNG, or WEBP.",
    )
    banner_image = models.ImageField(
        upload_to=mentor_banner_path,
        validators=[validate_banner_image_file],
        blank=True,
        null=True,
        help_text="Mentor profile banner / cover photo. Maximum 10 MB; JPG, PNG, or WEBP.",
    )
    bio = models.TextField(blank=True)
    linkedin_url = models.URLField(blank=True)
    github_username = models.CharField(max_length=100, blank=True)
    github_url = models.URLField(blank=True)
    is_github_connected = models.BooleanField(default=False)
    courses = models.ManyToManyField(
        "courses.Course",
        related_name="qualified_mentors",
        blank=True,
        help_text="Courses this mentor is qualified to teach.",
    )

    class Meta:
        verbose_name = "Mentor Profile"
        verbose_name_plural = "Mentor Profiles"

    def clean(self):
        super().clean()
        if self.user_id and self.user.role != "MENTOR":
            from django.core.exceptions import ValidationError
            raise ValidationError({"user": "A mentor profile can only use a MENTOR account."})

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        photo_will_be_saved = update_fields is None or "profile_photo" in update_fields
        banner_will_be_saved = update_fields is None or "banner_image" in update_fields
        previous_photo = None
        previous_storage = None
        previous_banner = None
        previous_banner_storage = None
        if self.pk and photo_will_be_saved:
            previous = MentorProfile.objects.filter(pk=self.pk).only("profile_photo").first()
            if previous and previous.profile_photo:
                previous_photo = previous.profile_photo.name
                previous_storage = previous.profile_photo.storage
        if self.pk and banner_will_be_saved:
            previous = MentorProfile.objects.filter(pk=self.pk).only("banner_image").first()
            if previous and previous.banner_image:
                previous_banner = previous.banner_image.name
                previous_banner_storage = previous.banner_image.storage

        super().save(*args, **kwargs)

        current_photo = self.profile_photo.name if self.profile_photo else None
        if previous_photo and previous_photo != current_photo and previous_storage:
            def remove_replaced_photo():
                try:
                    if previous_storage.exists(previous_photo):
                        previous_storage.delete(previous_photo)
                except Exception:
                    logger.exception("Could not remove replaced mentor profile photo %s", previous_photo)

            transaction.on_commit(remove_replaced_photo)

        current_banner = self.banner_image.name if self.banner_image else None
        if previous_banner and previous_banner != current_banner and previous_banner_storage:
            def remove_replaced_banner():
                try:
                    if previous_banner_storage.exists(previous_banner):
                        previous_banner_storage.delete(previous_banner)
                except Exception:
                    logger.exception("Could not remove replaced mentor banner photo %s", previous_banner)

            transaction.on_commit(remove_replaced_banner)

    def __str__(self):
        return f"Mentor profile - {self.user.email}"


@receiver(post_delete, sender=MentorProfile)
def delete_mentor_profile_photo(sender, instance, **kwargs):
    """Remove the media file after a mentor profile deletion is committed."""
    if instance.profile_photo:
        photo_name = instance.profile_photo.name
        storage = instance.profile_photo.storage

        def remove_deleted_profile_photo():
            try:
                if storage.exists(photo_name):
                    storage.delete(photo_name)
            except Exception:
                logger.exception("Could not remove deleted mentor profile photo %s", photo_name)

        transaction.on_commit(remove_deleted_profile_photo)

    if instance.banner_image:
        banner_name = instance.banner_image.name
        b_storage = instance.banner_image.storage

        def remove_deleted_mentor_banner():
            try:
                if b_storage.exists(banner_name):
                    b_storage.delete(banner_name)
            except Exception:
                logger.exception("Could not remove deleted mentor banner %s", banner_name)

        transaction.on_commit(remove_deleted_mentor_banner)


class VolunteerProfile(TimeStampedUUIDModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="volunteer_profile",
        limit_choices_to={"role__in": ["VOLUNTEER", "TRUSTEE"]},
    )
    organization_name = models.CharField(max_length=180, blank=True)
    occupation = models.CharField(max_length=150, blank=True)
    date_of_birth = models.DateField(blank=True, null=True, help_text="Date of birth.")
    profile_photo = models.ImageField(
        upload_to=volunteer_photo_path,
        validators=[validate_profile_photo_file],
        blank=True,
        null=True,
        help_text="Volunteer profile photo. Maximum 5 MB; JPG, PNG, or WEBP.",
    )
    banner_image = models.ImageField(
        upload_to=volunteer_banner_path,
        validators=[validate_banner_image_file],
        blank=True,
        null=True,
        help_text="Volunteer profile banner / cover photo. Maximum 10 MB; JPG, PNG, or WEBP.",
    )
    skills = models.TextField(blank=True, help_text="Volunteer skills and areas of support.")
    availability_notes = models.TextField(blank=True)
    bio = models.TextField(blank=True)
    linkedin_url = models.URLField(blank=True)

    class Meta:
        verbose_name = "Volunteer Profile"
        verbose_name_plural = "Volunteer Profiles"

    def clean(self):
        super().clean()
        if self.user_id and self.user.role not in {"VOLUNTEER", "TRUSTEE"}:
            from django.core.exceptions import ValidationError
            raise ValidationError({"user": "A volunteer profile can only use a VOLUNTEER or TRUSTEE account."})

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        photo_will_be_saved = update_fields is None or "profile_photo" in update_fields
        banner_will_be_saved = update_fields is None or "banner_image" in update_fields
        previous_photo = None
        previous_storage = None
        previous_banner = None
        previous_banner_storage = None
        if self.pk and photo_will_be_saved:
            previous = VolunteerProfile.objects.filter(pk=self.pk).only("profile_photo").first()
            if previous and previous.profile_photo:
                previous_photo = previous.profile_photo.name
                previous_storage = previous.profile_photo.storage
        if self.pk and banner_will_be_saved:
            previous = VolunteerProfile.objects.filter(pk=self.pk).only("banner_image").first()
            if previous and previous.banner_image:
                previous_banner = previous.banner_image.name
                previous_banner_storage = previous.banner_image.storage

        super().save(*args, **kwargs)

        current_photo = self.profile_photo.name if self.profile_photo else None
        if previous_photo and previous_photo != current_photo and previous_storage:
            def remove_replaced_photo():
                try:
                    if previous_storage.exists(previous_photo):
                        previous_storage.delete(previous_photo)
                except Exception:
                    logger.exception("Could not remove replaced volunteer profile photo %s", previous_photo)

            transaction.on_commit(remove_replaced_photo)

        current_banner = self.banner_image.name if self.banner_image else None
        if previous_banner and previous_banner != current_banner and previous_banner_storage:
            def remove_replaced_banner():
                try:
                    if previous_banner_storage.exists(previous_banner):
                        previous_banner_storage.delete(previous_banner)
                except Exception:
                    logger.exception("Could not remove replaced volunteer banner %s", previous_banner)

            transaction.on_commit(remove_replaced_banner)

    def __str__(self):
        return f"Volunteer profile - {self.user.email}"


@receiver(post_delete, sender=VolunteerProfile)
def delete_volunteer_profile_photo(sender, instance, **kwargs):
    """Remove the media file after a volunteer profile deletion is committed."""
    if instance.profile_photo:
        photo_name = instance.profile_photo.name
        storage = instance.profile_photo.storage

        def remove_deleted_profile_photo():
            try:
                if storage.exists(photo_name):
                    storage.delete(photo_name)
            except Exception:
                logger.exception("Could not remove deleted volunteer profile photo %s", photo_name)

        transaction.on_commit(remove_deleted_profile_photo)

    if instance.banner_image:
        banner_name = instance.banner_image.name
        b_storage = instance.banner_image.storage

        def remove_deleted_volunteer_banner():
            try:
                if b_storage.exists(banner_name):
                    b_storage.delete(banner_name)
            except Exception:
                logger.exception("Could not remove deleted volunteer banner %s", banner_name)

        transaction.on_commit(remove_deleted_volunteer_banner)


class VolunteerTask(TimeStampedUUIDModel):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        HELP_REQUESTED = "HELP_REQUESTED", "Help Requested"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.SET_NULL, null=True, blank=True, related_name="volunteer_tasks")
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assigned_volunteer_tasks")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_volunteer_tasks")
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    due_date = models.DateTimeField(blank=True, null=True)
    completion_notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.title} - {self.assigned_to.email} ({self.status})"


class VolunteerHelpRequest(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open / Seeking Co-Volunteer"
        IN_PROGRESS = "IN_PROGRESS", "Co-Volunteer Assisting"
        RESOLVED = "RESOLVED", "Resolved"

    task = models.ForeignKey(VolunteerTask, on_delete=models.SET_NULL, null=True, blank=True, related_name="help_requests")
    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.SET_NULL, null=True, blank=True, related_name="volunteer_help_requests")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="raised_help_requests")
    subject = models.CharField(max_length=255)
    message = models.TextField()
    assisting_volunteers = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="assisting_help_requests", blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)

    def __str__(self):
        return f"Help Request by {self.requested_by.email}: {self.subject}"
