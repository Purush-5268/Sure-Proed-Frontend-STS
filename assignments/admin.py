import csv
from django import forms
from django.contrib import admin, messages
from django.db.models import Count, Q
from django.http import HttpResponse, JsonResponse
from django.urls import path
from django.utils import timezone
from django.utils.html import format_html

from accounts.models import User
from common.access import has_global_cohort_access
from common.models import Notification
from common.services.notifications import notify_cohort, notify_user
from courses.models import Course, CourseModule
from .models import Assignment, CapstoneProject, CapstoneSubmission, Submission


# ─────────────────────────────────────────────────────────────────────────────
# Assignment Admin Form & Dynamic Module Filter
# ─────────────────────────────────────────────────────────────────────────────

class AssignmentAdminForm(forms.ModelForm):
    class Meta:
        model = Assignment
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        cohort_id = None
        if self.is_bound and self.data.get("cohort"):
            cohort_id = self.data.get("cohort")
        elif self.instance and getattr(self.instance, "cohort_id", None):
            cohort_id = self.instance.cohort_id
        elif "initial" in kwargs and kwargs["initial"].get("cohort"):
            cohort_id = kwargs["initial"].get("cohort")

        if cohort_id:
            try:
                from cohorts.models import Cohort
                cohort = Cohort.objects.select_related("course").get(pk=cohort_id)
                self.fields["module"].queryset = CourseModule.objects.filter(
                    course=cohort.course, is_active=True
                ).order_by("order", "module_number")
            except Exception:
                self.fields["module"].queryset = CourseModule.objects.none()
        else:
            self.fields["module"].queryset = CourseModule.objects.filter(
                is_active=True
            ).select_related("course").order_by("course__code", "order", "module_number")

    def clean(self):
        cleaned_data = super().clean()
        cohort = cleaned_data.get("cohort")
        module = cleaned_data.get("module")
        if cohort and module:
            cohort_course_id = getattr(cohort, "course_id", None)
            module_course_id = getattr(module, "course_id", None)
            if cohort_course_id and module_course_id and cohort_course_id != module_course_id:
                cohort_course_code = getattr(cohort.course, "code", "")
                module_course_code = getattr(module.course, "code", "")
                self.add_error(
                    "module",
                    f"Selected module belongs to course '{module_course_code}', but cohort '{cohort.code}' "
                    f"belongs to course '{cohort_course_code}'. Please select a module that belongs to '{cohort_course_code}'."
                )
        return cleaned_data


# ─────────────────────────────────────────────────────────────────────────────
# CSV export actions
# ─────────────────────────────────────────────────────────────────────────────

def export_assignments_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_assignments.csv"'
    writer = csv.writer(response)
    writer.writerow(["Title", "Cohort", "Type", "Status", "Begin Date", "Deadline", "Max Marks", "Pass Percentage"])
    for a in queryset.select_related("cohort"):
        writer.writerow([
            a.title,
            a.cohort.code if a.cohort else "",
            a.assignment_type,
            a.status,
            a.begin_date.strftime("%Y-%m-%d %H:%M") if a.begin_date else "",
            a.deadline.strftime("%Y-%m-%d %H:%M") if a.deadline else "",
            a.max_marks,
            a.pass_percentage,
        ])
    return response

export_assignments_to_csv.short_description = "Export selected assignments to CSV"


def export_submissions_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_assignment_submissions.csv"'
    writer = csv.writer(response)
    writer.writerow(["Assignment Title", "Student Code", "Submitted At", "Late", "Evaluated", "Marks Obtained", "Passed", "Submission URL"])
    for sub in queryset.select_related("assignment", "student"):
        writer.writerow([
            sub.assignment.title if sub.assignment else "",
            sub.student.student_code if sub.student else "",
            sub.submitted_at.strftime("%Y-%m-%d %H:%M") if sub.submitted_at else "",
            "Yes" if sub.is_late else "No",
            "Yes" if sub.evaluated else "No",
            sub.marks_obtained or "",
            "Yes" if sub.passed else ("No" if sub.passed is False else "Pending"),
            sub.submission_url or "",
        ])
    return response

