import csv
import secrets
import uuid
from datetime import timedelta

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from applications.models import Application, PreScreening
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from question_bank.models import QuestionBank
from students.models import StudentProfile

from .attempts import (
    eligible_students_for_proctoring_room,
    module_proctoring_scope,
    proctoring_scope,
)

from .models import (
    Exam,
    ExamProctoringRoom,
    ExamSecurityEvent,
    InternalExamAttempt,
    ModuleTest,
    ModuleTestSubmission,
    StartTest,
)
from .google_meet import ModuleTestMeetError, sync_module_test_google_meet


def export_exams_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_exams.csv"'
    writer = csv.writer(response)
    writer.writerow(["Application Number", "Level", "Status", "Duration (mins)", "Marks Obtained", "Total Marks", "Percentage", "Qualified"])
    for e in queryset.select_related("application"):
        writer.writerow([
            e.application.application_number if e.application else "",
            e.level,
            e.status,
            e.duration_minutes,
            e.marks_obtained or "",
            e.total_marks,
            e.percentage or "",
            "Yes" if e.qualified else ("No" if e.qualified is False else "Pending"),
        ])
    return response


export_exams_to_csv.short_description = "Export selected exams to CSV"


def export_module_tests_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_module_tests.csv"'
    writer = csv.writer(response)
    writer.writerow(["Title", "Course", "Duration (mins)", "Pass Percentage", "Active"])
    for mt in queryset.select_related("course"):
        writer.writerow([
            mt.title,
            mt.course.name if mt.course else "",
            mt.duration_minutes,
            mt.pass_percentage,
            "Yes" if mt.is_active else "No",
        ])
    return response


export_module_tests_to_csv.short_description = "Export selected module tests to CSV"


