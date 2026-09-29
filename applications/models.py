from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_delete
from django.dispatch import receiver

from common.models import TimeStampedUUIDModel
from common.storage import private_storage


def offer_letter_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
    app_num = instance.application_number or (str(instance.id) if instance.id else 'app')
    
    from django.utils import timezone
    year = str(timezone.now().year)
    
    course_code = instance.course.code if instance.course else "UNASSIGNED_COURSE"
    cohort_code = instance.assigned_cohort.code if instance.assigned_cohort else "UNASSIGNED_COHORT"
    
    return f"offer_letters/{year}/{course_code}/{cohort_code}/{app_num}_offer_letter.{ext}"


class Application(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        EXAM_PENDING = "EXAM_PENDING", "Exam Pending"
        EXAM_COMPLETED = "EXAM_COMPLETED", "Exam Completed"
        PRESCREENING_PENDING = "PRESCREENING_PENDING", "Pre-Screen Interview Pending"
        PRESCREENING_COMPLETED = "PRESCREENING_COMPLETED", "Pre-Screen Interview Completed"
        QUALIFIED = "QUALIFIED", "Qualified"
        REJECTED = "REJECTED", "Rejected"
        WAITLISTED = "WAITLISTED", "Waitlisted"
        COHORT_ASSIGNED = "COHORT_ASSIGNED", "Cohort Assigned"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        TRAINING = "TRAINING", "Training"
        INTERNSHIP_ASSIGNED = "INTERNSHIP_ASSIGNED", "Internship Assigned"
        SOFT_SKILLS = "SOFT_SKILLS", "Soft Skills"
        COMPLETED = "COMPLETED", "Completed"
        DROPPED = "DROPPED", "Dropped"
        SUSPENDED = "SUSPENDED", "Suspended"
        TRANSFER_COHORT = "TRANSFER_COHORT", "Transfer Cohort"
        CANCELLED = "CANCELLED", "Cancelled"

    class RoleVerificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending admin verification"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    class OfferLetterStatus(models.TextChoices):
        NOT_GENERATED = "NOT_GENERATED", "Not Generated"
        GENERATING = "GENERATING", "Generating"
        ISSUED = "ISSUED", "Issued"
        REVOKED = "REVOKED", "Revoked"
        FAILED = "FAILED", "Failed"

    application_number = models.CharField(max_length=100, unique=True)
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="applications")
    course = models.ForeignKey("courses.Course", on_delete=models.PROTECT, related_name="applications")
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.APPLIED, db_index=True)
    applied_at = models.DateTimeField(auto_now_add=True)
    assigned_cohort = models.ForeignKey(
        "cohorts.Cohort",
        on_delete=models.PROTECT,
        related_name="applications",
        blank=True,
        null=True,
    )
    qualified = models.BooleanField(blank=True, null=True)
    qualification_score = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    role_verification_status = models.CharField(
        max_length=20,
        choices=RoleVerificationStatus.choices,
        default=RoleVerificationStatus.PENDING,
        db_index=True,
    )
    role_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="verified_student_roles",
    )
    role_verified_at = models.DateTimeField(blank=True, null=True)
    role_verification_remarks = models.TextField(blank=True, null=True)
    completed_course = models.BooleanField(default=False)
    completed_at = models.DateTimeField(blank=True, null=True)
    final_score = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    is_admin_assigned = models.BooleanField(
        default=False,
        help_text="True if this application was directly placed by an Admin without typical pre-screening.",
    )
    offer_letter_file = models.FileField(upload_to=offer_letter_path, storage=private_storage, max_length=500, blank=True, null=True)
    offer_letter_issued = models.BooleanField(default=False)
    offer_letter_issued_at = models.DateTimeField(blank=True, null=True)
    offer_letter_hash = models.CharField(max_length=100, blank=True, null=True)
    
    # Google Meet Identity
    required_meet_display_name = models.CharField(max_length=255, blank=True, null=True)
    required_meet_display_name_normalized = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    
    # Revocation Lifecycle Fields
    offer_letter_status = models.CharField(
        max_length=20, 
        choices=OfferLetterStatus.choices, 
        default=OfferLetterStatus.NOT_GENERATED, 
        db_index=True
    )
    offer_letter_revoked_at = models.DateTimeField(blank=True, null=True)
    offer_letter_revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True, null=True,
        related_name="revoked_offer_letters"
    )
    offer_letter_revoke_reason = models.TextField(blank=True, null=True)
    training_batch = models.CharField(
        max_length=20,
        choices=[
            ("BATCH_1", "Batch 1"),
            ("BATCH_2", "Batch 2"),
            ("BATCH_3", "Batch 3"),
            ("BATCH_4", "Batch 4"),
        ],
        default="BATCH_1",
        blank=True,
        null=True,
        help_text="Assigned training batch for LST and Soft Skills training sessions.",
    )
    remarks = models.TextField(blank=True, null=True)
    whatsapp_joined = models.BooleanField(
        default=False, 
        help_text="True if the student has explicitly confirmed they joined the WhatsApp group."
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    ~Q(status__in=[
                        "COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING",
                        "INTERNSHIP_ASSIGNED", "COMPLETED", "SUSPENDED",
                        "TRANSFER_COHORT",
                    ])
                    | Q(assigned_cohort__isnull=False)
                ),
                name="cohort_status_requires_assigned_cohort",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(status="COMPLETED")
                    | (
                        Q(completed_course=True)
                        & Q(completed_at__isnull=False)
                        & Q(final_score__isnull=False)
                    )
                ),
                name="completed_status_requires_completion_evidence",
            ),
            models.UniqueConstraint(
                fields=["offer_letter_hash"],
                condition=models.Q(offer_letter_hash__isnull=False) & ~models.Q(offer_letter_hash=""),
                name="unique_active_offer_letter_hash",
            ),
            models.UniqueConstraint(
                fields=["assigned_cohort", "required_meet_display_name_normalized"],
                condition=models.Q(assigned_cohort__isnull=False) & models.Q(required_meet_display_name_normalized__isnull=False),
                name="unique_meet_name_per_cohort",
            ),
        ]

    def role_verification_blockers(self):
        blockers = []
        if self.qualified is not True and not getattr(self, "_admin_saving", False):
            blockers.append("A qualified screening result is required.")
        requires_interview = (
            self.assigned_cohort.requires_interview
            if getattr(self, "assigned_cohort", None) and hasattr(self.assigned_cohort, "requires_interview")
            else (getattr(self.course, "requires_interview", True) if getattr(self, "course", None) else True)
        )
        if requires_interview:
            if not getattr(self, "_inline_interview_passed", False) and not getattr(self, "_admin_saving", False):
                interview = None
                if self.pk:
                    try:
                        interview = self.pre_screening_interview
                    except Exception:
                        interview = None
                if interview is None or getattr(interview, "status", None) != PreScreeningInterview.Status.PASSED:
                    blockers.append("The required candidate interview must be passed.")
        if self.student_id and getattr(self, "student", None):
            if not getattr(self, "_admin_saving", False):
                if not getattr(self.student, "is_linkedin_connected", False):
                    blockers.append("LinkedIn must be verified.")
                if not (getattr(self.student, "is_github_connected", False) or (getattr(self.student, "github_url", "") or "").strip()):
                    blockers.append("GitHub must be connected.")
            user = getattr(self.student, "user", None)
            if user and getattr(user, "uses_reserved_staff_email", False):
                blockers.append("An @suretrust.local account cannot be verified as a student.")
        return blockers

    @property
    def is_student_role_verified(self):
        return bool(
            self.role_verification_status == self.RoleVerificationStatus.VERIFIED
            and not self.role_verification_blockers()
        )

    @property
    def current_module(self):
        """Returns the active module of the assigned cohort, if any."""
        cohort = getattr(self, "assigned_cohort", None)
        if cohort and getattr(cohort, "current_module", None):
            return cohort.current_module
        return None

    def get_dynamic_required_meet_name(self, prefer_google_profile=True):
        """
        Returns the student's actual connected Google Profile Name if available and preferred.
        Otherwise, falls back to generating the recommended format:
        <short recognizable student name> - <exact current cohort code> <authoritative course/domain code>
        """
        try:
            # 1. Prefer actual connected Google Profile Name
            if prefer_google_profile:
                g_id = getattr(self.student, 'google_identity', None)
                if g_id and getattr(g_id, 'is_verified', False) and getattr(g_id, 'google_profile_name', ''):
                    return g_id.google_profile_name

            # 2. Fallback generator
            first_name = self.student.user.first_name or ""
            last_name = self.student.user.last_name or ""
            first_name = first_name.strip()
            last_name = last_name.strip()

            if first_name and last_name:
                short_name = f"{first_name[0].upper()} {last_name.title()}"
            elif first_name:
                short_name = first_name.title()
            elif last_name:
                short_name = last_name.title()
            else:
                short_name = "Student"

            cohort_code = self.assigned_cohort.code if getattr(self, 'assigned_cohort', None) else ""

            course_code = ""
            if getattr(self, 'course', None):
                if hasattr(self.course, 'domain') and self.course.domain:
                    course_code = self.course.domain
                else:
                    course_code = getattr(self.course, 'code', "")

            parts = [short_name]
            if cohort_code or course_code:
                parts.append("-")
                if cohort_code:
                    parts.append(cohort_code)
                if course_code:
                    parts.append(course_code)

            return " ".join([p for p in parts if p]).strip()
        except Exception:
            # Fallback for unexpected absence of relations
            return self.required_meet_display_name or ""


    def clean(self):
        super().clean()
        errors = {}
        if self.assigned_cohort_id and self.course_id != self.assigned_cohort.course_id:
            errors["assigned_cohort"] = "The assigned cohort must belong to the application's course."
        if self.status in {
            self.Status.COHORT_ASSIGNED,
            self.Status.IN_PROGRESS,
            self.Status.TRAINING,
            self.Status.INTERNSHIP_ASSIGNED,
            self.Status.COMPLETED,
            self.Status.SUSPENDED,
            self.Status.TRANSFER_COHORT,
        } and not self.assigned_cohort_id:
            errors["assigned_cohort"] = "Select a cohort before using an enrolled lifecycle status."
        if self.status == self.Status.COMPLETED:
            if not self.completed_course:
                errors["completed_course"] = "A completed application must record course completion."
            if not self.completed_at:
                errors["completed_at"] = "A completed application must record its completion time."
            if self.final_score is None:
                errors["final_score"] = "A completed application must record a final score."
        if self.role_verification_status == self.RoleVerificationStatus.VERIFIED:
            blockers = self.role_verification_blockers()
            if blockers:
                errors["role_verification_status"] = " ".join(blockers)
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        from cohorts.models import Cohort

        # Determine best cohort code for application number upon initial creation
        if not self.application_number:
            self.application_number = generate_application_number(self.course, self.assigned_cohort)

        # Delete a replaced file only after the database transaction commits.
        # Deleting it before saving the row can permanently lose the previously
        # issued document if the database write later fails.
        old_file = None
        if self.pk:
            old_instance = Application.objects.filter(pk=self.pk).first()
            if old_instance and old_instance.offer_letter_file and self.offer_letter_file != old_instance.offer_letter_file:
                old_file = (
                    old_instance.offer_letter_file.storage,
                    old_instance.offer_letter_file.name,
                )

        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"application_number"}

        super().save(*args, **kwargs)
        if old_file:
            from django.db import transaction

            storage, name = old_file

            def delete_replaced_file():
                try:
                    if storage.exists(name):
                        storage.delete(name)
                except Exception:
                    pass

            transaction.on_commit(delete_replaced_file)

    def __str__(self):
        return str(self.application_number)


