import uuid
from rest_framework import serializers
from .models import Feedback

class FeedbackSerializer(serializers.ModelSerializer):
    related_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    from courses.models import CourseModule
    module = serializers.PrimaryKeyRelatedField(
        queryset=CourseModule.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = Feedback
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def validate_related_id(self, value):
        if not value or str(value).strip() in ("", "null", "undefined", "None"):
            return None
        val_str = str(value).strip()
        try:
            return uuid.UUID(val_str)
        except (ValueError, TypeError, AttributeError):
            return None

    def validate(self, data):
        feedback_type = data.get("feedback_type")
        if feedback_type == "MENTOR":
            related_id = data.get("related_id")
            module = data.get("module")
            user = self.context["request"].user

            if not related_id:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"related_id": "Mentor ID is required for MENTOR feedback."})
            
            if not module:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"module": "Module is required for MENTOR feedback."})

            if "rating" not in data:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"rating": "Overall rating is required."})
            
            if not data.get("explanation_rating"):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"explanation_rating": "Explanation rating is required."})
                
            if not data.get("interaction_rating"):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"interaction_rating": "Interaction rating is required."})

            # Authorize Mentor and Module against Student's Applications
            from applications.models import Application
            # ENROLLED_STATUSES + COMPLETED + SOFT_SKILLS from policy
            valid_statuses = [
                Application.Status.COHORT_ASSIGNED,
                Application.Status.IN_PROGRESS,
                Application.Status.TRAINING,
                Application.Status.INTERNSHIP_ASSIGNED,
                Application.Status.TRANSFER_COHORT,
                Application.Status.COMPLETED,
                Application.Status.SOFT_SKILLS,
            ]
            
            apps = Application.objects.filter(
                student__user=user,
                status__in=valid_statuses,
                assigned_cohort__isnull=False
            ).select_related("course", "assigned_cohort")
            
            mentor_authorized = False
            module_authorized = False
            
            for app in apps:
                cohort = app.assigned_cohort
                # Check Mentor:
                if cohort.mentors.filter(id=related_id).exists() or cohort.current_mentors.filter(id=related_id).exists():
                    mentor_authorized = True
                # Check Module:
                if app.course_id == module.course_id:
                    module_authorized = True

            if not mentor_authorized:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You are not authorized to review this mentor.")

            if not module_authorized:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You are not authorized to review this module.")

        return data
