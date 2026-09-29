import mimetypes
import os
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.access import (
    can_access_communication_group,
    get_user_communication_group,
    is_admin,
    is_advisor,
    is_trustee,
    is_volunteer,
)
from common.validators import fast_validate_file_metadata
from .models import (
    RoleConversation,
    RoleConversationReadState,
    RoleMessage,
    RoleMessageAttachment,
    CSRPartnershipRequest,
)
from .serializers import (
    RoleConversationSerializer,
    RoleMessageSerializer,
    CSRPartnershipRequestSerializer,
)

ALLOWED_ATTACHMENT_EXTENSIONS = [
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt",
    "png", "jpg", "jpeg", "webp"
]
MAX_ATTACHMENT_MB = 15


def ensure_conversations_exist():
    """Ensure standard 3 communication groups are provisioned."""
    groups = [
        (RoleConversation.GroupType.TRUSTEE_GROUP, "Trustee Board Communication"),
        (RoleConversation.GroupType.ADVISOR_GROUP, "Advisory Council Communication"),
        (RoleConversation.GroupType.VOLUNTEER_GROUP, "Volunteer Team Communication"),
    ]
    for gtype, title in groups:
        RoleConversation.objects.get_or_create(
            group_type=gtype,
            defaults={"title": title, "is_active": True},
        )


def resolve_sender_role(user):
    """Determine role snapshot string for message."""
    if is_admin(user):
        return "ADMIN"
    if is_advisor(user):
        return "ADVISOR"
    if is_trustee(user):
        return "TRUSTEE"
    if is_volunteer(user):
        return "VOLUNTEER"
    return "UNKNOWN"