@receiver(post_delete, sender=Application)
def auto_delete_application_offer_letter(sender, instance, **kwargs):
    if instance.offer_letter_file:
        from django.db import transaction

        storage = instance.offer_letter_file.storage
        name = instance.offer_letter_file.name

        def delete_application_file():
            try:
                if storage.exists(name):
                    storage.delete(name)
            except Exception:
                pass

        transaction.on_commit(delete_application_file)



def generate_application_number(course=None, cohort=None):
    from django.utils import timezone
    import re
    import uuid
    from cohorts.models import Cohort

    current_year = timezone.now().year
    hex_suffix = uuid.uuid4().hex[:6].upper()

    # Auto-resolve cohort from the course's currently open cohort if not explicitly provided
    if not cohort and course:
        cohort = course.cohorts.filter(status=Cohort.Status.OPEN).order_by("-created_at").first()

    # Constant category code: MED (Medical), NMED (Non-Medical)
    category_code = "NMED"
    if course and getattr(course, "category", None) == "Medical":
        category_code = "MED"

    # Course code (cleaned alphanumeric)
    course_code = "GEN"
    if course and getattr(course, "code", None):
        course_code = re.sub(r'[^A-Z0-9]', '', str(course.code).upper())[:8] or "GEN"

    # Cohort code (cleaned alphanumeric)
    cohort_code = "PENDING"
    if cohort and getattr(cohort, "code", None):
        cohort_code = re.sub(r'[^A-Z0-9]', '', str(cohort.code).upper())[:10] or "PENDING"

    count = Application.objects.count() + 1
    app_num = f"APP-{current_year}-{count:05d}-{hex_suffix}-{category_code}-{course_code}-{cohort_code}"

    while Application.objects.filter(application_number=app_num).exists():
        count += 1
        hex_suffix = uuid.uuid4().hex[:6].upper()
        app_num = f"APP-{current_year}-{count:05d}-{hex_suffix}-{category_code}-{course_code}-{cohort_code}"

    return app_num


