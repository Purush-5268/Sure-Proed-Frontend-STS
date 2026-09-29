from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone

from .models import (
    Exam,
    ExamProctoringRoom,
    InternalExamAttempt,
    ModuleTest,
    ModuleTestSubmission,
    ManualExamination,
    ManualExaminationResult,
)


class ModuleTestSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.title", read_only=True)
    module_number = serializers.IntegerField(source="module.module_number", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)
    course_code = serializers.CharField(source="course.code", read_only=True)
    cohort_name = serializers.CharField(source="cohort.name", read_only=True, default=None)
    cohort_code = serializers.CharField(source="cohort.code", read_only=True, default=None)
    submissions_count = serializers.SerializerMethodField()
    is_conducted = serializers.SerializerMethodField()
    meeting_link = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    calendar_event_id = serializers.SerializerMethodField()

    class Meta:
        model = ModuleTest
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_submissions_count(self, obj):
        return obj.submissions.count()

    def get_is_conducted(self, obj):
        now = timezone.now()
        if obj.submissions.exists():
            return True
        if obj.end_time and now > obj.end_time:
            return True
        return False

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        role = getattr(user, "role", "")
        
        # Hide meeting_link logic for students
        if not (user and (user.is_staff or role in {"ADMIN", "MENTOR"})):
            now = timezone.now()
            if not instance.is_released or (instance.scheduled_at and now < instance.scheduled_at - timezone.timedelta(minutes=10)) or (instance.end_time and now > instance.end_time):
                ret["meeting_link"] = None
                
        return ret

    def get_calendar_event_id(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        role = getattr(user, "role", "")
        if user and (user.is_staff or role == "ADMIN"):
            return obj.calendar_event_id
        return None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        course = attrs.get("course", getattr(self.instance, "course", None))
        module = attrs.get("module", getattr(self.instance, "module", None))
        cohort = attrs.get("cohort", getattr(self.instance, "cohort", None))
        question_bank = attrs.get("question_bank", getattr(self.instance, "question_bank", None))
        if course and module and module.course_id != course.id:
            raise serializers.ValidationError({"module": "The module must belong to the selected course."})
        if course and cohort and cohort.course_id != course.id:
            raise serializers.ValidationError({"cohort": "The cohort must belong to the selected course."})
        if self.instance is None and cohort and cohort.manual_examinations.filter(
            status__in=[ManualExamination.Status.DRAFT, ManualExamination.Status.IN_PROGRESS]
        ).exists():
            raise serializers.ValidationError({"cohort": "This cohort already has a manual examination in progress."})
        if self.instance is None and cohort and not cohort.applications.filter(
            status__in=[
                Application.Status.APPLIED,
                Application.Status.EXAM_PENDING,
                Application.Status.PRESCREENING_PENDING,
                Application.Status.PRESCREENING_COMPLETED,
                Application.Status.EXAM_COMPLETED,
            ]
        ).exists():
            raise serializers.ValidationError({"cohort": "At least one eligible student is required before scheduling a manual examination."})
        if question_bank:
            if course and question_bank.course_id != course.id:
                raise serializers.ValidationError({"question_bank": "The question bank must belong to the selected course."})
            if question_bank.bank_type != question_bank.BankType.MODULE_TEST:
                raise serializers.ValidationError({"question_bank": "Select a module-test question bank."})
            if module and question_bank.module_id and question_bank.module_id != module.id:
                raise serializers.ValidationError({"question_bank": "The question bank belongs to a different module."})
            if cohort and question_bank.cohort_id and question_bank.cohort_id != cohort.id:
                raise serializers.ValidationError({"question_bank": "The question bank belongs to a different cohort."})
        room_count = attrs.get(
            "proctoring_room_count",
            getattr(self.instance, "proctoring_room_count", 4),
        )
        capacity = attrs.get(
            "proctoring_capacity_per_room",
            getattr(self.instance, "proctoring_capacity_per_room", 50),
        )
        if room_count < 1 or room_count > 26:
            raise serializers.ValidationError(
                {"proctoring_room_count": "Choose between 1 and 26 rooms."}
            )
        if capacity < 1 or capacity > 500:
            raise serializers.ValidationError(
                {"proctoring_capacity_per_room": "Choose between 1 and 500 candidates."}
            )
        scheduled_at = attrs.get("scheduled_at", getattr(self.instance, "scheduled_at", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if scheduled_at and end_time and end_time <= scheduled_at:
            raise serializers.ValidationError(
                {"end_time": "Module test end time must be after the scheduled start time."}
            )
        return attrs


class ModuleTestSubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    student_code = serializers.SerializerMethodField()
    college = serializers.SerializerMethodField()
    test_title = serializers.CharField(source="test.title", read_only=True)
    course_name = serializers.CharField(source="test.course.name", read_only=True)
    cohort_code = serializers.CharField(source="test.cohort.code", read_only=True, default="")

    class Meta:
        model = ModuleTestSubmission
        fields = "__all__"
        read_only_fields = [
            "id", "student", "started_at", "expires_at", "submitted_at", "status",
            "question_bank", "paper_set", "question_snapshot", "question_mapping",
            "option_mapping", "answers", "marks_obtained", "total_marks", "percentage",
            "qualified", "proctoring_room", "proctoring_status",
            "proctoring_connected_at", "result_source", "result_event_id",
            "result_payload_hash", "integrity_status", "proctoring_summary",
            "created_at", "updated_at",
        ]

    def get_student_name(self, obj):
        if obj.student and obj.student.user:
            return f"{obj.student.user.first_name} {obj.student.user.last_name}".strip() or obj.student.user.email
        return "Candidate"

    def get_student_email(self, obj):
        if obj.student and obj.student.user:
            return obj.student.user.email
        return ""

    def get_student_code(self, obj):
        if obj.student:
            return obj.student.student_code
        return ""

    def get_college(self, obj):
        if obj.student:
            return obj.student.college or ""
        return ""



class ExamSerializer(serializers.ModelSerializer):
    application_number = serializers.CharField(source="application.application_number", read_only=True)
    course_name = serializers.CharField(source="application.course.name", read_only=True)
    course_id = serializers.UUIDField(source="application.course_id", read_only=True)
    cohort_id = serializers.UUIDField(source="application.assigned_cohort_id", read_only=True, allow_null=True)
    cohort_code = serializers.CharField(source="application.assigned_cohort.code", read_only=True, allow_null=True)
    cohort_name = serializers.CharField(source="application.assigned_cohort.name", read_only=True, allow_null=True)
    application_status = serializers.CharField(source="application.status", read_only=True)
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(source="application.student.user.email", read_only=True)
    course_title = serializers.CharField(source="application.course.name", read_only=True)
    assessment_track = serializers.CharField(source="application.course.name", read_only=True)

    class Meta:
        model = Exam
        fields = [
            "id",
            "application",
            "application_number",
            "course_name",
            "course_title",
            "assessment_track",
            "course_id",
            "cohort_id",
            "cohort_code",
            "cohort_name",
            "application_status",
            "student_name",
            "student_email",
            "level",
            "total_questions",
            "duration_minutes",
            "pass_percentage",
            "status",
            "started_at",
            "submitted_at",
            "marks_obtained",
            "total_marks",
            "percentage",
            "qualified",
            "proctor_name",
            "proctoring_enabled",
            "proctoring_required",
            "proctoring_room_count",
            "proctoring_capacity_per_room",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_admin = user and (user.is_staff or getattr(user, "role", "") == "ADMIN")
        if not is_admin:
            initial = getattr(self, "initial_data", {})
            protected = {"status", "marks_obtained", "total_marks", "percentage", "qualified", "submitted_at", "started_at", "pass_percentage"}
            attempted = [k for k in protected if k in initial]
            if attempted:
                raise serializers.ValidationError({
                    k: f"Modifying '{k}' is restricted to administrators and system processes." for k in attempted
                })
        room_count = attrs.get("proctoring_room_count", getattr(self.instance, "proctoring_room_count", 4))
        capacity = attrs.get(
            "proctoring_capacity_per_room",
            getattr(self.instance, "proctoring_capacity_per_room", 50),
        )
        if room_count < 1 or room_count > 26:
            raise serializers.ValidationError({"proctoring_room_count": "Choose between 1 and 26 rooms."})
        if capacity < 1 or capacity > 500:
            raise serializers.ValidationError(
                {"proctoring_capacity_per_room": "Choose an operational planning limit between 1 and 500."}
            )
            
        if self.instance and "pass_percentage" in attrs:
            pre_screening = getattr(self.instance.application, "pre_screening", None)
            if pre_screening and pre_screening.admin_started_at:
                if attrs["pass_percentage"] != self.instance.pass_percentage:
                    raise serializers.ValidationError(
                        {"pass_percentage": "Pass percentage cannot be changed after the exam has been started by an admin."}
                    )
                    
        return attrs

    def get_student_name(self, exam):
        user = exam.application.student.user
        return user.get_full_name().strip() or user.email


class ManualExaminationResultSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(source="application.student.user.email", read_only=True)
    application_number = serializers.CharField(source="application.application_number", read_only=True)
    application_status = serializers.CharField(source="application.status", read_only=True)

    class Meta:
        model = ManualExaminationResult
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_student_name(self, obj):
        user = obj.application.student.user
        return user.get_full_name().strip() or user.email


class ManualExaminationSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)
    cohort_name = serializers.SerializerMethodField()
    question_bank_title = serializers.CharField(source="question_bank.title", read_only=True, default=None)
    results = ManualExaminationResultSerializer(many=True, read_only=True)

    class Meta:
        model = ManualExamination
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "results"]

    def get_cohort_name(self, obj):
        return obj.cohort.name or obj.cohort.code

    def validate(self, attrs):
        course = attrs.get("course", getattr(self.instance, "course", None))
        cohort = attrs.get("cohort", getattr(self.instance, "cohort", None))
        question_bank = attrs.get("question_bank", getattr(self.instance, "question_bank", None))
        if course and cohort and cohort.course_id != course.id:
            raise serializers.ValidationError({"cohort": "The cohort must belong to the selected course."})
        if question_bank:
            if course and question_bank.course_id != course.id:
                raise serializers.ValidationError({"question_bank": "The question bank must belong to the selected course."})
            if question_bank.bank_type != question_bank.BankType.PRESCREENING:
                raise serializers.ValidationError({"question_bank": "Select a screening question bank."})
            if question_bank.status != question_bank.Status.APPROVED or not question_bank.is_active:
                raise serializers.ValidationError({"question_bank": "Select an active approved question bank."})
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})
        pass_percentage = attrs.get("pass_percentage", getattr(self.instance, "pass_percentage", 40))
        if pass_percentage < 0 or pass_percentage > 100:
            raise serializers.ValidationError({"pass_percentage": "Pass percentage must be between 0 and 100."})
        total_questions = attrs.get("total_questions", getattr(self.instance, "total_questions", 0))
        if total_questions < 1:
            raise serializers.ValidationError({"total_questions": "At least one question is required."})
        attrs["maximum_marks"] = total_questions
        attrs["duration_minutes"] = attrs.get("duration_minutes", getattr(self.instance, "duration_minutes", 10)) or 10
        return attrs


