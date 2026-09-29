import csv

from django import forms
from django.contrib import admin
from django.contrib import messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import AdminPasswordChangeForm
from django.core.exceptions import ValidationError
from django.http import HttpResponse, HttpResponseRedirect
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from .models import AdministratorProfile, EmailVerificationOTP, PasswordResetOTP, User, UserSearch


class OTPAdminPasswordChangeForm(AdminPasswordChangeForm):
    """Require the OTP issued for the target account before an admin reset."""

    otp = forms.CharField(
        label="Password reset OTP",
        max_length=6,
        min_length=6,
        help_text="Enter the latest unused OTP sent to the user's notification email.",
    )

    def clean_otp(self):
        otp_value = self.cleaned_data["otp"].strip()
        email = self.user.email
        from .otp_service import verify_password_reset_otp
        is_valid, err = verify_password_reset_otp(email, otp_value)
        if not is_valid:
            # Check legacy DB table fallback
            record = (
                PasswordResetOTP.objects.filter(email__iexact=email, otp=otp_value, is_used=False)
                .order_by("-created_at")
                .first()
            )
            if record is None or not record.is_valid():
                raise ValidationError("The OTP is incorrect, expired, or already used.")
            self.otp_record = record
        else:
            self.otp_record = None
        return otp_value

    def save(self, commit=True):
        user = super().save(commit=commit)
        if commit and getattr(self, "otp_record", None):
            self.otp_record.is_used = True
            self.otp_record.save(update_fields=["is_used"])
        return user


@admin.register(PasswordResetOTP)
class PasswordResetOTPAdmin(admin.ModelAdmin):
    list_display = ("email", "otp", "expires_at", "is_used", "created_at")
    search_fields = ("email", "otp")
    list_filter = ("is_used",)


@admin.register(EmailVerificationOTP)
class EmailVerificationOTPAdmin(admin.ModelAdmin):
    list_display = ("email", "otp", "expires_at", "is_used", "created_at")
    search_fields = ("email", "otp")
    list_filter = ("is_used",)


def export_users_to_csv(modeladmin, request, queryset):
    """Export selected users to a downloadable CSV file."""
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_users.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Email", "Mapped Email", "First Name", "Last Name",
        "Phone Number", "Role", "LinkedIn Connected",
        "Social Provider", "Email Verified", "Active",
        "Staff", "Created At",
    ])

    for user in queryset.select_related():
        writer.writerow([
            user.email,
            user.mapped_email or "",
            user.first_name,
            user.last_name,
            user.phone_number or "",
            user.role,
            "Yes" if user.is_social_auth_linked else "No",
            user.social_provider or "",
            "Yes" if user.is_email_verified else "No",
            "Yes" if user.is_active else "No",
            "Yes" if user.is_staff else "No",
            user.created_at.strftime("%Y-%m-%d %H:%M") if user.created_at else "",
        ])

    return response


