"""
CohortChatConsumer — WebSocket consumer for cohort group chat.

URL: ws/cohort-chat/{cohort_id}/?token=<jwt>

Completely separate from PermissionChatConsumer.
Uses the same JWTAuthMiddleware that's already wired in asgi.py.

Message flow:
  connect → authenticate → authorize → join group → accept
  receive → authorize (re-check) → validate body → persist → broadcast
  disconnect → leave group

A suspended student is denied at connect time and cannot send messages.

Actions supported (inbound from client):
  {"action": "send",   "body": "..."}                          — new message
  {"body": "..."}                                              — backward-compat send (no action key)
  {"action": "edit",   "message_id": "<uuid>", "body": "..."}  — edit own message
  {"action": "delete", "message_id": "<uuid>"}                 — soft-delete own message

Broadcast events (outbound to all group members):
  {"event": "message_created", ...}
  {"event": "message_updated", ...}
  {"event": "message_deleted", "message_id": "<uuid>"}
"""
import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)

ACTIVE_APPLICATION_STATUSES = frozenset([
    "COHORT_ASSIGNED",
    "IN_PROGRESS",
    "TRAINING",
    "INTERNSHIP_ASSIGNED",
    "COMPLETED",
    "TRANSFER_COHORT",
])

# Roles with moderation rights (can delete any message in their cohort)
MODERATOR_ROLES = frozenset(["ADMIN", "TRUSTEE", "MENTOR", "VOLUNTEER"])