class PreScreening(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        RESCHEDULED = "RESCHEDULED", "Rescheduled"
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"

    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name="pre_screening")
    question_bank = models.ForeignKey(
        "question_bank.QuestionBank",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="screening_schedules",
        help_text="Approved, open pre-screening question bank assigned to this candidate.",
    )
    paper_set = models.CharField(
        "Assigned Paper Set",
        max_length=10,
        blank=True,
        default="",
        help_text="Paper code from the selected question bank, for example A, B, C, or D.",
    )
    interviewer = models.CharField("Examiner", max_length=150, blank=True, null=True)
    scheduled_at = models.DateTimeField("Start Time", blank=True, null=True)
    end_time = models.DateTimeField("End Time", blank=True, null=True, help_text="Exam schedule window end time.")
    meeting_link = models.URLField(blank=True, null=True)
    calendar_event_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Google Calendar event ID for this screening meeting.",
    )
    is_released = models.BooleanField(
        default=False,
        db_index=True,
        help_text=(
            "Admin manually releases this exam. "
            "The student Start button is locked until this is True "
            "AND the current time is within scheduled_at -> end_time."
        ),
    )
    admin_started_at = models.DateTimeField(
        "Admin Started At",
        blank=True,
        null=True,
        help_text="Timestamp when a Platform Admin explicitly opens the pre-screening exam gate for students.",
    )
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Screening Exam Schedule"
        verbose_name_plural = "Screening Exam Schedules"

    def save(self, *args, **kwargs):
        if self.scheduled_at and self.end_time and not self.meeting_link and getattr(self, "application", None):
            try:
                from applications.services.google_meet_screening import resolve_or_create_prescreening_google_meet
                resolve_or_create_prescreening_google_meet(self, sync_cohort_students=True)
            except Exception:
                pass
        super().save(*args, **kwargs)
        if self.application:
            try:
                from exams.models import Exam
                bank_obj = getattr(self, "question_bank", None)
                total_q = getattr(bank_obj, "total_questions_per_set", 10) or 10
                Exam.objects.get_or_create(
                    application=self.application,
                    defaults={
                        "total_questions": total_q or 10,
                        "duration_minutes": 45,
                        "pass_percentage": 40,
                        "level": Exam.Level.MIXED,
                        "status": Exam.Status.PENDING,
                    },
                )
            except Exception:
                pass
            from applications.services.state_machine import transition_application_status
            if self.status in {self.Status.SCHEDULED, self.Status.RESCHEDULED}:
                if self.application.status == Application.Status.APPLIED:
                    try:
                        transition_application_status(
                            self.application,
                            Application.Status.EXAM_PENDING,
                            reason="Screening exam scheduled",
                        )
                    except Exception:
                        pass
            elif self.status == self.Status.PASSED:
                if self.application.status in {Application.Status.APPLIED, Application.Status.EXAM_PENDING}:
                    try:
                        transition_application_status(
                            self.application,
                            Application.Status.EXAM_COMPLETED,
                            reason="Screening exam passed",
                        )
                    except Exception:
                        pass
            elif self.status == self.Status.FAILED:
                if self.application.status in {Application.Status.APPLIED, Application.Status.EXAM_PENDING}:
                    try:
                        transition_application_status(
                            self.application,
                            Application.Status.EXAM_FAILED,
                            reason="Screening exam failed",
                        )
                    except Exception:
                        pass


