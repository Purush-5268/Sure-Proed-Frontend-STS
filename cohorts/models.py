from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedUUIDModel


class Cohort(TimeStampedUUIDModel):
    GITHUB_REPOSITORY_GRACE_DAYS = 15

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        OPEN = "OPEN", "Open"
        ACTIVE = "ACTIVE", "Active"
        TRAINING = "TRAINING", "Training"
        INTERNSHIP = "INTERNSHIP", "Internship"
        SOFT_SKILLS = "SOFT_SKILLS", "Soft Skills"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    code = models.CharField(
        max_length=30,
        help_text="Batch code. It must be unique within the selected course.",
    )
    name = models.CharField(max_length=150, blank=True, null=True, help_text="Optional. Auto-generated from Cohort Code and Course Code if left blank.")
    course = models.ForeignKey("courses.Course", on_delete=models.PROTECT, related_name="cohorts")
    start_date = models.DateField()
    end_date = models.DateField()
    mentors = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="mentored_cohorts", blank=True)

    current_mentors = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="current_mentored_cohorts_plural", blank=True)
    volunteers = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="volunteered_cohorts", blank=True)
    max_students = models.PositiveIntegerField(default=30)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    training_started_at = models.DateTimeField(
        blank=True,
        null=True,
        editable=False,
        help_text="Recorded automatically the first time the cohort enters Training status.",
    )
    github_repositories_last_provisioned_at = models.DateTimeField(
        blank=True,
        null=True,
        editable=False,
        help_text="Most recent completed manual GitHub repository provisioning run.",
    )
    lst_batch = models.CharField(
        max_length=20,
        choices=[("BATCH_1", "Batch 1"), ("BATCH_2", "Batch 2")],
        blank=True,
        null=True,
        help_text="LST Batch assignment for this entire cohort."
    )
    current_module = models.ForeignKey(
        "courses.CourseModule",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="active_cohorts",
        help_text="The module the cohort is currently on. Used to highlight the active module test.",
    )
    meeting_link = models.URLField(blank=True, null=True)
    whatsapp_group_link = models.URLField(blank=True, null=True, help_text="WhatsApp Group Link for the cohort.")
    rules_and_regulations = models.TextField(blank=True, null=True, help_text="Cohort-specific rules and regulations.")
    default_screening_at = models.DateTimeField(
        "Default pre-screen exam date and time",
        blank=True,
        null=True,
        db_index=True,
        help_text=(
            "Optional. When new applications are assigned to this cohort, they automatically receive this screening schedule. "
            "Leave empty to schedule applications manually."
        ),
    )
    application_end_date = models.DateTimeField(
        "Application End Date",
        blank=True,
        null=True,
        db_index=True,
        help_text="Deadline for submitting new applications to this cohort. If null, there is no deadline.",
    )
    requires_interview = models.BooleanField(
        default=True,
        db_index=True,
        help_text=(
            "If disabled for this cohort, qualified candidates skip the interview stage and proceed "
            "directly to student role verification and cohort onboarding."
        ),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_cohorts",
        blank=True,
        null=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("course", "code"),
                name="unique_course_cohort_code",
            ),
        ]

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        from courses.models import Course

        is_new = not self.pk or (getattr(self, "_state", None) and self._state.adding)
        if is_new:
            course = getattr(self, "course", None)
            if course and getattr(course, "status", None) != Course.Status.PUBLISHED:
                raise ValidationError({
                    "course": f"A new cohort can only be created for a Published course (Current course status: {course.status})."
                })

        if not self.name:
            course_code = None
            try:
                if self.course:
                    course_code = getattr(self.course, "code", None)
            except Exception:
                pass
            if course_code:
                self.name = f"{self.code} - {course_code}"
            else:
                self.name = str(self.code or "")

    def save(self, *args, **kwargs):
        if not self.name:
            course_code = None
            try:
                if self.course:
                    course_code = getattr(self.course, "code", None)
            except Exception:
                pass
            if course_code:
                self.name = f"{self.code} - {course_code}"
            else:
                self.name = str(self.code or "")
        old_status = None
        old_whatsapp_link = None
        if self.pk:
            old_data = Cohort.objects.filter(pk=self.pk).values("status", "whatsapp_group_link").first()
            if old_data:
                old_status = old_data["status"]
                old_whatsapp_link = old_data["whatsapp_group_link"]

        entering_training = self.status == self.Status.TRAINING and self.training_started_at is None
        if entering_training:
            self.training_started_at = timezone.now()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = set(update_fields) | {"training_started_at"}
        
        super().save(*args, **kwargs)

        if old_status and old_status != self.status:
            from cohorts.services import sync_cohort_applications_status
            sync_cohort_applications_status(self, self.status)

        if old_whatsapp_link is not None and old_whatsapp_link != self.whatsapp_group_link:
            self.applications.update(whatsapp_joined=False)

    @property
    def github_repository_eligible_at(self):
        if not self.training_started_at:
            return None
        return self.training_started_at + timedelta(days=self.GITHUB_REPOSITORY_GRACE_DAYS)

    @property
    def can_provision_github_repositories(self):
        eligible_at = self.github_repository_eligible_at
        return bool(
            self.status == self.Status.TRAINING
            and eligible_at
            and timezone.now() >= eligible_at
        )

    def get_next_module(self):
        """
        Returns the next active module in course sequence according to ('order', 'module_number').
        If current_module is None, returns the first module of the course.
        If current_module is the last module, returns None.
        """
        if not self.course_id:
            return None
        from courses.models import CourseModule
        modules_qs = CourseModule.objects.filter(course_id=self.course_id, is_active=True).order_by("order", "module_number")
        if not self.current_module_id:
            return modules_qs.first()

        cur = self.current_module
        if not cur:
            return modules_qs.first()

        next_mod = modules_qs.filter(
            models.Q(order__gt=cur.order) | (models.Q(order=cur.order) & models.Q(module_number__gt=cur.module_number))
        ).first()
        return next_mod

    def advance_to_next_module(self):
        """
        Advances this cohort to the next module in course sequence.
        Returns the newly set CourseModule, or None if already at the final module.
        """
        next_mod = self.get_next_module()
        if next_mod and (not self.current_module_id or str(next_mod.id) != str(self.current_module_id)):
            self.current_module = next_mod
            self.save(update_fields=["current_module", "updated_at"])
            return next_mod
        return None

    def __str__(self):
        course_code = None
        try:
            if self.course:
                course_code = getattr(self.course, "code", None)
        except Exception:
            pass
        return f"{self.code} ({course_code})" if course_code else str(self.code)


class GitHubProvisioningQueue(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"
        SKIPPED_NO_GITHUB = "SKIPPED_NO_GITHUB", "Skipped (No GitHub Username)"

    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.CASCADE, related_name="github_queue_items")
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="github_queue_items")
    github_username = models.CharField(max_length=100, blank=True, null=True)
    repo_name = models.CharField(max_length=150)
    repo_url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.PENDING, db_index=True)
    error_message = models.TextField(blank=True, null=True)
    retry_count = models.PositiveIntegerField(default=0)
    last_attempted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "GitHub Provisioning Queue Item"
        verbose_name_plural = "GitHub Provisioning Queue"

    def __str__(self):
        return f"{self.student} - {self.repo_name} [{self.status}]"