export_submissions_to_csv.short_description = "Export selected assignment submissions to CSV"


# ─────────────────────────────────────────────────────────────────────────────
# Assignment Admin
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    form = AssignmentAdminForm
    list_display = ("title", "cohort", "module", "assignment_type", "status", "deadline", "max_marks", "autograding_enabled")
    search_fields = ("title", "description", "cohort__code")
    list_filter = ("assignment_type", "status", "module", "autograding_enabled")
    actions = [export_assignments_to_csv]

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "cohort-modules/",
                self.admin_site.admin_view(self.get_cohort_modules_view),
                name="assignment_cohort_modules",
            ),
        ]
        return custom_urls + urls

    def get_cohort_modules_view(self, request):
        cohort_id = request.GET.get("cohort_id")
        if not cohort_id:
            return JsonResponse({"modules": []})
        try:
            from cohorts.models import Cohort
            cohort = Cohort.objects.select_related("course").get(pk=cohort_id)
            modules = CourseModule.objects.filter(course=cohort.course, is_active=True).order_by("order", "module_number")
            data = [
                {"id": str(m.id), "title": f"Module {m.module_number}: {m.title}"}
                for m in modules
            ]
            return JsonResponse({"modules": data, "course_code": getattr(cohort.course, "code", "")})
        except Exception:
            return JsonResponse({"modules": []})

    def get_queryset(self, request):
        # Capstones have their own complete admin workflow below.
        return super().get_queryset(request).exclude(assignment_type=Assignment.AssignmentType.CAPSTONE)

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
        if obj.status == Assignment.Status.PUBLISHED:
            notify_cohort(
                obj.cohort,
                title="Assignment updated" if change else "New assignment published",
                message=f"{obj.title} is available. Deadline: {obj.deadline:%d %b %Y, %I:%M %p}.",
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="assignments",
                dedupe_key=f"assignment:{obj.id}:published",
            )