class PreScreeningInterview(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        RESCHEDULED = "RESCHEDULED", "Rescheduled"
        COMPLETED = "COMPLETED", "Completed"
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"

    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name="pre_screening_interview")
    interviewer = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="conducted_interviews"
    )
    scheduled_at = models.DateTimeField("Start Time", blank=True, null=True)
    end_time = models.DateTimeField("End Time", blank=True, null=True, help_text="Interview schedule window end time.")
    meeting_link = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    feedback = models.TextField(blank=True, null=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)

    class Meta:
        verbose_name = "Candidate Interview"
        verbose_name_plural = "Candidate Interviews"

    def __str__(self):
        return f"Interview for {self.application.application_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.application:
            from applications.services.state_machine import transition_application_status
            if self.status in {self.Status.SCHEDULED, self.Status.RESCHEDULED}:
                if self.application.status in {
                    Application.Status.APPLIED,
                    Application.Status.EXAM_PENDING,
                    Application.Status.EXAM_COMPLETED,
                }:
                    try:
                        transition_application_status(
                            self.application,
                            Application.Status.PRESCREENING_PENDING,
                            reason="Candidate interview scheduled",
                        )
                    except Exception:
                        pass
            elif self.status == self.Status.PASSED:
                if self.application.status in {
                    Application.Status.APPLIED,
                    Application.Status.EXAM_PENDING,
                    Application.Status.EXAM_COMPLETED,
                    Application.Status.PRESCREENING_PENDING,
                }:
                    try:
                        transition_application_status(
                            self.application,
                            Application.Status.PRESCREENING_COMPLETED,
                            reason="Candidate interview passed",
                        )
                    except Exception:
                        pass


