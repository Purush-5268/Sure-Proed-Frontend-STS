from rest_framework import serializers
from django.utils import timezone

from .models import Course, CourseModule


class CourseModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseModule
        fields = (
            "id", "module_number", "title", "description", "topics",
            "duration_weeks", "order", "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class CourseSerializer(serializers.ModelSerializer):
    modules = CourseModuleSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "code",
            "name",
            "category",
            "domain",
            "subject",
            "description",
            "curriculum",
            "curriculum_file",
            "modules",
            "prerequisites",
            "course_prerequisites",
            "eligibility_criteria",
            "duration_weeks",
            "difficulty",
            "minimum_attendance_percentage",
            "minimum_assignment_percentage",
            "default_screening_at",
            "requires_interview",
            "exam_total_questions",
            "exam_difficulty",
            "exam_duration_minutes",
            "exam_pass_percentage",
            "status",
            "is_elective",
            "electives",
            "has_open_cohort",
            "approved_by",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "has_open_cohort", "electives", "created_at", "updated_at"]

    has_open_cohort = serializers.SerializerMethodField()
    electives = serializers.SerializerMethodField()

    def get_electives(self, obj):
        return [
            {"id": str(e.id), "code": e.code, "name": e.name}
            for e in obj.electives.all()
        ]

    def get_has_open_cohort(self, obj):
        from cohorts.models import Cohort
        return obj.cohorts.filter(status=Cohort.Status.OPEN).exists()

    def validate_default_screening_at(self, value):
        if value and value <= timezone.now():
            raise serializers.ValidationError("Choose a future pre-screen exam date and time.")
        return value