# ─────────────────────────────────────────────────────────────────────────────
# Submission Admin
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = (
        "assignment", "student", "submitted_at", "github_commit_link",
        "resubmission_badge", "is_late", "autograding_status", "evaluated", "passed"
    )
    search_fields = ("assignment__title", "student__student_code", "feedback", "commit_sha", "resubmission_remarks")
    list_filter = ("resubmission_requested", "is_late", "autograding_status", "evaluated", "passed", "assignment__cohort")
    readonly_fields = ("github_commit_review", "student_workspace_repository", "resubmission_count")
    fields = (
        "assignment", "student", "submitted_at", "resubmission_count",
        "resubmission_requested", "resubmission_remarks",
        "submission_text", "submission_url",
        "commit_sha", "github_commit_review", "student_workspace_repository", "files",
        "is_late", "evaluated", "evaluated_by", "evaluated_at", "marks_obtained",
        "passed", "feedback", "autograding_status", "auto_marks", "auto_feedback", "auto_report"
    )
    actions = [export_submissions_to_csv, "ask_students_to_resubmit_action"]

    @admin.display(description="Resubmission")
    def resubmission_badge(self, obj):
        if getattr(obj, "resubmission_requested", False):
            return format_html(
                '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-weight:700;font-size:11px;">'
                '⚠️ Asked to Resubmit'
                '</span>'
            )
        count = getattr(obj, "resubmission_count", 0)
        if not count:
            return format_html('<span style="color:#64748b;font-size:11px;">Initial</span>')
        return format_html(
            '<span style="background:#e0e7ff;color:#3730a3;padding:2px 7px;border-radius:9999px;font-weight:700;font-size:11px;">'
            '🔄 {}x Resubmitted'
            '</span>',
            count
        )

    @admin.action(description="📢 Ask Selected Student(s) to Resubmit")
    def ask_students_to_resubmit_action(self, request, queryset):
        count = 0
        for sub in queryset.select_related("student", "student__user", "assignment"):
            sub.resubmission_requested = True
            if not sub.resubmission_remarks:
                sub.resubmission_remarks = "Mentor requested resubmission. Please address feedback and submit updated work."
            sub.save(update_fields=["resubmission_requested", "resubmission_remarks", "updated_at"])
            if sub.student and sub.student.user:
                notify_user(
                    sub.student.user,
                    title="Resubmission requested",
                    message=f"Your mentor has asked you to resubmit '{sub.assignment.title}'. Remarks: {sub.resubmission_remarks}",
                    notification_type=Notification.Type.ACTION_REQUIRED,
                    action_url="assignments",
                    dedupe_key=f"submission:{sub.id}:resubmit_requested:{timezone.now().timestamp()}",
                )
            count += 1
        self.message_user(
            request,
            f"Successfully asked {count} student(s) to resubmit. Notifications have been dispatched.",
            level=messages.SUCCESS,
        )

    def save_model(self, request, obj, form, change):
        was_requested = False
        if change and "resubmission_requested" in form.changed_data and obj.resubmission_requested:
            was_requested = True
        super().save_model(request, obj, form, change)
        if was_requested and obj.student and obj.student.user:
            remarks = f" Remarks: {obj.resubmission_remarks}" if obj.resubmission_remarks else ""
            notify_user(
                obj.student.user,
                title="Resubmission requested",
                message=f"Your mentor has asked you to resubmit your assignment '{obj.assignment.title}'.{remarks}",
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="assignments",
                dedupe_key=f"submission:{obj.id}:resubmit_requested:{timezone.now().timestamp()}",
            )

    @admin.display(description="GitHub Specific Commit")
    def github_commit_link(self, obj):
        if not obj:
            return "-"
        repo_url = obj.student.github_repo_url if obj.student_id else None
        base_repo = repo_url or (obj.submission_url if obj.submission_url and "github.com" in obj.submission_url else None)
        if base_repo and obj.commit_sha:
            commit_url = f"{base_repo.rstrip('/')}/commit/{obj.commit_sha}"
            return format_html(
                '<a href="{}" target="_blank" rel="noopener" style="background:#0f172a;color:#ffffff;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;text-decoration:none;display:inline-block;">'
                '🔍 Commit {}'
                '</a>',
                commit_url, obj.commit_sha[:7]
            )
        elif base_repo:
            return format_html(
                '<a href="{}" target="_blank" rel="noopener" style="color:#2563eb;font-size:11px;font-weight:600;">'
                '📦 View Repo'
                '</a>',
                base_repo
            )
        return "-"

    @admin.display(description="Mentor Submission & GitHub Inspector")
    def github_commit_review(self, obj):
        if not obj:
            return "Save submission first."
        repo_url = obj.student.github_repo_url if obj.student_id else None
        sub_url = obj.submission_url or ""
        commit_sha = obj.commit_sha or ""
        is_github = "github.com" in sub_url.lower() or bool(repo_url)

        base_repo = (sub_url if "github.com" in sub_url.lower() else None) or repo_url
        commit_url = f"{base_repo.rstrip('/')}/commit/{commit_sha}" if (base_repo and commit_sha) else base_repo
        tree_url = f"{base_repo.rstrip('/')}/tree/{commit_sha}" if (base_repo and commit_sha) else base_repo

        html_buttons = []
        if sub_url and not is_github:
            html_buttons.append(
                f'<a href="{sub_url}" target="_blank" rel="noopener" style="background:#2563eb;color:#ffffff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;">🔗 Open Submitted Project Work (Google Drive / Figma / URL)</a>'
            )
        elif sub_url and is_github and not commit_sha:
            html_buttons.append(
                f'<a href="{sub_url}" target="_blank" rel="noopener" style="background:#0f172a;color:#ffffff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;">🔗 Open Submitted GitHub Link</a>'
            )

        if is_github and commit_sha:
            html_buttons.append(
                f'<a href="{commit_url}" target="_blank" rel="noopener" style="background:#16a34a;color:#ffffff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;">🚀 Inspect Specific Commit ({commit_sha[:7]})</a>'
            )
            html_buttons.append(
                f'<a href="{tree_url}" target="_blank" rel="noopener" style="background:#0284c7;color:#ffffff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;">📁 Browse Code Tree at Commit</a>'
            )

        if repo_url:
            html_buttons.append(
                f'<a href="{repo_url}" target="_blank" rel="noopener" style="background:#334155;color:#ffffff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;">📦 Student Workspace Repo</a>'
            )

        buttons_html = " ".join(html_buttons) if html_buttons else '<span style="color:#64748b;">No submission link attached.</span>'
        student_notes_html = f'<div style="margin-top:8px;padding:8px 12px;background:var(--body-bg, #ffffff);border:1px solid var(--border-color, #e2e8f0);border-radius:4px;font-size:12px;color:var(--body-fg);"><strong>Student Submission Notes:</strong><br>{obj.submission_text}</div>' if obj.submission_text else ""
        sha_info = f'<div style="font-size:11px;color:var(--body-quiet-color, #475569);margin-top:6px;">Exact Commit SHA: <code>{commit_sha}</code></div>' if commit_sha else ""

        return format_html(
            '<div style="background:var(--darkened-bg, #f8fafc);border:1px solid var(--border-color, #cbd5e1);border-radius:6px;padding:14px;line-height:1.6;font-size:13px;color:var(--body-fg);">'
            '  <div style="font-weight:700;color:var(--body-fg, #0f172a);margin-bottom:8px;">🔍 Student Submission Work & Source Code Review:</div>'
            '  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px;">{}</div>'
            '  {}{}'
            '</div>',
            format_html(buttons_html),
            format_html(student_notes_html),
            format_html(sha_info)
        )

    @admin.display(description="Student Workspace Repository")
    def student_workspace_repository(self, obj):
        repo_url = obj.student.github_repo_url if obj and obj.student_id else None
        if not repo_url:
            return "Repository not linked"
        return format_html('<a href="{}" target="_blank" rel="noopener">Open repository</a>', repo_url)

    def get_queryset(self, request):
        # Capstone work is reviewed only under Capstone Submissions.
        return super().get_queryset(request).exclude(
            assignment__assignment_type=Assignment.AssignmentType.CAPSTONE
        )

    def save_model(self, request, obj, form, change):
        if obj.marks_obtained is not None:
            obj.evaluated = True
            obj.evaluated_by = request.user
            obj.evaluated_at = timezone.now()
            if obj.assignment.max_marks:
                percentage = obj.marks_obtained / obj.assignment.max_marks * 100
                obj.passed = percentage >= obj.assignment.pass_percentage
        super().save_model(request, obj, form, change)
        if obj.evaluated:
            notify_user(
                obj.student.user,
                title="Assignment graded",
                message=f"{obj.assignment.title}: {obj.marks_obtained}/{obj.assignment.max_marks}.",
                notification_type=(Notification.Type.SUCCESS if obj.passed else Notification.Type.WARNING),
                action_url="assignments",
                dedupe_key=f"submission:{obj.id}:graded",
            )