def community_evidence_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
    app_num = getattr(instance.application, 'application_number', 'community') if getattr(instance, 'application', None) else 'community'
    import uuid
    unique_id = uuid.uuid4().hex[:8]
    return f"journey/community/{app_num}_evidence_{unique_id}.{ext}"


class CommunityActivity(TimeStampedUUIDModel):
    """Evidence-backed social responsibility activity for one student journey."""

    class ActivityType(models.TextChoices):
        TREE_PLANTATION = "TREE_PLANTATION", "Tree Plantation"
        BLOOD_DONATION = "BLOOD_DONATION", "Blood Donation"
        HELPING_SOCIETY = "HELPING_SOCIETY", "Helping Society"
        BLOG = "BLOG", "Tech Blog Post"
        OPEN_SOURCE = "OPEN_SOURCE", "Open Source Contribution"
        MEETUP = "MEETUP", "Tech Meetup / Webinar"
        VOLUNTEER = "VOLUNTEER", "Community Volunteering"
        OTHER = "OTHER", "Other Activity"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Verification"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="community_activities")
    activity_type = models.CharField(max_length=30, choices=ActivityType.choices, db_index=True)
    title = models.CharField(max_length=255)
    activity_date = models.DateField()
    description = models.TextField(blank=True, null=True)
    evidence_url = models.URLField(max_length=500, blank=True, null=True)
    evidence_file = models.FileField(upload_to=community_evidence_path, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="verified_community_activities",
        blank=True,
        null=True,
    )
    verified_at = models.DateTimeField(blank=True, null=True)
    verification_remarks = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-activity_date", "-created_at"]
        indexes = [
            models.Index(fields=["application", "activity_type", "status"]),
        ]

    def __str__(self):
        return f"{self.application.application_number} - {self.get_activity_type_display()}"


class ApplicationStatusAudit(TimeStampedUUIDModel):
    """Audit log tracking every status transition of an application."""
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="status_audits")
    from_status = models.CharField(max_length=30)
    to_status = models.CharField(max_length=30)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    reason = models.TextField(blank=True, default="")
    is_repair = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Application Status Audit"
        verbose_name_plural = "Application Status Audits"

    def __str__(self):
        return f"{self.application.application_number}: {self.from_status} -> {self.to_status}"
