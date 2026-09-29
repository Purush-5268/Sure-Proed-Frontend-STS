import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    STAFF_EMAIL_DOMAINS = (
        "@suretrust.local",
        "@suretrust.org",
        "@suretrust.dev",
        "@suretrust.tester",
        "@suretrust.advisory",
        "@suretrust.admin",
        "@suretrsut.admin",
        "@sureproed.mentor",
        "@suretrust.vol",
    )
    STAFF_EMAIL_DOMAIN = "@suretrust.local"
    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        MENTOR = "MENTOR", "Mentor"
        VOLUNTEER = "VOLUNTEER", "Volunteer"
        TRUSTEE = "TRUSTEE", "Trustee"
        COMPANY = "COMPANY", "Company"
        ADMIN = "ADMIN", "Admin"

    class Gender(models.TextChoices):
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    mapped_email = models.EmailField(
        blank=True,
        null=True,
        db_index=True,
        help_text="Mapped personal/professional email where notifications & updates are dispatched.",
    )
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True, null=True, help_text="Gender of the user.")
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True, help_text="Date of birth of the user.")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT, db_index=True)
    is_email_verified = models.BooleanField(default=False)
    is_social_auth_linked = models.BooleanField(default=False)
    social_provider = models.CharField(max_length=50, blank=True, null=True)
    linkedin_id = models.CharField(max_length=100, blank=True, null=True)
    has_all_cohorts_access = models.BooleanField(
        default=False,
        help_text="If True, this Volunteer/Mentor is granted access to view and manage all cohorts across the platform.",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    username = None

    objects = UserManager()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(role="STUDENT") | models.Q(mapped_email__isnull=True) | models.Q(mapped_email=""),
                name="student_has_no_mapped_email",
            ),
        ]
        indexes = [
            models.Index(fields=["role", "is_active"]),
            models.Index(fields=["date_joined"]),
        ]


    def get_notification_email(self):
        """Returns mapped_email if configured, otherwise falls back to primary login email."""
        return self.mapped_email if self.mapped_email else self.email

    @classmethod
    def is_staff_email(cls, email):
        if not email:
            return False
        email_clean = str(email).lower().strip()
        if any(email_clean.endswith(domain) for domain in cls.STAFF_EMAIL_DOMAINS):
            return True
        domain_part = email_clean.split("@")[-1] if "@" in email_clean else ""
        return (
            domain_part.startswith("suretrust.")
            or domain_part.startswith("sureproed.")
            or domain_part.startswith("suretrsut.")
        )

    @property
    def uses_reserved_staff_email(self):
        return User.is_staff_email(self.email)

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        is_staff_acc = self.uses_reserved_staff_email or self.role in [self.Role.MENTOR, self.Role.VOLUNTEER, self.Role.TRUSTEE, self.Role.ADMIN]
        if is_staff_acc and self.role == self.Role.STUDENT:
            raise ValidationError(
                {"email": "Staff email domains (@suretrust.org, @suretrust.dev, @suretrust.local, etc.) are reserved for staff accounts and cannot be used by Students."}
            )
        if is_staff_acc and not self.is_superuser and self.role != self.Role.ADMIN:
            if not self.mapped_email or not str(self.mapped_email).strip():
                raise ValidationError(
                    {"mapped_email": "Mapped personal/professional email is required for staff accounts."}
                )
        if self.uses_reserved_staff_email or self.role in [self.Role.MENTOR, self.Role.VOLUNTEER, self.Role.TRUSTEE, self.Role.ADMIN]:
            self.is_staff = True
        if self.role == self.Role.STUDENT and self.mapped_email:
            raise ValidationError(
                {"mapped_email": "Mapped email is not allowed for Students. Students use their primary email directly."}
            )

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        is_staff_acc = self.uses_reserved_staff_email or self.role in [self.Role.MENTOR, self.Role.VOLUNTEER, self.Role.TRUSTEE, self.Role.ADMIN]
        if self.uses_reserved_staff_email and self.role == self.Role.STUDENT:
            raise ValidationError(
                {"email": "Staff email domains (@suretrust.org, @suretrust.dev, @suretrust.local, etc.) are reserved for staff accounts and cannot be used by Students."}
            )
        if is_staff_acc or self.is_superuser:
            self.is_staff = True
        if self.is_superuser:
            self.is_email_verified = True
        if self.role == self.Role.STUDENT and self.mapped_email:
            from django.core.exceptions import ValidationError
            raise ValidationError({"mapped_email": "Mapped email is not allowed for Students. Students use their primary email directly."})
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.role})"


