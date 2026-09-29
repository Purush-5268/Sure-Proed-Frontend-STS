"""
Cohort Group Chat models.

Completely separate from PermissionChatConsumer / AbsenceWarning / PermissionRequestMessage.
One CohortConversation per cohort (enforced by unique_together).
Messages are paginated — never fetched in bulk.
Read-state tracks per-user last-read message for unread counts.
"""
import uuid
from django.conf import settings
from django.db import models
from common.models import TimeStampedUUIDModel


class CohortConversation(TimeStampedUUIDModel):
    """
    One active group conversation per cohort.
    All students/mentors/admins of that cohort participate.
    """
    cohort = models.OneToOneField(
        "cohorts.Cohort",
        on_delete=models.CASCADE,
        related_name="conversation",
        help_text="Each cohort has at most one active group conversation.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Cohort Conversation"
        verbose_name_plural = "Cohort Conversations"

    def __str__(self):
        return f"Conversation: {self.cohort}"


class CohortMessage(models.Model):
    """
    A single message in a CohortConversation.
    No auto_now/auto_now_add on updated_at to keep the table lean.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        CohortConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        related_name="cohort_chat_messages",
    )
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    is_deleted = models.BooleanField(default=False, help_text="Soft-delete for moderation.")
    is_edited = models.BooleanField(default=False, help_text="True if the message body was edited after sending.")

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["sender", "created_at"]),
        ]
        verbose_name = "Cohort Chat Message"
        verbose_name_plural = "Cohort Chat Messages"

    def __str__(self):
        sender_label = self.sender.email if self.sender else "deleted"
        return f"[{self.conversation.cohort}] {sender_label}: {self.body[:40]}"


class CohortChatReadState(models.Model):
    """
    Tracks the last message each user has read per conversation.
    Used for efficient unread-count calculation without loading messages.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        CohortConversation,
        on_delete=models.CASCADE,
        related_name="read_states",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cohort_chat_read_states",
    )
    last_read_message = models.ForeignKey(
        CohortMessage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("conversation", "user")]
        indexes = [
            models.Index(fields=["user", "conversation"]),
        ]
        verbose_name = "Cohort Chat Read State"
        verbose_name_plural = "Cohort Chat Read States"

    def __str__(self):
        return f"ReadState: {self.user.email} in {self.conversation.cohort}"
