from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from django.db import transaction

from .models import Certificate
from .serializers import CertificateSerializer
from .services.pdf_generator import issue_certificate_file
from .services.verification_profile import build_verification_profile


from common.permissions import IsAdminOrReadOnly
from common.access import has_global_cohort_access
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from common.models import Notification
from common.services.notifications import notify_user

class CertificateViewSet(viewsets.ModelViewSet):
    serializer_class = CertificateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        queryset = Certificate.objects.select_related(
            "student", "student__user", "recipient_user", "application",
            "application__course", "issued_by"
        ).order_by("-issued_at")
        if not user.is_authenticated:
            if getattr(self, "action", None) in {'download_certificate', 'verify_certificate', 'verification_profile', 'verification_resume'}:
                return queryset.filter(status=Certificate.Status.ACTIVE)
            return Certificate.objects.none()
        if has_global_cohort_access(user):
            qs = queryset
        elif getattr(user, "role", "") == "MENTOR":
            qs = queryset.filter(
                Q(application__assigned_cohort__mentors=user) | Q(recipient_user=user),
            ).distinct()
        else:
            qs = queryset.filter(Q(student__user=user) | Q(recipient_user=user)).distinct()

        # Support filtering by cohort, student, and certificate status
        cohort = self.request.query_params.get("cohort") or self.request.query_params.get("assigned_cohort")
        student = self.request.query_params.get("student")
        cert_status = self.request.query_params.get("status")

        if cohort:
            try:
                import uuid
                uuid.UUID(str(cohort))
                qs = qs.filter(application__assigned_cohort_id=cohort)
            except (ValueError, TypeError):
                qs = qs.filter(
                    Q(application__assigned_cohort__code__iexact=cohort) |
                    Q(application__assigned_cohort__name__icontains=cohort)
                )
        if student:
            try:
                import uuid
                uuid.UUID(str(student))
                qs = qs.filter(student_id=student)
            except (ValueError, TypeError):
                qs = qs.filter(
                    Q(student__student_code__iexact=student) |
                    Q(student__user__email__iexact=student)
                )
        if cert_status:
            qs = qs.filter(status__iexact=cert_status)

        return qs

    def get_permissions(self):
        if self.action in {'verify_certificate', 'verification_profile', 'verification_resume', 'download_certificate'}:
            return [AllowAny()]
        return super().get_permissions()

    @transaction.atomic
    def perform_create(self, serializer):
        certificate = serializer.save(issued_by=self.request.user)
        recipient = certificate.student.user if certificate.student else certificate.recipient_user
        if recipient:
            notify_user(
                recipient,
                title="Certificate issued",
                message=(
                    f"Your {certificate.get_certificate_type_display()} certificate "
                    f"{certificate.certificate_number} is now available."
                ),
                notification_type=Notification.Type.SUCCESS,
                action_url="certificates",
                dedupe_key=f"certificate:{certificate.id}:issued",
            )
        if certificate.status == Certificate.Status.ACTIVE:
            issue_certificate_file(certificate)

    @transaction.atomic
    def perform_update(self, serializer):
        previous_status = serializer.instance.status
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
        must_regenerate = bool(rendering_fields.intersection(serializer.validated_data))
        certificate = serializer.save()
        recipient = certificate.student.user if certificate.student else certificate.recipient_user
        if recipient and certificate.status != previous_status:
            notify_user(
                recipient,
                title="Certificate status updated",
                message=(
                    f"Certificate {certificate.certificate_number} is now "
                    f"{certificate.get_status_display()}."
                ),
                notification_type=(
                    Notification.Type.WARNING
                    if certificate.status == Certificate.Status.REVOKED
                    else Notification.Type.SUCCESS
                ),
                action_url="certificates",
                dedupe_key=f"certificate:{certificate.id}:status:{certificate.status}",
            )
        if certificate.status == Certificate.Status.ACTIVE and (
            must_regenerate or not certificate.certificate_file
        ):
            issue_certificate_file(certificate)

    @action(detail=False, methods=["get"], url_path="metadata")
    def metadata(self, request):
        """Authoritative options used by Django admin and frontend forms."""
        return Response({
            "certificate_types": [
                {"value": value, "label": label}
                for value, label in Certificate.CertificateType.choices
            ],
            "statuses": [
                {"value": value, "label": label}
                for value, label in Certificate.Status.choices
            ],
            "student_certificate_types": sorted(
                CertificateSerializer.STUDENT_TYPES
            ),
            "application_required_types": sorted(
                CertificateSerializer.APPLICATION_TYPES
            ),
        })

    @action(detail=False, methods=["get"], url_path="verify")
    def verify_certificate(self, request):
        """
        Public certificate verification endpoint.
        Query params: ?code=VERIFY-XXX or ?number=CERT-XXX
        """
        code = request.query_params.get("code")
        number = request.query_params.get("number")

        if not code and not number:
            return Response(
                {"error": "Please provide 'code' or 'number' query parameter to verify certificate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        certificates = Certificate.objects.select_related(
            "student", "student__user", "recipient_user", "application__course"
        ).filter(status=Certificate.Status.ACTIVE)
        cert = None
        if code:
            cert = certificates.filter(
                Q(verification_code=code) | Q(certificate_number=code)
            ).first()
        elif number:
            cert = certificates.filter(certificate_number=number).first()

        if not cert:
            return Response(
                {"verified": False, "message": "Certificate not found or revoked."},
                status=status.HTTP_444_NOT_FOUND if hasattr(status, "HTTP_444_NOT_FOUND") else status.HTTP_404_NOT_FOUND,
            )

        recipient_name = cert.recipient_name
        if not recipient_name and cert.student and cert.student.user:
            recipient_name = f"{cert.student.user.first_name} {cert.student.user.last_name}".strip() or cert.student.student_code
        elif not recipient_name and cert.recipient_user:
            recipient_name = f"{cert.recipient_user.first_name} {cert.recipient_user.last_name}".strip() or cert.recipient_user.email

        title = cert.title
        if not title and cert.application and cert.application.course:
            title = cert.application.course.name

        return Response(
            {
                "verified": True,
                "certificate_number": cert.certificate_number,
                "verification_code": cert.verification_code,
                "recipient_name": recipient_name or "Valued Recipient",
                "title": title or cert.get_certificate_type_display(),
                "certificate_type": cert.certificate_type,
                "certificate_type_display": cert.get_certificate_type_display(),
                "issued_at": cert.issued_at,
                "pdf_url": (
                    request.build_absolute_uri(
                        f"/api/certificates/{cert.id}/download/"
                    )
                    if cert.certificate_file
                    else None
                ),
            },
            status=status.HTTP_200_OK,
        )

    def _active_certificate_from_code(self, code):
        if not code:
            return None
        return Certificate.objects.select_related(
            "student", "student__user", "recipient_user", "application",
            "application__course", "application__assigned_cohort",
        ).filter(
            Q(verification_code=code) | Q(certificate_number=code),
            status=Certificate.Status.ACTIVE,
        ).first()

    @action(detail=False, methods=["get"], url_path="verification-profile")
    def verification_profile(self, request):
        certificate = self._active_certificate_from_code(request.query_params.get("code"))
        if not certificate:
            return Response(
                {"verified": False, "message": "Certificate not found or revoked."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(build_verification_profile(certificate, request))

    @action(detail=False, methods=["get"], url_path="verification-resume")
    def verification_resume(self, request):
        certificate = self._active_certificate_from_code(request.query_params.get("code"))
        student = certificate.student if certificate else None
        if not student or not student.is_public or not student.resume:
            return Response({"error": "Public resume is not available."}, status=status.HTTP_404_NOT_FOUND)
        if not student.resume.storage.exists(student.resume.name):
            return Response({"error": "Resume file is missing from storage."}, status=status.HTTP_404_NOT_FOUND)
        from django.http import FileResponse
        response = FileResponse(student.resume.open("rb"), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{student.student_code}_resume.pdf"'
        response["X-Robots-Tag"] = "noindex, nofollow"
        return response

    @action(detail=True, methods=["get"], url_path="download", permission_classes=[AllowAny])
    def download_certificate(self, request, pk=None):
        cert = self.get_object()
        user = request.user

        # Revoked certificates are never downloadable
        if cert.status == Certificate.Status.REVOKED:
            return Response({"error": "Certificate has been revoked."}, status=status.HTTP_410_GONE)

        # For non-active certificates, enforce authentication and ownership/staff checks
        if cert.status != Certificate.Status.ACTIVE:
            if not user.is_authenticated:
                raise PermissionDenied("Authentication required to view non-active certificate.")
            role = getattr(user, "role", "")
            is_owner = (cert.student and cert.student.user_id == user.id) or (cert.recipient_user_id == user.id)
            is_staff_or_admin = user.is_staff or role == "ADMIN"
            is_cohort_mentor = (
                role == "MENTOR"
                and cert.application
                and cert.application.assigned_cohort
                and cert.application.assigned_cohort.mentors.filter(id=user.id).exists()
            )
            if not (is_owner or is_staff_or_admin or is_cohort_mentor):
                raise PermissionDenied("You do not have permission to download this certificate.")

        # If file is not yet generated or missing on disk, generate on the fly
        if not cert.certificate_file or not cert.certificate_file.storage.exists(cert.certificate_file.name):
            if cert.status == Certificate.Status.ACTIVE:
                issue_certificate_file(cert)
                cert.refresh_from_db()
            if not cert.certificate_file or not cert.certificate_file.storage.exists(cert.certificate_file.name):
                return Response({"error": "Certificate file not found in storage."}, status=status.HTTP_404_NOT_FOUND)

        from django.http import FileResponse
        response = FileResponse(cert.certificate_file.open("rb"), content_type="application/pdf")
        filename = f"Certificate_{cert.certificate_number}.pdf"
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response
