from datetime import date, timedelta
import uuid

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from courses.models import Course
from .models import Cohort


class CohortSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True, max_length=30)
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=150)
    course_name = serializers.CharField(source="course.name", read_only=True)
    whatsapp_group_link = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    rules_and_regulations = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    course_details = serializers.SerializerMethodField()
    mentor_name = serializers.SerializerMethodField()
    active_mentors = serializers.SerializerMethodField()
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    meeting_link = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    lst_batch = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    max_students = serializers.IntegerField(required=False, default=30)
    status = serializers.CharField(required=False, default=Cohort.Status.DRAFT)
    mentors = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all(), required=False)
    current_mentors = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all(), required=False)
    current_mentors_details = serializers.SerializerMethodField()
    current_mentor = serializers.SerializerMethodField()
    current_mentor_details = serializers.SerializerMethodField()
    volunteers = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.all(), required=False)
    github_repository_eligible_at = serializers.DateTimeField(read_only=True)
    can_provision_github_repositories = serializers.BooleanField(read_only=True)
    students_count = serializers.IntegerField(read_only=True)
    applications_count = serializers.IntegerField(read_only=True)
    pre_screening = serializers.SerializerMethodField()

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        
        # Security: whatsapp_group_link is ONLY for staff/admin via the Cohort endpoints.
        # Students receive their whatsapp link ONLY through their specific Application object.
        if "whatsapp_group_link" in ret and ret["whatsapp_group_link"]:
            request = self.context.get("request")
            authorized = False
            
            if request and request.user.is_authenticated:
                user = request.user
                if user.is_staff or user.is_superuser or getattr(user, 'role', '') in ['ADMIN', 'TRUSTEE']:
                    authorized = True
            
            if not authorized:
                ret["whatsapp_group_link"] = None
                
        return ret

    def get_course_details(self, obj):
        if not obj.course_id:
            return None
        return {
            "code": obj.course.code,
            "name": obj.course.name,
            "domain": obj.course.domain,
            "description": obj.course.description,
            "difficulty": obj.course.difficulty,
            "duration_weeks": obj.course.duration_weeks,
            "prerequisites": obj.course.prerequisites,
            "eligibility_criteria": obj.course.eligibility_criteria,
            "minimum_attendance_percentage": obj.course.minimum_attendance_percentage,
            "curriculum": obj.course.curriculum,
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        is_create = self.instance is None

        # 1. Map camelCase / alternate field names
        if "courseId" in data and "course" not in data:
            data["course"] = data.pop("courseId")
        elif "course_id" in data and "course" not in data:
            data["course"] = data.pop("course_id")

        if "startDate" in data and "start_date" not in data:
            data["start_date"] = data.pop("startDate")

        if "endDate" in data and "end_date" not in data:
            data["end_date"] = data.pop("endDate")

        if "maxStudents" in data and "max_students" not in data:
            data["max_students"] = data.pop("maxStudents")

        if "cohortCode" in data and "code" not in data:
            data["code"] = data.pop("cohortCode")
        elif "cohort_code" in data and "code" not in data:
            data["code"] = data.pop("cohort_code")

        if "cohortName" in data and "name" not in data:
            data["name"] = data.pop("cohortName")
        elif "cohort_name" in data and "name" not in data:
            data["name"] = data.pop("cohort_name")

        if "lstBatch" in data and "lst_batch" not in data:
            data["lst_batch"] = data.pop("lstBatch")
        elif "batch" in data and "lst_batch" not in data:
            data["lst_batch"] = data.pop("batch")

        if "meetingLink" in data and "meeting_link" not in data:
            data["meeting_link"] = data.pop("meetingLink")

        # 2. Mentor aliases
        if "mentor" in data and "mentors" not in data:
            m = data.pop("mentor")
            data["mentors"] = [m] if m else []
        elif "mentor_id" in data and "mentors" not in data:
            m = data.pop("mentor_id")
            data["mentors"] = [m] if m else []
        elif "mentorId" in data and "mentors" not in data:
            m = data.pop("mentorId")
            data["mentors"] = [m] if m else []
        elif "mentor_ids" in data and "mentors" not in data:
            data["mentors"] = data.pop("mentor_ids")

        # 3. Volunteer aliases
        if "volunteer" in data and "volunteers" not in data:
            v = data.pop("volunteer")
            data["volunteers"] = [v] if v else []
        elif "volunteer_id" in data and "volunteers" not in data:
            v = data.pop("volunteer_id")
            data["volunteers"] = [v] if v else []
        elif "volunteerId" in data and "volunteers" not in data:
            v = data.pop("volunteerId")
            data["volunteers"] = [v] if v else []
        elif "volunteer_ids" in data and "volunteers" not in data:
            data["volunteers"] = data.pop("volunteer_ids")

        # 4. Resolve Course if passed as dictionary, code, or name
        if "course" in data and data["course"]:
            course_val = data["course"]
            if isinstance(course_val, dict):
                course_val = course_val.get("id") or course_val.get("code") or course_val.get("name")
            course_str = str(course_val).strip()
            try:
                uuid.UUID(course_str)
                data["course"] = course_str
            except (ValueError, TypeError, AttributeError):
                c_obj = Course.objects.filter(Q(code__iexact=course_str) | Q(name__iexact=course_str)).first()
                if c_obj:
                    data["course"] = str(c_obj.id)

        # 5. Dates sanitization
        def parse_date_val(d):
            if not d:
                return None
            d_str = str(d).strip()
            if "T" in d_str:
                d_str = d_str.split("T")[0]
            elif " " in d_str:
                d_str = d_str.split(" ")[0]
            try:
                return date.fromisoformat(d_str)
            except Exception:
                return None

        if "start_date" in data:
            parsed_start = parse_date_val(data.get("start_date"))
            if parsed_start:
                data["start_date"] = str(parsed_start)
            elif is_create:
                data["start_date"] = str(timezone.localdate())
        elif is_create:
            data["start_date"] = str(timezone.localdate())

        if "end_date" in data:
            parsed_end = parse_date_val(data.get("end_date"))
            if parsed_end:
                data["end_date"] = str(parsed_end)
            elif is_create:
                st = parse_date_val(data.get("start_date")) or timezone.localdate()
                data["end_date"] = str(st + timedelta(days=90))
        elif is_create:
            st = parse_date_val(data.get("start_date")) or timezone.localdate()
            data["end_date"] = str(st + timedelta(days=90))

        # 6. Auto-generate code if empty or missing on create
        if is_create and (not data.get("code") or str(data.get("code")).strip() in ("", "null", "undefined")):
            course_obj = None
            if data.get("course"):
                try:
                    course_obj = Course.objects.filter(id=data["course"]).first()
                except Exception:
                    pass
            prefix = course_obj.code if course_obj else "COHORT"
            existing_count = Cohort.objects.filter(course=course_obj).count() + 1 if course_obj else 1
            code_candidate = f"{prefix}-C{existing_count}".upper()
            if Cohort.objects.filter(code=code_candidate).exists():
                code_candidate = f"{prefix}-{uuid.uuid4().hex[:6].upper()}"
            data["code"] = code_candidate

        # 7. Clean nullable / empty strings
        for field in ["name", "meeting_link", "lst_batch"]:
            if field in data and str(data[field]).strip() in ("", "null", "undefined", "None"):
                data[field] = None

        if "status" in data and data["status"]:
            data["status"] = str(data["status"]).strip().upper()
            if data["status"] not in [c[0] for c in Cohort.Status.choices]:
                data["status"] = Cohort.Status.DRAFT

        if "max_students" in data:
            try:
                data["max_students"] = int(str(data["max_students"]).strip())
            except (ValueError, TypeError):
                data["max_students"] = 30

        # 8. Resolve Mentors & Volunteers by email
        def resolve_user_ids(user_list):
            if not user_list:
                return []
            if not isinstance(user_list, list):
                user_list = [user_list]
            resolved = []
            for u in user_list:
                if not u:
                    continue
                if isinstance(u, dict):
                    u_val = u.get("id") or u.get("email")
                else:
                    u_val = u
                u_str = str(u_val).strip()
                try:
                    uuid.UUID(u_str)
                    resolved.append(u_str)
                except (ValueError, TypeError, AttributeError):
                    u_obj = User.objects.filter(Q(email__iexact=u_str) | Q(mapped_email__iexact=u_str)).first()
                    if u_obj:
                        resolved.append(str(u_obj.id))
            return resolved

        if "mentors" in data:
            data["mentors"] = resolve_user_ids(data["mentors"])
        if "volunteers" in data:
            data["volunteers"] = resolve_user_ids(data["volunteers"])

        return super().to_internal_value(data)

    def validate(self, attrs):
        if self.instance is None:
            course = attrs.get("course")
            if course and getattr(course, "status", None) != Course.Status.PUBLISHED:
                raise serializers.ValidationError({
                    "course": f"A new cohort can only be created for a Published course (Current course status is '{course.status}')."
                })

        start_date = attrs.get("start_date") or (self.instance.start_date if self.instance else None)
        end_date = attrs.get("end_date") or (self.instance.end_date if self.instance else None)
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date cannot be earlier than start date."})

        max_students = attrs.get("max_students") or (self.instance.max_students if self.instance else None)
        if max_students is not None and max_students <= 0:
            raise serializers.ValidationError({"max_students": "Cohort capacity must be greater than 0."})

        requested_status = attrs.get("status", self.instance.status if self.instance else None)
        existing_deadline = self.instance.application_end_date if self.instance else None


        code = attrs.get("code") or (self.instance.code if self.instance else None)
        course = attrs.get("course") or (self.instance.course if self.instance else None)
        if code:
            existing = Cohort.objects.filter(code__iexact=code, course=course)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({"code": f"A cohort with code '{code}' already exists for this course."})

        return super().validate(attrs)
    def validate_status(self, value):
        """
        Explicitly validate status to ensure valid transitions.
        """
        valid_statuses = [c[0] for c in Cohort.Status.choices]
        if value and value.upper() not in valid_statuses:
            raise serializers.ValidationError(f"Invalid status '{value}'. Must be one of: {', '.join(valid_statuses)}")
        return value.upper() if value else value

    def get_mentor_name(self, obj):
        mentors = [item for item in obj.mentors.all() if item.is_active]
        mentor_names = [(m.get_full_name().strip() or m.email) for m in mentors]
        return ", ".join(mentor_names) if mentor_names else None

    def get_active_mentors(self, obj):
        active = [item for item in obj.mentors.all() if item.is_active]
        return [
            {
                "id": str(m.id),
                "first_name": m.first_name or "",
                "last_name": m.last_name or "",
                "email": m.email,
                "name": (m.get_full_name().strip() or m.email)
            } for m in active
        ]

    def get_current_mentor(self, obj):
        first_cm = obj.current_mentors.first()
        return str(first_cm.id) if first_cm else None

    def get_current_mentors_details(self, obj):
        return [
            {
                "id": str(m.id),
                "first_name": m.first_name or "",
                "last_name": m.last_name or "",
                "email": m.email,
                "name": (m.get_full_name().strip() or m.email)
            } for m in obj.current_mentors.all()
        ]

    def get_current_mentor_details(self, obj):
        first_cm = obj.current_mentors.first()
        if not first_cm:
            return None
        return {
            "id": str(first_cm.id),
            "first_name": first_cm.first_name or "",
            "last_name": first_cm.last_name or "",
            "email": first_cm.email,
            "name": (first_cm.get_full_name().strip() or first_cm.email)
        }

    def validate_current_mentors(self, users):
        return self.validate_mentors(users)

    def validate_mentors(self, users):
        valid_roles = {"MENTOR", "ADMIN"}
        invalid = [user.email for user in users if user.role not in valid_roles and not user.is_staff and not user.is_superuser]
        if invalid:
            raise serializers.ValidationError("Only users with the Mentor role can be assigned as mentors.")
        return users

    def validate_volunteers(self, users):
        valid_roles = {"VOLUNTEER", "TRUSTEE", "ADMIN"}
        invalid = [user.email for user in users if user.role not in valid_roles and not user.is_staff and not user.is_superuser]
        if invalid:
            raise serializers.ValidationError(
                "Only users with the Volunteer or Trustee role can be assigned as cohort volunteers."
            )
        return users

    def get_pre_screening(self, obj):
        try:
            from applications.models import PreScreening
            ps = PreScreening.objects.filter(
                application__assigned_cohort=obj
            ).select_related("question_bank", "application__exam").order_by("-created_at").first()
            if not ps:
                return None
            exam = getattr(ps.application, "exam", None) if ps.application else None
            duration_minutes = exam.duration_minutes if exam else getattr(ps, "duration_minutes", 45)
            pass_percentage = (
                float(exam.pass_percentage)
                if exam and exam.pass_percentage is not None
                else (float(ps.pass_percentage) if getattr(ps, "pass_percentage", None) is not None else 40.0)
            )
            total_questions = (
                exam.total_questions
                if exam
                else (getattr(ps.question_bank, "total_questions_per_set", 10) or 10)
            )
            return {
                "id": str(ps.id),
                "scheduled_at": ps.scheduled_at,
                "end_time": ps.end_time,
                "meeting_link": ps.meeting_link,
                "question_bank": str(ps.question_bank_id) if ps.question_bank_id else None,
                "question_bank_id": str(ps.question_bank_id) if ps.question_bank_id else None,
                "question_bank_title": ps.question_bank.title if ps.question_bank else None,
                "duration_minutes": duration_minutes,
                "pass_percentage": pass_percentage,
                "total_questions": total_questions,
                "is_released": ps.is_released,
                "status": ps.status,
                "admin_started_at": ps.admin_started_at,
            }
        except Exception:
            return None

    class Meta:
        model = Cohort
        fields = [
            "id",
            "code",
            "name",
            "course",
            "course_name",
            "course_details",
            "whatsapp_group_link",
            "rules_and_regulations",
            "start_date",
            "end_date",
            "mentors",
            "mentor_name",
            "active_mentors",
            "current_mentors",
            "current_mentors_details",
            "current_mentor",
            "current_mentor_details",
            "volunteers",
            "max_students",
            "status",
            "training_started_at",
            "github_repository_eligible_at",
            "can_provision_github_repositories",
            "github_repositories_last_provisioned_at",
            "lst_batch",
            "meeting_link",
            "default_screening_at",
            "application_end_date",
            "requires_interview",
            "students_count",
            "applications_count",
            "pre_screening",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "training_started_at",
            "github_repositories_last_provisioned_at",
            "created_at",
            "updated_at",
        ]


class GrantRevokeAllCohortsAccessSerializer(serializers.Serializer):
    user_id = serializers.CharField(
        required=True,
        help_text="User UUID or registered email address of the Mentor, Volunteer, or Trustee",
    )


class AssignRevokeVolunteerSerializer(serializers.Serializer):
    volunteer_id = serializers.CharField(
        required=True,
        help_text="User UUID of the active Volunteer or Trustee",
    )


class ReassignVolunteerSerializer(serializers.Serializer):
    volunteer_id = serializers.CharField(
        required=True,
        help_text="User UUID of the active Volunteer or Trustee",
    )
    target_cohort_id = serializers.CharField(
        required=True,
        help_text="Target Cohort UUID to assign the volunteer to",
    )


class AssignRevokeMentorSerializer(serializers.Serializer):
    mentor_id = serializers.CharField(
        required=True,
        help_text="User UUID of the active Mentor",
    )
