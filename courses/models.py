from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel


class Course(TimeStampedUUIDModel):
    class Category(models.TextChoices):
        MEDICAL = "Medical", "Medical"
        NON_MEDICAL = "Non-Medical", "Non-Medical"

    class Difficulty(models.TextChoices):
        BEGINNER = "BEGINNER", "Beginner"
        INTERMEDIATE = "INTERMEDIATE", "Intermediate"
        ADVANCED = "ADVANCED", "Advanced"

    class ExamLevel(models.TextChoices):
        EASY = "EASY", "Easy"
        MEDIUM = "MEDIUM", "Medium"
        HARD = "HARD", "Hard"
        MIXED = "MIXED", "Mixed"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        ARCHIVED = "ARCHIVED", "Archived"
        CANCELLED = "CANCELLED", "Cancelled"

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=30, choices=Category.choices, default=Category.NON_MEDICAL, db_index=True)
    domain = models.CharField(max_length=150)
    subject = models.CharField(max_length=150, blank=True, null=True)
    description = models.TextField()
    curriculum = models.JSONField(default=list, blank=True)
    curriculum_file = models.FileField(upload_to="courses/curriculum/", blank=True, null=True)
    prerequisites = models.TextField(blank=True, null=True)
    course_prerequisites = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            'Structured list of prerequisite topics for AI question generation. '
            'Example: ["C Programming", "Digital Electronics", "Basic Electronics"]'
        ),
    )
    eligibility_criteria = models.TextField(
        blank=True,
        null=True,
        help_text="Custom eligibility criteria configured by Admin. Defaults to prerequisites if not specified.",
    )
    duration_weeks = models.PositiveIntegerField(default=4)
    difficulty = models.CharField(max_length=20, choices=Difficulty.choices, default=Difficulty.BEGINNER)
    minimum_attendance_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=75)
    minimum_assignment_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=60)
    default_screening_at = models.DateTimeField(
        "Default pre-screen exam date and time",
        blank=True,
        null=True,
        db_index=True,
        help_text=(
            "Optional. New applications automatically receive this screening schedule. "
            "Leave empty to schedule each application manually later."
        ),
    )
    requires_interview = models.BooleanField(
        default=True,
        db_index=True,
        help_text=(
            "If disabled, qualified candidates skip the interview stage and can proceed "
            "to professional-profile verification and cohort assignment."
        ),
    )
    requires_assignments = models.BooleanField(
        default=True,
        help_text="Whether regular assignments are required for completion.",
    )
    requires_module_tests = models.BooleanField(
        default=True,
        help_text="Whether module tests are required for completion.",
    )
    requires_capstone = models.BooleanField(
        default=True,
        help_text="Whether capstone project is required for completion.",
    )
    requires_tree_plantation = models.BooleanField(
        default=True,
        help_text="Whether verified tree plantation evidence is required for completion.",
    )
    requires_social_activity = models.BooleanField(
        default=True,
        help_text="Whether verified social responsibility activity evidence is required for completion.",
    )
    requires_soft_skills_training = models.BooleanField(
        default=True,
        help_text="Whether Soft Skills training attendance is required for completion.",
    )
    requires_lst_training = models.BooleanField(
        default=True,
        help_text="Whether Life Skills Training (LST) attendance is required for completion.",
    )
    exam_total_questions = models.PositiveIntegerField(
        default=10,
        help_text="Default number of questions for pre-screening exams.",
    )
    exam_difficulty = models.CharField(
        max_length=20,
        choices=ExamLevel.choices,
        default=ExamLevel.MIXED,
        help_text="Default difficulty level for pre-screening exams.",
    )
    exam_duration_minutes = models.PositiveIntegerField(
        default=45,
        help_text="Default duration in minutes for pre-screening exams.",
    )
    exam_pass_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=60,
        help_text="Default pass percentage required for pre-screening exams.",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    is_elective = models.BooleanField(
        default=False,
        help_text="Designates whether this course can be taken as an elective course.",
    )
    electives = models.ManyToManyField(
        "self",
        blank=True,
        symmetrical=False,
        related_name="primary_courses",
        help_text="Select courses that are offered as electives for students enrolled in this course.",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="approved_courses",
        blank=True,
        null=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_courses",
        blank=True,
        null=True,
    )

    def save(self, *args, **kwargs):
        if not self.code and self.name:
            import re
            clean_name = re.sub(r'[^A-Z0-9\s]', '', self.name.upper()).strip()
            words = clean_name.split()
            if len(words) >= 2:
                code_base = f"{words[0][:4]}-{words[1][:4]}"
            elif len(words) == 1:
                code_base = words[0][:8]
            else:
                code_base = "CRS"
            
            cat_prefix = "MED" if self.category == "Medical" else "NMED"
            base_code = f"{cat_prefix}-{code_base}"
            count = 1
            while Course.objects.filter(code=code).exclude(pk=self.pk).exists():
                code = f"{base_code}-{count}"
                count += 1
            self.code = code

        old_status = None
        if self.pk:
            old_status = Course.objects.filter(pk=self.pk).values_list("status", flat=True).first()

        if not self.eligibility_criteria and self.prerequisites:
            self.eligibility_criteria = self.prerequisites
        super().save(*args, **kwargs)

        if old_status != Course.Status.CANCELLED and self.status == Course.Status.CANCELLED:
            from .services import handle_course_cancellation
            handle_course_cancellation(self)

    def __str__(self):
        if self.code:
            return f"[{self.code}] {self.name}"
        return self.name

class CourseModule(TimeStampedUUIDModel):
    """A real, orderable module in a course curriculum."""

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    module_number = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    topics = models.JSONField(default=list, blank=True)
    duration_weeks = models.PositiveIntegerField(default=1)
    order = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("order", "module_number")
        constraints = [
            models.UniqueConstraint(fields=("course", "module_number"), name="unique_course_module_number"),
            models.UniqueConstraint(fields=("course", "order"), name="unique_course_module_order"),
        ]

    def __str__(self):
        return f"{self.course.code} - Module {self.module_number}: {self.title}"
