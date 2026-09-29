from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.http import HttpResponseRedirect
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join

from cohorts.models import Cohort
from courses.models import Course, CourseModule
from .models import QuestionBank
from .deletion import QuestionBankDeletionError, delete_failed_unused_question_bank
from .cohort_copy import copy_bank_to_same_course_cohorts
from .serializers import QuestionBankDetailSerializer
from .services.ai.validators import question_fingerprint


class CohortSelectWidget(forms.Select):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._cohort_map = None

    def _get_cohort_map(self):
        if self._cohort_map is None:
            self._cohort_map = {
                str(c.id): c
                for c in Cohort.objects.all().select_related("course").only("id", "course_id", "status", "code", "name")
            }
        return self._cohort_map

    def create_option(self, name, value, label, selected, index, subindex=None, attrs=None):
        option = super().create_option(name, value, label, selected, index, subindex=subindex, attrs=attrs)
        val_str = str(value.value if hasattr(value, "value") else value) if value else ""
        if val_str:
            cohort = self._get_cohort_map().get(val_str)
            if cohort:
                option["attrs"]["data-course-id"] = str(cohort.course_id)
                option["attrs"]["data-status"] = cohort.status
        return option


class ModuleSelectWidget(forms.Select):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._module_map = None

    def _get_module_map(self):
        if self._module_map is None:
            self._module_map = {
                str(m.id): m
                for m in CourseModule.objects.all().select_related("course").only("id", "course_id", "module_number", "title")
            }
        return self._module_map

    def create_option(self, name, value, label, selected, index, subindex=None, attrs=None):
        option = super().create_option(name, value, label, selected, index, subindex=subindex, attrs=attrs)
        val_str = str(value.value if hasattr(value, "value") else value) if value else ""
        if val_str:
            module = self._get_module_map().get(val_str)
            if module:
                option["attrs"]["data-course-id"] = str(module.course_id)
                option["attrs"]["data-module-num"] = str(module.module_number)
        return option


