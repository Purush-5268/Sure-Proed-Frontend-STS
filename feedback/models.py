from django.db import models
from django.conf import settings
from django.db.models import Q
from common.models import TimeStampedUUIDModel

class Feedback(TimeStampedUUIDModel):
    class FeedbackType(models.TextChoices):
        COURSE = "COURSE", "Course Feedback"
        TRAINING = "TRAINING", "Training Feedback"
        MENTOR = "MENTOR", "Mentor Feedback"
        SYSTEM = "SYSTEM", "System Feedback"
        OTHER = "OTHER", "Other"

    class ExplanationRating(models.TextChoices):
        VERY_CLEAR = "VERY_CLEAR", "Very Clear"
        CLEAR = "CLEAR", "Clear"
        AVERAGE = "AVERAGE", "Average"
        DIFFICULT_TO_UNDERSTAND = "DIFFICULT_TO_UNDERSTAND", "Difficult to Understand"

    class InteractionRating(models.TextChoices):
        YES_ALWAYS = "YES_ALWAYS", "Yes, Always"
        SOMETIMES = "SOMETIMES", "Sometimes"
        NO = "NO", "No"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="given_feedbacks")
    feedback_type = models.CharField(max_length=20, choices=FeedbackType.choices, default=FeedbackType.SYSTEM, db_index=True)
    related_id = models.UUIDField(blank=True, null=True, help_text="ID of the course, training, mentor, etc.")
    rating = models.PositiveSmallIntegerField(default=5, help_text="Rating from 1 to 5")
    comments = models.TextField(blank=True, null=True)
    
    # Mentor/Class Feedback Fields
    module = models.ForeignKey(
        "courses.CourseModule",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="feedbacks",
        help_text="Course Module being reviewed."
    )
    explanation_rating = models.CharField(
        max_length=50,
        choices=ExplanationRating.choices,
        null=True,
        blank=True,
    )
    interaction_rating = models.CharField(
        max_length=50,
        choices=InteractionRating.choices,
        null=True,
        blank=True,
    )
    improvements_text = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "feedback_type"],
                condition=Q(related_id__isnull=True) & Q(module__isnull=True),
                name="unique_feedback_no_entity_no_module",
            ),
            models.UniqueConstraint(
                fields=["user", "feedback_type", "related_id"],
                condition=Q(related_id__isnull=False) & Q(module__isnull=True),
                name="unique_feedback_entity_no_module",
            ),
            models.UniqueConstraint(
                fields=["user", "feedback_type", "related_id", "module"],
                condition=Q(related_id__isnull=False) & Q(module__isnull=False),
                name="unique_feedback_entity_module",
            ),
            models.UniqueConstraint(
                fields=["user", "feedback_type", "module"],
                condition=Q(related_id__isnull=True) & Q(module__isnull=False),
                name="unique_feedback_no_entity_module",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.feedback_type} - {self.rating}/5"
