import hashlib
from rest_framework import serializers

from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.models import Exam, ModuleTest
from .models import QuestionBank
from .services.ai.validators import question_fingerprint

UNSAFE_AI_FIELDS = {
    "correct", "correct_answer", "correct_index", "correct_option", "answer",
    "explanation", "verifier_answer", "verifier_result",
    "confidence", "validation_status", "approval_status", 
    "validation_failures", "generated_by", "verification_reason", 
    "confidence_score", "source_reference", "ai_model", "validation_metadata",
    "verification_explanation", "verified_by",
}


class QuestionBankListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — excludes full sets_data."""

    course_code = serializers.CharField(source="course.code", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)
    cohort_code = serializers.CharField(source="cohort.code", read_only=True, default=None)
    module_title = serializers.CharField(source="module.title", read_only=True, default=None)
    total_sets = serializers.IntegerField(read_only=True)
    set_codes = serializers.ListField(read_only=True)
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, default=None)

    class Meta:
        model = QuestionBank
        fields = (
            "id",
            "bank_type",
            "title",
            "description",
            "difficulty",
            "course",
            "course_code",
            "course_name",
            "cohort",
            "cohort_code",
            "module",
            "module_title",
            "exam",
            "module_test",
            "source_topics",
            "total_questions_per_set",
            "total_sets",
            "set_codes",
            "is_ai_generated",
            "status",
            "lifecycle_status",
            "error_message",
            "is_active",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        )


class QuestionBankDetailSerializer(serializers.ModelSerializer):
    """Full serializer with sets_data for detail/create/update views."""

    course_code = serializers.CharField(source="course.code", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)
    cohort_code = serializers.CharField(source="cohort.code", read_only=True, default=None)
    module_title = serializers.CharField(source="module.title", read_only=True, default=None)
    total_sets = serializers.IntegerField(read_only=True)
    set_codes = serializers.ListField(read_only=True)
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, default=None)

    class Meta:
        model = QuestionBank
        fields = (
            "id",
            "bank_type",
            "title",
            "description",
            "difficulty",
            "course",
            "course_code",
            "course_name",
            "cohort",
            "cohort_code",
            "module",
            "module_title",
            "exam",
            "module_test",
            "source_topics",
            "sets_data",
            "total_questions_per_set",
            "total_sets",
            "set_codes",
            "is_ai_generated",
            "status",
            "lifecycle_status",
            "error_message",
            "is_active",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_by", "status", "lifecycle_status", "error_message", "is_active",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        may_view_answers = bool(
            user and user.is_authenticated and (user.is_superuser or getattr(user, "role", "") == "ADMIN")
        )
        if not may_view_answers and "sets_data" in data and data["sets_data"]:
            data["sets_data"] = self._sanitize_sets_data(data["sets_data"])
        return data

    def _sanitize_sets_data(self, sets_data):
        sanitized = {}
        for set_code, set_info in sets_data.items():
            sanitized_set = dict(set_info)
            if "questions" in sanitized_set:
                sanitized_questions = []
                for q in sanitized_set["questions"]:
                    safe_q = {k: v for k, v in q.items() if k not in UNSAFE_AI_FIELDS}
                    sanitized_questions.append(safe_q)
                sanitized_set["questions"] = sanitized_questions
            sanitized[set_code] = sanitized_set
        return sanitized

    def validate(self, attrs):
        bank_type = attrs.get("bank_type", getattr(self.instance, "bank_type", None))
        course = attrs.get("course", getattr(self.instance, "course", None))
        cohort = attrs.get("cohort", getattr(self.instance, "cohort", None))
        module = attrs.get("module", getattr(self.instance, "module", None))
        exam = attrs.get("exam", getattr(self.instance, "exam", None))
        module_test = attrs.get("module_test", getattr(self.instance, "module_test", None))
        if bank_type == QuestionBank.BankType.MODULE_TEST:
            if not cohort:
                raise serializers.ValidationError(
                    {"cohort": "Cohort is required for Module Test question banks."}
                )
            if not module:
                raise serializers.ValidationError(
                    {"module": "Module is required for Module Test question banks."}
                )
            if exam:
                raise serializers.ValidationError({"exam": "A module-test bank cannot be linked to a pre-screening exam."})
        elif module_test:
            raise serializers.ValidationError(
                {"module_test": "A pre-screening bank cannot be linked to a module test."}
            )
        if course and cohort and cohort.course_id != course.id:
            raise serializers.ValidationError({"cohort": "The cohort must belong to the selected course."})
        if course and module and module.course_id != course.id:
            raise serializers.ValidationError({"module": "The module must belong to the selected course."})
        if course and exam and exam.application.course_id != course.id:
            raise serializers.ValidationError({"exam": "The exam must belong to the selected course."})
        if exam and bank_type != QuestionBank.BankType.PRESCREENING:
            raise serializers.ValidationError({"exam": "Only a pre-screening bank can be linked to an exam."})
        if course and module_test and module_test.course_id != course.id:
            raise serializers.ValidationError({"module_test": "The module test must belong to the selected course."})
        if module_test:
            if bank_type != QuestionBank.BankType.MODULE_TEST:
                raise serializers.ValidationError({"module_test": "Only a module-test bank can be linked here."})
            if module and module_test.module_id and module_test.module_id != module.id:
                raise serializers.ValidationError({"module_test": "The module test belongs to a different module."})
            if cohort and module_test.cohort_id and module_test.cohort_id != cohort.id:
                raise serializers.ValidationError({"module_test": "The module test belongs to a different cohort."})
        return attrs

    def validate_sets_data(self, value):
        """Validate paper sets JSON structure."""
        if not value:
            return value
        if not isinstance(value, dict):
            raise serializers.ValidationError("sets_data must be a JSON object.")
        question_locations = {}
        for set_code, set_data in value.items():
            if len(str(set_code)) != 1 or str(set_code).upper() not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                raise serializers.ValidationError("Paper set codes must be single letters such as A, B, C, or D.")
            if not isinstance(set_data, dict):
                raise serializers.ValidationError(
                    f"Set '{set_code}' must be a JSON object with 'label' and 'questions'."
                )
            if "questions" not in set_data:
                raise serializers.ValidationError(
                    f"Set '{set_code}' is missing the 'questions' key."
                )
            if not isinstance(set_data["questions"], list):
                raise serializers.ValidationError(
                    f"Set '{set_code}' 'questions' must be a list."
                )
            question_ids = set()
            for index, question in enumerate(set_data["questions"]):
                if not isinstance(question, dict):
                    raise serializers.ValidationError(
                        f"Set '{set_code}' question {index + 1} must be a JSON object."
                    )
                question_id = str(question.get("id") or "")
                if not question_id or question_id in question_ids:
                    raise serializers.ValidationError(
                        f"Set '{set_code}' questions require unique non-empty IDs."
                    )
                question_ids.add(question_id)
                q_text = question.get("question") or question.get("text") or ""
                image = question.get("image") or ""
                fingerprint = question_fingerprint(q_text) if q_text else ""
                if not fingerprint:
                    if image:
                        fingerprint = hashlib.md5(f"img:{str(image)[:100]}:{index}".encode("utf-8")).hexdigest()
                    else:
                        raise serializers.ValidationError(
                            f"Set '{set_code}' question {index + 1} requires question text or an image."
                        )
                previous = question_locations.get(fingerprint)
                if previous:
                    raise serializers.ValidationError(
                        f"Duplicate question found in {previous} and Paper {set_code} question {index + 1}. "
                        "Every paper set must contain different questions."
                    )
                question_locations[fingerprint] = f"Paper {set_code} question {index + 1}"
                options = question.get("options")
                if not isinstance(options, list) or len(options) != 4 or len({str(o).strip() for o in options}) != 4:
                    raise serializers.ValidationError(
                        f"Set '{set_code}' question {index + 1} must contain exactly four distinct options."
                    )
                correct = question.get("correct", question.get("correct_answer"))
                if correct is None and "correctOption" in question:
                    try:
                        c_idx = int(question["correctOption"])
                        if 0 <= c_idx < len(options):
                            correct = options[c_idx]
                            question["correct"] = correct
                    except (ValueError, TypeError):
                        pass
                if correct is None or str(correct).strip() not in {str(option).strip() for option in options}:
                    raise serializers.ValidationError(
                        f"Set '{set_code}' question {index + 1} requires a correct answer matching one option."
                    )
        return value


class PaperSetSerializer(serializers.Serializer):
    """Serializer for returning a single paper set to the frontend."""

    set_code = serializers.CharField()
    label = serializers.CharField()
    questions = serializers.ListField()
    total_questions = serializers.IntegerField()
    bank_title = serializers.CharField()
    bank_type = serializers.CharField()
    course_code = serializers.CharField()
    difficulty = serializers.CharField()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self.context.get("include_answers") and "questions" in data and data["questions"]:
            sanitized_questions = []
            for q in data["questions"]:
                safe_q = {k: v for k, v in q.items() if k not in UNSAFE_AI_FIELDS}
                sanitized_questions.append(safe_q)
            data["questions"] = sanitized_questions
        return data


class GenerateQuestionBankSerializer(serializers.Serializer):
    """Input validation for AI question bank generation."""

    course_id = serializers.UUIDField(
        help_text="UUID of the course to generate questions for."
    )
    bank_type = serializers.ChoiceField(
        choices=QuestionBank.BankType.choices,
        help_text="PRESCREENING or MODULE_TEST.",
    )
    cohort_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="UUID of the cohort (batch).",
    )
    module_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Required for MODULE_TEST. UUID of the course module.",
    )
    exam_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Optional Pre-Screening Exam UUID to link.",
    )
    module_test_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Optional Module Test UUID to link.",
    )
    num_sets = serializers.IntegerField(
        default=4,
        min_value=1,
        max_value=10,
        help_text="Number of paper sets to generate (default 4 for A, B, C, D).",
    )
    questions_per_set = serializers.IntegerField(
        default=10,
        min_value=5,
        max_value=50,
        help_text="Number of questions per set.",
    )
    difficulty = serializers.ChoiceField(
        choices=QuestionBank.Difficulty.choices,
        required=False,
        help_text="Difficulty level. Defaults to EASY for pre-screening, MEDIUM for module tests.",
    )
    title = serializers.CharField(
        required=False,
        max_length=255,
        help_text="Custom title for the question bank. Auto-generated if not provided.",
    )

    def validate(self, attrs):
        bank_type = attrs.get("bank_type")
        if bank_type == QuestionBank.BankType.MODULE_TEST:
            if not attrs.get("cohort_id"):
                raise serializers.ValidationError(
                    {"cohort_id": "Required for MODULE_TEST banks."}
                )
            if not attrs.get("module_id"):
                raise serializers.ValidationError(
                    {"module_id": "Required for MODULE_TEST banks."}
                )

        # Validate object existence and all cross-object ownership relationships.
        try:
            course = Course.objects.get(id=attrs["course_id"])
        except Course.DoesNotExist:
            raise serializers.ValidationError({"course_id": "Course not found."})

        if attrs.get("cohort_id"):
            try:
                cohort = Cohort.objects.get(id=attrs["cohort_id"])
            except Cohort.DoesNotExist:
                raise serializers.ValidationError({"cohort_id": "Cohort not found."})
            if cohort.course_id != course.id:
                raise serializers.ValidationError({"cohort_id": "Cohort does not belong to the selected course."})
        else:
            cohort = None

        if attrs.get("module_id"):
            try:
                module = CourseModule.objects.get(id=attrs["module_id"])
            except CourseModule.DoesNotExist:
                raise serializers.ValidationError({"module_id": "Module not found."})
            if module.course_id != course.id:
                raise serializers.ValidationError({"module_id": "Module does not belong to the selected course."})
        else:
            module = None

        if attrs.get("exam_id"):
            try:
                exam = Exam.objects.select_related("application").get(id=attrs["exam_id"])
            except Exam.DoesNotExist:
                raise serializers.ValidationError({"exam_id": "Exam not found."})
            if bank_type != QuestionBank.BankType.PRESCREENING:
                raise serializers.ValidationError({"exam_id": "Only pre-screening banks can link an exam."})
            if exam.application.course_id != course.id:
                raise serializers.ValidationError({"exam_id": "Exam does not belong to the selected course."})

        if attrs.get("module_test_id"):
            try:
                module_test = ModuleTest.objects.get(id=attrs["module_test_id"])
            except ModuleTest.DoesNotExist:
                raise serializers.ValidationError({"module_test_id": "ModuleTest not found."})
            if bank_type != QuestionBank.BankType.MODULE_TEST:
                raise serializers.ValidationError({"module_test_id": "Only module-test banks can link a module test."})
            if module_test.course_id != course.id:
                raise serializers.ValidationError({"module_test_id": "Module test does not belong to the selected course."})
            if module and module_test.module_id and module_test.module_id != module.id:
                raise serializers.ValidationError({"module_test_id": "Module test belongs to a different module."})
            if cohort and module_test.cohort_id and module_test.cohort_id != cohort.id:
                raise serializers.ValidationError({"module_test_id": "Module test belongs to a different cohort."})

        source_topics = course.course_prerequisites if bank_type == QuestionBank.BankType.PRESCREENING else module.topics
        if not isinstance(source_topics, list) or not any(str(topic).strip() for topic in source_topics):
            source_field = "course_prerequisites" if bank_type == QuestionBank.BankType.PRESCREENING else "module topics"
            raise serializers.ValidationError(
                {"course_id": f"Configure at least one non-empty {source_field} entry before AI generation."}
            )

        return attrs

