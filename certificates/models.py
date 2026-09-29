from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel


class Certificate(TimeStampedUUIDModel):
    class CertificateType(models.TextChoices):
        COURSE = "COURSE", "Course Completion"
        INTERNSHIP = "INTERNSHIP", "Internship Completion"
        MERIT = "MERIT", "Certificate of Merit"
        VOLUNTEER = "VOLUNTEER", "Volunteer Appreciation"
        MENTOR = "MENTOR", "Mentor Appreciation"
        COMPANY = "COMPANY", "Corporate Partner Appreciation"
        TRUSTEE = "TRUSTEE", "Trustee Service & Leadership"
        PARTICIPATION = "PARTICIPATION", "Participation"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        REVOKED = "REVOKED", "Revoked"

    certificate_number = models.CharField(max_length=50, unique=True)
    verification_code = models.CharField(max_length=100, unique=True)
    recipient_name = models.CharField(max_length=255, blank=True, null=True)
    recipient_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="certificates_received",
        blank=True,
        null=True,
    )
    student = models.ForeignKey("students.StudentProfile", on_delete=models.CASCADE, related_name="certificates", blank=True, null=True)
    application = models.OneToOneField("applications.Application", on_delete=models.CASCADE, related_name="certificate", blank=True, null=True)
    certificate_type = models.CharField(max_length=30, choices=CertificateType.choices, default=CertificateType.COURSE, db_index=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    issued_at = models.DateTimeField()
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="issued_certificates",
        blank=True,
        null=True,
    )
    certificate_file = models.FileField(upload_to="certificates/", blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    revoked_at = models.DateTimeField(blank=True, null=True)
    revocation_reason = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.certificate_number