class ExamProctoringRoomSerializer(serializers.ModelSerializer):
    assigned_proctor_email = serializers.EmailField(
        source="assigned_proctor.email", read_only=True, default=None
    )
    active_attempts = serializers.SerializerMethodField()
    assigned_candidates = serializers.SerializerMethodField()
    assessment_type = serializers.CharField(
        source="question_bank.bank_type", read_only=True
    )
    course_name = serializers.CharField(
        source="question_bank.course.name", read_only=True
    )

    class Meta:
        model = ExamProctoringRoom
        fields = [
            "id",
            "code",
            "room_name",
            "room_password",
            "session_date",
            "capacity",
            "assigned_proctor",
            "assigned_proctor_email",
            "assessment_type",
            "course_name",
            "is_active",
            "assigned_candidates",
            "active_attempts",
        ]
        read_only_fields = [
            "id", "code", "room_name", "room_password", "session_date",
            "capacity", "assigned_candidates", "active_attempts",
        ]

    def get_active_attempts(self, room):
        exam_attempts = room.attempts.filter(
            status=InternalExamAttempt.Status.IN_PROGRESS,
            expires_at__gt=timezone.now(),
        ).select_related("student__user").order_by("student__student_code")
        module_attempts = room.module_test_submissions.filter(
            status=ModuleTestSubmission.Status.IN_PROGRESS,
            expires_at__gt=timezone.now(),
        ).select_related("student__user").order_by("student__student_code")
        payload = [
            {
                "attempt_id": str(attempt.id),
                "assessment_type": "PRESCREENING",
                "student_code": attempt.student.student_code,
                "student_name": (
                    attempt.student.user.get_full_name().strip() or attempt.student.user.email
                ),
                "attempt_status": attempt.status,
                "proctoring_status": attempt.proctoring_status,
                "connected_at": attempt.proctoring_connected_at,
                "expires_at": attempt.expires_at,
            }
            for attempt in exam_attempts
        ]
        payload.extend([
            {
                "attempt_id": str(attempt.id),
                "assessment_type": "MODULE_TEST",
                "student_code": attempt.student.student_code,
                "student_name": (
                    attempt.student.user.get_full_name().strip() or attempt.student.user.email
                ),
                "attempt_status": attempt.status,
                "proctoring_status": attempt.proctoring_status,
                "connected_at": attempt.proctoring_connected_at,
                "expires_at": attempt.expires_at,
            }
            for attempt in module_attempts
        ])
        return sorted(payload, key=lambda item: item["student_code"])

    def get_assigned_candidates(self, room):
        live_by_student = {
            attempt.student_id: attempt
            for attempt in room.attempts.filter(
                status=InternalExamAttempt.Status.IN_PROGRESS,
                expires_at__gt=timezone.now(),
            )
        }
        live_by_student.update({
            attempt.student_id: attempt
            for attempt in room.module_test_submissions.filter(
                status=ModuleTestSubmission.Status.IN_PROGRESS,
                expires_at__gt=timezone.now(),
            )
        })
        return [
            {
                "student_id": str(student.id),
                "student_code": student.student_code,
                "student_name": student.user.get_full_name().strip() or student.user.email,
                "email": student.user.email,
                "has_started": student.id in live_by_student,
                "proctoring_status": getattr(
                    live_by_student.get(student.id), "proctoring_status", "NOT_STARTED"
                ),
            }
            for student in room.assigned_students.select_related("user").order_by("student_code")
        ]


