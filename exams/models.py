from django.conf import settings
from django.db import models
import uuid

from common.models import TimeStampedUUIDModel


class Exam(TimeStampedUUIDModel):
    class Level(models.TextChoices):
        EASY = "EASY", "Easy"
        MEDIUM = "MEDIUM", "Medium"
        HARD = "HARD", "Hard"
        MIXED = "MIXED", "Mixed"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        SUBMITTED = "SUBMITTED", "Submitted"
        EVALUATED = "EVALUATED", "Evaluated"

    application = models.OneToOneField("applications.Application", on_delete=models.CASCADE, related_name="exam")
    level = models.CharField(max_length=20, choices=Level.choices, default=Level.MIXED)
    total_questions = models.PositiveIntegerField(default=10, help_text="Number of questions in the exam.")
    duration_minutes = models.PositiveIntegerField(default=45)
    pass_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    started_at = models.DateTimeField(blank=True, null=True)
    submitted_at = models.DateTimeField(blank=True, null=True)
    marks_obtained = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    total_marks = models.DecimalField(max_digits=8, decimal_places=2, default=10)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    qualified = models.BooleanField(blank=True, null=True)
    proctor_name = models.CharField("Proctor Name", max_length=150, blank=True, null=True)
    proctoring_enabled = models.BooleanField(
        default=True,
        help_text="Embed a live proctoring room in the internal exam interface.",
    )
    proctoring_required = models.BooleanField(
        default=True,
        help_text="Record a security warning whenever the live proctoring room disconnects.",
    )
    proctoring_room_count = models.PositiveSmallIntegerField(
        default=4,
        help_text="Number of persisted proctoring rooms used to distribute candidates.",
    )
    proctoring_capacity_per_room = models.PositiveSmallIntegerField(
        default=50,
        help_text="Operational planning limit; the video provider does not guarantee this capacity.",
    )

    class Meta:
        verbose_name = "Pre-Screening Exam Result"
        verbose_name_plural = "Pre-Screening Exam Results"

    def __str__(self):
        return f"Pre-Screening Exam Result for {self.application}"


class ManualExamination(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"

    title = models.CharField(max_length=255)
    course = models.ForeignKey("courses.Course", on_delete=models.PROTECT, related_name="manual_examinations")
    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.PROTECT, related_name="manual_examinations")
    question_bank = models.ForeignKey(
        "question_bank.QuestionBank",
        on_delete=models.PROTECT,
        related_name="manual_examinations",
        blank=True,
        null=True,
    )
    examination_date = models.DateField()
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    total_questions = models.PositiveIntegerField(default=0)
    maximum_marks = models.DecimalField(max_digits=8, decimal_places=2, default=100)
    pass_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    duration_minutes = models.PositiveIntegerField(default=0)
    examination_type = models.CharField(max_length=80, default="SCREENING")
    reference_link = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)

    class Meta:
        ordering = ("-examination_date", "-created_at")


class ManualExaminationResult(TimeStampedUUIDModel):
    examination = models.ForeignKey(ManualExamination, on_delete=models.CASCADE, related_name="results")
    application = models.ForeignKey("applications.Application", on_delete=models.CASCADE, related_name="manual_examination_results")
    marks_obtained = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    qualified = models.BooleanField(blank=True, null=True)
    completed = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("examination", "application"), name="unique_manual_exam_application"),
        ]
        ordering = ("application__student__student_code",)


class ExternalExamAttempt(TimeStampedUUIDModel):
    """Backend-owned audit record for an exam conducted on a separate platform."""

    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESULT_RECEIVED = "RESULT_RECEIVED", "Result Received"

    class IntegrityStatus(models.TextChoices):
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"

    exam = models.OneToOneField(
        Exam,
        on_delete=models.CASCADE,
        related_name="external_attempt",
    )
    launch_nonce = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.CREATED,
        db_index=True,
    )
    launched_at = models.DateTimeField(blank=True, null=True)
    started_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    result_received_at = models.DateTimeField(blank=True, null=True)
    result_event_id = models.CharField(max_length=120, unique=True, blank=True, null=True)
    result_payload_hash = models.CharField(max_length=64, blank=True)
    integrity_status = models.CharField(
        max_length=20,
        choices=IntegrityStatus.choices,
        blank=True,
        null=True,
    )
    proctoring_summary = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "External Exam Attempt"
        verbose_name_plural = "External Exam Attempts"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.exam.application.application_number} - {self.status}"


