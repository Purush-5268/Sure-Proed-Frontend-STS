import uuid
from django.conf import settings
from django.db import models


class TimeStampedUUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SystemInformation(TimeStampedUUIDModel):
    key = models.CharField(max_length=255, unique=True, help_text="e.g., about_us, contact_email, terms_of_service")
    value = models.TextField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.key


class FAQ(TimeStampedUUIDModel):
    question = models.CharField(max_length=500)
    answer = models.TextField()
    category = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., General, Admission, Courses")
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.question[:50]


class Announcement(TimeStampedUUIDModel):
    """
    Broadcast messages created by Admins/Mentors for all users, specific roles, or specific cohorts.
    """
    class TargetAudience(models.TextChoices):
        ALL = "ALL", "All Users"
        STUDENTS = "STUDENTS", "All Students"
        MENTORS = "MENTORS", "All Mentors"
        VOLUNTEERS = "VOLUNTEERS", "All Volunteers"
        COHORT = "COHORT", "Specific Cohort Only"

    title = models.CharField(max_length=255)
    message = models.TextField()
    target_audience = models.CharField(max_length=20, choices=TargetAudience.choices, default=TargetAudience.ALL, db_index=True)
    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.CASCADE, related_name="announcements", blank=True, null=True)
    attachment = models.FileField(upload_to="announcements/attachments/", blank=True, null=True, help_text="Optional document, image, or PDF attachment.")
    link_url = models.URLField(max_length=500, blank=True, null=True, help_text="Optional external or internal link URL.")
    is_pinned = models.BooleanField(default=False, help_text="Pinned announcements stay at the top of student dashboards.")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_announcements")

    class Meta:
        ordering = ["-is_pinned", "-created_at"]
        indexes = [
            models.Index(fields=["target_audience", "is_active"]),
            models.Index(fields=["cohort", "is_active"]),
        ]

    def __str__(self):
        return self.title



class Notification(TimeStampedUUIDModel):
    """
    Candidate-specific personal notifications (e.g. 'Offer Letter Issued', 'Exam Scheduled', 'Module Test Graded').
    """
    class Type(models.TextChoices):
        INFO = "INFO", "Information"
        SUCCESS = "SUCCESS", "Success / Achievement"
        WARNING = "WARNING", "Warning / Alert"
        ACTION_REQUIRED = "ACTION_REQUIRED", "Action Required"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications", db_index=True)
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=Type.choices, default=Type.INFO)
    is_read = models.BooleanField(default=False, db_index=True)
    dedupe_key = models.CharField(max_length=255, null=True, blank=True, editable=False)
    announcement = models.ForeignKey(Announcement, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications", editable=False)
    action_url = models.CharField(max_length=500, blank=True, null=True, help_text="Relative URL or dashboard path for action link.")

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["user", "dedupe_key"], name="notification_user_dedupe_unique")]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"Notification for {self.user.email if self.user else 'User'}: {self.title}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        from common.services.mobile_push import queue_notification
        queue_notification(self.id)


