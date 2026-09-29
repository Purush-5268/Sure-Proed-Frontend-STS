import csv
from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.http import HttpResponse
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from cohorts.models import Cohort
from common.cache_utils import bump_cache_version
from .models import Course, CourseModule


class CourseAdminForm(forms.ModelForm):
    class Meta:
        model = Course
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import User
        admin_qs = User.objects.filter(role=User.Role.ADMIN, is_active=True).order_by("email")
        if "approved_by" in self.fields:
            self.fields["approved_by"].queryset = admin_qs
        if "created_by" in self.fields:
            self.fields["created_by"].queryset = admin_qs


def export_courses_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_courses.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Code", "Name", "Category", "Domain", "Subject",
        "Difficulty", "Status", "Duration (Weeks)", "Min Attendance %",
        "Min Assignment %", "Prerequisites", "Eligibility Criteria"
    ])

    for course in queryset:
        writer.writerow([
            course.code,
            course.name,
            course.category,
            course.domain,
            course.subject or "",
            course.difficulty,
            course.status,
            course.duration_weeks,
            course.minimum_attendance_percentage,
            course.minimum_assignment_percentage,
            course.prerequisites or "",
            course.eligibility_criteria or "",
        ])

    return response


export_courses_to_csv.short_description = "Export selected courses to CSV"


class CourseModuleInline(admin.TabularInline):
    model = CourseModule
    extra = 1
    fields = ("module_number", "order", "title", "description", "topics", "duration_weeks", "is_active")
    ordering = ("order", "module_number")


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    form = CourseAdminForm
    list_display = (
        "code", "name", "category", "domain", "difficulty",
        "electives_summary", "status", "duration_weeks",
    )
    search_fields = ("code", "name", "domain", "subject", "prerequisites", "eligibility_criteria")
    list_filter = ("category", "difficulty", "is_elective", "status", "domain")
    filter_horizontal = ("electives",)
    actions = [export_courses_to_csv]
    # Cohorts have their own lifecycle and must not be resubmitted when an
    # administrator edits only course prerequisites or exam settings.
    inlines = (CourseModuleInline,)

    def get_readonly_fields(self, request, obj=None):
        fields = ["cohorts_management_link"]
        if obj:
            # Code is permanent and read-only for existing courses
            fields.append("code")
        return tuple(fields)

    fieldsets = (
        (
            "Course",
            {"fields": ("code", "name", "category", "domain", "subject", "is_elective", "status")},
        ),
        (
            "Electives Configuration",
            {
                "fields": ("electives",),
                "description": (
                    "Select the elective courses available to students enrolled in this course. "
                    "These electives will be available for capstone projects and specialized elective tracking."
                ),
            },
        ),
        (
            "Description & Eligibility",
            {
                "fields": (
                    "description", "curriculum", "curriculum_file",
                    "prerequisites", "course_prerequisites", "eligibility_criteria",
                )
            },
        ),
        (
            "Screening & Selection",
            {
                "fields": (
                    "difficulty",
                    "exam_total_questions",
                    "exam_difficulty",
                    "exam_duration_minutes",
                    "exam_pass_percentage",
                ),
                "description": (
                    "Configure default pre-screening exam parameters (questions count, difficulty, duration, pass threshold) "
                    "for this course track. Note: Default screening date/time and interview requirements are managed at the Cohort level."
                ),
            },
        ),
        (
            "Programme Requirements",
            {
                "fields": (
                    "duration_weeks", "minimum_attendance_percentage",
                    "minimum_assignment_percentage",
                )
            },
        ),
        (
            "Cohorts",
            {
                "fields": ("cohorts_management_link",),
                "description": (
                    "Cohorts are managed separately so editing this course cannot "
                    "create or overwrite a started cohort."
                ),
            },
        ),
        ("Ownership", {"fields": ("approved_by", "created_by")}),
    )

    @admin.display(description="Electives")
    def electives_summary(self, obj):
        if not obj or not obj.pk:
            return "-"
        count = obj.electives.count()
        if count == 0:
            if obj.is_elective:
                return format_html('<span style="background:var(--darkened-bg);color:var(--body-quiet-color);padding:2px 6px;border-radius:3px;font-size:11px;">(Elective)</span>')
            return format_html('<span style="color:var(--body-quiet-color);font-size:11px;">-</span>')
        return format_html(
            '<span style="background:var(--selected-bg, #dbeafe);color:var(--body-fg, #1e40af);'
            'padding:2px 7px;border-radius:3px;font-size:11px;font-weight:600;">{} elective(s)</span>',
            count,
        )

    @admin.display(description="Course cohorts")
    def cohorts_management_link(self, obj):
        if not obj or not obj.pk:
            return "Save the course before creating its cohorts."
        count = obj.cohorts.count()
        url = reverse("admin:cohorts_cohort_changelist")
        return format_html(
            '<a class="button" href="{}?course__id__exact={}">Manage {} cohort(s)</a>',
            url,
            obj.pk,
            count,
        )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        bump_cache_version("course-catalog")
        if obj.status == Course.Status.CANCELLED:
            from .services import handle_course_cancellation
            handle_course_cancellation(obj, actor=request.user)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in formset.deleted_objects:
            obj.delete()
        for instance in instances:
            if isinstance(instance, Cohort) and not getattr(instance, "created_by_id", None):
                instance.created_by = request.user
            instance.save()
        formset.save_m2m()
        if formset.model is CourseModule or formset.model is Cohort:
            bump_cache_version("course-catalog")

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        bump_cache_version("course-catalog")

@admin.register(CourseModule)
class CourseModuleAdmin(admin.ModelAdmin):
    list_display = ("course_code", "course", "module_number", "title", "duration_weeks", "order", "is_active")
    list_filter = ("course", "is_active")
    search_fields = ("course__code", "course__name", "title", "description")
    ordering = ("course", "order", "module_number")
    list_select_related = ("course",)
    autocomplete_fields = ("course",)
    list_per_page = 50

    @admin.display(ordering="course__code", description="Course Code")
    def course_code(self, obj):
        return obj.course.code

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        bump_cache_version("course-catalog")

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        bump_cache_version("course-catalog")
