from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RoleConversationListView,
    RoleConversationMessagesView,
    RoleConversationMarkReadView,
    RoleConversationUnreadCountView,
    RoleAttachmentDownloadView,
    CSRPartnershipRequestCreateView,
    AdminCSRPartnershipRequestViewSet,
)

router = DefaultRouter()
router.register(r'admin/csr-requests', AdminCSRPartnershipRequestViewSet, basename='admin_csr_requests')

urlpatterns = [
    path("conversations/", RoleConversationListView.as_view(), name="role_conversations_list"),
    path("conversations/<str:group_type>/messages/", RoleConversationMessagesView.as_view(), name="role_conversation_messages"),
    path("conversations/<str:group_type>/read/", RoleConversationMarkReadView.as_view(), name="role_conversation_mark_read"),
    path("unread-summary/", RoleConversationUnreadCountView.as_view(), name="role_conversation_unread_summary"),
    path("attachments/<uuid:attachment_id>/download/", RoleAttachmentDownloadView.as_view(), name="role_attachment_download"),
    path("csr-requests/", CSRPartnershipRequestCreateView.as_view(), name="create_csr_request"),
    path("", include(router.urls)),
]