def export_module_submissions_to_csv(modeladmin, request, queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="suretrust_module_test_submissions.csv"'
    writer = csv.writer(response)
    writer.writerow(["Test Title", "Student Code", "Marks Obtained", "Total Marks", "Percentage", "Qualified", "Submitted At"])
    for sub in queryset.select_related("test", "student"):
        writer.writerow([
            sub.test.title if sub.test else "",
            sub.student.student_code if sub.student else "",
            sub.marks_obtained or "",
            sub.total_marks,
            sub.percentage or "",
            "Yes" if sub.qualified else ("No" if sub.qualified is False else "Pending"),
            sub.submitted_at.strftime("%Y-%m-%d %H:%M") if sub.submitted_at else "",
        ])
    return response

export_module_submissions_to_csv.short_description = "Export selected module test submissions to CSV"


from django.utils.html import format_html


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = (
        "application",
        "course_name",
        "level",
        "total_questions",
        "duration_minutes",
        "pass_percentage",
        "status",
        "paper_set_display",
        "proctor_name",
        "marks_obtained",
        "total_marks",
        "percentage",
        "qualified",
    )
    search_fields = (
        "application__application_number",
        "application__course__name",
        "application__course__code",
        "application__student__student_code",
        "application__student__user__email",
        "proctor_name",
    )
    list_filter = ("level", "status", "qualified", "application__course")
    autocomplete_fields = ("application",)
    readonly_fields = (
        "course_name_display",
        "course_prerequisites_display",
        "course_screening_params_display",
        "paper_assignment_display",
    )
    actions = [export_exams_to_csv]

    fieldsets = (
        (
            "Application & Candidate",
            {"fields": ("application", "status", "paper_assignment_display", "proctor_name")},
        ),
        (
            "Authoritative Course Screening Configuration (Read-Only from Course)",
            {
                "fields": (
                    "course_name_display",
                    "course_prerequisites_display",
                    "course_screening_params_display",
                ),
                "description": (
                    "Pre-screening question generation, prerequisite topics, and default duration/pass threshold "
                    "are authoritatively defined on the Course model."
                ),
            },
        ),
        (
            "Exam Execution Parameters",
            {
                "fields": (
                    "level",
                    "total_questions",
                    "duration_minutes",
                    "pass_percentage",
                ),
                "description": "Instance-level parameters for this screening examination attempt.",
            },
        ),
        (
            "Embedded Jitsi Proctoring",
            {
                "fields": (
                    "proctoring_enabled",
                    "proctoring_required",
                    "proctoring_room_count",
                    "proctoring_capacity_per_room",
                ),
                "description": "Rooms and passwords are generated and assigned by the backend when configured.",
            },
        ),
        (
            "Evaluation & Results",
            {
                "fields": (
                    "started_at",
                    "submitted_at",
                    "marks_obtained",
                    "total_marks",
                    "percentage",
                    "qualified",
                ),
            },
        ),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "application__course",
            "application__pre_screening__question_bank",
        ).prefetch_related(
            Prefetch(
                "internal_attempts",
                queryset=InternalExamAttempt.objects.select_related("question_bank").order_by("-created_at"),
                to_attr="admin_internal_attempts",
            )
        )

    @staticmethod
    def _paper_assignment(obj):
        attempts = getattr(obj, "admin_internal_attempts", None)
        attempt = (
            attempts[0]
            if attempts
            else obj.internal_attempts.select_related("question_bank").order_by("-created_at").first()
        )
        if attempt and attempt.paper_set:
            return attempt.paper_set, attempt.question_bank, "Attempted paper (immutable)"
        schedule = getattr(obj.application, "pre_screening", None)
        if schedule and schedule.paper_set:
            return schedule.paper_set, schedule.question_bank, "Scheduled paper (not started)"
        return "", None, "Not assigned"

    @admin.display(description="Paper Set")
    def paper_set_display(self, obj):
        paper_set, _bank, _source = self._paper_assignment(obj)
        return f"Paper {paper_set}" if paper_set else "Not assigned"

    @admin.display(description="Assigned / Attempted Paper Set")
    def paper_assignment_display(self, obj):
        paper_set, bank, source = self._paper_assignment(obj)
        if not paper_set:
            return "No paper has been assigned. Select one in the student's Screening Exam Schedule."
        return format_html(
            "<strong>Paper {}</strong><br><span>{}</span><br><small>{}</small>",
            paper_set,
            bank.title if bank else "Question bank unavailable",
            source,
        )

    @admin.display(ordering="application__course__name", description="Course Track")
    def course_name(self, obj):
        if obj.application and obj.application.course:
            return obj.application.course.name
        return "-"

    @admin.display(description="Linked Course Track")
    def course_name_display(self, obj):
        if obj.application and obj.application.course:
            c = obj.application.course
            return format_html(
                '<strong>{} ({})</strong> — Domain: {} | Difficulty: {}',
                c.name,
                c.code,
                c.domain or "-",
                c.get_difficulty_display(),
            )
        return "No application / course linked."

    @admin.display(description="AI Prerequisite Topics (From Course)")
    def course_prerequisites_display(self, obj):
        if obj.application and obj.application.course:
            c = obj.application.course
            topics = c.course_prerequisites
            if isinstance(topics, list) and topics:
                badges = " ".join(
                    f'<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:2px 3px 2px 0;">{t}</span>'
                    for t in topics
                )
                return format_html(badges)
            elif c.prerequisites:
                return c.prerequisites
        return "No prerequisites defined on Course."

    @admin.display(description="Standard Course Exam Specifications")
    def course_screening_params_display(self, obj):
        if obj.application and obj.application.course:
            c = obj.application.course
            return format_html(
                '<div style="line-height:1.6;font-size:12px;">'
                '• <strong>Standard Questions:</strong> {} questions<br>'
                '• <strong>Standard Duration:</strong> {} minutes<br>'
                '• <strong>Standard Qualifying Threshold:</strong> {}%<br>'
                '• <strong>Standard Difficulty:</strong> {}<br>'
                '• <strong>Requires Interview:</strong> {}'
                '</div>',
                c.exam_total_questions,
                c.exam_duration_minutes,
                c.exam_pass_percentage,
                c.get_exam_difficulty_display(),
                "Yes" if c.requires_interview else "No",
            )
        return "-"


@admin.register(ModuleTest)
class ModuleTestAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "course",
        "cohort",
        "module",
        "is_released",
        "scheduled_at",
        "end_time",
        "google_meet_link",
        "level",
        "total_questions",
        "duration_minutes",
        "pass_percentage",
        "is_active",
    )
    search_fields = ("title", "course__name", "cohort__code", "description")
    list_filter = ("is_released", "is_active", "level", "course", "cohort", "module")
    autocomplete_fields = ("course", "cohort", "module", "question_bank")
    readonly_fields = (
        "module_topics_display",
        "course_prerequisites_display",
        "google_meet_link",
        "calendar_event_id",
    )
    actions = [export_module_tests_to_csv, "release_selected_tests", "lock_selected_tests"]

    @admin.action(description="🚀 Release selected module tests (Unlock Gate)")
    def release_selected_tests(self, request, queryset):
        released = 0
        failed = 0
        for module_test in queryset.select_related("cohort"):
            try:
                link, event_id, _ = sync_module_test_google_meet(module_test)
            except Exception:
                failed += 1
                module_test.is_released = False
                module_test.save(update_fields=["is_released", "updated_at"])
                continue
            module_test.meeting_link = link
            module_test.calendar_event_id = event_id
            module_test.is_released = True
            module_test.save(update_fields=[
                "meeting_link", "calendar_event_id", "is_released", "updated_at",
            ])
            released += 1
        if released:
            self.message_user(request, f"Released examination gate for {released} module test(s).", messages.SUCCESS)
        if failed:
            self.message_user(
                request,
                f"Kept {failed} module test(s) locked because no Google Meet could be prepared.",
                messages.ERROR,
            )

    @admin.action(description="🔒 Lock selected module tests (Lock Gate)")
    def lock_selected_tests(self, request, queryset):
        updated = queryset.update(is_released=False, updated_at=timezone.now())
        self.message_user(request, f"Locked examination gate for {updated} module test(s).", messages.WARNING)

    fieldsets = (
        (
            "Module Test Details",
            {"fields": (
                "title", "description", "is_active", "is_released",
                "scheduled_at", "end_time", "question_bank",
            )},
        ),
        (
            "Google Meet",
            {"fields": ("google_meet_link", "calendar_event_id")},
        ),
        (
            "Course & Hierarchy",
            {"fields": ("course", "cohort", "module")},
        ),
        (
            "Syllabus & Prerequisite Context (Read-Only)",
            {
                "fields": ("module_topics_display", "course_prerequisites_display"),
                "description": "Module syllabus topics and course prerequisites utilized for test generation.",
            },
        ),
        (
            "Test Specifications",
            {
                "fields": (
                    "level",
                    "total_questions",
                    "duration_minutes",
                    "pass_percentage",
                ),
            },
        ),
    )

    @admin.display(description="Google Meet")
    def google_meet_link(self, obj):
        if not obj or not obj.meeting_link:
            return "Not generated"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open Google Meet</a>',
            obj.meeting_link,
        )

    def save_model(self, request, obj, form, change):
        requested_release = obj.is_released
        obj.is_released = False
        super().save_model(request, obj, form, change)
        if not (obj.cohort_id and obj.scheduled_at and obj.end_time):
            if requested_release:
                messages.error(
                    request,
                    "The module test remains locked until cohort, start time, and end time are set.",
                )
            return
        try:
            link, event_id, _ = sync_module_test_google_meet(obj)
        except Exception as exc:
            messages.error(request, f"The module test remains locked: {exc}")
            return
        obj.meeting_link = link
        obj.calendar_event_id = event_id
        obj.is_released = requested_release
        obj.save(update_fields=[
            "meeting_link", "calendar_event_id", "is_released", "updated_at",
        ])

    @admin.display(description="Module Syllabus Topics")
    def module_topics_display(self, obj):
        if obj.module and obj.module.topics:
            topics = obj.module.topics if isinstance(obj.module.topics, list) else []
            if topics:
                badges = " ".join(
                    f'<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:2px 3px 2px 0;">{t}</span>'
                    for t in topics
                )
                return format_html(badges)
        return "No syllabus topics specified on Module."

    @admin.display(description="Course Prerequisites")
    def course_prerequisites_display(self, obj):
        if obj.course:
            topics = obj.course.course_prerequisites
            if isinstance(topics, list) and topics:
                badges = " ".join(
                    f'<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:2px 3px 2px 0;">{t}</span>'
                    for t in topics
                )
                return format_html(badges)
            elif obj.course.prerequisites:
                return obj.course.prerequisites
        return "-"


