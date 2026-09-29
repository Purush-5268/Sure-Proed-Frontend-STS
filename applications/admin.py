import csv
import logging
from datetime import timedelta
from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models
from django.db.models import Q
from django.http import FileResponse, Http404, HttpResponse, HttpResponseRedirect, JsonResponse
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.html import format_html, mark_safe

from exams.models import Exam
from courses.models import Course, CourseModule
from cohorts.models import Cohort
from question_bank.models import QuestionBank
from common.models import Notification
from common.services.notifications import display_name, notify_user

from .models import Application, ApplicationStatusAudit, CommunityActivity, PreScreening, PreScreeningInterview
from .services.journey_service import build_student_journey
from .services.screening_schedule_service import (
    bulk_schedule_applications,
    create_course_default_screening_schedule,
    publish_screening_schedule,
)


logger = logging.getLogger(__name__)


class ApplicationAdminForm(forms.ModelForm):
    offer_letter_file = forms.FileField(
        required=False,
        widget=forms.FileInput,
        help_text=(
            "Upload a replacement PDF if needed. Use the protected download link "
            "below to open the currently stored offer letter."
        ),
    )

    class Meta:
        model = Application
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        cohort = cleaned_data.get("assigned_cohort")
        course = cleaned_data.get("course") or getattr(self.instance, "course", None)
        status_value = cleaned_data.get("status") or getattr(self.instance, "status", None)
        role_status = cleaned_data.get("role_verification_status") or getattr(
            self.instance,
            "role_verification_status",
            Application.RoleVerificationStatus.PENDING,
        )
        qualified = cleaned_data.get("qualified")
        student = cleaned_data.get("student") or getattr(self.instance, "student", None)

        if status_value in {
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
            Application.Status.COMPLETED,
            Application.Status.SUSPENDED,
            Application.Status.TRANSFER_COHORT,
        } and cohort is None:
            self.add_error(
                "assigned_cohort",
                "Select a cohort first. Cohort Assigned and In Progress cannot be set manually without one.",
            )

        interview = getattr(self.instance, "pre_screening_interview", None) if self.instance.pk else None
        inline_interview_passed = False
        if hasattr(self, "data"):
            for k, v in self.data.items():
                if "pre_screening_interview" in k and k.endswith("-status") and str(v).upper() in {PreScreeningInterview.Status.PASSED, "PASSED"}:
                    inline_interview_passed = True
                    break

        if self.instance:
            self.instance._inline_interview_passed = inline_interview_passed
            self.instance._admin_saving = True

        interview_satisfied = bool(
            course
            and (
                not course.requires_interview
                or (interview and interview.status == PreScreeningInterview.Status.PASSED)
                or inline_interview_passed
            )
        )

        role_blockers = []
        student_user = getattr(student, "user", None) if student else None
        if student_user and getattr(student_user, "uses_reserved_staff_email", False):
            role_blockers.append("a non-staff student email")
        if course and not interview_satisfied:
            role_blockers.append("passed required interview")

        if role_status == Application.RoleVerificationStatus.VERIFIED and role_blockers:
            self.add_error(
                "role_verification_status",
                "Cannot verify the student role until these checks pass: " + ", ".join(role_blockers) + ".",
            )

        if cohort is None:
            return cleaned_data
        if course and cohort.course_id != course.id:
            self.add_error("assigned_cohort", "The cohort must belong to the application's course.")
            return cleaned_data
        enrolled = cohort.applications.exclude(
            status__in=[Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.REJECTED]
        ).exclude(pk=self.instance.pk).count()
        if enrolled >= cohort.max_students:
            self.add_error("assigned_cohort", "This cohort has reached its student capacity.")

        return cleaned_data


class PreScreeningInterviewAdminForm(forms.ModelForm):
    class Meta:
        model = PreScreeningInterview
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        status_value = cleaned_data.get("status")
        scheduled_at = cleaned_data.get("scheduled_at")
        end_time = cleaned_data.get("end_time")
        application = cleaned_data.get("application") or getattr(self.instance, "application", None)
        course = getattr(application, "course", None) if application else None
        if course and not getattr(course, "requires_interview", True):
            self.add_error("application", "This course is configured to skip the candidate interview.")
        if scheduled_at and end_time and end_time <= scheduled_at:
            self.add_error("end_time", "Interview end time must be after the scheduled start time.")
        if status_value == PreScreeningInterview.Status.RESCHEDULED:
            previous = None
            if self.instance.pk:
                previous = PreScreeningInterview.objects.filter(pk=self.instance.pk).values(
                    "status", "scheduled_at"
                ).first()
            if not scheduled_at or (
                previous
                and previous["status"] != PreScreeningInterview.Status.RESCHEDULED
                and previous["scheduled_at"] == scheduled_at
            ):
                self.add_error(
                    "scheduled_at",
                    "Choose a new interview date and time when status is Rescheduled.",
                )
        return cleaned_data


class PreScreeningAdminForm(forms.ModelForm):
    question_bank = forms.ModelChoiceField(
        queryset=QuestionBank.objects.none(),
        required=False,
        help_text="Approved question bank for the course. If unassigned, one will be auto-generated/reused without duplicates upon save.",
    )
    paper_set = forms.ChoiceField(
        choices=(
            ("", "Select a paper set"),
            ("A", "Paper A"),
            ("B", "Paper B"),
            ("C", "Paper C"),
            ("D", "Paper D"),
        ),
        required=False,
    )

    class Meta:
        model = PreScreening
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        application = getattr(self.instance, "application", None)
        if not application and getattr(self.instance, "application_id", None):
            application = Application.objects.filter(pk=self.instance.application_id).select_related("course", "assigned_cohort").first()
        application_id = self.data.get("application") if self.is_bound else None
        if not application_id and "initial" in kwargs and "application" in kwargs["initial"]:
            application_id = kwargs["initial"]["application"]
        if not application_id and "application" in self.initial:
            application_id = self.initial["application"]

        if application_id and (not application or str(application.pk) != str(application_id)):
            application = Application.objects.filter(pk=application_id).select_related("course", "assigned_cohort").first()

        banks = QuestionBank.objects.none()
        if application and getattr(application, "course_id", None):
            try:
                banks = QuestionBank.objects.filter(
                    course=application.course,
                    bank_type=QuestionBank.BankType.PRESCREENING,
                    is_active=True,
                ).exclude(lifecycle_status=QuestionBank.LifecycleStatus.CLOSED).order_by("title")
            except Exception:
                banks = QuestionBank.objects.none()

            if not banks.exists():
                try:
                    from question_bank.auto_generate import auto_generate_prescreening_bank
                    auto_generate_prescreening_bank(application.course_id)
                    banks = QuestionBank.objects.filter(
                        course=application.course,
                        bank_type=QuestionBank.BankType.PRESCREENING,
                        is_active=True,
                    ).exclude(lifecycle_status=QuestionBank.LifecycleStatus.CLOSED).order_by("title")
                except Exception:
                    banks = QuestionBank.objects.none()
        else:
            # When application is not yet selected on unbound GET, provide all active pre-screening banks
            # so the queryset is valid and choices dynamically populated by JavaScript can be validated cleanly
            banks = QuestionBank.objects.filter(
                bank_type=QuestionBank.BankType.PRESCREENING,
                is_active=True,
            ).exclude(lifecycle_status=QuestionBank.LifecycleStatus.CLOSED).order_by("title")

        # Guarantee any submitted or existing bank_id is within the queryset for validation
        bank_id = self.data.get("question_bank") if self.is_bound else getattr(self.instance, "question_bank_id", None)
        if bank_id and not banks.filter(pk=bank_id).exists():
            banks = banks | QuestionBank.objects.filter(pk=bank_id)

        self.fields["question_bank"].queryset = banks
        if not application and not self.is_bound:
            self.fields["question_bank"].empty_label = "-- Select an Application to Load Banks --"
        elif banks.exists():
            self.fields["question_bank"].empty_label = "-- Select Question Bank --"
        else:
            self.fields["question_bank"].empty_label = "-- No Question Bank Found --"

        if application and not self.is_bound and not getattr(self.instance, "meeting_link", None):
            try:
                from applications.services.google_meet_screening import find_existing_cohort_screening_meeting_link
                existing_link = find_existing_cohort_screening_meeting_link(
                    course=getattr(application, "course", None),
                    cohort=getattr(application, "assigned_cohort", None),
                )
                if existing_link:
                    self.fields["meeting_link"].initial = existing_link
                    self.initial["meeting_link"] = existing_link
            except Exception:
                pass

        bank = None
        if bank_id:
            try:
                bank = QuestionBank.objects.filter(pk=bank_id).first()
            except Exception:
                bank = None
        elif not self.is_bound and banks.exists():
            approved = banks.filter(status=QuestionBank.Status.APPROVED).first() or banks.first()
            bank = approved
            if bank:
                self.fields["question_bank"].initial = bank.pk
                self.initial["question_bank"] = bank.pk

        choices = [("", "Select a paper set")]
        all_sets = ["A", "B", "C", "D"]
        if bank and bank.set_codes:
            all_sets = list(dict.fromkeys(bank.set_codes + all_sets))
        selected_paper = (self.data.get("paper_set") if self.is_bound else getattr(self.instance, "paper_set", "")) or ""
        if selected_paper and str(selected_paper) not in all_sets:
            all_sets.append(str(selected_paper))

        choices.extend((code, f"Paper {code}") for code in all_sets)
        if not self.is_bound and not getattr(self.instance, "paper_set", ""):
            default_paper = all_sets[0] if all_sets else "A"
            self.fields["paper_set"].initial = default_paper
            self.initial["paper_set"] = default_paper
        self.fields["paper_set"].choices = choices

    def clean(self):
        cleaned_data = super().clean()
        status_value = cleaned_data.get("status")
        scheduled_at = cleaned_data.get("scheduled_at")
        end_time = cleaned_data.get("end_time")
        application = cleaned_data.get("application") or getattr(self.instance, "application", None)
        question_bank = cleaned_data.get("question_bank")
        paper_set = (cleaned_data.get("paper_set") or "").upper()
        if scheduled_at and end_time and end_time <= scheduled_at:
            self.add_error("end_time", "Exam end time must be after the scheduled start time.")
        if not self.instance.pk and status_value == PreScreening.Status.RESCHEDULED:
            self.add_error("status", "Create the exam schedule first, then reschedule it if needed.")
        if status_value == PreScreening.Status.SCHEDULED and not scheduled_at:
            self.add_error("scheduled_at", "Choose the pre-screen exam date and time.")

        if status_value in {PreScreening.Status.SCHEDULED, PreScreening.Status.RESCHEDULED}:
            if not question_bank and application and application.course_id:
                from question_bank.auto_generate import auto_generate_prescreening_bank
                bank = auto_generate_prescreening_bank(application.course_id)
                if bank:
                    question_bank = bank
                    cleaned_data["question_bank"] = bank
                    if not paper_set:
                        paper_set = bank.set_codes[0] if bank.set_codes else "A"
                        cleaned_data["paper_set"] = paper_set

        if scheduled_at and end_time and not cleaned_data.get("meeting_link") and application:
            from applications.services.google_meet_screening import resolve_or_create_prescreening_google_meet
            temp_ps = self.instance or PreScreening(application=application)
            temp_ps.application = application
            temp_ps.scheduled_at = scheduled_at
            temp_ps.end_time = end_time
            meet_link = resolve_or_create_prescreening_google_meet(temp_ps, sync_cohort_students=False)
            if meet_link:
                cleaned_data["meeting_link"] = meet_link

            if not question_bank:
                self.add_error("question_bank", "Select or generate the question bank for this scheduled exam.")
            if not paper_set:
                paper_set = "A"
                cleaned_data["paper_set"] = paper_set

        if question_bank:
            if application and question_bank.course_id != application.course_id:
                self.add_error("question_bank", "The question bank must belong to the application's course.")
            if (
                question_bank.bank_type != QuestionBank.BankType.PRESCREENING
                or not question_bank.is_active
                or question_bank.lifecycle_status == QuestionBank.LifecycleStatus.CLOSED
            ):
                self.add_error("question_bank", "Select an active pre-screening question bank.")
            bank_sets = getattr(question_bank, "set_codes", [])
            if paper_set and bank_sets and paper_set not in bank_sets:
                self.add_error("paper_set", "The selected paper does not exist in this question bank.")
        cleaned_data["paper_set"] = paper_set
        if status_value == PreScreening.Status.RESCHEDULED:
            previous = None
            if self.instance.pk:
                previous = PreScreening.objects.filter(pk=self.instance.pk).values(
                    "status", "scheduled_at"
                ).first()
            if not scheduled_at or (
                previous
                and previous["status"] != PreScreening.Status.RESCHEDULED
                and previous["scheduled_at"] == scheduled_at
            ):
                self.add_error(
                    "scheduled_at",
                    "Choose a new screening exam date and time when status is Rescheduled.",
                )
        return cleaned_data


