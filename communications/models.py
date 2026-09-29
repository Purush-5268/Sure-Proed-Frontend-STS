import uuid
from django.conf import settings
from django.db import models
from common.storage import private_storage


class RoleConversation(models.Model):
    """
    Fixed communication channels for staff & leadership:
      - TRUSTEE_GROUP: Trustees + Admins
      - ADVISOR_GROUP: Advisors + Admins
      - VOLUNTEER_GROUP: Volunteers + Admins
    """
    class GroupType(models.TextChoices):
        TRUSTEE_GROUP = "TRUSTEE_GROUP", "Trustee Communication"
        ADVISOR_GROUP = "ADVISOR_GROUP", "Advisor Communication"
        VOLUNTEER_GROUP = "VOLUNTEER_GROUP", "Volunteer Communication"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group_type = models.CharField(
        max_length=30,
        choices=GroupType.choices,
        unique=True,
        db_index=True,
    )
    title = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Role Conversation Channel"
        verbose_name_plural = "Role Conversation Channels"
        ordering = ["group_type"]

    def __str__(self):
        return f"{self.get_group_type_display()} ({self.group_type})"


class RoleMessage(models.Model):
    """
    A single text message or document container in a RoleConversation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        RoleConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="role_messages",
    )
    sender_role = models.CharField(
        max_length=30,
        help_text="Snapshot of sender role at time of posting: ADMIN, TRUSTEE, ADVISOR, or VOLUNTEER",
    )
    content = models.TextField(blank=True, max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Role Message"
        verbose_name_plural = "Role Messages"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["sender", "created_at"]),
        ]

    def __str__(self):
        sender_email = self.sender.email if self.sender else "Unknown"
        return f"[{self.conversation.group_type}] {sender_email} ({self.sender_role}): {self.content[:40]}"


class RoleMessageAttachment(models.Model):
    """
    Document or file attachment attached to a RoleMessage.
    Stored via PrivateMediaStorage to protect against unauthenticated or unauthorized URL direct access.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        RoleMessage,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(
        upload_to="communications/attachments/%Y/%m/",
        storage=private_storage,
    )
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=100, blank=True)
    file_size = models.PositiveIntegerField(default=0, help_text="File size in bytes")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Role Message Attachment"
        verbose_name_plural = "Role Message Attachments"
        ordering = ["uploaded_at"]

    def __str__(self):
        return f"Attachment {self.original_filename} ({self.file_size} bytes)"


class RoleConversationReadState(models.Model):
    """
    Tracks the last-read message per user per role conversation for unread counts.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        RoleConversation,
        on_delete=models.CASCADE,
        related_name="read_states",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="role_chat_read_states",
    )
    last_read_message = models.ForeignKey(
        RoleMessage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Role Conversation Read State"
        verbose_name_plural = "Role Conversation Read States"
        unique_together = [("conversation", "user")]
        indexes = [
            models.Index(fields=["user", "conversation"]),
        ]

    def __str__(self):
        return f"ReadState: {self.user.email} in {self.conversation.group_type}"


class CSRPartnershipRequest(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        CLOSED = "CLOSED", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    designation = models.CharField(max_length=255)
    organization = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True, null=True)
    area_of_interest = models.CharField(max_length=255)
    message = models.TextField()
    
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.NEW)
    admin_notes = models.TextField(blank=True, null=True)
    contacted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    contacted_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "CSR Partnership Request"
        verbose_name_plural = "CSR Partnership Requests"

    def __str__(self):
        return f"{self.organization} - {self.name} ({self.status})"
    
    @property
    def reference_id(self):
        return f"CSR-{str(self.id).split('-')[0].upper()}"
