from rest_framework import serializers
from .models import Training, TrainingSession, TrainingAttendance

class TrainingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Training
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

class TrainingSessionSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get("meeting_link") and instance.cohort_id:
            data["meeting_link"] = instance.cohort.meeting_link
        return data

    class Meta:
        model = TrainingSession
        fields = "__all__"
        read_only_fields = ["id", "conducted_by", "created_at", "updated_at"]

class TrainingAttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingAttendance
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