# ─────────────────────────────────────────────────────────────────────────────
# Capstone Project Admin Form (dynamic elective queryset)
# ─────────────────────────────────────────────────────────────────────────────

class CapstoneProjectAdminForm(forms.ModelForm):
    class Meta:
        model = CapstoneProject
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if "elective" in self.fields:
            # Determine the cohort's primary course so we can offer all *other*
            # published/active courses as possible electives.
            cohort_course_id = None
            if self.instance and self.instance.pk:
                try:
                    if getattr(self.instance, "cohort_id", None) and self.instance.cohort:
                        cohort_course_id = getattr(self.instance.cohort, "course_id", None)
                except Exception:
                    cohort_course_id = None
            elif self.is_bound:
                cohort_id = self.data.get("cohort")
                if cohort_id:
                    from cohorts.models import Cohort
                    try:
                        cohort_course_id = Cohort.objects.values_list("course_id", flat=True).get(pk=cohort_id)
                    except Exception:
                        pass

            # If the primary course has explicitly configured electives, use those.
            # Otherwise, offer all other published/draft courses as possible electives.
            if cohort_course_id:
                try:
                    primary_course = Course.objects.prefetch_related("electives").get(pk=cohort_course_id)
                    configured_electives = primary_course.electives.filter(
                        status__in=[Course.Status.PUBLISHED, Course.Status.DRAFT]
                    ).order_by("code")
                    if configured_electives.exists():
                        qs = configured_electives
                    else:
                        qs = Course.objects.filter(
                            status__in=[Course.Status.PUBLISHED, Course.Status.DRAFT]
                        ).exclude(pk=cohort_course_id).order_by("code")
                except Exception:
                    qs = Course.objects.filter(
                        status__in=[Course.Status.PUBLISHED, Course.Status.DRAFT]
                    ).exclude(pk=cohort_course_id).order_by("code")
            else:
                qs = Course.objects.filter(
                    status__in=[Course.Status.PUBLISHED, Course.Status.DRAFT]
                ).order_by("code")

            self.fields["elective"].queryset = qs
            self.fields["elective"].label_from_instance = lambda obj: f"[{obj.code}] {obj.name}"
            self.fields["elective"].help_text = (
                "Optional. Select the elective course this capstone is scoped to. "
                "Only students with an active Application for the chosen elective course "
                "will see and can submit this capstone. Leave blank for all cohort students."
            )