export_users_to_csv.short_description = "Export selected users to CSV"


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User
    change_user_password_template = "admin/accounts/user/change_password.html"
    list_display = (
        "email",
        "first_name",
        "last_name",
        "role",
        "email_verification_status_display",
        "student_id_display",
        "application_numbers_display",
        "student_access_status",
        "is_social_auth_linked",
        "is_staff",
        "is_active",
    )
    list_filter = ("role", "is_email_verified", "is_social_auth_linked", "social_provider", "is_staff", "is_active")
    search_fields = (
        "email",
        "mapped_email",
        "first_name",
        "last_name",
        "phone_number",
        "linkedin_id",
        "student_profile__student_code",
        "student_profile__applications__application_number",
    )
    ordering = ("email",)
    actions = [export_users_to_csv]
    change_password_form = OTPAdminPasswordChangeForm
    readonly_fields = (
        "email_verification_badge",
        "cohort_quick_actions",
        "student_id_detail",
        "application_numbers_detail",
        "student_role_verification",
        "official_student_code",
        "active_student_cohort",
        "student_journey_summary",
    )

    def email_verification_status_display(self, obj):
        if obj.is_email_verified:
            return format_html(
                '<span style="background-color: #d1fae5; color: #065f46; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 11px;">VERIFIED ✓</span>'
            )
        return format_html(
            '<span style="background-color: #fee2e2; color: #991b1b; font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 11px;">UNVERIFIED ✗</span>'
        )

    email_verification_status_display.short_description = "Email Verification"

    def email_verification_badge(self, obj):
        if not obj or not obj.pk:
            return "-"
        if obj.is_email_verified:
            return format_html(
                '<div style="font-size: 13px; font-weight: 600; color: #065f46; background-color: #d1fae5; border: 1px solid #10b981; padding: 6px 12px; border-radius: 6px; display: inline-block;">'
                '✅ Email Verified</div>'
            )
        return format_html(
            '<div style="font-size: 13px; font-weight: 600; color: #991b1b; background-color: #fee2e2; border: 1px solid #f87171; padding: 6px 12px; border-radius: 6px; display: inline-block;">'
            '⚠️ Email Unverified (OTP Verification Pending)</div>'
        )

    email_verification_badge.short_description = "Email Verification Status"

    # Remove 'username' from the default fieldsets
    fieldsets = (
        (None, {"fields": ("email", "mapped_email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "gender", "phone_number", "date_of_birth", "role")}),
        ("Social Authentication", {"fields": ("is_social_auth_linked", "social_provider", "linkedin_id")}),
        (
            "Student Journey & Access",
            {
                "fields": (
                    "cohort_quick_actions",
                    "student_id_detail",
                    "application_numbers_detail",
                    "student_role_verification",
                    "official_student_code",
                    "active_student_cohort",
                    "student_journey_summary",
                )
            },
        ),
        (
            "Permissions & Email Status",
            {
                "fields": (
                    "email_verification_badge",
                    "is_email_verified",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "has_all_cohorts_access",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "mapped_email",
                    "password1",
                    "password2",
                    "role",
                    "first_name",
                    "last_name",
                    "is_email_verified",
                ),
            },
        ),
    )

    def save_model(self, request, obj, form, change):
        is_new = not change or obj._state.adding
        super().save_model(request, obj, form, change)
        if is_new and not obj.is_email_verified and obj.role != User.Role.ADMIN:
            try:
                from .otp_service import store_email_verification_otp
                from common.tasks import send_async_email_verification_otp

                email = obj.email.lower().strip()
                otp = store_email_verification_otp(email, email, {"email": email, "role": obj.role})
                send_async_email_verification_otp.delay(email, otp)
                messages.info(
                    request,
                    f"User account created! A 6-digit Email Verification OTP was dispatched to {email}.",
                )
            except Exception:
                pass

    def user_change_password(self, request, id, form_url=""):
        """Issue a fresh OTP when the protected admin password form is opened."""
        if request.method == "GET":
            user = self.get_object(request, id)
            if user is not None and self.has_change_permission(request, user):
                email = user.get_notification_email()
                from .otp_service import store_password_reset_otp
                otp, _, _ = store_password_reset_otp(user.email, email, bypass_rate_limit=True)
                if otp:
                    try:
                        from common.tasks import send_async_password_reset_otp

                        send_async_password_reset_otp.delay(email, otp)
                        messages.info(request, f"A fresh password-reset OTP was issued and sent to {email}.")
                    except Exception:
                        # Do not turn a temporary mail/broker issue into an admin 500.
                        messages.warning(
                            request,
                            "The OTP was created, but the email queue is unavailable.",
                        )
        return super().user_change_password(request, id, form_url)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<path:object_id>/suspend-user-cohort/",
                self.admin_site.admin_view(self.suspend_user_cohort_view),
                name="account-user-suspend-cohort",
            ),
            path(
                "<path:object_id>/unsuspend-user-cohort/",
                self.admin_site.admin_view(self.unsuspend_user_cohort_view),
                name="account-user-unsuspend-cohort",
            ),
        ]
        return custom_urls + urls

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superuser or getattr(request.user, "role", None) == User.Role.ADMIN

    def suspend_user_cohort_view(self, request, object_id):
        user = self.get_object(request, object_id)
        if not user:
            self.message_user(request, "User not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:accounts_user_changelist"))

        profile = getattr(user, "student_profile", None)
        if not profile:
            self.message_user(request, "No student profile for this user.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:accounts_user_change", args=[user.pk]))

        app = profile.applications.order_by("-applied_at").first()
        if not app:
            self.message_user(request, "No active application found for student.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:accounts_user_change", args=[user.pk]))

        from applications.models import Application
        from applications.services.state_machine import transition_application_status
        from common.models import Notification
        from common.services.notifications import notify_user
        from django.core.cache import cache

        try:
            transition_application_status(
                app,
                Application.Status.SUSPENDED,
                user=request.user,
                reason="Admin suspended student via User admin",
            )
        except Exception:
            pass

        cache.delete_many([
            f"attendance:list:user_{user.id}:ACTIVE",
            f"attendance:list:user_{user.id}:ALL",
            f"user_profile:{user.id}",
        ])

        notify_user(
            user,
            title="Cohort access suspended",
            message=(
                f"Hi {user.get_full_name() or user.email}, your cohort status for {app.course.name} "
                "has been suspended. Timetable and meeting links are temporarily disabled."
            ),
            notification_type=Notification.Type.WARNING,
            action_url="application_tracker",
            dedupe_key=f"application:{app.id}:suspended",
        )
        self.message_user(
            request,
            f"Successfully suspended cohort access for {user.email} ({app.application_number}).",
            messages.WARNING,
        )
        return HttpResponseRedirect(reverse("admin:accounts_user_change", args=[user.pk]))

    def unsuspend_user_cohort_view(self, request, object_id):
        user = self.get_object(request, object_id)
        if not user:
            self.message_user(request, "User not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:accounts_user_changelist"))

        profile = getattr(user, "student_profile", None)
        if not profile:
            self.message_user(request, "No student profile for this user.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:accounts_user_change", args=[user.pk]))

        app = profile.applications.order_by("-applied_at").first()
        if not app:
            self.message_user(request, "No active application found for student.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:accounts_user_change", args=[user.pk]))

        from applications.models import Application
        from applications.services.state_machine import transition_application_status
        from common.models import Notification
        from common.services.notifications import display_name, notify_user
        from django.core.cache import cache

        target_status = Application.Status.COHORT_ASSIGNED if app.assigned_cohort_id else Application.Status.QUALIFIED
        try:
            transition_application_status(
                app,
                target_status,
                user=request.user,
                reason="Admin unsuspended student via User admin",
            )
        except Exception:
            pass

        cache.delete_many([
            f"attendance:list:user_{user.id}:ACTIVE",
            f"attendance:list:user_{user.id}:ALL",
            f"user_profile:{user.id}",
        ])

        cohort_name = f"{app.assigned_cohort.name} ({app.assigned_cohort.code})" if app.assigned_cohort else "course"
        notify_user(
            user,
            title="Cohort access restored",
            message=(
                f"Hi {display_name(user)}, your cohort access for {app.course.name} "
                f"({cohort_name}) has been restored. Timetable and meeting links are active."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="timetable",
            dedupe_key=f"application:{app.id}:unsuspended",
        )
        self.message_user(
            request,
            f"Successfully unsuspended student {user.email} and restored cohort access!",
            messages.SUCCESS,
        )
        return HttpResponseRedirect(reverse("admin:accounts_user_change", args=[user.pk]))

    @admin.display(description="Cohort & Suspension Quick Actions")
    @admin.display(description="Cohort & Suspension Quick Actions")
    def cohort_quick_actions(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No student profile record"

            app = profile.applications.order_by("-applied_at").first()
            if not app:
                return "No application submitted"

            if not app.assigned_cohort_id:
                return format_html(
                    '<div style="padding: 2px 0; opacity: 0.8;">'
                    '<strong>Status:</strong> {} &nbsp;|&nbsp; <em>No cohort assigned yet to this student.</em>'
                    '</div>',
                    app.get_status_display(),
                )

            suspend_url = reverse("admin:account-user-suspend-cohort", args=[obj.pk])
            unsuspend_url = reverse("admin:account-user-unsuspend-cohort", args=[obj.pk])
            transfer_url = reverse("admin:application-transfer-cohort-admin", args=[app.pk])

            if getattr(app, "status", "") == "SUSPENDED":
                action_btn = f'<a class="button" href="{unsuspend_url}">Unsuspend Student (Restore Cohort Access)</a>'
                status_text = '<strong>Status:</strong> <span style="color: var(--error-fg, #ba2121); font-weight: bold;">Suspended</span>'
            else:
                action_btn = f'<a class="button" href="{suspend_url}">Suspend Cohort Access</a>'
                status_text = f'<strong>Status:</strong> {app.get_status_display()}'

            transfer_btn = f'<a class="button" href="{transfer_url}">Transfer Cohort (From / To)</a>'

            cohort_info = f"<strong>Current Cohort:</strong> {app.assigned_cohort.name} ({app.assigned_cohort.code})" if app.assigned_cohort else "<strong>Current Cohort:</strong> Unassigned"

            return format_html(
                '<div style="padding: 2px 0;">'
                '<div style="margin-bottom: 8px;">{} &nbsp;|&nbsp; {}</div>'
                '<div>{} &nbsp; {}</div>'
                '</div>',
                format_html(status_text),
                format_html(cohort_info),
                format_html(action_btn),
                format_html(transfer_btn),
            )
        except Exception:
            return "No cohort action available"

    @admin.display(description="Student Code / ID", ordering="student_profile__student_code")
    def student_id_display(self, obj):
        if obj.role != User.Role.STUDENT:
            return "-"
        try:
            profile = getattr(obj, "student_profile", None)
            return profile.student_code if profile else "-"
        except Exception:
            return "-"

    @admin.display(description="Application Number", ordering="student_profile__applications__application_number")
    def application_numbers_display(self, obj):
        if obj.role != User.Role.STUDENT:
            return "-"
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "-"
            apps = list(profile.applications.values_list("application_number", flat=True))
            return ", ".join(apps) if apps else "-"
        except Exception:
            return "-"

    @admin.display(description="Student access")
    def student_access_status(self, obj):
        if obj.role != User.Role.STUDENT:
            return "Not applicable"
        try:
            profile = getattr(obj, "student_profile", None)
            return "Issued" if profile and profile.is_official_student else "Candidate"
        except Exception:
            return "Candidate"

    @admin.display(description="Student role verification")
    def student_role_verification(self, obj):
        if obj.role != User.Role.STUDENT:
            return "Not applicable"
        try:
            profile = getattr(obj, "student_profile", None)
            if profile is None:
                return "PENDING - candidate profile is missing"
            application = profile.applications.order_by("-applied_at").first()
            if not application:
                return "PENDING - no application record"
            interview = getattr(application, "pre_screening_interview", None)
            interview_satisfied = bool(
                not (application.course and application.course.requires_interview)
                or (
                    interview
                    and getattr(interview, "status", "") == "PASSED"
                )
            )
            verified = bool(
                application.qualified is True
                and interview_satisfied
                and profile.is_linkedin_connected
                and (profile.is_github_connected or profile.github_url)
            )
            return "VERIFIED" if verified else "PENDING"
        except Exception:
            return "PENDING"

    @admin.display(description="Student Code / ID")
    def student_id_detail(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No student profile record"
            url = reverse("admin:students_studentprofile_change", args=[profile.pk])
            return format_html('<a href="{}"><strong>{}</strong></a>', url, profile.student_code)
        except Exception:
            return "No student profile record"

    @admin.display(description="Application Number(s)")
    def application_numbers_detail(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No applications"
            apps = profile.applications.select_related("course").all()
            if not apps:
                return "No applications submitted yet"
            links = []
            for app in apps:
                url = reverse("admin:applications_application_change", args=[app.pk])
                course_name = app.course.name if app.course else "Unknown Course"
                links.append(
                    f'<a href="{url}"><strong>{app.application_number}</strong></a> — '
                    f'{course_name} ({app.get_status_display()})'
                )
            return format_html("<br>".join(links))
        except Exception:
            return "No applications submitted yet"

    @admin.display(description="Official student code")
    def official_student_code(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if profile and profile.is_official_student:
                return f"{profile.student_code} (issued {profile.student_identity_issued_at})"
            return "Not issued - profile remains a candidate record"
        except Exception:
            return "Not issued - profile remains a candidate record"

    @admin.display(description="Active cohort")
    def active_student_cohort(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if profile is None:
                return "Not assigned"
            application = profile.applications.filter(assigned_cohort__isnull=False).select_related(
                "assigned_cohort", "course"
            ).order_by("-applied_at").first()
            if application and application.assigned_cohort:
                course_name = application.course.name if application.course else ""
                if application.status == "SUSPENDED":
                    return f"{application.assigned_cohort.code} (SUSPENDED)"
                return f"{application.assigned_cohort.code} - {course_name}"
            return "Not assigned"
        except Exception:
            return "Not assigned"

    @admin.display(description="SURE TRUST journey")
    def student_journey_summary(self, obj):
        if obj.role != User.Role.STUDENT:
            return "Not applicable"
        try:
            profile = getattr(obj, "student_profile", None)
            if profile is None:
                return "Not applicable"
            from applications.services.journey_service import build_student_journey

            journey = build_student_journey(profile)
            return (
                f"{journey['completed_steps']}/{journey['total_steps']} stages "
                f"({journey['completion_percentage']}%) - {journey['status']}"
            )
        except Exception:
            return "Not available"


@admin.register(UserSearch)
class UserSearchAdmin(admin.ModelAdmin):
    change_form_template = "admin/accounts/usersearch/change_form.html"

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superuser or getattr(request.user, "role", None) == User.Role.ADMIN

    def change_view(self, request, object_id, form_url="", extra_context=None):
        extra_context = extra_context or {}
        try:
            user_obj = self.get_object(request, object_id)
            if user_obj:
                full_name = user_obj.get_full_name().strip() or user_obj.email
                initial = full_name[0].upper() if full_name else "U"

                student_profile = getattr(user_obj, "student_profile", None)
                mentor_profile = getattr(user_obj, "mentor_profile", None)
                volunteer_profile = getattr(user_obj, "volunteer_profile", None)
                company_profile = getattr(user_obj, "company", None)

                profile_photo_url = None
                if student_profile and getattr(student_profile, "profile_photo", None) and hasattr(student_profile.profile_photo, "url"):
                    try:
                        profile_photo_url = student_profile.profile_photo.url
                    except Exception:
                        profile_photo_url = None
                elif company_profile and getattr(company_profile, "logo", None) and hasattr(company_profile.logo, "url"):
                    try:
                        profile_photo_url = company_profile.logo.url
                    except Exception:
                        profile_photo_url = None

                registration_id = "-"
                user_address = "Not specified"
                if student_profile:
                    registration_id = student_profile.student_code or "-"
                    city = getattr(student_profile, "city", "") or ""
                    state = getattr(student_profile, "state", "") or ""
                    country = getattr(student_profile, "country", "") or "India"
                    parts = [p for p in [city, state, country] if p]
                    user_address = ", ".join(parts) if parts else "Not specified"
                elif mentor_profile:
                    registration_id = f"MEN-{user_obj.id.hex[:6].upper()}"
                elif volunteer_profile:
                    registration_id = f"VOL-{user_obj.id.hex[:6].upper()}"
                elif company_profile:
                    registration_id = f"COM-{company_profile.id.hex[:6].upper()}"
                    user_address = getattr(company_profile, "location", "") or "Not specified"

                student_resume_exists = False
                if student_profile and getattr(student_profile, "resume", None):
                    try:
                        from common.storage import private_storage
                        storage = student_profile.resume.storage if student_profile.resume else private_storage
                        student_resume_exists = bool(
                            storage.exists(student_profile.resume.name)
                            or private_storage.exists(student_profile.resume.name)
                        )
                    except Exception:
                        student_resume_exists = False

                # Comprehensive Collections
                applications_list = []
                prescreening_schedules = []
                candidate_interviews = []
                community_activities = []
                prescreening_exams = []
                academic_cohorts = []
                attendance_records_list = []
                absence_warnings_list = []
                attendance_summaries_list = []
                training_attendances_list = []
                training_sessions_list = []
                assignment_submissions_list = []
                capstone_submissions_list = []
                module_test_submissions_list = []
                volunteer_tasks_list = []
                volunteer_help_requests_list = []
                company_job_postings = []
                company_job_references = []
                company_shortlisted_students = []
                certificates_list = []
                user_support_requests = []
                permission_messages = []
                feedbacks_list = []
                notifications_list = []
                password_reset_otps = []

                mentor_names = "Unassigned"
                volunteer_names = "None"
                student_course_name = "N/A"
                student_cohort_code = "Unassigned"
                assignments_submitted_count = 0
                total_assignments_count = 0
                capstones_submitted_count = 0
                total_capstones_count = 0
                attendance_percentage = 0
                recent_activities = []
                total_students_count = 0

                try:
                    from applications.models import Application, PreScreening, PreScreeningInterview, CommunityActivity
                    from exams.models import Exam, ModuleTestSubmission
                    from assignments.models import Submission, Assignment, CapstoneSubmission, CapstoneProject
                    from attendance.models import AttendanceRecord, AbsenceWarning, AttendanceSummary, PermissionRequestMessage
                    from trainings.models import TrainingSession, TrainingAttendance
                    from volunteers.models import VolunteerTask, VolunteerHelpRequest
                    from companies.models import JobPosting, JobReference
                    from certificates.models import Certificate
                    from common.models import UserRequest, Notification
                    from feedback.models import Feedback
                    from accounts.models import PasswordResetOTP

                    # 1. Student Applications & Journey
                    if student_profile:
                        apps = student_profile.applications.select_related("course", "assigned_cohort", "verified_by").order_by("-applied_at").all()
                        applications_list = list(apps)
                        active_app = apps.filter(assigned_cohort__isnull=False).first() or apps.first()
                        if active_app:
                            student_course_name = str(active_app.course) if active_app.course else "N/A"
                            if active_app.assigned_cohort:
                                student_cohort_code = active_app.assigned_cohort.code
                                m_list = [m.get_full_name().strip() or m.email for m in active_app.assigned_cohort.mentors.all()]
                                v_list = [v.get_full_name().strip() or v.email for v in active_app.assigned_cohort.volunteers.all()]
                                mentor_names = ", ".join(m_list) if m_list else "Unassigned"
                                volunteer_names = ", ".join(v_list) if v_list else "None"

                        # Screening & Interviews
                        prescreening_schedules = list(PreScreening.objects.filter(application__student=student_profile).select_related("application", "examiner").order_by("-scheduled_date")[:5])
                        candidate_interviews = list(PreScreeningInterview.objects.filter(application__student=student_profile).select_related("application", "interviewer").order_by("-scheduled_date")[:5])
                        community_activities = list(CommunityActivity.objects.filter(application__student=student_profile).select_related("application").order_by("-created_at")[:5])
                        prescreening_exams = list(Exam.objects.filter(application__student=student_profile).select_related("application").order_by("-created_at")[:5])

                        # Attendance & Warnings
                        attendance_records_list = list(AttendanceRecord.objects.filter(student=student_profile).order_by("-class_date")[:10])
                        absence_warnings_list = list(AbsenceWarning.objects.filter(student=student_profile).order_by("-created_at")[:5])
                        attendance_summaries_list = list(AttendanceSummary.objects.filter(student=student_profile))
                        training_attendances_list = list(TrainingAttendance.objects.filter(student=student_profile).select_related("session").order_by("-created_at")[:10])

                        total_att = AttendanceRecord.objects.filter(student=student_profile).count()
                        present_att = AttendanceRecord.objects.filter(student=student_profile, status="PRESENT").count()
                        attendance_percentage = round((present_att / total_att * 100)) if total_att > 0 else 0

                        # Assignments & Capstones
                        assignment_submissions_list = list(Submission.objects.filter(student=student_profile).select_related("assignment").order_by("-submitted_at")[:10])
                        assignments_submitted_count = len(assignment_submissions_list)
                        total_assignments_count = Assignment.objects.count()

                        capstone_submissions_list = list(CapstoneSubmission.objects.filter(student=student_profile).select_related("project").order_by("-submitted_at")[:5])
                        capstones_submitted_count = len(capstone_submissions_list)
                        total_capstones_count = CapstoneProject.objects.count()

                        # Module Tests
                        module_test_submissions_list = list(ModuleTestSubmission.objects.filter(student=student_profile).select_related("test").order_by("-submitted_at")[:10])

                        for sub in assignment_submissions_list[:5]:
                            recent_activities.append({
                                "title": sub.assignment.title if (hasattr(sub, "assignment") and sub.assignment) else "Assignment Submission",
                                "category": "Assignment",
                                "date": sub.submitted_at,
                                "status": sub.get_status_display() if hasattr(sub, "get_status_display") else "Submitted",
                            })

                    # 2. Mentor Profile Data
                    elif mentor_profile:
                        cohorts = user_obj.mentored_cohorts.order_by("-start_date").all()
                        academic_cohorts = list(cohorts)
                        total_students_count = Application.objects.filter(assigned_cohort__in=cohorts).values("student").distinct().count()
                        training_sessions_list = list(TrainingSession.objects.filter(trainer=user_obj).select_related("training", "cohort").order_by("-session_date")[:10])

                    # 3. Volunteer Profile Data
                    elif volunteer_profile:
                        cohorts = user_obj.volunteered_cohorts.order_by("-start_date").all()
                        academic_cohorts = list(cohorts)
                        total_students_count = Application.objects.filter(assigned_cohort__in=cohorts).values("student").distinct().count()
                        volunteer_tasks_list = list(VolunteerTask.objects.filter(assigned_to=user_obj).select_related("cohort").order_by("-due_date")[:10])
                        volunteer_help_requests_list = list(VolunteerHelpRequest.objects.filter(requested_by=user_obj).select_related("cohort").order_by("-created_at")[:5])

                    # 4. Company Profile Data
                    elif company_profile:
                        company_shortlisted_students = list(company_profile.shortlisted_students.select_related("user")[:15])
                        company_job_postings = list(JobPosting.objects.filter(company=company_profile).order_by("-created_at")[:10])
                        company_job_references = list(JobReference.objects.filter(company=company_profile).select_related("cohort").order_by("-created_at")[:10])

                    # 5. Certificates
                    from django.db.models import Q
                    cert_query = Q(recipient_user=user_obj)
                    if student_profile:
                        cert_query |= Q(student=student_profile)
                    certificates_list = list(Certificate.objects.filter(cert_query).order_by("-issued_at")[:10])

                    # 6. User Support Requests, Notes & Feedback
                    user_support_requests = list(UserRequest.objects.filter(sender=user_obj).order_by("-created_at")[:10])
                    permission_messages = list(PermissionRequestMessage.objects.filter(sender=user_obj).order_by("-created_at")[:10])
                    feedbacks_list = list(Feedback.objects.filter(user=user_obj).order_by("-created_at")[:10])
                    notifications_list = list(Notification.objects.filter(user=user_obj).order_by("-created_at")[:10])
                    password_reset_otps = list(PasswordResetOTP.objects.filter(email=user_obj.email).order_by("-created_at")[:5])

                except Exception:
                    pass

                extra_context.update({
                    "report_user": user_obj,
                    "report_full_name": full_name,
                    "report_initial": initial,
                    "profile_photo_url": profile_photo_url,
                    "registration_id": registration_id,
                    "user_address": user_address,
                    "student_profile": student_profile,
                    "mentor_profile": mentor_profile,
                    "volunteer_profile": volunteer_profile,
                    "company_profile": company_profile,
                    "student_course_name": student_course_name,
                    "student_cohort_code": student_cohort_code,
                    "mentor_names": mentor_names,
                    "volunteer_names": volunteer_names,
                    "assignments_submitted_count": assignments_submitted_count,
                    "total_assignments_count": total_assignments_count,
                    "capstones_submitted_count": capstones_submitted_count,
                    "total_capstones_count": total_capstones_count,
                    "attendance_percentage": attendance_percentage,
                    "recent_activities": recent_activities,
                    "total_students_count": total_students_count,
                    # Dynamic Data across all models
                    "applications_list": applications_list,
                    "prescreening_schedules": prescreening_schedules,
                    "candidate_interviews": candidate_interviews,
                    "community_activities": community_activities,
                    "prescreening_exams": prescreening_exams,
                    "academic_cohorts": academic_cohorts,
                    "attendance_records_list": attendance_records_list,
                    "absence_warnings_list": absence_warnings_list,
                    "attendance_summaries_list": attendance_summaries_list,
                    "training_attendances_list": training_attendances_list,
                    "training_sessions_list": training_sessions_list,
                    "assignment_submissions_list": assignment_submissions_list,
                    "capstone_submissions_list": capstone_submissions_list,
                    "module_test_submissions_list": module_test_submissions_list,
                    "volunteer_tasks_list": volunteer_tasks_list,
                    "volunteer_help_requests_list": volunteer_help_requests_list,
                    "company_job_postings": company_job_postings,
                    "company_job_references": company_job_references,
                    "company_shortlisted_students": company_shortlisted_students,
                    "certificates_list": certificates_list,
                    "user_support_requests": user_support_requests,
                    "permission_messages": permission_messages,
                    "feedbacks_list": feedbacks_list,
                    "notifications_list": notifications_list,
                    "password_reset_otps": password_reset_otps,
                    "student_resume_exists": student_resume_exists,
                })
        except Exception:
            pass

        return super().change_view(request, object_id, form_url, extra_context=extra_context)
    list_display = (
        "full_name_display",
        "email",
        "role_badge",
        "phone_number",
        "date_of_birth",
        "student_code_display",
        "cohorts_display",
        "is_active",
    )
    list_filter = ("role", "gender", "is_active")

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("student_profile", "mentor_profile", "volunteer_profile", "company")
            .prefetch_related(
                "student_profile__applications__assigned_cohort",
                "mentored_cohorts",
                "volunteered_cohorts",
            )
        )
    search_fields = (
        "email",
        "first_name",
        "last_name",
        "phone_number",
        "mapped_email",
        "student_profile__student_code",
        "linkedin_id",
    )
    readonly_fields = (
        "full_name_display",
        "role_badge",
        "student_full_profile_details",
        "student_cohort_mentors_and_volunteers_widget",
        "student_applications_table",
        "student_attendance_summary_widget",
        "student_exams_and_results_widget",
        "student_assignments_and_submissions_widget",
        "student_certificates_and_placements_widget",
        "user_support_requests_and_activity_widget",
        "mentor_profile_details",
        "volunteer_profile_details",
        "company_profile_details",
    )

    # Base fieldset shown for all users
    _base_fieldset = (
        "User Account Information",
        {
            "fields": (
                "email",
                "mapped_email",
                "first_name",
                "last_name",
                "gender",
                "phone_number",
                "date_of_birth",
                "linkedin_id",
                "role",
                "is_active",
                "is_email_verified",
            )
        },
    )

    # Student-only fieldsets
    _student_fieldsets = [
        (
            "Student Profile & Enrollment Details",
            {
                "classes": ("collapse",),
                "fields": (
                    "student_full_profile_details",
                    "student_applications_table",
                    "student_attendance_summary_widget",
                ),
            },
        ),
        (
            "Assigned Cohort Mentors & Volunteers",
            {
                "classes": ("collapse",),
                "fields": ("student_cohort_mentors_and_volunteers_widget",),
            },
        ),
        (
            "Academic Performance, Exams & Module Tests",
            {
                "classes": ("collapse",),
                "fields": ("student_exams_and_results_widget",),
            },
        ),
        (
            "Assignments, Capstones & Submissions",
            {
                "classes": ("collapse",),
                "fields": ("student_assignments_and_submissions_widget",),
            },
        ),
        (
            "Certificates & Job Placements",
            {
                "classes": ("collapse",),
                "fields": ("student_certificates_and_placements_widget",),
            },
        ),
    ]

    # Mentor-only fieldset
    _mentor_fieldset = (
        "Mentor Profile Details",
        {
            "classes": ("collapse",),
            "fields": ("mentor_profile_details",),
        },
    )

    # Volunteer / Trustee fieldset
    _volunteer_fieldset = (
        "Volunteer / Trustee Details",
        {
            "classes": ("collapse",),
            "fields": ("volunteer_profile_details",),
        },
    )

    # Company-only fieldset
    _company_fieldset = (
        "Company Profile Details",
        {
            "classes": ("collapse",),
            "fields": ("company_profile_details",),
        },
    )

    # Shared by all roles
    _support_fieldset = (
        "Support Requests, Leave Messages & Activity Log",
        {
            "classes": ("collapse",),
            "fields": ("user_support_requests_and_activity_widget",),
        },
    )

    def get_fieldsets(self, request, obj=None):
        fieldsets = [self._base_fieldset]
        if obj:
            if obj.role == "STUDENT":
                fieldsets.extend(self._student_fieldsets)
            elif obj.role == "MENTOR":
                fieldsets.append(self._mentor_fieldset)
            elif obj.role in {"VOLUNTEER", "TRUSTEE"}:
                fieldsets.append(self._volunteer_fieldset)
            elif obj.role == "COMPANY":
                fieldsets.append(self._company_fieldset)
        fieldsets.append(self._support_fieldset)
        return fieldsets


    @admin.display(description="Full Name", ordering="first_name")
    def full_name_display(self, obj):
        try:
            return obj.get_full_name().strip() or obj.email
        except Exception:
            return getattr(obj, "email", "-")

    @admin.display(description="Role", ordering="role")
    def role_badge(self, obj):
        try:
            colors = {
                "STUDENT": "#007bff",
                "MENTOR": "#28a745",
                "VOLUNTEER": "#ffc107",
                "TRUSTEE": "#6f42c1",
                "COMPANY": "#fd7e14",
                "ADMIN": "#dc3545",
            }
            role_val = getattr(obj, "role", "")
            color = colors.get(role_val, "#6c757d")
            display_val = obj.get_role_display() if hasattr(obj, "get_role_display") else role_val
            return format_html("<span style='background-color: {}; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: bold;'>{}</span>", color, display_val)
        except Exception:
            return "-"

    @admin.display(description="Student Code", ordering="student_profile__student_code")
    def student_code_display(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            return profile.student_code if (profile and profile.student_code) else "-"
        except Exception:
            return "-"

    @admin.display(description="Assigned Cohort(s)")
    def cohorts_display(self, obj):
        try:
            if obj.role == "STUDENT":
                profile = getattr(obj, "student_profile", None)
                if profile:
                    cohorts = [
                        app.assigned_cohort.code
                        for app in profile.applications.all()
                        if getattr(app, "assigned_cohort", None) and app.assigned_cohort.code
                    ]
                    return ", ".join(cohorts) if cohorts else "Unassigned"
            elif obj.role == "MENTOR":
                cohorts = getattr(obj, "mentored_cohorts", None)
                if cohorts:
                    return ", ".join(c.code for c in cohorts.all() if getattr(c, "code", None)) or "None"
            elif obj.role in {"VOLUNTEER", "TRUSTEE"}:
                cohorts = getattr(obj, "volunteered_cohorts", None)
                if cohorts:
                    return ", ".join(c.code for c in cohorts.all() if getattr(c, "code", None)) or "None"
        except Exception:
            pass
        return "-"

    @admin.display(description="Student Profile Info")
    def student_full_profile_details(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No Student Profile linked."
            
            # Profile photo
            photo_url = profile.profile_photo.url if (getattr(profile, "profile_photo", None) and hasattr(profile.profile_photo, "url")) else None
            photo_html = f'<img src="{photo_url}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid #007bff; float: right; margin: 0 0 10px 15px;" />' if photo_url else '<div style="width: 100px; height: 100px; border-radius: 50%; background: #444; float: right; margin: 0 0 10px 15px; display: flex; align-items: center; justify-content: center; font-size: 36px; color: #888;">👤</div>'

            # LinkedIn link
            linkedin_url = getattr(profile, "linkedin_url", None) or ""
            linkedin_html = f"<a href='{linkedin_url}' target='_blank' style='color: #0a66c2; text-decoration: none;'>🔗 {linkedin_url}</a>" if linkedin_url else "Not linked"

            # GitHub link
            github_url = getattr(profile, "github_url", None) or ""
            github_user = getattr(profile, "github_username", None) or ""
            github_html = f"<a href='{github_url}' target='_blank' style='color: #f0f6fc; text-decoration: none;'>🐙 {github_user or github_url}</a>" if (github_url or github_user) else "Not linked"
            github_repo = getattr(profile, "github_repo_url", None) or ""
            github_repo_html = f"<a href='{github_repo}' target='_blank' style='color: #58a6ff;'>📂 {github_repo}</a>" if github_repo else "N/A"

            # Portfolio
            portfolio_url = getattr(profile, "portfolio_url", None) or ""
            portfolio_html = f"<a href='{portfolio_url}' target='_blank' style='color: #ffc107;'>🌐 {portfolio_url}</a>" if portfolio_url else "N/A"

            return format_html(
                """
                <div style='background: #252526; color: #fff; padding: 15px; border-radius: 6px; overflow: hidden;'>
                    {}
                    <p><b>Student Code:</b> {}</p>
                    <p><b>Gender:</b> {}</p>
                    <p><b>College:</b> {}</p>
                    <p><b>Degree / Specialization:</b> {} — {}</p>
                    <p><b>Education Level:</b> {}</p>
                    <p><b>Graduation Year:</b> {}</p>
                    <p><b>City / State:</b> {}, {}</p>
                    <hr style='border-color: #444; margin: 10px 0;'/>
                    <p><b>🔗 LinkedIn:</b> {}</p>
                    <p><b>🐙 GitHub:</b> {}</p>
                    <p><b>📂 GitHub Repo:</b> {}</p>
                    <p><b>🌐 Portfolio:</b> {}</p>
                    <hr style='border-color: #444; margin: 10px 0;'/>
                    <p><b>Identity Issued At:</b> {}</p>
                    <p><b>Official Student Status:</b> {}</p>
                </div>
                """,
                format_html(photo_html),
                profile.student_code or "N/A",
                obj.get_gender_display() if obj.gender else "Not specified",
                getattr(profile, "college", None) or "N/A",
                getattr(profile, "degree", None) or "N/A",
                getattr(profile, "specialization", None) or "N/A",
                profile.get_education_level_display() if hasattr(profile, "get_education_level_display") else "N/A",
                getattr(profile, "graduation_year", None) or "N/A",
                getattr(profile, "city", None) or "N/A",
                getattr(profile, "state", None) or "N/A",
                format_html(linkedin_html),
                format_html(github_html),
                format_html(github_repo_html),
                format_html(portfolio_html),
                profile.student_identity_issued_at or "Not issued",
                "Yes" if getattr(profile, "is_official_student", False) else "No",
            )
        except Exception:
            return "No Student Profile linked."

    @admin.display(description="Assigned Cohort Mentors & Volunteers")
    def student_cohort_mentors_and_volunteers_widget(self, obj):
        try:
            if obj.role != "STUDENT":
                return "Not Applicable (User is not a Student)."
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No Student Profile linked."
            
            apps = profile.applications.filter(assigned_cohort__isnull=False).select_related("assigned_cohort", "assigned_cohort__course")
            if not apps.exists():
                return "No active cohort enrollment found for this student."
            
            blocks = []
            for app in apps:
                cohort = app.assigned_cohort
                mentors = cohort.mentors.all()
                volunteers = cohort.volunteers.all()

                mentor_list = "".join(
                    f"<li><b>{m.get_full_name() or m.email}</b> ({m.email}) {f'— 📞 {m.phone_number}' if getattr(m, 'phone_number', None) else ''}</li>"
                    for m in mentors
                ) if mentors.exists() else "<li><em>No Mentor assigned to this cohort yet.</em></li>"

                volunteer_list = "".join(
                    f"<li><b>{v.get_full_name() or v.email}</b> ({v.email}) {f'— 📞 {v.phone_number}' if getattr(v, 'phone_number', None) else ''}</li>"
                    for v in volunteers
                ) if volunteers.exists() else "<li><em>No Volunteer assigned to this cohort yet.</em></li>"

                blocks.append(
                    format_html(
                        """
                        <div style='background: #1e1e1e; border-left: 4px solid #007bff; padding: 12px; margin-bottom: 10px; border-radius: 4px;'>
                            <h4 style='margin: 0 0 8px 0; color: #007bff;'>🎓 Cohort: {} ({})</h4>
                            <p style='margin: 4px 0; color: #28a745;'><b>👨‍🏫 Assigned Mentor(s):</b></p>
                            <ul style='margin: 4px 0 10px 20px;'>{}</ul>
                            <p style='margin: 4px 0; color: #ffc107;'><b>🤝 Assigned Volunteer(s):</b></p>
                            <ul style='margin: 4px 0 0 20px;'>{}</ul>
                        </div>
                        """,
                        cohort.code,
                        cohort.course.name if cohort.course else "N/A",
                        format_html(mentor_list),
                        format_html(volunteer_list),
                    )
                )
            
            return format_html("".join(blocks))
        except Exception:
            return "Unable to load cohort mentors & volunteers."

    @admin.display(description="Applications & Cohort Enrollment")
    def student_applications_table(self, obj):
        try:
            profile = obj.student_profile
            if not profile:
                return "N/A"
            apps = profile.applications.select_related("course", "assigned_cohort").all()
            if not apps.exists():
                return "No applications found."
            rows = "".join(
                f"<tr><td>{a.application_number}</td><td>{a.course.name if a.course else 'N/A'}</td>"
                f"<td><b>{a.assigned_cohort.code if a.assigned_cohort else 'Unassigned'}</b></td>"
                f"<td><span style='background: #007bff; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;'>{a.assigned_cohort.get_lst_batch_display() if a.assigned_cohort and a.assigned_cohort.lst_batch else 'Not Assigned'}</span></td>"
                f"<td><b style='color: {'#dc3545' if a.status == 'SUSPENDED' else '#28a745'}'>{a.get_status_display()}</b></td>"
                f"<td>{a.applied_at.strftime('%Y-%m-%d') if a.applied_at else ''}</td></tr>"
                for a in apps
            )
            return format_html(
                """
                <table style='width: 100%; border-collapse: collapse; background: #252526; color: #fff;' border='1' cellpadding='8'>
                    <thead><tr style='background: #333;'><th>App #</th><th>Course</th><th>Cohort</th><th>Effective LST Batch</th><th>Status</th><th>Applied Date</th></tr></thead>
                    <tbody>{}</tbody>
                </table>
                """,
                format_html(rows),
            )
        except Exception:
            return "N/A"

    @admin.display(description="Attendance Stats & Warnings")
    def student_attendance_summary_widget(self, obj):
        try:
            profile = obj.student_profile
            if not profile:
                return "N/A"
            summaries = profile.attendance_summaries.all()
            warnings = profile.absence_warnings.all()
            total = summaries.count()
            attended = sum(1 for s in summaries if s.active_minutes and s.active_minutes > 0)
            rate = (attended / total * 100) if total > 0 else 0
            return format_html(
                """
                <div style='background: #252526; color: #fff; padding: 12px; border-radius: 6px;'>
                    <p><b>Attendance Rate:</b> <span style='font-size: 16px; font-weight: bold; color: {};'>{:.1f}%</span> ({}/{} sessions)</p>
                    <p><b>Absence Warnings:</b> {} total warning(s)</p>
                </div>
                """,
                "#28a745" if rate >= 75 else "#dc3545",
                rate,
                attended,
                total,
                warnings.count(),
            )
        except Exception:
            return "N/A"

    @admin.display(description="Exams, Interviews & Screening Results")
    def student_exams_and_results_widget(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No screening or exam records."
            
            from exams.models import Exam, ModuleTestSubmission
            from applications.models import PreScreeningInterview
            
            apps = profile.applications.all()
            exams = Exam.objects.filter(application__in=apps).select_related("application__course")
            interviews = PreScreeningInterview.objects.filter(application__in=apps).select_related("application__course")
            module_subs = ModuleTestSubmission.objects.filter(student=profile).select_related("test", "test__course")
            
            exam_rows = "".join(
                f"<tr><td>Exam #{e.pk}</td><td>{e.application.course.name if (e.application and e.application.course) else 'N/A'}</td>"
                f"<td>{e.marks_obtained or 'Pending'} / {e.total_marks} ({e.percentage or 0}%)</td>"
                f"<td><b style='color: {'#28a745' if e.qualified else '#dc3545'}'>{'QUALIFIED' if e.qualified else 'NOT QUALIFIED'}</b></td></tr>"
                for e in exams
            ) if exams.exists() else "<tr><td colspan='4'>No screening exams found</td></tr>"

            interview_rows = "".join(
                f"<tr><td>Candidate Interview</td><td>{i.application.course.name if (i.application and i.application.course) else 'N/A'}</td>"
                f"<td>Score: {i.score or 'N/A'}</td>"
                f"<td><b style='color: {'#28a745' if i.status == 'PASSED' else '#dc3545'}'>{i.get_status_display()}</b></td></tr>"
                for i in interviews
            ) if interviews.exists() else "<tr><td colspan='4'>No candidate interviews scheduled</td></tr>"

            module_rows = "".join(
                f"<tr><td>{m.test.title if m.test else 'Module Test'}</td><td>{m.test.course.name if (m.test and m.test.course) else 'N/A'}</td>"
                f"<td>{m.marks_obtained or 0} / {m.total_marks or 100} ({m.percentage or 0}%)</td>"
                f"<td><b style='color: {'#28a745' if m.qualified else '#dc3545'}'>{'PASSED' if m.qualified else 'FAILED'}</b></td></tr>"
                for m in module_subs
            ) if module_subs.exists() else "<tr><td colspan='4'>No module tests submitted</td></tr>"

            return format_html(
                """
                <div style='background: #252526; color: #fff; padding: 12px; border-radius: 6px;'>
                    <h4 style='margin-top: 0; color: #007bff;'>📋 Pre-Screening Exams & Candidate Interviews</h4>
                    <table style='width: 100%; border-collapse: collapse; margin-bottom: 12px;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Type</th><th>Course</th><th>Marks / Score</th><th>Result</th></tr></thead>
                        <tbody>{}{}</tbody>
                    </table>
                    <h4 style='margin-top: 12px; color: #28a745;'>📊 Module Test Submissions</h4>
                    <table style='width: 100%; border-collapse: collapse;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Test Title</th><th>Course</th><th>Marks</th><th>Status</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                </div>
                """,
                format_html(exam_rows),
                format_html(interview_rows),
                format_html(module_rows),
            )
        except Exception:
            return "No exam or interview records found."

    @admin.display(description="Assignments & Capstone Projects")
    def student_assignments_and_submissions_widget(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return "No assignment or capstone records."
            
            from assignments.models import Submission, CapstoneSubmission
            subs = Submission.objects.filter(student=profile).select_related("assignment", "assignment__course")
            capstones = CapstoneSubmission.objects.filter(student=profile).select_related("project", "project__course")

            sub_rows = "".join(
                f"<tr><td>{s.assignment.title if s.assignment else 'Assignment'}</td>"
                f"<td>{s.assignment.course.name if (s.assignment and s.assignment.course) else 'N/A'}</td>"
                f"<td>{s.get_status_display()}</td>"
                f"<td>{s.marks_obtained or 'Pending'} / {s.assignment.max_marks if s.assignment else 100}</td></tr>"
                for s in subs
            ) if subs.exists() else "<tr><td colspan='4'>No assignment submissions found</td></tr>"

            cap_rows = "".join(
                f"<tr><td>{c.project.title if c.project else 'Capstone Project'}</td>"
                f"<td>{c.project.course.name if (c.project and c.project.course) else 'N/A'}</td>"
                f"<td>{c.get_status_display()}</td>"
                f"<td>{c.marks_obtained or 'Pending'}</td></tr>"
                for c in capstones
            ) if capstones.exists() else "<tr><td colspan='4'>No capstone project submissions found</td></tr>"

            return format_html(
                """
                <div style='background: #252526; color: #fff; padding: 12px; border-radius: 6px;'>
                    <h4 style='margin-top: 0; color: #ffc107;'>📝 Regular Assignment Submissions</h4>
                    <table style='width: 100%; border-collapse: collapse; margin-bottom: 12px;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Assignment Title</th><th>Course</th><th>Status</th><th>Marks</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                    <h4 style='margin-top: 12px; color: #6f42c1;'>🎓 Capstone Project Submissions</h4>
                    <table style='width: 100%; border-collapse: collapse;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Project Title</th><th>Course</th><th>Status</th><th>Score</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                </div>
                """,
                format_html(sub_rows),
                format_html(cap_rows),
            )
        except Exception:
            return "No assignment records found."

    @admin.display(description="Certificates & Job Placements")
    def student_certificates_and_placements_widget(self, obj):
        try:
            profile = getattr(obj, "student_profile", None)
            from certificates.models import Certificate
            from companies.models import JobReference

            certs = Certificate.objects.filter(student=profile) if profile else Certificate.objects.none()
            refs = JobReference.objects.filter(user=obj)

            cert_rows = "".join(
                f"<tr><td><b>{c.certificate_number}</b></td>"
                f"<td>{c.course.name if c.course else 'N/A'}</td>"
                f"<td>{c.issue_date.strftime('%Y-%m-%d') if c.issue_date else ''}</td>"
                f"<td><a href='{c.pdf_file.url if c.pdf_file else '#'}' target='_blank' style='color: #007bff;'>Download PDF</a></td></tr>"
                for c in certs
            ) if certs.exists() else "<tr><td colspan='4'>No certificates issued yet</td></tr>"

            ref_rows = "".join(
                f"<tr><td>{r.job_posting.company.name if (r.job_posting and r.job_posting.company) else 'Company'}</td>"
                f"<td>{r.job_posting.title if r.job_posting else 'Job Title'}</td>"
                f"<td>{r.get_status_display()}</td>"
                f"<td>{r.created_at.strftime('%Y-%m-%d')}</td></tr>"
                for r in refs
            ) if refs.exists() else "<tr><td colspan='4'>No job placement references found</td></tr>"

            return format_html(
                """
                <div style='background: #252526; color: #fff; padding: 12px; border-radius: 6px;'>
                    <h4 style='margin-top: 0; color: #28a745;'>🏆 Course Completion Certificates</h4>
                    <table style='width: 100%; border-collapse: collapse; margin-bottom: 12px;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Certificate #</th><th>Course</th><th>Issued Date</th><th>PDF</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                    <h4 style='margin-top: 12px; color: #17a2b8;'>💼 Job References & Placement Status</h4>
                    <table style='width: 100%; border-collapse: collapse;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Company</th><th>Job Role</th><th>Status</th><th>Applied Date</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                </div>
                """,
                format_html(cert_rows),
                format_html(ref_rows),
            )
        except Exception:
            return "No certificate or job placement records found."

    @admin.display(description="User Support Requests & Activity Log")
    def user_support_requests_and_activity_widget(self, obj):
        try:
            from common.models import UserRequest, Notification
            from feedback.models import Feedback

            requests = UserRequest.objects.filter(sender=obj).order_by("-created_at")[:10]
            feedbacks = Feedback.objects.filter(user=obj).order_by("-created_at")[:10]

            req_rows = "".join(
                f"<tr><td>{r.ticket_number}</td>"
                f"<td>{r.get_category_display()}</td>"
                f"<td>{r.subject[:40]}</td>"
                f"<td><b style='color: {'#28a745' if r.status == 'RESOLVED' else '#ffc107'}'>{r.get_status_display()}</b></td>"
                f"<td>{r.created_at.strftime('%Y-%m-%d')}</td></tr>"
                for r in requests
            ) if requests.exists() else "<tr><td colspan='5'>No support requests / leave messages submitted</td></tr>"

            feed_rows = "".join(
                f"<tr><td>{f.get_feedback_type_display()}</td>"
                f"<td>{'⭐' * (f.rating or 5)}</td>"
                f"<td>{f.comment[:50]}</td>"
                f"<td>{f.created_at.strftime('%Y-%m-%d')}</td></tr>"
                for f in feedbacks
            ) if feedbacks.exists() else "<tr><td colspan='4'>No feedback submitted</td></tr>"

            return format_html(
                """
                <div style='background: #252526; color: #fff; padding: 12px; border-radius: 6px;'>
                    <h4 style='margin-top: 0; color: #dc3545;'>✉️ User Support Requests & Leave Apologies</h4>
                    <table style='width: 100%; border-collapse: collapse; margin-bottom: 12px;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Ticket #</th><th>Category</th><th>Subject</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                    <h4 style='margin-top: 12px; color: #ffc107;'>⭐ User Feedbacks Submitted</h4>
                    <table style='width: 100%; border-collapse: collapse;' border='1' cellpadding='6'>
                        <thead><tr style='background: #333;'><th>Type</th><th>Rating</th><th>Comment Excerpt</th><th>Date</th></tr></thead>
                        <tbody>{}</tbody>
                    </table>
                </div>
                """,
                format_html(req_rows),
                format_html(feed_rows),
            )
        except Exception:
            return "No support requests or feedback records found."

    @admin.display(description="Mentor Profile & Cohorts")
    def mentor_profile_details(self, obj):
        if obj.role != "MENTOR":
            return "User is not a Mentor."
        from applications.models import Application

        mentor_profile = getattr(obj, "mentor_profile", None)
        cohorts = obj.mentored_cohorts.order_by("-start_date").all()
        sessions = obj.conducted_training_sessions.all()

        full_name = obj.get_full_name().strip() or obj.email
        linkedin_url = getattr(mentor_profile, "linkedin_url", "") or ""
        linkedin_html = f"<a href='{linkedin_url}' target='_blank' style='color: #0a66c2; text-decoration: none;'>🔗 {linkedin_url}</a>" if linkedin_url else "Not linked"

        # Total students across all cohorts
        total_students = Application.objects.filter(
            assigned_cohort__in=cohorts
        ).values("student").distinct().count()

        # Build cohort breakdown rows (latest first)
        cohort_rows = ""
        for c in cohorts:
            student_count = Application.objects.filter(assigned_cohort=c).values("student").distinct().count()
            status_colors = {
                "ACTIVE": "#28a745", "OPEN": "#17a2b8", "COMPLETED": "#6c757d",
                "DRAFT": "#ffc107", "CANCELLED": "#dc3545",
            }
            s_color = status_colors.get(c.status, "#6c757d")
            cohort_rows += (
                f"<tr>"
                f"<td style='padding: 6px;'><b>{c.code}</b></td>"
                f"<td style='padding: 6px;'>{c.name}</td>"
                f"<td style='padding: 6px;'>{c.course}</td>"
                f"<td style='padding: 6px;'><span style='background: {s_color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;'>{c.get_status_display()}</span></td>"
                f"<td style='padding: 6px;'>{c.start_date} → {c.end_date}</td>"
                f"<td style='padding: 6px; text-align: center; font-weight: bold;'>{student_count} / {c.max_students}</td>"
                f"</tr>"
            )
        if not cohort_rows:
            cohort_rows = "<tr><td colspan='6' style='padding: 6px;'>No cohorts assigned</td></tr>"

        return format_html(
            """
            <div style='background: #252526; color: #fff; padding: 15px; border-radius: 6px; overflow: hidden;'>
                <div style='width: 80px; height: 80px; border-radius: 50%; background: #17a2b8; float: right; margin: 0 0 10px 15px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; font-weight: bold;'>{}</div>
                <h3 style='margin: 0 0 6px 0; color: #17a2b8;'>{}</h3>
                <p style='margin: 2px 0; color: #aaa;'>{}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>Gender:</b> {}</p>
                <p><b>Expertise:</b> {}</p>
                <p><b>Designation:</b> {}</p>
                <p><b>Company:</b> {}</p>
                <p><b>Years of Experience:</b> {}</p>
                <p><b>Bio:</b> {}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>🔗 LinkedIn:</b> {}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>📊 Total Students Taught (across all cohorts):</b> <span style='font-size: 18px; color: #28a745; font-weight: bold;'>{}</span></p>
                <p><b>🎓 Conducted Training Sessions:</b> {} session(s)</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <h4 style='color: #17a2b8; margin-bottom: 8px;'>📋 Assigned Cohorts (Latest First)</h4>
                <table style='width: 100%; border-collapse: collapse; color: #fff;' border='1' cellpadding='4'>
                    <thead><tr style='background: #333;'>
                        <th>Code</th><th>Name</th><th>Course</th><th>Status</th><th>Duration</th><th>Students</th>
                    </tr></thead>
                    <tbody>{}</tbody>
                </table>
            </div>
            """,
            full_name[0].upper() if full_name else "M",
            full_name,
            obj.email,
            obj.get_gender_display() if getattr(obj, "gender", None) else "Not specified",
            getattr(mentor_profile, "expertise", "") or "N/A",
            getattr(mentor_profile, "designation", "") or "N/A",
            getattr(mentor_profile, "company_name", "") or "N/A",
            getattr(mentor_profile, "years_of_experience", None) or "N/A",
            getattr(mentor_profile, "bio", "") or "N/A",
            format_html(linkedin_html),
            total_students,
            sessions.count(),
            format_html(cohort_rows),
        )

    @admin.display(description="Volunteer / Trustee Profile")
    def volunteer_profile_details(self, obj):
        if obj.role not in {"VOLUNTEER", "TRUSTEE"}:
            return "User is not a Volunteer or Trustee."
        from applications.models import Application

        vol_profile = getattr(obj, "volunteer_profile", None)
        cohorts = obj.volunteered_cohorts.order_by("-start_date").all()
        tasks = getattr(obj, "assigned_volunteer_tasks", None)
        all_tasks = tasks.all() if tasks else []

        full_name = obj.get_full_name().strip() or obj.email
        role_color = "#ffc107" if obj.role == "VOLUNTEER" else "#6f42c1"
        linkedin_url = getattr(vol_profile, "linkedin_url", "") or ""
        linkedin_html = f"<a href='{linkedin_url}' target='_blank' style='color: #0a66c2; text-decoration: none;'>🔗 {linkedin_url}</a>" if linkedin_url else "Not linked"

        # Total students supported across all volunteered cohorts
        total_students = Application.objects.filter(
            assigned_cohort__in=cohorts
        ).values("student").distinct().count()

        # Build cohort breakdown rows (latest first)
        cohort_rows = ""
        for c in cohorts:
            student_count = Application.objects.filter(assigned_cohort=c).values("student").distinct().count()
            status_colors = {
                "ACTIVE": "#28a745", "OPEN": "#17a2b8", "COMPLETED": "#6c757d",
                "DRAFT": "#ffc107", "CANCELLED": "#dc3545",
            }
            s_color = status_colors.get(c.status, "#6c757d")
            cohort_rows += (
                f"<tr>"
                f"<td style='padding: 6px;'><b>{c.code}</b></td>"
                f"<td style='padding: 6px;'>{c.name}</td>"
                f"<td style='padding: 6px;'>{c.course}</td>"
                f"<td style='padding: 6px;'><span style='background: {s_color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;'>{c.get_status_display()}</span></td>"
                f"<td style='padding: 6px;'>{c.start_date} → {c.end_date}</td>"
                f"<td style='padding: 6px; text-align: center; font-weight: bold;'>{student_count} / {c.max_students}</td>"
                f"</tr>"
            )
        if not cohort_rows:
            cohort_rows = "<tr><td colspan='6' style='padding: 6px;'>No cohorts assigned</td></tr>"

        # Build task rows
        task_rows = ""
        for t in all_tasks[:10]:
            p_colors = {"LOW": "#6c757d", "MEDIUM": "#ffc107", "HIGH": "#dc3545", "URGENT": "#721c24"}
            p_color = p_colors.get(t.priority, "#6c757d")
            task_rows += (
                f"<tr>"
                f"<td style='padding: 6px;'><b>{t.title}</b></td>"
                f"<td style='padding: 6px;'>{t.cohort.code if t.cohort else '-'}</td>"
                f"<td style='padding: 6px;'><span style='background: {p_color}; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 10px;'>{t.get_priority_display()}</span></td>"
                f"<td style='padding: 6px;'>{t.get_status_display()}</td>"
                f"<td style='padding: 6px;'>{t.due_date.strftime('%Y-%m-%d') if t.due_date else 'No deadline'}</td>"
                f"</tr>"
            )
        if not task_rows:
            task_rows = "<tr><td colspan='5' style='padding: 6px;'>No tasks assigned</td></tr>"

        return format_html(
            """
            <div style='background: #252526; color: #fff; padding: 15px; border-radius: 6px; overflow: hidden;'>
                <div style='width: 80px; height: 80px; border-radius: 50%; background: {}; float: right; margin: 0 0 10px 15px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; font-weight: bold;'>{}</div>
                <h3 style='margin: 0 0 6px 0; color: {};'>{} ({})</h3>
                <p style='margin: 2px 0; color: #aaa;'>{}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>Gender:</b> {}</p>
                <p><b>Organization:</b> {}</p>
                <p><b>Occupation:</b> {}</p>
                <p><b>Skills:</b> {}</p>
                <p><b>Bio:</b> {}</p>
                <p><b>Availability Notes:</b> {}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>🔗 LinkedIn:</b> {}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>📊 Total Students Supported (across all cohorts):</b> <span style='font-size: 18px; color: #28a745; font-weight: bold;'>{}</span></p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <h4 style='color: {}; margin-bottom: 8px;'>📋 Volunteered Cohorts (Latest First)</h4>
                <table style='width: 100%; border-collapse: collapse; color: #fff; margin-bottom: 15px;' border='1' cellpadding='4'>
                    <thead><tr style='background: #333;'>
                        <th>Code</th><th>Name</th><th>Course</th><th>Status</th><th>Duration</th><th>Students</th>
                    </tr></thead>
                    <tbody>{}</tbody>
                </table>
                <h4 style='color: {}; margin: 12px 0 8px 0;'>📝 Assigned Volunteer Tasks</h4>
                <table style='width: 100%; border-collapse: collapse; color: #fff;' border='1' cellpadding='4'>
                    <thead><tr style='background: #333;'>
                        <th>Task Title</th><th>Cohort</th><th>Priority</th><th>Status</th><th>Due Date</th>
                    </tr></thead>
                    <tbody>{}</tbody>
                </table>
            </div>
            """,
            role_color,
            full_name[0].upper() if full_name else "V",
            role_color,
            full_name,
            obj.get_role_display(),
            obj.email,
            obj.get_gender_display() if getattr(obj, "gender", None) else "Not specified",
            getattr(vol_profile, "organization_name", "") or "N/A",
            getattr(vol_profile, "occupation", "") or "N/A",
            getattr(vol_profile, "skills", "") or "N/A",
            getattr(vol_profile, "bio", "") or "N/A",
            getattr(vol_profile, "availability_notes", "") or "N/A",
            format_html(linkedin_html),
            total_students,
            role_color,
            format_html(cohort_rows),
            role_color,
            format_html(task_rows),
        )

    @admin.display(description="Company Profile Details")
    def company_profile_details(self, obj):
        if obj.role != "COMPANY":
            return "User is not a Company."
        company = getattr(obj, "company", None)
        if not company:
            return "No Company Profile linked to this user."

        full_name = company.name or obj.get_full_name().strip() or obj.email
        logo_url = company.logo.url if (company.logo and hasattr(company.logo, "url")) else None
        logo_html = f'<img src="{logo_url}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: contain; background: #fff; padding: 4px; float: right; margin: 0 0 10px 15px;" />' if logo_url else '<div style="width: 80px; height: 80px; border-radius: 12px; background: #fd7e14; float: right; margin: 0 0 10px 15px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #fff;">🏢</div>'

        website = company.website or ""
        website_html = f"<a href='{website}' target='_blank' style='color: #fd7e14; text-decoration: none;'>🌐 {website}</a>" if website else "N/A"
        verification_badge = "<span style='background: #28a745; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px;'>Verified</span>" if company.is_verified else "<span style='background: #dc3545; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px;'>Unverified</span>"

        # Shortlisted students
        shortlisted_count = company.shortlisted_students.count()

        # Job Postings
        job_postings = company.job_postings.order_by("-created_at").all()
        jp_rows = ""
        for jp in job_postings:
            s_color = "#28a745" if jp.status == "OPEN" else "#6c757d"
            jp_rows += (
                f"<tr>"
                f"<td style='padding: 6px;'><b>{jp.title}</b></td>"
                f"<td style='padding: 6px;'>{jp.location or 'N/A'}</td>"
                f"<td style='padding: 6px;'>{jp.salary_range or 'N/A'}</td>"
                f"<td style='padding: 6px;'><span style='background: {s_color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;'>{jp.get_status_display()}</span></td>"
                f"<td style='padding: 6px; text-align: center; font-weight: bold;'>{jp.applicants.count()}</td>"
                f"</tr>"
            )
        if not jp_rows:
            jp_rows = "<tr><td colspan='5' style='padding: 6px;'>No job postings created</td></tr>"

        # Job References
        job_refs = company.job_references.order_by("-created_at").all()
        jr_rows = ""
        for jr in job_refs:
            s_color = "#28a745" if jr.is_active else "#dc3545"
            jr_rows += (
                f"<tr>"
                f"<td style='padding: 6px;'><b>{jr.title}</b></td>"
                f"<td style='padding: 6px;'>{jr.cohort.code}</td>"
                f"<td style='padding: 6px;'>{jr.get_employment_type_display()}</td>"
                f"<td style='padding: 6px;'>{jr.deadline or 'No deadline'}</td>"
                f"<td style='padding: 6px;'><span style='background: {s_color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;'>{'Active' if jr.is_active else 'Inactive'}</span></td>"
                f"</tr>"
            )
        if not jr_rows:
            jr_rows = "<tr><td colspan='5' style='padding: 6px;'>No job references created</td></tr>"

        return format_html(
            """
            <div style='background: #252526; color: #fff; padding: 15px; border-radius: 6px; overflow: hidden;'>
                {}
                <h3 style='margin: 0 0 6px 0; color: #fd7e14;'>{} {}</h3>
                <p style='margin: 2px 0; color: #aaa;'>{}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>Industry:</b> {}</p>
                <p><b>Location:</b> {}</p>
                <p><b>Website:</b> {}</p>
                <p><b>Description:</b> {}</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <p><b>⭐ Shortlisted Students:</b> <span style='font-size: 18px; color: #ffc107; font-weight: bold;'>{}</span> student(s)</p>
                <hr style='border-color: #444; margin: 10px 0;'/>
                <h4 style='color: #fd7e14; margin-bottom: 8px;'>💼 Job Postings</h4>
                <table style='width: 100%; border-collapse: collapse; color: #fff; margin-bottom: 15px;' border='1' cellpadding='4'>
                    <thead><tr style='background: #333;'>
                        <th>Title</th><th>Location</th><th>Salary Range</th><th>Status</th><th>Applicants</th>
                    </tr></thead>
                    <tbody>{}</tbody>
                </table>
                <h4 style='color: #fd7e14; margin-bottom: 8px;'>🎯 Job References Distributed</h4>
                <table style='width: 100%; border-collapse: collapse; color: #fff;' border='1' cellpadding='4'>
                    <thead><tr style='background: #333;'>
                        <th>Title</th><th>Assigned Cohort</th><th>Employment Type</th><th>Deadline</th><th>Status</th>
                    </tr></thead>
                    <tbody>{}</tbody>
                </table>
            </div>
            """,
            format_html(logo_html),
            full_name,
            format_html(verification_badge),
            obj.email,
            company.industry or "N/A",
            company.location or "N/A",
            format_html(website_html),
            company.description or "N/A",
            shortlisted_count,
            format_html(jp_rows),
            format_html(jr_rows),
        )


@admin.register(AdministratorProfile)
class AdministratorProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user_email_display",
        "user_first_name_display",
        "user_last_name_display",
        "category_badge",
        "designation",
        "department",
        "organization_affiliation",
        "is_public_leadership",
        "display_order",
    )
    list_filter = (
        "category",
        "is_public_leadership",
        "user__role",
        "department",
    )
    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "designation",
        "department",
        "organization_affiliation",
        "expertise",
    )
    autocomplete_fields = ("user",)
    readonly_fields = (
        "user_email_display",
        "user_first_name_display",
        "user_last_name_display",
        "user_role_display",
        "user_gender_display",
        "created_at",
        "updated_at",
    )
    fieldsets = (
        ("Administrative User & Account", {
            "fields": (
                "user",
                "user_email_display",
                "user_first_name_display",
                "user_last_name_display",
                "user_role_display",
                "user_gender_display",
            )
        }),
        ("Leadership, Advisory & Administrative Profile", {
            "fields": (
                "category",
                "designation",
                "department",
                "organization_affiliation",
                "display_order",
                "is_public_leadership",
            )
        }),
        ("Advisory Expertise & Governance Focus", {
            "fields": (
                "expertise",
                "responsibilities",
                "bio",
                "linkedin_url",
                "contact_phone",
            )
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )

    @admin.display(description="User Email")
    def user_email_display(self, obj):
        if obj.user:
            return obj.user.email
        return "-"

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

    @admin.display(description="Role")
    def user_role_display(self, obj):
        if obj.user:
            return obj.user.get_role_display()
        return "-"

    @admin.display(description="Gender")
    def user_gender_display(self, obj):
        if obj.user and obj.user.gender:
            return obj.user.get_gender_display()
        return "-"

    @admin.display(description="Category")
    def category_badge(self, obj):
        color_map = {
            AdministratorProfile.Category.ADMINISTRATOR: "#dc3545",
            AdministratorProfile.Category.TRUSTEE: "#17a2b8",
            AdministratorProfile.Category.ADVISORY: "#6f42c1",
            AdministratorProfile.Category.EXECUTIVE: "#fd7e14",
        }
        bg = color_map.get(obj.category, "#007bff")
        return format_html(
            '<span style="background-color: {}; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">{}</span>',
            bg,
            obj.get_category_display(),
        )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "user":
            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.ADMIN, User.Role.TRUSTEE, User.Role.VOLUNTEER],
                is_active=True,
            ).order_by("email")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def delete_model(self, request, obj):
        user = obj.user
        super().delete_model(request, obj)
        if user:
            user.delete()

    def delete_queryset(self, request, queryset):
        user_ids = list(queryset.values_list("user_id", flat=True))
        super().delete_queryset(request, queryset)
        User.objects.filter(id__in=[uid for uid in user_ids if uid is not None]).delete()

