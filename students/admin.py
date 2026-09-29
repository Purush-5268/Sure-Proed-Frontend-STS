import csv
import logging
from django import forms
from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404, HttpResponse
from django.urls import path, reverse
from django.utils.html import format_html

from common.storage import private_storage
from .models import StudentProfile, StudentPlacement, GoogleStudentIdentity

logger = logging.getLogger(__name__)


class StudentProfileAdminForm(forms.ModelForm):
    resume = forms.FileField(
        required=False,
        widget=forms.FileInput,
        help_text=(
            "Upload a replacement PDF/Word resume if needed. Use the protected download link "
            "below to view the currently stored resume."
        ),
    )

    class Meta:
        model = StudentProfile
        fields = "__all__"



def export_students_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_student_profiles.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Student Code", "User Email", "Status", "Public Profile", "College",
        "Degree", "Specialization", "Education Level", "Graduation Year",
        "City", "State", "Country", "LinkedIn Connected", "LinkedIn URL",
        "GitHub Connected", "GitHub Username", "GitHub Org Invite Status", "GitHub Workspace Repo URL"
    ])

    for profile in queryset.select_related("user"):
        writer.writerow([
            profile.student_code,
            profile.user.email if profile.user else "",
            profile.status,
            "Yes" if profile.is_public else "No",
            profile.college or "",
            profile.degree or "",
            profile.specialization or "",
            profile.education_level,
            profile.graduation_year or "",
            profile.city or "",
            profile.state or "",
            profile.country or "",
            "Yes" if profile.is_linkedin_connected else "No",
            profile.linkedin_url or "",
            "Yes" if profile.is_github_connected else "No",
            profile.github_username or "",
            profile.github_org_invite_status or "",
            profile.github_repo_url or "",
        ])

    return response


export_students_to_csv.short_description = "Export selected student profiles to CSV"