def export_applications_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_applications.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Application Number", "Student Code", "Student Email", "Course",
        "Status", "Qualified", "Qualification Score", "Assigned Cohort",
        "Applied At", "Completed Course", "Final Score"
    ])

    for app in queryset.select_related("student", "student__user", "course", "assigned_cohort"):
        writer.writerow([
            app.application_number,
            app.student.student_code if app.student else "",
            app.student.user.email if (app.student and app.student.user) else "",
            app.course.name if app.course else "",
            app.status,
            "Yes" if app.qualified else ("No" if app.qualified is False else "Pending"),
            app.qualification_score or "",
            app.assigned_cohort.code if app.assigned_cohort else "",
            app.applied_at.strftime("%Y-%m-%d %H:%M") if app.applied_at else "",
            "Yes" if app.completed_course else "No",
            app.final_score or "",
        ])

    return response


export_applications_to_csv.short_description = "Export selected applications to CSV"


class PreScreeningInline(admin.StackedInline):
    model = PreScreening
    form = PreScreeningAdminForm
    # Show one empty schedule form for legacy applications that do not yet have
    # the OneToOne PreScreening row.
    extra = 1
    max_num = 1


class ExamInline(admin.StackedInline):
    model = Exam
    extra = 0
    max_num = 1
    fields = (
        "level", "duration_minutes", "pass_percentage", "status",
        "started_at", "submitted_at", "marks_obtained", "total_marks", "percentage", "qualified",
    )


class PreScreeningInterviewInline(admin.StackedInline):
    model = PreScreeningInterview
    form = PreScreeningInterviewAdminForm
    extra = 0
    max_num = 1
    fields = ("interviewer", "scheduled_at", "end_time", "meeting_link", "status", "score", "feedback")

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "interviewer":
            from accounts.models import User

            kwargs["queryset"] = User.objects.filter(
                role__in=[User.Role.MENTOR, User.Role.ADMIN], is_active=True
            ).order_by("email")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class CommunityActivityInline(admin.TabularInline):
    model = CommunityActivity
    extra = 0
    fields = ("activity_type", "title", "activity_date", "status", "verified_by", "verified_at")
    readonly_fields = ("verified_by", "verified_at")