class UserRequest(TimeStampedUUIDModel):
    """
    Support & Issue Resolution Request Form submitted by Students, Mentors, or Volunteers to Admins.
    """
    class Category(models.TextChoices):
        TECHNICAL_ISSUE = "TECHNICAL_ISSUE", "Technical Issue / Bug"
        ATTENDANCE = "ATTENDANCE", "Attendance Correction"
        COURSE_INQUIRY = "COURSE_INQUIRY", "Course / Curriculum Inquiry"
        OFFER_LETTER = "OFFER_LETTER", "Offer Letter"
        CERTIFICATE = "CERTIFICATE", "Certificate"
        ASSIGNMENT_EXAM = "ASSIGNMENT_EXAM", "Assignment / Exam Query"
        VOLUNTEER_JOINING = "VOLUNTEER_JOINING", "Volunteer Joining Request"
        MENTOR_SUPPORT = "MENTOR_SUPPORT", "Mentor Support / Class Reschedule"
        VOLUNTEER_SUPPORT = "VOLUNTEER_SUPPORT", "Volunteer Support / Session Log"
        LEAVE_REQUEST = "LEAVE_REQUEST", "Leave Request"
        OTHER = "OTHER", "Other General Request"




    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Review"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESOLVED = "RESOLVED", "Resolved"
        REJECTED = "REJECTED", "Rejected"
        CLOSED = "CLOSED", "Closed"

    request_number = models.CharField(max_length=50, unique=True, editable=False, blank=True)
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submitted_requests")
    sender_role = models.CharField(max_length=20, blank=True, help_text="Role at submission time: STUDENT, MENTOR, VOLUNTEER")
    category = models.CharField(max_length=30, choices=Category.choices, default=Category.TECHNICAL_ISSUE, db_index=True)
    subject = models.CharField(max_length=255)
    description = models.TextField()
    attachment = models.FileField(upload_to="requests/attachments/", blank=True, null=True, help_text="Optional screenshot or document attachment.")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)

    admin_remarks = models.TextField(blank=True, null=True, help_text="Resolution notes or response from Admin.")
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="resolved_requests")
    resolved_at = models.DateTimeField(blank=True, null=True)

    related_application = models.ForeignKey(
        "applications.Application",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_requests",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "User Support Request"
        verbose_name_plural = "User Support Requests"
        indexes = [
            models.Index(fields=["sender", "status"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["related_application", "category"],
                condition=models.Q(
                    category="OFFER_LETTER",
                    status__in=["PENDING", "IN_PROGRESS"],
                ),
                name="unique_active_offer_letter_request_per_application",
            )
        ]



    def save(self, *args, **kwargs):
        if not self.request_number:
            import random
            import string
            prefix = "REQ"
            rand_str = ''.join(random.choices(string.digits, k=6))
            self.request_number = f"{prefix}-{rand_str}"
        if self.sender and not self.sender_role:
            self.sender_role = getattr(self.sender, "role", "USER")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.request_number}] {self.subject} ({self.status})"

