import os
import logging
from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from common.models import TimeStampedUUIDModel
from common.validators import (
    validate_banner_image_file,
    validate_profile_photo_file,
    validate_resume_file,
)
from common.storage import private_storage


logger = logging.getLogger(__name__)


def student_photo_path(instance, filename):
    code = instance.student_code if instance.student_code else (str(instance.id) if instance.id else 'student')
    # All accepted uploads are normalized to JPEG in save(). A deterministic
    # name guarantees one current photo per student instead of accumulating
    # random-suffix copies.
    return f"students/photos/{code}_photo.jpg"


def student_banner_path(instance, filename):
    code = instance.student_code if instance.student_code else (str(instance.id) if instance.id else 'student')
    return f"students/banners/{code}_banner.jpg"


def student_resume_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
    code = instance.student_code if instance.student_code else (str(instance.id) if instance.id else 'student')
    import uuid
    unique_id = uuid.uuid4().hex[:8]
    return f"students/resumes/{code}_resume_{unique_id}.{ext}"


class StudentProfile(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BUSY = "BUSY", "Busy"
        NOT_AVAILABLE = "NOT_AVAILABLE", "Not Available"

    class EducationLevel(models.TextChoices):
        UNDERGRADUATE = "UNDERGRADUATE", "Undergraduate"
        POSTGRADUATE = "POSTGRADUATE", "Postgraduate"
        DIPLOMA = "DIPLOMA", "Diploma"
        OTHER = "OTHER", "Other"

    class VerificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="student_profile")
    student_code = models.CharField(max_length=30, unique=True)
    student_identity_issued_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Issued only after qualification, interview verification, and cohort assignment.",
    )
    is_public = models.BooleanField(default=False)
    profile_photo = models.ImageField(upload_to=student_photo_path, validators=[validate_profile_photo_file], blank=True, null=True)
    banner_image = models.ImageField(upload_to=student_banner_path, validators=[validate_banner_image_file], blank=True, null=True, help_text="Student profile banner / cover photo. Maximum 10 MB; JPG, PNG, or WEBP.")
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
    )
    verification_remarks = models.TextField(blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True, help_text="Date of birth of the student.")
    tagline = models.CharField(max_length=200, blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    country = models.CharField(max_length=100, default="India")
    college = models.CharField(max_length=255, blank=True, null=True)
    degree = models.CharField(max_length=150, blank=True, null=True)
    specialization = models.CharField(max_length=150, blank=True, null=True)
    education_level = models.CharField(max_length=20, choices=EducationLevel.choices, default=EducationLevel.UNDERGRADUATE)
    graduation_year = models.PositiveIntegerField(blank=True, null=True)
    skills = models.JSONField(default=list, blank=True)
    hobbies = models.JSONField(default=list, blank=True)
    languages = models.JSONField(default=list, blank=True)
    linkedin_url = models.URLField(blank=True, null=True)
    linkedin_id = models.CharField(max_length=100, blank=True, null=True, unique=True)
    is_linkedin_connected = models.BooleanField(default=False)
    linkedin_profile_data = models.JSONField(default=dict, blank=True)
    github_url = models.URLField(blank=True, null=True)
    github_username = models.CharField(max_length=100, blank=True, null=True)
    is_github_connected = models.BooleanField(default=False)
    github_org_invite_status = models.CharField(max_length=50, default="NOT_INVITED")
    github_repo_url = models.URLField(blank=True, null=True)
    portfolio_url = models.URLField(blank=True, null=True)
    resume = models.FileField(upload_to=student_resume_path, validators=[validate_resume_file], blank=True, null=True)

    def __str__(self):
        if self.user_id:
            name = self.user.get_full_name().strip()
            if name:
                return f"{name} ({self.student_code})"
            if self.user.email:
                return f"{self.user.email} ({self.student_code})"
        return self.student_code

    @property
    def is_official_student(self):
        return self.student_identity_issued_at is not None

    def save(self, *args, **kwargs):
        from django.db import transaction
        replaced_resume = None
        from io import BytesIO
        from django.core.files.uploadedfile import InMemoryUploadedFile
        from PIL import Image

        new_photo_uploaded = bool(
            self.profile_photo and not getattr(self.profile_photo, "_committed", True)
        )
        new_banner_uploaded = bool(
            self.banner_image and not getattr(self.banner_image, "_committed", True)
        )

        # Validate complete image data before touching the previous upload.
        from common.validators import validate_profile_photo_file, validate_banner_image_file
        if new_photo_uploaded:
            validate_profile_photo_file(self.profile_photo)
        if new_banner_uploaded:
            validate_banner_image_file(self.banner_image)

        # Delete old photo/banner/resume files if they are being replaced or cleared
        if self.pk:
            old_instance = StudentProfile.objects.filter(pk=self.pk).first()
            if old_instance:
                if old_instance.profile_photo and (new_photo_uploaded or not self.profile_photo or self.profile_photo != old_instance.profile_photo):
                    try:
                        if old_instance.profile_photo.storage.exists(old_instance.profile_photo.name):
                            old_instance.profile_photo.storage.delete(old_instance.profile_photo.name)
                    except Exception:
                        pass
                if old_instance.banner_image and (new_banner_uploaded or not self.banner_image or self.banner_image != old_instance.banner_image):
                    try:
                        if old_instance.banner_image.storage.exists(old_instance.banner_image.name):
                            old_instance.banner_image.storage.delete(old_instance.banner_image.name)
                    except Exception:
                        pass
                if old_instance.resume and (not self.resume or self.resume != old_instance.resume):
                    if kwargs.get("update_fields") is None or "resume" in kwargs["update_fields"]:
                        replaced_resume = (old_instance.resume.storage, old_instance.resume.name)

        code = self.student_code or (str(self.id) if self.id else "student")

        # Only process a newly assigned upload. Accessing `.file` on an existing
        # committed FieldFile opens it immediately and crashes unrelated profile
        # updates when an old media file has gone missing from disk.
        if new_photo_uploaded:
            try:
                img = Image.open(self.profile_photo.file)
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                max_size = (800, 800)
                img.thumbnail(max_size, Image.Resampling.LANCZOS)

                output = BytesIO()
                img.save(output, format='JPEG', quality=85)
                output.seek(0)

                self.profile_photo = InMemoryUploadedFile(
                    output,
                    'ImageField',
                    f"{code}.jpg",
                    'image/jpeg',
                    len(output.getvalue()),
                    None
                )
            except Exception:
                pass

            # FileSystemStorage otherwise appends a random suffix when the
            # deterministic destination already exists. Remove that destination
            # immediately before Django writes the new upload.
            try:
                destination = student_photo_path(self, self.profile_photo.name)
                storage = self.profile_photo.storage
                if storage.exists(destination):
                    storage.delete(destination)
            except Exception:
                pass

        if new_banner_uploaded:
            try:
                img = Image.open(self.banner_image.file)
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                max_size = (1920, 1080)
                img.thumbnail(max_size, Image.Resampling.LANCZOS)

                output = BytesIO()
                img.save(output, format='JPEG', quality=85)
                output.seek(0)

                self.banner_image = InMemoryUploadedFile(
                    output,
                    'ImageField',
                    f"{code}_banner.jpg",
                    'image/jpeg',
                    len(output.getvalue()),
                    None
                )
            except Exception:
                pass

            try:
                destination = student_banner_path(self, self.banner_image.name)
                storage = self.banner_image.storage
                if storage.exists(destination):
                    storage.delete(destination)
            except Exception:
                pass

        # Auto-link pre-existing GitHub repository if available and not explicitly skipped
        if not self.github_repo_url and not getattr(self, "_skip_github_auto_link", False):
            try:
                from students.services.repo_lookup_service import auto_link_existing_repo
                auto_link_existing_repo(self, save=False)
            except Exception:
                pass

        super().save(*args, **kwargs)
        if replaced_resume:
            storage, name = replaced_resume
            def delete_replaced_resume():
                # Rollbacks retain the old file. A document still referenced by
                # any profile is never removed by another profile's update.
                if not StudentProfile.objects.filter(resume=name).exists():
                    try:
                        storage.delete(name)
                    except Exception:
                        logger.warning("Replaced resume cleanup failed; file retained")
            transaction.on_commit(delete_replaced_resume)
        self._enforce_single_profile_photo()
        self._enforce_single_banner_image()

    def _enforce_single_profile_photo(self):
        """Keep one deterministic photo and repair legacy duplicate references."""
        try:
            if not self.profile_photo:
                return
            storage = self.profile_photo.storage
            photo_directory = "students/photos"
            prefix = f"{self.student_code}_photo"
            try:
                _, filenames = storage.listdir(photo_directory)
            except FileNotFoundError:
                return
            candidates = [
                f"{photo_directory}/{filename}"
                for filename in filenames
                if filename.startswith(prefix)
            ]
            if not candidates:
                return

            current_name = self.profile_photo.name if self.profile_photo else ""
            if current_name and storage.exists(current_name):
                selected_name = current_name
            else:
                # Repair a stale DB reference by selecting the most recently
                # modified surviving file for this student.
                selected_name = max(
                    candidates,
                    key=lambda name: storage.get_modified_time(name),
                )

            deterministic_name = f"{photo_directory}/{self.student_code}_photo.jpg"
            if selected_name != deterministic_name:
                if storage.exists(deterministic_name):
                    storage.delete(deterministic_name)
                with storage.open(selected_name, "rb") as selected_file:
                    saved_name = storage.save(deterministic_name, selected_file)
                if saved_name != deterministic_name:
                    # Do not remove legacy files unless the deterministic copy
                    # was created exactly where expected.
                    return

            if not storage.exists(deterministic_name):
                return

            from django.utils import timezone
            now = timezone.now()
            StudentProfile.objects.filter(pk=self.pk).update(profile_photo=deterministic_name, updated_at=now)
            self.profile_photo.name = deterministic_name
            self.profile_photo._committed = True
            self.updated_at = now

            for candidate in candidates:
                if candidate != deterministic_name and storage.exists(candidate):
                    storage.delete(candidate)
        except Exception:
            # Media cleanup is maintenance and must never make a profile/resume
            # update fail after its database save succeeded.
            logger.exception(
                "Could not enforce single profile photo for student %s",
                self.student_code,
            )

    def _enforce_single_banner_image(self):
        """Keep one deterministic banner image and remove duplicate legacy files."""
        try:
            if not self.banner_image:
                return
            storage = self.banner_image.storage
            banner_directory = "students/banners"
            prefix = f"{self.student_code}_banner"
            try:
                _, filenames = storage.listdir(banner_directory)
            except FileNotFoundError:
                return
            candidates = [
                f"{banner_directory}/{filename}"
                for filename in filenames
                if filename.startswith(prefix)
            ]
            if not candidates:
                return

            current_name = self.banner_image.name if self.banner_image else ""
            if current_name and storage.exists(current_name):
                selected_name = current_name
            else:
                selected_name = max(
                    candidates,
                    key=lambda name: storage.get_modified_time(name),
                )

            deterministic_name = f"{banner_directory}/{self.student_code}_banner.jpg"
            if selected_name != deterministic_name:
                if storage.exists(deterministic_name):
                    storage.delete(deterministic_name)
                with storage.open(selected_name, "rb") as selected_file:
                    saved_name = storage.save(deterministic_name, selected_file)
                if saved_name != deterministic_name:
                    return

            if not storage.exists(deterministic_name):
                return

            from django.utils import timezone
            now = timezone.now()
            StudentProfile.objects.filter(pk=self.pk).update(banner_image=deterministic_name, updated_at=now)
            self.banner_image.name = deterministic_name
            self.banner_image._committed = True
            self.updated_at = now

            for candidate in candidates:
                if candidate != deterministic_name and storage.exists(candidate):
                    storage.delete(candidate)
        except Exception:
            logger.exception(
                "Could not enforce single banner image for student %s",
                self.student_code,
            )


@receiver(post_delete, sender=StudentProfile)
def auto_delete_student_profile_files(sender, instance, **kwargs):
    if instance.profile_photo:
        try:
            if instance.profile_photo.storage.exists(instance.profile_photo.name):
                instance.profile_photo.storage.delete(instance.profile_photo.name)
        except Exception:
            pass
    if instance.banner_image:
        try:
            if instance.banner_image.storage.exists(instance.banner_image.name):
                instance.banner_image.storage.delete(instance.banner_image.name)
        except Exception:
            pass
    if instance.resume:
        try:
            if instance.resume.storage.exists(instance.resume.name):
                instance.resume.storage.delete(instance.resume.name)
        except Exception:
            pass

def placement_offer_letter_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
    import uuid
    unique_id = uuid.uuid4().hex[:8]
    code = instance.student.student_code if instance.student and instance.student.student_code else 'unknown'
    return f"placements/{code}_offer_{unique_id}.{ext}"


class StudentPlacement(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        PENDING_VERIFICATION = "PENDING_VERIFICATION", "Pending Verification"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    class EmploymentType(models.TextChoices):
        FULL_TIME = "FULL_TIME", "Full-Time"
        CONTRACT = "CONTRACT", "Contract"
        FREELANCE = "FREELANCE", "Freelance"
        INTERNSHIP = "INTERNSHIP", "Internship"
        OTHER = "OTHER", "Other"

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="placements")

    # Required Fields
    company_name = models.CharField(max_length=255)
    designation = models.CharField(max_length=255)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME)
    joining_date = models.DateField()

    # Optional Evidence
    offer_letter = models.FileField(upload_to=placement_offer_letter_path, storage=private_storage, blank=True, null=True, max_length=500)
    official_email = models.EmailField(blank=True, null=True)
    linkedin_url = models.URLField(blank=True, null=True)

    # Verification Fields
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING_VERIFICATION, db_index=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="verified_placements", blank=True, null=True)
    verified_at = models.DateTimeField(blank=True, null=True)
    verification_remarks = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Student Placement"
        verbose_name_plural = "Student Placements"

    def __str__(self):
        return f"{self.student.student_code} - {self.company_name}"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._initial_status = self.status

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        # Determine if we need to dispatch CSR refresh
        should_refresh_csr = False

        if not is_new:
            # If status changed between VERIFIED and something else, it affects CSR counts
            if self._initial_status != self.status:
                if self.status == self.Status.VERIFIED or self._initial_status == self.Status.VERIFIED:
                    should_refresh_csr = True
        else:
            # If created directly as VERIFIED (e.g. by admin)
            if self.status == self.Status.VERIFIED:
                should_refresh_csr = True

        super().save(*args, **kwargs)
        self._initial_status = self.status

        if should_refresh_csr:
            from common.tasks import refresh_platform_statistics
            try:
                refresh_platform_statistics.delay()
            except Exception as e:
                logger.error(f"Failed to dispatch CSR refresh task: {e}")