@admin.register(PreScreening)
class PreScreeningAdmin(admin.ModelAdmin):
    form = PreScreeningAdminForm
    change_list_template = "admin/applications/prescreening/change_list.html"
    change_form_template = "admin/applications/prescreening/change_form.html"

    def get_changeform_initial_data(self, request):
        initial = super().get_changeform_initial_data(request)
        if "application" in request.GET:
            initial["application"] = request.GET["application"]
        return initial
    list_display = (
        "application",
        "get_course",
        "get_cohort",
        "status",
        "is_released",
        "question_bank",
        "paper_set",
        "scheduled_at",
        "end_time",
        "interviewer",
        "updated_at",
    )
    list_filter = (
        "application__course",
        "application__assigned_cohort",
        "is_released",
        "status",
        "paper_set",
        "scheduled_at",
    )
    search_fields = (
        "application__application_number",
        "application__student__student_code",
        "application__student__user__email",
        "application__course__name",
        "application__assigned_cohort__code",
        "application__assigned_cohort__name",
        "interviewer",
    )
    autocomplete_fields = ("application",)
    list_select_related = (
        "application",
        "application__student",
        "application__student__user",
        "application__course",
        "application__assigned_cohort",
        "question_bank",
    )
    date_hierarchy = "scheduled_at"
    list_per_page = 50
    actions = [
        "bulk_schedule_selected_exams",
        "release_selected_exams",
        "lock_selected_exams",
        "reschedule_selected_exams_for_today",
        "generate_ai_question_bank_for_selected",
    ]

    @admin.display(description="Course", ordering="application__course__name")
    def get_course(self, obj):
        return obj.application.course.name if obj.application and obj.application.course else "-"

    @admin.display(description="Assigned Cohort", ordering="application__assigned_cohort__code")
    def get_cohort(self, obj):
        return obj.application.assigned_cohort.code if obj.application and obj.application.assigned_cohort else "-"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not request.GET.get("status"):
            qs = qs.exclude(
                Q(application__status__in=[Application.Status.DROPPED, Application.Status.CANCELLED]) |
                Q(status=PreScreening.Status.CANCELLED)
            )
        return qs

    @admin.action(description="📅 Bulk Schedule Selected Screening Exams")
    def bulk_schedule_selected_exams(self, request, queryset):
        if request.POST.get("apply"):
            start_val = request.POST.get("scheduled_at")
            end_val = request.POST.get("end_time")
            paper_set = (request.POST.get("paper_set") or "A").upper()
            meeting_link = request.POST.get("meeting_link") or ""
            is_released = bool(request.POST.get("is_released"))
            notify_candidates = bool(request.POST.get("notify_candidates"))

            scheduled_at = parse_datetime(start_val) if start_val else None
            end_time = parse_datetime(end_val) if end_val else None

            if not scheduled_at or not end_time:
                self.message_user(request, "Valid Start and End times are required.", messages.ERROR)
                return HttpResponseRedirect(request.get_full_path())

            if end_time <= scheduled_at:
                self.message_user(request, "Exam end time must be after the scheduled start time.", messages.ERROR)
                return HttpResponseRedirect(request.get_full_path())

            apps = Application.objects.filter(pre_screening__in=queryset).exclude(
                status__in=[
                    Application.Status.DROPPED,
                    Application.Status.CANCELLED,
                    Application.Status.REJECTED,
                    Application.Status.COMPLETED,
                ]
            ).select_related("student__user", "course", "assigned_cohort")
            result = bulk_schedule_applications(
                apps,
                scheduled_at=scheduled_at,
                end_time=end_time,
                paper_set=paper_set,
                meeting_link=meeting_link,
                is_released=is_released,
                notify_candidates=notify_candidates,
                actor=request.user,
            )

            self.message_user(
                request,
                f"Successfully bulk scheduled pre-screening exam for {result['scheduled']} candidate(s).",
                messages.SUCCESS,
            )
            return HttpResponseRedirect(request.get_full_path())

        now = timezone.now()
        initial_start = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        initial_end = initial_start + timedelta(hours=2)

        return TemplateResponse(
            request,
            "admin/applications/prescreening/bulk_schedule_selected_intermediate.html",
            {
                "title": "Bulk Schedule Selected Screening Exams",
                "selected_items": list(queryset),
                "action_name": "bulk_schedule_selected_exams",
                "initial_scheduled_at": initial_start.strftime("%Y-%m-%dT%H:%M"),
                "initial_end_time": initial_end.strftime("%Y-%m-%dT%H:%M"),
            },
        )

    @admin.action(description="🔄 Reschedule & Release Selected for Today (Quick Retake)")
    def reschedule_selected_exams_for_today(self, request, queryset):
        now = timezone.now()
        start = now
        end = now + timedelta(hours=2)
        count = 0
        for ps in queryset:
            ps.status = PreScreening.Status.RESCHEDULED
            ps.scheduled_at = start
            ps.end_time = end
            ps.is_released = True
            ps.save()
            publish_screening_schedule(ps, notification_key=f"reschedule-today:{ps.updated_at.isoformat()}")
            count += 1
        self.message_user(request, f"Rescheduled and released retake window (next 2 hours) for {count} candidate(s).", messages.SUCCESS)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "application-course-banks/",
                self.admin_site.admin_view(self.application_course_banks_api),
                name="prescreening-application-course-banks",
            ),
            path(
                "bulk-schedule-cohort/",
                self.admin_site.admin_view(self.bulk_schedule_cohort_view),
                name="prescreening-bulk-schedule-cohort",
            ),
            path(
                "bulk-schedule-count/",
                self.admin_site.admin_view(self.bulk_schedule_count_api),
                name="prescreening-bulk-schedule-count",
            ),
            path(
                "<path:object_id>/prepare-screening-bank/",
                self.admin_site.admin_view(self.prepare_screening_bank_view),
                name="prescreening-prepare-screening-bank",
            ),
        ]
        return custom_urls + urls

    def application_course_banks_api(self, request):
        if not self.has_view_permission(request):
            return JsonResponse({"success": False, "error": "Permission denied"}, status=403)

        app_id = request.GET.get("application_id")
        if not app_id:
            return JsonResponse({"success": False, "error": "Application ID is required"}, status=400)

        application = (
            Application.objects.filter(pk=app_id)
            .select_related("course", "assigned_cohort", "student__user")
            .first()
        )
        if not application:
            return JsonResponse({"success": False, "error": "Application not found"}, status=404)

        course = application.course
        if not course:
            return JsonResponse({"success": False, "error": "Application has no course assigned"}, status=400)

        banks = (
            QuestionBank.objects.filter(
                course=course,
                bank_type=QuestionBank.BankType.PRESCREENING,
                is_active=True,
            )
            .exclude(lifecycle_status=QuestionBank.LifecycleStatus.CLOSED)
            .order_by("title")
        )

        if not banks.exists():
            try:
                from question_bank.auto_generate import auto_generate_prescreening_bank
                auto_generate_prescreening_bank(course.id)
                banks = (
                    QuestionBank.objects.filter(
                        course=course,
                        bank_type=QuestionBank.BankType.PRESCREENING,
                        is_active=True,
                    )
                    .exclude(lifecycle_status=QuestionBank.LifecycleStatus.CLOSED)
                    .order_by("title")
                )
            except Exception:
                pass

        cohort = application.assigned_cohort
        meeting_link = ""
        if cohort and getattr(cohort, "meeting_link", None):
            meeting_link = cohort.meeting_link
        else:
            try:
                from applications.services.google_meet_screening import find_existing_cohort_screening_meeting_link
                meeting_link = find_existing_cohort_screening_meeting_link(course=course, cohort=cohort) or ""
            except Exception:
                pass

        suggested_time = None
        if cohort and getattr(cohort, "default_screening_at", None):
            suggested_time = cohort.default_screening_at
        elif getattr(course, "default_screening_at", None):
            suggested_time = course.default_screening_at

        suggested_end = (suggested_time + timedelta(hours=2)) if suggested_time else None

        banks_data = []
        for b in banks:
            sets = b.set_codes or ["A", "B", "C", "D"]
            total_q = getattr(b, "total_questions_per_set", 0) or len(getattr(b, "questions", []) or [])
            banks_data.append({
                "id": str(b.id),
                "title": f"[{b.status}] {b.title}",
                "status": b.status,
                "is_approved": b.status == QuestionBank.Status.APPROVED,
                "set_codes": sets,
                "total_questions": total_q,
            })

        student_user = getattr(getattr(application, "student", None), "user", None)
        student_display = (student_user.get_full_name().strip() or student_user.email) if student_user else (getattr(application.student, "student_code", "") or "Applicant")

        return JsonResponse({
            "success": True,
            "application_id": str(application.id),
            "application_number": application.application_number,
            "student_name": student_display,
            "course": {
                "id": str(course.id),
                "name": course.name,
                "code": course.code,
            },
            "cohort": {
                "id": str(cohort.id),
                "name": cohort.name,
                "code": cohort.code,
            } if cohort else None,
            "meeting_link": meeting_link,
            "suggested_scheduled_at": suggested_time.strftime("%Y-%m-%dT%H:%M") if suggested_time else "",
            "suggested_end_time": suggested_end.strftime("%Y-%m-%dT%H:%M") if suggested_end else "",
            "banks": banks_data,
        })

    def bulk_schedule_count_api(self, request):
        if not self.has_view_permission(request):
            return JsonResponse({"error": "Permission denied"}, status=403)

        course_id = request.GET.get("course_id")
        cohort_id = request.GET.get("cohort_id")
        statuses_param = request.GET.get("statuses", "")
        override_existing = request.GET.get("override_existing") == "1"
        statuses = [s.strip() for s in statuses_param.split(",") if s.strip()]

        if not course_id and cohort_id:
            cohort_obj = Cohort.objects.filter(id=cohort_id).first()
            if cohort_obj:
                course_id = str(cohort_obj.course_id)

        if not course_id and not cohort_id:
            return JsonResponse({"count": 0})

        qs = Application.objects.exclude(
            status__in=[
                Application.Status.DROPPED,
                Application.Status.CANCELLED,
                Application.Status.REJECTED,
                Application.Status.COMPLETED,
            ]
        )
        if course_id:
            qs = qs.filter(course_id=course_id)

        if cohort_id:
            cohort_obj = Cohort.objects.filter(id=cohort_id).first()
            if cohort_obj:
                qs = qs.filter(
                    models.Q(assigned_cohort_id=cohort_id)
                    | (models.Q(course_id=cohort_obj.course_id) & models.Q(assigned_cohort__isnull=True))
                )
            else:
                qs = qs.filter(assigned_cohort_id=cohort_id)

        if not statuses:
            statuses = [Application.Status.APPLIED]

        status_q = models.Q()
        for s in statuses:
            if s == "RESCHEDULED":
                status_q |= models.Q(pre_screening__status=PreScreening.Status.RESCHEDULED)
            elif s == Application.Status.EXAM_PENDING:
                status_q |= models.Q(status=Application.Status.EXAM_PENDING)
            elif hasattr(Application.Status, s):
                status_q |= models.Q(status=s)

        if not override_existing:
            # Selecting EXAM_PENDING/RESCHEDULED is a filter, not permission to
            # overwrite an existing schedule. The explicit override control is
            # the only operation that may replace an already assigned slot.
            qs = qs.filter(pre_screening__isnull=True)

        if status_q:
            qs = qs.filter(status_q)

        return JsonResponse({"count": qs.count()})

    def bulk_schedule_cohort_view(self, request):
        if not self.has_change_permission(request):
            raise PermissionDenied

        if request.method == "POST":
            course_id = request.POST.get("course")
            cohort_id = request.POST.get("cohort")
            statuses = request.POST.getlist("statuses")
            override_existing = bool(request.POST.get("override_existing_schedules"))
            start_val = request.POST.get("scheduled_at")
            end_val = request.POST.get("end_time")
            qb_id = request.POST.get("question_bank")
            paper_set = (request.POST.get("paper_set") or "A").upper()
            meeting_link = request.POST.get("meeting_link") or ""
            is_released = bool(request.POST.get("is_released"))
            notify_candidates = bool(request.POST.get("notify_candidates"))

            if not course_id and cohort_id:
                cohort_obj = Cohort.objects.filter(id=cohort_id).select_related("course").first()
                if cohort_obj:
                    course_id = str(cohort_obj.course_id)

            if not course_id or not start_val or not end_val:
                self.message_user(request, "Cohort (or Course), Start Date/Time, and End Date/Time are required.", messages.ERROR)
                return HttpResponseRedirect(reverse("admin:prescreening-bulk-schedule-cohort"))

            scheduled_at = parse_datetime(start_val)
            end_time = parse_datetime(end_val)

            if not scheduled_at or not end_time:
                self.message_user(request, "Invalid date/time format submitted.", messages.ERROR)
                return HttpResponseRedirect(reverse("admin:prescreening-bulk-schedule-cohort"))

            if end_time <= scheduled_at:
                self.message_user(request, "Exam end time must be after the scheduled start time.", messages.ERROR)
                return HttpResponseRedirect(reverse("admin:prescreening-bulk-schedule-cohort"))

            target_statuses = statuses or [Application.Status.APPLIED]

            apps = Application.objects.exclude(
                status__in=[
                    Application.Status.DROPPED,
                    Application.Status.CANCELLED,
                    Application.Status.REJECTED,
                    Application.Status.COMPLETED,
                ]
            )
            if course_id:
                apps = apps.filter(course_id=course_id)

            cohort_obj = None
            if cohort_id:
                cohort_obj = Cohort.objects.filter(id=cohort_id).first()
                if cohort_obj:
                    apps = apps.filter(
                        models.Q(assigned_cohort_id=cohort_id)
                        | (models.Q(course_id=cohort_obj.course_id) & models.Q(assigned_cohort__isnull=True))
                    )
                else:
                    apps = apps.filter(assigned_cohort_id=cohort_id)

            status_q = models.Q()
            for s in target_statuses:
                if s == "RESCHEDULED":
                    status_q |= models.Q(pre_screening__status=PreScreening.Status.RESCHEDULED)
                elif s == Application.Status.EXAM_PENDING:
                    status_q |= models.Q(status=Application.Status.EXAM_PENDING)
                elif hasattr(Application.Status, s):
                    status_q |= models.Q(status=s)

            if not override_existing:
                apps = apps.filter(pre_screening__isnull=True)

            if status_q:
                apps = apps.filter(status_q)

            # Auto-fallback to Cohort master meeting link if not supplied
            if not meeting_link and cohort_obj and cohort_obj.meeting_link:
                meeting_link = cohort_obj.meeting_link

            # Auto-bind unassigned applications to selected cohort
            if cohort_obj:
                unassigned_app_ids = list(apps.filter(assigned_cohort__isnull=True).values_list("id", flat=True))
                if unassigned_app_ids:
                    Application.objects.filter(id__in=unassigned_app_ids).update(
                        assigned_cohort=cohort_obj, updated_at=timezone.now()
                    )
                if cohort_obj and cohort_obj.meeting_link:
                    meeting_link = cohort_obj.meeting_link

            question_bank = QuestionBank.objects.filter(id=qb_id).first() if qb_id else None

            result = bulk_schedule_applications(
                apps,
                scheduled_at=scheduled_at,
                end_time=end_time,
                question_bank=question_bank,
                paper_set=paper_set,
                meeting_link=meeting_link,
                is_released=is_released,
                notify_candidates=notify_candidates,
                actor=request.user,
            )

            course = Course.objects.filter(id=course_id).first()
            cohort = Cohort.objects.filter(id=cohort_id).first() if cohort_id else None
            scope_desc = f"course '{course.name}'" if course else "selected course"
            if cohort:
                scope_desc += f" (Cohort: {cohort.code})"

            self.message_user(
                request,
                f"⚡ Successfully bulk scheduled pre-screening exam for {result['scheduled']} candidate(s) in {scope_desc}.",
                messages.SUCCESS,
            )
            return HttpResponseRedirect(reverse("admin:applications_prescreening_changelist"))

        now = timezone.now()
        initial_start = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        initial_end = initial_start + timedelta(hours=2)

        courses = Course.objects.filter(status=Course.Status.PUBLISHED).order_by("name")
        cohorts = Cohort.objects.filter(
            status=Cohort.Status.OPEN
        ).select_related("course").order_by("course__name", "code")
        question_banks = QuestionBank.objects.filter(
            bank_type=QuestionBank.BankType.PRESCREENING, is_active=True
        ).order_by("title")

        context = {
            "title": "⚡ Bulk Schedule Screening Exams by Course & Cohort",
            "courses": courses,
            "cohorts": cohorts,
            "question_banks": question_banks,
            "initial_scheduled_at": initial_start.strftime("%Y-%m-%dT%H:%M"),
            "initial_end_time": initial_end.strftime("%Y-%m-%dT%H:%M"),
            "selected_course_id": request.GET.get("course_id", ""),
            "selected_cohort_id": request.GET.get("cohort_id", ""),
        }
        return TemplateResponse(request, "admin/applications/prescreening/bulk_schedule_cohort.html", context)

    def prepare_screening_bank_view(self, request, object_id):
        ps = self.get_object(request, object_id)
        change_url = reverse("admin:applications_prescreening_change", args=[object_id])
        if not ps or not ps.application or not ps.application.course:
            self.message_user(request, "Screening schedule or application course not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_prescreening_changelist"))
        if not self.has_change_permission(request, ps):
            raise PermissionDenied

        from question_bank.auto_generate import auto_generate_prescreening_bank
        bank = auto_generate_prescreening_bank(ps.application.course_id)
        if not bank:
            self.message_user(
                request,
                "The AI Question Bank could not be prepared. Check the course prerequisites and AI worker configuration.",
                messages.ERROR,
            )
            return HttpResponseRedirect(change_url)

        ps.question_bank = bank
        if bank.set_codes and not ps.paper_set:
            ps.paper_set = bank.set_codes[0]
        ps.save(update_fields=["question_bank", "paper_set", "updated_at"])

        if bank.status == QuestionBank.Status.APPROVED and bank.sets_data:
            self.message_user(
                request,
                f"Question Bank '{bank.title}' verified and attached to this screening schedule.",
                messages.SUCCESS,
            )
        else:
            self.message_user(
                request,
                f"AI Question Bank generation dispatched for {ps.application.course.name} (Bank: {bank.title}).",
                messages.INFO,
            )
        return HttpResponseRedirect(change_url)

    @admin.action(description="⚡ Trigger On-Spot AI Question Bank Generation")
    def generate_ai_question_bank_for_selected(self, request, queryset):
        from question_bank.auto_generate import auto_generate_prescreening_bank
        generated_courses = set()
        for ps in queryset:
            course = ps.application.course if ps.application else None
            if course and course.id not in generated_courses:
                bank = auto_generate_prescreening_bank(course.id)
                if bank:
                    ps.question_bank = bank
                    if bank.set_codes:
                        ps.paper_set = bank.set_codes[0]
                    ps.save(update_fields=["question_bank", "paper_set", "updated_at"])
                generated_courses.add(course.id)
        self.message_user(request, f"AI Question Bank generation dispatched for {len(generated_courses)} course(s).", messages.SUCCESS)

    @admin.action(description="🚀 Release selected pre-screening exams (Unlock Gate)")
    def release_selected_exams(self, request, queryset):
        updated = queryset.update(is_released=True, updated_at=timezone.now())
        self.message_user(request, f"Released examination gate for {updated} pre-screening schedule(s).", messages.SUCCESS)

    @admin.action(description="🔒 Lock selected pre-screening exams (Lock Gate)")
    def lock_selected_exams(self, request, queryset):
        updated = queryset.update(is_released=False, updated_at=timezone.now())
        self.message_user(request, f"Locked examination gate for {updated} pre-screening schedule(s).", messages.WARNING)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        publish_screening_schedule(
            obj,
            notification_key=f"admin:{obj.updated_at.isoformat()}",
        )