@admin.register(ModuleTestSubmission)
class ModuleTestSubmissionAdmin(admin.ModelAdmin):
    list_display = ("test", "student", "cohort", "result_source", "marks_obtained", "total_marks", "percentage", "qualified")
    search_fields = ("test__title", "student__student_code", "student__user__email", "cohort__code")
    list_filter = ("result_source", "integrity_status", "qualified", "test", "cohort")
    autocomplete_fields = ("test", "student", "cohort")
    exclude = ("proctoring_room",)
    readonly_fields = (
        "result_source", "result_event_id", "result_payload_hash",
        "integrity_status", "proctoring_summary", "percentage",
    )
    actions = [export_module_submissions_to_csv]


@admin.register(InternalExamAttempt)
class InternalExamAttemptAdmin(admin.ModelAdmin):
    list_display = (
        "student", "exam", "paper_set", "proctoring_status",
        "status", "start_time", "expires_at", "submission_time",
    )

    search_fields = ("student__student_code", "student__user__email", "exam__application__application_number")
    list_filter = ("status", "paper_set", "proctoring_status")
    autocomplete_fields = ("student", "exam", "question_bank")
    exclude = ("proctoring_room",)


class AssessmentOptionSelect(forms.Select):
    """Expose relation metadata so the admin page can cascade its dropdowns."""

    def create_option(self, name, value, label, selected, index, subindex=None, attrs=None):
        option = super().create_option(
            name, value, label, selected, index, subindex=subindex, attrs=attrs
        )
        instance = getattr(value, "instance", None)
        if instance is not None:
            course_id = getattr(instance, "course_id", None)
            if course_id is None and getattr(instance, "application_id", None):
                course_id = instance.application.course_id
            option["attrs"]["data-course"] = str(course_id or "")
            bank_type = getattr(instance, "bank_type", None)
            if bank_type:
                option["attrs"]["data-assessment-type"] = str(bank_type)
        return option


