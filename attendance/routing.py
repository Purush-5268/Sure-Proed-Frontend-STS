from django.urls import re_path
from .consumers import PermissionChatConsumer
from cohorts.chat_consumers import CohortChatConsumer

websocket_urlpatterns = [
    re_path(r"ws/chat/(?P<warning_id>[a-fA-F0-9\-]+)/$", PermissionChatConsumer.as_asgi()),
    re_path(r"ws/cohort-chat/(?P<cohort_id>[a-fA-F0-9\-]+)/$", CohortChatConsumer.as_asgi()),
]
