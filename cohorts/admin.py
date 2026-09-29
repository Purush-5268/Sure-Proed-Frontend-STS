import csv
from django import forms
from django.contrib import admin, messages
from django.contrib.admin.widgets import FilteredSelectMultiple
from django.core.exceptions import ValidationError
from django.http import HttpResponse
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html
from django.db.models import Q

from accounts.models import User
from applications.models import Application, PreScreeningInterview
from common.models import Notification
from common.services.notifications import display_name, notify_user
from courses.models import Course, CourseModule
from question_bank.models import QuestionBank
from exams.models import ModuleTest, Exam
from .models import Cohort


class EligibleApplicationChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, obj):
        current_cohort = obj.assigned_cohort.code if getattr(obj, "assigned_cohort", None) else "Not assigned"
        student = getattr(obj, "student", None)
        student_code = getattr(student, "student_code", None) or "No Code"
        user = getattr(student, "user", None) if student else None
        email = getattr(user, "email", "No Email") if user else "No Email"
        status_disp = obj.get_status_display() if hasattr(obj, "get_status_display") else str(obj.status)
        return (
            f"{obj.application_number} — {student_code} "
            f"({email}) — {status_disp} — "
            f"Current cohort: {current_cohort}"
        )


class CohortAdminForm(forms.ModelForm):
    applications_to_assign = EligibleApplicationChoiceField(
        label="Assign or transfer workflow-approved students",
        required=False,
        queryset=Application.objects.none(),
        widget=FilteredSelectMultiple("eligible students", is_stacked=False),
        help_text=(
            "Only qualified students with completed admin role verification appear here. "
            "Transfers are allowed only between cohorts for the same course."
        ),
    )

    class Meta:
        model = Cohort
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "name" in self.fields:
            self.fields["name"].required = False
            self.fields["name"].help_text = "Optional. Automatically generated from Code and Course Code if left blank."
        if "mentors" in self.fields:
            self.fields["mentors"].queryset = User.objects.filter(
                role=User.Role.MENTOR, is_active=True
            ).order_by("email")
        if "volunteers" in self.fields:
            self.fields["volunteers"].queryset = User.objects.filter(
                role__in=[User.Role.VOLUNTEER, User.Role.TRUSTEE], is_active=True
            ).order_by("email")
            self.fields["volunteers"].label = "Existing volunteers / trustees"
            self.fields["volunteers"].help_text = (
                "Select existing active Volunteer or Trustee accounts. Account creation is managed "
                "separately under Accounts > Users."
            )
        if "created_by" in self.fields:
            self.fields["created_by"].queryset = User.objects.filter(
                role=User.Role.ADMIN, is_active=True
            ).order_by("email")

        if "course" in self.fields:
            if not self.instance or not self.instance.pk:
                self.fields["course"].queryset = Course.objects.filter(status=Course.Status.PUBLISHED).order_by("code")
            else:
                self.fields["course"].queryset = Course.objects.all().order_by("code")
            self.fields["course"].label_from_instance = lambda obj: f"[{obj.code}] — {obj.name}"

        # ── Current Module: filter to only show modules for this cohort's course ──
        course_id = getattr(self.instance, "course_id", None) if self.instance else None
        if self.is_bound:
            course_id = self.data.get("course") or course_id
        if "current_module" in self.fields:
            if course_id:
                self.fields["current_module"].queryset = (
                    CourseModule.objects.filter(course_id=course_id, is_active=True)
                    .order_by("order", "module_number")
                )
                self.fields["current_module"].label_from_instance = lambda obj: (
                    f"Module {obj.module_number}: {obj.title}"
                )
            else:
                self.fields["current_module"].queryset = CourseModule.objects.none()
                self.fields["current_module"].help_text = (
                    "Select a Course first to see available modules."
                )
        if course_id and "applications_to_assign" in self.fields:
            course_applications = Application.objects.filter(course_id=course_id)
            candidates = (
                course_applications.filter(
                    course_id=course_id,
                    qualified=True,
                    status__in=[
                        Application.Status.QUALIFIED,
                        Application.Status.WAITLISTED,
                        Application.Status.COHORT_ASSIGNED,
                        Application.Status.IN_PROGRESS,
                    ],
                )
            )
            staff_q = Q()
            for domain in User.STAFF_EMAIL_DOMAINS:
                staff_q |= Q(student__user__email__iendswith=domain)
            candidates = candidates.exclude(staff_q)
            eligible = (
                candidates.filter(
                    role_verification_status=Application.RoleVerificationStatus.VERIFIED,
                )
                .filter(
                    Q(assigned_cohort__requires_interview=False)
                    | Q(course__requires_interview=False)
                    | Q(pre_screening_interview__status=PreScreeningInterview.Status.PASSED)
                )
                .select_related("student", "student__user", "assigned_cohort")
                .order_by("student__user__email")
            )
            self.fields["applications_to_assign"].queryset = eligible

            total_count = course_applications.count()
            candidate_count = candidates.count()
            eligible_count = eligible.count()
            if total_count == 0:
                summary = "No student applications currently exist for this cohort's course."
            elif candidate_count == 0:
                summary = (
                    f"{total_count} application(s) exist, but none has reached the qualified "
                    "student-assignment stage."
                )
            else:
                summary = (
                    f"Eligible now: {eligible_count}. Waiting for interview/profile/admin role "
                    f"verification: {candidate_count - eligible_count}."
                )
            self.fields["applications_to_assign"].help_text = (
                summary
                + " Complete blocked requirements under Applications, then reopen this cohort."
            )

    def clean_default_screening_at(self):
        value = self.cleaned_data.get("default_screening_at")
        if value and "default_screening_at" in self.changed_data and value <= timezone.now():
            raise ValidationError("Choose a future pre-screen exam date and time.")
        return value

    def clean_course(self):
        course = self.cleaned_data.get("course")
        is_new = not self.instance or not self.instance.pk
        if is_new and course and getattr(course, "status", None) != Course.Status.PUBLISHED:
            raise ValidationError(
                f"A new cohort can only be created for a Published course (Selected course status is '{course.status}')."
            )
        return course

    def clean_applications_to_assign(self):
        applications = self.cleaned_data.get("applications_to_assign")
        course = self.cleaned_data.get("course")
        if not applications or not course:
            return applications

        additions = [app for app in applications if app.assigned_cohort_id != self.instance.pk]
        current_count = 0
        if self.instance and self.instance.pk:
            current_count = self.instance.applications.exclude(
                status__in=[Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.REJECTED]
            ).count()
        max_students = self.cleaned_data.get("max_students") or 0
        if current_count + len(additions) > max_students:
            raise ValidationError(
                f"This would exceed cohort capacity ({current_count} enrolled, {max_students} maximum)."
            )

        for application in applications:
            if application.course_id != course.id:
                raise ValidationError("Every selected application must be for this cohort's course.")
            if not application.is_student_role_verified:
                raise ValidationError(
                    f"{application.application_number} requires completed admin student-role verification."
                )
            student = getattr(application, "student", None)
            student_user = getattr(student, "user", None) if student else None
            if student_user and getattr(student_user, "uses_reserved_staff_email", False):
                raise ValidationError(
                    f"{application.application_number} uses the staff-only @suretrust.local domain and cannot be enrolled as a student."
                )
        return applications


