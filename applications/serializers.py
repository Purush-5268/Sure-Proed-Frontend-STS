from rest_framework import serializers
from question_bank.models import QuestionBank

from .models import Application, CommunityActivity, PreScreening, PreScreeningInterview, ApplicationStatusAudit


class PreScreeningInterviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreScreeningInterview
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        application = attrs.get("application") or getattr(self.instance, "application", None)
        scheduled_at = attrs.get("scheduled_at", getattr(self.instance, "scheduled_at", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if application and not application.course.requires_interview:
            raise serializers.ValidationError(
                {"application": "This course is configured to skip the candidate interview."}
            )
        if scheduled_at and end_time and end_time <= scheduled_at:
            raise serializers.ValidationError(
                {"end_time": "Interview end time must be after the scheduled start time."}
            )
        if attrs.get("status") == PreScreeningInterview.Status.RESCHEDULED:
            status_is_changing = bool(
                self.instance
                and self.instance.status != PreScreeningInterview.Status.RESCHEDULED
            )
            if not scheduled_at or (
                status_is_changing and scheduled_at == self.instance.scheduled_at
            ):
                raise serializers.ValidationError(
                    {"scheduled_at": "Choose a new interview date and time when status is Rescheduled."}
                )
        return attrs


class PreScreeningSerializer(serializers.ModelSerializer):
    meeting_link = serializers.SerializerMethodField()
    course_title = serializers.CharField(source="application.course.name", read_only=True)
    course_id = serializers.CharField(source="application.course.id", read_only=True)
    assessment_track = serializers.CharField(source="application.course.name", read_only=True)
    question_bank_title = serializers.CharField(source="question_bank.title", read_only=True, default=None)
    duration_minutes = serializers.SerializerMethodField()
    pass_percentage = serializers.SerializerMethodField()
    total_questions = serializers.SerializerMethodField()

    # Candidate and Cohort Resolution
    cohort_id = serializers.SerializerMethodField()
    cohort_name = serializers.SerializerMethodField()
    candidate_name = serializers.SerializerMethodField()
    candidate_email = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    student_code = serializers.SerializerMethodField()
    application_number = serializers.CharField(source="application.application_number", read_only=True)
    application_details = serializers.SerializerMethodField()

    class Meta:
        model = PreScreening
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_cohort_id(self, obj):
        try:
            return str(obj.application.assigned_cohort.id) if obj.application.assigned_cohort else None
        except Exception:
            return None

    def get_cohort_name(self, obj):
        try:
            return obj.application.assigned_cohort.name or obj.application.assigned_cohort.code if obj.application.assigned_cohort else None
        except Exception:
            return None

    def get_candidate_name(self, obj):
        try:
            user = obj.application.student.user
            first = getattr(user, "first_name", "") or ""
            last = getattr(user, "last_name", "") or ""
            full = f"{first} {last}".strip()
            return full or getattr(user, "username", "") or "Candidate"
        except Exception:
            return "Candidate"

    def get_candidate_email(self, obj):
        try:
            return getattr(obj.application.student.user, "email", "") or ""
        except Exception:
            return ""

    def get_student_name(self, obj):
        return self.get_candidate_name(obj)

    def get_student_email(self, obj):
        return self.get_candidate_email(obj)

    def get_student_code(self, obj):
        try:
            return getattr(obj.application.student, "student_code", "") or ""
        except Exception:
            return ""

    def get_application_details(self, obj):
        try:
            app = obj.application
            user = app.student.user
            first = getattr(user, "first_name", "") or ""
            last = getattr(user, "last_name", "") or ""
            name = f"{first} {last}".strip() or getattr(user, "username", "") or "Candidate"
            email = getattr(user, "email", "") or ""
            exam = getattr(app, "exam", None)
            return {
                "id": str(app.id),
                "application_number": app.application_number,
                "status": app.status,
                "student_name": name,
                "student_email": email,
                "marks_obtained": exam.marks_obtained if exam else None,
                "total_marks": exam.total_marks if exam else None,
                "percentage": exam.percentage if exam else None,
                "qualified": exam.qualified if exam else None,
                "submitted_at": exam.submitted_at if exam else None,
            }
        except Exception:
            return None

    def get_total_questions(self, obj):
        try:
            return obj.application.exam.total_questions
        except Exception:
            return getattr(obj.question_bank, "total_questions_per_set", 10) or 10

    def get_duration_minutes(self, obj):
        try:
            return obj.application.exam.duration_minutes
        except Exception:
            return 45

    def get_pass_percentage(self, obj):
        try:
            return float(obj.application.exam.pass_percentage)
        except Exception:
            return 40.0

    def get_meeting_link(self, obj):
        link = obj.meeting_link
        if not link and getattr(obj, "application", None) and getattr(obj.application, "assigned_cohort", None):
            link = obj.application.assigned_cohort.meeting_link
        return link or None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        status_value = attrs.get("status", getattr(self.instance, "status", PreScreening.Status.SCHEDULED))
        scheduled_at = attrs.get("scheduled_at", getattr(self.instance, "scheduled_at", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        application = attrs.get("application") or getattr(self.instance, "application", None)
        question_bank = attrs.get("question_bank", getattr(self.instance, "question_bank", None))
        paper_set = (attrs.get("paper_set", getattr(self.instance, "paper_set", "")) or "").upper()
        attrs["paper_set"] = paper_set
        if self.instance and (self.instance.admin_started_at or self.instance.status in {
            PreScreening.Status.PASSED,
            PreScreening.Status.FAILED,
            PreScreening.Status.CANCELLED,
        }):
            schedule_fields = {"scheduled_at", "end_time", "question_bank", "paper_set", "meeting_link"}
            if schedule_fields.intersection(attrs):
                raise serializers.ValidationError(
                    {"detail": "A started or completed screening examination can no longer be rescheduled."}
                )
        if scheduled_at and end_time and end_time <= scheduled_at:
            raise serializers.ValidationError(
                {"end_time": "Exam end time must be after the scheduled start time."}
            )
        if self.instance is None and status_value != PreScreening.Status.SCHEDULED:
            raise serializers.ValidationError(
                {"status": "Create the schedule first, then publish its result through Update Status."}
            )
        if status_value in {
            PreScreening.Status.SCHEDULED,
            PreScreening.Status.RESCHEDULED,
        } and not scheduled_at:
            raise serializers.ValidationError(
                {"scheduled_at": "Choose the pre-screen exam date and time."}
            )
        if question_bank:
            errors = {}
            if application and question_bank.course_id != application.course_id:
                errors["question_bank"] = "The question bank must belong to the application's course."
            elif (
                question_bank.bank_type != QuestionBank.BankType.PRESCREENING
                or question_bank.status != QuestionBank.Status.APPROVED
                or question_bank.lifecycle_status != QuestionBank.LifecycleStatus.OPEN
                or not question_bank.is_active
            ):
                errors["question_bank"] = "Select an approved, open, active pre-screening question bank."
            if not paper_set:
                errors["paper_set"] = "Select a paper from the chosen question bank."
            elif paper_set not in question_bank.set_codes:
                errors["paper_set"] = "The selected paper does not exist in this question bank."
            if errors:
                raise serializers.ValidationError(errors)
        if (
            status_value == PreScreening.Status.RESCHEDULED
            and self.instance
            and self.instance.status != PreScreening.Status.RESCHEDULED
            and scheduled_at == self.instance.scheduled_at
        ):
            raise serializers.ValidationError(
                {"scheduled_at": "Choose a new screening exam date and time when status is Rescheduled."}
            )
        return attrs


class ApplicationSerializer(serializers.ModelSerializer):
    pre_screening = serializers.SerializerMethodField()
    pre_screening_interview = serializers.SerializerMethodField()
    screening_exam = serializers.SerializerMethodField()
    student_role_verified = serializers.SerializerMethodField()
    role_verification_blockers = serializers.SerializerMethodField()
    student_details = serializers.SerializerMethodField()
    offer_letter_request_status = serializers.SerializerMethodField()
    offer_letter_file = serializers.SerializerMethodField()
    course_title = serializers.CharField(source="course.name", read_only=True)
    assessment_track = serializers.CharField(source="course.name", read_only=True)
    cohort = serializers.JSONField(read_only=True, required=False)
    whatsapp_group_link = serializers.URLField(read_only=True, required=False)

    def get_offer_letter_file(self, obj):
        if obj.offer_letter_status != Application.OfferLetterStatus.ISSUED or not obj.offer_letter_file:
            return None
        try:
            if not obj.offer_letter_file.storage.exists(obj.offer_letter_file.name):
                return None
        except Exception:
            return None
        path = f"/api/applications/{obj.pk}/download-offer-letter/"
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path

    def get_offer_letter_request_status(self, obj):
        try:
            # 1. Physical Offer Letter state always takes precedence for success
            from applications.models import Application
            if obj.offer_letter_status == Application.OfferLetterStatus.ISSUED:
                return "RESOLVED"
            if obj.offer_letter_status == Application.OfferLetterStatus.REVOKED:
                return "REVOKED"
                
            # 2. Otherwise, check the actual UserRequest state
            from common.models import UserRequest
            req = UserRequest.objects.filter(
                related_application=obj,
                category=UserRequest.Category.OFFER_LETTER
            ).order_by("-created_at").first()
            if req:
                return req.status
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error in get_offer_letter_request_status: {e}")
            pass
        return "NOT_REQUESTED"

    def get_student_details(self, obj):
        try:
            student = getattr(obj, "student", None)
            if not student:
                return None
            user = getattr(student, "user", None)
            name = ""
            email = ""
            if user:
                first = getattr(user, "first_name", "") or ""
                last = getattr(user, "last_name", "") or ""
                full_name = f"{first} {last}".strip()
                name = full_name or getattr(user, "username", "") or getattr(user, "email", "")
                email = getattr(user, "email", "") or ""
            return {
                "id": str(student.id),
                "name": name,
                "student_code": getattr(student, "student_code", "") or "",
                "email": email,
            }
        except Exception:
            return None

    def get_pre_screening(self, obj):
        try:
            if hasattr(obj, "pre_screening") and obj.pre_screening:
                return PreScreeningSerializer(obj.pre_screening, context=self.context).data
        except Exception:
            pass
        return None

    def get_pre_screening_interview(self, obj):
        try:
            if hasattr(obj, "pre_screening_interview") and obj.pre_screening_interview:
                return PreScreeningInterviewSerializer(obj.pre_screening_interview, context=self.context).data
        except Exception:
            pass
        return None

    def get_screening_exam(self, obj):
        try:
            exam = getattr(obj, "exam", None)
        except Exception:
            exam = None
        if not exam:
            return None
        return {
            "id": str(exam.id),
            "status": exam.status,
            "marks_obtained": exam.marks_obtained,
            "total_marks": exam.total_marks,
            "percentage": exam.percentage,
            "qualified": exam.qualified,
            "submitted_at": exam.submitted_at,
            "course_title": obj.course.name if obj.course else None,
            "assessment_track": obj.course.name if obj.course else None,
        }

    def get_student_role_verified(self, obj):
        try:
            return bool(obj.is_student_role_verified)
        except Exception:
            return False

    def get_role_verification_blockers(self, obj):
        try:
            return obj.role_verification_blockers()
        except Exception:
            return []

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if instance.course:
            ret["course_name"] = instance.course.name
            ret["course_details"] = {
                "id": str(instance.course.id),
                "name": instance.course.name,
                "code": getattr(instance.course, "code", "")
            }
        if instance.assigned_cohort:
            ret["cohort_name"] = instance.assigned_cohort.name or instance.assigned_cohort.code
            ret["cohort_code"] = instance.assigned_cohort.code
            ret["cohort_details"] = {
                "id": str(instance.assigned_cohort.id),
                "name": instance.assigned_cohort.name or instance.assigned_cohort.code,
                "code": instance.assigned_cohort.code,
                "status": instance.assigned_cohort.status,
                "start_date": instance.assigned_cohort.start_date.isoformat() if instance.assigned_cohort.start_date else None,
                "end_date": instance.assigned_cohort.end_date.isoformat() if instance.assigned_cohort.end_date else None,
            }
            
            # Map top-level cohort object for frontend compatibility
            ret["cohort"] = {
                "id": str(instance.assigned_cohort.id),
                "name": instance.assigned_cohort.name or instance.assigned_cohort.code,
                "code": instance.assigned_cohort.code,
                "status": instance.assigned_cohort.status,
                "start_date": instance.assigned_cohort.start_date.isoformat() if instance.assigned_cohort.start_date else None,
                "end_date": instance.assigned_cohort.end_date.isoformat() if instance.assigned_cohort.end_date else None,
            }
            
            # Add WhatsApp group link if authorized and in onboarding stage
            ret["whatsapp_group_link"] = None
            if instance.assigned_cohort.whatsapp_group_link:
                request = self.context.get("request")
                if request and request.user.is_authenticated:
                    user = request.user
                    is_admin = user.is_staff or getattr(user, 'role', '') in ['ADMIN', 'TRUSTEE']
                    
                    is_owner = instance.student and instance.student.user == user
                    onboarding_statuses = [
                        "APPLIED", "EXAM_PENDING", "EXAM_COMPLETED", 
                        "PRESCREENING_PENDING", "PRESCREENING_COMPLETED", 
                        "COHORT_ASSIGNED", "IN_PROGRESS"
                    ]
                    
                    if is_admin or (is_owner and instance.status in onboarding_statuses):
                        ret["whatsapp_group_link"] = instance.assigned_cohort.whatsapp_group_link
        user = getattr(getattr(instance, "student", None), "user", None)
        if user:
            name = user.get_full_name().strip() or getattr(user, "username", "") or user.email
            email = getattr(user, "email", "") or ""
            ret["student_email"] = email
            ret["student_name"] = name
            ret["candidate_name"] = name
            ret["candidate_email"] = email
        exam_data = self.get_screening_exam(instance)
        if exam_data:
            ret["exam"] = exam_data
            ret["screening_exam"] = exam_data
            if ret.get("qualification_score") is None and exam_data.get("percentage") is not None:
                ret["qualification_score"] = exam_data.get("percentage")
        return ret

    class Meta:
        model = Application
        fields = [
            "id",
            "application_number",
            "student",
            "student_details",
            "course",
            "course_title",
            "assessment_track",
            "status",
            "applied_at",
            "assigned_cohort",
            "cohort",
            "whatsapp_group_link",
            "whatsapp_joined",
            "qualified",
            "qualification_score",
            "role_verification_status",
            "role_verified_by",
            "role_verified_at",
            "role_verification_remarks",
            "completed_course",
            "completed_at",
            "final_score",
            "offer_letter_file",
            "offer_letter_issued",
            "offer_letter_issued_at",
            "offer_letter_hash",
            "remarks",
            "pre_screening",
            "pre_screening_interview",
            "screening_exam",
            "student_role_verified",
            "role_verification_blockers",
            "offer_letter_request_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "application_number", "applied_at", "created_at", "updated_at",
            "role_verification_status", "role_verified_by", "role_verified_at",
            "role_verification_remarks", "whatsapp_joined",
        ]
        extra_kwargs = {
            "student": {"required": False},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        student = attrs.get("student") or getattr(self.instance, "student", None)
        assigned_cohort = attrs.get("assigned_cohort", getattr(self.instance, "assigned_cohort", None))
        status_value = attrs.get("status", getattr(self.instance, "status", None))
        if status_value in {
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
            Application.Status.COMPLETED,
            Application.Status.SUSPENDED,
            Application.Status.TRANSFER_COHORT,
        } and assigned_cohort is None:
            raise serializers.ValidationError(
                {"assigned_cohort": "Select a cohort before using this application status."}
            )
        if status_value == Application.Status.COMPLETED:
            completion_errors = {}
            if attrs.get("completed_course", getattr(self.instance, "completed_course", False)) is not True:
                completion_errors["completed_course"] = "Course completion must be recorded first."
            if not attrs.get("completed_at", getattr(self.instance, "completed_at", None)):
                completion_errors["completed_at"] = "A completion timestamp is required."
            if attrs.get("final_score", getattr(self.instance, "final_score", None)) is None:
                completion_errors["final_score"] = "A final score is required."
            if completion_errors:
                raise serializers.ValidationError(completion_errors)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_admin = user and (user.is_staff or getattr(user, "role", "") == "ADMIN")

        # Identity and course changes are lifecycle operations, not ordinary PATCH
        # fields.  In particular, an owner must never be able to hand an
        # application to another student or silently switch its course.
        if self.instance is not None:
            raw_input = getattr(self, "initial_data", {})
            forbidden_relationship_updates = {
                key: (
                    "Use the administrator course-and-cohort transfer action."
                    if key == "course"
                    else "The application owner cannot be changed after creation."
                )
                for key in ("course", "student")
                if key in raw_input
            }
            if forbidden_relationship_updates:
                raise serializers.ValidationError(forbidden_relationship_updates)

        workflow_fields = {
            "status",
            "qualified", "qualification_score",
            "completed_course", "completed_at", "final_score", "offer_letter_file",
            "offer_letter_issued", "offer_letter_issued_at", "offer_letter_hash",
            "offer_letter_status", "offer_letter_revoked_at", "offer_letter_revoked_by",
            "offer_letter_revoke_reason", "role_verification_status", "role_verified_by",
            "role_verified_at", "role_verification_remarks",
        }
        if self.instance is not None:
            workflow_fields.add("assigned_cohort")

        if not is_admin:
            raw_input = getattr(self, "initial_data", {})
            attempted = [k for k in workflow_fields if k in raw_input and raw_input.get(k) is not None]
            if self.instance is None:
                attempted = [k for k in attempted if k not in ("assigned_cohort", "cohort")]
            if attempted:
                raise serializers.ValidationError({
                    k: f"Setting or modifying '{k}' is restricted to administrators." for k in attempted
                })

        initial = getattr(self, "initial_data", {})
        course = attrs.get("course", getattr(self.instance, "course", None))
        if assigned_cohort is not None and course is not None:
            if assigned_cohort.course_id != course.id:
                raise serializers.ValidationError(
                    {"assigned_cohort": "The cohort must belong to the application's course."}
                )
            if self.instance is not None and not is_admin and not self.instance.is_student_role_verified:
                raise serializers.ValidationError(
                    {"assigned_cohort": "Admin student-role verification is required first."}
                )

        requires_verified_identity = bool(
            assigned_cohort is not None
            and status_value in {
                Application.Status.COHORT_ASSIGNED,
                Application.Status.IN_PROGRESS,
                Application.Status.COMPLETED,
            }
        )
        github_linked = bool(
            student
            and (
                student.is_github_connected
                or (student.github_url and student.github_url.strip())
                or student.github_username
            )
        )
        if not is_admin and requires_verified_identity and student is not None and (
            not student.is_linkedin_connected or not github_linked
        ):
            raise serializers.ValidationError(
                {
                    "professional_profiles": (
                        "LinkedIn verification and a GitHub profile are required before "
                        "cohort assignment or verified student access."
                    )
                }
            )

        return attrs


class CommunityActivitySerializer(serializers.ModelSerializer):
    student = serializers.CharField(source="application.student.student_code", read_only=True)
    cohort = serializers.UUIDField(source="application.assigned_cohort_id", read_only=True)

    class Meta:
        model = CommunityActivity
        fields = [
            "id", "application", "student", "cohort", "activity_type", "title",
            "activity_date", "description", "evidence_url", "evidence_file", "status",
            "verified_by", "verified_at", "verification_remarks", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "student", "cohort", "status", "verified_by", "verified_at",
            "verification_remarks", "created_at", "updated_at",
        ]

class ApplicationStatusAuditSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True)
    application_number = serializers.CharField(source="application.application_number", read_only=True)
    student_name = serializers.CharField(source="application.student.name", read_only=True)

    class Meta:
        model = ApplicationStatusAudit
        fields = [
            "id",
            "application",
            "application_number",
            "student_name",
            "from_status",
            "to_status",
            "actor",
            "actor_email",
            "actor_name",
            "reason",
            "is_repair",
            "created_at",
        ]
