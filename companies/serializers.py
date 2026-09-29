from rest_framework import serializers

from .models import Company, JobPosting, JobReference


class CompanySerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        from common.access import is_admin
        user = getattr(self.context.get("request"), "user", None)
        if not is_admin(user) and (not user or not user.is_authenticated or instance.user_id != user.pk):
            for field in ("user", "first_name", "last_name", "email", "shortlisted_students"):
                data.pop(field, None)
        return data
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "user",
            "first_name",
            "last_name",
            "email",
            "name",
            "description",
            "website",
            "logo",
            "industry",
            "location",
            "is_verified",
            "shortlisted_students",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "first_name", "last_name", "email", "is_verified", "shortlisted_students", "created_at", "updated_at"]


class JobPostingSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        from common.access import is_admin
        user = getattr(self.context.get("request"), "user", None)
        if not is_admin(user) and (not user or not user.is_authenticated or instance.company.user_id != user.pk):
            data.pop("applicants", None)
        return data
    company_name = serializers.ReadOnlyField(source="company.name")

    class Meta:
        model = JobPosting
        fields = [
            "id",
            "company",
            "company_name",
            "title",
            "description",
            "requirements",
            "location",
            "salary_range",
            "status",
            "applicants",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class JobReferenceSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    notify_students = serializers.BooleanField(write_only=True, required=False, default=True)

    class Meta:
        model = JobReference
        fields = [
            "id", "title", "cohort", "company", "company_name", "location",
            "employment_type", "description", "apply_url", "deadline", "is_active",
            "created_by", "notify_students", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data.pop("notify_students", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("notify_students", None)
        return super().update(instance, validated_data)


class ShortlistStudentSerializer(serializers.Serializer):
    student_id = serializers.CharField(
        required=True,
        help_text="StudentProfile UUID to shortlist for hiring",
    )
