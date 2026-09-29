from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel


class Assignment(TimeStampedUUIDModel):
    class AssignmentType(models.TextChoices):
        CODING = "CODING", "Coding"
        PROJECT = "PROJECT", "Project"
        CAPSTONE = "CAPSTONE", "Capstone"
        REPORT = "REPORT", "Report"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        CLOSED = "CLOSED", "Closed"

    cohort = models.ForeignKey("cohorts.Cohort", on_delete=models.CASCADE, related_name="assignments")
    module = models.ForeignKey(
        "courses.CourseModule",
        on_delete=models.SET_NULL,
        related_name="assignments",
        blank=True,
        null=True,
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    assignment_type = models.CharField(max_length=20, choices=AssignmentType.choices, default=AssignmentType.CODING)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_assignments",
        blank=True,
        null=True,
        help_text="Creator attribution is cleared if the user account is deleted.",
    )
    begin_date = models.DateTimeField()
    deadline = models.DateTimeField()
    max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=100)
    pass_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=60)
    files = models.JSONField(default=list, blank=True)
    allow_late_submissions = models.BooleanField(default=False)
    autograding_enabled = models.BooleanField(
        default=False,
        help_text="Run a server-side, non-executing source review for GitHub submissions.",
    )
    autograding_rubric = models.TextField(
        blank=True,
        help_text="Course-neutral assessment criteria supplied to the automated reviewer.",
    )
    elective = models.ForeignKey(
        "courses.Course",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="capstone_projects",
        help_text=(
            "For Capstone assignments: the elective course this project is scoped to. "
            "When set, only students whose Application course matches this elective "
            "will see and be able to submit this capstone. Leave blank to make the "
            "capstone available to all students in the cohort."
        ),
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        errors = {}
        if self.cohort_id and self.module_id:
            cohort_course_id = getattr(self.cohort, "course_id", None)
            module_course_id = getattr(self.module, "course_id", None)
            if cohort_course_id and module_course_id and cohort_course_id != module_course_id:
                cohort_course_code = getattr(self.cohort.course, "code", "")
                module_course_code = getattr(self.module.course, "code", "")
                errors["module"] = (
                    f"Selected module belongs to course '{module_course_code}', but cohort '{self.cohort.code}' "
                    f"belongs to course '{cohort_course_code}'. Please choose a module from course '{cohort_course_code}'."
                )
        if self.begin_date and self.deadline and self.deadline <= self.begin_date:
            errors["deadline"] = "Deadline must be after the begin date."
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.title


class Submission(TimeStampedUUIDModel):
    class AutoGradingStatus(models.TextChoices):
        NOT_REQUESTED = "NOT_REQUESTED", "Not requested"
        QUEUED = "QUEUED", "Queued"
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="submissions")
    submission_text = models.TextField(blank=True, null=True)
    submission_url = models.URLField(blank=True, null=True)
    commit_sha = models.CharField(
        max_length=40,
        blank=True,
        help_text="Immutable 40-character Git commit used for reproducible review.",
    )
    files = models.JSONField(default=list, blank=True)
    submitted_at = models.DateTimeField()
    is_late = models.BooleanField(default=False)
    resubmission_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of times this assignment was resubmitted.",
    )
    resubmission_requested = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Set by mentor or admin when the student is asked to resubmit.",
    )
    resubmission_remarks = models.TextField(
        blank=True,
        null=True,
        help_text="Mentor instructions or reasons for requesting a resubmission.",
    )
    evaluated = models.BooleanField(default=False, db_index=True)
    evaluated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="evaluated_submissions",
        blank=True,
        null=True,
    )
    evaluated_at = models.DateTimeField(blank=True, null=True)
    marks_obtained = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    passed = models.BooleanField(blank=True, null=True)
    feedback = models.TextField(blank=True, null=True)
    autograding_status = models.CharField(
        max_length=20,
        choices=AutoGradingStatus.choices,
        default=AutoGradingStatus.NOT_REQUESTED,
        db_index=True,
    )
    auto_marks = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    auto_feedback = models.TextField(blank=True)
    auto_report = models.JSONField(default=dict, blank=True)
    auto_graded_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["assignment", "student"], name="unique_assignment_student_submission")
        ]

    def __str__(self):
        return f"{self.assignment} - {self.student}"


class CapstoneProject(Assignment):
    """Admin/API-compatible view of assignments that represent final capstones."""

    class Meta:
        proxy = True
        verbose_name = "Capstone Project"
        verbose_name_plural = "Capstone Projects"


class CapstoneSubmission(Submission):
    """Dedicated admin view of submissions made against capstone projects."""

    class Meta:
        proxy = True
        verbose_name = "Capstone Submission"
        verbose_name_plural = "Capstone Submissions"