class EmailVerificationOTP(models.Model):
    email = models.EmailField(db_index=True)
    otp = models.CharField(max_length=6)
    registration_data = models.JSONField(blank=True, null=True, help_text="Pending registration payload until email OTP is verified.")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Email Verification OTP"
        verbose_name_plural = "Email Verification OTPs"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.otp:
            import secrets
            import string
            self.otp = ''.join(secrets.choice(string.digits) for _ in range(6))
        if not self.expires_at:
            from datetime import timedelta
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.is_used and self.expires_at > timezone.now()

    def __str__(self):
        return f"Email Verification OTP for {self.email}"


class PasswordResetOTP(models.Model):
    email = models.EmailField(db_index=True)
    otp = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Password Reset OTP"
        verbose_name_plural = "Password Reset OTPs"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.otp:
            import secrets
            import string
            self.otp = ''.join(secrets.choice(string.digits) for _ in range(6))
        if not self.expires_at:
            from datetime import timedelta
            self.expires_at = timezone.now() + timedelta(minutes=5)
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.is_used and self.expires_at > timezone.now()

    def __str__(self):
        return f"OTP for {self.email}"


class UserSearch(User):
    class Meta:
        proxy = True
        verbose_name = "User Directory Search"
        verbose_name_plural = "User Directory Search"

    def __str__(self):
        full_name = self.get_full_name().strip()
        return f"{full_name} ({self.get_role_display()})" if full_name else f"{self.email} ({self.get_role_display()})"


class AdministratorProfile(models.Model):
    class Category(models.TextChoices):
        ADMINISTRATOR = "ADMINISTRATOR", "Administrator / Core Team"
        TRUSTEE = "TRUSTEE", "Board of Trustees"
        ADVISORY = "ADVISORY", "Advisory Board Member"
        EXECUTIVE = "EXECUTIVE", "Executive Management"
        VOLUNTEER = "VOLUNTEER", "Volunteer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="admin_profile",
        limit_choices_to={"role__in": ["ADMIN", "TRUSTEE", "VOLUNTEER"]},
    )
    category = models.CharField(
        max_length=30,
        choices=Category.choices,
        default=Category.ADMINISTRATOR,
        db_index=True,
        help_text="Role category (Administrator, Trustee, Advisory Board, Executive Management)",
    )
    designation = models.CharField(
        max_length=150,
        blank=True,
        help_text="e.g. Founder & Chairman, Board Trustee, Advisory Member, Senior Director, Platform Administrator",
    )
    department = models.CharField(
        max_length=150,
        blank=True,
        help_text="e.g. Board of Trustees, Advisory Council, Academic Operations, Tech & Infrastructure",
    )
    organization_affiliation = models.CharField(
        max_length=200,
        blank=True,
        help_text="External Organization, Institution or Corporate Affiliation",
    )
    expertise = models.TextField(
        blank=True,
        help_text="Core Domain, Strategic Guidance, and Advisory Expertise",
    )
    responsibilities = models.TextField(
        blank=True,
        help_text="Key administrative responsibilities, governance focus, or advisory areas",
    )
    bio = models.TextField(blank=True)
    linkedin_url = models.URLField(blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    is_public_leadership = models.BooleanField(
        default=True,
        help_text="Show this profile on public leadership / advisory board listings",
    )
    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Display order in leadership/advisory directory",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Administrative & Leadership Profile"
        verbose_name_plural = "Administrative & Leadership Profiles"
        ordering = ["display_order", "category", "designation"]

    def __str__(self):
        full_name = self.user.get_full_name().strip() if self.user else ""
        name_str = f"{full_name} ({self.user.email})" if full_name else (self.user.email if self.user else "Unassigned")
        return f"{name_str} - {self.get_category_display()} ({self.designation or 'No Title'})"
