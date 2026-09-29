from django.contrib import admin

from .models import Company, JobPosting, JobReference


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "user_first_name_display", "user_last_name_display", "industry", "location", "is_verified")
    readonly_fields = ("user_first_name_display", "user_last_name_display")
    search_fields = ("name", "user__email", "user__first_name", "user__last_name", "industry", "location")
    list_filter = ("is_verified", "industry")
    list_select_related = ("user",)
    autocomplete_fields = ("user", "shortlisted_students")
    list_per_page = 50

    @admin.display(description="Contact First Name")
    def user_first_name_display(self, obj):
        if obj.user:
            return obj.user.first_name or "-"
        return "-"

    @admin.display(description="Contact Last Name")
    def user_last_name_display(self, obj):
        if obj.user:
            return obj.user.last_name or "-"
        return "-"


@admin.register(JobReference)
class JobReferenceAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "cohort", "employment_type", "deadline", "is_active", "created_by")
    search_fields = ("title", "company__name", "cohort__code", "created_by__email")
    list_filter = ("employment_type", "is_active", "deadline")
    list_select_related = ("company", "cohort", "created_by")
    autocomplete_fields = ("company", "cohort", "created_by")
    date_hierarchy = "created_at"
    list_per_page = 50


@admin.register(JobPosting)
class JobPostingAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "location", "salary_range", "status", "created_at")
    list_filter = ("status", "company", "created_at")
    search_fields = ("title", "company__name", "company__user__email", "location", "requirements")
    list_select_related = ("company", "company__user")
    autocomplete_fields = ("company", "applicants")
    date_hierarchy = "created_at"
    list_per_page = 50