class CohortApplicationInline(admin.TabularInline):
    model = Application
    extra = 0
    fields = (
        "application_number",
        "student_name_and_code",
        "status_badge",
        "screening_exam_result",
        "proctoring_telemetry",
        "cohort_actions",
    )
    readonly_fields = (
        "application_number",
        "student_name_and_code",
        "status_badge",
        "screening_exam_result",
        "proctoring_telemetry",
        "cohort_actions",
    )
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Student Name & Code")
    def student_name_and_code(self, obj):
        if not obj or not obj.student:
            return "-"
        name = obj.student.user.get_full_name().strip() if getattr(obj.student, "user", None) else ""
        email = obj.student.user.email if getattr(obj.student, "user", None) else ""
        code = obj.student.student_code or "No Code"
        return format_html(
            '<strong>{}</strong><br><span style="color:var(--body-quiet-color, #64748b);font-size:11px;">{} | {}</span>',
            name or email.split("@")[0],
            code,
            email,
        )

    @admin.display(description="Status")
    def status_badge(self, obj):
        if not obj:
            return "-"
        if obj.status == Application.Status.SUSPENDED:
            return format_html('<span style="background:var(--message-error-bg, #fee2e2);color:#b91c1c;padding:3px 8px;border-radius:4px;font-weight:700;font-size:11px;">🛑 SUSPENDED</span>')
        if obj.status == Application.Status.DROPPED:
            return format_html('<span style="background:var(--darkened-bg);color:var(--body-quiet-color);padding:3px 8px;border-radius:4px;font-weight:700;font-size:11px;">DROPPED OUT</span>')
        if obj.status == Application.Status.TRANSFER_COHORT:
            return format_html('<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:4px;font-weight:700;font-size:11px;">TRANSFERRING</span>')
        return format_html(
            '<span style="background:var(--selected-bg, #dcfce7);color:var(--body-fg, #166534);padding:3px 8px;border-radius:4px;font-weight:700;font-size:11px;">✓ {}</span>',
            obj.get_status_display()
        )

    @admin.display(description="Actions")
    def cohort_actions(self, obj):
        if not obj or not obj.pk:
            return "-"
        cohort_id = obj.assigned_cohort_id
        next_url = f"/secure-admin/cohorts/cohort/{cohort_id}/change/" if cohort_id else "/secure-admin/cohorts/cohort/"
        
        unsuspend_url = f"/secure-admin/applications/application/{obj.pk}/unsuspend-admin/?next={next_url}"
        suspend_url = f"/secure-admin/applications/application/{obj.pk}/suspend-admin/?next={next_url}"
        transfer_url = f"/secure-admin/applications/application/{obj.pk}/transfer-cohort-admin/?next={next_url}"
        dropout_url = f"/secure-admin/applications/application/{obj.pk}/dropout-admin/?next={next_url}"

        if obj.status == Application.Status.SUSPENDED:
            btn_suspend = f'<a class="button" href="{unsuspend_url}" style="padding:2px 8px;font-size:11px;background:var(--primary, #1e40af);color:#ffffff;font-weight:600;margin-right:4px;">⚡ Unsuspend</a>'
        elif obj.status == Application.Status.DROPPED:
            return format_html('<span style="color:var(--body-quiet-color);font-size:11px;">Dropped Out (Eligible for new course)</span>')
        else:
            btn_suspend = f'<a class="button" href="{suspend_url}" onclick="return confirm(\'Suspend cohort access for this student? Timetable and meeting links will be disabled.\');" style="padding:2px 8px;font-size:11px;margin-right:4px;">⏸️ Suspend</a>'

        btn_transfer = f'<a class="button" href="{transfer_url}" style="padding:2px 8px;font-size:11px;margin-right:4px;">🔄 Transfer</a>'
        btn_drop = f'<a class="button" href="{dropout_url}" onclick="return confirm(\'Drop student out of this cohort? This will free their seat and allow the student to apply for a new course.\');" style="padding:2px 8px;font-size:11px;color:#dc2626;">❌ Drop Out</a>'

        return format_html(
            '<div style="white-space:nowrap;">{}{}{}</div>',
            format_html(btn_suspend),
            format_html(btn_transfer),
            format_html(btn_drop),
        )

    @admin.display(description="Pre-Screening Exam Result")
    def screening_exam_result(self, obj):
        if not obj:
            return "-"
        try:
            exam = getattr(obj, "exam", None)
            if not exam:
                return format_html('<span style="color:#94a3b8;font-size:11px;">No Exam Record</span>')

            url = f"/secure-admin/exams/exam/{exam.id}/change/"
            if exam.status == "EVALUATED":
                q_badge = (
                    '<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">QUALIFIED</span>'
                    if exam.qualified
                    else '<span style="background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">NOT QUALIFIED</span>'
                )
                return format_html(
                    '<a href="{}" style="font-weight:600;">{}/{} ({:.1f}%)</a> {}',
                    url,
                    exam.marks_obtained or 0,
                    exam.total_marks or 10,
                    float(exam.percentage or 0),
                    format_html(q_badge),
                )
            elif exam.status == "IN_PROGRESS":
                return format_html('<a href="{}" style="color:#d97706;font-weight:600;">In Progress...</a>', url)
            else:
                return format_html('<a href="{}" style="color:#64748b;font-size:11px;">Pending Attempt</a>', url)
        except Exception:
            return "-"

    @admin.display(description="Proctoring Telemetry")
    def proctoring_telemetry(self, obj):
        if not obj:
            return "-"
        try:
            exam = getattr(obj, "exam", None)
            if not exam:
                return "-"

            events_count = 0
            attempts = exam.internal_attempts.all()
            for att in attempts:
                events_count += att.security_events.count()

            if events_count > 0:
                color = "#dc2626" if events_count >= 5 else "#d97706"
                bg = "#fee2e2" if events_count >= 5 else "#fef3c7"
                return format_html(
                    '<span style="background:{};color:{};padding:2px 6px;border-radius:4px;font-weight:700;font-size:11px;">{} Violation(s)</span>',
                    bg,
                    color,
                    events_count,
                )
            return format_html('<span style="color:#16a34a;font-size:11px;font-weight:600;">✓ Clean</span>')
        except Exception:
            return "-"


