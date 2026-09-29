from rest_framework import serializers
from .models import RoleConversation, RoleMessage, RoleMessageAttachment, RoleConversationReadState, CSRPartnershipRequest


class RoleMessageAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = RoleMessageAttachment
        fields = [
            "id",
            "original_filename",
            "file_type",
            "file_size",
            "download_url",
            "uploaded_at",
        ]
        read_only_fields = fields

    def get_download_url(self, obj):
        return f"/api/communications/attachments/{obj.id}/download/"


class RoleMessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.UUIDField(source="sender.id", read_only=True)
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.CharField(read_only=True)
    attachments = RoleMessageAttachmentSerializer(many=True, read_only=True)
    group_type = serializers.CharField(source="conversation.group_type", read_only=True)

    class Meta:
        model = RoleMessage
        fields = [
            "id",
            "group_type",
            "sender_id",
            "sender_name",
            "sender_role",
            "content",
            "attachments",
            "created_at",
            "is_deleted",
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        if not obj.sender:
            return "Unknown User"
        full_name = obj.sender.get_full_name().strip()
        return full_name if full_name else obj.sender.email


class RoleConversationSerializer(serializers.ModelSerializer):
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = RoleConversation
        fields = [
            "id",
            "group_type",
            "title",
            "is_active",
            "unread_count",
            "last_message",
            "updated_at",
        ]
        read_only_fields = fields

    def get_unread_count(self, obj):
        user = self.context.get("request_user")
        if not user or not user.is_authenticated:
            return 0
        read_state = RoleConversationReadState.objects.filter(
            conversation=obj,
            user=user,
        ).first()
        if not read_state or not read_state.last_read_message:
            return obj.messages.filter(is_deleted=False).count()
        return obj.messages.filter(
            is_deleted=False,
            created_at__gt=read_state.last_read_message.created_at,
        ).count()

    def get_last_message(self, obj):
        msg = obj.messages.filter(is_deleted=False).order_by("-created_at").first()
        if not msg:
            return None
        has_attachments = msg.attachments.exists()
        text_preview = msg.content[:60] if msg.content else ("[Attachment]" if has_attachments else "")
        return {
            "id": str(msg.id),
            "content_preview": text_preview,
            "sender_name": msg.sender.get_full_name().strip() or msg.sender.email if msg.sender else "Unknown",
            "sender_role": msg.sender_role,
            "created_at": msg.created_at.isoformat(),
            "has_attachments": has_attachments,
        }


class CSRPartnershipRequestSerializer(serializers.ModelSerializer):
    contacted_by_name = serializers.SerializerMethodField()
    reference_id = serializers.CharField(read_only=True)

    class Meta:
        model = CSRPartnershipRequest
        fields = [
            "id",
            "reference_id",
            "name",
            "designation",
            "organization",
            "email",
            "phone",
            "area_of_interest",
            "message",
            "status",
            "admin_notes",
            "contacted_by",
            "contacted_by_name",
            "contacted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference_id", "status", "admin_notes", "contacted_by", "contacted_at", "created_at", "updated_at"]

    def get_contacted_by_name(self, obj):
        if obj.contacted_by:
            return obj.contacted_by.get_full_name().strip() or obj.contacted_by.email
        return None
