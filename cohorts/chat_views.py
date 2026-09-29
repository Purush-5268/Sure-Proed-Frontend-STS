"""
Cohort Group Chat REST API.

Endpoints (registered under /api/cohorts/{cohort_pk}/chat/):
  GET    messages/       — paginated message history
  POST   messages/       — send a message
  GET    unread-count/   — lightweight unread count
  POST   read/           — mark conversation as read up to latest message

Authorization:
  Student: must have an active Application (not SUSPENDED/DROPPED/CANCELLED/REJECTED)
  Mentor:  must be assigned to the cohort
  Admin:   always allowed
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers as drf_serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cohorts.models import Cohort
from cohorts.chat_models import CohortConversation, CohortMessage, CohortChatReadState


# ──────────────────────────────────────────────────────────────────────────────
# Application statuses that allow cohort access
# ──────────────────────────────────────────────────────────────────────────────
ACTIVE_APPLICATION_STATUSES = frozenset([
    "COHORT_ASSIGNED",
    "IN_PROGRESS",
    "TRAINING",
    "INTERNSHIP_ASSIGNED",
    "COMPLETED",
    "TRANSFER_COHORT",
])


# ──────────────────────────────────────────────────────────────────────────────
# Serializers
# ──────────────────────────────────────────────────────────────────────────────
class CohortMessageSerializer(drf_serializers.ModelSerializer):
    sender_id = drf_serializers.UUIDField(source="sender.id", read_only=True)
    sender_name = drf_serializers.SerializerMethodField()
    sender_role = drf_serializers.SerializerMethodField()

    class Meta:
        model = CohortMessage
        fields = ["id", "sender_id", "sender_name", "sender_role", "body", "created_at", "is_deleted"]
        read_only_fields = ["id", "sender_id", "sender_name", "sender_role", "created_at", "is_deleted"]

    def get_sender_name(self, obj):
        if not obj.sender:
            return "Deleted User"
        name = obj.sender.get_full_name().strip() or obj.sender.email
        
        role = getattr(obj.sender, "role", "")
        if role == "VOLUNTEER":
            name += " ( Volunteer )"
        elif role == "MENTOR":
            name += " ( Mentor )"
        elif role == "ADMIN" or obj.sender.is_superuser:
            name += " ( Admin )"
            
        return name

    def get_sender_role(self, obj):
        if not obj.sender:
            return None
        return getattr(obj.sender, "role", None)


class SendMessageSerializer(drf_serializers.Serializer):
    body = drf_serializers.CharField(max_length=4000, min_length=1)


# ──────────────────────────────────────────────────────────────────────────────
# Authorization helper
# ──────────────────────────────────────────────────────────────────────────────
def _is_admin(user):
    return user.is_superuser or getattr(user, "role", "") == "ADMIN"


def _get_authorized_conversation(cohort_id, user):
    """
    Returns (cohort, conversation) if the user is authorized, else raises PermissionError.
    Creates the CohortConversation on first access (idempotent).
    """
    cohort = get_object_or_404(Cohort, id=cohort_id)

    if user.is_superuser or getattr(user, "role", "") in ["ADMIN", "VOLUNTEER"]:
        conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
        return cohort, conv

    role = getattr(user, "role", "")

    if role == "MENTOR":
        if getattr(user, "has_all_cohorts_access", False):
            conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
            return cohort, conv
        if not Cohort.objects.filter(id=cohort.id, mentors=user).exists():
            raise PermissionError("You are not assigned as a mentor for this cohort.")
        conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
        return cohort, conv

    # Student: must have active application
    from applications.models import Application
    has_active = Application.objects.filter(
        student__user=user,
        assigned_cohort=cohort,
        status__in=ACTIVE_APPLICATION_STATUSES,
    ).exists()
    if not has_active:
        raise PermissionError("You do not have active access to this cohort's chat.")
    conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
    return cohort, conv


# ──────────────────────────────────────────────────────────────────────────────
# Views
# ──────────────────────────────────────────────────────────────────────────────
class CohortChatMessagesView(APIView):
    """
    GET  /api/cohorts/{cohort_id}/chat/messages/   — paginated history (newest-last)
    POST /api/cohorts/{cohort_id}/chat/messages/   — send a message
    """
    permission_classes = [IsAuthenticated]
    PAGE_SIZE = 50

    def get(self, request, cohort_id):
        try:
            _, conversation = _get_authorized_conversation(cohort_id, request.user)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        # Cursor-based pagination: ?before=<message_id> for infinite-scroll
        before_id = request.query_params.get("before")
        qs = conversation.messages.filter(is_deleted=False).select_related("sender").order_by("-created_at")
        if before_id:
            try:
                anchor = CohortMessage.objects.get(id=before_id, conversation=conversation)
                qs = qs.filter(created_at__lt=anchor.created_at)
            except CohortMessage.DoesNotExist:
                pass

        messages = list(qs[: self.PAGE_SIZE])
        messages.reverse()  # Return chronological order to the client

        # Efficiently fetch all read states scoped to this conversation
        read_states = CohortChatReadState.objects.filter(
            conversation=conversation,
            last_read_message__isnull=False
        ).select_related("last_read_message")
        
        read_states_data = {
            str(rs.user_id): {
                "message_id": str(rs.last_read_message.id),
                "timestamp": rs.last_read_message.created_at.isoformat()
            }
            for rs in read_states
        }

        return Response({
            "cohort_id": str(cohort_id),
            "conversation_id": str(conversation.id),
            "count": len(messages),
            "has_more": qs.count() > self.PAGE_SIZE,
            "read_states": read_states_data,
            "results": CohortMessageSerializer(messages, many=True).data,
        })

    def post(self, request, cohort_id):
        try:
            _, conversation = _get_authorized_conversation(cohort_id, request.user)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        if not conversation.is_active:
            return Response({"error": "This conversation is currently closed."}, status=status.HTTP_403_FORBIDDEN)

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        msg = CohortMessage.objects.create(
            conversation=conversation,
            sender=request.user,
            body=serializer.validated_data["body"],
        )
        return Response(CohortMessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class CohortChatUnreadCountView(APIView):
    """
    GET /api/cohorts/{cohort_id}/chat/unread-count/
    Returns the number of messages after the user's last-read message.
    Efficient: uses a single COUNT query, not message loading.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        try:
            _, conversation = _get_authorized_conversation(cohort_id, request.user)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        read_state = CohortChatReadState.objects.filter(
            conversation=conversation, user=request.user
        ).first()

        if read_state and read_state.last_read_message:
            unread = CohortMessage.objects.filter(
                conversation=conversation,
                is_deleted=False,
                created_at__gt=read_state.last_read_message.created_at,
            ).exclude(sender=request.user).count()
        else:
            unread = CohortMessage.objects.filter(
                conversation=conversation,
                is_deleted=False,
            ).exclude(sender=request.user).count()

        return Response({"cohort_id": str(cohort_id), "unread_count": unread})


class CohortChatMarkReadView(APIView):
    """
    POST /api/cohorts/{cohort_id}/chat/read/
    Marks the conversation as fully read (up to the latest message).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id):
        try:
            _, conversation = _get_authorized_conversation(cohort_id, request.user)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        latest_msg = conversation.messages.filter(is_deleted=False).order_by("-created_at").first()
        if latest_msg:
            CohortChatReadState.objects.update_or_create(
                conversation=conversation,
                user=request.user,
                defaults={"last_read_message": latest_msg},
            )
        return Response({"status": "marked_read"})


class CohortChatDeleteMessageView(APIView):
    """
    DELETE /api/cohorts/{cohort_id}/chat/messages/{message_id}/
    Admin or message sender can soft-delete a message.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, cohort_id, message_id):
        try:
            _, conversation = _get_authorized_conversation(cohort_id, request.user)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        msg = get_object_or_404(CohortMessage, id=message_id, conversation=conversation)
        if not _is_admin(request.user) and msg.sender != request.user:
            return Response({"error": "You can only delete your own messages."}, status=status.HTTP_403_FORBIDDEN)

        msg.is_deleted = True
        msg.save(update_fields=["is_deleted"])
        return Response({"status": "deleted"})