class RoleConversationListView(APIView):
    """
    GET /api/communications/conversations/
    Returns list of role conversations accessible by the current authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_conversations_exist()
        user = request.user

        if is_admin(user):
            allowed_groups = [
                RoleConversation.GroupType.TRUSTEE_GROUP,
                RoleConversation.GroupType.ADVISOR_GROUP,
                RoleConversation.GroupType.VOLUNTEER_GROUP,
            ]
        else:
            user_group = get_user_communication_group(user)
            if not user_group:
                raise PermissionDenied("You do not have access to role communications.")
            allowed_groups = [user_group]

        conversations = RoleConversation.objects.filter(
            group_type__in=allowed_groups,
            is_active=True,
        ).order_by("group_type")

        serializer = RoleConversationSerializer(
            conversations,
            many=True,
            context={"request_user": user},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class RoleConversationMessagesView(APIView):
    """
    GET  /api/communications/conversations/<group_type>/messages/
         Cursor pagination: ?before=<message_uuid>&limit=50
    POST /api/communications/conversations/<group_type>/messages/
         Multipart/form-data: content (str), file (file)
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, group_type):
        ensure_conversations_exist()
        if not can_access_communication_group(request.user, group_type):
            raise PermissionDenied("You are not authorized to view this communication channel.")

        conversation = get_object_or_404(RoleConversation, group_type=group_type, is_active=True)

        limit = min(int(request.query_params.get("limit", 50)), 100)
        before_id = request.query_params.get("before")

        qs = conversation.messages.filter(is_deleted=False).select_related("sender").prefetch_related("attachments")

        if before_id:
            try:
                pivot_msg = RoleMessage.objects.get(id=before_id, conversation=conversation)
                qs = qs.filter(created_at__lt=pivot_msg.created_at)
            except (RoleMessage.DoesNotExist, ValueError):
                pass

        total_count = conversation.messages.filter(is_deleted=False).count()
        messages = list(qs.order_by("-created_at")[:limit + 1])
        has_more = len(messages) > limit
        if has_more:
            messages = messages[:limit]

        # Return oldest first for standard chat scroll
        messages.reverse()

        serializer = RoleMessageSerializer(messages, many=True)
        return Response({
            "group_type": group_type,
            "title": conversation.title,
            "count": len(messages),
            "total_count": total_count,
            "has_more": has_more,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)

    def post(self, request, group_type):
        ensure_conversations_exist()
        user = request.user

        # Strict security enforcement:
        if not can_access_communication_group(user, group_type):
            raise PermissionDenied("You are not authorized to post to this communication channel.")

        if not is_admin(user):
            allowed_group = get_user_communication_group(user)
            if allowed_group != group_type:
                raise PermissionDenied("You can only post messages to your assigned communication channel.")

        conversation = get_object_or_404(RoleConversation, group_type=group_type, is_active=True)

        content = request.data.get("content", "").strip()
        uploaded_file = request.FILES.get("file")

        if not content and not uploaded_file:
            return Response(
                {"error": "Message content or a file attachment is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if uploaded_file:
            try:
                fast_validate_file_metadata(
                    uploaded_file,
                    max_mb=MAX_ATTACHMENT_MB,
                    allowed_types=ALLOWED_ATTACHMENT_EXTENSIONS,
                )
            except ValidationError as e:
                return Response(
                    {"error": e.detail if isinstance(e.detail, (str, list)) else str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        sender_role = resolve_sender_role(user)

        with transaction.atomic():
            message = RoleMessage.objects.create(
                conversation=conversation,
                sender=user,
                sender_role=sender_role,
                content=content,
            )

            if uploaded_file:
                original_name = os.path.basename(uploaded_file.name)
                mime = mimetypes.guess_type(original_name)[0] or "application/octet-stream"
                size = getattr(uploaded_file, "size", 0)

                RoleMessageAttachment.objects.create(
                    message=message,
                    file=uploaded_file,
                    original_filename=original_name,
                    file_type=mime,
                    file_size=size,
                )

            # Auto-mark as read for sender
            RoleConversationReadState.objects.update_or_create(
                conversation=conversation,
                user=user,
                defaults={"last_read_message": message},
            )

        serializer = RoleMessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RoleConversationMarkReadView(APIView):
    """
    POST /api/communications/conversations/<group_type>/read/
    Marks all messages in the conversation as read up to the latest message.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, group_type):
        if not can_access_communication_group(request.user, group_type):
            raise PermissionDenied("You are not authorized to access this channel.")

        conversation = get_object_or_404(RoleConversation, group_type=group_type, is_active=True)
        latest_message = conversation.messages.filter(is_deleted=False).order_by("-created_at").first()

        RoleConversationReadState.objects.update_or_create(
            conversation=conversation,
            user=request.user,
            defaults={"last_read_message": latest_message},
        )

        return Response({
            "status": "marked_read",
            "group_type": group_type,
            "last_read_id": str(latest_message.id) if latest_message else None,
        }, status=status.HTTP_200_OK)


class RoleConversationUnreadCountView(APIView):
    """
    GET /api/communications/unread-summary/
    Lightweight endpoint returning unread counts per channel for navigation badges.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_conversations_exist()
        user = request.user

        if is_admin(user):
            groups = [
                RoleConversation.GroupType.TRUSTEE_GROUP,
                RoleConversation.GroupType.ADVISOR_GROUP,
                RoleConversation.GroupType.VOLUNTEER_GROUP,
            ]
        else:
            user_group = get_user_communication_group(user)
            groups = [user_group] if user_group else []

        group_counts = {}
        total_unread = 0

        for gtype in groups:
            conv = RoleConversation.objects.filter(group_type=gtype).first()
            if not conv:
                group_counts[gtype] = 0
                continue

            read_state = RoleConversationReadState.objects.filter(
                conversation=conv,
                user=user,
            ).first()

            if not read_state or not read_state.last_read_message:
                count = conv.messages.filter(is_deleted=False).count()
            else:
                count = conv.messages.filter(
                    is_deleted=False,
                    created_at__gt=read_state.last_read_message.created_at,
                ).count()

            group_counts[gtype] = count
            total_unread += count

        return Response({
            "total_unread": total_unread,
            "groups": group_counts,
        }, status=status.HTTP_200_OK)


class RoleAttachmentDownloadView(APIView):
    """
    GET /api/communications/attachments/<uuid:attachment_id>/download/
    Authenticated file serving endpoint.
    Verifies that the calling user has access to the conversation group before streaming file.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, attachment_id):
        attachment = get_object_or_404(
            RoleMessageAttachment.objects.select_related("message__conversation"),
            id=attachment_id,
        )

        group_type = attachment.message.conversation.group_type
        if not can_access_communication_group(request.user, group_type):
            raise PermissionDenied("You are not authorized to access this document attachment.")

        if not attachment.file or not attachment.file.storage.exists(attachment.file.name):
            raise Http404("Attachment file not found on storage.")

        content_type = attachment.file_type or "application/octet-stream"
        file_obj = attachment.file.open("rb")

        # Encode filename safely for Content-Disposition
        safe_filename = attachment.original_filename.replace('"', '').replace(';', '')
        response = FileResponse(file_obj, content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{safe_filename}"'
        response["X-Content-Type-Options"] = "nosniff"
        return response


from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.generics import CreateAPIView
from rest_framework.viewsets import ModelViewSet
from rest_framework.throttling import AnonRateThrottle
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter

class CSRPartnershipRequestThrottle(AnonRateThrottle):
    rate = '5/hour'

class IsAdminOrTrustee(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and (
                request.user.is_superuser or 
                str(getattr(request.user, 'role', '')).upper() in ['ADMIN', 'TRUSTEE']
            )
        )

class CSRPartnershipRequestCreateView(CreateAPIView):
    """
    POST /api/communications/csr-requests/
    Public endpoint to create a CSR Partnership Request.
    """
    queryset = CSRPartnershipRequest.objects.all()
    serializer_class = CSRPartnershipRequestSerializer
    permission_classes = [AllowAny]
    throttle_classes = [CSRPartnershipRequestThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        
        # Return a custom clean success response (Requirement #18)
        return Response({
            "success": True,
            "request_id": serializer.instance.reference_id,
            "message": "Your CSR partnership enquiry has been received."
        }, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        from common.tasks import send_csr_notification_email_task
        
        with transaction.atomic():
            instance = serializer.save()
            transaction.on_commit(lambda: send_csr_notification_email_task.delay(str(instance.id)))


class AdminCSRPartnershipRequestViewSet(ModelViewSet):
    """
    GET, PATCH /api/communications/admin/csr-requests/
    """
    queryset = CSRPartnershipRequest.objects.all().order_by("-created_at")
    serializer_class = CSRPartnershipRequestSerializer
    permission_classes = [IsAdminOrTrustee]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["status", "area_of_interest"]
    search_fields = ["name", "organization", "email", "reference_id"]
    http_method_names = ['get', 'patch', 'head', 'options'] # Only read and update allowed for admin

    def get_queryset(self):
        return super().get_queryset().select_related("contacted_by")

