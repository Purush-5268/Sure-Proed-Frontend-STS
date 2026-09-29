from django.db.models import Q
from django.db import transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.models import Exam, ModuleTest
from .models import QuestionBank
from .deletion import (
    QuestionBankDeletionError,
    delete_failed_unused_question_bank,
    has_question_bank_attempt_history,
)
from .serializers import (
    GenerateQuestionBankSerializer,
    PaperSetSerializer,
    QuestionBankDetailSerializer,
    QuestionBankListSerializer,
)


class IsQuestionBankAdministrator(BasePermission):
    """Question creation and answer keys are restricted to actual administrators."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or getattr(user, "role", "") in ["ADMIN", "MENTOR"])
        )


class QuestionBankViewSet(viewsets.ModelViewSet):
    """
    CRUD + paper-set retrieval + AI generation for Question Banks.

    Endpoints:
      GET    /api/question-banks/                              — list all banks
      POST   /api/question-banks/                              — create a bank
      GET    /api/question-banks/{id}/                          — detail
      PATCH  /api/question-banks/{id}/                          — partial update
      DELETE /api/question-banks/{id}/                          — delete
      GET    /api/question-banks/{id}/paper/{set_code}/         — get a single paper set
      GET    /api/question-banks/by-cohort/{cohort_id}/         — get active bank by cohort UUID
      GET    /api/question-banks/by-exam/{exam_id}/             — get active bank by exam UUID
      POST   /api/question-banks/generate/                      — generate question bank (AI placeholder)
    """

    permission_classes = [IsAuthenticated, IsQuestionBankAdministrator]
    lookup_field = "pk"
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["course", "bank_type", "status", "cohort", "module", "exam", "module_test", "is_active", "is_ai_generated"]

    def destroy(self, request, *args, **kwargs):
        bank = self.get_object()
        if bank.status == QuestionBank.Status.FAILED:
            try:
                delete_failed_unused_question_bank(bank)
            except QuestionBankDeletionError as exc:
                return Response(
                    {"detail": str(exc)}, status=status.HTTP_409_CONFLICT
                )
            return Response(status=status.HTTP_204_NO_CONTENT)
        if bank.lifecycle_status == QuestionBank.LifecycleStatus.OPEN or bank.is_active:
            return Response(
                {"detail": "Close this question bank before deleting it."},
                status=status.HTTP_409_CONFLICT,
            )
        if bank.status in {QuestionBank.Status.GENERATING, QuestionBank.Status.PROCESSING}:
            return Response(
                {"detail": "A question bank cannot be deleted while generation is running."},
                status=status.HTTP_409_CONFLICT,
            )
        has_attempt_history = has_question_bank_attempt_history(bank)
        if has_attempt_history:
            return Response(
                {"detail": "This bank has exam attempts and must be retained for audit."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            with transaction.atomic():
                # Empty generated rooms are configuration, not exam history. Remove
                # them first so an unused closed bank can be deleted cleanly.
                bank.proctoring_rooms.all().delete()
                bank.delete()
        except (ProtectedError, RestrictedError):
            return Response(
                {"detail": "This bank is referenced by operational records and must be retained for audit."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        qs = QuestionBank.objects.select_related(
            "course", "cohort", "module", "exam", "module_test", "created_by"
        )

        # Filter by bank_type
        bank_type = self.request.query_params.get("bank_type")
        if bank_type:
            qs = qs.filter(bank_type=bank_type.upper())

        # Filter by course
        course_id = self.request.query_params.get("course")
        if course_id:
            qs = qs.filter(course_id=course_id)

        # Filter by cohort
        cohort_id = self.request.query_params.get("cohort")
        if cohort_id:
            qs = qs.filter(cohort_id=cohort_id)

        # Filter by module
        module_id = self.request.query_params.get("module")
        if module_id:
            qs = qs.filter(module_id=module_id)

        # Filter by exam
        exam_id = self.request.query_params.get("exam")
        if exam_id:
            qs = qs.filter(exam_id=exam_id)

        # Filter by module_test
        module_test_id = self.request.query_params.get("module_test")
        if module_test_id:
            qs = qs.filter(module_test_id=module_test_id)

        # Filter by active status
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ("true", "1"))

        # Filter by is_ai_generated
        is_ai_generated = self.request.query_params.get("is_ai_generated")
        if is_ai_generated is not None:
            qs = qs.filter(is_ai_generated=is_ai_generated.lower() in ("true", "1"))

        # Search
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(course__code__icontains=search)
                | Q(course__name__icontains=search)
                | Q(cohort__code__icontains=search)
            )

        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return QuestionBankListSerializer
        return QuestionBankDetailSerializer

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
            is_active=False,
        )

    def perform_update(self, serializer):
        bank = serializer.instance
        if bank.status in {
            QuestionBank.Status.GENERATING,
            QuestionBank.Status.PROCESSING,
        }:
            raise ValidationError(
                {"detail": "A question bank cannot be edited while AI generation is running."}
            )
        review_fields = {
            "bank_type", "course", "cohort", "module", "exam", "module_test",
            "difficulty", "source_topics", "sets_data", "total_questions_per_set",
        }
        requires_republish = bool(review_fields.intersection(serializer.validated_data))
        serializer.save(
            lifecycle_status=(
                QuestionBank.LifecycleStatus.DRAFT
                if requires_republish
                else bank.lifecycle_status
            ),
            is_active=False if requires_republish else bank.is_active,
        )

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        """Atomically open one validated bank and close competing banks in its scope."""
        visible_bank = self.get_object()
        with transaction.atomic():
            Course.objects.select_for_update().get(pk=visible_bank.course_id)
            if visible_bank.module_test_id:
                ModuleTest.objects.select_for_update().get(pk=visible_bank.module_test_id)
            # Lock only the bank row. PostgreSQL rejects FOR UPDATE when the
            # query outer-joins nullable scope relations such as exam/cohort.
            # Related records that coordinate publication are locked explicitly
            # above, and serializers can load the remaining relations normally.
            bank = QuestionBank.objects.select_for_update().get(pk=visible_bank.pk)
            if bank.status != QuestionBank.Status.APPROVED:
                return Response(
                    {"detail": "Only an approved question bank can be opened."},
                    status=status.HTTP_409_CONFLICT,
                )
            expected = int(bank.total_questions_per_set or 0)
            if not isinstance(bank.sets_data, dict) or not bank.sets_data:
                return Response(
                    {"detail": "The question bank has no stored paper sets."},
                    status=status.HTTP_409_CONFLICT,
                )
            try:
                QuestionBankDetailSerializer().validate_sets_data(bank.sets_data)
            except ValidationError as exc:
                return Response(
                    {"detail": f"The stored paper structure is invalid: {exc.detail}"},
                    status=status.HTTP_409_CONFLICT,
                )
            for code, paper in bank.sets_data.items():
                questions = paper.get("questions", []) if isinstance(paper, dict) else []
                if len(questions) != expected:
                    return Response(
                        {"detail": f"Paper {code} has {len(questions)} questions; expected {expected}."},
                        status=status.HTTP_409_CONFLICT,
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
            bank.save(update_fields=["lifecycle_status", "is_active", "error_message", "updated_at"])
            if bank.module_test_id:
                ModuleTest.objects.filter(pk=bank.module_test_id).update(question_bank=bank)

        return Response(self.get_serializer(bank).data)

    @action(detail=True, methods=["post"], url_path="regenerate")
    def regenerate(self, request, pk=None):
        """Replace a closed/draft bank with newly generated, globally unique paper sets."""
        visible_bank = self.get_object()
        with transaction.atomic():
            bank = QuestionBank.objects.select_for_update().get(pk=visible_bank.pk)
            if bank.lifecycle_status == QuestionBank.LifecycleStatus.OPEN or bank.is_active:
                return Response(
                    {"detail": "Close this question bank before regenerating its papers."},
                    status=status.HTTP_409_CONFLICT,
                )
            if bank.status in {QuestionBank.Status.GENERATING, QuestionBank.Status.PROCESSING}:
                return Response(
                    {"detail": "Question generation is already running for this bank."},
                    status=status.HTTP_409_CONFLICT,
                )

            requested_sets = request.data.get("num_sets")
            try:
                num_sets = int(requested_sets or len(bank.sets_data or {}) or 4)
                questions_per_set = int(
                    request.data.get("questions_per_set") or bank.total_questions_per_set or 10
                )
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Paper-set and question counts must be whole numbers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not 1 <= num_sets <= 10:
                return Response(
                    {"detail": "Paper-set count must be between 1 and 10."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not 5 <= questions_per_set <= 50:
                return Response(
                    {"detail": "Questions per set must be between 5 and 50."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            bank.sets_data = {}
            bank.total_questions_per_set = questions_per_set
            bank.is_ai_generated = True
            bank.status = QuestionBank.Status.GENERATING
            bank.lifecycle_status = QuestionBank.LifecycleStatus.DRAFT
            bank.is_active = False
            bank.error_message = None
            bank.save(update_fields=[
                "sets_data", "total_questions_per_set", "is_ai_generated",
                "status", "lifecycle_status", "is_active", "error_message", "updated_at",
            ])

        from .tasks import generate_question_bank_task, schedule_failed_question_bank_cleanup
        try:
            generate_question_bank_task.delay(bank.id, num_sets, questions_per_set)
        except Exception:
            try:
                generate_question_bank_task(bank.id, num_sets, questions_per_set)
                bank.refresh_from_db()
            except Exception as sync_err:
                bank.status = QuestionBank.Status.FAILED
                bank.error_message = f"Regeneration failed with {sync_err.__class__.__name__}."
                bank.save(update_fields=["status", "error_message", "updated_at"])
                schedule_failed_question_bank_cleanup(bank.id)

        return Response(
            QuestionBankDetailSerializer(bank, context=self.get_serializer_context()).data,
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["post"], url_path="close")
    @transaction.atomic
    def close(self, request, pk=None):
        bank = QuestionBank.objects.select_for_update().get(pk=self.get_object().pk)
        bank.lifecycle_status = QuestionBank.LifecycleStatus.CLOSED
        bank.is_active = False
        bank.save(update_fields=["lifecycle_status", "is_active", "updated_at"])
        return Response(self.get_serializer(bank).data)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"paper/(?P<set_code>[A-Za-z])",
        url_name="paper-set",
    )
    def paper(self, request, pk=None, set_code=None):
        """
        Retrieve a single paper set (e.g. Paper A, B, C, D) for frontend rendering.

        GET /api/question-banks/{id}/paper/A/
        """
        question_bank = self.get_object()
        set_code_upper = set_code.upper()

        paper_set = question_bank.get_paper_set(set_code_upper)
        if paper_set is None:
            available = ", ".join(question_bank.set_codes) or "none"
            return Response(
                {
                    "detail": f"Paper set '{set_code_upper}' not found. Available sets: {available}.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        data = {
            "set_code": set_code_upper,
            "label": paper_set.get("label", f"Paper {set_code_upper}"),
            "questions": paper_set.get("questions", []),
            "total_questions": len(paper_set.get("questions", [])),
            "bank_title": question_bank.title,
            "bank_type": question_bank.bank_type,
            "course_code": question_bank.course.code,
            "difficulty": question_bank.difficulty,
        }
        # This viewset is restricted to administrators. They need the answer key
        # to review human- or AI-authored questions before opening the bank.
        serializer = PaperSetSerializer(data, context={"include_answers": True})
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path=r"by-cohort/(?P<cohort_id>[0-9a-fA-F-]+)",
        url_name="by-cohort",
    )
    def by_cohort(self, request, cohort_id=None):
        """
        Retrieve question banks assigned to a specific cohort UUID.

        GET /api/question-banks/by-cohort/<cohort_uuid>/
        """
        banks = self.get_queryset().filter(cohort_id=cohort_id, is_active=True)
        serializer = QuestionBankListSerializer(banks, many=True)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path=r"by-exam/(?P<exam_id>[0-9a-fA-F-]+)",
        url_name="by-exam",
    )
    def by_exam(self, request, exam_id=None):
        """
        Retrieve question bank assigned to a specific Pre-Screening Exam UUID.

        GET /api/question-banks/by-exam/<exam_uuid>/
        """
        bank = self.get_queryset().filter(exam_id=exam_id, is_active=True).first()
        if not bank:
            return Response(
                {"detail": f"No active question bank linked to exam '{exam_id}'."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = QuestionBankDetailSerializer(bank)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["post"],
        url_path="generate",
        url_name="generate",
    )
    def generate(self, request):
        """
        Generate a question bank with paper sets linked to course/cohort/exam UUIDs.

        POST /api/question-banks/generate/
        {
            "course_id": "<uuid>",
            "bank_type": "PRESCREENING" | "MODULE_TEST",
            "cohort_id": "<uuid>",       // optional for PRESCREENING, required for MODULE_TEST
            "module_id": "<uuid>",        // required for MODULE_TEST
            "exam_id": "<uuid>",          // optional Pre-Screening Exam UUID
            "module_test_id": "<uuid>",   // optional Module Test UUID
            "num_sets": 4,
            "questions_per_set": 10,
            "difficulty": "EASY",
            "title": "Optional custom title"
        }
        """
        input_serializer = GenerateQuestionBankSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        course = Course.objects.get(id=data["course_id"])
        cohort = Cohort.objects.get(id=data["cohort_id"]) if data.get("cohort_id") else None
        module = CourseModule.objects.get(id=data["module_id"]) if data.get("module_id") else None
        exam = Exam.objects.get(id=data["exam_id"]) if data.get("exam_id") else None
        module_test = ModuleTest.objects.get(id=data["module_test_id"]) if data.get("module_test_id") else None

        bank_type = data["bank_type"]
        num_sets = data.get("num_sets", 4)
        questions_per_set = data.get("questions_per_set", 10)

        # Determine difficulty
        difficulty = data.get("difficulty")
        if not difficulty:
            difficulty = (
                QuestionBank.Difficulty.EASY
                if bank_type == QuestionBank.BankType.PRESCREENING
                else QuestionBank.Difficulty.MEDIUM
            )

        # Determine source topics
        if bank_type == QuestionBank.BankType.PRESCREENING:
            source_topics = course.course_prerequisites or []
        elif module:
            source_topics = module.topics or []
        else:
            source_topics = []

        # Determine title
        title = data.get("title")
        if not title:
            if bank_type == QuestionBank.BankType.PRESCREENING:
                cohort_suffix = f" — {cohort.code}" if cohort else ""
                title = f"{course.name}{cohort_suffix} — Pre-Screening Question Bank"
            else:
                module_label = module.title if module else "Module"
                title = f"{course.name} — {module_label} Test Question Bank"

        # Serialize generation requests by course so repeated/concurrent POSTs
        # reuse one bank for the exact assessment scope.
        with transaction.atomic():
            Course.objects.select_for_update().get(pk=course.pk)
            reusable = QuestionBank.objects.select_for_update().filter(
                bank_type=bank_type,
                course=course,
                cohort=cohort,
                module=module,
                exam=exam,
                module_test=module_test,
                status__in=[
                    QuestionBank.Status.GENERATING,
                    QuestionBank.Status.PROCESSING,
                    QuestionBank.Status.APPROVED,
                ],
                lifecycle_status__in=[
                    QuestionBank.LifecycleStatus.DRAFT,
                    QuestionBank.LifecycleStatus.OPEN,
                ],
            ).order_by("-created_at").first()
            if reusable:
                output_serializer = QuestionBankDetailSerializer(
                    reusable, context=self.get_serializer_context()
                )
                response = Response(output_serializer.data, status=status.HTTP_200_OK)
                response["X-Question-Bank-Reused"] = "true"
                return response

            question_bank = QuestionBank.objects.create(
                bank_type=bank_type,
                course=course,
                cohort=cohort,
                module=module,
                exam=exam,
                module_test=module_test,
                title=title,
                difficulty=difficulty,
                source_topics=source_topics,
                sets_data={},  # Populated only after generator + verifier approval.
                total_questions_per_set=questions_per_set,
                is_ai_generated=True,
                is_active=False,
                status=QuestionBank.Status.GENERATING,
                lifecycle_status=QuestionBank.LifecycleStatus.DRAFT,
                created_by=request.user,
            )

        from .tasks import generate_question_bank_task, schedule_failed_question_bank_cleanup
        try:
            generate_question_bank_task.delay(question_bank.id, num_sets, questions_per_set)
        except Exception:
            # Synchronous fallback if Celery/Redis is offline
            try:
                generate_question_bank_task(question_bank.id, num_sets, questions_per_set)
                question_bank.refresh_from_db()
            except Exception as sync_err:
                question_bank.status = QuestionBank.Status.FAILED
                question_bank.error_message = str(sync_err)
                question_bank.save(update_fields=["status", "error_message", "updated_at"])
                schedule_failed_question_bank_cleanup(question_bank.id)

        output_serializer = QuestionBankDetailSerializer(
            question_bank, context=self.get_serializer_context()
        )
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=["post"],
        url_path="create-manual",
        url_name="create-manual",
    )
    def create_manual(self, request):
        """
        Create a QuestionBank manually with direct questions and optional images.
        """
        data = request.data
        course_id = data.get("course_id")
        if not course_id:
            return Response({"error": "course_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        course = Course.objects.filter(id=course_id).first()
        if not course:
            return Response({"error": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        bank_type = data.get("bank_type", QuestionBank.BankType.PRESCREENING)
        title = data.get("title") or f"{course.name} - Custom Quiz"
        difficulty = data.get("difficulty", QuestionBank.Difficulty.EASY)

        raw_questions = data.get("questions", [])
        if not raw_questions:
            return Response({"error": "At least one question is required."}, status=status.HTTP_400_BAD_REQUEST)

        questions_payload = []
        for idx, q in enumerate(raw_questions):
            text = q.get("text", q.get("question", "")).strip()
            image = q.get("image", "").strip()
            opts = q.get("options", [])
            correct = q.get("correct", "")
            if not text and image:
                text = f"Question {idx + 1}: Refer to the image diagram and select the correct option."

            questions_payload.append({
                "id": f"q-{idx + 1}",
                "question": text,
                "text": q.get("text", q.get("question", "")).strip(),
                "image": image,
                "type": "image" if image else "text",
                "options": opts,
                "correct": correct,
                "correct_answer": correct,
                "marks": q.get("marks", 1),
            })

        sets_data = {
            "A": {
                "label": "Paper A",
                "questions": questions_payload,
            }
        }

        bank = QuestionBank.objects.create(
            course=course,
            title=title,
            bank_type=bank_type,
            difficulty=difficulty,
            sets_data=sets_data,
            total_questions_per_set=len(questions_payload),
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            created_by=request.user if request.user.is_authenticated else None,
        )

        serializer = QuestionBankDetailSerializer(bank)
        return Response(
            {"message": "Question bank created successfully.", "bank": serializer.data},
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="upload-excel",
        url_name="upload-excel",
    )
    def upload_excel(self, request):
        """
        Upload an Excel (.xlsx) file to create an approved QuestionBank.
        Supports columns: Question, Option 1, Option 2, Option 3, Option 4,
        Correct Option (or Correct Answer), Explanation, and optional Image / Image URL.
        """
        course_id = request.data.get("course_id")
        if not course_id:
            return Response({"error": "course_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        course = Course.objects.filter(id=course_id).first()
        if not course:
            return Response({"error": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "Please provide an Excel file."}, status=status.HTTP_400_BAD_REQUEST)

        import openpyxl
        try:
            wb = openpyxl.load_workbook(uploaded_file, data_only=True)
            sheet = wb.active
        except Exception as e:
            return Response({"error": f"Failed to read Excel file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        rows = list(sheet.iter_rows(values_only=True))
        if not rows or len(rows) < 2:
            return Response({"error": "Excel file must contain a header row and at least one question row."}, status=status.HTTP_400_BAD_REQUEST)

        headers = [str(cell).strip().lower() if cell is not None else "" for cell in rows[0]]

        def find_col_idx(possible_names):
            for name in possible_names:
                for idx, h in enumerate(headers):
                    if name in h:
                        return idx
            return -1

        q_idx = find_col_idx(["question", "prompt", "text"])
        opt1_idx = find_col_idx(["option 1", "option1", "option a", "opt 1", "a"])
        opt2_idx = find_col_idx(["option 2", "option2", "option b", "opt 2", "b"])
        opt3_idx = find_col_idx(["option 3", "option3", "option c", "opt 3", "c"])
        opt4_idx = find_col_idx(["option 4", "option4", "option d", "opt 4", "d"])
        ans_idx = find_col_idx(["correct", "answer", "ans", "correct option", "correct answer"])
        exp_idx = find_col_idx(["explanation", "notes", "solution", "reason"])
        img_idx = find_col_idx(["image", "diagram", "img", "image url", "image_url"])

        if opt1_idx == -1 or opt2_idx == -1:
            return Response({"error": "Could not identify option columns (Option 1, Option 2, etc.) in Excel."}, status=status.HTTP_400_BAD_REQUEST)

        questions = []
        for r_idx, row in enumerate(rows[1:], start=2):
            if not any(row):
                continue
            question_text = str(row[q_idx]).strip() if q_idx != -1 and q_idx < len(row) and row[q_idx] is not None else ""
            img_val = str(row[img_idx]).strip() if img_idx != -1 and img_idx < len(row) and row[img_idx] is not None else ""

            if not question_text and not img_val:
                continue

            options = []
            for col in [opt1_idx, opt2_idx, opt3_idx, opt4_idx]:
                if col != -1 and col < len(row) and row[col] is not None:
                    val = str(row[col]).strip()
                    if val:
                        options.append(val)

            if len(options) < 2:
                continue

            correct_raw = str(row[ans_idx]).strip() if ans_idx != -1 and ans_idx < len(row) and row[ans_idx] is not None else ""
            correct = correct_raw
            if correct_raw.upper() in ["A", "OPTION 1", "OPT 1", "OPTION A", "1"] and len(options) >= 1:
                correct = options[0]
            elif correct_raw.upper() in ["B", "OPTION 2", "OPT 2", "OPTION B", "2"] and len(options) >= 2:
                correct = options[1]
            elif correct_raw.upper() in ["C", "OPTION 3", "OPT 3", "OPTION C", "3"] and len(options) >= 3:
                correct = options[2]
            elif correct_raw.upper() in ["D", "OPTION 4", "OPT 4", "OPTION D", "4"] and len(options) >= 4:
                correct = options[3]
            elif correct_raw not in options:
                correct = options[0]

            explanation = str(row[exp_idx]).strip() if exp_idx != -1 and exp_idx < len(row) and row[exp_idx] is not None else ""
            display_q = question_text or f"Question {len(questions) + 1}: Refer to the image diagram below."

            questions.append({
                "id": f"q-{len(questions) + 1}",
                "question": display_q,
                "text": question_text,
                "image": img_val,
                "type": "image" if img_val else "text",
                "options": options,
                "correct": correct,
                "correct_answer": correct,
                "explanation": explanation,
                "marks": 1,
            })

        if not questions:
            return Response({"error": "No valid questions found in the uploaded Excel file."}, status=status.HTTP_400_BAD_REQUEST)

        bank_type = request.data.get("bank_type", QuestionBank.BankType.PRESCREENING)
        title = request.data.get("title") or f"{course.name} - Uploaded Question Bank"
        difficulty = request.data.get("difficulty", QuestionBank.Difficulty.EASY)

        sets_data = {
            "A": {
                "label": "Paper A",
                "questions": questions,
            }
        }

        bank = QuestionBank.objects.create(
            course=course,
            title=title,
            bank_type=bank_type,
            difficulty=difficulty,
            sets_data=sets_data,
            total_questions_per_set=len(questions),
            status=QuestionBank.Status.APPROVED,
            lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
            is_active=True,
            created_by=request.user if request.user.is_authenticated else None,
        )

        serializer = QuestionBankDetailSerializer(bank)
        return Response(
            {"message": f"Question bank '{title}' created successfully with {len(questions)} questions.", "bank": serializer.data},
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="import-presets",
        url_name="import-presets",
    )
    def import_presets(self, request):
        """
        Import and sync preset question banks from Questions/ directory into QuestionBank records.
        """
        from .services.prescreening_importer import sync_prescreening_banks_from_disk
        overwrite = request.data.get("overwrite", False)
        results = sync_prescreening_banks_from_disk(overwrite=overwrite)
        return Response(
            {
                "message": f"Presets synced: {results['created']} created, {results['updated']} updated, {results['skipped']} skipped.",
                "results": results,
            },
            status=status.HTTP_200_OK,
        )