@admin.register(PreScreeningInterview)
class PreScreeningInterviewAdmin(admin.ModelAdmin):
    form = PreScreeningInterviewAdminForm
    list_display = ("application", "status", "score", "scheduled_at", "end_time", "interviewer", "updated_at")
    list_filter = ("status", "scheduled_at")
    search_fields = (
        "application__application_number",
        "application__student__student_code",
        "application__student__user__email",
        "application__course__name",
        "interviewer__email",
    )
    autocomplete_fields = ("application", "interviewer")
    list_select_related = (
        "application",
        "application__student",
        "application__student__user",
        "application__course",
        "interviewer",
    )
    date_hierarchy = "scheduled_at"
    list_per_page = 50

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        application = obj.application
        CLOSED_APPLICATION_STATUSES = {
            Application.Status.REJECTED,
            Application.Status.DROPPED,
            Application.Status.CANCELLED,
            Application.Status.COMPLETED,
        }
        if application.status not in CLOSED_APPLICATION_STATUSES:
            from applications.services.state_machine import transition_application_status
            if obj.status in {PreScreeningInterview.Status.SCHEDULED, PreScreeningInterview.Status.RESCHEDULED}:
                try:
                    transition_application_status(
                        application,
                        Application.Status.PRESCREENING_PENDING,
                        user=request.user,
                        reason="PreScreening interview scheduled via Django Admin",
                    )
                except Exception:
                    pass
            elif obj.status in {PreScreeningInterview.Status.PASSED, PreScreeningInterview.Status.COMPLETED}:
                try:
                    transition_application_status(
                        application,
                        Application.Status.PRESCREENING_COMPLETED,
                        user=request.user,
                        reason="PreScreening interview passed via Django Admin",
                    )
                except Exception:
                    pass

        course = getattr(application, "course", None) if application else None
        if course and getattr(course, "requires_interview", True):
            schedule = (
                timezone.localtime(obj.scheduled_at).strftime("%d %b %Y, %I:%M %p")
                if getattr(obj, "scheduled_at", None) else "to be confirmed"
            )
            student_user = getattr(getattr(application, "student", None), "user", None)
            if student_user:
                notify_user(
                    student_user,
                    title=(
                        "Interview rescheduled"
                        if obj.status == PreScreeningInterview.Status.RESCHEDULED
                        else "Interview status updated"
                    ),
                    message=(
                        f"Your candidate interview for {course.name} is "
                        f"{obj.get_status_display()}. Date and time: {schedule}."
                    ),
                    notification_type=(
                        Notification.Type.ACTION_REQUIRED
                        if obj.status in {
                            PreScreeningInterview.Status.SCHEDULED,
                            PreScreeningInterview.Status.RESCHEDULED,
                        }
                        else Notification.Type.INFO
                    ),
                    action_url="application_tracker",
                    dedupe_key=f"interview:{obj.id}:admin:{obj.updated_at}",
                )


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    form = ApplicationAdminForm
    list_display = (
        "application_number",
        "student",
        "course",
        "status",
        "current_module",
        "exam_percentage",
        "interview_status",
        "qualified",
        "student_role_verified",
        "assigned_cohort",
    )
    search_fields = ("application_number", "student__student_code", "student__user__email", "course__name")
    list_filter = ("status", "role_verification_status", "qualified", "course")
    actions = [
        export_applications_to_csv,
        "bulk_schedule_selected_applications",
        "verify_selected_student_roles",
        "suspend_selected_applications",
        "unsuspend_selected_applications",
        "release_selected_screening_exams",
        "lock_selected_screening_exams",
        "generate_ai_question_bank_for_selected",
    ]

    @admin.action(description="📅 Bulk Schedule Pre-Screening Exam for Selected Applications")
    def bulk_schedule_selected_applications(self, request, queryset):
        if request.POST.get("apply"):
            start_val = request.POST.get("scheduled_at")
            end_val = request.POST.get("end_time")
            paper_set = (request.POST.get("paper_set") or "A").upper()
            meeting_link = request.POST.get("meeting_link") or ""
            is_released = bool(request.POST.get("is_released"))
            notify_candidates = bool(request.POST.get("notify_candidates"))

            scheduled_at = parse_datetime(start_val) if start_val else None
            end_time = parse_datetime(end_val) if end_val else None

            if not scheduled_at or not end_time:
                self.message_user(request, "Valid Start and End times are required.", messages.ERROR)
                return HttpResponseRedirect(request.get_full_path())

            if end_time <= scheduled_at:
                self.message_user(request, "Exam end time must be after the scheduled start time.", messages.ERROR)
                return HttpResponseRedirect(request.get_full_path())

            result = bulk_schedule_applications(
                queryset,
                scheduled_at=scheduled_at,
                end_time=end_time,
                paper_set=paper_set,
                meeting_link=meeting_link,
                is_released=is_released,
                notify_candidates=notify_candidates,
                actor=request.user,
            )

            self.message_user(
                request,
                f"Successfully bulk scheduled pre-screening exam for {result['scheduled']} application(s).",
                messages.SUCCESS,
            )
            return HttpResponseRedirect(request.get_full_path())

        now = timezone.now()
        initial_start = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        initial_end = initial_start + timedelta(hours=2)

        return TemplateResponse(
            request,
            "admin/applications/prescreening/bulk_schedule_selected_intermediate.html",
            {
                "title": "Bulk Schedule Pre-Screening for Selected Applications",
                "selected_items": list(queryset),
                "action_name": "bulk_schedule_selected_applications",
                "initial_scheduled_at": initial_start.strftime("%Y-%m-%dT%H:%M"),
                "initial_end_time": initial_end.strftime("%Y-%m-%dT%H:%M"),
            },
        )
    inlines = (PreScreeningInline, ExamInline, PreScreeningInterviewInline, CommunityActivityInline)
    list_select_related = ("student", "student__user", "course", "assigned_cohort", "assigned_cohort__current_module")
    readonly_fields = (
        "cohort_management_actions",
        "current_module",
        "screening_marks",
        "interview_result",
        "student_role_verification",
        "role_verified_by",
        "role_verified_at",
        "journey_progress",
        "journey_blockers",
        "applied_at",
        "required_meet_display_name",
        "required_meet_display_name_normalized",
        "offer_letter_download",
    )
    fieldsets = (
        ("Application", {"fields": ("application_number", "student", "course", "status", "applied_at")} ),
        ("Screening Exam", {"fields": ("screening_marks", "qualified", "qualification_score")} ),
        ("Interview & Role Verification", {"fields": (
            "interview_result",
            "student_role_verification",
            "role_verification_status",
            "role_verified_by",
            "role_verified_at",
            "role_verification_remarks",
        )} ),
        ("Cohort & Suspension Management", {"fields": (
            "cohort_management_actions",
            "assigned_cohort",
            "current_module",
            "journey_progress",
            "journey_blockers",
        )} ),
        ("Google Meet Identity", {"fields": (
            "required_meet_display_name",
            "required_meet_display_name_normalized",
        )} ),
        ("Course Completion", {"fields": ("completed_course", "completed_at", "final_score")} ),
        ("Offer Letter", {"fields": (
            "offer_letter_download",
            "offer_letter_file",
            "offer_letter_issued",
            "offer_letter_issued_at",
            "offer_letter_hash",
        )} ),
        ("Remarks", {"fields": ("remarks",)} ),
    )

    @admin.action(description="🚀 Release screening exam for selected applications")
    def release_selected_screening_exams(self, request, queryset):
        updated = 0
        for app in queryset:
            ps, _ = PreScreening.objects.get_or_create(application=app)
            ps.is_released = True
            ps.save(update_fields=["is_released", "updated_at"])
            publish_screening_schedule(ps, notification_key=f"app-release:{ps.updated_at.isoformat()}")
            updated += 1
        self.message_user(request, f"Released screening examination gate for {updated} application(s).", messages.SUCCESS)

    @admin.action(description="🔒 Lock screening exam for selected applications")
    def lock_selected_screening_exams(self, request, queryset):
        updated = PreScreening.objects.filter(application__in=queryset).update(is_released=False, updated_at=timezone.now())
        self.message_user(request, f"Locked screening examination gate for {updated} schedule(s).", messages.WARNING)

    @admin.action(description="⚡ Trigger On-Spot AI Question Bank Generation")
    def generate_ai_question_bank_for_selected(self, request, queryset):
        from question_bank.auto_generate import auto_generate_prescreening_bank
        generated_courses = set()
        for app in queryset:
            course = app.course
            if course and course.id not in generated_courses:
                bank = auto_generate_prescreening_bank(course.id)
                if bank:
                    ps, _ = PreScreening.objects.get_or_create(application=app)
                    ps.question_bank = bank
                    if bank.set_codes:
                        ps.paper_set = bank.set_codes[0]
                    ps.save(update_fields=["question_bank", "paper_set", "updated_at"])
                generated_courses.add(course.id)
        self.message_user(request, f"AI Question Bank generation dispatched for {len(generated_courses)} course(s).", messages.SUCCESS)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "student":
            from accounts.models import User
            from students.models import StudentProfile
            kwargs["queryset"] = StudentProfile.objects.filter(
                user__role=User.Role.STUDENT
            ).exclude(
                user__email__iendswith="@suretrust.local"
            ).select_related("user")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<path:object_id>/download-offer-letter-admin/",
                self.admin_site.admin_view(self.download_offer_letter_admin_view),
                name="application-offer-letter-download",
            ),
            path(
                "<path:object_id>/dropout-admin/",
                self.admin_site.admin_view(self.dropout_admin_view),
                name="application-dropout-admin",
            ),
            path(
                "<path:object_id>/unsuspend-admin/",
                self.admin_site.admin_view(self.unsuspend_admin_view),
                name="application-unsuspend-admin",
            ),
            path(
                "<path:object_id>/suspend-admin/",
                self.admin_site.admin_view(self.suspend_admin_view),
                name="application-suspend-admin",
            ),
            path(
                "<path:object_id>/transfer-cohort-admin/",
                self.admin_site.admin_view(self.transfer_cohort_admin_view),
                name="application-transfer-cohort-admin",
            ),
            path(
                "<path:object_id>/prepare-screening-bank/",
                self.admin_site.admin_view(self.prepare_screening_bank_view),
                name="application-prepare-screening-bank",
            ),
            path(
                "<path:object_id>/advance-module-admin/",
                self.admin_site.admin_view(self.advance_module_admin_view),
                name="application-advance-module-admin",
            ),
        ]
        return custom_urls + urls

    @admin.display(description="Current offer letter")
    def offer_letter_download(self, obj):
        if not obj or not obj.pk or not obj.offer_letter_file:
            return "No offer letter file is stored."

        try:
            exists = obj.offer_letter_file.storage.exists(obj.offer_letter_file.name)
        except OSError:
            logger.warning("Unable to inspect offer letter storage for application id=%s", obj.pk)
            exists = False

        if not exists:
            return "The database references an offer letter, but the file is missing from storage."

        url = reverse("admin:application-offer-letter-download", args=[obj.pk])
        return format_html('<a class="button" href="{}">Download current offer letter</a>', url)

    def download_offer_letter_admin_view(self, request, object_id):
        application = self.get_object(request, object_id)
        if application is None:
            raise Http404("Offer letter not found.")
        if not self.has_view_or_change_permission(request, application):
            raise PermissionDenied
        if not application.offer_letter_file:
            raise Http404("Offer letter not found.")

        storage = application.offer_letter_file.storage
        storage_name = application.offer_letter_file.name
        try:
            if not storage.exists(storage_name):
                raise Http404("Offer letter not found.")
            file_handle = storage.open(storage_name, "rb")
        except Http404:
            raise
        except (FileNotFoundError, OSError):
            logger.warning("Unable to open offer letter for application id=%s", application.pk)
            raise Http404("Offer letter not found.") from None

        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=f"offer_letter_{application.application_number}.pdf",
            content_type="application/pdf",
        )
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
        response["Pragma"] = "no-cache"
        response["Expires"] = "0"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def advance_module_admin_view(self, request, object_id):
        app = self.get_object(request, object_id)
        change_url = reverse("admin:applications_application_change", args=[object_id])
        if not app:
            self.message_user(request, "Application not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_application_changelist"))
        if not self.has_change_permission(request, app):
            raise PermissionDenied
        cohort = getattr(app, "assigned_cohort", None)
        if not cohort:
            self.message_user(request, "No cohort is assigned to this application.", messages.WARNING)
            return HttpResponseRedirect(change_url)
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
        return HttpResponseRedirect(change_url)

    def prepare_screening_bank_view(self, request, object_id):
        app = self.get_object(request, object_id)
        change_url = reverse("admin:applications_application_change", args=[object_id])
        if not app:
            self.message_user(request, "Application not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_application_changelist"))
        if not self.has_change_permission(request, app):
            raise PermissionDenied
        if request.method != "POST":
            self.message_user(
                request,
                "Use the Prepare/reuse AI screening bank button to start generation.",
                messages.WARNING,
            )
            return HttpResponseRedirect(change_url)

        from question_bank.auto_generate import auto_generate_prescreening_bank

        bank = auto_generate_prescreening_bank(app.course_id)
        if not bank:
            self.message_user(
                request,
                "The AI Question Bank could not be prepared. Check the course prerequisites and AI worker configuration.",
                messages.ERROR,
            )
            return HttpResponseRedirect(change_url)

        bank_url = reverse("admin:question_bank_questionbank_change", args=[bank.pk])
        if (
            bank.status == QuestionBank.Status.APPROVED
            and bank.sets_data
            and bank.lifecycle_status == QuestionBank.LifecycleStatus.OPEN
            and bank.is_active
        ):
            self.message_user(
                request,
                "An approved, open screening bank already exists. It will now appear in the schedule form.",
                messages.SUCCESS,
            )
            return HttpResponseRedirect(change_url)
        if bank.status == QuestionBank.Status.APPROVED and bank.sets_data:
            self.message_user(
                request,
                "The verified papers are ready. Review them and click Publish verified papers; then return to this application to schedule the exam.",
                messages.SUCCESS,
            )
            return HttpResponseRedirect(bank_url)

        self.message_user(
            request,
            "AI generation has started or is already running for this course. No duplicate job was created. Refresh this Question Bank until it is Approved, then publish it.",
            messages.SUCCESS,
        )
        return HttpResponseRedirect(bank_url)

    def response_change(self, request, obj):
        if obj.status == Application.Status.TRANSFER_COHORT:
            return HttpResponseRedirect(reverse("admin:application-transfer-cohort-admin", args=[obj.pk]))
        return super().response_change(request, obj)

    def unsuspend_admin_view(self, request, object_id):
        app = self.get_object(request, object_id)
        if not app:
            self.message_user(request, "Application not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_application_changelist"))

        target_status = Application.Status.COHORT_ASSIGNED if app.assigned_cohort_id else Application.Status.QUALIFIED
        from applications.services.state_machine import transition_application_status
        try:
            transition_application_status(
                app,
                target_status,
                user=request.user,
                reason="Admin unsuspended application",
            )
        except Exception:
            pass

        from django.core.cache import cache
        user_id = app.student.user_id if app.student else None
        if user_id:
            cache.delete_many([
                f"attendance:list:user_{user_id}:ACTIVE",
                f"attendance:list:user_{user_id}:ALL",
                f"user_profile:{user_id}",
            ])

        cohort_name = f"{app.assigned_cohort.name} ({app.assigned_cohort.code})" if app.assigned_cohort else "course"
        notify_user(
            app.student.user,
            title="Cohort access restored",
            message=(
                f"Hi {display_name(app.student.user)}, your cohort access for {app.course.name} "
                f"({cohort_name}) has been restored. Timetable and meeting links are active."
            ),
            notification_type=Notification.Type.SUCCESS,
            action_url="timetable",
            dedupe_key=f"application:{app.id}:unsuspended",
        )
        self.message_user(
            request,
            f"Successfully unsuspended student {app.application_number} and restored cohort access!",
            messages.SUCCESS,
        )
        next_url = request.GET.get("next") or request.POST.get("next")
        if next_url:
            return HttpResponseRedirect(next_url)
        return HttpResponseRedirect(reverse("admin:applications_application_change", args=[app.pk]))

    def suspend_admin_view(self, request, object_id):
        app = self.get_object(request, object_id)
        if not app:
            self.message_user(request, "Application not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_application_changelist"))

        from applications.services.state_machine import transition_application_status
        try:
            transition_application_status(
                app,
                Application.Status.SUSPENDED,
                user=request.user,
                reason="Admin suspended application",
            )
        except Exception:
            pass

        from django.core.cache import cache
        user_id = app.student.user_id if app.student else None
        if user_id:
            cache.delete_many([
                f"attendance:list:user_{user_id}:ACTIVE",
                f"attendance:list:user_{user_id}:ALL",
                f"user_profile:{user_id}",
            ])

        notify_user(
            app.student.user,
            title="Cohort access suspended",
            message=(
                f"Hi {display_name(app.student.user)}, your cohort status for {app.course.name} "
                "has been suspended. Timetable and meeting links are temporarily disabled."
            ),
            notification_type=Notification.Type.WARNING,
            action_url="application_tracker",
            dedupe_key=f"application:{app.id}:suspended",
        )
        self.message_user(
            request,
            f"Successfully suspended cohort access for application {app.application_number}.",
            messages.WARNING,
        )
        next_url = request.GET.get("next") or request.POST.get("next")
        if next_url:
            return HttpResponseRedirect(next_url)
        return HttpResponseRedirect(reverse("admin:applications_application_change", args=[app.pk]))

    def dropout_admin_view(self, request, object_id):
        app = self.get_object(request, object_id)
        if not app:
            self.message_user(request, "Application not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_application_changelist"))

        from applications.services.state_machine import transition_application_status
        old_cohort = app.assigned_cohort
        try:
            transition_application_status(
                app,
                Application.Status.DROPPED,
                user=request.user,
                reason="Admin processed student dropout from cohort",
            )
        except Exception:
            try:
                transition_application_status(
                    app,
                    Application.Status.DROPPED,
                    user=request.user,
                    reason="Admin processed student dropout from cohort (repair)",
                    is_repair=True,
                )
            except Exception:
                pass

        from django.core.cache import cache
        user_id = app.student.user_id if app.student else None
        if user_id:
            cache.delete_many([
                f"attendance:list:user_{user_id}:ACTIVE",
                f"attendance:list:user_{user_id}:ALL",
                f"user_profile:{user_id}",
            ])

        notify_user(
            app.student.user,
            title="Dropped out from cohort",
            message=(
                f"Hi {display_name(app.student.user)}, your enrollment in {app.course.name} "
                f"({old_cohort.name if old_cohort else 'Cohort'}) has been discontinued (Dropped). "
                "You are now eligible to apply for a new course."
            ),
            notification_type=Notification.Type.INFO,
            action_url="course_selection",
            dedupe_key=f"application:{app.id}:dropped",
        )
        self.message_user(
            request,
            f"Successfully marked application {app.application_number} as Dropped. The student is released from this cohort and eligible to apply for a new course.",
            messages.WARNING,
        )
        next_url = request.GET.get("next") or request.POST.get("next")
        if next_url:
            return HttpResponseRedirect(next_url)
        return HttpResponseRedirect(reverse("admin:applications_application_change", args=[app.pk]))

    def transfer_cohort_admin_view(self, request, object_id):
        app = self.get_object(request, object_id)
        if not app:
            self.message_user(request, "Application not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:applications_application_changelist"))

        from cohorts.models import Cohort

        if request.method == "POST":
            to_cohort_id = request.POST.get("to_cohort")
            remarks = request.POST.get("remarks", "").strip()

            if not to_cohort_id:
                self.message_user(request, "Please select a target cohort.", messages.ERROR)
                return HttpResponseRedirect(reverse("admin:application-transfer-cohort-admin", args=[app.pk]))

            try:
                to_cohort = Cohort.objects.select_related("course").get(id=to_cohort_id)
            except Cohort.DoesNotExist:
                self.message_user(request, "Invalid target cohort selected.", messages.ERROR)
                return HttpResponseRedirect(reverse("admin:application-transfer-cohort-admin", args=[app.pk]))

            old_cohort = app.assigned_cohort
            old_course = app.course
            app.assigned_cohort = to_cohort
            app.course = to_cohort.course
            if remarks:
                app.remarks = f"{app.remarks or ''}\n[Cohort Transfer]: {remarks}".strip()
            app.save(update_fields=["assigned_cohort", "course", "remarks", "updated_at"])

            from applications.services.state_machine import transition_application_status
            try:
                transition_application_status(
                    app,
                    Application.Status.COHORT_ASSIGNED,
                    user=request.user,
                    reason=f"Admin transferred cohort to {to_cohort.code}",
                )
            except Exception:
                pass

            from django.core.cache import cache
            user_id = app.student.user_id if app.student else None
            if user_id:
                cache.delete_many([
                    f"attendance:list:user_{user_id}:ACTIVE",
                    f"attendance:list:user_{user_id}:ALL",
                    f"user_profile:{user_id}",
                ])

            old_cohort_name = f"{old_cohort.name} ({old_cohort.code})" if old_cohort else "None"
            course_changed_text = f" (Course changed to {to_cohort.course.name})" if old_course != to_cohort.course else ""

            notify_user(
                app.student.user,
                title="Cohort transferred",
                message=(
                    f"Hi {display_name(app.student.user)}, your cohort "
                    f"has been transferred from {old_cohort_name} to {to_cohort.name} ({to_cohort.code}){course_changed_text}. "
                    "Your timetable and course dashboard have been updated."
                ),
                notification_type=Notification.Type.SUCCESS,
                action_url="timetable",
                dedupe_key=f"application:{app.id}:transfer:{to_cohort.id}",
            )
            self.message_user(
                request,
                f"Successfully transferred student to cohort '{to_cohort.name} ({to_cohort.code})'{course_changed_text}!",
                messages.SUCCESS,
            )
            next_url = request.GET.get("next") or request.POST.get("next")
            if next_url:
                return HttpResponseRedirect(next_url)
            return HttpResponseRedirect(reverse("admin:applications_application_change", args=[app.pk]))

        from_cohort = app.assigned_cohort
        all_candidate_cohorts = Cohort.objects.select_related("course").exclude(
            status__in=[Cohort.Status.COMPLETED, Cohort.Status.CANCELLED]
        )
        if from_cohort:
            all_candidate_cohorts = all_candidate_cohorts.exclude(id=from_cohort.id)

        same_course_cohorts = []
        other_course_cohorts = []

        for c in all_candidate_cohorts:
            enrolled = c.applications.exclude(
                status__in=[Application.Status.DROPPED, Application.Status.CANCELLED, Application.Status.REJECTED]
            ).count()
            c.enrolled_count = enrolled
            if c.course_id == app.course_id:
                same_course_cohorts.append(c)
            else:
                other_course_cohorts.append(c)

        total_available = len(same_course_cohorts) + len(other_course_cohorts)

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "application": app,
            "from_cohort": from_cohort,
            "same_course_cohorts": same_course_cohorts,
            "other_course_cohorts": other_course_cohorts,
            "has_available_cohorts": total_available > 0,
            "title": f"Transfer Cohort: {app.application_number}",
        }
        return TemplateResponse(request, "admin/applications/transfer_cohort.html", context)

    @admin.display(description="Cohort & Suspension Quick Actions")
    def cohort_management_actions(self, obj):
        if not obj or not obj.pk:
            return "Save application first to manage cohort actions."

        cohort = getattr(obj, "assigned_cohort", None)
        status_disp = obj.get_status_display() if hasattr(obj, "get_status_display") else (getattr(obj, "status", None) or "Pending")

        if not obj.assigned_cohort_id or not cohort:
            return format_html(
                '<div style="padding: 2px 0; opacity: 0.8;">'
                '<strong>Status:</strong> {} &nbsp;|&nbsp; <em>No cohort assigned yet to this application.</em>'
                '</div>',
                status_disp,
            )

        try:
            unsuspend_url = reverse("admin:application-unsuspend-admin", args=[obj.pk])
            suspend_url = reverse("admin:application-suspend-admin", args=[obj.pk])
            transfer_url = reverse("admin:application-transfer-cohort-admin", args=[obj.pk])
            dropout_url = reverse("admin:application-dropout-admin", args=[obj.pk])
        except Exception:
            unsuspend_url = suspend_url = transfer_url = dropout_url = "#"

        if obj.status == Application.Status.SUSPENDED:
            action_btn = f'<a class="button" href="{unsuspend_url}" style="background:var(--primary, #1e40af);color:#ffffff;font-weight:600;">⚡ Unsuspend Student (Restore Cohort Access)</a>'
            status_text = '<strong>Status:</strong> <span style="background:var(--message-error-bg, #fee2e2);color:#b91c1c;padding:3px 8px;border-radius:4px;font-weight:bold;">🛑 Suspended</span>'
        elif obj.status == Application.Status.DROPPED:
            action_btn = '<span style="color:var(--body-quiet-color);font-size:12px;">Student Dropped Out (Eligible to apply for a new course)</span>'
            status_text = '<strong>Status:</strong> <span style="background:var(--darkened-bg);color:var(--body-quiet-color);padding:3px 8px;border-radius:4px;font-weight:bold;">Dropped Out</span>'
        else:
            action_btn = f'<a class="button" href="{suspend_url}" onclick="return confirm(\'Suspend cohort access for this student? Timetable, meetings, and cohort updates will be disabled.\');">⏸️ Suspend Cohort Access</a>'
            status_text = f'<strong>Status:</strong> <span style="background:var(--selected-bg, #dcfce7);color:#166534;padding:3px 8px;border-radius:4px;font-weight:bold;">{status_disp}</span>'

        transfer_btn = f'<a class="button" href="{transfer_url}">🔄 Transfer Cohort (From / To)</a>' if obj.status != Application.Status.DROPPED else ""
        dropout_btn = f'<a class="button" href="{dropout_url}" onclick="return confirm(\'Drop student out of this cohort? This frees their seat and allows the student to apply for a new course.\');" style="color:#dc2626;">❌ Drop Out from Cohort</a>' if obj.status != Application.Status.DROPPED else ""

        cohort_name = f"{cohort.name} ({cohort.code})" if (getattr(cohort, "name", None) and getattr(cohort, "code", None)) else "Assigned Cohort"
        mod = getattr(cohort, "current_module", None)
        mod_info = f" &nbsp;|&nbsp; <strong>Current Module:</strong> Module {mod.module_number}: {mod.title}" if mod else ""
        cohort_info = f"<strong>Current Cohort:</strong> {cohort_name}{mod_info}"
        advance_btn = ""
        if cohort and hasattr(cohort, "get_next_module") and obj.status != Application.Status.DROPPED:
            next_mod = cohort.get_next_module()
            if next_mod:
                try:
                    advance_url = reverse("admin:application-advance-module-admin", args=[obj.pk])
                    advance_btn = (
                        f'<a class="button" href="{advance_url}" '
                        f'onclick="return confirm(\'Advance cohort to Module {next_mod.module_number}: {next_mod.title}?\');" '
                        f'style="background:#0284c7;color:#ffffff;font-weight:600;">'
                        f'▶ Advance to Module {next_mod.module_number}: {next_mod.title}</a>'
                    )
                except Exception:
                    advance_btn = ""
            elif getattr(cohort, "current_module_id", None):
                advance_btn = '<span style="color:#16a34a;font-size:12px;font-weight:600;">✓ Final Module Reached</span>'

        buttons_list = [b for b in [action_btn, transfer_btn, advance_btn, dropout_btn] if b]
        buttons_html = " &nbsp; ".join(buttons_list)

        return format_html(
            '<div style="padding: 4px 0;line-height:1.8;">'
            '<div style="margin-bottom: 8px;">{} &nbsp;|&nbsp; {}</div>'
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">{}</div>'
            '</div>',
            format_html(status_text),
            format_html(cohort_info),
            format_html(buttons_html),
        )

    @admin.display(description="Current Module", ordering="assigned_cohort__current_module__module_number")
    def current_module(self, obj):
        cohort = getattr(obj, "assigned_cohort", None)
        if not cohort:
            return mark_safe('<span style="color:var(--body-quiet-color, #94a3b8);font-style:italic;">No cohort assigned</span>')

        m = getattr(cohort, "current_module", None)
        if not m:
            course = getattr(cohort, "course", None) or getattr(obj, "course", None)
            if course:
                count = CourseModule.objects.filter(course=course, is_active=True).count()
                return mark_safe(f'<span style="color:var(--body-quiet-color, #94a3b8);font-style:italic;">Not set ({count} available in course)</span>')
            return mark_safe('<span style="color:var(--body-quiet-color, #94a3b8);font-style:italic;">Not set</span>')

        try:
            url = reverse("admin:courses_coursemodule_change", args=[m.id])
            return format_html(
                '<a href="{}" style="font-weight:600;">Module {}: {}</a>',
                url,
                m.module_number,
                m.title,
            )
        except Exception:
            return f"Module {m.module_number}: {m.title}"

    @admin.display(description="Exam %", ordering="exam__percentage")
    def exam_percentage(self, obj):
        try:
            exam = getattr(obj, "exam", None)
            return exam.percentage if (exam and getattr(exam, "percentage", None) is not None) else "Pending"
        except Exception:
            return "Pending"

    @admin.display(description="Interview", ordering="pre_screening_interview__status")
    def interview_status(self, obj):
        try:
            if obj.course and not getattr(obj.course, "requires_interview", True):
                return "Not required"
            interview = getattr(obj, "pre_screening_interview", None)
            return interview.get_status_display() if interview else "Not scheduled"
        except Exception:
            return "Not scheduled"

    @admin.display(boolean=True, description="Role verified")
    def student_role_verified(self, obj):
        try:
            return getattr(obj, "is_student_role_verified", False)
        except Exception:
            return False

    @admin.display(description="Published exam marks")
    def screening_marks(self, obj):
        try:
            exam = getattr(obj, "exam", None)
            if not exam:
                return "No screening exam created"
            marks = exam.marks_obtained if getattr(exam, "marks_obtained", None) is not None else "Pending"
            percentage = f"{exam.percentage}%" if getattr(exam, "percentage", None) is not None else "Pending"
            result = "Qualified" if getattr(exam, "qualified", None) is True else ("Not qualified" if getattr(exam, "qualified", None) is False else "Pending")
            status_disp = exam.get_status_display() if hasattr(exam, "get_status_display") else ""
            return f"{marks} / {getattr(exam, 'total_marks', '-')} | {percentage} | {result} | {status_disp}"
        except Exception:
            return "Pending"

    @admin.display(description="Interview result")
    def interview_result(self, obj):
        try:
            if obj.course and not getattr(obj.course, "requires_interview", True):
                return "Not required for this course"
            interview = getattr(obj, "pre_screening_interview", None)
            if not interview:
                return "Not scheduled"
            score = interview.score if getattr(interview, "score", None) is not None else "Pending"
            status_disp = interview.get_status_display() if hasattr(interview, "get_status_display") else "Pending"
            return f"{status_disp} | Score: {score} | Scheduled: {getattr(interview, 'scheduled_at', None) or 'Pending'}"
        except Exception:
            return "Not scheduled"

    @admin.display(description="Student role verification")
    def student_role_verification(self, obj):
        try:
            if getattr(obj, "is_student_role_verified", False):
                verifier = getattr(obj, "role_verified_by", None) or "Admin"
                return f"VERIFIED by {verifier} at {getattr(obj, 'role_verified_at', None) or 'recorded time'}"
            blockers = obj.role_verification_blockers() if hasattr(obj, "role_verification_blockers") else []
            status_disp = obj.get_role_verification_status_display() if hasattr(obj, "get_role_verification_status_display") else "Pending"
            return f"{status_disp} - " + (
                " | ".join(blockers) if blockers else "Ready for admin verification"
            )
        except Exception:
            return "Pending verification"

    @admin.action(description="Verify selected student roles after all checks")
    def verify_selected_student_roles(self, request, queryset):
        verified = 0
        blocked = []
        for application in queryset.select_related("student", "student__user", "course"):
            blockers = application.role_verification_blockers()
            if blockers:
                blocked.append(f"{application.application_number}: {' '.join(blockers)}")
                continue
            application.role_verification_status = Application.RoleVerificationStatus.VERIFIED
            application.role_verified_by = request.user
            application.role_verified_at = timezone.now()
            application.save(update_fields=[
                "role_verification_status",
                "role_verified_by",
                "role_verified_at",
                "updated_at",
            ])
            notify_user(
                application.student.user,
                title="Student role verified",
                message=(
                    f"Your student role for {application.course.name} has been verified. "
                    "You are now eligible for cohort assignment."
                ),
                notification_type=Notification.Type.SUCCESS,
                action_url="application_tracker",
                dedupe_key=f"application:{application.id}:role-verified",
            )
            verified += 1
        if verified:
            self.message_user(request, f"Verified {verified} student role(s).", messages.SUCCESS)
        if blocked:
            self.message_user(request, "Blocked: " + " || ".join(blocked), messages.ERROR)

    @admin.action(description="Suspend selected students from cohort")
    def suspend_selected_applications(self, request, queryset):
        count = 0
        from applications.services.state_machine import transition_application_status
        for app in queryset.select_related("student", "student__user", "course"):
            if app.status == Application.Status.SUSPENDED:
                continue
            try:
                transition_application_status(
                    app,
                    Application.Status.SUSPENDED,
                    user=request.user,
                    reason="Bulk suspended via Django Admin action",
                )
            except Exception:
                continue
            notify_user(
                app.student.user,
                title="Cohort access suspended",
                message=(
                    f"Hi {display_name(app.student.user)}, your cohort status for {app.course.name} "
                    "has been suspended. Timetable and meeting links are temporarily disabled."
                ),
                notification_type=Notification.Type.WARNING,
                action_url="application_tracker",
                dedupe_key=f"application:{app.id}:suspended",
            )
            count += 1
        if count:
            self.message_user(request, f"Suspended {count} student application(s).", messages.SUCCESS)

    @admin.action(description="Unsuspend selected students (Reassign back to cohort)")
    def unsuspend_selected_applications(self, request, queryset):
        count = 0
        from applications.services.state_machine import transition_application_status
        for app in queryset.select_related("student", "student__user", "course", "assigned_cohort"):
            if app.status != Application.Status.SUSPENDED:
                continue
            target_status = Application.Status.COHORT_ASSIGNED if app.assigned_cohort_id else Application.Status.QUALIFIED
            try:
                transition_application_status(
                    app,
                    target_status,
                    user=request.user,
                    reason="Bulk unsuspended via Django Admin action",
                )
            except Exception:
                continue
            cohort_name = f"{app.assigned_cohort.name} ({app.assigned_cohort.code})" if app.assigned_cohort else "course"
            notify_user(
                app.student.user,
                title="Cohort access restored",
                message=(
                    f"Hi {display_name(app.student.user)}, your cohort access for {app.course.name} "
                    f"({cohort_name}) has been restored. Timetable and meeting links are active."
                ),
                notification_type=Notification.Type.SUCCESS,
                action_url="timetable",
                dedupe_key=f"application:{app.id}:unsuspended",
            )
            count += 1
        if count:
            self.message_user(request, f"Unsuspended and restored {count} student application(s).", messages.SUCCESS)

    @admin.display(description="SURE TRUST journey")
    def journey_progress(self, obj):
        try:
            if not obj or not getattr(obj, "student", None):
                return "Student profile not attached"
            journey = build_student_journey(obj.student, obj)
            return f"{journey['completed_steps']} / {journey['total_steps']} stages ({journey['completion_percentage']}%) - current: {journey['status']}"
        except Exception as e:
            return f"Journey details unavailable ({e})"

    @admin.display(description="Journey blockers")
    def journey_blockers(self, obj):
        try:
            if not obj or not getattr(obj, "student", None):
                return "Student profile not attached"
            blockers = build_student_journey(obj.student, obj)["blockers"]
            return " | ".join(blockers) if blockers else "No blockers"
        except Exception as e:
            return f"Blocker details unavailable ({e})"

    def save_model(self, request, obj, form, change):
        previous_cohort_id = None
        previous_status = None
        previous_role_status = None
        status_audited = False
        if change:
            previous = Application.objects.filter(pk=obj.pk).values(
                "assigned_cohort_id", "status", "role_verification_status"
            ).first()
            if previous:
                previous_cohort_id = previous["assigned_cohort_id"]
                previous_status = previous["status"]
                previous_role_status = previous["role_verification_status"]
        if obj.assigned_cohort_id or obj.role_verification_status == Application.RoleVerificationStatus.VERIFIED:
            obj.qualified = True
            if obj.qualification_score is None:
                obj.qualification_score = 100.00
            obj.role_verification_status = Application.RoleVerificationStatus.VERIFIED
            obj.role_verified_by = request.user
            obj.role_verified_at = timezone.now()
            if obj.assigned_cohort_id and obj.status in {
                Application.Status.APPLIED,
                Application.Status.PRESCREENING_PENDING,
                Application.Status.PRESCREENING_COMPLETED,
                Application.Status.EXAM_PENDING,
                Application.Status.EXAM_COMPLETED,
                Application.Status.QUALIFIED,
                Application.Status.WAITLISTED,
            }:
                from applications.services.state_machine import transition_application_status
                try:
                    transition_application_status(
                        obj,
                        Application.Status.COHORT_ASSIGNED,
                        user=request.user,
                        reason="Admin assigned cohort via Application Admin save_model",
                        save=False,
                    )
                    status_audited = True
                except Exception:
                    pass

        super().save_model(request, obj, form, change)

        # A Django-admin status override is an intentional privileged feature.
        # Record it explicitly when it did not pass through the ordinary state
        # transition helper above.
        if (
            previous_status is not None
            and previous_status != obj.status
            and not status_audited
        ):
            ApplicationStatusAudit.objects.create(
                application=obj,
                from_status=previous_status,
                to_status=obj.status,
                actor=request.user,
                reason=(
                    "Privileged Django-admin status override. "
                    + (obj.remarks or "No additional remarks supplied.")
                ),
                is_repair=True,
            )

        # Auto-create evaluated qualified Exam for admin-assigned applications
        if obj.assigned_cohort_id or obj.qualified is True:
            from exams.models import Exam
            Exam.objects.update_or_create(
                application=obj,
                defaults={
                    "status": Exam.Status.EVALUATED,
                    "marks_obtained": 100,
                    "total_marks": 100,
                    "percentage": 100,
                    "qualified": True,
                    "submitted_at": timezone.now(),
                }
            )

        if not change and not obj.assigned_cohort_id:
            create_course_default_screening_schedule(obj)
        if previous_status is not None and previous_status != obj.status:
            notify_user(
                obj.student.user,
                title="Application status updated",
                message=(
                    f"Your application {obj.application_number} for {obj.course.name} is now "
                    f"{obj.get_status_display()}."
                ),
                notification_type=Notification.Type.INFO,
                action_url="application_tracker",
                dedupe_key=f"application:{obj.id}:status:{obj.status}",
            )
        if (
            obj.role_verification_status == Application.RoleVerificationStatus.VERIFIED
            and previous_role_status != Application.RoleVerificationStatus.VERIFIED
        ):
            notify_user(
                obj.student.user,
                title="Student role verified",
                message=(
                    f"Your student role for {obj.course.name} has been verified. "
                    "You are now eligible for cohort assignment."
                ),
                notification_type=Notification.Type.SUCCESS,
                action_url="application_tracker",
                dedupe_key=f"application:{obj.id}:role-verified",
            )
        elif previous_role_status is not None and previous_role_status != obj.role_verification_status:
            notify_user(
                obj.student.user,
                title="Student role verification updated",
                message=(
                    f"Your student-role verification for {obj.course.name} is now "
                    f"{obj.get_role_verification_status_display()}."
                    + (f" Remarks: {obj.role_verification_remarks}" if obj.role_verification_remarks else "")
                ),
                notification_type=Notification.Type.WARNING,
                action_url="application_tracker",
                dedupe_key=f"application:{obj.id}:role-verification:{obj.role_verification_status}",
            )
        if obj.assigned_cohort_id and previous_cohort_id != obj.assigned_cohort_id:
            if obj.student.student_identity_issued_at is None:
                obj.student.student_identity_issued_at = timezone.now()
                obj.student.save(update_fields=["student_identity_issued_at", "updated_at"])
            is_transfer = previous_cohort_id is not None
            title_text = "Cohort transferred" if is_transfer else "Cohort assigned"
            msg_text = (
                f"Hi {display_name(obj.student.user)}, your cohort for {obj.course.name} has been transferred to "
                f"{obj.assigned_cohort.name} ({obj.assigned_cohort.code}). Your timetable is updated."
                if is_transfer else
                f"Hi {display_name(obj.student.user)}, you have been assigned to "
                f"{obj.assigned_cohort.name} ({obj.assigned_cohort.code}) for {obj.course.name}."
            )
            notify_user(
                obj.student.user,
                title=title_text,
                message=msg_text,
                notification_type=Notification.Type.SUCCESS,
                action_url="timetable",
                dedupe_key=f"application:{obj.id}:cohort:{obj.assigned_cohort_id}",
            )

    def save_formset(self, request, form, formset, change):
        if formset.model is not CommunityActivity:
            super().save_formset(request, form, formset, change)
            for inline_form in formset.forms:
                if not inline_form.has_changed() or not getattr(inline_form.instance, "pk", None):
                    continue
                instance = inline_form.instance
                if isinstance(instance, Exam):
                    result = (
                        f"Marks: {instance.marks_obtained}/{instance.total_marks} ({instance.percentage}%)."
                        if instance.percentage is not None else instance.get_status_display()
                    )
                    notify_user(
                        instance.application.student.user,
                        title="Pre-screen exam updated",
                        message=f"Your pre-screen exam has been updated. {result}",
                        notification_type=(
                            Notification.Type.SUCCESS if instance.qualified is True else Notification.Type.INFO
                        ),
                        action_url="application_tracker",
                        dedupe_key=f"exam:{instance.id}:admin:{instance.updated_at}",
                    )
                elif isinstance(instance, PreScreeningInterview):
                    application = instance.application
                    CLOSED_APPLICATION_STATUSES = {
                        Application.Status.REJECTED,
                        Application.Status.DROPPED,
                        Application.Status.CANCELLED,
                        Application.Status.COMPLETED,
                    }
                    if application.status not in CLOSED_APPLICATION_STATUSES:
                        from applications.services.state_machine import transition_application_status
                        if instance.status in {PreScreeningInterview.Status.SCHEDULED, PreScreeningInterview.Status.RESCHEDULED}:
                            try:
                                transition_application_status(
                                    application,
                                    Application.Status.PRESCREENING_PENDING,
                                    user=request.user,
                                    reason="PreScreening interview scheduled via Django Admin inline",
                                )
                            except Exception:
                                pass
                        elif instance.status in {PreScreeningInterview.Status.PASSED, PreScreeningInterview.Status.COMPLETED}:
                            try:
                                transition_application_status(
                                    application,
                                    Application.Status.PRESCREENING_COMPLETED,
                                    user=request.user,
                                    reason="PreScreening interview passed via Django Admin inline",
                                )
                            except Exception:
                                pass

                    schedule = (
                        timezone.localtime(instance.scheduled_at).strftime("%d %b %Y, %I:%M %p")
                        if instance.scheduled_at else "to be confirmed"
                    )
                    notify_user(
                        instance.application.student.user,
                        title=(
                            "Interview rescheduled"
                            if instance.status == PreScreeningInterview.Status.RESCHEDULED
                            else "Interview status updated"
                        ),
                        message=(
                            f"Your pre-screen interview is {instance.get_status_display()}. "
                            f"Date and time: {schedule}. "
                            f"Score: {instance.score if instance.score is not None else 'Pending'}."
                        ),
                        notification_type=(
                            Notification.Type.ACTION_REQUIRED
                            if instance.status in {
                                PreScreeningInterview.Status.SCHEDULED,
                                PreScreeningInterview.Status.RESCHEDULED,
                            }
                            else (
                                Notification.Type.SUCCESS
                                if instance.status == PreScreeningInterview.Status.PASSED
                                else Notification.Type.INFO
                            )
                        ),
                        action_url="application_tracker",
                        dedupe_key=f"interview:{instance.id}:admin:{instance.updated_at}",
                    )
                elif isinstance(instance, PreScreening):
                    publish_screening_schedule(
                        instance,
                        notification_key=f"application-admin:{instance.updated_at.isoformat()}",
                    )
            return
        instances = formset.save(commit=False)
        for deleted in formset.deleted_objects:
            deleted.delete()
        for activity in instances:
            if activity.status in {CommunityActivity.Status.VERIFIED, CommunityActivity.Status.REJECTED}:
                activity.verified_by = request.user
                activity.verified_at = timezone.now()
            activity.save()
            notify_user(
                activity.application.student.user,
                title="Community activity updated",
                message=(
                    f"Your {activity.get_activity_type_display()} evidence is "
                    f"{activity.get_status_display()}."
                ),
                notification_type=(
                    Notification.Type.SUCCESS
                    if activity.status == CommunityActivity.Status.VERIFIED
                    else Notification.Type.WARNING
                ),
                action_url="community_activities",
                dedupe_key=f"community-activity:{activity.id}:admin:{activity.updated_at}",
            )
        formset.save_m2m()


@admin.register(CommunityActivity)
class CommunityActivityAdmin(admin.ModelAdmin):
    list_display = ("application", "activity_type", "activity_date", "status", "verified_by")
    list_filter = ("activity_type", "status")
    search_fields = (
        "application__application_number",
        "application__student__student_code",
        "application__student__user__email",
        "title",
    )
    readonly_fields = ("verified_by", "verified_at")

    def save_model(self, request, obj, form, change):
        if obj.status in {CommunityActivity.Status.VERIFIED, CommunityActivity.Status.REJECTED}:
            from django.utils import timezone

            obj.verified_by = request.user
            obj.verified_at = timezone.now()
        super().save_model(request, obj, form, change)


@admin.register(ApplicationStatusAudit)
class ApplicationStatusAuditAdmin(admin.ModelAdmin):
    list_display = ("application", "from_status", "to_status", "actor", "is_repair", "created_at")
    list_filter = ("from_status", "to_status", "is_repair")
    search_fields = ("application__application_number", "actor__email", "reason")
    readonly_fields = ("created_at", "updated_at")

