from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from jwt import decode as jwt_decode
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache

@database_sync_to_async
def get_user(user_id):
    User = get_user_model()
    try:
        user = User.objects.get(id=user_id, is_active=True)
        return user
    except User.DoesNotExist:
        return AnonymousUser()

class JWTAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        token = None
        
        # 1. Try to get token from subprotocols (e.g. ["Bearer", "eyJhbG..."])
        subprotocols = scope.get("subprotocols", [])
        if subprotocols and "Bearer" in subprotocols:
            try:
                bearer_index = subprotocols.index("Bearer")
                if bearer_index + 1 < len(subprotocols):
                    token = subprotocols[bearer_index + 1]
            except ValueError:
                pass
                
        # 2. Fallback to query_string
        if not token:
            query_string = parse_qs(scope["query_string"].decode("utf8"))
            if query_string.get("token"):
                token = query_string.get("token")[0]
        
        if token:
            try:
                decoded_data = JWTAuthentication().get_validated_token(token)
                user = await get_user(decoded_data["user_id"])
                scope["user"] = user
                scope["auth_expires"] = decoded_data["exp"]
            except (InvalidToken, TokenError, Exception):
                scope["user"] = AnonymousUser()
        else:
            scope["user"] = AnonymousUser()
            
        return await self.inner(scope, receive, send)