# ─────────────────────────────────────────────────────────────────────────────
# Capstone Submission Inline (used inside CapstoneProjectAdmin)
# ─────────────────────────────────────────────────────────────────────────────

class CapstoneSubmissionInline(admin.TabularInline):
    model = Submission
    extra = 0
    fields = (
        "student", "student_elective", "submitted_at", "submission_link", "is_late", "evaluated",
        "marks_obtained", "passed", "feedback",
    )
    readonly_fields = ("student", "student_elective", "submitted_at", "submission_link", "is_late")
    show_change_link = True

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "student", "student__user",
            "assignment", "assignment__elective",
        ).prefetch_related("student__applications__course")

    @admin.display(description="Submitted work")
    def submission_link(self, obj):
        if not obj.submission_url:
            return "No link submitted"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open capstone</a>',
            obj.submission_url,
        )

    @admin.display(description="Student Elective")
    def student_elective(self, obj):
        """
        Show which elective course(s) this student is enrolled in via their
        Applications. Highlights a match with the capstone's elective.
        """
        if not obj or not obj.student:
            return "-"

        capstone_elective = getattr(obj.assignment, "elective", None)

        # Collect the student's enrolled courses via their applications
        try:
            apps = obj.student.applications.select_related("course").filter(
                status__in=[
                    "QUALIFIED", "COHORT_ASSIGNED", "IN_PROGRESS",
                    "COMPLETED", "TRAINING", "INTERNSHIP_ASSIGNED",
                ]
            )
        except Exception:
            return "-"

        if not apps.exists():
            return format_html('<span style="color:#94a3b8;font-size:11px;">No active applications</span>')

        parts = []
        for app in apps:
            course = app.course
            is_match = capstone_elective and capstone_elective.pk == course.pk
            if is_match:
                parts.append(
                    f'<span style="background:#dcfce7;color:#166534;padding:2px 7px;border-radius:4px;'
                    f'font-size:10px;font-weight:700;">✓ {course.code}</span>'
                )
            else:
                parts.append(
                    f'<span style="background:#f1f5f9;color:#475569;padding:2px 6px;border-radius:4px;'
                    f'font-size:10px;">{course.code}</span>'
                )
        return format_html(" ".join(parts))

    def has_add_permission(self, request, obj=None):
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Capstone Project Admin
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(CapstoneProject)
class CapstoneProjectAdmin(AssignmentAdmin):
    form = CapstoneProjectAdminForm
    list_display = (
        "title", "cohort", "module", "elective_badge", "status", "begin_date", "deadline",
        "submitted_count", "evaluated_count", "passed_count",
    )
    list_filter = ("status", "cohort", "module", "elective", "deadline")
    search_fields = ("title", "description", "cohort__code", "cohort__name", "module__title", "elective__name", "elective__code")
    fields = (
        "cohort", "module", "elective", "title", "description", "created_by", "begin_date",
        "deadline", "max_marks", "pass_percentage", "files", "status",
    )
    readonly_fields = ()
    inlines = (CapstoneSubmissionInline,)

    def get_queryset(self, request):
        queryset = (
            admin.ModelAdmin.get_queryset(self, request)
            .filter(assignment_type=Assignment.AssignmentType.CAPSTONE)
            .select_related("cohort", "module", "created_by", "elective")
            .annotate(
                capstone_submitted=Count("submissions", distinct=True),
                capstone_evaluated=Count("submissions", filter=Q(submissions__evaluated=True), distinct=True),
                capstone_passed=Count("submissions", filter=Q(submissions__passed=True), distinct=True),
            )
        )
        if has_global_cohort_access(request.user):
            return queryset
        role = getattr(request.user, "role", "")
        if role == User.Role.MENTOR:
            return queryset.filter(cohort__mentors=request.user).distinct()
        if role in {User.Role.VOLUNTEER, User.Role.TRUSTEE}:
            return queryset.filter(cohort__volunteers=request.user).distinct()
        return queryset.none()

    @admin.display(description="Elective", ordering="elective__code")
    def elective_badge(self, obj):
        if not obj.elective:
            return format_html(
                '<span style="color:#94a3b8;font-size:11px;font-style:italic;">All students</span>'
            )
        return format_html(
            '<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:4px;'
            'font-size:11px;font-weight:700;">{} — {}</span>',
            obj.elective.code,
            obj.elective.name,
        )

    @admin.display(description="Submitted", ordering="capstone_submitted")
    def submitted_count(self, obj):
        return obj.capstone_submitted

    @admin.display(description="Evaluated", ordering="capstone_evaluated")
    def evaluated_count(self, obj):
        return obj.capstone_evaluated

    @admin.display(description="Passed", ordering="capstone_passed")
    def passed_count(self, obj):
        return obj.capstone_passed

    def save_model(self, request, obj, form, change):
        obj.assignment_type = Assignment.AssignmentType.CAPSTONE
        # Set created_by on new records
        if not obj.created_by_id:
            obj.created_by = request.user
        # Skip AssignmentAdmin.save_model; call ModelAdmin directly to avoid
        # double notify. We handle notify here with capstone-specific messaging.
        admin.ModelAdmin.save_model(self, request, obj, form, change)
        if obj.status == Assignment.Status.PUBLISHED:
            elective_note = (
                f" (Elective: {obj.elective.name})" if obj.elective else ""
            )
            notify_cohort(
                obj.cohort,
                title="Capstone Project released" if not change else "Capstone Project updated",
                message=(
                    f"Your capstone project '{obj.title}'{elective_note} is now available. "
                    f"Deadline: {obj.deadline:%d %b %Y, %I:%M %p}."
                ),
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url="assignments",
                dedupe_key=f"capstone:{obj.id}:admin:{obj.updated_at}",
            )


