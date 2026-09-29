from django.contrib import admin

from common.models import Notification
from common.services.notifications import notify_user
from .models import Certificate
from .services.pdf_generator import issue_certificate_file


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ("certificate_number", "student", "certificate_type", "issued_at", "status")
    search_fields = ("certificate_number", "verification_code", "student__student_code")
    list_filter = ("certificate_type", "status")

    def save_model(self, request, obj, form, change):
        if not obj.issued_by_id:
            obj.issued_by = request.user
        super().save_model(request, obj, form, change)
        rendering_fields = {
            "certificate_number",
            "verification_code",
            "recipient_name",
            "recipient_user",
            "student",
            "application",
            "certificate_type",
            "title",
            "issued_at",
        }
        recipient = obj.student.user if obj.student else obj.recipient_user
        if recipient:
            notify_user(
                recipient,
                title="Certificate status updated" if change else "Certificate issued",
                message=f"Certificate {obj.certificate_number}: {obj.get_status_display()}.",
                notification_type=(
                    Notification.Type.WARNING
                    if obj.status == Certificate.Status.REVOKED
                    else Notification.Type.SUCCESS
                ),
                action_url="certificates",
                dedupe_key=f"certificate:{obj.id}:admin:{obj.updated_at}",
            )
        if obj.status == Certificate.Status.ACTIVE and (
            not obj.certificate_file
            or not change
            or bool(rendering_fields.intersection(form.changed_data))
        ):
            issue_certificate_file(obj)