@receiver(post_delete, sender=StudentPlacement)
def auto_delete_student_placement_files(sender, instance, **kwargs):
    if instance.offer_letter:
        try:
            if instance.offer_letter.storage.exists(instance.offer_letter.name):
                instance.offer_letter.storage.delete(instance.offer_letter.name)
        except Exception:
            pass

    # If a VERIFIED placement is deleted, it might affect CSR count
    if instance.status == StudentPlacement.Status.VERIFIED:
        from common.tasks import refresh_platform_statistics
        try:
            refresh_platform_statistics.delay()
        except Exception as e:
            logger.error(f"Failed to dispatch CSR refresh task on deletion: {e}")


class StudentIdentityAlias(TimeStampedUUIDModel):
    """
    Persistent mapping from a recognized Google Meet participant display name 
    or alternate email to an official StudentProfile.
    """
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name="identity_aliases")
    normalized_alias = models.CharField(max_length=255, unique=True, help_text="The exact string or canonical token representation that is verified.")
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="verified_student_aliases")
    
    class Meta:
        verbose_name_plural = "Student Identity Aliases"
        
    def __str__(self):
        return f"{self.normalized_alias} -> {self.student.student_code}"

class GoogleStudentIdentity(models.Model):
    student = models.OneToOneField(StudentProfile, on_delete=models.CASCADE, related_name="google_identity")
    google_subject_id = models.CharField(max_length=255, unique=True, db_index=True, blank=True, null=True)
    google_email = models.EmailField(db_index=True)
    google_profile_name = models.CharField(max_length=255)
    is_verified = models.BooleanField(default=False)
    connected_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        verbose_name_plural = "Google Student Identities"
        
    def __str__(self):
        return f"{self.google_email} -> {self.student.student_code}"