@admin.action(description="📥 Export selected students' GitHub repositories report (.xlsx)")
def export_students_github_report_to_excel(modeladmin, request, queryset):
    from students.services.excel_export_service import generate_student_github_repos_excel
    return generate_student_github_repos_excel(queryset=queryset)


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    form = StudentProfileAdminForm
    list_display = (
        "student_code",
        "is_official_student",
        "user",
        "user_first_name_display",
        "user_last_name_display",
        "user_gender_display",
        "current_course_display",
        "current_cohort_display",
        "training_batch_display",
        "previous_cohorts_display",
        "status",
        "is_linkedin_connected",
        "is_github_connected",
        "github_username",
        "github_org_invite_status",
        "github_repo_url",
    )
    search_fields = (
        "student_code",
        "user__email",
        "user__first_name",
        "user__last_name",
        "user__gender",
        "college",
        "github_username",
        "github_url",
        "github_repo_url",
        "linkedin_url",
    )
    list_filter = (
        "status",
        "user__gender",
        "is_public",
        "is_linkedin_connected",
        "is_github_connected",
        "github_org_invite_status",
        "education_level",
    )
    actions = [export_students_to_csv, export_students_github_report_to_excel]

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<path:object_id>/download-resume-admin/",
                self.admin_site.admin_view(self.download_resume_admin_view),
                name="studentprofile-resume-download",
            ),
            path(
                "export-github-repos-excel/",
                self.admin_site.admin_view(self.export_github_repos_excel_view),
                name="students_studentprofile_export_github_repos_excel",
            ),
        ]
        return custom_urls + urls

    @admin.display(description="Current Resume")
    def resume_download(self, obj):
        if not obj or not obj.pk or not obj.resume:
            return "No resume file is stored."

        try:
            storage = obj.resume.storage if obj.resume else private_storage
            exists = storage.exists(obj.resume.name) or private_storage.exists(obj.resume.name)
        except OSError:
            logger.warning("Unable to inspect resume storage for student profile id=%s", obj.pk)
            exists = False

        if not exists:
            return "The database references a resume, but the file is missing from storage."

        url = reverse("admin:studentprofile-resume-download", args=[obj.pk])
        return format_html('<a class="button" href="{}" target="_blank">Download current resume</a>', url)

    def download_resume_admin_view(self, request, object_id):
        profile = self.get_object(request, object_id)
        if profile is None:
            raise Http404("Resume not found.")
        if not self.has_view_or_change_permission(request, profile):
            raise PermissionDenied
        if not profile.resume:
            raise Http404("Resume not found.")

        storage = profile.resume.storage if profile.resume else private_storage
        storage_name = profile.resume.name
        try:
            if storage.exists(storage_name):
                file_handle = storage.open(storage_name, "rb")
            elif private_storage.exists(storage_name):
                file_handle = private_storage.open(storage_name, "rb")
            else:
                raise Http404("Resume not found.")
        except Http404:
            raise
        except (FileNotFoundError, OSError):
            logger.warning("Unable to open resume for student profile id=%s", profile.pk)
            raise Http404("Resume not found.") from None

        import mimetypes
        content_type, _ = mimetypes.guess_type(storage_name)
        clean_code = profile.student_code or str(profile.pk)
        ext = storage_name.rsplit(".", 1)[-1] if "." in storage_name else "pdf"
        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=f"resume_{clean_code}.{ext}",
            content_type=content_type or "application/pdf",
        )
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
        response["Pragma"] = "no-cache"
        response["Expires"] = "0"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def export_github_repos_excel_view(self, request):
        from students.services.excel_export_service import generate_student_github_repos_excel
        return generate_student_github_repos_excel(queryset=self.get_queryset(request))

    def get_queryset(self, request):
        from accounts.models import User
        return super().get_queryset(request).filter(user__role=User.Role.STUDENT)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "user":
            from accounts.models import User
            kwargs["queryset"] = User.objects.filter(role=User.Role.STUDENT)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    fieldsets = (
        ("Basic Information", {
            "fields": (
                "user",
                "user_first_name_display",
                "user_last_name_display",
                "user_gender_display",
                "student_code",
                "student_identity_issued_at",
                "status",
                "is_public",
                "profile_photo",
                "tagline",
                "bio",
            )
        }),
        ("Cohort & Training Information", {
            "fields": (
                "current_course_display",
                "current_cohort_display",
                "training_batch_display",
                "previous_cohorts_display",
                "attendance_rate_display",
            )
        }),
        ("Education & Location", {
            "fields": ("college", "degree", "specialization", "education_level", "graduation_year", "city", "state", "country")
        }),
        ("Skills & Preferences", {
            "fields": ("skills", "hobbies", "languages", "portfolio_url", "resume_download", "resume")
        }),
        ("LinkedIn Verification", {
            "fields": ("is_linkedin_connected", "linkedin_id", "linkedin_url", "linkedin_profile_data")
        }),
        ("GitHub & Workspace Repository", {
            "fields": ("is_github_connected", "github_username", "github_url", "github_org_invite_status", "github_repo_url")
        }),
    )
    readonly_fields = (
        "resume_download",
        "user_first_name_display",
        "user_last_name_display",
        "user_gender_display",
        "student_identity_issued_at",
        "current_course_display",
        "current_cohort_display",
        "training_batch_display",
        "previous_cohorts_display",
        "attendance_rate_display",
    )

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

    @admin.display(description="Effective LST Batch")
    def training_batch_display(self, obj):
        try:
            from django.utils.html import format_html
            active_app = obj.applications.filter(
                assigned_cohort__isnull=False,
            ).exclude(
                status__in=["DROPPED", "CANCELLED"]
            ).order_by("-applied_at").first()
            if not active_app or not active_app.assigned_cohort or not active_app.assigned_cohort.lst_batch:
                return format_html("<span style='color: #6c757d;'>Not Assigned</span>")
            
            # Reformat e.g., 'BATCH_2' -> 'Batch 2'
            disp = active_app.assigned_cohort.get_lst_batch_display() if hasattr(active_app.assigned_cohort, "get_lst_batch_display") else active_app.assigned_cohort.lst_batch
            return format_html("<span style='background-color: #007bff; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: bold;'>{}</span>", disp)
        except Exception:
            return format_html("<span style='color: #6c757d;'>Not Assigned</span>")

    @admin.display(description="Attendance Rate")
    def attendance_rate_display(self, obj):
        try:
            from django.utils.html import format_html
            from attendance.services.student_scope import attendance_metrics, ENROLLED_STATUSES
            application = obj.applications.filter(
                assigned_cohort__isnull=False, status__in=ENROLLED_STATUSES
            ).select_related("assigned_cohort").order_by("-applied_at").first()
            metrics = attendance_metrics(obj, application)
            if not metrics["total"]:
                return "No recorded attendance"
            return format_html(
                "<span style='font-weight: bold; color: {};'>{}% ({}/{})</span>",
                "#28a745" if metrics["percentage"] >= 75 else "#dc3545",
                f'{metrics["percentage"]:.1f}', metrics["present"], metrics["total"],
            )
        except Exception:
            return "Attendance unavailable"

    @admin.display(description="Current Course")
    def current_course_display(self, obj):
        try:
            from django.urls import reverse
            from django.utils.html import format_html

            active_app = obj.applications.exclude(
                status__in=["DROPPED", "CANCELLED"]
            ).select_related("course").order_by("-applied_at").first()

            if active_app and active_app.course:
                course = active_app.course
                url = reverse("admin:courses_course_change", args=[course.pk])
                return format_html(
                    '<a href="{}"><strong>[{}] {}</strong></a> &nbsp;<span style="opacity: 0.8;">({})</span>',
                    url, course.code, course.name, active_app.get_status_display()
                )
        except Exception:
            pass
        return "-"

    @admin.display(description="Current Cohort")
    def current_cohort_display(self, obj):
        try:
            from django.urls import reverse
            from django.utils.html import format_html

            active_app = obj.applications.filter(
                assigned_cohort__isnull=False,
            ).exclude(
                status__in=["DROPPED", "CANCELLED"]
            ).select_related("assigned_cohort").order_by("-applied_at").first()

            if active_app and active_app.assigned_cohort:
                c = active_app.assigned_cohort
                url = reverse("admin:cohorts_cohort_change", args=[c.pk])
                return format_html(
                    '<a href="{}"><strong>{}</strong> ({})</a>',
                    url, c.name, c.code
                )
        except Exception:
            pass
        return "-"

    @admin.display(description="Previous Cohorts")
    def previous_cohorts_display(self, obj):
        try:
            from applications.models import Application
            from django.urls import reverse
            from django.utils.html import format_html, mark_safe

            apps = list(obj.applications.filter(
                assigned_cohort__isnull=False,
            ).select_related("assigned_cohort", "course").order_by("-applied_at"))

            active_app = next((app for app in apps if app.status not in [Application.Status.DROPPED, Application.Status.CANCELLED]), None)

            links = []
            for app in apps:
                if active_app and app.id == active_app.id:
                    continue
                c = app.assigned_cohort
                if c:
                    url = reverse("admin:cohorts_cohort_change", args=[c.pk])
                    links.append(format_html('<a href="{}">{} ({})</a>', url, c.code, c.name))

            if links:
                return mark_safe(", ".join(links))
        except Exception:
            pass
        return "-"