class CohortQuestionBankInline(admin.TabularInline):
    model = QuestionBank
    extra = 0
    show_change_link = True
    fields = ("title", "bank_type", "difficulty", "total_questions_per_set", "total_sets_display", "is_ai_generated", "is_active")
    readonly_fields = ("title", "bank_type", "difficulty", "total_questions_per_set", "total_sets_display", "is_ai_generated", "is_active")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Sets")
    def total_sets_display(self, obj):
        count = obj.total_sets
        if count:
            codes = ", ".join(obj.set_codes)
            return format_html('<span title="{}">{} sets ({})</span>', codes, count, codes)
        return "0 sets"


class CohortModuleTestInline(admin.TabularInline):
    model = ModuleTest
    extra = 0
    show_change_link = True
    fields = ("module_name", "title", "level", "total_questions", "duration_minutes", "pass_percentage", "is_active", "is_released")
    readonly_fields = ("module_name", "title", "level", "total_questions", "duration_minutes", "pass_percentage", "is_active", "is_released")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("module")

    @admin.display(description="Module")
    def module_name(self, obj):
        if not obj or not obj.module:
            return format_html('<span style="color:#94a3b8;font-size:11px;">—</span>')
        m = obj.module
        # Detect if this module is the cohort's current module
        cohort = getattr(obj, "cohort", None)
        current_module_id = getattr(cohort, "current_module_id", None) if cohort else None
        is_current = current_module_id and str(m.id) == str(current_module_id)
        if is_current:
            return format_html(
                '<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:4px;'
                'font-size:11px;font-weight:700;border:1px solid #93c5fd;">'
                '▶ Module {}: {}</span>',
                m.module_number,
                m.title,
            )
        return format_html(
            '<span style="color:#475569;font-size:12px;">Module {}: {}</span>',
            m.module_number,
            m.title,
        )


