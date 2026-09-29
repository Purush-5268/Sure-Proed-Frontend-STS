from django.db import models
from django.conf import settings
from common.models import TimeStampedUUIDModel

class Training(TimeStampedUUIDModel):
    class TrainingType(models.TextChoices):
        LST = "LST", "Life Skills Training"
        SOFT_SKILLS = "SOFT_SKILLS", "Soft Skills Training"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    training_type = models.CharField(max_length=20, choices=TrainingType.choices, default=TrainingType.LST, db_index=True)
    duration_hours = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.title

class TrainingSession(TimeStampedUUIDModel):
    training = models.ForeignKey(Training, on_delete=models.CASCADE, related_name="sessions")
    cohort = models.ForeignKey(
        "cohorts.Cohort",
        on_delete=models.CASCADE,
        related_name="training_sessions",
        blank=True,
        null=True,
        help_text="Leave empty only when the session is shared across every active cohort.",
    )
    title = models.CharField(max_length=255)
    session_date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField(blank=True, null=True)
    meeting_link = models.URLField(blank=True, null=True)
    recording_link = models.URLField(blank=True, null=True)
    conducted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="conducted_training_sessions")
    calendar_event_id = models.CharField(max_length=255, blank=True, null=True)
    class_status = models.CharField(
        max_length=20,
        choices=[
            ("SCHEDULED", "Scheduled"),
            ("COMPLETED", "Completed"),
            ("RESCHEDULED", "Rescheduled"),
            ("CANCELLED", "Cancelled"),
        ],
        default="SCHEDULED",
        db_index=True,
    )
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.training.title} - {self.title}"

class TrainingAttendance(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        EXCUSED = "EXCUSED", "Excused"

    session = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name="attendances")
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="training_attendances")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PRESENT, db_index=True)
    remarks = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.student.student_code} - {self.session.title} - {self.status}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

        # Automatic cohort suspension if student failed to join/attend scheduled training (ABSENT)
        if self.status == self.Status.ABSENT and self.student_id:
            try:
                from applications.models import Application
                from common.models import Notification
                from common.services.notifications import display_name, notify_user

                cohort = self.session.cohort if self.session_id else None
                if cohort:
                    app = Application.objects.filter(
                        student=self.student,
                        assigned_cohort=cohort,
                    ).order_by("-applied_at").first()
                else:
                    app = None

                if not app:
                    app = Application.objects.filter(
                        student=self.student,
                        status__in=[Application.Status.COHORT_ASSIGNED, Application.Status.QUALIFIED],
                    ).order_by("-applied_at").first()

                if app and app.status != Application.Status.SUSPENDED:
                    session_title = self.session.title if self.session_id else "Scheduled Training"
                    session_date = self.session.session_date if (self.session_id and self.session.session_date) else ""
                    suspend_remark = f"[Auto-Suspended]: Absent / Failed to attend scheduled training '{session_title}' ({session_date})."
                    app.remarks = f"{app.remarks or ''}\n{suspend_remark}".strip()
                    app.save(update_fields=["remarks", "updated_at"])
                    from applications.services.state_machine import transition_application_status
                    try:
                        transition_application_status(
                            app,
                            Application.Status.SUSPENDED,
                            reason=suspend_remark,
                        )
                    except Exception:
                        pass

                    if getattr(self.student, "user_id", None):
                        user = self.student.user
                        notify_user(
                            user,
                            title="Cohort access suspended",
                            message=(
                                f"Hi {display_name(user)}, your cohort status for {app.course.name} "
                                f"has been automatically suspended because you failed to attend the scheduled training "
                                f"'{session_title}'. Please contact your admin for reinstatement or cohort transfer options."
                            ),
                            notification_type=Notification.Type.WARNING,
                            action_url="application_tracker",
                            dedupe_key=f"application:{app.id}:absent_training:{self.id}",
                        )
            except Exception:
                pass


class TrainingAbsenteeManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status=TrainingAttendance.Status.ABSENT)


class TrainingAbsentee(TrainingAttendance):
    objects = TrainingAbsenteeManager()

    class Meta:
        proxy = True
        verbose_name = "Training Absentee"
        verbose_name_plural = "Training Absentees"


from cohorts.models import Cohort


class TrainingBatchDivisionManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status__in=[Cohort.Status.ACTIVE, Cohort.Status.OPEN])


class TrainingBatchDivision(Cohort):
    objects = TrainingBatchDivisionManager()

    class Meta:
        proxy = True
        verbose_name = "Training Batch Division"
        verbose_name_plural = "Training Batch Divisions"
