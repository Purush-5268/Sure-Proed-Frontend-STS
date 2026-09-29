from django import forms
from django.contrib import admin
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from accounts.models import User
from attendance.models import Attendance
from common.access import has_global_cohort_access

from .models import MentorProfile, VolunteerHelpRequest, VolunteerProfile, VolunteerTask


class StaffLinkedInIdentityAdminForm(forms.ModelForm):
    linkedin_id = forms.CharField(
        label="LinkedIn ID",
        max_length=100,
        required=False,
        help_text=(
            "LinkedIn OAuth member ID stored on the linked user account. "
            "Only enter an ID that has been verified for this mentor."
        ),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.user_id:
            self.fields["linkedin_id"].initial = self.instance.user.linkedin_id or ""

    def clean_linkedin_id(self):
        return (self.cleaned_data.get("linkedin_id") or "").strip()


class MentorProfileAdminForm(StaffLinkedInIdentityAdminForm):
    class Meta:
        model = MentorProfile
        fields = "__all__"


class VolunteerProfileAdminForm(StaffLinkedInIdentityAdminForm):
    class Meta:
        model = VolunteerProfile
        fields = "__all__"


class StaffProfileAdminMixin:
    readonly_fields = ("user_first_name_display", "user_last_name_display", "user_gender_display", "assigned_cohorts", "assigned_class_timetable")
    search_fields = ("user__email", "user__first_name", "user__last_name")
    list_select_related = ("user",)

    def get_queryset(self, request):
        queryset = super().get_queryset(request).select_related("user")
        return queryset if has_global_cohort_access(request.user) else queryset.filter(user=request.user)

    @admin.display(description="First Name")
    def user_first_name_display(self, obj):
        if obj.user:
            return obj.user.first_name or "-"
        return "-"

    @admin.display(description="Last Name")
    def user_last_name_display(self, obj):
        if obj.user:
            return obj.user.last_name or "-"
        return "-"

    @admin.display(description="Gender")
    def user_gender_display(self, obj):
        if obj.user and obj.user.gender:
            return obj.user.get_gender_display()
        return "-"

    def _profile_photo_html(self, obj, size):
        try:
            if obj and obj.profile_photo:
                return format_html(
                    '<img src="{}" alt="Staff profile photo" '
                    'style="width:{}px;height:{}px;border-radius:50%;object-fit:cover;" />',
                    obj.profile_photo.url,
                    size,
                    size,
                )
        except Exception:
            pass
        return "No profile photo uploaded"

    @admin.display(description="Photo")
    def profile_photo_thumbnail(self, obj):
        return self._profile_photo_html(obj, 40)

    @admin.display(description="Current profile photo")
    def profile_photo_preview(self, obj):
        return self._profile_photo_html(obj, 120)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        linkedin_id = form.cleaned_data.get("linkedin_id") or None
        if obj.user.linkedin_id != linkedin_id:
            obj.user.linkedin_id = linkedin_id
            obj.user.save(update_fields=["linkedin_id", "updated_at"])

    @admin.display(description="Assigned cohorts")
    def assigned_cohorts(self, obj):
        try:
            cohorts = self._cohorts(obj)
            if not cohorts.exists():
                return "No cohorts assigned"
            return format_html_join(
                "<br>",
                '<a href="{}">{} - {}</a>',
                ((reverse("admin:cohorts_cohort_change", args=[cohort.pk]), cohort.code, cohort.name) for cohort in cohorts),
            )
        except Exception:
            return "No cohorts assigned"

    @admin.display(description="Assigned class timetable / Google Meet")
    def assigned_class_timetable(self, obj):
        try:
            sessions = (
                Attendance.objects.filter(
                    cohort__in=self._cohorts(obj), class_date__gte=timezone.localdate()
                )
                .select_related("cohort")
                .order_by("class_date", "start_time")[:20]
            )
            if not sessions:
                return "No upcoming classes"
            rows = []
            for session in sessions:
                change_url = reverse("admin:attendance_attendance_change", args=[session.pk])
                meeting_link = getattr(session, "meeting_link", None) or (getattr(session.cohort, "meeting_link", None) if session.cohort else None)
                meeting = (
                    format_html('<a href="{}" target="_blank" rel="noopener">Google Meet</a>', meeting_link)
                    if meeting_link else "Meeting link not added"
                )
                rows.append((change_url, session.cohort.code if session.cohort else "-", session.title, session.class_date, session.start_time, meeting))
            return format_html_join(
                "<br>",
                '<a href="{}">{} - {}</a> | {} {} | {}',
                rows,
            )
        except Exception:
            return "No upcoming classes"


@admin.register(MentorProfile)
class MentorProfileAdmin(StaffProfileAdminMixin, admin.ModelAdmin):
    form = MentorProfileAdminForm
    list_display = ("profile_photo_thumbnail", "user", "user_first_name_display", "user_last_name_display", "user_gender_display", "company_name", "designation", "cohort_count", "upcoming_class_count", "mentor_attendance_summary")
    fields = (
        "user", "profile_photo_preview", "profile_photo", "user_first_name_display", "user_last_name_display", "user_gender_display", "company_name", "designation", "expertise", "years_of_experience",
        "linkedin_id", "linkedin_url", "github_username", "github_url", "is_github_connected", "bio", "assigned_cohorts", "assigned_class_timetable", "mentor_attendance_summary",
    )
    readonly_fields = ("profile_photo_preview", "user_first_name_display", "user_last_name_display", "user_gender_display", "assigned_cohorts", "assigned_class_timetable", "mentor_attendance_summary")
    autocomplete_fields = ("user",)

    @admin.display(description="Classes Conducted & Attendance")
    def mentor_attendance_summary(self, obj):
        try:
            if not obj or not getattr(obj, "user", None):
                return "No sessions conducted"
            sessions = Attendance.objects.filter(conducted_by=obj.user)
            total = sessions.count()
            completed = sessions.filter(class_status="COMPLETED").count()
            if total == 0:
                return "No sessions conducted"
            return format_html("<b>{} completed</b> / {} scheduled", completed, total)
        except Exception:
            return "No sessions conducted"

    def _cohorts(self, obj):
        if not obj or not getattr(obj, "user", None):
            return Attendance.objects.none()
        return obj.user.mentored_cohorts.select_related("course").order_by("code")

    @admin.display(description="Cohorts")
    def cohort_count(self, obj):
        try:
            return self._cohorts(obj).count()
        except Exception:
            return 0

    @admin.display(description="Upcoming classes")
    def upcoming_class_count(self, obj):
        try:
            return Attendance.objects.filter(
                cohort__in=self._cohorts(obj), class_date__gte=timezone.localdate()
            ).count()
        except Exception:
            return 0

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "user":
            kwargs["queryset"] = User.objects.filter(role=User.Role.MENTOR, is_active=True).order_by("email")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(VolunteerProfile)
class VolunteerProfileAdmin(StaffProfileAdminMixin, admin.ModelAdmin):
    form = VolunteerProfileAdminForm
    list_display = ("profile_photo_thumbnail", "user", "user_first_name_display", "user_last_name_display", "user_gender_display", "organization_name", "occupation", "cohort_count", "upcoming_class_count")
    fields = (
        "user", "profile_photo_preview", "profile_photo", "user_first_name_display", "user_last_name_display", "user_gender_display", "organization_name", "occupation", "skills", "availability_notes",
        "linkedin_id", "linkedin_url", "bio", "assigned_cohorts", "assigned_class_timetable",
    )
    readonly_fields = ("profile_photo_preview", "user_first_name_display", "user_last_name_display", "user_gender_display", "assigned_cohorts", "assigned_class_timetable")
    autocomplete_fields = ("user",)

    def _cohorts(self, obj):
        return obj.user.volunteered_cohorts.select_related("course").order_by("code")

    @admin.display(description="Cohorts")
    def cohort_count(self, obj):
        return self._cohorts(obj).count()

    @admin.display(description="Upcoming classes")
    def upcoming_class_count(self, obj):
        return Attendance.objects.filter(
            cohort__in=self._cohorts(obj), class_date__gte=timezone.localdate()
        ).count()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "user":
            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE], is_active=True
            ).order_by("email")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(VolunteerTask)
class VolunteerTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "assigned_to", "cohort", "priority", "status", "due_date")
    list_filter = ("priority", "status", "cohort", "due_date")
    search_fields = (
        "title",
        "assigned_to__email",
        "assigned_by__email",
        "cohort__code",
        "cohort__name",
    )
    list_select_related = ("assigned_to", "assigned_by", "cohort")
    autocomplete_fields = ("assigned_to", "assigned_by", "cohort")
    date_hierarchy = "due_date"
    list_per_page = 50

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "assigned_to":
            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE], is_active=True
            ).order_by("email")
        elif db_field.name == "assigned_by":
            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.ADMIN, User.Role.MENTOR], is_active=True
            ).order_by("email")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(VolunteerHelpRequest)
class VolunteerHelpRequestAdmin(admin.ModelAdmin):
    list_display = ("subject", "requested_by", "task", "cohort", "status", "created_at")
    list_filter = ("status", "cohort", "created_at")
    search_fields = (
        "subject",
        "message",
        "requested_by__email",
        "task__title",
        "cohort__code",
        "cohort__name",
    )
    list_select_related = ("requested_by", "task", "cohort")
    autocomplete_fields = ("requested_by", "task", "cohort", "assisting_volunteers")
    date_hierarchy = "created_at"
    list_per_page = 50

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "requested_by":
            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE], is_active=True
            ).order_by("email")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if db_field.name == "assisting_volunteers":
            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE], is_active=True
            ).order_by("email")
        return super().formfield_for_manytomany(db_field, request, **kwargs)