class PushSubscription(TimeStampedUUIDModel):
    """
    Browser Web Push subscription mapping for users. Supports multiple devices.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions", db_index=True)
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Push Subscription"
        verbose_name_plural = "Push Subscriptions"
        indexes = [
            models.Index(fields=["user", "is_active"]),
        ]

    def __str__(self):
        return f"PushSubscription for {self.user.email} (Active: {self.is_active})"

class Achievement(TimeStampedUUIDModel):
    title = models.CharField(max_length=255)
    description = models.TextField()
    date_awarded = models.DateField(blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)
    image = models.ImageField(upload_to="achievements/", blank=True, null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    is_published = models.BooleanField(default=True)
    
    # Optional authoritative links
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, blank=True, null=True, related_name="achievements")
    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.SET_NULL, blank=True, null=True, related_name="achievements")
    course = models.ForeignKey("courses.Course", on_delete=models.SET_NULL, blank=True, null=True, related_name="achievements")

    def __str__(self):
        return self.title


class OrganizationalUpdate(TimeStampedUUIDModel):
    title = models.CharField(max_length=255)
    content = models.TextField()
    category = models.CharField(max_length=100, blank=True, null=True)
    event_date = models.DateField(blank=True, null=True)
    image = models.ImageField(upload_to="updates/", blank=True, null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    is_published = models.BooleanField(default=True)

    def __str__(self):
        return self.title


class AppRelease(TimeStampedUUIDModel):
    """
    Self-hosted In-App OTA Update release model.
    Serves version information, download links, and release notes to Android/iOS mobile apps.
    """
    version_code = models.PositiveIntegerField(
        unique=True,
        help_text="Integer version code matching Android BuildConfig.VERSION_CODE (e.g. 2)",
    )
    version_name = models.CharField(
        max_length=50,
        help_text="Display version string (e.g. '1.1.0')",
    )
    apk_file = models.FileField(
        upload_to="apk/",
        blank=True,
        null=True,
        help_text="Upload the APK file directly to serve from backend media storage",
    )
    download_url = models.URLField(
        max_length=500,
        blank=True,
        help_text="Optional external/CDN download URL (used if APK file is not uploaded directly)",
    )
    release_notes = models.TextField(
        help_text="Markdown or bullet points of new features and fixes shown in the in-app update dialog",
    )
    is_mandatory = models.BooleanField(
        default=False,
        help_text="If True, prevents dismissal of update dialog and enforces immediate update",
    )
    file_size_bytes = models.BigIntegerField(
        blank=True,
        null=True,
        help_text="File size in bytes. Automatically computed if an APK file is uploaded",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Only active releases are served by the version-check endpoint",
    )

    class Meta:
        ordering = ["-version_code"]
        verbose_name = "App Release"
        verbose_name_plural = "App Releases"
        indexes = [
            models.Index(fields=["is_active", "-version_code"]),
        ]

    def __str__(self):
        return f"v{self.version_name} (Code: {self.version_code}){' [Mandatory]' if self.is_mandatory else ''}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if not self.apk_file and not self.download_url:
            raise ValidationError("Either upload an APK file or provide a Download URL.")

    def save(self, *args, **kwargs):
        if self.apk_file and not self.file_size_bytes:
            try:
                self.file_size_bytes = self.apk_file.size
            except Exception:
                pass
        super().save(*args, **kwargs)

    def get_download_url(self, request=None):
        if self.download_url:
            return self.download_url
        if self.apk_file:
            if request:
                return request.build_absolute_uri(self.apk_file.url)
            return self.apk_file.url
        return ""



class MobilePushDevice(TimeStampedUUIDModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mobile_push_devices")
    token = models.CharField(max_length=4096, unique=True)
    account_session = models.UUIDField()
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [models.Index(fields=["user", "is_active"], name="mobile_push_user_active")]


class MobilePushDelivery(TimeStampedUUIDModel):
    """Device-reported timestamps for diagnosing urgent class push latency."""
    notification = models.ForeignKey(
        Notification,
        on_delete=models.SET_NULL,
        null=True,
        related_name="mobile_deliveries",
    )
    device = models.ForeignKey(
        MobilePushDevice,
        on_delete=models.SET_NULL,
        null=True,
        related_name="deliveries",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mobile_push_deliveries",
    )
    account_session = models.UUIDField()
    event_type = models.CharField(max_length=40)
    class_id = models.CharField(max_length=64)
    scheduled_at = models.DateTimeField()
    server_sent_at = models.DateTimeField()
    device_received_at = models.DateTimeField()
    notification_displayed_at = models.DateTimeField(blank=True, null=True)
    transport_latency_ms = models.PositiveBigIntegerField(default=0)
    schedule_lateness_ms = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["notification", "device", "event_type"],
                name="push_delivery_event_unique",
            )
        ]
        indexes = [
            models.Index(fields=["class_id", "event_type"], name="push_delivery_class_event"),
            models.Index(fields=["device_received_at"], name="push_delivery_received"),
        ]


class EmailDeliveryLog(TimeStampedUUIDModel):
    """
    Log of transactional email delivery attempts for idempotency and failover tracking.
    """
    class Provider(models.TextChoices):
        ZEPTOMAIL = "ZEPTOMAIL", "ZeptoMail"
        GOOGLE_WORKSPACE = "GOOGLE_WORKSPACE", "Google Workspace"
        UNKNOWN = "UNKNOWN", "Unknown"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"

    idempotency_key = models.CharField(max_length=255, unique=True, help_text="Unique key per email transaction (e.g. otp:user_id or application_confirmation:app_id)")
    email_category = models.CharField(max_length=100, db_index=True, help_text="Category of the email (e.g. otp, password_reset, application_confirmation)")
    recipient = models.CharField(max_length=255, db_index=True, help_text="Recipient email address (or hashed identifier)")
    
    # State tracking
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    provider_attempted = models.CharField(max_length=50, choices=Provider.choices, default=Provider.UNKNOWN)
    provider_message_id = models.CharField(max_length=255, blank=True, null=True, help_text="Message ID returned by the provider")
    
    # Failure classification
    failure_category = models.CharField(max_length=100, blank=True, null=True, help_text="Classification of failure (e.g. timeout, auth_error, invalid_recipient)")
    error_message = models.TextField(blank=True, null=True)
    
    # Retry tracking
    attempt_count = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Email Delivery Log"
        verbose_name_plural = "Email Delivery Logs"
        indexes = [
            models.Index(fields=["email_category", "status"]),
        ]

    def __str__(self):
        return f"[{self.idempotency_key}] {self.email_category} to {self.recipient} - {self.status}"

