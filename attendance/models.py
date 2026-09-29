from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel


class GoogleCalendarAuditLog(TimeStampedUUIDModel):
    attendance_id = models.UUIDField(db_index=True, null=True, blank=True)
    calendar_event_id = models.CharField(max_length=255, db_index=True)
    operation_type = models.CharField(max_length=50)
    actor = models.CharField(max_length=100)
    status = models.CharField(max_length=50, db_index=True)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.operation_type} - {self.calendar_event_id} - {self.status}"


class Attendance(TimeStampedUUIDModel):

    class ClassStatus(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        COMPLETED = "COMPLETED", "Completed"
        RESCHEDULED = "RESCHEDULED", "Rescheduled"
        CANCELLED = "CANCELLED", "Cancelled"

    # DOMAIN / LST / CELEBRATION targeting
    cohort = models.ForeignKey(
        "cohorts.Cohort",
        on_delete=models.CASCADE,
        related_name="attendance_sessions",
        blank=True,
        null=True,
    )

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="attendance_sessions",
        blank=True,
        null=True,
    )

    class ClassType(models.TextChoices):
        DOMAIN = "DOMAIN", "Regular Domain Class"
        LST = "LST", "LST Class"
        SOFTSKILLS = "SOFTSKILLS", "Soft Skills Training"
        CELEBRATION = "CELEBRATION", "Celebration"
        TRAINING = "TRAINING", "Training Session"
        UNIVERSAL = "UNIVERSAL", "Universal Session"

    class_type = models.CharField(
        max_length=20,
        choices=ClassType.choices,
        default=ClassType.DOMAIN,
        db_index=True,
    )

    lst_batch = models.CharField(
        max_length=20,
        choices=[
            ("BATCH_1", "Batch 1"),
            ("BATCH_2", "Batch 2"),
            ("BATCH_3", "Batch 3"),
            ("BATCH_4", "Batch 4"),
            ("COMBINED", "Batch 1 + Batch 2 (Combined)"),
        ],
        blank=True,
        null=True,
    )

    title = models.CharField(max_length=255)

    class_date = models.DateField(db_index=True)

    start_time = models.TimeField()

    end_time = models.TimeField(
        blank=True,
        null=True,
    )

    # Keep local backend's existing status field
    class_status = models.CharField(
        max_length=20,
        choices=ClassStatus.choices,
        default=ClassStatus.SCHEDULED,
        db_index=True,
    )

    conducted = models.BooleanField(default=True)

    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="conducted_classes",
        blank=True,
        null=True,
    )

    # Existing attendance relationship
    attendees = models.ManyToManyField(
        "students.StudentProfile",
        related_name="attended_classes",
        blank=True,
    )

    # Existing Purush workflow field
    joined_students = models.ManyToManyField(
        "students.StudentProfile",
        related_name="joined_classes",
        blank=True,
    )

    # Google Meet / Calendar
    meeting_link = models.URLField(
        blank=True,
        null=True,
    )

    calendar_event_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
    )

    # Official Google Meet attendance snapshot
    google_meet_attendance_data = models.JSONField(
        blank=True,
        null=True,
    )

    portal_join_logs = models.JSONField(
        default=dict,
        blank=True,
    )

    historical_attendance_data = models.JSONField(blank=True, null=True)

    recording_link = models.URLField(
        blank=True,
        null=True,
    )

    notes = models.TextField(
        blank=True,
        null=True,
    )

    # Existing Purush attendee-whitelisting mechanism
    guest_emails = models.JSONField(
        default=list,
        blank=True,
    )

    whitelisted_guest_emails = models.JSONField(
        default=list,
        blank=True,
        null=True,
        help_text="External Google Meet guest emails allowed for this class.",
    )

    def save(self, *args, **kwargs):
        if self.whitelisted_guest_emails:
            self.whitelisted_guest_emails = [e.strip().lower() for e in self.whitelisted_guest_emails if isinstance(e, str) and e.strip()]
        if self.guest_emails:
            self.guest_emails = [e.strip().lower() for e in self.guest_emails if isinstance(e, str) and e.strip()]
        if self.guest_emails and not self.whitelisted_guest_emails:
            self.whitelisted_guest_emails = self.guest_emails
        elif self.whitelisted_guest_emails and not self.guest_emails:
            self.guest_emails = self.whitelisted_guest_emails
        super().save(*args, **kwargs)

    class Meta:
        indexes = [
            models.Index(fields=["cohort", "class_date"], name="att_cohort_date_idx"),
        ]

    def __str__(self):
        return f"{self.cohort or self.course} - {self.title}"


