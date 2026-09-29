from django.contrib import admin
from .models import (
    RoleConversation,
    RoleMessage,
    RoleMessageAttachment,
    RoleConversationReadState,
)


class RoleMessageAttachmentInline(admin.TabularInline):
    model = RoleMessageAttachment
    extra = 0
    readonly_fields = ("original_filename", "file_type", "file_size", "uploaded_at")


@admin.register(RoleConversation)
class RoleConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "group_type", "is_active", "created_at", "updated_at")
    list_filter = ("group_type", "is_active")
    search_fields = ("title", "group_type")
    readonly_fields = ("created_at", "updated_at")


@admin.register(RoleMessage)
class RoleMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender_display", "sender_role", "content_snippet", "created_at", "is_deleted")
    list_filter = ("conversation__group_type", "sender_role", "is_deleted", "created_at")
    search_fields = ("sender__email", "sender__first_name", "sender__last_name", "content")
    readonly_fields = ("created_at",)
    inlines = [RoleMessageAttachmentInline]

    @admin.display(description="Sender")
    def sender_display(self, obj):
        if obj.sender:
            return f"{obj.sender.get_full_name()} ({obj.sender.email})"
        return "Unknown"

    @admin.display(description="Content")
    def content_snippet(self, obj):
        return obj.content[:50] if obj.content else "[Attachment only]"


@admin.register(RoleMessageAttachment)
class RoleMessageAttachmentAdmin(admin.ModelAdmin):
    list_display = ("original_filename", "message", "file_type", "file_size", "uploaded_at")
    list_filter = ("file_type", "uploaded_at")
    search_fields = ("original_filename", "message__sender__email")
    readonly_fields = ("uploaded_at",)


@admin.register(RoleConversationReadState)
class RoleConversationReadStateAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "last_read_message", "updated_at")
    list_filter = ("conversation__group_type", "updated_at")
    search_fields = ("user__email",)
    readonly_fields = ("updated_at",)
