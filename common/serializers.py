from rest_framework import serializers
from applications.models import Application
from .models import Announcement, FAQ, Notification, SystemInformation, UserRequest, Achievement, OrganizationalUpdate, AppRelease

class SystemInformationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemInformation
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = "__all__"
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        audience = attrs.get(
            "target_audience",
            getattr(self.instance, "target_audience", Announcement.TargetAudience.ALL),
        )
        cohort = attrs.get("cohort", getattr(self.instance, "cohort", None))

        if self.instance is None and "target_audience" not in self.initial_data:
            raise serializers.ValidationError({
                "target_audience": "Select All Users, Students, Mentors, Volunteers, or Specific Cohort."
            })
        if audience == Announcement.TargetAudience.ALL and cohort is not None:
            raise serializers.ValidationError({"cohort": "All Users is a platform-wide broadcast and cannot be limited to one cohort."})
        if audience == Announcement.TargetAudience.COHORT and cohort is None:
            raise serializers.ValidationError({"cohort": "Select the cohort that should receive this announcement."})
        return attrs


class NotificationCreateSerializer(serializers.Serializer):
    user_id = serializers.CharField(
        required=True,
        help_text="Target candidate identifier: User UUID, Login Email, Mapped Email, or Student Code (e.g. 'STU-123456')",
    )
    title = serializers.CharField(max_length=255, required=True, help_text="Notification title")
    message = serializers.CharField(required=True, help_text="Notification body content")
    notification_type = serializers.ChoiceField(
        choices=Notification.Type.choices,
        default=Notification.Type.INFO,
        required=False,
        help_text="Notification category: INFO, SUCCESS, WARNING, ACTION_REQUIRED",
    )
    action_url = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        help_text="Optional dashboard destination link or action route",
    )


class NotificationSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id", "user", "user_email", "title", "message",
            "notification_type", "is_read", "action_url",
            "created_at", "updated_at"
        ]
        read_only_fields = ["id", "user", "user_email", "created_at", "updated_at"]

    def get_related_info(self, obj):
        return {
            "entity_type": obj.content_type.model if obj.content_type else None,
            "entity_id": str(obj.object_id) if obj.object_id else None,
            "entity_str": str(obj.content_object) if obj.content_object else None
        }


class AchievementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    student_name = serializers.CharField(source="student.name", read_only=True)
    cohort_name = serializers.CharField(source="cohort.name", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)

    class Meta:
        model = Achievement
        fields = "__all__"
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class OrganizationalUpdateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)

    class Meta:
        model = OrganizationalUpdate
        fields = "__all__"
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class UserRequestSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source="sender.email", read_only=True)
    related_application = serializers.PrimaryKeyRelatedField(
        queryset=Application.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = UserRequest
        fields = "__all__"
        read_only_fields = [
            "id", "request_number", "sender", "sender_role", "sender_email",
            "status", "admin_remarks", "resolved_by", "resolved_at",
            "created_at", "updated_at"
        ]
        validators = []

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        related_app = attrs.get("related_application")
        if related_app and user and not (user.is_superuser or getattr(user, "role", "") == "ADMIN"):
            if getattr(related_app, "student", None) and getattr(related_app.student, "user_id", None) != user.id:
                raise serializers.ValidationError(
                    {"related_application": "You are not authorized to link another student's application."}
                )
        return attrs


class UserRequestAdminResolveSerializer(serializers.Serializer):
    """
    Admin-only serializer for resolving or rejecting a UserRequest.
    Validates the status transition and accepts admin_remarks.
    """
    ALLOWED_TRANSITIONS = {
        UserRequest.Status.PENDING: [
            UserRequest.Status.IN_PROGRESS,
            UserRequest.Status.RESOLVED,
            UserRequest.Status.REJECTED,
        ],
        UserRequest.Status.IN_PROGRESS: [
            UserRequest.Status.RESOLVED,
            UserRequest.Status.REJECTED,
        ],
        UserRequest.Status.RESOLVED: [
            UserRequest.Status.CLOSED,
        ],
        UserRequest.Status.REJECTED: [
            UserRequest.Status.CLOSED,
        ],
        UserRequest.Status.CLOSED: [],
    }

    new_status = serializers.ChoiceField(
        choices=UserRequest.Status.choices,
        help_text="New status: IN_PROGRESS, RESOLVED, REJECTED, or CLOSED",
    )
    admin_remarks = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        help_text="Resolution notes or response visible to the requester",
    )

    def validate(self, attrs):
        request_obj = self.context.get("request_obj")
        new_status = attrs["new_status"]
        allowed = self.ALLOWED_TRANSITIONS.get(request_obj.status, [])
        if new_status not in allowed:
            raise serializers.ValidationError(
                {"new_status": f"Cannot transition from '{request_obj.status}' to '{new_status}'. "
                               f"Allowed: {[s for s in allowed] if allowed else 'none (terminal state)'}"}
            )
            
        from common.models import UserRequest
        if request_obj.category == UserRequest.Category.OFFER_LETTER and new_status == UserRequest.Status.RESOLVED:
            app = request_obj.related_application
            if not app or not app.offer_letter_issued or not bool(app.offer_letter_file):
                raise serializers.ValidationError(
                    {"new_status": "Cannot resolve offer letter request: Application does not have an issued offer letter file yet."}
                )
                
        return attrs


class AppReleaseSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    file_size_bytes = serializers.SerializerMethodField()

    class Meta:
        model = AppRelease
        fields = [
            "version_code",
            "version_name",
            "download_url",
            "release_notes",
            "is_mandatory",
            "file_size_bytes",
        ]

    def get_download_url(self, obj):
        request = self.context.get("request")
        return obj.get_download_url(request)

    def get_file_size_bytes(self, obj):
        if obj.file_size_bytes:
            return obj.file_size_bytes
        if obj.apk_file:
            try:
                return obj.apk_file.size
            except Exception:
                return 0
        return 0