class RecurringSchedule(TimeStampedUUIDModel):

    class ClassType(models.TextChoices):
        DOMAIN = "DOMAIN", "Domain Class"
        LST = "LST", "LST Class"
        CELEBRATION = "CELEBRATION", "Celebration"

    class_type = models.CharField(
        max_length=20,
        choices=ClassType.choices,
        default=ClassType.DOMAIN,
        db_index=True,
    )

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )

    cohort = models.ForeignKey(
        "cohorts.Cohort",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )

    lst_batch = models.CharField(
        max_length=20,
        choices=[
            ("BATCH_1", "Batch 1"),
            ("BATCH_2", "Batch 2"),
        ],
        blank=True,
        null=True,
    )

    start_time = models.TimeField()

    end_time = models.TimeField()

    is_paused = models.BooleanField(default=False)

    next_run = models.DateTimeField(
        help_text="The datetime of the next occurrence."
    )

    frequency_days = models.IntegerField(
        default=7,
        help_text="7 for weekly, 14 for alternating Sundays.",
    )

    def __str__(self):
        return f"{self.class_type} - Next: {self.next_run}"


class AbsenceWarning(TimeStampedUUIDModel):

    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.CASCADE,
        related_name="absence_warnings",
    )

    session = models.ForeignKey(
        Attendance,
        on_delete=models.CASCADE,
        related_name="warnings",
    )

    resolved = models.BooleanField(default=False)

    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("APOLOGIZED", "Apologized"),
        ("ACCEPTED", "Accepted"),
        ("REJECTED", "Rejected"),
        ("CLOSED", "Closed"),
    )

    apology_text = models.TextField(
        blank=True,
        null=True,
    )

    apology_submitted_at = models.DateTimeField(
        blank=True,
        null=True,
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        db_index=True,
    )

    class Meta:
        unique_together = ("student", "session")

    def __str__(self):
        return f"Warning: {self.student} - {self.session}"

    def save(self, *args, **kwargs):
        # Track whether status changed to ACCEPTED
        trigger_reconciliation = False
        if self.pk:
            try:
                old = AbsenceWarning.objects.filter(pk=self.pk).values_list('status', flat=True).first()
                if old != "ACCEPTED" and self.status == "ACCEPTED":
                    trigger_reconciliation = True
            except Exception:
                pass
        super().save(*args, **kwargs)

        if trigger_reconciliation:
            import logging
            _logger = logging.getLogger(__name__)
            from attendance.services.discipline_reconciliation_service import reconcile_student_discipline_for_session
            try:
                reconcile_student_discipline_for_session(
                    self.student, self.session,
                    reason=f"Apology accepted for session '{self.session.title}'"
                )
            except Exception as e:
                _logger.error(f"Error reconciling discipline after apology accepted: {e}")


class PriorPermission(TimeStampedUUIDModel):
    session = models.ForeignKey(
        Attendance,
        on_delete=models.CASCADE,
        related_name="prior_permissions",
    )
    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.CASCADE,
        related_name="prior_permissions",
    )
    reason = models.TextField(blank=True, null=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="granted_permissions",
    )

    class Meta:
        unique_together = ("session", "student")

    def __str__(self):
        return f"Permission: {self.student} for {self.session}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        import logging
        _logger = logging.getLogger(__name__)

        # 1. (Removed) We no longer call evaluate_session_discipline here because it can 
        # accidentally re-suspend the student before the reconciliation service runs.
        # Reconciliation will clean up stale warnings directly.

        # 2. Centralized reconciliation: resolve this session's cause,
        #    check ALL remaining causes, restore only if zero remain
        from attendance.services.discipline_reconciliation_service import reconcile_student_discipline_for_session
        try:
            reconcile_student_discipline_for_session(
                self.student, self.session,
                reason=f"Prior permission granted for session '{self.session.title}'"
            )
        except Exception as e:
            _logger.error(f"Error reconciling discipline after PriorPermission: {e}")

        # 3. Update session JSON so admin UI reflects the change instantly
        try:
            session = self.session
            if session.google_meet_attendance_data and session.google_meet_attendance_data.get("status") == "READY":
                data = session.google_meet_attendance_data
                student_id = str(self.student_id)
                if "expected_students" in data and student_id in data["expected_students"]:
                    student_data = data["expected_students"][student_id]
                    student_data["prior_permission"] = {
                        "has_permission": True,
                        "reason": self.reason or "",
                        "granted_by_name": (
                            f"{self.granted_by.first_name} {self.granted_by.last_name}".strip()
                            if self.granted_by else "System"
                        ),
                        "created_at": self.created_at.isoformat() if self.created_at else ""
                    }
                    if student_data.get("status") == "ABSENT":
                        student_data["status"] = "PRIOR_PERMISSION"
                    # Refresh account_status from real DB
                    from applications.models import Application
                    app = Application.objects.filter(
                        student_id=self.student_id
                    ).order_by('-updated_at').first()
                    if app:
                        student_data["account_status"] = app.status
                    session.google_meet_attendance_data = data
                    session.save(update_fields=['google_meet_attendance_data'])
        except Exception as e:
            _logger.error(f"Error updating session JSON after PriorPermission: {e}")


