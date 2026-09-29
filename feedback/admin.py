from django.contrib import admin

from .models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("user", "feedback_type", "rating", "related_id", "created_at")
    list_filter = ("feedback_type", "rating", "created_at")
    search_fields = ("user__email", "user__first_name", "user__last_name", "comments")
    list_select_related = ("user",)
    autocomplete_fields = ("user",)
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"
    list_per_page = 50
