from datetime import datetime
from django.contrib import admin
from django.urls import path
from django.utils.html import format_html

from accounts.models import User
from .models import PriorPermission


@admin.register(PriorPermission)
class PriorPermissionAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "student", "granted_by")
    readonly_fields = ("session", "student", "granted_by", "reason")
    def has_add_permission(self, request):
        return False
from common.access import assigned_cohort_ids, has_global_cohort_access
from .models import (
    AbsenceWarning,
    Attendance,
    AttendanceRecord,
    AttendanceSummary,
    ClassSchedule,
    PermissionRequestMessage,
    RecurringSchedule,
)


@admin.register(ClassSchedule)
class ClassScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "class_type_display",
        "cohort",
        "lst_batch_display",
        "class_date",
        "start_time",
        "end_time",
        "class_status",
        "google_meet",
        "calendar_event_id",
    )
    list_filter = ("class_type", "lst_batch", "class_status", "class_date", "cohort")
    search_fields = ("title", "cohort__code", "calendar_event_id", "meeting_link")

    fieldsets = (
        (
            "Class Identification & Domain Type",
            {
                "fields": (
                    "class_type",
                    "lst_batch",
                    "title",
                    "cohort",
                    "course",
                ),
                "description": "Select the domain type (Regular Domain Class, LST, Soft Skills Training, Celebration, or Training Session) and assigned Cohort/Batch.",
            },
        ),
        (
            "Schedule Timing & Status",
            {
                "fields": (
                    "class_date",
                    "start_time",
                    "end_time",
                    "class_status",
                    "conducted_by",
                )
            },
        ),
        (
            "Google Meet & Calendar Integration",
            {
                "fields": ("meeting_link", "calendar_event_id"),
                "description": (
                    "Leave Meeting Link blank to auto-generate a live Google Meet link via Google Calendar API, "
                    "or paste a custom Google Meet URL to manually override."
                ),
            },
        ),
        (
            "Whitelisted Guest Emails & Notes",
            {
                "fields": ("whitelisted_guest_emails", "notes"),
                "description": "Enter JSON list of external guest emails allowed to join the Google Meet session.",
            },
        ),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if has_global_cohort_access(request.user):
            return qs
        cohort_ids = assigned_cohort_ids(request.user)
        return qs.filter(cohort_id__in=cohort_ids)

    @admin.display(description="Class Domain / Type")
    def class_type_display(self, obj):
        return obj.get_class_type_display() if hasattr(obj, "get_class_type_display") else obj.class_type

    @admin.display(description="Batch")
    def lst_batch_display(self, obj):
        return obj.lst_batch or "-"

    @admin.display(description="Google Meet Link")
    def google_meet(self, obj):
        if not obj.meeting_link:
            return "No link"
        return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', obj.meeting_link, obj.meeting_link)

    def save_model(self, request, obj, form, change):
        is_new = not change
        student_emails = []
        
        # 1. Gather all required emails via AttendeeResolver
        if obj.class_type in ["LST", "UNIVERSAL", "SOFTSKILLS", "DOMAIN"]:
            from attendance.services.attendee_resolver import AttendeeResolver
            resolved_emails = AttendeeResolver.resolve_emails_by_criteria(
                class_type=obj.class_type, 
                cohort_id=obj.cohort.id if obj.cohort else None, 
                lst_batch=obj.lst_batch
            )
            student_emails = list(resolved_emails)
        
        if obj.whitelisted_guest_emails:
            student_emails = list(set(student_emails + obj.whitelisted_guest_emails))

        # 2. Auto-generate Google Meet if meeting link is blank
        if not obj.meeting_link and (obj.cohort or obj.lst_batch):
            from attendance.services.google_meet_service import generate_google_meet

            start_dt = datetime.combine(obj.class_date, obj.start_time or datetime.min.time())
            end_dt = datetime.combine(obj.class_date, obj.end_time or datetime.max.time())

            meet_link, event_id = generate_google_meet(
                session_title=obj.title,
                start_datetime=start_dt,
                end_datetime=end_dt,
                attendee_emails=student_emails,
            )
            if meet_link:
                obj.meeting_link = meet_link
                obj.calendar_event_id = event_id
            elif not obj.meeting_link and obj.cohort and obj.cohort.meeting_link:
                obj.meeting_link = obj.cohort.meeting_link
                
        # 2b. If an existing session is being cancelled, reconcile discipline
        reconcile_cancellation = False
        if obj.class_status == "CANCELLED":
            # Check old status from db
            old_obj = obj.__class__.objects.filter(pk=obj.pk).first()
            if old_obj and old_obj.class_status != "CANCELLED":
                reconcile_cancellation = True
                
                from attendance.services.google_calendar_lifecycle import safe_delete_google_meet
                actor = getattr(request.user, "email", "ADMIN_USER")
                status_result = safe_delete_google_meet(obj.calendar_event_id, attendance_id=obj.id, actor=f"ADMIN_CANCEL:{actor}")
                if status_result == "FAILED":
                    from django.core.exceptions import ValidationError
                    raise ValidationError("Failed to cancel Google Calendar event. The session cannot be cancelled until the event is cleaned up.")

        super().save_model(request, obj, form, change)
        
        if reconcile_cancellation:
            from attendance.services.discipline_reconciliation_service import reconcile_session_discipline_after_change
            try:
                reconcile_session_discipline_after_change(obj.id, action_type="CANCELLED")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to reconcile discipline after cancelling session {obj.id}: {e}")

        # 3. Dispatch ZeptoMail invitations if it's a new record
        if is_new and obj.class_type in ["LST", "UNIVERSAL", "SOFTSKILLS"]:
            start_dt = datetime.combine(obj.class_date, obj.start_time or datetime.min.time())
            start_str = start_dt.strftime("%Y-%m-%d %I:%M %p")
            
            # Send to students
            if student_emails:
                try:
                    from common.tasks import send_async_session_invitations_task
                    send_async_session_invitations_task.delay(
                        recipient_emails=student_emails,
                        session_title=obj.title,
                        start_time_str=start_str,
                        meeting_link=obj.meeting_link,
                        session_id=str(obj.id)
                    )
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to queue ZeptoMail invitations for admin session {obj.id}: {e}")

            # Send to guests (whitelist students)
            guest_emails = obj.guest_emails or obj.whitelisted_guest_emails
            if guest_emails:
                try:
                    from common.tasks import send_async_guest_invitations_task
                    send_async_guest_invitations_task.delay(
                        recipient_emails=guest_emails,
                        session_title=obj.title,
                        start_time_str=start_str,
                        meeting_link=obj.meeting_link,
                        session_id=str(obj.id)
                    )
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to queue guest ZeptoMail invitations for admin session {obj.id}: {e}")

    def delete_model(self, request, obj):
        from attendance.services.google_calendar_lifecycle import safe_delete_google_meet
        actor = getattr(request.user, "email", "ADMIN_USER")
        status_result = safe_delete_google_meet(obj.calendar_event_id, attendance_id=obj.id, actor=f"ADMIN_DELETE:{actor}")
        if status_result == "FAILED":
            from django.core.exceptions import ValidationError
            raise ValidationError("Failed to delete Google Calendar event. The session cannot be deleted until the event is cleaned up.")
            
        from attendance.services.discipline_reconciliation_service import reconcile_session_discipline_after_change
        try:
            reconcile_session_discipline_after_change(obj.id, action_type="DELETED")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to reconcile discipline before deleting session {obj.id}: {e}")
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        from attendance.services.discipline_reconciliation_service import reconcile_session_discipline_after_change
        from attendance.services.google_calendar_lifecycle import safe_delete_google_meet
        import logging
        logger = logging.getLogger(__name__)
        actor = getattr(request.user, "email", "ADMIN_USER")
        
        success_ids = []
        failed_count = 0
        for obj in queryset:
            status_result = safe_delete_google_meet(obj.calendar_event_id, attendance_id=obj.id, actor=f"ADMIN_BULK_DELETE:{actor}")
            if status_result == "FAILED":
                failed_count += 1
                logger.error(f"Bulk delete: Google API failed for {obj.id}")
                continue
                
            success_ids.append(obj.id)
            try:
                reconcile_session_discipline_after_change(obj.id, action_type="DELETED")
            except Exception as e:
                logger.error(f"Failed to reconcile discipline before deleting session {obj.id} in bulk: {e}")
                
        if failed_count > 0:
            from django.contrib import messages
            messages.warning(request, f"{failed_count} classes could not be deleted because Google Calendar cleanup failed. They have been preserved.")
            
        successful_qs = queryset.model.objects.filter(id__in=success_ids)
        super().delete_queryset(request, successful_qs)


@admin.register(Attendance)
class AttendanceAdmin(ClassScheduleAdmin):
    """Main Attendance admin registered for attendance.Attendance model."""
    pass


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "class_type_display",
        "cohort_display",
        "batch_display",
        "class_date",
        "present_students_count",
        "absent_students_count",
        "attendance_rate_display",
        "google_meet",
    )
    list_filter = ("class_type", "lst_batch", "class_date", "cohort")
    search_fields = ("title", "cohort__code")
    readonly_fields = (
        "title",
        "class_type",
        "cohort",
        "lst_batch",
        "class_date",
        "present_students_list",
        "absent_students_list",
        "attendance_rate_display",
        "meeting_link",
        "recording_link",
    )

    fieldsets = (
        ("Class Information", {"fields": ("title", "class_type", "cohort", "lst_batch", "class_date")}),
        ("Attendance Rate & Summary", {"fields": ("attendance_rate_display",)}),
        ("Present Students", {"fields": ("present_students_list",)}),
        ("Absent Students", {"fields": ("absent_students_list",)}),
        ("Meeting & Recordings", {"fields": ("meeting_link", "recording_link")}),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if has_global_cohort_access(request.user):
            return qs
        cohort_ids = assigned_cohort_ids(request.user)
        return qs.filter(cohort_id__in=cohort_ids)

    @admin.display(description="Domain / Type")
    def class_type_display(self, obj):
        try:
            return obj.get_class_type_display() if hasattr(obj, "get_class_type_display") else getattr(obj, "class_type", "-")
        except Exception:
            return "-"

    @admin.display(description="Cohort")
    def cohort_display(self, obj):
        try:
            return obj.cohort.code if (obj.cohort and getattr(obj.cohort, "code", None)) else "-"
        except Exception:
            return "-"

    @admin.display(description="Batch")
    def batch_display(self, obj):
        try:
            return obj.lst_batch or "-"
        except Exception:
            return "-"

    @admin.display(description="Present Count")
    def present_students_count(self, obj):
        try:
            gdata = obj.google_meet_attendance_data
            if gdata and gdata.get("status") == "READY":
                expected = gdata.get("expected_students") or {}
                return sum(
                    1 for s in expected.values()
                    if s.get("duration_seconds", 0) > 0 or s.get("join_time")
                )
            return obj.attendees.count()
        except Exception:
            return 0

    @admin.display(description="Absent Count")
    def absent_students_count(self, obj):
        try:
            gdata = obj.google_meet_attendance_data
            if gdata and gdata.get("status") == "READY":
                expected = gdata.get("expected_students") or {}
                total = len(expected)
                joined = sum(
                    1 for s in expected.values()
                    if s.get("duration_seconds", 0) > 0 or s.get("join_time")
                )
                return max(0, total - joined)
            if not obj.cohort:
                return 0
            if obj.class_type == "DOMAIN":
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
            elif obj.class_type == "SOFTSKILLS":
                active_statuses = ["SOFT_SKILLS"]
            else:
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]

            enrolled_count = User.objects.filter(
                student_profile__applications__assigned_cohort=obj.cohort,
                student_profile__applications__status__in=active_statuses,
            ).distinct().count()
            return max(0, enrolled_count - obj.attendees.count())
        except Exception:
            return 0

    @admin.display(description="Attendance Rate")
    def attendance_rate_display(self, obj):
        try:
            gdata = obj.google_meet_attendance_data
            if gdata and gdata.get("status") == "READY":
                expected = gdata.get("expected_students") or {}
                total = len(expected)
                if total == 0:
                    return "0%"
                joined = sum(
                    1 for s in expected.values()
                    if s.get("duration_seconds", 0) > 0 or s.get("join_time")
                )
                rate = (joined / total) * 100
                return f"{rate:.1f}% ({joined}/{total})"
            if not obj.cohort:
                return "100%" if obj.attendees.exists() else "0%"
            if obj.class_type == "DOMAIN":
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
            elif obj.class_type == "SOFTSKILLS":
                active_statuses = ["SOFT_SKILLS"]
            else:
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]

            enrolled_count = User.objects.filter(
                student_profile__applications__assigned_cohort=obj.cohort,
                student_profile__applications__status__in=active_statuses,
            ).distinct().count()
            if enrolled_count == 0:
                return "0%"
            rate = (obj.attendees.count() / enrolled_count) * 100
            return f"{rate:.1f}% ({obj.attendees.count()}/{enrolled_count})"
        except Exception:
            return "0%"

    @admin.display(description="Google Meet")
    def google_meet(self, obj):
        try:
            if not obj.meeting_link:
                return "No link"
            return format_html('<a href="{}" target="_blank" rel="noopener">Open link</a>', obj.meeting_link)
        except Exception:
            return "No link"

    @admin.display(description="Present Students")
    def present_students_list(self, obj):
        try:
            students = obj.attendees.select_related("user").all()
            if not students.exists():
                return "No students attended this class."
            items = "".join(
                f"<li><b>{(s.user.get_full_name() or s.user.email) if (s.user and hasattr(s.user, 'get_full_name')) else s.student_code}</b> ({s.student_code}) — {getattr(s.user, 'email', '')}</li>"
                for s in students
            )
            return format_html("<ol style='margin-left: 15px;'>{}</ol>", format_html(items))
        except Exception:
            return "No students attended this class."

    @admin.display(description="Absent Students")
    def absent_students_list(self, obj):
        try:
            if not obj.cohort:
                return "No cohort assigned."
            if obj.class_type == "DOMAIN":
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
            elif obj.class_type == "SOFTSKILLS":
                active_statuses = ["SOFT_SKILLS"]
            else:
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]

            enrolled_users = User.objects.filter(
                student_profile__applications__assigned_cohort=obj.cohort,
                student_profile__applications__status__in=active_statuses,
            ).select_related("student_profile").distinct()

            attended_user_ids = set(obj.attendees.values_list("user_id", flat=True))
            absent_users = [u for u in enrolled_users if u.id not in attended_user_ids]
            if not absent_users:
                return "All enrolled students attended! 🎉"
            items = "".join(
                f"<li><b>{(u.get_full_name() or u.email) if hasattr(u, 'get_full_name') else u.email}</b> (Code: {getattr(getattr(u, 'student_profile', None), 'student_code', 'N/A')}) — {u.email}</li>"
                for u in absent_users
            )
            return format_html("<ol style='margin-left: 15px;'>{}</ol>", format_html(items))
        except Exception:
            return "No cohort assigned."


