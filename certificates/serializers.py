from rest_framework import serializers
from django.urls import reverse

from .models import Certificate


class CertificateSerializer(serializers.ModelSerializer):
    recipient_display = serializers.SerializerMethodField()
    certificate_type_display = serializers.CharField(
        source="get_certificate_type_display", read_only=True
    )
    subject_display = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    STUDENT_TYPES = {
        Certificate.CertificateType.COURSE,
        Certificate.CertificateType.INTERNSHIP,
        Certificate.CertificateType.MERIT,
        Certificate.CertificateType.PARTICIPATION,
    }
    APPLICATION_TYPES = {
        Certificate.CertificateType.COURSE,
        Certificate.CertificateType.INTERNSHIP,
        Certificate.CertificateType.MERIT,
    }

    class Meta:
        model = Certificate
        fields = [
            "id",
            "certificate_number",
            "verification_code",
            "recipient_name",
            "recipient_user",
            "student",
            "application",
            "certificate_type",
            "certificate_type_display",
            "title",
            "subject_display",
            "issued_at",
            "issued_by",
            "certificate_file",
            "download_url",
            "recipient_display",
            "status",
            "revoked_at",
            "revocation_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "issued_by",
            "certificate_file",
            "created_at",
            "updated_at",
        ]

    def get_recipient_display(self, certificate):
        if str(certificate.recipient_name or "").strip():
            return certificate.recipient_name.strip()
        if certificate.student and certificate.student.user:
            return (
                certificate.student.user.get_full_name().strip()
                or certificate.student.student_code
            )
        if certificate.recipient_user:
            return (
                certificate.recipient_user.get_full_name().strip()
                or certificate.recipient_user.email
            )
        return "Valued Recipient"

    def get_download_url(self, certificate):
        request = self.context.get("request")
        path = reverse("certificate-download-certificate", kwargs={"pk": certificate.pk})
        return request.build_absolute_uri(path) if request else path

    def get_subject_display(self, certificate):
        if str(certificate.title or "").strip():
            return certificate.title.strip()
        if certificate.application and certificate.application.course:
            return certificate.application.course.name
        return certificate.get_certificate_type_display()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        certificate_type = attrs.get(
            "certificate_type",
            getattr(self.instance, "certificate_type", Certificate.CertificateType.COURSE),
        )
        student = attrs.get("student", getattr(self.instance, "student", None))
        application = attrs.get(
            "application", getattr(self.instance, "application", None)
        )
        recipient_user = attrs.get(
            "recipient_user", getattr(self.instance, "recipient_user", None)
        )
        recipient_name = attrs.get(
            "recipient_name", getattr(self.instance, "recipient_name", None)
        )

        if application and student and application.student_id != student.id:
            raise serializers.ValidationError(
                {"application": "The selected application belongs to a different student."}
            )
        if application and not student:
            student = application.student
            attrs["student"] = student

        if certificate_type in self.STUDENT_TYPES:
            if not student:
                raise serializers.ValidationError(
                    {"student": "Select the student receiving this certificate."}
                )
            if certificate_type in self.APPLICATION_TYPES and not application:
                raise serializers.ValidationError(
                    {"application": "Select the related course application."}
                )
            if recipient_user and recipient_user.id != student.user_id:
                raise serializers.ValidationError(
                    {"recipient_user": "Recipient user must match the selected student."}
                )
        else:
            if not recipient_user and not str(recipient_name or "").strip():
                raise serializers.ValidationError(
                    {
                        "recipient_user": (
                            "Select a platform recipient or enter an external recipient name."
                        )
                    }
                )
            if application:
                raise serializers.ValidationError(
                    {"application": "Staff and partner certificates do not use a student application."}
                )
        return attrs