def export_cohorts_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_cohorts.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Code", "Name", "Course", "Start Date", "End Date", "Status",
        "Requires Interview", "Default Screening At", "LST Batch", "Max Students",
        "Meeting Link", "Created At"
    ])

    for cohort in queryset.select_related("course"):
        writer.writerow([
            cohort.code,
            cohort.name,
            cohort.course.name if cohort.course else "",
            cohort.start_date,
            cohort.end_date,
            cohort.status,
            "Yes" if cohort.requires_interview else "No",
            cohort.default_screening_at or "",
            cohort.lst_batch or "",
            cohort.max_students,
            cohort.meeting_link or "",
            cohort.created_at.strftime("%Y-%m-%d %H:%M") if cohort.created_at else "",
        ])

    return response


export_cohorts_to_csv.short_description = "Export selected cohorts to CSV"


def trigger_github_repo_creation_action(modeladmin, request, queryset):
    from .services import RepositoryProvisioningNotAllowed, provision_cohort_student_repositories
    total_created = 0
    total_already = 0
    total_skipped = 0
    total_errors = 0
    blocked = []

    for cohort in queryset:
        try:
            res = provision_cohort_student_repositories(cohort, force=True)
        except RepositoryProvisioningNotAllowed as exc:
            blocked.append(f"{cohort.code}: {exc}")
            continue
        total_created += res["created_count"]
        total_already += res["already_exists_count"]
        total_skipped += res["skipped_no_github_count"]
        total_errors += len(res["errors"])

    level = messages.WARNING if blocked or total_errors else messages.SUCCESS
    modeladmin.message_user(
        request,
        f"GitHub Repo Creation Completed: {total_created} repository(ies) created, "
        f"{total_already} already had repos, {total_skipped} skipped (no GitHub linked), "
        f"{total_errors} error(s)."
        + (f" Blocked: {'; '.join(blocked)}" if blocked else ""),
        level=level,
    )

trigger_github_repo_creation_action.short_description = "⚡ Create GitHub Repositories for Enrolled Students in selected Cohort(s)"