class InternalExamAttempt(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        SUBMITTED = "SUBMITTED", "Submitted"
        EXPIRED = "EXPIRED", "Expired"

    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="internal_attempts")
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="internal_attempts")
    start_time = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS, db_index=True)

    question_bank = models.ForeignKey(
        "question_bank.QuestionBank",
        on_delete=models.PROTECT,
        related_name="internal_exam_attempts",
        blank=True,
        null=True,
    )
    paper_set = models.CharField(max_length=10, blank=True, default="")
    question_snapshot = models.JSONField(
        default=list,
        blank=True,
        help_text="Immutable server-side copy of the assigned questions and answer key.",
    )
    proctoring_room = models.ForeignKey(
        "ExamProctoringRoom",
        on_delete=models.SET_NULL,
        related_name="attempts",
        blank=True,
        null=True,
    )
    proctoring_status = models.CharField(
        max_length=20,
        choices=[
            ("NOT_REQUIRED", "Not Required"),
            ("PENDING", "Pending"),
            ("CONNECTED", "Connected"),
            ("DISCONNECTED", "Disconnected"),
            ("FAILED", "Failed"),
        ],
        default="PENDING",
        db_index=True,
    )
    proctoring_connected_at = models.DateTimeField(blank=True, null=True)

    question_mapping = models.JSONField(default=list, help_text="List of original question IDs in randomized order.")
    option_mapping = models.JSONField(default=dict, help_text="Dict mapping original question ID to a list of option indices.")
    answers = models.JSONField(default=dict, blank=True)
    submission_time = models.DateTimeField(blank=True, null=True)

    class Meta:
        verbose_name = "Internal Exam Attempt"
        verbose_name_plural = "Internal Exam Attempts"
        constraints = [
            models.UniqueConstraint(
                fields=["student", "exam"],
                condition=models.Q(status="IN_PROGRESS"),
                name="unique_active_internal_attempt"
            )
        ]

    def __str__(self):
        return f"{self.student.student_code} - {self.exam.application.application_number} ({self.status})"