class QuestionBankAdminForm(forms.ModelForm):
    MANUAL_SET_CODES = "ABCD"
    MANUAL_QUESTION_HELP = (
        'Enter a JSON list of questions. Each question needs "question", exactly four '
        '"options", and "correct" (the matching option text, A-D, or 1-4). '
        'The question ID and marks are added automatically when omitted.'
    )

    manual_set_a = forms.JSONField(
        label="Paper A questions",
        required=False,
        widget=forms.Textarea(attrs={"rows": 9, "class": "manual-paper-set"}),
        help_text=MANUAL_QUESTION_HELP,
    )
    manual_set_b = forms.JSONField(
        label="Paper B questions",
        required=False,
        widget=forms.Textarea(attrs={"rows": 9, "class": "manual-paper-set"}),
        help_text=MANUAL_QUESTION_HELP,
    )
    manual_set_c = forms.JSONField(
        label="Paper C questions",
        required=False,
        widget=forms.Textarea(attrs={"rows": 9, "class": "manual-paper-set"}),
        help_text=MANUAL_QUESTION_HELP,
    )
    manual_set_d = forms.JSONField(
        label="Paper D questions",
        required=False,
        widget=forms.Textarea(attrs={"rows": 9, "class": "manual-paper-set"}),
        help_text=MANUAL_QUESTION_HELP,
    )
    ai_num_sets = forms.IntegerField(
        label="AI paper sets",
        required=False,
        initial=4,
        min_value=1,
        max_value=10,
        help_text="How many unique AI papers to generate (4 creates Paper A, B, C and D).",
    )

    class Meta:
        model = QuestionBank
        fields = "__all__"
        widgets = {
            "cohort": CohortSelectWidget(),
            "module": ModuleSelectWidget(),
            "title": forms.TextInput(attrs={"placeholder": 'E.g. "[VLSI-DESIGN] Pre-Screening Assessment Paper"'}),
            "sets_data": forms.HiddenInput(),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "course" in self.fields:
            self.fields["course"].queryset = Course.objects.all().order_by("code")
        if "cohort" in self.fields:
            self.fields["cohort"].queryset = Cohort.objects.all().select_related("course").order_by("-created_at")
        if "module" in self.fields:
            self.fields["module"].queryset = CourseModule.objects.all().select_related("course").order_by("course__code", "module_number")
        stored_sets = self.instance.sets_data if self.instance and self.instance.pk else {}
        if isinstance(stored_sets, dict):
            for code in self.MANUAL_SET_CODES:
                paper = stored_sets.get(code, {})
                questions = paper.get("questions", []) if isinstance(paper, dict) else []
                self.fields[f"manual_set_{code.lower()}"].initial = questions or None

    def _normalize_manual_questions(self, code, questions, expected_count):
        if not isinstance(questions, list):
            self.add_error(
                f"manual_set_{code.lower()}",
                f"Paper {code} must be a JSON list of question objects.",
            )
            return None
        if len(questions) != expected_count:
            self.add_error(
                f"manual_set_{code.lower()}",
                f"Paper {code} has {len(questions)} questions; enter exactly {expected_count}.",
            )
            return None

        normalized = []
        seen_ids = set()
        for index, raw_question in enumerate(questions, start=1):
            field_name = f"manual_set_{code.lower()}"
            if not isinstance(raw_question, dict):
                self.add_error(field_name, f"Paper {code}, question {index} must be an object.")
                return None
            question = str(raw_question.get("question") or "").strip()
            options = raw_question.get("options")
            if not question:
                self.add_error(field_name, f"Paper {code}, question {index} needs question text.")
                return None
            if not isinstance(options, list) or len(options) != 4:
                self.add_error(field_name, f"Paper {code}, question {index} needs exactly four options.")
                return None
            options = [str(option).strip() for option in options]
            if any(not option for option in options) or len(set(options)) != 4:
                self.add_error(field_name, f"Paper {code}, question {index} options must be non-empty and distinct.")
                return None

            raw_correct = raw_question.get("correct", raw_question.get("correct_answer"))
            correct_text = str(raw_correct or "").strip()
            if correct_text.upper() in "ABCD" and len(correct_text) == 1:
                correct = options[ord(correct_text.upper()) - ord("A")]
            elif correct_text in {"1", "2", "3", "4"}:
                correct = options[int(correct_text) - 1]
            else:
                correct = correct_text
            if correct not in options:
                self.add_error(
                    field_name,
                    f"Paper {code}, question {index} correct answer must match an option or use A-D/1-4.",
                )
                return None

            question_id = str(raw_question.get("id") or f"{code}-{index}").strip()
            if question_id in seen_ids:
                self.add_error(field_name, f"Paper {code} contains duplicate question ID '{question_id}'.")
                return None
            seen_ids.add(question_id)
            normalized.append(
                {
                    **raw_question,
                    "id": question_id,
                    "question": question,
                    "options": options,
                    "correct": correct,
                    "marks": raw_question.get("marks", 1),
                }
            )
        return normalized

    def clean(self):
        cleaned_data = super().clean()
        ai_requested = "_generate_ai" in self.data
        if ai_requested:
            # The dedicated submit button is the authoritative opt-in.
            cleaned_data["is_ai_generated"] = True
        bank_type = cleaned_data.get("bank_type")
        course = cleaned_data.get("course")
        cohort = cleaned_data.get("cohort")
        module = cleaned_data.get("module")

        if not cleaned_data.get("is_ai_generated"):
            expected_count = int(cleaned_data.get("total_questions_per_set") or 0)
            manual_sets = {}
            for code in self.MANUAL_SET_CODES:
                questions = cleaned_data.get(f"manual_set_{code.lower()}")
                if questions in (None, ""):
                    continue
                normalized = self._normalize_manual_questions(code, questions, expected_count)
                if normalized is not None:
                    manual_sets[code] = {
                        "label": f"Paper {code}",
                        "questions": normalized,
                    }
            if not manual_sets:
                self.add_error(
                    "manual_set_a",
                    "AI generation is off. Enter questions for at least one manual paper set.",
                )
            question_locations = {}
            for code, paper in manual_sets.items():
                for index, question in enumerate(paper["questions"], start=1):
                    fingerprint = question_fingerprint(question.get("question"))
                    previous = question_locations.get(fingerprint)
                    if previous:
                        self.add_error(
                            f"manual_set_{code.lower()}",
                            f"This question duplicates {previous}. Every paper must use different questions.",
                        )
                    else:
                        question_locations[fingerprint] = f"Paper {code} question {index}"
            cleaned_data["sets_data"] = manual_sets

        if bank_type == QuestionBank.BankType.PRESCREENING:
            # Pre-Screening: Module is cleared
            cleaned_data["module"] = None
            if course and not cleaned_data.get("source_topics"):
                # Auto-populate from Course.course_prerequisites
                if course.course_prerequisites and isinstance(course.course_prerequisites, list):
                    cleaned_data["source_topics"] = course.course_prerequisites
                elif course.prerequisites:
                    cleaned_data["source_topics"] = [p.strip() for p in course.prerequisites.split(",") if p.strip()]

            if cohort and course:
                if cohort.course_id != course.id:
                    self.add_error("cohort", f"Selected cohort '{cohort.code}' does not belong to course '{course.code}'.")
                elif cohort.status not in [Cohort.Status.OPEN, Cohort.Status.DRAFT]:
                    self.add_error("cohort", f"Pre-Screening cohorts must be in 'OPEN' status. '{cohort.code}' is '{cohort.get_status_display()}'.")

        elif bank_type == QuestionBank.BankType.MODULE_TEST:
            # Module Test: Cohort & Module are strictly required
            if not cohort:
                self.add_error("cohort", "Cohort is strictly required for Module Test question banks.")
            elif course and cohort.course_id != course.id:
                self.add_error("cohort", f"Selected cohort '{cohort.code}' does not belong to course '{course.code}'.")
            elif cohort.status not in [Cohort.Status.ACTIVE, Cohort.Status.TRAINING, Cohort.Status.INTERNSHIP, Cohort.Status.SOFT_SKILLS]:
                self.add_error(
                    "cohort",
                    f"Module Test cohorts must be in 'ACTIVE' or 'TRAINING' status. '{cohort.code}' is currently '{cohort.get_status_display()}'.",
                )

            if not module:
                self.add_error("module", "Course Module is strictly required for Module Test question banks.")
            elif course and module.course_id != course.id:
                self.add_error("module", f"Selected module '{module.title}' does not belong to course '{course.code}'.")
            elif module and not cleaned_data.get("source_topics"):
                # Auto-populate from CourseModule.topics
                if module.topics and isinstance(module.topics, list):
                    cleaned_data["source_topics"] = module.topics

        if ai_requested and course and bank_type:
            duplicate_scope = QuestionBank.objects.filter(
                bank_type=bank_type,
                course=course,
                cohort=cohort,
                module=cleaned_data.get("module"),
                exam=cleaned_data.get("exam"),
                module_test=cleaned_data.get("module_test"),
                status__in=[
                    QuestionBank.Status.GENERATING,
                    QuestionBank.Status.PROCESSING,
                    QuestionBank.Status.APPROVED,
                ],
                lifecycle_status__in=[
                    QuestionBank.LifecycleStatus.DRAFT,
                    QuestionBank.LifecycleStatus.OPEN,
                ],
            )
            if self.instance and self.instance.pk:
                duplicate_scope = duplicate_scope.exclude(pk=self.instance.pk)
            existing = duplicate_scope.order_by("-updated_at").first()
            if existing:
                self.add_error(
                    "bank_type",
                    "AI papers already exist or are being generated for this exact "
                    f"course/cohort/module scope: {existing.title}. Open that Question Bank instead.",
                )

        return cleaned_data


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    form = QuestionBankAdminForm
    change_form_template = "admin/question_bank/questionbank/change_form.html"

    list_display = (
        "title",
        "bank_type",
        "course_code",
        "cohort_code",
        "difficulty",
        "total_sets_display",
        "total_questions_per_set",
        "is_ai_generated",
        "is_active",
        "created_at",
    )
    list_filter = ("bank_type", "difficulty", "is_ai_generated", "is_active", "course")
    search_fields = ("title", "course__code", "course__name", "cohort__code")
    readonly_fields = (
        "course_prerequisites_display",
        "set_codes_display",
        "total_sets_display",
        "source_topics_display",
        "paper_sets_preview",
        "status",
        "lifecycle_status",
        "error_message",
        "is_active",
    )
    list_select_related = ("course", "cohort", "module", "exam", "module_test")
    autocomplete_fields = ("exam", "module_test", "created_by")
    list_per_page = 25
    ordering = ("-created_at",)
    actions = ["seed_selected_courses_from_backup_action"]

    @admin.action(description="📥 Load / Overwrite from Curated Backup Repository (50 Questions)")
    def seed_selected_courses_from_backup_action(self, request, queryset):
        from .services.backup_loader import seed_curated_question_bank_for_course
        success_count = 0
        for bank in queryset:
            if bank.course:
                updated_bank = seed_curated_question_bank_for_course(
                    course=bank.course,
                    num_sets=4,
                    questions_per_set=bank.total_questions_per_set or 10,
                    bank_type=bank.bank_type,
                )
                if updated_bank:
                    success_count += 1
        self.message_user(
            request,
            f"Successfully updated {success_count} Question Bank(s) from official curated backup repository.",
            messages.SUCCESS,
        )

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<path:object_id>/publish-verified/",
                self.admin_site.admin_view(self.publish_verified_view),
                name="question-bank-publish-verified",
            ),
            path(
                "<path:object_id>/close-bank/",
                self.admin_site.admin_view(self.close_bank_view),
                name="question-bank-close",
            ),
            path(
                "<path:object_id>/delete-failed-unused/",
                self.admin_site.admin_view(self.delete_failed_unused_view),
                name="question-bank-delete-failed-unused",
            ),
            path(
                "<path:object_id>/copy-to-course-cohorts/",
                self.admin_site.admin_view(self.copy_to_course_cohorts_view),
                name="question-bank-copy-to-course-cohorts",
            ),
        ]
        return custom_urls + urls

    def copy_to_course_cohorts_view(self, request, object_id):
        bank = self.get_object(request, object_id)
        change_url = reverse("admin:question_bank_questionbank_change", args=[object_id])
        if not bank:
            self.message_user(request, "Question Bank not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:question_bank_questionbank_changelist"))
        if not self.has_add_permission(request) or not self.has_change_permission(request, bank):
            raise PermissionDenied
        if request.method != "POST":
            self.message_user(request, "Use the Share with course cohorts button.", messages.WARNING)
            return HttpResponseRedirect(change_url)
        try:
            result = copy_bank_to_same_course_cohorts(bank, created_by=request.user)
        except ValidationError as exc:
            self.message_user(request, "; ".join(exc.messages), messages.ERROR)
            return HttpResponseRedirect(change_url)
        if result["course_wide"]:
            self.message_user(
                request,
                "Pre-screening papers are already course-wide and are reused for every applicant in this course; no duplicate banks were created.",
                messages.SUCCESS,
            )
        else:
            self.message_user(
                request,
                f"Created {len(result['created'])} cohort draft bank(s); reused {len(result['reused'])} existing same-scope bank(s). Review and publish each cohort draft when ready.",
                messages.SUCCESS,
            )
        return HttpResponseRedirect(change_url)

    def publish_verified_view(self, request, object_id):
        bank = self.get_object(request, object_id)
        change_url = reverse("admin:question_bank_questionbank_change", args=[object_id])
        if not bank:
            self.message_user(request, "Question Bank not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:question_bank_questionbank_changelist"))
        if not self.has_change_permission(request, bank):
            raise PermissionDenied
        if request.method != "POST":
            self.message_user(request, "Use the Publish verified papers button.", messages.WARNING)
            return HttpResponseRedirect(change_url)

        try:
            with transaction.atomic():
                Course.objects.select_for_update().get(pk=bank.course_id)
                bank = QuestionBank.objects.select_for_update().get(pk=bank.pk)
                if bank.status != QuestionBank.Status.APPROVED:
                    raise ValidationError("Only an approved Question Bank can be published.")
                if not isinstance(bank.sets_data, dict) or not bank.sets_data:
                    raise ValidationError("The Question Bank has no stored paper sets.")
                try:
                    QuestionBankDetailSerializer().validate_sets_data(bank.sets_data)
                except Exception as exc:
                    raise ValidationError(f"The stored paper structure is invalid: {exc}") from exc
                expected = int(bank.total_questions_per_set or 0)
                for code, paper in bank.sets_data.items():
                    questions = paper.get("questions", []) if isinstance(paper, dict) else []
                    if len(questions) != expected:
                        raise ValidationError(
                            f"Paper {code} has {len(questions)} questions; expected {expected}."
                        )

                competing = QuestionBank.objects.select_for_update().exclude(pk=bank.pk)
                if bank.bank_type == QuestionBank.BankType.PRESCREENING:
                    if bank.exam_id:
                        competing = competing.filter(exam_id=bank.exam_id)
                    else:
                        competing = competing.filter(
                            bank_type=bank.bank_type,
                            course_id=bank.course_id,
                            cohort_id=bank.cohort_id,
                            exam__isnull=True,
                        )
                elif bank.module_test_id:
                    competing = competing.filter(module_test_id=bank.module_test_id)
                else:
                    competing = competing.filter(
                        bank_type=bank.bank_type,
                        course_id=bank.course_id,
                        cohort_id=bank.cohort_id,
                        module_id=bank.module_id,
                        module_test__isnull=True,
                    )
                competing.update(
                    lifecycle_status=QuestionBank.LifecycleStatus.CLOSED,
                    is_active=False,
                )
                bank.lifecycle_status = QuestionBank.LifecycleStatus.OPEN
                bank.is_active = True
                bank.error_message = None
                bank.save(update_fields=[
                    "lifecycle_status", "is_active", "error_message", "updated_at",
                ])
                if bank.module_test_id:
                    bank.module_test.__class__.objects.filter(pk=bank.module_test_id).update(
                        question_bank=bank
                    )
        except ValidationError as exc:
            self.message_user(request, "; ".join(exc.messages), messages.ERROR)
            return HttpResponseRedirect(change_url)

        self.message_user(
            request,
            "Verified papers are now published and available in the exam scheduling dropdown.",
            messages.SUCCESS,
        )
        return HttpResponseRedirect(change_url)

    def delete_failed_unused_view(self, request, object_id):
        bank = self.get_object(request, object_id)
        change_url = reverse("admin:question_bank_questionbank_change", args=[object_id])
        if not bank:
            self.message_user(request, "Question Bank not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:question_bank_questionbank_changelist"))
        if not self.has_delete_permission(request, bank):
            raise PermissionDenied
        if request.method != "POST":
            self.message_user(request, "Use the Delete failed unused bank button.", messages.WARNING)
            return HttpResponseRedirect(change_url)
        try:
            result = delete_failed_unused_question_bank(bank)
        except QuestionBankDeletionError as exc:
            self.message_user(request, str(exc), messages.ERROR)
            return HttpResponseRedirect(change_url)
        self.message_user(
            request,
            "Deleted the failed unused Question Bank. "
            f"Detached {result['detached_schedules']} locked schedule(s) and removed "
            f"{result['removed_rooms']} empty legacy room(s).",
            messages.SUCCESS,
        )
        return HttpResponseRedirect(reverse("admin:question_bank_questionbank_changelist"))

    def close_bank_view(self, request, object_id):
        bank = self.get_object(request, object_id)
        change_url = reverse("admin:question_bank_questionbank_change", args=[object_id])
        if not bank:
            self.message_user(request, "Question Bank not found.", messages.ERROR)
            return HttpResponseRedirect(reverse("admin:question_bank_questionbank_changelist"))
        if not self.has_change_permission(request, bank):
            raise PermissionDenied
        if request.method != "POST":
            self.message_user(request, "Use the Close Question Bank button.", messages.WARNING)
            return HttpResponseRedirect(change_url)
        QuestionBank.objects.filter(pk=bank.pk).update(
            lifecycle_status=QuestionBank.LifecycleStatus.CLOSED,
            is_active=False,
        )
        self.message_user(request, "Question Bank closed.", messages.SUCCESS)
        return HttpResponseRedirect(change_url)

    fieldsets = (
        (
            "Bank Identity",
            {
                "fields": (
                    "bank_type", "title", "description", "difficulty", "status",
                    "lifecycle_status", "is_active", "error_message",
                ),
                "description": "Select Pre-Screening (for prerequisite entrance test) or Module Test (for cohort module exam).",
            },
        ),
        (
            "Course & Cohort Hierarchy",
            {
                "fields": ("course", "cohort", "module", "course_prerequisites_display"),
                "description": (
                    "• Pre-Screening: Only Course is required. Topics auto-load from Course prerequisites.<br>"
                    "• Module Test: Course, Cohort (ACTIVE cohorts only), and Module are strictly required."
                ),
            },
        ),
        (
            "Linked Assessment (UUID Lookups)",
            {
                "fields": ("exam", "module_test"),
                "description": "Link this question bank directly to a Pre-Screening Exam UUID or Module Test UUID.",
                "classes": ("collapse",),
            },
        ),
        (
            "Question Configuration",
            {
                "fields": (
                    "total_questions_per_set",
                    "ai_num_sets",
                    "source_topics",
                    "source_topics_display",
                    "is_ai_generated",
                ),
            },
        ),
        (
            "Manual Paper Sets",
            {
                "fields": (
                    "sets_data", "manual_set_a", "manual_set_b", "manual_set_c",
                    "manual_set_d", "set_codes_display", "total_sets_display",
                ),
                "description": (
                    "When AI Generated is off, enter one or more papers below. Example question: "
                    '<code>{"question":"2 + 2?","options":["3","4","5","6"],"correct":"B"}</code>. '
                    "The backend converts these inputs into the required A/B/C/D structure."
                ),
            },
        ),
        (
            "Stored Examination Papers",
            {
                "fields": ("paper_sets_preview",),
                "description": (
                    "The exact questions stored for the examination, including the answer key "
                    "and independent AI-verifier result. These are persisted only after all "
                    "questions pass validation."
                ),
            },
        ),
        ("Ownership", {"fields": ("created_by",)}),
    )

    @admin.display(ordering="course__code", description="Course")
    def course_code(self, obj):
        return obj.course.code if obj.course else "-"

    @admin.display(ordering="cohort__code", description="Cohort")
    def cohort_code(self, obj):
        return obj.cohort.code if obj.cohort else "-"

    @admin.display(description="Course Prerequisites (Read-Only)")
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
        return "Select a course to view prerequisite topics."

    @admin.display(description="Sets")
    def total_sets_display(self, obj):
        count = obj.total_sets
        if count:
            codes = ", ".join(obj.set_codes)
            return format_html('<span title="{}">{} sets</span>', codes, count)
        return "0 sets"

    @admin.display(description="Source Topics")
    def source_topics_display(self, obj):
        if obj.source_topics:
            topics = obj.source_topics if isinstance(obj.source_topics, list) else []
            return ", ".join(str(t) for t in topics) if topics else "-"
        return "-"

    @admin.display(description="Set Codes")
    def set_codes_display(self, obj):
        codes = obj.set_codes
        return ", ".join(codes) if codes else "No sets"

    @admin.display(description="Question and answer preview")
    def paper_sets_preview(self, obj):
        if not obj or not obj.pk or not isinstance(obj.sets_data, dict) or not obj.sets_data:
            return "No stored examination questions yet."
        rows = []
        for set_code in sorted(obj.sets_data):
            paper = obj.sets_data.get(set_code) or {}
            for index, question in enumerate(paper.get("questions", []), start=1):
                options = question.get("options") or []
                rows.append((
                    set_code,
                    index,
                    question.get("question") or "",
                    " | ".join(str(option) for option in options),
                    question.get("correct", question.get("correct_answer", "")),
                    question.get("verifier_result", "Manual"),
                    question.get("confidence", "—"),
                ))
        if not rows:
            return "No stored examination questions yet."
        body = format_html_join(
            "",
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            rows,
        )
        return format_html(
            "<table><thead><tr><th>Paper</th><th>#</th><th>Question</th>"
            "<th>Options</th><th>Correct answer</th><th>Verifier</th>"
            "<th>Confidence</th></tr></thead><tbody>{}</tbody></table>",
            body,
        )

    def _queue_ai_generation_once(self, request, obj):
        with transaction.atomic():
            # Serialize generation for a course so concurrent clicks cannot
            # dispatch two jobs for the same assessment scope.
            Course.objects.select_for_update().get(pk=obj.course_id)
            bank = QuestionBank.objects.select_for_update().get(pk=obj.pk)
            existing = QuestionBank.objects.select_for_update().filter(
                bank_type=bank.bank_type,
                course=bank.course,
                cohort=bank.cohort,
                module=bank.module,
                exam=bank.exam,
                module_test=bank.module_test,
                status__in=[
                    QuestionBank.Status.GENERATING,
                    QuestionBank.Status.PROCESSING,
                    QuestionBank.Status.APPROVED,
                ],
                lifecycle_status__in=[
                    QuestionBank.LifecycleStatus.DRAFT,
                    QuestionBank.LifecycleStatus.OPEN,
                ],
            ).exclude(pk=bank.pk).order_by("-updated_at").first()
            if existing:
                self.message_user(
                    request,
                    "AI papers already exist or are being generated for this exact scope. "
                    f"Reusing '{existing.title}' instead of posting a duplicate job.",
                    level=messages.WARNING,
                )
                return existing
            if not bank.is_ai_generated:
                self.message_user(
                    request,
                    "Enable AI Generated before requesting AI papers.",
                    level=messages.ERROR,
                )
                return bank
            if bank.status in {
                QuestionBank.Status.GENERATING,
                QuestionBank.Status.PROCESSING,
            }:
                self.message_user(
                    request,
                    "AI generation is already running for this question bank.",
                    level=messages.WARNING,
                )
                return bank
            if bank.sets_data:
                self.message_user(
                    request,
                    "This question bank already has stored papers; no duplicate generation was posted.",
                    level=messages.WARNING,
                )
                return bank
            bank.status = QuestionBank.Status.GENERATING
            bank.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
            bank.is_active = False
            bank.error_message = None
            bank.save(update_fields=[
                "status", "lifecycle_status", "is_active", "error_message", "updated_at",
            ])

        from .tasks import generate_question_bank_task
        try:
            num_sets = min(10, max(1, int(request.POST.get("ai_num_sets") or 4)))
        except (TypeError, ValueError):
            num_sets = 4
        try:
            generate_question_bank_task.delay(
                str(bank.pk), num_sets=num_sets,
                questions_per_set=bank.total_questions_per_set,
            )
        except Exception:
            generate_question_bank_task(
                str(bank.pk), num_sets=num_sets,
                questions_per_set=bank.total_questions_per_set,
            )
        self.message_user(
            request,
            "AI generation was posted once. Every generated answer must agree with the independent verifier before the papers are stored.",
            level=messages.SUCCESS,
        )
        return bank

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        review_fields = {
            "bank_type", "course", "cohort", "module", "exam", "module_test",
            "difficulty", "source_topics", "sets_data", "total_questions_per_set",
            "manual_set_a", "manual_set_b", "manual_set_c", "manual_set_d",
        }
        if not change or review_fields.intersection(form.changed_data):
            obj.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
            obj.is_active = False
        super().save_model(request, obj, form, change)

    def response_add(self, request, obj, post_url_continue=None):
        if "_generate_ai" in request.POST:
            target = self._queue_ai_generation_once(request, obj)
            return HttpResponseRedirect(
                reverse("admin:question_bank_questionbank_change", args=((target or obj).pk,))
            )
        return super().response_add(request, obj, post_url_continue)

    def response_change(self, request, obj):
        if "_generate_ai" in request.POST:
            target = self._queue_ai_generation_once(request, obj)
            return HttpResponseRedirect(
                reverse("admin:question_bank_questionbank_change", args=((target or obj).pk,))
            )
        return super().response_change(request, obj)