class AttendanceSummary(TimeStampedUUIDModel):

    session = models.ForeignKey(
        Attendance,
        on_delete=models.CASCADE,
        related_name="attendance_summaries",
        db_index=True,
    )

    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.CASCADE,
        related_name="attendance_summaries",
        db_index=True,
    )

    total_session_minutes = models.FloatField(default=0)

    active_minutes = models.FloatField(default=0)

    attendance_percentage = models.FloatField(default=0)

    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("session", "student")
        indexes = [
            models.Index(fields=["session"]),
            models.Index(fields=["student"]),
            models.Index(fields=["session", "student"]),
        ]

class PermissionRequestMessage(TimeStampedUUIDModel):
    warning = models.ForeignKey(
        AbsenceWarning,
        on_delete=models.CASCADE,
        related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_permission_messages"
    )
    message = models.TextField()
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]


class ClassSchedule(Attendance):
    class Meta:
        proxy = True
        verbose_name = "Class Schedule"
        verbose_name_plural = "Class Schedules"


class AttendanceRecord(Attendance):
    class Meta:
        proxy = True
        verbose_name = "Attendance Record"
        verbose_name_plural = "Attendance Records"

from django.db.models.signals import post_delete
from django.dispatch import receiver

@receiver(post_delete, sender=Attendance)
def delete_attendance_notifications(sender, instance, **kwargs):
    """
    When an Attendance session is deleted, remove any associated notifications
    so they don't linger on the student's dashboard.
    """
    from common.models import Notification
    action_url = f"/attendance/{instance.id}/"
    Notification.objects.filter(action_url=action_url).delete()

from django.db.models.signals import post_save

@receiver(post_save, sender=Attendance)
def cleanup_cancelled_attendance_warnings(sender, instance, created, **kwargs):
    """
    If a class is marked as CANCELLED, it didn't happen.
    """
    if instance.class_status in ["CANCELLED", "UNVERIFIED"]:
        # 1. Delete all AbsenceWarnings for this session
        from .models import AbsenceWarning
        AbsenceWarning.objects.filter(session=instance).delete()

        # 2. Delete all related Notifications
        from common.models import Notification
        action_url = f"/attendance/{instance.id}"
        Notification.objects.filter(action_url=action_url).delete()


@receiver(post_delete, sender=PriorPermission)
def revert_prior_permission_on_delete(sender, instance, **kwargs):
    """
    When a PriorPermission is deleted (revoked), revert the session JSON
    so admin UI reflects the change immediately.
    """
    import logging
    _logger = logging.getLogger(__name__)
    try:
        session = instance.session
        if session.google_meet_attendance_data and session.google_meet_attendance_data.get("status") == "READY":
            data = session.google_meet_attendance_data
            student_id = str(instance.student_id)
            if "expected_students" in data and student_id in data["expected_students"]:
                student_data = data["expected_students"][student_id]
                student_data["prior_permission"] = None
                if student_data.get("status") == "PRIOR_PERMISSION":
                    student_data["status"] = "ABSENT"
                session.google_meet_attendance_data = data
                session.save(update_fields=['google_meet_attendance_data'])
    except Exception as e:
        _logger.error(f"Error reverting session JSON after PriorPermission delete: {e}")