@admin.register(Cohort)
class CohortAdmin(admin.ModelAdmin):
    form = CohortAdminForm
    list_display = (
        "code", "name", "course", "start_date", "end_date", "status",
        "default_screening_at", "requires_interview", "lst_batch", "max_students",
        "google_meet", "github_repo_status",
    )
    list_editable = ("status", "lst_batch", "requires_interview")
    search_fields = ("code", "name", "course__name")
    list_filter = ("status", "requires_interview", "lst_batch", "course")
    actions = [export_cohorts_to_csv, trigger_github_repo_creation_action, "advance_selected_cohorts_module"]
    filter_horizontal = ("mentors", "volunteers")
    inlines = (CohortApplicationInline, CohortQuestionBankInline, CohortModuleTestInline)
    readonly_fields = (
        "name",
        "google_meet",
        "course_screening_dashboard",
        "github_repo_control_panel",
        "training_started_at",
        "github_repositories_last_provisioned_at",
        "current_module_display",
    )

    fieldsets = (
        (
            "Cohort Identification & Course",
            {
                "fields": ("code", "name", "course", "status", "lst_batch", "max_students"),
                "description": "Basic identification and academic track for this cohort batch.",
            },
        ),
        (
            "Schedule & Dates",
            {
                "fields": ("start_date", "end_date", "training_started_at"),
                "description": "Start and end dates for the cohort lifecycle.",
            },
        ),
        (
            "Pre-Screening & Interview Controls",
            {
                "fields": (
                    "default_screening_at",
                    "requires_interview",
                    "meeting_link",
                    "google_meet",
                ),
                "description": (
                    "Cohort-level screening configuration. Set the default pre-screening exam date/time, "
                    "master Google Meet link, and whether candidates in this cohort require an interview stage."
                ),
            },
        ),
        (
            "Course Modules & Progress",
            {
                "fields": ("current_module", "current_module_display"),
                "description": "Active module and linked module tests for this cohort.",
            },
        ),
        (
            "Mentors & Volunteers",
            {
                "fields": ("mentors", "volunteers", "created_by"),
            },
        ),
        (
            "Workspace & Candidate Management",
            {
                "fields": ("applications_to_assign", "github_repo_control_panel", "course_screening_dashboard"),
            },
        ),
    )

    @admin.action(description="▶ Advance selected cohorts to next course module")
    def advance_selected_cohorts_module(self, request, queryset):
        advanced = 0
        skipped = 0
        for cohort in queryset:
            new_mod = cohort.advance_to_next_module()
            if new_mod:
                advanced += 1
            else:
                skipped += 1
        if advanced:
            self.message_user(
                request,
                f"Successfully advanced {advanced} cohort(s) to their next course module.",
                messages.SUCCESS,
            )
        if skipped:
            self.message_user(
                request,
                f"{skipped} cohort(s) had no further modules or no course assigned.",
                messages.INFO,
            )

    def get_readonly_fields(self, request, obj=None):
        base_readonly = list(self.readonly_fields)
        if obj and obj.status in [Cohort.Status.ACTIVE, Cohort.Status.COMPLETED, Cohort.Status.CANCELLED]:
            extra_locked = [
                "code", "course", "start_date", "end_date",
                "max_students", "status", "default_screening_at", "requires_interview",
                "meeting_link", "created_by", "mentors", "volunteers", "current_module",
            ]
            for f in extra_locked:
                if f not in base_readonly:
                    base_readonly.append(f)
        return tuple(base_readonly)

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom_urls = [
            path(
                "<uuid:cohort_id>/provision-github/",
                self.admin_site.admin_view(self.provision_github_view),
                name="cohorts_cohort_provision_github",
            ),
            path(
                "<uuid:cohort_id>/advance-module/",
                self.admin_site.admin_view(self.advance_module_view),
                name="cohorts_cohort_advance_module",
            ),
        ]
        return custom_urls + urls

    def advance_module_view(self, request, cohort_id):
        from django.shortcuts import get_object_or_404, redirect
        from django.core.exceptions import PermissionDenied
        from .models import Cohort

        cohort = get_object_or_404(Cohort, id=cohort_id)
        if not self.has_change_permission(request, cohort):
            raise PermissionDenied
        new_module = cohort.advance_to_next_module()
        if new_module:
            self.message_user(
                request,
                f"Successfully advanced cohort '{cohort.name}' to Module {new_module.module_number}: {new_module.title}.",
                messages.SUCCESS,
            )
        else:
            self.message_user(
                request,
                f"Cohort '{cohort.name}' is already on the final course module or has no further active modules.",
                messages.INFO,
            )
        return redirect("admin:cohorts_cohort_change", cohort_id)

    def provision_github_view(self, request, cohort_id):
        from django.shortcuts import get_object_or_404, redirect
        from .models import Cohort
        from .services import provision_cohort_student_repositories

        cohort = get_object_or_404(Cohort, id=cohort_id)
        try:
            res = provision_cohort_student_repositories(cohort, force=True)
            self.message_user(
                request,
                f"GitHub Repositories Provisioned for {cohort.code}: {res['created_count']} created, "
                f"{res['already_exists_count']} already existed, {res['skipped_no_github_count']} skipped (no GitHub account linked), "
                f"{len(res['errors'])} error(s).",
                level=messages.SUCCESS,
            )
        except Exception as exc:
            self.message_user(request, f"Error provisioning GitHub repositories: {exc}", level=messages.ERROR)

        return redirect(f"/secure-admin/cohorts/cohort/{cohort.id}/change/")

    @admin.display(description="GitHub Workspace")
    def github_repo_status(self, obj):
        if not obj or not obj.id:
            return "-"
        last_run = obj.github_repositories_last_provisioned_at
        trigger_url = f"/secure-admin/cohorts/cohort/{obj.id}/provision-github/"
        
        if last_run:
            time_str = last_run.strftime("%d-%b %H:%M")
            return format_html(
                '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">✓ Provisioned ({})</span><br>'
                '<a href="{}" style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;margin-top:4px;background:#0f172a;color:#fff;border-radius:4px;text-decoration:none;">⚡ Re-Sync Repos</a>',
                time_str, trigger_url
            )
        elif obj.status == Cohort.Status.TRAINING:
            return format_html(
                '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">⏳ Training</span><br>'
                '<a href="{}" style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;margin-top:4px;background:#6b21a8;color:#fff;border-radius:4px;text-decoration:none;">⚡ Trigger Now</a>',
                trigger_url
            )
        else:
            return format_html(
                '<span style="color:#64748b;font-size:11px;">{}</span>',
                obj.get_status_display()
            )

    @admin.display(description="GitHub Repository Workspace Control")
    def github_repo_control_panel(self, obj):
        if not obj or not obj.id:
            return "Save cohort first to manage GitHub repositories."
        
        total_enrolled = obj.applications.count()
        linked_github = obj.applications.filter(
            student__is_github_connected=True,
            student__github_username__isnull=False
        ).exclude(student__github_username="").count()
        missing_github = total_enrolled - linked_github
        has_repos = obj.applications.filter(student__github_repo_url__isnull=False).exclude(student__github_repo_url="").count()

        trigger_url = f"/secure-admin/cohorts/cohort/{obj.id}/provision-github/"
        
        last_run_str = obj.github_repositories_last_provisioned_at.strftime("%d-%b-%Y %H:%M UTC") if obj.github_repositories_last_provisioned_at else "Never executed"
        training_start_str = obj.training_started_at.strftime("%d-%b-%Y %H:%M UTC") if obj.training_started_at else "Not started"
        eligible_str = obj.github_repository_eligible_at.strftime("%d-%b-%Y %H:%M UTC") if obj.github_repository_eligible_at else "N/A"

        return format_html(
            '<div style="background:var(--darkened-bg, #f8fafc);border:1px solid var(--border-color, #cbd5e1);border-radius:6px;padding:14px;line-height:1.6;font-size:13px;color:var(--body-fg, #0f172a);">'
            '  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
            '    <div style="font-size:14px;font-weight:700;color:var(--body-fg, #0f172a);">📦 GitHub Classroom / Organization Workspace</div>'
            '    <a href="{}" style="background:var(--primary, #1e40af);color:#ffffff;padding:5px 12px;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;">⚡ Trigger Repository Creation (Manual Override)</a>'
            '  </div>'
            '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;margin-bottom:12px;background:var(--body-bg, #ffffff);border:1px solid var(--border-color, #e2e8f0);padding:10px 14px;border-radius:4px;color:var(--body-fg, #0f172a);">'
            '    <div><strong>Total Enrolled Students:</strong> {}</div>'
            '    <div><strong>GitHub Connected:</strong> <span style="color:#16a34a;font-weight:700;">{}</span></div>'
            '    <div><strong>Missing GitHub Account:</strong> <span style="color:#dc2626;font-weight:700;">{}</span></div>'
            '    <div><strong>Active Repository URLs:</strong> <span style="color:#2563eb;font-weight:700;">{}</span></div>'
            '  </div>'
            '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:8px;font-size:12px;color:var(--body-quiet-color, #64748b);">'
            '    <div><strong style="color:var(--body-fg);">Training Started:</strong> {}</div>'
            '    <div><strong style="color:var(--body-fg);">15-Day Auto-Trigger Date:</strong> {}</div>'
            '    <div><strong style="color:var(--body-fg);">Last Provisioning Run:</strong> <span style="font-weight:600;color:var(--body-fg);">{}</span></div>'
            '  </div>'
            '  <div style="margin-top:10px;font-size:11px;color:var(--body-quiet-color, #64748b);border-top:1px dashed var(--border-color, #cbd5e1);padding-top:8px;">'
            '    🛡️ <em>Duplicate-Safe: Existing repositories are reused and access is re-synchronized. Students receive write access; only trainers assigned to this cohort receive read access.</em>'
            '  </div>'
            '</div>',
            trigger_url,
            total_enrolled,
            linked_github,
            missing_github,
            has_repos,
            training_start_str,
            eligible_str,
            last_run_str
        )

    @admin.display(description="Google Meet")
    def google_meet(self, obj):
        if not obj or not obj.meeting_link:
            return "Not added"
        return format_html('<a href="{}" target="_blank" rel="noopener">Open meeting</a>', obj.meeting_link)

    @admin.display(description="Current Module")
    def current_module_display(self, obj):
        """Read-only panel showing the cohort's current module and its linked module test."""
        if not obj or not obj.pk:
            return "Save cohort first."
        if not obj.current_module:
            course = getattr(obj, "course", None)
            if not course:
                return "No course linked."
            module_count = CourseModule.objects.filter(course=course, is_active=True).count()
            return format_html(
                '<span style="color:var(--body-quiet-color, #94a3b8);font-size:12px;">' 
                'No current module set. {} module(s) available for this course. '
                'Select a module using the <strong>Current module</strong> dropdown above.</span>',
                module_count,
            )

        m = obj.current_module
        # Find the module test linked to this module for this cohort
        module_test = ModuleTest.objects.filter(
            module=m, cohort=obj, is_active=True
        ).first() or ModuleTest.objects.filter(
            module=m, cohort__isnull=True, course=obj.course, is_active=True
        ).first()

        test_html = ""
        if module_test:
            test_url = f"/secure-admin/exams/moduletest/{module_test.id}/change/"
            status_color = "#16a34a" if module_test.is_released else "#d97706"
            status_label = "Released" if module_test.is_released else "Not Released"
            test_html = (
                f'<div style="margin-top:8px;padding:8px 12px;background:var(--body-bg, #ffffff);border-radius:4px;'
                f'border:1px solid var(--border-color, #cbd5e1);border-left:3px solid {status_color};font-size:12px;color:var(--body-fg);">'
                f'<strong>Linked Module Test:</strong> '
                f'<a href="{test_url}" style="font-weight:600;color:var(--primary, #1e40af);">{module_test.title}</a> — '
                f'<span style="color:{status_color};font-weight:600;">{status_label}</span> | '
                f'{module_test.total_questions} questions | '
                f'{module_test.duration_minutes} min | '
                f'Pass: {module_test.pass_percentage}%'
                f'</div>'
            )
        else:
            test_html = (
                '<div style="margin-top:8px;padding:6px 12px;background:var(--body-bg, #ffffff);border-radius:4px;'
                'border:1px solid var(--border-color, #cbd5e1);font-size:11px;color:var(--body-quiet-color, #92400e);">'
                '⚠ No module test linked to this module for this cohort yet.</div>'
            )

        topics = m.topics if isinstance(m.topics, list) else []
        topics_html = ""
        if topics:
            topics_html = " ".join(
                f'<span style="display:inline-block;background:var(--body-bg, #e0f2fe);color:var(--body-fg, #0369a1);'
                f'border:1px solid var(--border-color, #93c5fd);padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600;margin:2px 2px 2px 0;">'
                f'{t}</span>'
                for t in topics
            )

        advance_button_html = ""
        if hasattr(obj, "get_next_module"):
            next_mod = obj.get_next_module()
            if next_mod:
                try:
                    advance_url = reverse("admin:cohorts_cohort_advance_module", args=[obj.id])
                    advance_button_html = (
                        f'<div style="margin-top:12px;">'
                        f'<a class="button" href="{advance_url}" '
                        f'onclick="return confirm(\'Advance cohort to Module {next_mod.module_number}: {next_mod.title}?\');" '
                        f'style="background:#0284c7;color:#ffffff;font-weight:600;padding:6px 14px;border-radius:4px;display:inline-block;text-decoration:none;">'
                        f'▶ Advance to Next Module (Module {next_mod.module_number}: {next_mod.title})</a>'
                        f'</div>'
                    )
                except Exception:
                    advance_button_html = ""
            elif getattr(obj, "current_module_id", None):
                advance_button_html = (
                    '<div style="margin-top:10px;color:#16a34a;font-weight:600;font-size:12px;">'
                    '✓ All course modules completed (Final Module)</div>'
                )

        return format_html(
            '<div style="background:var(--darkened-bg, #f8fafc);border:1px solid var(--border-color, #cbd5e1);border-radius:6px;padding:14px;font-size:13px;line-height:1.6;color:var(--body-fg, #0f172a);">'
            '  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
            '    <span style="background:var(--primary, #1e40af);color:#ffffff;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;">'
            '      ▶ CURRENT'
            '    </span>'
            '    <span style="font-size:14px;font-weight:700;color:var(--body-fg, #0f172a);">Module {}: {}</span>'
            '  </div>'
            '  <div style="color:var(--body-fg, #475569);font-size:12px;margin-bottom:6px;">{}</div>'
            '  <div style="font-size:11px;color:var(--body-quiet-color, #64748b);">{}</div>'
            '  {}'
            '  {}'
            '</div>',
            m.module_number,
            m.title,
            m.description or "No description.",
            format_html(topics_html) if topics_html else "",
            format_html(test_html),
            format_html(advance_button_html),
        )

    @admin.display(description="Course Pre-Screening Exam & Question Specification")
    def course_screening_dashboard(self, obj):
        if not obj or not obj.course:
            return "No course linked."
        c = obj.course
        topics = c.course_prerequisites
        topics_html = "None configured"
        if isinstance(topics, list) and topics:
            topics_html = " ".join(
                f'<span style="display:inline-block;background:var(--body-bg, #e0f2fe);color:var(--body-fg, #0369a1);border:1px solid var(--border-color, #93c5fd);padding:2px 7px;border-radius:3px;font-size:11px;font-weight:600;margin:2px 3px 2px 0;">{t}</span>'
                for t in topics
            )

        total_apps = obj.applications.count()
        evaluated_apps = obj.applications.filter(exam__status="EVALUATED").count()
        qualified_apps = obj.applications.filter(exam__qualified=True).count()

        return format_html(
            '<div style="background:var(--darkened-bg, #f8fafc);border:1px solid var(--border-color, #e2e8f0);border-radius:6px;padding:14px;line-height:1.6;font-size:12px;color:var(--body-fg, #0f172a);">'
            '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;margin-bottom:12px;color:var(--body-fg);">'
            '  <div><strong style="color:var(--body-fg);">Course Track:</strong> {} ({})</div>'
            '  <div><strong style="color:var(--body-fg);">Screening Duration:</strong> {} Mins</div>'
            '  <div><strong style="color:var(--body-fg);">Questions Volume:</strong> {} Questions</div>'
            '  <div><strong style="color:var(--body-fg);">Pass Percentage:</strong> {}%</div>'
            '  <div><strong style="color:var(--body-fg);">Difficulty Level:</strong> {}</div>'
            '  <div><strong style="color:var(--body-fg);">Interview Required:</strong> {}</div>'
            '</div>'
            '<div style="margin-bottom:8px;color:var(--body-fg);"><strong style="color:var(--body-fg);">AI Prerequisite Topics (Seeded from Course):</strong><br>{}</div>'
            '<div style="border-top:1px solid var(--border-color, #cbd5e1);padding-top:8px;font-size:12px;color:var(--body-fg, #334155);">'
            '  <strong style="color:var(--body-fg);">Cohort Screening Progress:</strong> {} Total Candidate Applications | {} Exams Evaluated | <span style="color:#16a34a;font-weight:700;">{} Qualified</span>'
            '</div>'
            '</div>',
            c.name,
            c.code,
            c.exam_duration_minutes,
            c.exam_total_questions,
            c.exam_pass_percentage,
            c.get_exam_difficulty_display(),
            "Yes" if c.requires_interview else "No (Auto-skip to Cohort)",
            format_html(topics_html),
            total_apps,
            evaluated_apps,
            qualified_apps,
        )

    @admin.display(description="Assign or transfer workflow-approved students")
    def applications_to_assign(self, obj):
        if not obj:
            return "-"
        count = obj.applications.count()
        return f"{count} student application(s) enrolled (managed via Applications inline below)."

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj, change, **kwargs)
        if "volunteers" in form.base_fields:
            volunteer_widget = form.base_fields["volunteers"].widget
            for permission_flag in ("can_add_related", "can_change_related", "can_delete_related"):
                if hasattr(volunteer_widget, permission_flag):
                    setattr(volunteer_widget, permission_flag, False)
        return form

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        cohort = form.instance
        for application in form.cleaned_data.get("applications_to_assign", []):
            previous_cohort = getattr(application, "assigned_cohort", None)
            application.assigned_cohort = cohort
            application.save(update_fields=["assigned_cohort", "updated_at"])
            if application.status not in {Application.Status.IN_PROGRESS, Application.Status.COMPLETED}:
                from applications.services.state_machine import transition_application_status
                try:
                    transition_application_status(
                        application,
                        Application.Status.COHORT_ASSIGNED,
                        user=request.user,
                        reason=f"Assigned to cohort {cohort.code} via Django Admin",
                    )
                except Exception:
                    pass

            student = getattr(application, "student", None)
            if student:
                if student.student_identity_issued_at is None:
                    student.student_identity_issued_at = timezone.now()
                    student.save(update_fields=["student_identity_issued_at", "updated_at"])

                student_user = getattr(student, "user", None)
                if student_user:
                    verb = "transferred" if previous_cohort and previous_cohort.pk != cohort.pk else "assigned"
                    course_name = cohort.course.name if getattr(cohort, "course", None) else ""
                    try:
                        notify_user(
                            student_user,
                            title=f"Cohort {verb}",
                            message=(
                                f"Hi {display_name(student_user)}, you were {verb} to "
                                f"{cohort.name} ({cohort.code}) for {course_name}."
                            ),
                            notification_type=Notification.Type.SUCCESS,
                            action_url="timetable",
                            dedupe_key=f"application:{application.id}:cohort:{cohort.id}",
                        )
                    except Exception as exc:
                        import logging
                        logging.getLogger(__name__).error(f"Failed to notify user on cohort assignment: {exc}")

    def save_model(self, request, obj, form, change):
        old_status = None
        if change and obj.pk:
            from .models import Cohort
            old_status = Cohort.objects.get(pk=obj.pk).status

        super().save_model(request, obj, form, change)
        
        if old_status and old_status != obj.status:
            from cohorts.services import sync_cohort_application_statuses
            sync_cohort_application_statuses(
                cohort=obj,
                user=request.user,
                old_status=old_status,
                new_status=obj.status
            )

        from common.cache_utils import bump_cache_version
        bump_cache_version("course-catalog")

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        from common.cache_utils import bump_cache_version
        bump_cache_version("course-catalog")


