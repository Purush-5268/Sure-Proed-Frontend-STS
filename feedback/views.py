from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from common.permissions import IsOwnerOrAdmin

from .models import Feedback
from .serializers import FeedbackSerializer

class FeedbackViewSet(viewsets.ModelViewSet):
    serializer_class = FeedbackSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Feedback.objects.none()
        if user.is_staff or getattr(user, 'role', '') == 'ADMIN':
            qs = Feedback.objects.all().order_by("-created_at")
        else:
            qs = Feedback.objects.filter(user=user).order_by("-created_at")

        # Allow frontend to filter by feedback_type and related_id
        # e.g. GET /api/feedback/?feedback_type=SYSTEM
        # e.g. GET /api/feedback/?feedback_type=COURSE&related_id=<course-uuid>
        feedback_type = self.request.query_params.get("feedback_type")
        related_id = self.request.query_params.get("related_id")
        if feedback_type:
            qs = qs.filter(feedback_type=feedback_type)
        if related_id:
            qs = qs.filter(related_id=related_id)
        return qs

    def perform_create(self, serializer):
        """
        Upsert logic: one feedback per user per context.
        - SYSTEM feedback: one per user (feedback_type=SYSTEM, related_id=NULL)
        - COURSE/TRAINING feedback: one per user per related_id
        """
        user = self.request.user
        feedback_type = serializer.validated_data.get("feedback_type", Feedback.FeedbackType.SYSTEM)
        related_id = serializer.validated_data.get("related_id")

        # Build the lookup key for this context
        lookup = {"user": user, "feedback_type": feedback_type}
        if related_id:
            lookup["related_id"] = related_id
        else:
            lookup["related_id__isnull"] = True

        module = serializer.validated_data.get("module")
        if module:
            lookup["module"] = module
        else:
            lookup["module__isnull"] = True

        # Check if feedback already exists for this context
        existing = Feedback.objects.filter(**lookup).first()
        if existing:
            # Update the existing record
            existing.rating = serializer.validated_data.get("rating", existing.rating)
            existing.comments = serializer.validated_data.get("comments", existing.comments)
            existing.explanation_rating = serializer.validated_data.get("explanation_rating", existing.explanation_rating)
            existing.interaction_rating = serializer.validated_data.get("interaction_rating", existing.interaction_rating)
            existing.improvements_text = serializer.validated_data.get("improvements_text", existing.improvements_text)
            existing.save(update_fields=["rating", "comments", "explanation_rating", "interaction_rating", "improvements_text", "updated_at"])
            # Replace the serializer instance so the response reflects the updated record
            serializer.instance = existing
        else:
            serializer.save(user=user)