@admin.register(StudentPlacement)
class StudentPlacementAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "company_name",
        "designation",
        "employment_type",
        "joining_date",
        "status",
        "verified_by",
        "verified_at",
    )
    list_filter = ("status", "employment_type")
    search_fields = ("student__student_code", "student__user__email", "company_name", "designation")
    readonly_fields = ("created_at", "updated_at", "verified_at", "verified_by")

    def save_model(self, request, obj, form, change):
        if change and obj.status in [StudentPlacement.Status.VERIFIED, StudentPlacement.Status.REJECTED]:
            old_obj = StudentPlacement.objects.get(pk=obj.pk)
            if old_obj.status != obj.status:
                obj.verified_by = request.user
                from django.utils import timezone
                obj.verified_at = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(GoogleStudentIdentity)
class GoogleStudentIdentityAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "sure_proed_email",
        "google_email",
        "google_profile_name",
        "is_verified",
        "connected_at",
        "last_synced_at",
    )
    search_fields = (
        "student__student_code",
        "student__user__email",
        "google_email",
        "google_profile_name",
        "google_subject_id",
    )
    list_filter = ("is_verified",)
    readonly_fields = (
        "google_subject_id",
        "connected_at",
        "updated_at",
        "last_synced_at",
    )

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return self.readonly_fields + ("student",)
        return self.readonly_fields

    def sure_proed_email(self, obj):
        return obj.student.user.email if obj.student and obj.student.user else None
    sure_proed_email.short_description = "SURE ProEd Email"

    def has_add_permission(self, request):
        # Prevent manual creation of Google identities to avoid arbitrary data entry
        return False


from .models import StudentIdentityAlias

@admin.register(StudentIdentityAlias)
class StudentIdentityAliasAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
