import csv
from django import forms
from django.contrib import admin
from common.models import MobilePushDelivery, MobilePushDevice


@admin.register(MobilePushDevice)
class MobilePushDeviceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "is_active", "updated_at")
    fields = ("id", "user", "is_active", "created_at", "updated_at")
    readonly_fields = ("id", "user", "created_at", "updated_at")
    def has_add_permission(self, request):
        return False


@admin.register(MobilePushDelivery)
class MobilePushDeliveryAdmin(admin.ModelAdmin):
    list_display = (
        "user", "event_type", "class_id", "scheduled_at", "server_sent_at",
        "device_received_at", "transport_latency_ms", "schedule_lateness_ms",
    )
    list_filter = ("event_type", "scheduled_at", "device_received_at")
    search_fields = ("user__email", "class_id", "notification__id")
    readonly_fields = (
        "id", "notification", "device", "user", "account_session", "event_type",
        "class_id", "scheduled_at", "server_sent_at", "device_received_at",
        "notification_displayed_at", "transport_latency_ms", "schedule_lateness_ms",
        "created_at", "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

from django.http import HttpResponse
from django.utils import timezone

from .models import Announcement, FAQ, Notification, PushSubscription, SystemInformation, UserRequest, AppRelease


def export_announcements_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_announcements.csv"'
    writer = csv.writer(response)
    writer.writerow(["Title", "Target Audience", "Cohort", "Pinned", "Active", "Created At"])
    for a in queryset.select_related("cohort"):
        writer.writerow([
            a.title,
            a.target_audience,
            a.cohort.code if a.cohort else "N/A",
            "Yes" if a.is_pinned else "No",
            "Yes" if a.is_active else "No",
            a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "",
        ])
    return response

export_announcements_to_csv.short_description = "Export selected announcements to CSV"


def export_notifications_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_notifications.csv"'
    writer = csv.writer(response)
    writer.writerow(["User Email", "Title", "Type", "Read", "Created At"])
    for n in queryset.select_related("user"):
        writer.writerow([
            n.user.email if n.user else "",
            n.title,
            n.notification_type,
            "Yes" if n.is_read else "No",
            n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else "",
        ])
    return response

export_notifications_to_csv.short_description = "Export selected notifications to CSV"


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    def save_model(self, request, obj, form, change):
        from common.services.announcement_routing import dispatch_announcement
        super().save_model(request, obj, form, change)
        dispatch_announcement(obj)
    class AnnouncementAdminForm(forms.ModelForm):
        class Meta:
            model = Announcement
            fields = "__all__"

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            if not self.instance.pk:
                self.initial["target_audience"] = Announcement.TargetAudience.STUDENTS

        def clean(self):
            cleaned_data = super().clean()
            audience = cleaned_data.get("target_audience")
            cohort = cleaned_data.get("cohort")
            if audience == Announcement.TargetAudience.ALL and cohort is not None:
                self.add_error("cohort", "All Users cannot be combined with a cohort.")
            if audience == Announcement.TargetAudience.COHORT and cohort is None:
                self.add_error("cohort", "A cohort is required for a Specific Cohort announcement.")
            return cleaned_data

    form = AnnouncementAdminForm
    list_display = ("title", "target_audience", "cohort", "matched_recipients", "link_url", "is_pinned", "is_active", "created_at")
    search_fields = ("title", "message", "cohort__code", "link_url")
    list_filter = ("target_audience", "is_pinned", "is_active")
    actions = [export_announcements_to_csv]

    @admin.display(description="Matched recipients")
    def matched_recipients(self, obj):
        from common.services.announcement_routing import announcement_recipients
        return announcement_recipients(obj).count()


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return (*self.readonly_fields, "user") if obj else self.readonly_fields

    def save_model(self, request, obj, form, change):
        if change and {"title", "message", "notification_type", "action_url"}.intersection(form.changed_data):
            obj.is_read = False
        super().save_model(request, obj, form, change)
    list_display = ("title", "user", "notification_type", "is_read", "created_at")
    search_fields = ("title", "message", "user__email")
    list_filter = ("notification_type", "is_read")
    autocomplete_fields = ("user",)
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        ("Recipient", {"fields": ("user",)}),
        ("Personalized message", {"fields": ("title", "message", "notification_type")}),
        ("Action", {"fields": ("action_url", "is_read")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
    actions = [export_notifications_to_csv]


def export_push_subscriptions_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_push_subscriptions.csv"'
    writer = csv.writer(response)
    writer.writerow(["User Email", "Endpoint", "User Agent", "Active", "Last Used At", "Created At"])
    for s in queryset.select_related("user"):
        writer.writerow([
            s.user.email if s.user else "",
            s.endpoint,
            s.user_agent or "",
            "Yes" if s.is_active else "No",
            s.last_used_at.strftime("%Y-%m-%d %H:%M") if s.last_used_at else "",
            s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "",
        ])
    return response

export_push_subscriptions_to_csv.short_description = "Export selected push subscriptions to CSV"


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "endpoint", "user_agent", "is_active", "last_used_at", "created_at")
    search_fields = ("user__email", "endpoint", "user_agent")
    list_filter = ("is_active",)
    list_select_related = ("user",)
    readonly_fields = ("created_at", "updated_at", "last_used_at")
    fieldsets = (
        ("Subscriber", {"fields": ("user", "is_active")}),
        ("Web Push Subscription Keys", {"fields": ("endpoint", "p256dh", "auth", "user_agent", "last_used_at")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
    actions = [export_push_subscriptions_to_csv]


@admin.register(SystemInformation)
class SystemInformationAdmin(admin.ModelAdmin):
    list_display = ("key", "is_active", "updated_at")
    search_fields = ("key", "value")
    list_filter = ("is_active",)


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ("question", "category", "order", "is_active")
    search_fields = ("question", "answer", "category")
    list_filter = ("category", "is_active")


def export_user_requests_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_user_requests.csv"'
    writer = csv.writer(response)
    writer.writerow(["Request Number", "Sender Email", "Role", "Category", "Subject", "Status", "Resolved By", "Created At"])
    for req in queryset.select_related("sender", "resolved_by"):
        writer.writerow([
            req.request_number,
            req.sender.email if req.sender else "",
            req.sender_role,
            req.category,
            req.subject,
            req.status,
            req.resolved_by.email if req.resolved_by else "",
            req.created_at.strftime("%Y-%m-%d %H:%M") if req.created_at else "",
        ])
    return response

export_user_requests_to_csv.short_description = "Export selected user requests to CSV"


class UserRequestAdminForm(forms.ModelForm):
    class Meta:
        model = UserRequest
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        if self.instance.pk and not (cleaned_data.get("admin_remarks") or "").strip():
            self.add_error(
                "admin_remarks",
                "Admin remarks are required before this request update can be submitted.",
            )
        return cleaned_data


@admin.register(UserRequest)
class UserRequestAdmin(admin.ModelAdmin):
    form = UserRequestAdminForm
    list_display = (
        "request_number", "sender", "sender_role", "category", "status", "related_application",
        "has_admin_response", "resolved_at", "created_at",
    )
    search_fields = ("request_number", "subject", "description", "admin_remarks", "sender__email")
    list_filter = ("status", "category", "sender_role")
    readonly_fields = ("request_number", "sender", "sender_role", "related_application", "resolved_by", "resolved_at", "created_at", "updated_at")
    fieldsets = (
        ("Request", {"fields": ("request_number", "sender", "sender_role", "category", "subject", "description", "attachment", "related_application")}),
        ("Admin response shown in the app", {"fields": ("status", "admin_remarks")}),
        ("Resolution audit", {"fields": ("resolved_by", "resolved_at", "created_at", "updated_at")}),
    )
    actions = [export_user_requests_to_csv]

    @admin.display(boolean=True, description="Admin response")
    def has_admin_response(self, obj):
        return bool((obj.admin_remarks or "").strip())

    def save_model(self, request, obj, form, change):
        terminal_statuses = {
            UserRequest.Status.RESOLVED,
            UserRequest.Status.REJECTED,
            UserRequest.Status.CLOSED,
        }
        response_changed = bool({"status", "admin_remarks"}.intersection(form.changed_data))
        if obj.status in terminal_statuses:
            obj.resolved_by = request.user
            obj.resolved_at = timezone.now()
        else:
            obj.resolved_by = None
            obj.resolved_at = None
        super().save_model(request, obj, form, change)

        if response_changed and (obj.admin_remarks or "").strip():
            Notification.objects.create(
                user=obj.sender,
                title=f"Admin responded to {obj.request_number}",
                message=obj.admin_remarks.strip(),
                notification_type=(
                    Notification.Type.SUCCESS
                    if obj.status == UserRequest.Status.RESOLVED
                    else Notification.Type.INFO
                ),
                action_url="support_requests",
            )

        is_student = (obj.sender_role == "STUDENT") or (getattr(obj.sender, "role", "") == "STUDENT")
        if response_changed and is_student and obj.category in {UserRequest.Category.LEAVE_REQUEST, UserRequest.Category.ATTENDANCE}:
            student_profile = getattr(obj.sender, "student_profile", None)
            if student_profile:
                from applications.models import Application
                from attendance.models import AbsenceWarning

                from applications.services.state_machine import transition_application_status

                if obj.status == UserRequest.Status.RESOLVED:
                    AbsenceWarning.objects.filter(student=student_profile, status="PENDING").update(
                        status="ACCEPTED", resolved=True
                    )
                    suspended_apps = Application.objects.filter(student=student_profile, status="SUSPENDED")
                    for app in suspended_apps:
                        transition_application_status(
                            app,
                            Application.Status.IN_PROGRESS,
                            user=request.user,
                            reason=f"Cohort suspension revoked following approved leave request {obj.request_number}.",
                        )
                elif obj.status == UserRequest.Status.REJECTED:
                    AbsenceWarning.objects.filter(student=student_profile, status="PENDING").update(
                        status="REJECTED", resolved=False
                    )
                    active_apps = Application.objects.filter(
                        student=student_profile,
                        status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED"]
                    )
                    for app in active_apps:
                        transition_application_status(
                            app,
                            Application.Status.SUSPENDED,
                            user=request.user,
                            reason=f"Cohort access suspended following rejected leave request {obj.request_number}.",
                        )


@admin.register(AppRelease)
class AppReleaseAdmin(admin.ModelAdmin):
    list_display = ("version_display", "version_code", "is_mandatory", "is_active", "file_size_display", "created_at")
    list_filter = ("is_mandatory", "is_active")
    search_fields = ("version_name", "release_notes")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        ("Version Details", {
            "fields": ("version_code", "version_name", "is_active", "is_mandatory"),
        }),
        ("APK Distribution", {
            "fields": ("apk_file", "download_url", "file_size_bytes"),
            "description": "Upload the compiled .apk file directly, or provide a public CDN/S3 URL. If APK is uploaded, file size and download URL are resolved automatically.",
        }),
        ("Release Notes", {
            "fields": ("release_notes",),
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )

    @admin.display(description="Version")
    def version_display(self, obj):
        return f"v{obj.version_name}"

    @admin.display(description="Size")
    def file_size_display(self, obj):
        bytes_val = obj.file_size_bytes or (obj.apk_file.size if obj.apk_file else None)
        if not bytes_val:
            return "-"
        mb = bytes_val / (1024 * 1024)
        return f"{mb:.2f} MB ({bytes_val:,} bytes)"

