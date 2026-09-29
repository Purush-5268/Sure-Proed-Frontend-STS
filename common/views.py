import logging

from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.utils import timezone

from .models import Announcement, FAQ, Notification, SystemInformation, UserRequest, Achievement, OrganizationalUpdate, AppRelease
from .serializers import (
    AnnouncementSerializer,
    FAQSerializer,
    NotificationCreateSerializer,
    NotificationSerializer,
    SystemInformationSerializer,
    UserRequestSerializer,
    AchievementSerializer,
    OrganizationalUpdateSerializer,
    AppReleaseSerializer,
)
from .permissions import IsAdminOrReadOnly

logger = logging.getLogger(__name__)


class SystemInformationViewSet(viewsets.ModelViewSet):
    queryset = SystemInformation.objects.filter(is_active=True).order_by("key")
    serializer_class = SystemInformationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsAdminOrReadOnly]
    lookup_field = "key"

    @method_decorator(cache_page(60 * 15))  # Cache for 15 minutes
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @method_decorator(cache_page(60 * 15))
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)


class FAQViewSet(viewsets.ModelViewSet):
    queryset = FAQ.objects.filter(is_active=True).order_by("order")
    serializer_class = FAQSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsAdminOrReadOnly]

    @method_decorator(cache_page(60 * 15))  # Cache for 15 minutes
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer

    def get_permissions(self):
        """Admins and Trustees manage all broadcasts; mentors may publish to assigned cohorts."""
        from common.permissions import IsAnnouncementManager, IsAdminOrReadOnly
        from rest_framework.permissions import IsAuthenticated
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsAnnouncementManager()]
        return [IsAuthenticatedOrReadOnly(), IsAdminOrReadOnly()]


    def get_queryset(self):
        from common.services.announcement_routing import visible_announcements_for_user
        qs = Announcement.objects.select_related("cohort", "created_by").filter(is_active=True).order_by("-is_pinned", "-created_at")
        return visible_announcements_for_user(self.request.user, qs)


    @transaction.atomic
    def perform_create(self, serializer):
        from common.access import can_manage_cohort
        from common.services.announcement_routing import dispatch_announcement, is_platform_admin
        from rest_framework.exceptions import PermissionDenied

        user = self.request.user
        cohort = serializer.validated_data.get("cohort")
        audience = serializer.validated_data.get("target_audience", Announcement.TargetAudience.ALL)
        if getattr(user, "role", "") == "MENTOR" and not is_platform_admin(user):
            if audience != Announcement.TargetAudience.COHORT or cohort is None:
                raise PermissionDenied("Mentors can publish announcements only to an assigned cohort.")
            if not can_manage_cohort(user, cohort):
                raise PermissionDenied("This cohort is not assigned to your mentor account.")

        announcement = serializer.save(created_by=user)
        dispatch_announcement(announcement)

    @transaction.atomic
    def perform_update(self, serializer):
        from common.services.announcement_routing import dispatch_announcement, is_platform_admin
        announcement = serializer.instance
        user = self.request.user
        if not (is_platform_admin(user) or announcement.created_by_id == user.id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can update only announcements you created.")
        # Changing an existing audience must obey the same scope as creation.
        from common.access import can_manage_cohort
        from rest_framework.exceptions import PermissionDenied
        cohort = serializer.validated_data.get("cohort", announcement.cohort)
        audience = serializer.validated_data.get("target_audience", announcement.target_audience)
        if getattr(user, "role", "") == "MENTOR" and not is_platform_admin(user):
            if audience != Announcement.TargetAudience.COHORT or not can_manage_cohort(user, cohort):
                raise PermissionDenied("Mentors can publish only to an assigned cohort.")
        updated = serializer.save()
        dispatch_announcement(updated)

    def perform_destroy(self, instance):
        from common.services.announcement_routing import is_platform_admin
        user = self.request.user
        if not (is_platform_admin(user) or instance.created_by_id == user.id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can delete only announcements you created.")
        instance.delete()




class IsNotificationSender(BasePermission):
    """
    Allows personal candidate notification sending by Staff or Roles:
    ADMIN, MENTOR, VOLUNTEER, COMPANY, TRUSTEE.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_staff or getattr(request.user, "is_superuser", False):
            return True
        user_role = getattr(request.user, 'role', '')
        return user_role in ['ADMIN', 'MENTOR', 'VOLUNTEER', 'COMPANY', 'TRUSTEE']


@extend_schema(tags=["notifications"])
class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        instance = Notification.objects.select_for_update().get(pk=instance.pk, user=request.user)
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.pop("partial", False))
        serializer.is_valid(raise_exception=True)
        changed = any(getattr(instance, name) != serializer.validated_data.get(name, getattr(instance, name))
                      for name in ("title", "message", "notification_type", "action_url"))
        serializer.save(**({"is_read": False} if changed else {}))
        return Response(serializer.data)

    def get_serializer_class(self):
        if self.action == "create":
            return NotificationCreateSerializer
        return NotificationSerializer

    def get_permissions(self):
        """
        Students can read and delete their own personal notifications.
        Only Staff, Admin, Mentor, Volunteer, Company, or Trustee can send personal candidate notifications.
        """
        if self.action in ["create", "update", "partial_update"]:
            return [IsAuthenticated(), IsNotificationSender()]
        if self.action == "public_key":
            from rest_framework.permissions import AllowAny
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        from django.db.models import Exists, OuterRef, Q
        from django.db.models.functions import Substr
        from common.services.announcement_routing import visible_announcements_for_user

        user = self.request.user
        if not user.is_authenticated:
            return Notification.objects.none()
        visible_match = visible_announcements_for_user(user).filter(
            title=Substr(OuterRef("title"), len("Announcement: ") + 1),
            message=OuterRef("message"),
        )
        queryset = Notification.objects.filter(user=user).annotate(
            _has_visible_announcement=Exists(visible_match)
        ).filter(
            Q(announcement_id__in=visible_announcements_for_user(user).values("pk"))
            | (Q(announcement__isnull=True) & (~Q(title__startswith="Announcement:") | Q(_has_visible_announcement=True)))
        ).select_related("user").order_by("-updated_at", "-id")
        if self.action == 'list' and 'is_read' in self.request.query_params:
            value = self.request.query_params['is_read'].lower()
            if value not in {'true', 'false', '1', '0'}:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'is_read': 'Use true or false.'})
            queryset = queryset.filter(is_read=value in {'true', '1'})
        return queryset

    @extend_schema(
        request=NotificationCreateSerializer,
        responses={201: NotificationSerializer},
        description="Send a candidate notification using User UUID, Email, or Student Code.",
    )
    def create(self, request, *args, **kwargs):
        from accounts.models import User
        from django.db.models import Q
        from rest_framework.exceptions import PermissionDenied, ValidationError

        serializer = NotificationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_identifier = str(data.get("user_id", "") or request.data.get("user", "")).strip()
        if not target_identifier:
            raise ValidationError({"user_id": "A candidate user ID, email, or student code is required."})

        import uuid
        try:
            target_uuid = uuid.UUID(target_identifier)
        except (ValueError, TypeError, AttributeError):
            target_uuid = None
        matches = User.objects.filter(
            Q(pk=target_uuid) |
            Q(email__iexact=target_identifier) |
            Q(mapped_email__iexact=target_identifier) |
            Q(student_profile__student_code__iexact=target_identifier),
            is_active=True,
        ).distinct()
        # Shared primary/mapped emails must never silently select a different role.
        if matches.count() > 1:
            raise ValidationError({"user_id": "Multiple accounts match; use the intended account UUID or student code."})
        target = matches.first()

        if target is None:
            raise ValidationError({"user_id": f"Candidate user not found for identifier '{target_identifier}'."})

        sender = request.user
        from common.access import is_admin, has_global_cohort_access, assigned_cohort_ids
        if getattr(sender, "role", "") in {"VOLUNTEER", "TRUSTEE"} and not has_global_cohort_access(sender):
            shared = target.pk == sender.pk or target.role == User.Role.ADMIN
            if target.role == User.Role.STUDENT:
                shared = target.student_profile.applications.filter(assigned_cohort_id__in=assigned_cohort_ids(sender)).exists()
            if not shared:
                raise PermissionDenied("The recipient must belong to an assigned cohort.")
        if getattr(sender, "role", "") == "MENTOR" and not getattr(sender, "is_superuser", False):
            target_role = getattr(target, "role", "")
            if target_role == User.Role.STUDENT:
                allowed = (
                    target.student_profile.applications.filter(assigned_cohort__mentors=sender).exists()
                    if hasattr(target, "student_profile") else False
                )
            elif target_role == User.Role.ADMIN:
                allowed = True
            elif target_role == User.Role.VOLUNTEER:
                allowed = target.volunteered_cohorts.filter(mentors=sender).exists()
            elif target_role == User.Role.COMPANY:
                allowed = True
            else:
                allowed = False
            if not allowed:
                raise PermissionDenied(
                    "Mentors can message assigned students, platform Admins, Volunteers in their cohorts, and Companies."
                )

        notification = Notification.objects.create(
            user=target,
            title=data["title"],
            message=data["message"],
            notification_type=data.get("notification_type", Notification.Type.INFO),
            action_url=data.get("action_url", ""),
        )
        return Response(NotificationSerializer(notification).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post", "delete"], url_path="push/mobile")
    def mobile_push(self, request):
        from rest_framework import serializers
        from common.models import MobilePushDevice
        class RegistrationSerializer(serializers.Serializer):
            token = serializers.CharField(min_length=20, max_length=4096, trim_whitespace=True)
            account_session = serializers.UUIDField()
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if request.method == "DELETE":
            MobilePushDevice.objects.filter(user=request.user, token=data["token"], account_session=data["account_session"]).update(is_active=False)
        else:
            MobilePushDevice.objects.update_or_create(token=data["token"], defaults={
                "user": request.user, "account_session": data["account_session"], "is_active": True
            })
        return Response({"registered": request.method == "POST"})

    @action(detail=False, methods=["post"], url_path="push/delivery")
    def mobile_push_delivery(self, request):
        """Record device receipt/display timing without trusting a user identity in the body."""
        from rest_framework import serializers
        from common.models import MobilePushDelivery, MobilePushDevice

        class DeliverySerializer(serializers.Serializer):
            notification_id = serializers.UUIDField()
            account_session = serializers.UUIDField()
            event_type = serializers.ChoiceField(choices=["CLASS_STARTING_SOON", "CLASS_STARTED"])
            class_id = serializers.CharField(max_length=64)
            scheduled_at = serializers.DateTimeField()
            sent_at = serializers.DateTimeField()
            device_received_at = serializers.DateTimeField()
            notification_displayed_at = serializers.DateTimeField(required=False, allow_null=True)
            transport_latency_ms = serializers.IntegerField(min_value=0, max_value=86_400_000)
            schedule_lateness_ms = serializers.IntegerField(min_value=0, max_value=86_400_000)

        serializer = DeliverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        notification = Notification.objects.filter(
            pk=data["notification_id"],
            user=request.user,
        ).first()
        if notification is None:
            return Response({"detail": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)
        expected_action = f"/attendance/{data['class_id']}/"
        expected_key = f"attendance:{data['class_id']}:schedule"
        if (notification.action_url or "").strip() != expected_action or notification.dedupe_key != expected_key:
            return Response({"detail": "Notification does not match this class."}, status=status.HTTP_400_BAD_REQUEST)
        device = MobilePushDevice.objects.filter(
            user=request.user,
            account_session=data["account_session"],
            is_active=True,
        ).order_by("-updated_at").first()
        if device is None:
            return Response({"detail": "Active device registration required."}, status=status.HTTP_403_FORBIDDEN)
        delivery, created = MobilePushDelivery.objects.update_or_create(
            notification=notification,
            device=device,
            event_type=data["event_type"],
            defaults={
                "user": request.user,
                "account_session": data["account_session"],
                "class_id": data["class_id"],
                "scheduled_at": data["scheduled_at"],
                "server_sent_at": data["sent_at"],
                "device_received_at": data["device_received_at"],
                "notification_displayed_at": data.get("notification_displayed_at"),
                "transport_latency_ms": data["transport_latency_ms"],
                "schedule_lateness_ms": data["schedule_lateness_ms"],
            },
        )
        return Response(
            {"recorded": True, "delivery_id": str(delivery.pk)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="push/subscribe")
    def subscribe(self, request):
        """Register a browser push subscription for the authenticated user."""
        endpoint = request.data.get("endpoint")
        keys = request.data.get("keys", {})
        p256dh = keys.get("p256dh")
        auth = keys.get("auth")
        
        if not endpoint or not p256dh or not auth:
            return Response({"error": "Missing push credentials"}, status=status.HTTP_400_BAD_REQUEST)
            
        from common.models import PushSubscription
        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "user": request.user,
                "p256dh": p256dh,
                "auth": auth,
                "is_active": True,
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:250]
            }
        )
        return Response({"status": "subscribed"})

    @action(detail=False, methods=["delete"], url_path="push/unsubscribe")
    def unsubscribe(self, request):
        """Unregister a browser push subscription."""
        endpoint = request.data.get("endpoint")
        if endpoint:
            from common.models import PushSubscription
            PushSubscription.objects.filter(user=request.user, endpoint=endpoint).update(is_active=False)
        return Response({"status": "unsubscribed"})

    @action(detail=False, methods=["get"], url_path="push/public-key")
    def public_key(self, request):
        """Retrieve the public VAPID key for browser push subscriptions."""
        from django.conf import settings
        pub_key = getattr(settings, 'WEB_PUSH_VAPID_PUBLIC_KEY', None)
        if not pub_key:
            return Response({"error": "VAPID public key not configured"}, status=status.HTTP_501_NOT_IMPLEMENTED)
        return Response({"public_key": pub_key})

    @action(detail=True, methods=["post"], url_path="mark-read")
    @transaction.atomic
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification = Notification.objects.select_for_update().get(pk=notification.pk, user=request.user)
        notification.is_read = True
        notification.save(update_fields=["is_read", "updated_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=True, methods=["post"], url_path="mark-unread")
    @transaction.atomic
    def mark_unread(self, request, pk=None):
        notification = self.get_object()
        notification = Notification.objects.select_for_update().get(pk=notification.pk, user=request.user)
        notification.is_read = False
        notification.save(update_fields=["is_read", "updated_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=True, methods=["post"], url_path="mark_read")
    def mark_read_underscore(self, request, pk=None):
        return self.mark_read(request, pk=pk)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    @transaction.atomic
    def mark_all_read(self, request):
        ids = list(self.get_queryset().filter(is_read=False).values_list("pk", flat=True))
        rows = Notification.objects.filter(pk__in=ids, user=request.user)
        list(rows.select_for_update().values_list("pk", flat=True))
        updated = rows.update(is_read=True, updated_at=timezone.now())
        return Response({"updated": updated})

    @action(detail=False, methods=["post"], url_path="mark_all_read")
    def mark_all_read_underscore(self, request):
        return self.mark_all_read(request)


class UserRequestViewSet(viewsets.ModelViewSet):
    """
    Support & Issue Resolution Requests submitted by Students, Mentors, or Volunteers to Admins.
    """
    serializer_class = UserRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from common.access import visible_support_requests
        from rest_framework.exceptions import ValidationError
        user = self.request.user
        qs = visible_support_requests(user).order_by("-created_at", "-id")
        scope = self.request.query_params.get("scope")
        if scope == "mine":
            qs = qs.filter(sender=user)
        elif scope == "received":
            qs = qs.exclude(sender=user)
        elif scope not in (None, "", "all"):
            raise ValidationError({"scope": "Use mine, received, or all."})

        # Optional filters
        category = self.request.query_params.get("category")
        req_status = self.request.query_params.get("status")
        if category:
            qs = qs.filter(category__iexact=category)
        if req_status:
            qs = qs.filter(status__iexact=req_status)
        return qs

    def perform_update(self, serializer):
        from common.access import is_admin
        from rest_framework.exceptions import PermissionDenied
        if serializer.instance.sender_id != self.request.user.pk and not is_admin(self.request.user):
            raise PermissionDenied("Only the sender can edit this request.")
        serializer.save()

    def perform_destroy(self, instance):
        from common.access import is_admin
        from rest_framework.exceptions import PermissionDenied
        if instance.sender_id != self.request.user.pk and not is_admin(self.request.user):
            raise PermissionDenied("Only the sender can delete this request.")
        instance.delete()

    def perform_create(self, serializer):
        request_obj = serializer.save(
            sender=self.request.user,
            sender_role=getattr(self.request.user, 'role', 'USER')
        )
        try:
            from common.services.notifications import notify_admins
            notify_admins(
                title=f"New {request_obj.get_category_display()}",
                message=(
                    f"{request_obj.sender_role.title()} "
                    f"{self.request.user.get_full_name() or self.request.user.email} has submitted a new "
                    f"{request_obj.get_category_display()}."
                ),
                notification_type="ACTION_REQUIRED",
                action_url="support_requests"
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Support request saved; admin notification failed")

    def _can_manage_requests(self, request):
        role = getattr(request.user, 'role', '')
        return request.user.is_superuser or role in ['ADMIN', 'VOLUNTEER', 'TRUSTEE']

    @action(detail=True, methods=["post"], url_path="update-status")
    @transaction.atomic
    def update_status(self, request, pk=None):
        """
        Admin/Volunteer only: Transition a request status and optionally add admin_remarks.
        Validates allowed transitions:
          PENDING → IN_PROGRESS, RESOLVED, REJECTED
          IN_PROGRESS → RESOLVED, REJECTED
          RESOLVED / REJECTED → CLOSED
        """
        if not self._can_manage_requests(request):
            return Response(
                {"error": "Only admins and volunteers can update request status."},
                status=status.HTTP_403_FORBIDDEN,
            )
        from .serializers import UserRequestAdminResolveSerializer
        user_request = self.get_object()
        user_request = self.get_queryset().select_for_update().get(pk=user_request.pk)
        # "My sent requests" are visible to their sender, but status changes are
        # reserved for the assigned reviewer.  Without this check a volunteer
        # could resolve their own request simply because it was in their scoped
        # query set.
        if user_request.sender_id == request.user.id and not (
            request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"
        ):
            return Response(
                {"error": "Only a reviewer can update the status of this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = UserRequestAdminResolveSerializer(
            data=request.data,
            context={"request_obj": user_request}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from django.utils import timezone
        new_status = data["new_status"]
        user_request.status = new_status
        if data.get("admin_remarks"):
            user_request.admin_remarks = data["admin_remarks"]
        if new_status in (UserRequest.Status.RESOLVED, UserRequest.Status.REJECTED, UserRequest.Status.CLOSED):
            user_request.resolved_by = request.user
            user_request.resolved_at = timezone.now()
        user_request.save(update_fields=["status", "admin_remarks", "resolved_by", "resolved_at", "updated_at"])

        # Deliver after the status transaction commits, so a notification cannot
        # announce a state that was subsequently rolled back.
        requester_id = user_request.sender_id
        request_id = user_request.id
        request_number = user_request.request_number
        subject = user_request.subject
        remarks = user_request.admin_remarks
        status_label = user_request.get_status_display()
        notification_type = (
            "SUCCESS" if new_status == UserRequest.Status.RESOLVED
            else "WARNING" if new_status == UserRequest.Status.REJECTED
            else "INFO"
        )

        def notify_requester():
            try:
                from accounts.models import User
                from common.models import Notification
                from common.services.notifications import notify_user

                requester = User.objects.get(pk=requester_id)
                notify_user(
                    user=requester,
                    title=f"Request {request_number} — {status_label}",
                    message=(
                        f"Your support request '{subject}' has been updated to {status_label}."
                        + (f" Note: {remarks}" if remarks else "")
                    ),
                    notification_type=getattr(Notification.Type, notification_type),
                    dedupe_key=f"userrequest:{request_id}:status",
                )
            except Exception:
                logger.warning("Support-request status notification failed for request %s", request_id)

        transaction.on_commit(notify_requester)

        return Response(UserRequestSerializer(user_request).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="pending-count")
    def pending_count(self, request):
        """Admin/Volunteer only: count of PENDING requests, optionally filtered by category."""
        if not self._can_manage_requests(request):
            return Response({"error": "Admin or Volunteer access required."}, status=status.HTTP_403_FORBIDDEN)
            
        qs = self.get_queryset().filter(status=UserRequest.Status.PENDING)
                
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category)
        return Response({"pending_count": qs.count()})

    @action(detail=True, methods=["post"], url_path="message")
    def message(self, request, pk=None):
        """Admin/Volunteer only: Send a direct in-app notification message to the student regarding this request."""
        if not self._can_manage_requests(request):
            return Response({"error": "Only admins and volunteers can message."}, status=status.HTTP_403_FORBIDDEN)
            
        message_text = request.data.get("message")
        if not message_text:
            return Response({"error": "Message text is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        user_request = self.get_object()
        if user_request.sender_id == request.user.id and not (
            request.user.is_superuser or getattr(request.user, "role", "") == "ADMIN"
        ):
            return Response(
                {"error": "Only a reviewer can message the requester."},
                status=status.HTTP_403_FORBIDDEN,
            )
        student_user = user_request.sender
        
        from common.services.notifications import notify_user
        from common.models import Notification
        
        notify_user(
            user=student_user,
            title=f"Admin Message: Request {user_request.request_number}",
            message=message_text,
            notification_type=Notification.Type.INFO,
            action_url="support_requests",
            dedupe_key=f"userrequest:{user_request.id}:msg:{timezone.now().timestamp()}"
        )
        
        return Response({"detail": "Message sent successfully to the student."}, status=status.HTTP_200_OK)


class AchievementViewSet(viewsets.ModelViewSet):
    """
    Achievements can be created and managed by AnnouncementManagers.
    Publicly visible if is_published=True.
    """
    serializer_class = AchievementSerializer
    
    def get_permissions(self):
        from common.permissions import IsAnnouncementManager
        from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsAnnouncementManager()]
        return [IsAuthenticatedOrReadOnly()]

    def get_queryset(self):
        qs = Achievement.objects.select_related("created_by", "student", "cohort", "course").order_by("-date_awarded", "-created_at")
        user = self.request.user
        if user.is_authenticated and (user.is_staff or getattr(user, 'role', '') in ['ADMIN', 'MENTOR', 'TRUSTEE']):
            return qs
        return qs.filter(is_published=True)
        
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class OrganizationalUpdateViewSet(viewsets.ModelViewSet):
    """
    Organizational updates created by AnnouncementManagers.
    Publicly visible if is_published=True.
    """
    serializer_class = OrganizationalUpdateSerializer
    
    def get_permissions(self):
        from common.permissions import IsAnnouncementManager
        from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsAnnouncementManager()]
        return [IsAuthenticatedOrReadOnly()]

    def get_queryset(self):
        qs = OrganizationalUpdate.objects.select_related("created_by").order_by("-event_date", "-created_at")
        user = self.request.user
        if user.is_authenticated and (user.is_staff or getattr(user, 'role', '') in ['ADMIN', 'MENTOR', 'TRUSTEE']):
            return qs
        return qs.filter(is_published=True)
        
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

def calculate_platform_stats():
    """Helper method to calculate platform statistics synchronously."""
    from students.models import StudentProfile, StudentPlacement
    from applications.models import Application
    from certificates.models import Certificate
    from cohorts.models import Cohort
    from accounts.models import User, AdministratorProfile
    from companies.models import Company
    from django.db.models import Q, Count, Case, When, Value, CharField, Exists, OuterRef

    # Authoritative active student population
    base_students_qs = StudentProfile.objects.filter(user__role=User.Role.STUDENT, user__is_active=True)
    total_students = base_students_qs.count()
    
    # Total applications processed
    total_applications = Application.objects.count()
    
    # Total unique students who completed their training
    students_completed = Application.objects.filter(status='COMPLETED').values('student_id').distinct().count()
    
    # Total certificates issued
    certificates_issued = Certificate.objects.filter(status='ACTIVE').count()
    
    # Verified Students Placed (CSR authoritative metric)
    verified_students_placed = StudentPlacement.objects.filter(status=StudentPlacement.Status.VERIFIED).values('student_id').distinct().count()

    # Active and completed cohorts
    active_cohorts = Cohort.objects.filter(status='ACTIVE').count()
    
    # Total cohorts completed
    completed_cohorts = Cohort.objects.filter(status='COMPLETED').count()
    
    # Unique students placed (Assigned to internship) [Legacy field]
    legacy_students_placed = Application.objects.filter(status='INTERNSHIP_ASSIGNED').values('student_id').distinct().count()

    # --- CSR Nested Metrics (Legacy overlapping counts) ---
    students_training = Application.objects.filter(status='TRAINING').values('student_id').distinct().count()
    students_internship = Application.objects.filter(status='INTERNSHIP_ASSIGNED').values('student_id').distinct().count()

    # --- NEW: Mutually Exclusive Student Impact Journey ---
    is_placed = StudentPlacement.objects.filter(student=OuterRef('pk'), status=StudentPlacement.Status.VERIFIED)
    has_soft_skills_or_completed = Application.objects.filter(student=OuterRef('pk'), status__in=[Application.Status.SOFT_SKILLS, Application.Status.COMPLETED])
    has_internship = Application.objects.filter(student=OuterRef('pk'), status=Application.Status.INTERNSHIP_ASSIGNED)
    has_training = Application.objects.filter(student=OuterRef('pk'), status=Application.Status.TRAINING)

    journey_qs = base_students_qs.annotate(
        is_placed=Exists(is_placed),
        has_soft_skills_completed=Exists(has_soft_skills_or_completed),
        has_internship=Exists(has_internship),
        has_training=Exists(has_training)
    ).annotate(
        highest_milestone=Case(
            When(is_placed=True, then=Value('PLACED')),
            When(has_soft_skills_completed=True, then=Value('SOFT_SKILLS_COMPLETED')),
            When(has_internship=True, then=Value('INTERNSHIP')),
            When(has_training=True, then=Value('TRAINING')),
            default=Value('BEFORE_COHORT'),
            output_field=CharField(),
        )
    ).values('highest_milestone').annotate(count=Count('id', distinct=True))

    journey_counts = {item['highest_milestone']: item['count'] for item in journey_qs}

    journey_active_before_cohort = journey_counts.get('BEFORE_COHORT', 0)
    journey_training = journey_counts.get('TRAINING', 0)
    journey_internship = journey_counts.get('INTERNSHIP', 0)
    journey_soft_skills_completed = journey_counts.get('SOFT_SKILLS_COMPLETED', 0)
    journey_placed = journey_counts.get('PLACED', 0)

    # People Metrics
    total_mentors = User.objects.filter(role=User.Role.MENTOR).count()
    total_volunteers = User.objects.filter(role=User.Role.VOLUNTEER).count()
    
    trustee_query = Q(role=User.Role.TRUSTEE) | Q(admin_profile__category=AdministratorProfile.Category.TRUSTEE)
    total_trustees = User.objects.filter(trustee_query).distinct().count()

    advisor_query = Q(admin_profile__category=AdministratorProfile.Category.ADVISORY)
    total_advisors = User.objects.filter(advisor_query).count()

    # Industry Metrics
    total_companies = Company.objects.count()

    return {
        # Legacy Fields Preserved
        "total_students_benefited": total_students,
        "total_applications_processed": total_applications,
        "students_completed_training": students_completed,
        "certificates_issued": certificates_issued,
        "active_cohorts": active_cohorts,
        "completed_cohorts": completed_cohorts,
        "students_placed": legacy_students_placed,
        
        # New Nested CSR Metrics
        "students": {
            "total": total_students,
            "training": students_training,
            "internship": students_internship,
            "completed": students_completed,
            "placed": verified_students_placed,
            "benefited": total_students,
            
            "journey": {
                "active_before_cohort": journey_active_before_cohort,
                "training": journey_training,
                "internship": journey_internship,
                "soft_skills_completed": journey_soft_skills_completed,
                "placed": journey_placed
            }
        },
        "people": {
            "mentors": total_mentors,
            "volunteers": total_volunteers,
            "trustees": total_trustees,
            "advisors": total_advisors
        },
        "industry": {
            "companies": total_companies
        }
    }


class PlatformStatisticsView(APIView):
    """
    Returns authoritative platform statistics calculated directly from the database.
    Implemented with cache-stampede protection.
    
    IMPORTANT: The CSR dashboard must use ONLY `students.placed`, which is authoritative (and currently null). 
    It must never use the legacy `students_placed` as the CSR placement metric, which is preserved ONLY for backward compatibility.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from django.core.cache import cache
        import time
        import logging
        
        logger = logging.getLogger(__name__)
        cache_key = 'platform:analytics:stats'
        lock_key = f"{cache_key}:lock"
        
        try:
            cached_data = cache.get(cache_key)
            if cached_data:
                return Response(cached_data)
        except Exception as e:
            logger.warning(f"Redis cache GET failed: {e}")
            # Fallback to direct calculation if cache is entirely down
            return Response(calculate_platform_stats())
            
        # Cache Miss - Stampede Protection
        try:
            lock_acquired = cache.add(lock_key, '1', timeout=30)
        except Exception as e:
            logger.warning(f"Redis cache ADD (lock) failed: {e}")
            # If cache is down, we can't lock. Just calculate and return.
            return Response(calculate_platform_stats())
            
        if lock_acquired:
            try:
                # Acquired lock: aggregate data
                data = calculate_platform_stats()
                # Store with 24 hours TTL - Celery will refresh it hourly
                try:
                    cache.set(cache_key, data, timeout=86400)
                except Exception as e:
                    logger.warning(f"Redis cache SET failed: {e}")
                return Response(data)
            finally:
                try:
                    cache.delete(lock_key)
                except Exception:
                    pass
        else:
            # Lock denied: wait up to 5 seconds for the other worker
            for _ in range(10):
                time.sleep(0.5)
                try:
                    cached_data = cache.get(cache_key)
                    if cached_data:
                        return Response(cached_data)
                except Exception:
                    # If cache fails during polling, break out and calculate directly
                    return Response(calculate_platform_stats())
                    
            return Response(
                {"detail": "Statistics are currently being refreshed. Please try again in a few moments."},
                status=503
            )


class PublicPeopleView(APIView):
    """
    Returns public-safe profiles for Mentors, Volunteers, Trustees, and Advisors.
    No private data, emails, or internal IDs are serialized.
    Supports ?type= category filtering for scalability.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    
    def get(self, request):
        from accounts.models import AdministratorProfile
        from volunteers.models import MentorProfile, VolunteerProfile
        
        requested_type = request.query_params.get("type")
        
        allowed_types = ["mentors", "volunteers", "trustees", "advisors"]
        if requested_type and requested_type not in allowed_types:
            return Response(
                {"detail": f"Invalid type '{requested_type}'. Allowed types are: {', '.join(allowed_types)}."},
                status=400
            )
            
        response_data = {}
        
        # 1. Mentors
        if not requested_type or requested_type == "mentors":
            mentors = MentorProfile.objects.filter(user__is_active=True).select_related('user')
            mentor_data = []
            for m in mentors:
                mentor_data.append({
                    "name": m.user.get_full_name() or "Mentor",
                    "designation": m.designation,
                    "organization": m.company_name,
                    "bio": m.bio,
                    "linkedin_url": m.linkedin_url,
                    "photo": request.build_absolute_uri(m.profile_photo.url) if m.profile_photo else None
                })
            response_data["mentors"] = mentor_data
            
        # 2. Volunteers
        if not requested_type or requested_type == "volunteers":
            volunteers = VolunteerProfile.objects.filter(user__is_active=True).select_related('user')
            volunteer_data = []
            for v in volunteers:
                volunteer_data.append({
                    "name": v.user.get_full_name() or "Volunteer",
                    "designation": v.occupation,
                    "organization": v.organization_name,
                    "bio": v.bio,
                    "linkedin_url": v.linkedin_url,
                    "photo": request.build_absolute_uri(v.profile_photo.url) if v.profile_photo else None
                })
            response_data["volunteers"] = volunteer_data
            
        # 3. Trustees & Advisors
        if not requested_type or requested_type in ["trustees", "advisors"]:
            admins = AdministratorProfile.objects.filter(
                user__is_active=True, 
                is_public_leadership=True
            ).select_related('user')
            
            trustee_data = []
            advisor_data = []
            
            for a in admins:
                payload = {
                    "name": a.user.get_full_name() or "Board Member",
                    "designation": a.designation,
                    "organization": a.organization_affiliation,
                    "bio": a.bio,
                    "linkedin_url": a.linkedin_url,
                    "photo": None # AdministratorProfile does not have a photo field
                }
                if a.category == AdministratorProfile.Category.TRUSTEE:
                    trustee_data.append(payload)
                elif a.category == AdministratorProfile.Category.ADVISORY:
                    advisor_data.append(payload)
                    
            if not requested_type or requested_type == "trustees":
                response_data["trustees"] = trustee_data
            if not requested_type or requested_type == "advisors":
                response_data["advisors"] = advisor_data
                
        return Response(response_data)


class AppVersionCheckView(APIView):
    """
    Public endpoint polled by the Mobile App (Android/iOS) on startup to check for OTA updates.
    Returns the highest active versionCode release.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Check latest mobile app version for OTA updates",
        description="Returns the latest active version code, download URL, release notes, and mandatory update flag.",
        responses={200: AppReleaseSerializer, 404: dict},
        tags=["Mobile App"],
    )
    def get(self, request):
        latest = AppRelease.objects.filter(is_active=True).order_by("-version_code").first()
        if not latest:
            return Response(
                {"detail": "No active app releases found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = AppReleaseSerializer(latest, context={"request": request})
        return Response(serializer.data)