from .chat_models import CohortConversation, CohortMessage, CohortChatReadState


@admin.register(CohortConversation)
class CohortConversationAdmin(admin.ModelAdmin):
    list_display = ("cohort", "created_at", "updated_at")
    search_fields = ("cohort__code", "cohort__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(CohortMessage)
class CohortMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "sender", "created_at", "is_deleted")
    list_filter = ("is_deleted", "created_at")
    search_fields = ("sender__email", "body", "conversation__cohort__code")
    readonly_fields = ("created_at",)


@admin.register(CohortChatReadState)
class CohortChatReadStateAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "last_read_message", "updated_at")
    search_fields = ("user__email", "conversation__cohort__code")
    readonly_fields = ("updated_at",)


from .models import GitHubProvisioningQueue


@admin.register(GitHubProvisioningQueue)
class GitHubProvisioningQueueAdmin(admin.ModelAdmin):
    list_display = (
        "student_display",
        "student_code_display",
        "cohort_display",
        "github_username",
        "repo_name",
        "status_badge",
        "retry_count",
        "last_attempted_at",
        "error_message_display",
    )
    list_filter = ("status", "cohort", "retry_count", "created_at")
    search_fields = (
        "student__student_code",
        "student__user__first_name",
        "student__user__last_name",
        "student__user__email",
        "github_username",
        "repo_name",
    )
    readonly_fields = ("created_at", "updated_at", "last_attempted_at")
    actions = ["retry_selected_failed_repos"]

    @admin.display(description="Student")
    def student_display(self, obj):
        if obj.student and obj.student.user:
            return obj.student.user.get_full_name() or obj.student.student_code
        return "-"

    @admin.display(description="Student Code")
    def student_code_display(self, obj):
        return obj.student.student_code if obj.student else "-"

    @admin.display(description="Cohort")
    def cohort_display(self, obj):
        return obj.cohort.code if obj.cohort else "-"

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            GitHubProvisioningQueue.Status.SUCCESS: ("#dcfce7", "#15803d"),
            GitHubProvisioningQueue.Status.FAILED: ("#fee2e2", "#b91c1c"),
            GitHubProvisioningQueue.Status.PENDING: ("#fef9c3", "#a16207"),
            GitHubProvisioningQueue.Status.IN_PROGRESS: ("#dbeafe", "#1d4ed8"),
            GitHubProvisioningQueue.Status.SKIPPED_NO_GITHUB: ("#f3f4f6", "#4b5563"),
        }
        bg, fg = colors.get(obj.status, ("#f3f4f6", "#374151"))
        return format_html(
            '<span style="background:{};color:{};padding:3px 8px;border-radius:6px;font-weight:700;font-size:11px;">{}</span>',
            bg,
            fg,
            obj.get_status_display(),
        )

    @admin.display(description="Error Reason")
    def error_message_display(self, obj):
        if not obj.error_message:
            return "-"
        msg = obj.error_message
        if len(msg) > 60:
            return f"{msg[:60]}..."
        return msg

    @admin.action(description="🔄 Retry Selected Failed GitHub Repositories")
    def retry_selected_failed_repos(self, request, queryset):
        from .services import process_single_github_queue_item
        succeeded = 0
        failed = 0
        for item in queryset:
            res = process_single_github_queue_item(item)
            if res == GitHubProvisioningQueue.Status.SUCCESS:
                succeeded += 1
            else:
                failed += 1
        level = messages.SUCCESS if failed == 0 else messages.WARNING
        self.message_user(
            request,
            f"Retry completed: {succeeded} successfully provisioned, {failed} remaining failed.",
            level=level,
        )