# ─────────────────────────────────────────────────────────────────────────────
# Capstone Submission Admin
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(CapstoneSubmission)
class CapstoneSubmissionAdmin(SubmissionAdmin):
    list_display = (
        "assignment", "student", "submitted_at", "student_elective_display", "capstone_link",
        "resubmission_badge", "is_late", "evaluated", "marks_obtained", "passed", "evaluated_by",
    )
    list_filter = ("resubmission_requested", "evaluated", "passed", "is_late", "assignment__cohort", "assignment__elective")
    search_fields = (
        "assignment__title", "assignment__cohort__code", "student__student_code",
        "student__user__email", "submission_url", "feedback", "resubmission_remarks",
        "assignment__elective__name", "assignment__elective__code",
    )
    readonly_fields = ("capstone_link", "student_workspace_repository", "student_elective_display", "resubmission_count")
    fields = (
        "assignment", "student", "submitted_at", "resubmission_count",
        "resubmission_requested", "resubmission_remarks",
        "submission_text", "submission_url",
        "capstone_link", "student_workspace_repository", "student_elective_display",
        "files", "is_late", "evaluated",
        "evaluated_by", "evaluated_at", "marks_obtained", "passed", "feedback",
    )

    def get_queryset(self, request):
        queryset = (
            admin.ModelAdmin.get_queryset(self, request)
            .filter(assignment__assignment_type=Assignment.AssignmentType.CAPSTONE)
            .select_related(
                "assignment", "assignment__cohort", "assignment__elective",
                "student", "student__user", "evaluated_by",
            )
        )
        if has_global_cohort_access(request.user):
            return queryset
        role = getattr(request.user, "role", "")
        if role == User.Role.MENTOR:
            return queryset.filter(assignment__cohort__mentors=request.user).distinct()
        if role in {User.Role.VOLUNTEER, User.Role.TRUSTEE}:
            return queryset.filter(assignment__cohort__volunteers=request.user).distinct()
        return queryset.none()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "assignment":
            kwargs["queryset"] = Assignment.objects.filter(
                assignment_type=Assignment.AssignmentType.CAPSTONE
            ).order_by("-deadline")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    @admin.display(description="Capstone work")
    def capstone_link(self, obj):
        if not obj or not obj.submission_url:
            return "No link submitted"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open capstone</a>',
            obj.submission_url,
        )

    @admin.display(description="Student workspace repository")
    def student_workspace_repository(self, obj):
        repo_url = obj.student.github_repo_url if obj and obj.student_id else None
        if not repo_url:
            return "Repository not available"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open repository</a>',
            repo_url,
        )

    @admin.display(description="Student Elective")
    def student_elective_display(self, obj):
        """
        Shows whether the submitting student's application course matches the
        capstone's elective, or flags a mismatch for admin review.
        """
        if not obj or not obj.student:
            return "-"

        capstone_elective = getattr(obj.assignment, "elective", None) if obj.assignment else None
        if not capstone_elective:
            return format_html(
                '<span style="color:#64748b;font-size:11px;">No elective restriction on this capstone</span>'
            )

        try:
            student_courses = list(
                obj.student.applications.filter(
                    status__in=[
                        "QUALIFIED", "COHORT_ASSIGNED", "IN_PROGRESS",
                        "COMPLETED", "TRAINING", "INTERNSHIP_ASSIGNED",
                    ]
                ).values_list("course__code", "course_id", named=True)
            )
        except Exception:
            return "-"

        match = any(str(sc.course_id) == str(capstone_elective.pk) for sc in student_courses)
        enrolled_codes = ", ".join(sc.course__code for sc in student_courses) or "None"

        if match:
            return format_html(
                '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:4px;'
                'font-size:11px;font-weight:700;">✓ Enrolled in {}</span>',
                capstone_elective.code,
            )
        return format_html(
            '<span style="background:#fee2e2;color:#b91c1c;padding:3px 8px;border-radius:4px;'
            'font-size:11px;font-weight:700;">⚠ Not enrolled (student has: {})</span>',
            enrolled_codes,
        )