@admin.register(AbsenceWarning)
class AbsenceWarningAdmin(admin.ModelAdmin):
    list_display = (
        "student_code_display",
        "student_name_display",
        "session_title",
        "session_date",
        "status",
        "apology_excerpt",
        "cohort_status_display",
        "created_at",
    )
    list_filter = ("status", "resolved", "session__class_type", "session__cohort")
    search_fields = (
        "student__student_code",
        "student__user__email",
        "student__user__first_name",
        "student__user__last_name",
        "session__title",
        "apology_text",
    )
    readonly_fields = ("student", "session", "apology_text", "created_at", "updated_at")

    fieldsets = (
        ("Student & Session Overview", {"fields": ("student", "session", "created_at")}),
        (
            "Student Apology & Leave Explanation",
            {
                "fields": ("apology_text",),
                "description": "The apology message / leave request text submitted by the student explaining their absence.",
            },
        ),
        (
            "Admin Decision & Cohort Action",
            {
                "fields": ("status", "resolved"),
                "description": (
                    "Set status to ACCEPTED to approve the leave request and allow the student to continue in their cohort (clears cohort suspension). "
                    "Set status to REJECTED to deny the apology and suspend the student's cohort access."
                ),
            },
        ),
    )

    actions = ["accept_apology_allow_cohort_continuation", "reject_apology_suspend_cohort"]

    @admin.display(description="Student Code", ordering="student__student_code")
    def student_code_display(self, obj):
        try:
            return obj.student.student_code if obj.student else "-"
        except Exception:
            return "-"

    @admin.display(description="Student Name", ordering="student__user__first_name")
    def student_name_display(self, obj):
        try:
            if obj.student and getattr(obj.student, "user", None):
                return obj.student.user.get_full_name() or obj.student.user.email
            return "-"
        except Exception:
            return "-"

    @admin.display(description="Session Title", ordering="session__title")
    def session_title(self, obj):
        try:
            return obj.session.title if obj.session else "-"
        except Exception:
            return "-"

    @admin.display(description="Session Date", ordering="session__class_date")
    def session_date(self, obj):
        try:
            return obj.session.class_date if obj.session else "-"
        except Exception:
            return "-"

    @admin.display(description="Apology Text Excerpt")
    def apology_excerpt(self, obj):
        try:
            if not obj.apology_text:
                return format_html("<span style='color: #888;'>No apology submitted</span>")
            text = obj.apology_text.strip()
            short = text[:60] + ("..." if len(text) > 60 else "")
            return format_html("<span title='{}'>{}</span>", text, short)
        except Exception:
            return format_html("<span style='color: #888;'>No apology submitted</span>")

    @admin.display(description="Cohort Status")
    def cohort_status_display(self, obj):
        try:
            if not obj.student or not obj.session or not obj.session.cohort:
                return "-"
            from applications.models import Application
            app = Application.objects.filter(
                student=obj.student,
                assigned_cohort=obj.session.cohort,
            ).first()
            if not app:
                return "No App"
            if app.status == "SUSPENDED":
                return format_html("<span style='color: #dc3545; font-weight: bold;'>SUSPENDED</span>")
            return format_html("<span style='color: #28a745; font-weight: bold;'>ACTIVE ({})</span>", app.status)
        except Exception:
            return "-"

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        self._apply_cohort_action(obj, request.user)

    @admin.action(description="Accept Apology & Allow Cohort Continuation (Clear Suspension)")
    def accept_apology_allow_cohort_continuation(self, request, queryset):
        count = 0
        for warning in queryset:
            warning.status = "ACCEPTED"
            warning.resolved = True
            warning.save()
            self._apply_cohort_action(warning, request.user)
            count += 1
        self.message_user(request, f"Successfully accepted {count} apology request(s). Students allowed to continue in cohort.")

    @admin.action(description="Reject Apology & Suspend Cohort Access")
    def reject_apology_suspend_cohort(self, request, queryset):
        count = 0
        for warning in queryset:
            warning.status = "REJECTED"
            warning.resolved = False
            warning.save()
            self._apply_cohort_action(warning, request.user)
            count += 1
        self.message_user(request, f"Rejected {count} apology request(s). Affected students' cohort access suspended.")

    def _apply_cohort_action(self, warning, admin_user):
        if not warning.student or not warning.session or not warning.session.cohort:
            return
        from applications.models import Application
        from common.models import Notification

        app = Application.objects.filter(
            student=warning.student,
            assigned_cohort=warning.session.cohort,
        ).first()

        if warning.status == "ACCEPTED":
            warning.resolved = True
            warning.save(update_fields=["resolved"])
            if app and app.status == "SUSPENDED":
                app.remarks = f"Cohort suspension revoked following accepted leave/apology for '{warning.session.title}'."
                app.save(update_fields=["remarks", "updated_at"])
                from applications.services.state_machine import transition_application_status
                try:
                    transition_application_status(
                        app,
                        Application.Status.COHORT_ASSIGNED if app.assigned_cohort_id else Application.Status.QUALIFIED,
                        reason=app.remarks,
                    )
                except Exception:
                    pass

            Notification.objects.create(
                user=warning.student.user,
                title="Leave Apology Accepted",
                message=f"Your absence apology for session '{warning.session.title}' on {warning.session.class_date} has been accepted by Admin. Your cohort access remains active.",
                notification_type=Notification.Type.SUCCESS,
            )

        elif warning.status == "REJECTED":
            warning.resolved = False
            warning.save(update_fields=["resolved"])
            if app and app.status != "SUSPENDED":
                app.remarks = f"Cohort access suspended due to rejected absence apology for session '{warning.session.title}'."
                app.save(update_fields=["remarks", "updated_at"])
                from applications.services.state_machine import transition_application_status
                try:
                    transition_application_status(
                        app,
                        Application.Status.SUSPENDED,
                        reason=app.remarks,
                    )
                except Exception:
                    pass

            Notification.objects.create(
                user=warning.student.user,
                title="Absence Apology Rejected",
                message=f"Your absence apology for session '{warning.session.title}' on {warning.session.class_date} was reviewed and rejected. Your cohort access has been suspended.",
                notification_type=Notification.Type.WARNING,
            )


@admin.register(AttendanceSummary)
class AttendanceSummaryAdmin(admin.ModelAdmin):
    list_display = ("student", "session", "session_date", "total_session_minutes", "active_minutes", "attendance_percentage", "last_updated")
    list_filter = ("session__class_date", "session__class_type", "session__cohort")
    search_fields = ("student__student_code", "student__user__email", "session__title")

    @admin.display(description="Session Date", ordering="session__class_date")
    def session_date(self, obj):
        return obj.session.class_date if obj.session else "-"


# PermissionRequestMessage is managed via User Support Requests (UserRequest)
# @admin.register(PermissionRequestMessage)
# class PermissionRequestMessageAdmin(admin.ModelAdmin):
#     list_display = ("warning", "sender", "created_at")


@admin.register(RecurringSchedule)
class RecurringScheduleAdmin(admin.ModelAdmin):
    list_display = ("class_type", "course", "cohort", "is_paused", "next_run")


from .models import GoogleCalendarAuditLog

@admin.register(GoogleCalendarAuditLog)
class GoogleCalendarAuditLogAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