class CohortChatConsumer(AsyncWebsocketConsumer):
    """
    Cohort group chat WebSocket consumer.
    Each cohort has a dedicated channel group: cohort_chat_{cohort_id}
    """

    async def connect(self):
        self.cohort_id = self.scope["url_route"]["kwargs"]["cohort_id"]
        self.group_name = f"cohort_chat_{self.cohort_id}"
        self.user = self.scope.get("user", AnonymousUser())

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        ok, conv_id, error = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            logger.info("CohortChat denied: user=%s cohort=%s reason=%s", self.user.id, self.cohort_id, error)
            await self.close(code=4003)
            return

        self.conversation_id = conv_id
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        # Check if client requested "Bearer" subprotocol
        subprotocols = self.scope.get("subprotocols", [])
        if "Bearer" in subprotocols:
            await self.accept(subprotocol="Bearer")
        else:
            await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            payload = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return

        # Determine action — backward-compatible: no "action" key means "send"
        action = payload.get("action", "send")

        if action == "send":
            await self._handle_send(payload)
        elif action == "edit":
            await self._handle_edit(payload)
        elif action == "delete":
            await self._handle_delete(payload)
        elif action == "mark_read":
            await self._handle_mark_read(payload)
        else:
            await self.send(text_data=json.dumps({"error": f"Unknown action: {action}"}))

    # ──────────────────────────────────────────────────────────────────────
    # Action handlers
    # ──────────────────────────────────────────────────────────────────────

    async def _handle_send(self, payload):
        body = str(payload.get("body", "")).strip()
        if not body or len(body) > 4000:
            await self.send(text_data=json.dumps({"error": "Message must be 1–4000 characters."}))
            return

        # Re-check authorization before every write (handles suspension mid-session)
        ok, _, error = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.send(text_data=json.dumps({"error": f"Access revoked: {error}"}))
            await self.close(code=4003)
            return

        msg = await self._save_message(self.conversation_id, self.user, body)
        if msg is None:
            await self.send(text_data=json.dumps({"error": "Could not save message."}))
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat_message_created",
                "event": "message_created",
                "message_id": str(msg["id"]),
                "body": msg["body"],
                "sender_id": str(self.user.id),
                "sender_name": msg["sender_name"],
                "sender_role": msg["sender_role"],
                "created_at": msg["created_at"],
                "is_edited": False,
            },
        )

    async def _handle_edit(self, payload):
        message_id = str(payload.get("message_id", "")).strip()
        body = str(payload.get("body", "")).strip()

        if not message_id:
            await self.send(text_data=json.dumps({"error": "message_id is required for edit."}))
            return
        if not body or len(body) > 4000:
            await self.send(text_data=json.dumps({"error": "Message must be 1–4000 characters."}))
            return

        result = await self._edit_message(message_id, self.user, body, self.conversation_id)
        if result is None:
            await self.send(text_data=json.dumps({"error": "Cannot edit: message not found, not yours, or deleted."}))
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat_message_updated",
                "event": "message_updated",
                "message_id": result["id"],
                "body": result["body"],
                "sender_id": str(self.user.id),
                "is_edited": True,
            },
        )

    async def _handle_delete(self, payload):
        message_id = str(payload.get("message_id", "")).strip()

        if not message_id:
            await self.send(text_data=json.dumps({"error": "message_id is required for delete."}))
            return

        is_moderator = self.user.is_superuser or getattr(self.user, "role", "") in MODERATOR_ROLES
        ok = await self._delete_message(message_id, self.user, self.conversation_id, is_moderator)
        if not ok:
            await self.send(text_data=json.dumps({"error": "Cannot delete: message not found or not yours."}))
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat_message_deleted",
                "event": "message_deleted",
                "message_id": message_id,
            },
        )

    async def _handle_mark_read(self, payload):
        message_id = str(payload.get("message_id", "")).strip()

        if not message_id:
            await self.send(text_data=json.dumps({"error": "message_id is required for mark_read."}))
            return

        ok, _, error = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.send(text_data=json.dumps({"error": f"Access revoked: {error}"}))
            return

        result = await self._mark_message_read(message_id, self.user, self.conversation_id)
        if not result:
            return  # No update needed (either already read, message invalid, or not newer)

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat_read_state_update",
                "event": "read_state_update",
                "user_id": str(self.user.id),
                "last_read_message_id": result["message_id"],
                "last_read_timestamp": result["timestamp"],
            },
        )

    # ──────────────────────────────────────────────────────────────────────
    # Channel layer event handlers (broadcast receivers)
    # ──────────────────────────────────────────────────────────────────────

    async def chat_message_created(self, event):
        ok, _, _ = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.close(code=4003)
            return
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "message_id": event["message_id"],
            "body": event["body"],
            "sender_id": event["sender_id"],
            "sender_name": event["sender_name"],
            "sender_role": event["sender_role"],
            "created_at": event["created_at"],
            "is_edited": event.get("is_edited", False),
        }))

    # Legacy handler name kept for any in-flight messages
    async def chat_message(self, event):
        ok, _, _ = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.close(code=4003)
            return
        await self.send(text_data=json.dumps({
            "event": "message_created",
            "message_id": event["message_id"],
            "body": event["body"],
            "sender_id": event["sender_id"],
            "sender_name": event["sender_name"],
            "sender_role": event["sender_role"],
            "created_at": event["created_at"],
            "is_edited": event.get("is_edited", False),
        }))

    async def chat_message_updated(self, event):
        ok, _, _ = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.close(code=4003)
            return
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "message_id": event["message_id"],
            "body": event["body"],
            "sender_id": event["sender_id"],
            "is_edited": event["is_edited"],
        }))

    async def chat_message_deleted(self, event):
        ok, _, _ = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.close(code=4003)
            return
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "message_id": event["message_id"],
        }))

    async def chat_read_state_update(self, event):
        ok, _, _ = await self._check_authorization(self.cohort_id, self.user)
        if not ok:
            await self.close(code=4003)
            return
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "user_id": event["user_id"],
            "last_read_message_id": event["last_read_message_id"],
            "last_read_timestamp": event["last_read_timestamp"],
        }))

    # ──────────────────────────────────────────────────────────────────────
    # DB helpers (sync wrapped)
    # ──────────────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _check_authorization(self, cohort_id, user):
        """
        Returns (is_authorized, conversation_id, error_message).
        Creates CohortConversation on first access.
        """
        import time
        from django.contrib.auth import get_user_model
        if time.time() >= self.scope.get("auth_expires", float("inf")):
            return False, None, "Session expired"
        user = get_user_model().objects.filter(pk=user.pk, is_active=True).first()
        if user is None:
            return False, None, "Account unavailable"
        from cohorts.models import Cohort
        from cohorts.chat_models import CohortConversation
        from applications.models import Application

        try:
            cohort = Cohort.objects.get(id=cohort_id)
        except Cohort.DoesNotExist:
            return False, None, "Cohort not found"

        if user.is_superuser or getattr(user, "role", "") in ["ADMIN", "TRUSTEE"]:
            conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
            return True, str(conv.id), None

        role = getattr(user, "role", "")
        from common.access import can_manage_cohort
        if role in ["MENTOR", "VOLUNTEER"]:
            if can_manage_cohort(user, cohort):
                conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
                return True, str(conv.id), None
            return False, None, f"Not assigned as {role.lower()} for this cohort"

        # Student
        has_active = Application.objects.filter(
            student__user=user,
            assigned_cohort=cohort,
            status__in=list(ACTIVE_APPLICATION_STATUSES),
        ).exists()
        if has_active:
            conv, _ = CohortConversation.objects.get_or_create(cohort=cohort)
            return True, str(conv.id), None

        # Check if suspended to give a cleaner error
        is_suspended = Application.objects.filter(
            student__user=user,
            assigned_cohort=cohort,
            status="SUSPENDED",
        ).exists()
        if is_suspended:
            return False, None, "Your access to this cohort is suspended"

        return False, None, "No active application for this cohort"

    @database_sync_to_async
    def _save_message(self, conversation_id, user, body):
        """Persist the message and return a dict for broadcasting."""
        from cohorts.chat_models import CohortConversation, CohortMessage
        try:
            conv = CohortConversation.objects.get(id=conversation_id)
            msg = CohortMessage.objects.create(conversation=conv, sender=user, body=body)
            full_name = user.get_full_name().strip() or user.email
            
            role = getattr(user, "role", "")
            if role == "VOLUNTEER":
                full_name += " ( Volunteer )"
            elif role == "MENTOR":
                full_name += " ( Mentor )"
            elif role == "TRUSTEE":
                full_name += " ( Trustee )"
            elif role == "ADMIN" or user.is_superuser:
                full_name += " ( Admin )"
                
            return {
                "id": str(msg.id),
                "body": msg.body,
                "sender_name": full_name,
                "sender_role": role if role else None,
                "created_at": msg.created_at.isoformat(),
            }
        except Exception as exc:
            logger.exception("Failed to save CohortMessage: %s", exc)
            return None

    @database_sync_to_async
    def _edit_message(self, message_id, user, new_body, conversation_id):
        """
        Edit own message. Returns updated dict or None on failure.
        Ownership verified server-side. Cross-cohort edit prevented by conversation scope.
        """
        from cohorts.chat_models import CohortMessage
        try:
            msg = CohortMessage.objects.select_related("conversation").get(
                id=message_id,
                sender=user,          # ownership check — never trust client user_id
                conversation_id=conversation_id,  # cross-cohort guard
                is_deleted=False,
            )
            msg.body = new_body
            msg.is_edited = True
            msg.save(update_fields=["body", "is_edited"])
            return {"id": str(msg.id), "body": msg.body}
        except CohortMessage.DoesNotExist:
            return None
        except Exception as exc:
            logger.exception("Failed to edit CohortMessage: %s", exc)
            return None

    @database_sync_to_async
    def _delete_message(self, message_id, user, conversation_id, is_moderator):
        """
        Soft-delete a message using the existing is_deleted convention.
        Students: own messages only. Moderators: any message in this cohort's conversation.
        Cross-cohort delete prevented by conversation scope.
        Returns True on success.
        """
        from cohorts.chat_models import CohortMessage
        try:
            if is_moderator:
                # Moderators can delete any non-deleted message in this conversation
                msg = CohortMessage.objects.get(
                    id=message_id,
                    conversation_id=conversation_id,
                    is_deleted=False,
                )
            else:
                # Students: own messages only
                msg = CohortMessage.objects.get(
                    id=message_id,
                    sender=user,
                    conversation_id=conversation_id,
                    is_deleted=False,
                )
            msg.is_deleted = True
            msg.save(update_fields=["is_deleted"])
            return True
        except CohortMessage.DoesNotExist:
            return False
        except Exception as exc:
            logger.exception("Failed to delete CohortMessage: %s", exc)
            return False

    @database_sync_to_async
    def _mark_message_read(self, message_id, user, conversation_id):
        from cohorts.chat_models import CohortMessage, CohortChatReadState
        try:
            # Verify message exists in this conversation
            new_msg = CohortMessage.objects.get(id=message_id, conversation_id=conversation_id)
            
            # Fetch existing read state
            read_state, created = CohortChatReadState.objects.get_or_create(
                conversation_id=conversation_id,
                user=user,
            )
            
            # Idempotent: Only update if the new message is chronologically newer
            # (or if no previous last_read_message exists)
            if not created and read_state.last_read_message:
                if new_msg.created_at <= read_state.last_read_message.created_at:
                    return None  # No advancement
                    
            read_state.last_read_message = new_msg
            read_state.save(update_fields=["last_read_message", "updated_at"])
            
            return {
                "message_id": str(new_msg.id),
                "timestamp": new_msg.created_at.isoformat()
            }
        except CohortMessage.DoesNotExist:
            return None
        except Exception as exc:
            logger.exception("Failed to mark CohortMessage as read: %s", exc)
            return None
