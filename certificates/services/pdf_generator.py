"""Server-owned certificate PDF rendering and storage."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote_plus

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "certificate_template.jpg"
PAGE_SIZE = landscape(A4)
STUDENT_CERTIFICATE_TYPES = {"COURSE", "INTERNSHIP", "MERIT", "PARTICIPATION"}


@dataclass(frozen=True)
class CertificateRenderContext:
    recipient_name: str
    certificate_title: str
    subtitle: str
    recognition_text: str
    subject: str
    score_text: str
    duration_text: str
    certificate_number: str
    verification_code: str
    verification_url: str
    issue_date: str


def _format_date(value: date | datetime | None, date_format: str = "%d %b %Y") -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        value = value.date()
    return value.strftime(date_format)


def _recipient_name(certificate) -> str:
    if str(certificate.recipient_name or "").strip():
        return certificate.recipient_name.strip()

    student = certificate.student
    if student and student.user:
        return student.user.get_full_name().strip() or student.student_code

    recipient = certificate.recipient_user
    if recipient:
        return recipient.get_full_name().strip() or recipient.email

    return "Valued Recipient"


def _verification_url(code: str) -> str:
    base_url = (
        getattr(
            settings,
            "CERTIFICATE_VERIFICATION_URL",
            "https://api.sureproed.com/api/certificates/verify/",
        )
        if settings.configured
        else "https://api.sureproed.com/api/certificates/verify/"
    )
    # Migrate older production .env values that pointed QR scans at the raw JSON
    # verifier. The public frontend route renders the full verified journey and in
    # turn consumes privacy-filtered Django APIs.
    if "/api/certificates/verify" in base_url:
        frontend_url = (
            getattr(settings, "FRONTEND_URL", "https://sureproed.com")
            if settings.configured
            else "https://sureproed.com"
        )
        base_url = f"{frontend_url.rstrip('/')}/certificate/verify/{{code}}"
    if "{code}" in base_url:
        return base_url.format(code=quote_plus(code))
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}code={quote_plus(code)}"


def build_certificate_context(certificate) -> CertificateRenderContext:
    """Resolve every printed field from the authoritative Django record."""
    certificate_type = certificate.certificate_type
    application = certificate.application
    cohort = application.assigned_cohort if application else None
    course = application.course if application else None

    subject = str(certificate.title or "").strip()
    if not subject and course:
        subject = course.name
    if not subject:
        subject = certificate.get_certificate_type_display()

    recognition_texts = {
        "COURSE": "for successfully completing the programme",
        "INTERNSHIP": "for successfully completing the internship in",
        "MERIT": "in recognition of outstanding performance in",
        "PARTICIPATION": "for active participation in",
        "VOLUNTEER": "in appreciation of valuable volunteer service to",
        "MENTOR": "in appreciation of exceptional mentorship for",
        "COMPANY": "in appreciation of partnership and support for",
        "TRUSTEE": "in recognition of service and leadership for",
    }

    score_text = ""
    if (
        certificate_type in {"COURSE", "INTERNSHIP", "MERIT"}
        and application
        and application.final_score is not None
    ):
        score_text = f"Final Score: {application.final_score:.2f}%"

    if cohort and cohort.start_date and cohort.end_date:
        duration_text = (
            f"Programme duration: {_format_date(cohort.start_date)} to "
            f"{_format_date(cohort.end_date)}"
        )
    else:
        duration_text = f"Issued on {_format_date(certificate.issued_at)}"

    subtitle = (
        "In Collaboration with AICTE"
        if certificate_type in STUDENT_CERTIFICATE_TYPES
        else "Appreciation and Recognition"
    )

    certificate_title = certificate.get_certificate_type_display()
    if "certificate" not in certificate_title.lower():
        certificate_title = f"{certificate_title} Certificate"

    return CertificateRenderContext(
        recipient_name=_recipient_name(certificate),
        certificate_title=certificate_title,
        subtitle=subtitle,
        recognition_text=recognition_texts.get(
            certificate_type, "in recognition of achievement in"
        ),
        subject=subject,
        score_text=score_text,
        duration_text=duration_text,
        certificate_number=certificate.certificate_number,
        verification_code=certificate.verification_code,
        verification_url=_verification_url(certificate.verification_code),
        issue_date=_format_date(certificate.issued_at),
    )


def _legacy_context(
    student_name,
    course_name,
    certificate_number,
    issue_date,
    cert_type,
) -> CertificateRenderContext:
    """Keep older call sites compatible while they migrate to Certificate objects."""
    type_label = str(cert_type or "Course Completion").strip()
    if not type_label.lower().endswith("certificate"):
        type_label = f"{type_label} Certificate"
    issued = _format_date(issue_date) if isinstance(issue_date, (date, datetime)) else str(issue_date)
    verification_code = str(certificate_number)
    return CertificateRenderContext(
        recipient_name=str(student_name or "Valued Recipient"),
        certificate_title=type_label,
        subtitle="In Collaboration with AICTE",
        recognition_text="for successfully completing the programme",
        subject=str(course_name or "SURE ProEd Programme"),
        score_text="",
        duration_text=f"Issued on {issued}",
        certificate_number=str(certificate_number),
        verification_code=verification_code,
        verification_url=_verification_url(verification_code),
        issue_date=issued,
    )


def _draw_fitted_centered_text(
    pdf,
    text: str,
    *,
    y: float,
    max_width: float,
    font_name: str,
    max_size: float,
    min_size: float,
    color: HexColor,
) -> float:
    font_size = max_size
    while font_size > min_size and stringWidth(text, font_name, font_size) > max_width:
        font_size -= 0.5
    pdf.setFillColor(color)
    pdf.setFont(font_name, font_size)
    pdf.drawCentredString(PAGE_SIZE[0] / 2, y, text)
    return font_size


def _qr_image(url: str) -> ImageReader:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#241238", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return ImageReader(buffer)


def _render_context(context: CertificateRenderContext) -> bytes:
    if not TEMPLATE_PATH.is_file():
        raise FileNotFoundError(f"Certificate template is missing: {TEMPLATE_PATH}")

    buffer = io.BytesIO()
    width, height = PAGE_SIZE
    pdf = canvas.Canvas(buffer, pagesize=PAGE_SIZE, pageCompression=1)
    pdf.setTitle(f"Certificate {context.certificate_number}")
    pdf.setAuthor("SURE ProEd")
    pdf.setSubject(context.certificate_title)
    pdf.drawImage(
        str(TEMPLATE_PATH),
        0,
        0,
        width=width,
        height=height,
        preserveAspectRatio=False,
        mask="auto",
    )

    # The supplied artwork contains sample-only headings. These clean panels retain
    # its border, logos and signatures while making all backend certificate types valid.
    pdf.setFillColor(HexColor("#FCFCFC"))
    pdf.roundRect(112, 447, width - 224, 67, 5, stroke=0, fill=1)
    pdf.roundRect(80, 193, width - 160, 247, 7, stroke=0, fill=1)

    primary = HexColor("#52208A")
    navy = HexColor("#173D78")
    ink = HexColor("#17111D")
    muted = HexColor("#4D4653")

    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawRightString(width - 24, height - 17, f"Certificate ID: {context.certificate_number}")

    _draw_fitted_centered_text(
        pdf,
        context.certificate_title,
        y=489,
        max_width=width - 245,
        font_name="Times-Bold",
        max_size=29,
        min_size=18,
        color=primary,
    )
    _draw_fitted_centered_text(
        pdf,
        context.subtitle,
        y=461,
        max_width=width - 280,
        font_name="Times-Roman",
        max_size=16,
        min_size=12,
        color=navy,
    )

    pdf.setFont("Times-Italic", 16)
    pdf.setFillColor(ink)
    pdf.drawCentredString(width / 2, 417, "Presented to")
    _draw_fitted_centered_text(
        pdf,
        context.recipient_name,
        y=376,
        max_width=width - 165,
        font_name="Times-Bold",
        max_size=31,
        min_size=18,
        color=primary,
    )
    _draw_fitted_centered_text(
        pdf,
        context.recognition_text,
        y=337,
        max_width=width - 185,
        font_name="Times-Roman",
        max_size=16,
        min_size=11,
        color=ink,
    )
    _draw_fitted_centered_text(
        pdf,
        context.subject,
        y=303,
        max_width=width - 145,
        font_name="Times-Bold",
        max_size=24,
        min_size=13,
        color=navy,
    )

    if context.score_text:
        _draw_fitted_centered_text(
            pdf,
            context.score_text,
            y=262,
            max_width=width - 220,
            font_name="Times-Roman",
            max_size=16,
            min_size=11,
            color=ink,
        )

    _draw_fitted_centered_text(
        pdf,
        context.duration_text,
        y=226,
        max_width=width - 170,
        font_name="Helvetica-Bold",
        max_size=11,
        min_size=8,
        color=muted,
    )

    qr_size = 54
    qr_x = (width - qr_size) / 2
    qr_y = 52
    pdf.setFillColor(HexColor("#FFFFFF"))
    pdf.roundRect(qr_x - 4, qr_y - 4, qr_size + 8, qr_size + 8, 3, stroke=0, fill=1)
    pdf.drawImage(_qr_image(context.verification_url), qr_x, qr_y, qr_size, qr_size, mask="auto")
    pdf.setFillColor(muted)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawCentredString(width / 2, qr_y - 12, f"Verify: {context.verification_code}")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def generate_certificate_pdf(
    student_name=None,
    course_name=None,
    certificate_number=None,
    issue_date=None,
    cert_type="Course Completion",
    *,
    certificate=None,
):
    """Generate certificate bytes from Django data, with legacy-call compatibility."""
    context = (
        build_certificate_context(certificate)
        if certificate is not None
        else _legacy_context(
            student_name,
            course_name,
            certificate_number,
            issue_date,
            cert_type,
        )
    )
    return _render_context(context)


def issue_certificate_file(certificate) -> str:
    """Generate and atomically repoint the model to its backend-owned PDF."""
    pdf_bytes = generate_certificate_pdf(certificate=certificate)
    old_name = certificate.certificate_file.name if certificate.certificate_file else ""
    safe_number = re.sub(r"[^A-Za-z0-9_.-]+", "-", certificate.certificate_number).strip("-.")
    filename = f"Certificate_{safe_number or certificate.pk}.pdf"
    storage = certificate.certificate_file.storage

    certificate.certificate_file.save(filename, ContentFile(pdf_bytes), save=False)
    new_name = certificate.certificate_file.name
    try:
        certificate.save(update_fields=["certificate_file", "updated_at"])
    except Exception:
        if new_name and storage.exists(new_name):
            storage.delete(new_name)
        certificate.certificate_file.name = old_name
        raise

    if old_name and old_name != new_name:
        def delete_replaced_file():
            if storage.exists(old_name):
                storage.delete(old_name)

        transaction.on_commit(delete_replaced_file)
    return new_name
