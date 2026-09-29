from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.utils.html import format_html

from accounts.models import User
from cohorts.models import Cohort
from common.access import can_manage_cohort, has_global_cohort_access
from common.models import Notification
from common.services.notifications import notify_cohort, notify_user
from .models import Training, TrainingAttendance, TrainingAbsentee, TrainingSession, TrainingBatchDivision


@admin.register(TrainingBatchDivision)
class TrainingBatchDivisionAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "name",
        "course",
        "active_students_count",
        "batch_1_count",
        "batch_2_count",
        "batch_3_count",
        "batch_4_count",
        "status",
    )
    search_fields = ("code", "name", "course__name")
    actions = ["auto_divide_into_2_batches", "auto_divide_into_4_batches"]
    readonly_fields = ("code", "name", "course", "students_batch_breakdown")

    fieldsets = (
        ("Cohort Information", {"fields": ("code", "name", "course", "status")}),
        ("Student Training Batch Assignments", {"fields": ("students_batch_breakdown",)}),
    )

    @admin.display(description="Active Students")
    def active_students_count(self, obj):
        try:
            return obj.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"]).count()
        except Exception:
            return 0

    @admin.display(description="Batch 1 Count")
    def batch_1_count(self, obj):
        try:
            return obj.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"], training_batch="BATCH_1").count()
        except Exception:
            return 0

    @admin.display(description="Batch 2 Count")
    def batch_2_count(self, obj):
        try:
            return obj.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"], training_batch="BATCH_2").count()
        except Exception:
            return 0

    @admin.display(description="Batch 3 Count")
    def batch_3_count(self, obj):
        try:
            return obj.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"], training_batch="BATCH_3").count()
        except Exception:
            return 0

    @admin.display(description="Batch 4 Count")
    def batch_4_count(self, obj):
        try:
            return obj.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"], training_batch="BATCH_4").count()
        except Exception:
            return 0

    @admin.display(description="Student Training Batches Roster")
    def students_batch_breakdown(self, obj):
        try:
            apps = obj.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"]).select_related("student__user").order_by("student__student_code")
            if not apps.exists():
                return "No active students in this cohort."
            rows = "".join(
                f"<tr><td><b>{a.student.student_code if a.student else 'N/A'}</b></td>"
                f"<td>{a.student.user.get_full_name() if (a.student and a.student.user) else 'N/A'}</td>"
                f"<td><span style='background: #007bff; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;'>{a.get_training_batch_display() if hasattr(a, 'get_training_batch_display') else getattr(a, 'training_batch', 'Batch 1')}</span></td></tr>"
                for a in apps
            )
            return format_html(
                """
                <table style='width: 100%; border-collapse: collapse; background: #252526; color: #fff;' border='1' cellpadding='8'>
                    <thead><tr style='background: #333;'><th>Student Code</th><th>Full Name</th><th>Assigned Training Batch</th></tr></thead>
                    <tbody>{}</tbody>
                </table>
                """,
                format_html(rows),
            )
        except Exception:
            return "No active students in this cohort."

    @admin.action(description="⚡ Auto-Divide Cohort into 2 Batches (Batch 1 & Batch 2)")
    def auto_divide_into_2_batches(self, request, queryset):
        total_updated = 0
        for cohort in queryset:
            apps = list(cohort.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"]).order_by("student__student_code"))
            half = (len(apps) + 1) // 2
            for i, app in enumerate(apps):
                batch = "BATCH_1" if i < half else "BATCH_2"
                if app.training_batch != batch:
                    app.training_batch = batch
                    app.save(update_fields=["training_batch"])
                    total_updated += 1
        self.message_user(request, f"Successfully auto-divided {total_updated} student(s) into 2 training batches (Batch 1 & Batch 2).")

    @admin.action(description="⚡ Auto-Divide Cohort into 4 Batches (Batch 1, 2, 3 & 4)")
    def auto_divide_into_4_batches(self, request, queryset):
        total_updated = 0
        for cohort in queryset:
            apps = list(cohort.applications.filter(status__in=["COHORT_ASSIGNED", "IN_PROGRESS"]).order_by("student__student_code"))
            quarter = max(1, len(apps) // 4)
            for i, app in enumerate(apps):
                if i < quarter:
                    batch = "BATCH_1"
                elif i < quarter * 2:
                    batch = "BATCH_2"
                elif i < quarter * 3:
                    batch = "BATCH_3"
                else:
                    batch = "BATCH_4"
                if app.training_batch != batch:
                    app.training_batch = batch
                    app.save(update_fields=["training_batch"])
                    total_updated += 1
        self.message_user(request, f"Successfully auto-divided {total_updated} student(s) into 4 training batches.")


@admin.register(TrainingAbsentee)
class TrainingAbsenteeAdmin(admin.ModelAdmin):
    list_display = (
        "student_code_display",
        "student_name_display",
        "session_title",
        "training_type_display",
        "cohort_display",
        "session_date",
        "cohort_status_display",
        "remarks",
        "updated_at",
    )
    list_filter = ("session__training__training_type", "session__cohort", "session__session_date")
    search_fields = (
        "student__student_code",
        "student__user__email",
        "student__user__first_name",
        "student__user__last_name",
        "session__title",
    )

    actions = ["revoke_suspension_allow_continuation", "enforce_suspension"]

    @admin.display(description="Student Code", ordering="student__student_code")
    def student_code_display(self, obj):
        return obj.student.student_code if obj.student else "-"

    @admin.display(description="Student Name", ordering="student__user__first_name")
    def student_name_display(self, obj):
        return obj.student.user.get_full_name() or obj.student.user.email if obj.student and obj.student.user else "-"

    @admin.display(description="Training Session Title", ordering="session__title")
    def session_title(self, obj):
        return obj.session.title if obj.session else "-"

    @admin.display(description="Training Type", ordering="session__training__training_type")
    def training_type_display(self, obj):
        return obj.session.training.get_training_type_display() if obj.session and obj.session.training else "-"

    @admin.display(description="Cohort", ordering="session__cohort__code")
    def cohort_display(self, obj):
        return obj.session.cohort.code if obj.session and obj.session.cohort else "-"

    @admin.display(description="Session Date", ordering="session__session_date")
    def session_date(self, obj):
        return obj.session.session_date if obj.session else "-"

    @admin.display(description="Student Cohort Status")
    def cohort_status_display(self, obj):
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

    @admin.action(description="Revoke Suspension & Allow Cohort Continuation")
    def revoke_suspension_allow_continuation(self, request, queryset):
        count = 0
        from applications.models import Application
        from applications.services.state_machine import transition_application_status
        for absentee in queryset:
            if absentee.student and absentee.session and absentee.session.cohort:
                apps = Application.objects.filter(
                    student=absentee.student,
                    assigned_cohort=absentee.session.cohort,
                    status=Application.Status.SUSPENDED,
                )
                for app in apps:
                    transition_application_status(
                        app,
                        Application.Status.IN_PROGRESS,
                        user=request.user,
                        reason=f"Training absence suspension revoked by Admin for session '{absentee.session.title}'.",
                    )
                    count += 1
        self.message_user(request, f"Revoked training suspension for {count} student(s). Cohort access restored.")

    @admin.action(description="Enforce Suspension for Training Absence")
    def enforce_suspension(self, request, queryset):
        count = 0
        from applications.models import Application
        from applications.services.state_machine import transition_application_status
        for absentee in queryset:
            if absentee.student and absentee.session and absentee.session.cohort:
                apps = Application.objects.filter(
                    student=absentee.student,
                    assigned_cohort=absentee.session.cohort,
                ).exclude(status=Application.Status.SUSPENDED)
                for app in apps:
                    transition_application_status(
                        app,
                        Application.Status.SUSPENDED,
                        user=request.user,
                        reason=f"Cohort access suspended by Admin due to training absence in session '{absentee.session.title}'.",
                    )
                    count += 1
        self.message_user(request, f"Enforced cohort suspension for {count} student(s) due to training absence.")


@admin.register(Training)
class TrainingAdmin(admin.ModelAdmin):
    list_display = ("title", "training_type", "duration_hours", "is_active")
    list_filter = ("training_type", "is_active")
    search_fields = ("title", "description")


@admin.register(TrainingSession)
class TrainingSessionAdmin(admin.ModelAdmin):
    list_display = ("title", "training", "cohort", "session_date", "start_time", "end_time", "google_meet", "conducted_by")
    list_filter = ("training__training_type", "cohort", "session_date")
    search_fields = ("title", "training__title", "cohort__code")
    autocomplete_fields = ("training", "cohort", "conducted_by")
    readonly_fields = ("google_meet",)

    @admin.display(description="Google Meet")
    def google_meet(self, obj):
        meeting_link = (obj.meeting_link or (obj.cohort.meeting_link if obj.cohort else None)) if obj else None
        if not meeting_link:
            return "Not added"
        return format_html('<a href="{}" target="_blank" rel="noopener">Open meeting</a>', meeting_link)

    def get_queryset(self, request):
        queryset = super().get_queryset(request).select_related("training", "cohort", "conducted_by")
        if has_global_cohort_access(request.user):
            return queryset
        role = getattr(request.user, "role", "")
        if role == User.Role.MENTOR:
            return queryset.filter(cohort__mentors=request.user).distinct()
        if role in {User.Role.VOLUNTEER, User.Role.TRUSTEE}:
            return queryset.filter(cohort__volunteers=request.user).distinct()
        return queryset.none()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "cohort" and not has_global_cohort_access(request.user):
            role = getattr(request.user, "role", "")
            if role == User.Role.MENTOR:
                kwargs["queryset"] = Cohort.objects.filter(mentors=request.user).distinct()
            elif role in {User.Role.VOLUNTEER, User.Role.TRUSTEE}:
                kwargs["queryset"] = Cohort.objects.filter(volunteers=request.user).distinct()
            else:
                kwargs["queryset"] = Cohort.objects.none()
        if db_field.name == "conducted_by" and not has_global_cohort_access(request.user):
            kwargs["queryset"] = User.objects.filter(pk=request.user.pk)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        if obj.cohort is None and not has_global_cohort_access(request.user):
            raise PermissionDenied("Only an admin can schedule training for every cohort.")
        if obj.cohort and not can_manage_cohort(request.user, obj.cohort):
            raise PermissionDenied("You can schedule training only for a cohort assigned to you.")
        if not obj.conducted_by_id:
            obj.conducted_by = request.user
        super().save_model(request, obj, form, change)
        cohorts = [obj.cohort] if obj.cohort else Cohort.objects.filter(
            status__in=[Cohort.Status.OPEN, Cohort.Status.ACTIVE]
        )
        for cohort in cohorts:
            notify_cohort(
                cohort,
                title=f"{obj.training.get_training_type_display()} {'updated' if change else 'scheduled'}",
                message=f"{obj.title}: {obj.session_date:%d %b %Y} at {obj.start_time:%I:%M %p}.",
                notification_type=Notification.Type.INFO,
                action_url="training",
                dedupe_key=f"training-session:{obj.id}:scheduled",
            )


@admin.register(TrainingAttendance)
class TrainingAttendanceAdmin(admin.ModelAdmin):
    list_display = ("student", "session", "status", "updated_at")
    list_filter = ("status", "session__training__training_type", "session__cohort")
    search_fields = ("student__student_code", "student__user__email", "session__title")
    autocomplete_fields = ("session", "student")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        notify_user(
            obj.student.user,
            title="Training attendance updated",
            message=f"{obj.session.title}: {obj.get_status_display()}.",
            notification_type=(
                Notification.Type.SUCCESS
                if obj.status == TrainingAttendance.Status.PRESENT
                else Notification.Type.WARNING
            ),
            action_url="training",
            dedupe_key=f"training-attendance:{obj.id}",
        )
