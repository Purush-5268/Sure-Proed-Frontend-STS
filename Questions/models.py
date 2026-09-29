import uuid

from django.db import models


class Question(models.Model):
    """
    Represents a question that can be assigned to an exam.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    text = models.TextField()

    marks = models.PositiveIntegerField(default=1)

    correct_answer = models.JSONField(
        default=dict,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "question"
        verbose_name = "Question"
        verbose_name_plural = "Questions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Question {self.id}"
