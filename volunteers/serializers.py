from rest_framework import serializers

from attendance.models import Attendance

from .models import MentorProfile, VolunteerHelpRequest, VolunteerProfile, VolunteerTask


class AssignedStaffProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_blank=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.SerializerMethodField()
    assigned_cohorts = serializers.SerializerMethodField()
    upcoming_classes = serializers.SerializerMethodField()

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        from common.validators import (
            extract_profile_photo_from_request,
            extract_banner_image_from_request,
            NO_FILE_UPDATE,
        )
        photo_val = extract_profile_photo_from_request(data)
        if photo_val is not NO_FILE_UPDATE:
            data["profile_photo"] = photo_val
        elif "profile_photo" in data and isinstance(data["profile_photo"], str) and not data["profile_photo"].startswith("data:"):
            data.pop("profile_photo", None)

        banner_val = extract_banner_image_from_request(data)
        if banner_val is not NO_FILE_UPDATE:
            data["banner_image"] = banner_val
        elif "banner_image" in data and isinstance(data["banner_image"], str) and not data["banner_image"].startswith("data:"):
            data.pop("banner_image", None)

        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        if user_data:
            user = instance.user
            updated = False
            if "first_name" in user_data:
                user.first_name = user_data["first_name"]
                updated = True
            if "last_name" in user_data:
                user.last_name = user_data["last_name"]
                updated = True
            if updated:
                user.save(update_fields=["first_name", "last_name"])
        return super().update(instance, validated_data)

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.email

    def _cohorts(self, obj):
        raise NotImplementedError

    def get_assigned_cohorts(self, obj):
        return [
            {
                "id": str(cohort.id),
                "code": cohort.code,
                "name": cohort.name,
                "course": cohort.course.name,
                "meeting_link": cohort.meeting_link,
            }
            for cohort in self._cohorts(obj).select_related("course")
        ]

    def get_upcoming_classes(self, obj):
        from django.utils import timezone

        sessions = Attendance.objects.filter(
            cohort__in=self._cohorts(obj), class_date__gte=timezone.localdate()
        ).select_related("cohort").order_by("class_date", "start_time")[:50]
        return [
            {
                "id": str(session.id),
                "cohort": session.cohort.code,
                "title": session.title,
                "class_date": session.class_date,
                "start_time": session.start_time,
                "end_time": session.end_time,
                "status": session.class_status,
                "meeting_link": session.meeting_link or session.cohort.meeting_link,
            }
            for session in sessions
        ]


class MentorProfileSerializer(AssignedStaffProfileSerializer):
    linkedin_id = serializers.CharField(source="user.linkedin_id", read_only=True, allow_null=True)
    is_linkedin_connected = serializers.BooleanField(source="user.is_social_auth_linked", read_only=True)
    courses = serializers.SerializerMethodField()
    course_ids = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)

    def _cohorts(self, obj):
        return obj.user.mentored_cohorts.all()

    def get_courses(self, obj):
        return [
            {
                "id": str(course.id),
                "name": course.name,
                "code": getattr(course, "code", ""),
            }
            for course in obj.courses.all()
        ]

    def update(self, instance, validated_data):
        course_ids = validated_data.pop("course_ids", None)
        if course_ids is not None:
            from courses.models import Course
            import uuid
            from django.db.models import Q
            course_objs = []
            for cid in course_ids:
                if not cid:
                    continue
                try:
                    uuid.UUID(str(cid))
                    c_obj = Course.objects.filter(id=cid).first()
                except (ValueError, AttributeError, TypeError):
                    c_obj = Course.objects.filter(Q(code__iexact=cid) | Q(name__icontains=cid)).first()
                if c_obj:
                    course_objs.append(c_obj)
            instance.courses.set(course_objs)
        return super().update(instance, validated_data)

    class Meta:
        model = MentorProfile
        fields = [
            "id", "user", "first_name", "last_name", "email", "full_name", "company_name", "designation",
            "expertise", "years_of_experience", "date_of_birth", "profile_photo", "banner_image", "bio", "linkedin_id", "linkedin_url",
            "is_linkedin_connected", "github_username", "github_url", "is_github_connected",
            "courses", "course_ids",
            "assigned_cohorts", "upcoming_classes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "user", "email", "created_at", "updated_at"]


class VolunteerProfileSerializer(AssignedStaffProfileSerializer):
    linkedin_id = serializers.CharField(source="user.linkedin_id", read_only=True, allow_null=True)

    def _cohorts(self, obj):
        return obj.user.volunteered_cohorts.all()

    class Meta:
        model = VolunteerProfile
        fields = [
            "id", "user", "first_name", "last_name", "email", "full_name", "organization_name", "occupation",
            "date_of_birth", "profile_photo", "banner_image", "skills", "availability_notes", "bio", "linkedin_id", "linkedin_url",
            "assigned_cohorts", "upcoming_classes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "user", "email", "created_at", "updated_at"]


class VolunteerTaskSerializer(serializers.ModelSerializer):
    assigned_to_email = serializers.ReadOnlyField(source="assigned_to.email")
    assigned_by_email = serializers.ReadOnlyField(source="assigned_by.email")
    cohort_name = serializers.ReadOnlyField(source="cohort.name")

    class Meta:
        model = VolunteerTask
        fields = [
            "id",
            "title",
            "description",
            "cohort",
            "cohort_name",
            "assigned_to",
            "assigned_to_email",
            "assigned_by",
            "assigned_by_email",
            "priority",
            "status",
            "due_date",
            "completion_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "assigned_by", "created_at", "updated_at"]


class VolunteerHelpRequestSerializer(serializers.ModelSerializer):
    requested_by_email = serializers.ReadOnlyField(source="requested_by.email")
    cohort_name = serializers.ReadOnlyField(source="cohort.name")
    task_title = serializers.ReadOnlyField(source="task.title")

    class Meta:
        model = VolunteerHelpRequest
        fields = [
            "id",
            "task",
            "task_title",
            "cohort",
            "cohort_name",
            "requested_by",
            "requested_by_email",
            "subject",
            "message",
            "assisting_volunteers",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "requested_by", "created_at", "updated_at"]
