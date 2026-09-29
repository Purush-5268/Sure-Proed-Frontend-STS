import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import AbsenceWarning, PermissionRequestMessage

class PermissionChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.warning_id = self.scope['url_route']['kwargs']['warning_id']
        self.room_group_name = f'chat_{self.warning_id}'
        self.user = self.scope["user"]

        if not self.user.is_authenticated:
            await self.close()
            return

        is_authorized = await self.check_authorization(self.warning_id, self.user)
        if not is_authorized:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # Check if client requested "Bearer" subprotocol
        subprotocols = self.scope.get("subprotocols", [])
        if "Bearer" in subprotocols:
            await self.accept(subprotocol="Bearer")
        else:
            await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        if not await self.check_authorization(self.warning_id, self.user):
            await self.close(code=4003)
            return
        try:
            text_data_json = json.loads(text_data)
            message = text_data_json.get('message', '').strip()
        except (ValueError, AttributeError, TypeError):
            return
        
        if not message or len(message) > 1000:
            return

        saved_msg = await self.save_message(self.warning_id, self.user, message)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message_id': str(saved_msg.id),
                'message': saved_msg.message,
                'sender_id': str(self.user.id),
                'sender_name': f"{self.user.first_name} {self.user.last_name}",
                'timestamp': saved_msg.created_at.isoformat()
            }
        )

    async def chat_message(self, event):
        if not await self.check_authorization(self.warning_id, self.user):
            await self.close(code=4003)
            return
        await self.send(text_data=json.dumps({
            'message_id': event['message_id'],
            'message': event['message'],
            'sender_id': event['sender_id'],
            'sender_name': event['sender_name'],
            'timestamp': event['timestamp']
        }))

    @database_sync_to_async
    def check_authorization(self, warning_id, user):
        import time
        from django.contrib.auth import get_user_model
        from common.access import can_manage_cohort, is_admin
        if time.time() >= self.scope.get("auth_expires", float("inf")):
            return False
        user = get_user_model().objects.filter(pk=user.pk, is_active=True).first()
        if user is None:
            return False
        try:
            warning = AbsenceWarning.objects.select_related('student__user', 'session__cohort').get(id=warning_id)
            if is_admin(user) or can_manage_cohort(user, warning.session.cohort):
                return True
            if warning.student.user == user:
                return True
            return False
        except AbsenceWarning.DoesNotExist:
            return False

    @database_sync_to_async
    def save_message(self, warning_id, user, message):
        warning = AbsenceWarning.objects.get(id=warning_id)
        msg = PermissionRequestMessage.objects.create(
            warning=warning,
            sender=user,
            message=message
        )
        return msg