class ExternalExamResultSerializer(serializers.Serializer):
    attempt_id = serializers.UUIDField()
    application_id = serializers.UUIDField()
    exam_id = serializers.UUIDField()
    marks_obtained = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.00")
    )
    total_marks = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01")
    )
    submitted_at = serializers.DateTimeField(required=False)
    integrity_status = serializers.ChoiceField(
        choices=["PASSED", "FAILED"],
        default="PASSED",
    )
    proctoring_summary = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        if attrs["marks_obtained"] > attrs["total_marks"]:
            raise serializers.ValidationError(
                {"marks_obtained": "Marks obtained cannot exceed total marks."}
            )
        return attrs


class ExternalModuleTestResultSerializer(serializers.Serializer):
    module_test_id = serializers.UUIDField()
    student_id = serializers.CharField(max_length=80)
    cohort_id = serializers.CharField(max_length=80)
    marks_obtained = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.00")
    )
    total_marks = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01")
    )
    submitted_at = serializers.DateTimeField(required=False)
    integrity_status = serializers.ChoiceField(
        choices=["PASSED", "FAILED"], default="PASSED"
    )
    proctoring_summary = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        if attrs["marks_obtained"] > attrs["total_marks"]:
            raise serializers.ValidationError(
                {"marks_obtained": "Marks obtained cannot exceed total marks."}
            )
        return attrs