class ProctoringRoomAdminForm(forms.ModelForm):
    assessment_type = forms.ChoiceField(
        choices=QuestionBank.BankType.choices,
        help_text="Choose whether this room is for pre-screening or a module test.",
    )
    course = forms.ModelChoiceField(
        queryset=Course.objects.order_by("name"),
        help_text="The open question-bank list is filtered to this course in the browser.",
    )
    question_bank = forms.ModelChoiceField(
        queryset=QuestionBank.objects.none(),
        widget=AssessmentOptionSelect,
    )
    exam = forms.ModelChoiceField(
        queryset=Exam.objects.none(),
        required=False,
        widget=AssessmentOptionSelect,
        help_text="Required for pre-screening; leave blank for a module-test room.",
    )

    class Meta:
        model = ExamProctoringRoom
        fields = (
            "assessment_type", "course", "question_bank", "exam", "code",
            "capacity", "assigned_proctor", "assigned_students", "is_active",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        eligible_banks = QuestionBank.objects.select_related(
            "course", "exam__application", "module_test", "module_test__cohort"
        ).filter(
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        ).order_by("course__name", "bank_type", "title")
        self.fields["question_bank"].queryset = eligible_banks
        self.fields["question_bank"].label_from_instance = lambda bank: (
            f"{bank.course.code} · {bank.get_bank_type_display()} · {bank.title} "
            f"[{bank.get_lifecycle_status_display()}]"
        )
        exams = Exam.objects.select_related(
            "application__course", "application__student__user"
        ).order_by("application__course__name", "application__application_number")
        self.fields["exam"].queryset = exams
        self.fields["exam"].label_from_instance = lambda exam: (
            f"{exam.application.course.code} · {exam.application.application_number} · "
            f"{exam.application.student.student_code}"
        )

        instance = getattr(self, "instance", None)
        if instance and instance.pk:
            bank = instance.question_bank
            self.fields["assessment_type"].initial = bank.bank_type
            self.fields["course"].initial = bank.course_id
            eligible = eligible_students_for_proctoring_room(instance)
            self.fields["assigned_students"].queryset = (
                StudentProfile.objects.filter(
                    Q(pk__in=eligible.order_by().values_list("pk", flat=True))
                    | Q(
                        pk__in=instance.assigned_students.order_by().values_list(
                            "pk", flat=True
                        )
                    )
                )
                .select_related("user")
                .order_by("student_code")
            )
        else:
            self.fields["assigned_students"].queryset = StudentProfile.objects.none()

        bank_id = self.data.get("question_bank") if self.is_bound else None
        if bank_id:
            bank = eligible_banks.filter(pk=bank_id).first()
            if bank:
                temporary_room = ExamProctoringRoom(
                    question_bank=bank,
                    session_date=timezone.localdate(),
                )
                self.fields["assigned_students"].queryset = (
                    eligible_students_for_proctoring_room(temporary_room)
                )

    def clean(self):
        cleaned = super().clean()
        bank = cleaned.get("question_bank")
        course = cleaned.get("course")
        assessment_type = cleaned.get("assessment_type")
        exam = cleaned.get("exam")
        if bank and course and bank.course_id != course.id:
            self.add_error("question_bank", "Select a question bank from the chosen course.")
        if bank and assessment_type and bank.bank_type != assessment_type:
            self.add_error("question_bank", "Select a bank matching the assessment type.")
        if assessment_type == QuestionBank.BankType.PRESCREENING:
            if not exam:
                self.add_error("exam", "Select a pre-screening exam for this room.")
            elif course and exam.application.course_id != course.id:
                self.add_error("exam", "The exam must belong to the chosen course.")
        elif exam:
            self.add_error("exam", "Module-test rooms do not link a pre-screening exam.")
        if (
            bank
            and assessment_type == QuestionBank.BankType.MODULE_TEST
            and not (
                bank.module_test_id
                or bank.linked_module_tests.filter(is_active=True).exists()
            )
        ):
            self.add_error(
                "question_bank",
                "Link this bank to an active Module Test before creating rooms.",
            )

        assigned = cleaned.get("assigned_students")
        if assigned and bank:
            duplicate_ids = ExamProctoringRoom.objects.filter(
                scope_key=getattr(self.instance, "scope_key", ""),
                assigned_students__in=assigned,
                is_active=True,
            ).exclude(pk=getattr(self.instance, "pk", None)).values_list(
                "assigned_students", flat=True
            )
            if duplicate_ids:
                self.add_error(
                    "assigned_students",
                    "A candidate can be assigned to only one active room in this session.",
                )
        return cleaned


@admin.action(description="Distribute all eligible candidates across selected rooms")
def distribute_eligible_candidates(modeladmin, request, queryset):
    selected_rooms = list(queryset.select_related("question_bank").order_by("scope_key", "code"))
    if not selected_rooms:
        return
    grouped = {}
    for room in selected_rooms:
        grouped.setdefault(room.scope_key, []).append(room)

    assigned_total = 0
    omitted_total = 0
    for rooms in grouped.values():
        rooms = [room for room in rooms if room.is_active]
        if not rooms:
            continue
        # Ensure Room A is prioritized first, followed by alphabetical order
        rooms.sort(key=lambda r: (0 if str(r.code).strip().upper() == "A" else 1, r.code))
        candidates = list(eligible_students_for_proctoring_room(rooms[0]))
        for room in rooms:
            room.assigned_students.clear()
        current_room_idx = 0
        for candidate in candidates:
            while (
                current_room_idx < len(rooms)
                and rooms[current_room_idx].assigned_students.count() >= rooms[current_room_idx].capacity
            ):
                current_room_idx += 1
            if current_room_idx >= len(rooms):
                omitted_total += 1
                continue
            rooms[current_room_idx].assigned_students.add(candidate)
            assigned_total += 1
    modeladmin.message_user(
        request,
        f"Assigned {assigned_total} eligible candidate(s) (Room A filled by default). {omitted_total} were omitted because selected rooms reached capacity.",
        level=messages.WARNING if omitted_total else messages.SUCCESS,
    )


class ExamProctoringRoomAdmin(admin.ModelAdmin):
    """Legacy room allocator retained for historical code only; intentionally unregistered."""
    form = ProctoringRoomAdminForm
    list_display = (
        "course_name", "assessment_type", "question_bank", "session_date", "code",
        "assigned_candidate_count", "capacity", "assigned_proctor", "is_active",
    )
    list_filter = (
        "question_bank__bank_type", "question_bank__course",
        "question_bank__lifecycle_status", "session_date", "is_active", "code",
    )
    search_fields = (
        "exam__application__application_number", "question_bank__title",
        "question_bank__course__name", "question_bank__course__code",
        "assigned_students__student_code", "assigned_students__user__email",
        "room_name", "assigned_proctor__email",
    )
    autocomplete_fields = ("assigned_proctor",)
    filter_horizontal = ("assigned_students",)
    readonly_fields = ("scope_key", "session_date", "room_name", "room_password")
    actions = (distribute_eligible_candidates,)
    fieldsets = (
        (
            "Assessment Selection",
            {
                "fields": ("assessment_type", "course", "question_bank", "exam"),
                "description": (
                    "Choose the assessment type and course first. Only approved, open, active "
                    "question banks are available."
                ),
            },
        ),
        ("Room", {"fields": ("code", "capacity", "assigned_proctor", "is_active")}),
        (
            "Candidate Assignment",
            {
                "fields": ("assigned_students",),
                "description": (
                    "Eligible students are derived from the selected course and assessment. "
                    "Use the bulk action on the room list to balance an entire session."
                ),
            },
        ),
        (
            "Generated Connection Details",
            {
                "fields": ("scope_key", "session_date", "room_name", "room_password"),
                "classes": ("collapse",),
            },
        ),
    )

    class Media:
        js = ("exams/admin/proctoring_room.js",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "question_bank__course", "assigned_proctor"
        ).annotate(_assigned_candidate_count=Count("assigned_students", distinct=True))

    @admin.display(ordering="question_bank__course__name", description="Course")
    def course_name(self, obj):
        return obj.question_bank.course.name

    @admin.display(ordering="question_bank__bank_type", description="Assessment")
    def assessment_type(self, obj):
        return obj.question_bank.get_bank_type_display()

    @admin.display(ordering="_assigned_candidate_count", description="Assigned students")
    def assigned_candidate_count(self, obj):
        return obj._assigned_candidate_count

    def save_model(self, request, obj, form, change):
        bank = form.cleaned_data["question_bank"]
        if bank.bank_type == QuestionBank.BankType.PRESCREENING:
            obj.exam = form.cleaned_data["exam"]
            obj.scope_key, obj.session_date = proctoring_scope(obj.exam, bank)
        else:
            obj.exam = None
            module_test = bank.module_test or bank.linked_module_tests.filter(
                is_active=True
            ).first()
            obj.scope_key, obj.session_date = module_proctoring_scope(module_test, bank)
        obj.question_bank = bank
        obj.code = str(obj.code).strip().upper()
        if not obj.room_name:
            obj.room_name = f"sureproed-{obj.scope_key[:16]}-{secrets.token_urlsafe(18)}"
        if not obj.room_password:
            obj.room_password = secrets.token_urlsafe(24)
        super().save_model(request, obj, form, change)


@admin.register(ExamSecurityEvent)
class ExamSecurityEventAdmin(admin.ModelAdmin):
    list_display = ("attempt", "event_type", "timestamp")
    search_fields = ("attempt__student__student_code", "event_type")
    list_filter = ("event_type",)
    autocomplete_fields = ("attempt",)


@admin.register(StartTest)
class StartTestAdmin(admin.ModelAdmin):
    change_list_template = "admin/exams/starttest/hub.html"

    PRESCREENING_ELIGIBLE_STATUSES = (
        Application.Status.APPLIED,
        Application.Status.EXAM_PENDING,
    )
    ENROLLED_STATUSES = (
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
    )
    ACTIVE_COHORT_STATUSES = (
        Cohort.Status.OPEN,
        Cohort.Status.ACTIVE,
        Cohort.Status.TRAINING,
        Cohort.Status.INTERNSHIP,
        Cohort.Status.SOFT_SKILLS,
    )

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path("hub/", self.admin_site.admin_view(self.hub_view), name="exams_starttest_hub"),
            path("bulk-release-prescreening/", self.admin_site.admin_view(self.bulk_release_prescreening_view), name="exams_starttest_bulk_prescreening"),
            path("bulk-release-moduletest/", self.admin_site.admin_view(self.bulk_release_moduletest_view), name="exams_starttest_bulk_moduletest"),
            path("generate-bank-now/", self.admin_site.admin_view(self.generate_bank_now_view), name="exams_starttest_generate_bank"),
            path("extend-window/", self.admin_site.admin_view(self.extend_window_view), name="exams_starttest_extend_window"),
            path("close-window/", self.admin_site.admin_view(self.close_window_view), name="exams_starttest_close_window"),
        ]
        return custom_urls + urls

    def changelist_view(self, request, extra_context=None):
        return self.hub_view(request, extra_context=extra_context)

    @staticmethod
    def _parse_local_datetime(value):
        parsed = parse_datetime(value or "")
        if parsed and timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed

    @staticmethod
    def _by_id(queryset, value):
        if not value:
            return None
        try:
            return queryset.filter(id=value).first()
        except (ValidationError, ValueError, TypeError):
            return None

    @staticmethod
    def _hub_redirect(section="prescreening", **params):
        query = {"section": section, **{key: value for key, value in params.items() if value}}
        from urllib.parse import urlencode
        return redirect(f"{reverse('admin:exams_starttest_changelist')}?{urlencode(query)}")

    def hub_view(self, request, extra_context=None):
        now = timezone.now()
        section = request.GET.get("section", "prescreening")
        if section not in {"prescreening", "module", "monitor"}:
            section = "prescreening"

        courses = Course.objects.filter(status=Course.Status.PUBLISHED).annotate(
            pending_count=Count(
                "applications",
                filter=Q(applications__status__in=self.PRESCREENING_ELIGIBLE_STATUSES),
                distinct=True,
            )
        ).order_by("name")

        selected_course_id = request.GET.get("course_id", "")
        selected_question_bank_id = request.GET.get("question_bank_id", "")
        selected_course = self._by_id(courses, selected_course_id)
        applicants = Application.objects.none()
        question_banks = QuestionBank.objects.none()
        latest_course_bank = None
        approved_course_bank = None
        active_generation_bank = None
        if selected_course:
            applicants = Application.objects.filter(
                course=selected_course,
                status__in=self.PRESCREENING_ELIGIBLE_STATUSES,
            ).select_related("student", "student__user", "pre_screening").order_by("-applied_at")
            question_banks = QuestionBank.objects.filter(
                course=selected_course,
                bank_type=QuestionBank.BankType.PRESCREENING,
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                is_active=True,
            ).order_by("title")
            from question_bank.auto_generate import find_reusable_prescreening_bank
            latest_course_bank = find_reusable_prescreening_bank(selected_course)
            approved_course_bank = QuestionBank.objects.filter(
                course=selected_course,
                bank_type=QuestionBank.BankType.PRESCREENING,
                exam__isnull=True,
                status=QuestionBank.Status.APPROVED,
                lifecycle_status__in=[
                    QuestionBank.LifecycleStatus.DRAFT,
                    QuestionBank.LifecycleStatus.OPEN,
                ],
            ).exclude(sets_data={}).order_by("-is_active", "-updated_at").first()
            active_generation_bank = QuestionBank.objects.filter(
                course=selected_course,
                bank_type=QuestionBank.BankType.PRESCREENING,
                exam__isnull=True,
                status__in=[
                    QuestionBank.Status.GENERATING,
                    QuestionBank.Status.PROCESSING,
                ],
            ).order_by("-updated_at").first()
            if latest_course_bank is None:
                latest_course_bank = QuestionBank.objects.filter(
                    course=selected_course,
                    bank_type=QuestionBank.BankType.PRESCREENING,
                    exam__isnull=True,
                ).order_by("-updated_at").first()

        selected_mt_course_id = request.GET.get("mt_course_id", "")
        selected_mt_cohort_id = request.GET.get("mt_cohort_id", "")
        selected_mt_module_id = request.GET.get("mt_module_id", "")
        selected_mt_course = self._by_id(courses, selected_mt_course_id)
        cohorts = Cohort.objects.none()
        modules = CourseModule.objects.none()
        selected_mt_cohort = None
        selected_mt_module = None
        cohort_students = Application.objects.none()
        mt_question_banks = QuestionBank.objects.none()
        if selected_mt_course:
            cohorts = Cohort.objects.filter(
                course=selected_mt_course,
                status__in=self.ACTIVE_COHORT_STATUSES,
            ).order_by("code")
            modules = CourseModule.objects.filter(
                course=selected_mt_course,
                is_active=True,
            ).order_by("order", "module_number")
            if selected_mt_cohort_id:
                selected_mt_cohort = self._by_id(cohorts, selected_mt_cohort_id)
            if selected_mt_module_id:
                selected_mt_module = self._by_id(modules, selected_mt_module_id)
        if selected_mt_cohort:
            cohort_students = Application.objects.filter(
                course=selected_mt_course,
                assigned_cohort=selected_mt_cohort,
                status__in=self.ENROLLED_STATUSES,
            ).select_related("student", "student__user").order_by("student__student_code")
        if selected_mt_cohort and selected_mt_module:
            mt_question_banks = QuestionBank.objects.filter(
                course=selected_mt_course,
                cohort=selected_mt_cohort,
                module=selected_mt_module,
                bank_type=QuestionBank.BankType.MODULE_TEST,
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                is_active=True,
            ).order_by("title")

        active_prescreenings = PreScreening.objects.filter(
            is_released=True,
            end_time__gte=now,
        ).exclude(
            status=PreScreening.Status.CANCELLED
        ).exclude(
            application__status__in=[
                Application.Status.DROPPED,
                Application.Status.CANCELLED,
                Application.Status.REJECTED,
                Application.Status.COMPLETED,
            ]
        ).select_related("application", "application__student", "application__student__user", "application__course").order_by("end_time")[:30]

        active_module_tests = ModuleTest.objects.filter(
            is_released=True,
            end_time__gte=now,
        ).select_related("course", "cohort", "module").order_by("end_time")[:30]

        local_now = timezone.localtime(now)
        default_start_time = local_now.strftime("%Y-%m-%dT%H:%M")
        default_end_time = (local_now + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")

        context = {
            **self.admin_site.each_context(request),
            "title": "Start Test Hub",
            "section": section,
            "courses": courses,
            "cohorts": cohorts,
            "selected_course_id": selected_course_id,
            "selected_course": selected_course,
            "applicants": applicants,
            "question_banks": question_banks,
            "selected_question_bank_id": selected_question_bank_id,
            "latest_course_bank": latest_course_bank,
            "approved_course_bank": approved_course_bank,
            "active_generation_bank": active_generation_bank,
            "selected_mt_course_id": selected_mt_course_id,
            "selected_mt_cohort_id": selected_mt_cohort_id,
            "selected_mt_module_id": selected_mt_module_id,
            "selected_mt_course": selected_mt_course,
            "selected_mt_cohort": selected_mt_cohort,
            "selected_mt_module": selected_mt_module,
            "modules": modules,
            "mt_question_banks": mt_question_banks,
            "cohort_students": cohort_students,
            "default_start_time": default_start_time,
            "default_end_time": default_end_time,
            "total_courses": courses.count(),
            "pending_screening_count": Application.objects.filter(
                course__status=Course.Status.PUBLISHED,
                status__in=self.PRESCREENING_ELIGIBLE_STATUSES,
            ).count(),
            "active_cohorts_count": Cohort.objects.filter(status__in=self.ACTIVE_COHORT_STATUSES).count(),
            "live_sessions_count": active_prescreenings.count() + active_module_tests.count(),
            "active_prescreenings": active_prescreenings,
            "live_prescreenings": active_prescreenings,
            "active_module_tests": active_module_tests,
            "active_tests": active_module_tests,
            **(extra_context or {}),
        }
        return TemplateResponse(request, "admin/exams/starttest/hub.html", context)

    def generate_bank_now_view(self, request):
        if request.method != "POST":
            return self._hub_redirect()
        course_id = request.POST.get("course_id")
        if not course_id:
            messages.error(request, "Please select a course and a Question Bank action.")
            return self._hub_redirect()
        course = Course.objects.filter(
            pk=course_id,
            status=Course.Status.PUBLISHED,
        ).first()
        if not course:
            messages.error(request, "The selected published course was not found.")
            return self._hub_redirect()

        bank_action = request.POST.get("bank_action", "reuse")
        from question_bank.auto_generate import (
            auto_generate_prescreening_bank,
            find_reusable_prescreening_bank,
        )

        if bank_action == "reuse":
            with transaction.atomic():
                course = Course.objects.select_for_update().get(pk=course.pk)
                bank = find_reusable_prescreening_bank(course, for_update=True)
                if not bank or bank.status != QuestionBank.Status.APPROVED or not bank.sets_data:
                    messages.error(
                        request,
                        "No approved stored Question Bank is available to reuse for this course.",
                    )
                    return self._hub_redirect(course_id=course_id)
                from question_bank.serializers import QuestionBankDetailSerializer
                try:
                    QuestionBankDetailSerializer().validate_sets_data(bank.sets_data)
                except Exception as exc:
                    messages.error(
                        request,
                        f"The stored Question Bank cannot be reused because its paper structure is invalid: {exc}",
                    )
                    return self._hub_redirect(course_id=course_id)
                expected = int(bank.total_questions_per_set or 0)
                invalid_sets = [
                    code
                    for code, paper in bank.sets_data.items()
                    if len((paper or {}).get("questions", [])) != expected
                ]
                if expected < 1 or invalid_sets:
                    messages.error(
                        request,
                        "The stored Question Bank cannot be reused because every paper "
                        f"must contain exactly {expected} questions. Invalid sets: "
                        f"{', '.join(invalid_sets) or 'all'}.",
                    )
                    return self._hub_redirect(course_id=course_id)
                redundant_ids = list(
                    QuestionBank.objects.select_for_update().filter(
                        course=course,
                        bank_type=QuestionBank.BankType.PRESCREENING,
                        exam__isnull=True,
                        status__in=[
                            QuestionBank.Status.GENERATING,
                            QuestionBank.Status.PROCESSING,
                        ],
                        sets_data={},
                    ).values_list("pk", flat=True)
                )
                if redundant_ids:
                    QuestionBank.objects.filter(pk__in=redundant_ids).update(
                        status=QuestionBank.Status.FAILED,
                        lifecycle_status=QuestionBank.LifecycleStatus.CLOSED,
                        is_active=False,
                        error_message=(
                            "Generation cancelled by the administrator because an "
                            "approved Question Bank was selected for reuse."
                        ),
                    )
                    from question_bank.tasks import schedule_failed_question_bank_cleanup
                    for redundant_id in redundant_ids:
                        schedule_failed_question_bank_cleanup(redundant_id)
                QuestionBank.objects.select_for_update().filter(
                    course=course,
                    bank_type=QuestionBank.BankType.PRESCREENING,
                    exam__isnull=True,
                ).exclude(pk=bank.pk).update(
                    lifecycle_status=QuestionBank.LifecycleStatus.CLOSED,
                    is_active=False,
                )
                bank.cohort = None
                bank.lifecycle_status = QuestionBank.LifecycleStatus.OPEN
                bank.is_active = True
                bank.error_message = None
                bank.save(update_fields=[
                    "cohort", "lifecycle_status", "is_active", "error_message", "updated_at",
                ])
            messages.success(
                request,
                f"'{bank.title}' is now the approved open course Question Bank. "
                "It is selected below and bulk start is ready.",
            )
            return self._hub_redirect(
                course_id=course_id,
                question_bank_id=bank.pk,
            )

        if bank_action != "generate":
            messages.error(request, "Choose either reuse existing or generate with AI.")
            return self._hub_redirect(course_id=course_id)

        bank = auto_generate_prescreening_bank(course_id, force_new=True)
        if bank:
            if bank.status == QuestionBank.Status.APPROVED:
                message = (
                    f"Question Bank '{bank.title}' is prepared. Review and publish it "
                    "to unlock bulk start."
                )
            else:
                message = (
                    f"AI preparation is active for '{bank.title}' "
                    f"(status: {bank.get_status_display()}). Existing work is reused."
                )
            messages.success(request, message)
        else:
            messages.error(request, "Could not initialize AI Question Bank for this course.")
        return self._hub_redirect(course_id=course_id)

    def bulk_release_prescreening_view(self, request):
        if request.method != "POST":
            return self._hub_redirect()
        course_id = request.POST.get("course_id")
        application_ids = request.POST.getlist("application_ids")
        question_bank_id = request.POST.get("question_bank_id")
        paper_set = request.POST.get("paper_set", "AUTO")
        scheduled_at_str = request.POST.get("scheduled_at")
        end_time_str = request.POST.get("end_time")

        if not course_id or not application_ids or not question_bank_id or not scheduled_at_str or not end_time_str:
            messages.error(request, "Select a course, at least one applicant, an approved question bank, and a valid assessment window.")
            return self._hub_redirect(course_id=course_id)
        try:
            uuid.UUID(str(course_id))
            uuid.UUID(str(question_bank_id))
            for application_id in application_ids:
                uuid.UUID(str(application_id))
        except (ValueError, TypeError, AttributeError):
            messages.error(request, "The course, applicant, or question-bank selection is invalid.")
            return self._hub_redirect()

        scheduled_at = self._parse_local_datetime(scheduled_at_str)
        end_time = self._parse_local_datetime(end_time_str)

        if not scheduled_at or not end_time or end_time <= scheduled_at:
            messages.error(request, "End window time must be strictly after scheduled start time.")
            return self._hub_redirect(course_id=course_id)

        applications = Application.objects.filter(
            id__in=application_ids,
            course_id=course_id,
            course__status=Course.Status.PUBLISHED,
            status__in=self.PRESCREENING_ELIGIBLE_STATUSES,
        ).select_related("course", "student", "student__user")
        if applications.count() != len(set(application_ids)):
            messages.error(request, "One or more selected applicants are no longer eligible for this course.")
            return self._hub_redirect(course_id=course_id)
        applications = list(applications)
        bank = QuestionBank.objects.filter(
            id=question_bank_id,
            course_id=course_id,
            bank_type=QuestionBank.BankType.PRESCREENING,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        ).first()
        if not bank:
            messages.error(request, "The selected question bank is not an approved, open bank for this course.")
            return self._hub_redirect(course_id=course_id)
        if paper_set != "AUTO" and paper_set not in bank.set_codes:
            messages.error(request, "The selected paper set is not available in this question bank.")
            return self._hub_redirect(course_id=course_id)

        release_now = request.POST.get("is_released") == "1"
        gate_opened_at = timezone.now() if release_now else None
        from applications.services.google_meet_screening import resolve_or_create_prescreening_google_meet
        cohort_meet_details = {}
        cohort_attendees = {}
        for application in applications:
            cohort_key = application.assigned_cohort_id or "NO_COHORT"
            email = application.student.user.email
            if email:
                cohort_attendees.setdefault(cohort_key, []).append(email)
        with transaction.atomic():
            count = 0
            for application in applications:
                screening, created = PreScreening.objects.get_or_create(application=application)
                screening.question_bank = bank
                screening.paper_set = paper_set if paper_set != "AUTO" else (bank.set_codes[0] if bank.set_codes else "")
                screening.scheduled_at = scheduled_at
                screening.end_time = end_time
                screening.is_released = release_now
                screening.admin_started_at = gate_opened_at
                screening.status = (
                    PreScreening.Status.SCHEDULED
                    if created
                    else PreScreening.Status.RESCHEDULED
                )

                cohort_key = application.assigned_cohort_id or "NO_COHORT"
                if cohort_key not in cohort_meet_details:
                    link = resolve_or_create_prescreening_google_meet(
                        screening,
                        sync_cohort_students=False,
                        attendee_emails=cohort_attendees.get(cohort_key, []),
                    ) or ""
                    cohort_meet_details[cohort_key] = (
                        link,
                        screening.calendar_event_id or "",
                    )

                meet_link, calendar_event_id = cohort_meet_details[cohort_key]
                if meet_link:
                    screening.meeting_link = meet_link
                if calendar_event_id:
                    screening.calendar_event_id = calendar_event_id

                screening.save()
                Exam.objects.get_or_create(
                    application=application,
                    defaults={
                        "total_questions": bank.total_questions_per_set or 10,
                        "duration_minutes": 45,
                        "pass_percentage": 60,
                        "level": Exam.Level.MIXED,
                        "status": Exam.Status.PENDING,
                    },
                )
                count += 1
        action = (
            "scheduled, released, and opened by the administrator"
            if release_now
            else "scheduled with the start gate locked"
        )
        messages.success(request, f"Successfully {action} the pre-screening exam for {count} selected candidate(s).")
        return self._hub_redirect(course_id=course_id)

    def bulk_release_moduletest_view(self, request):
        if request.method != "POST":
            return self._hub_redirect("module")
        course_id = request.POST.get("course_id")
        cohort_id = request.POST.get("cohort_id")
        module_id = request.POST.get("module_id")
        question_bank_id = request.POST.get("question_bank_id")
        module_test_id = request.POST.get("module_test_id")
        scheduled_at_str = request.POST.get("scheduled_at")
        end_time_str = request.POST.get("end_time")

        redirect_params = {"mt_course_id": course_id, "mt_cohort_id": cohort_id, "mt_module_id": module_id}
        if not all([course_id, cohort_id, module_id, question_bank_id, scheduled_at_str, end_time_str]):
            messages.error(request, "Select a related course, cohort, module, question bank, and assessment window.")
            return self._hub_redirect("module", **redirect_params)
        try:
            for value in (course_id, cohort_id, module_id, question_bank_id):
                uuid.UUID(str(value))
            if module_test_id:
                uuid.UUID(str(module_test_id))
        except (ValueError, TypeError, AttributeError):
            messages.error(request, "The course, cohort, module, or question-bank selection is invalid.")
            return self._hub_redirect("module")

        scheduled_at = self._parse_local_datetime(scheduled_at_str)
        end_time = self._parse_local_datetime(end_time_str)

        if not scheduled_at or not end_time or end_time <= scheduled_at:
            messages.error(request, "End window time must be strictly after start time.")
            return self._hub_redirect("module", **redirect_params)

        course = Course.objects.filter(id=course_id, status=Course.Status.PUBLISHED).first()
        cohort = Cohort.objects.filter(id=cohort_id, course=course, status__in=self.ACTIVE_COHORT_STATUSES).first()
        module = CourseModule.objects.filter(id=module_id, course=course, is_active=True).first()
        bank = QuestionBank.objects.filter(
            id=question_bank_id,
            course=course,
            cohort=cohort,
            module=module,
            bank_type=QuestionBank.BankType.MODULE_TEST,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
        ).first()
        if not all([course, cohort, module, bank]):
            messages.error(request, "The selected cohort, module, or question bank does not belong to the selected course.")
            return self._hub_redirect("module", **redirect_params)

        try:
            duration_minutes = max(5, int(request.POST.get("duration_minutes", 30)))
            pass_percentage = min(100, max(1, int(request.POST.get("pass_percentage", 60))))
        except (TypeError, ValueError):
            messages.error(request, "Duration and pass percentage must be valid numbers.")
            return self._hub_redirect("module", **redirect_params)
        title = (request.POST.get("title") or f"{cohort.code} - Module {module.module_number} Test").strip()
        release_now = request.POST.get("is_released") == "1"
        defaults = {
            "title": title,
            "course": course,
            "cohort": cohort,
            "module": module,
            "question_bank": bank,
            "total_questions": bank.total_questions_per_set,
            "duration_minutes": duration_minutes,
            "pass_percentage": pass_percentage,
            "scheduled_at": scheduled_at,
            "end_time": end_time,
            # The gate is opened only after a Google Meet URL is available.
            "is_released": False,
            "is_active": True,
        }
        if module_test_id:
            module_test = ModuleTest.objects.filter(
                id=module_test_id, course=course, cohort=cohort, module=module
            ).first()
            if not module_test:
                messages.error(request, "The selected module test is outside the chosen course, cohort, or module.")
                return self._hub_redirect("module", **redirect_params)
            for field, value in defaults.items():
                setattr(module_test, field, value)
            module_test.full_clean()
            module_test.save()
            created = False
        else:
            module_test = ModuleTest.objects.filter(
                course=course,
                cohort=cohort,
                module=module,
                question_bank=bank,
                scheduled_at=scheduled_at,
                end_time=end_time,
                is_active=True,
            ).order_by("created_at").first()
            if module_test:
                for field, value in defaults.items():
                    setattr(module_test, field, value)
                module_test.full_clean()
                module_test.save()
                created = False
            else:
                module_test = ModuleTest(**defaults)
                module_test.full_clean()
                module_test.save()
                created = True

        try:
            meet_link, calendar_event_id, meet_created = sync_module_test_google_meet(module_test)
        except ModuleTestMeetError as exc:
            messages.error(request, str(exc))
            return self._hub_redirect("module", **redirect_params)
        except Exception as exc:
            messages.error(
                request,
                f"Google Meet scheduling failed; '{module_test.title}' remains locked. {exc}",
            )
            return self._hub_redirect("module", **redirect_params)

        module_test.meeting_link = meet_link
        module_test.calendar_event_id = calendar_event_id
        module_test.is_released = release_now
        module_test.save(update_fields=[
            "meeting_link", "calendar_event_id", "is_released", "updated_at",
        ])
        action = "Created" if created else "Updated"
        gate = "released" if release_now else "kept locked"
        meet_action = "created" if meet_created else "reused"
        messages.success(
            request,
            f"{action} '{module_test.title}' for {cohort.code}; Google Meet was "
            f"{meet_action} and the gate is {gate}.",
        )
        return self._hub_redirect("module", **redirect_params)

    def extend_window_view(self, request):
        if request.method != "POST":
            return self._hub_redirect("monitor")
        assessment_type = request.POST.get("assessment_type")
        item_id = request.POST.get("item_id")
        try:
            extend_minutes = int(request.POST.get("extend_minutes", 15))
        except (ValueError, TypeError):
            extend_minutes = 15

        if extend_minutes <= 0:
            messages.error(request, "Extension time must be greater than zero minutes.")
            return self._hub_redirect("monitor")
        if assessment_type == "prescreening":
            ps = get_object_or_404(PreScreening, id=item_id)
            current_end = ps.end_time or timezone.now()
            if current_end < timezone.now():
                current_end = timezone.now()
            ps.end_time = current_end + timedelta(minutes=extend_minutes)
            ps.is_released = True
            ps.save(update_fields=["end_time", "is_released", "updated_at"])
            messages.success(request, f"Extended Pre-Screening window for {ps.application.application_number} by {extend_minutes} mins.")
        elif assessment_type == "moduletest":
            mt = get_object_or_404(ModuleTest, id=item_id)
            current_end = mt.end_time or timezone.now()
            if current_end < timezone.now():
                current_end = timezone.now()
            mt.end_time = current_end + timedelta(minutes=extend_minutes)
            mt.is_released = False
            mt.save(update_fields=["end_time", "is_released", "updated_at"])
            try:
                link, event_id, _ = sync_module_test_google_meet(mt)
                mt.meeting_link = link
                mt.calendar_event_id = event_id
                mt.is_released = True
                mt.save(update_fields=[
                    "meeting_link", "calendar_event_id", "is_released", "updated_at",
                ])
            except Exception as exc:
                messages.error(
                    request,
                    f"The window was extended but remains locked because Google Meet could not be prepared: {exc}",
                )
                return self._hub_redirect("monitor")
            messages.success(request, f"Extended Module Test '{mt.title}' window by {extend_minutes} mins.")
        else:
            messages.error(request, "Unknown assessment type; no window was changed.")
        return self._hub_redirect("monitor")

    def close_window_view(self, request):
        if request.method != "POST":
            return self._hub_redirect("monitor")
        assessment_type = request.POST.get("assessment_type")
        item_id = request.POST.get("item_id")

        if assessment_type == "prescreening":
            ps = get_object_or_404(PreScreening, id=item_id)
            ps.end_time = timezone.now()
            ps.is_released = False
            ps.save(update_fields=["end_time", "is_released", "updated_at"])
            messages.warning(request, f"Immediately closed window and locked gate for Pre-Screening {ps.application.application_number}.")
        elif assessment_type == "moduletest":
            mt = get_object_or_404(ModuleTest, id=item_id)
            mt.end_time = timezone.now()
            mt.is_released = False
            mt.save(update_fields=["end_time", "is_released", "updated_at"])
            messages.warning(request, f"Immediately closed window and locked gate for Module Test '{mt.title}'.")
        else:
            messages.error(request, "Unknown assessment type; no window was changed.")
        return self._hub_redirect("monitor")