class ExamProctoringRoom(TimeStampedUUIDModel):
    """A server-assigned Jitsi room shared by one assessment window."""

    exam = models.ForeignKey(
        Exam,
        on_delete=models.SET_NULL,
        related_name="proctoring_rooms",
        blank=True,
        null=True,
        help_text="Exam used to configure this shared session; candidates may belong to other exams.",
    )
    question_bank = models.ForeignKey(
        "question_bank.QuestionBank",
        on_delete=models.CASCADE,
        related_name="proctoring_rooms",
    )
    scope_key = models.CharField(max_length=64, db_index=True)
    session_date = models.DateField(db_index=True)
    code = models.CharField(max_length=10)
    room_name = models.CharField(max_length=180, unique=True)
    room_password = models.CharField(max_length=180)
    capacity = models.PositiveSmallIntegerField(default=50)
    assigned_proctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_exam_proctoring_rooms",
        blank=True,
        null=True,
    )
    assigned_students = models.ManyToManyField(
        "students.StudentProfile",
        related_name="assigned_proctoring_rooms",
        blank=True,
        help_text=(
            "Candidates pre-assigned by an administrator. Assessment start "
            "honors this room before automatic balancing."
        ),
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("code",)
        constraints = [
            models.UniqueConstraint(
                fields=["scope_key", "code"],
                name="unique_exam_proctoring_scope_room_code",
            ),
        ]

    def __str__(self):
        return f"{self.question_bank.title} - {self.session_date} - Room {self.code}"


class ExamSecurityEvent(TimeStampedUUIDModel):
    attempt = models.ForeignKey(InternalExamAttempt, on_delete=models.CASCADE, related_name="security_events")
    timestamp = models.DateTimeField(auto_now_add=True)
    event_type = models.CharField(max_length=50)

    class Meta:
        ordering = ("-timestamp",)
        verbose_name = "Exam Security Event"
        verbose_name_plural = "Exam Security Events"


class ModuleTest(TimeStampedUUIDModel):
    title = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_module_tests"
    )
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="module_tests")
    cohort = models.ForeignKey(
        "cohorts.Cohort",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="module_tests",
        help_text="Optional cohort specific module test.",
    )
    module = models.ForeignKey(
        "courses.CourseModule",
        on_delete=models.SET_NULL,
        related_name="tests",
        blank=True,
        null=True,
    )
    description = models.TextField(blank=True, null=True)
    level = models.CharField(max_length=20, choices=Exam.Level.choices, default=Exam.Level.MIXED)
    total_questions = models.PositiveIntegerField(default=10, help_text="Number of questions in the module test.")
    duration_minutes = models.PositiveIntegerField(default=30)
    pass_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=60)
    question_bank = models.ForeignKey(
        "question_bank.QuestionBank",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_module_tests",
        help_text="Optional QuestionBank linked for automated evaluation.",
    )
    proctoring_enabled = models.BooleanField(
        default=False,
        help_text="Embed a persisted Jitsi room in this module test.",
    )
    proctoring_required = models.BooleanField(
        default=False,
        help_text="Require and audit the live proctoring connection for this test.",
    )
    proctoring_room_count = models.PositiveSmallIntegerField(
        default=4,
        help_text="Number of persisted rooms used to distribute module-test candidates.",
    )
    proctoring_capacity_per_room = models.PositiveSmallIntegerField(
        default=50,
        help_text="Operational planning limit per room.",
    )
    scheduled_at = models.DateTimeField(
        "Scheduled Start Time",
        blank=True,
        null=True,
        help_text="Start time of the module test window.",
    )
    end_time = models.DateTimeField(
        "Scheduled End Time",
        blank=True,
        null=True,
        help_text="End time of the module test window.",
    )
    meeting_link = models.URLField(
        blank=True,
        null=True,
        help_text="Google Meet URL generated for this course/cohort module-test window.",
    )
    calendar_event_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        db_index=True,
        help_text="Google Calendar event ID used to update this meeting without duplicates.",
    )
    is_released = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Admin releases this module test. Students can start only when released and within window.",
    )
    admin_started_at = models.DateTimeField(
        "Admin Started At",
        blank=True,
        null=True,
        help_text="Timestamp when a Platform Admin explicitly opens the test gate for students.",
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.course.name} - {self.title}"


class ModuleTestSubmission(TimeStampedUUIDModel):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        SUBMITTED = "SUBMITTED", "Submitted"
        EXPIRED = "EXPIRED", "Expired"
        MISSED = "MISSED", "Missed"

    class ResultSource(models.TextChoices):
        INTERNAL = "INTERNAL", "SURE ProEd examination platform"
        EXTERNAL = "EXTERNAL", "External examination platform"

    test = models.ForeignKey(ModuleTest, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="module_test_submissions")
    cohort = models.ForeignKey(
        "cohorts.Cohort",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="module_test_submissions",
        help_text="Associated student cohort.",
    )
    started_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    submitted_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
        db_index=True,
    )
    question_bank = models.ForeignKey(
        "question_bank.QuestionBank",
        on_delete=models.PROTECT,
        related_name="module_test_attempts",
        blank=True,
        null=True,
    )
    proctoring_room = models.ForeignKey(
        ExamProctoringRoom,
        on_delete=models.SET_NULL,
        related_name="module_test_submissions",
        blank=True,
        null=True,
    )
    proctoring_status = models.CharField(
        max_length=20,
        choices=[
            ("NOT_REQUIRED", "Not Required"),
            ("PENDING", "Pending"),
            ("CONNECTED", "Connected"),
            ("DISCONNECTED", "Disconnected"),
            ("FAILED", "Failed"),
        ],
        default="NOT_REQUIRED",
        db_index=True,
    )
    proctoring_connected_at = models.DateTimeField(blank=True, null=True)
    paper_set = models.CharField(max_length=10, blank=True, default="")
    question_snapshot = models.JSONField(
        default=list,
        blank=True,
        help_text="Immutable server-side copy of the assigned module-test paper.",
    )
    question_mapping = models.JSONField(default=list, blank=True)
    option_mapping = models.JSONField(default=dict, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    marks_obtained = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    total_marks = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    qualified = models.BooleanField(blank=True, null=True)
    result_source = models.CharField(
        max_length=20,
        choices=ResultSource.choices,
        default=ResultSource.INTERNAL,
        db_index=True,
    )
    result_event_id = models.CharField(max_length=120, unique=True, blank=True, null=True)
    result_payload_hash = models.CharField(max_length=64, blank=True)
    integrity_status = models.CharField(
        max_length=20,
        choices=[("PASSED", "Passed"), ("FAILED", "Failed")],
        blank=True,
        null=True,
    )
    proctoring_summary = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Module Test Submission"
        verbose_name_plural = "Module Test Submissions"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["test", "student"],
                name="unique_student_module_test_submission"
            )
        ]

    def __str__(self):
        return f"Submission by {self.student.student_code} for {self.test.title}"

    def save(self, *args, **kwargs):
        # Auto-resolve cohort if omitted
        if not self.cohort_id:
            if self.test and self.test.cohort_id:
                self.cohort = self.test.cohort
            elif self.student_id:
                try:
                    from applications.models import Application
                    app = Application.objects.filter(
                        student=self.student,
                        course=self.test.course if self.test_id else None,
                    ).order_by("-applied_at").first()
                    if not app:
                        app = Application.objects.filter(student=self.student).order_by("-applied_at").first()
                    if app and app.assigned_cohort_id:
                        self.cohort = app.assigned_cohort
                except Exception:
                    pass

        if self.total_marks and self.marks_obtained is not None and self.total_marks > 0:
            from decimal import Decimal
            self.percentage = round((Decimal(str(self.marks_obtained)) / Decimal(str(self.total_marks))) * Decimal("100"), 2)
            if self.test and self.test.pass_percentage is not None:
                self.qualified = self.percentage >= self.test.pass_percentage

        super().save(*args, **kwargs)

        # Automatic cohort suspension if student failed module test
        if self.qualified is False and self.student_id and self.status != self.Status.MISSED:
            try:
                from applications.models import Application
                from common.models import Notification
                from common.services.notifications import display_name, notify_user

                app = Application.objects.filter(
                    student=self.student,
                    course=self.test.course if self.test_id else None,
                ).order_by("-applied_at").first()

                if not app and self.student_id:
                    app = Application.objects.filter(student=self.student).order_by("-applied_at").first()

                if app and app.status != Application.Status.SUSPENDED:
                    test_title = self.test.title if self.test_id else "Module Test"
                    pass_pct = self.test.pass_percentage if (self.test_id and self.test.pass_percentage) else 60
                    score_pct = self.percentage if self.percentage is not None else 0
                    suspend_remark = f"[Auto-Suspended]: Failed Module Test '{test_title}' with score {score_pct}% (Pass required: {pass_pct}%)."
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
                                f"has been automatically suspended because your Module Test score ({score_pct}%) "
                                f"fell below the required pass percentage ({pass_pct}%). "
                                "Please contact your admin for cohort transfer or re-assessment options."
                            ),
                            notification_type=Notification.Type.WARNING,
                            action_url="application_tracker",
                            dedupe_key=f"application:{app.id}:autosuspended:{self.id}",
                        )
            except Exception:
                pass

        # Automatic cohort module advancement when a module test is qualified
        elif self.qualified is True:
            try:
                cohort = getattr(self, "cohort", None)
                if not cohort and getattr(self, "test", None) and getattr(self.test, "cohort_id", None):
                    cohort = self.test.cohort
                if not cohort and self.student_id:
                    from applications.models import Application
                    app = Application.objects.filter(
                        student=self.student,
                        course=self.test.course if self.test_id else None,
                    ).order_by("-applied_at").first()
                    if app and app.assigned_cohort:
                        cohort = app.assigned_cohort

                test = getattr(self, "test", None)
                test_mod = getattr(test, "module", None) if test else None
                if cohort and test_mod:
                    cur_mod = getattr(cohort, "current_module", None)
                    if cur_mod is None or str(cur_mod.id) == str(test_mod.id):
                        cohort.advance_to_next_module()
            except Exception:
                pass


class StartTest(Exam):
    """
    Administrative Proxy Model for the centralized 'Start Test Hub' in Django Admin under Other Administration.
    Allows administrators to schedule, manage, and bulk-release course pre-screening exams and cohort module tests.
    """
    class Meta:
        proxy = True
        verbose_name = "Start Test"
        verbose_name_plural = "Start Test Hub"
