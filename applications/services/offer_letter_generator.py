import os
import io
import uuid
import logging
import qrcode
from PIL import Image
from django.conf import settings
from django.utils import timezone
from django.core.files.base import ContentFile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT

logger = logging.getLogger(__name__)

def get_asset_path(filename):
    # Absolute path to the asset
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, "assets", "offer_letter", filename)

def generate_offer_letter_pdf(application):
    """
    Generates a production-grade Offer Letter PDF matching the approved React template.
    """
    # 1. Setup A4 Canvas
    # A4 size is 210mm x 297mm -> 595.27 x 841.89 points
    width, height = A4
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    
    # 2. Draw Background Template
    template_path = get_asset_path("offer-letter-template.png")
    c.drawImage(template_path, 0, 0, width=width, height=height)
    
    # 3. Draw Watermark
    watermark_path = get_asset_path("logo-suretrust.png")
    # CSS: width 77%, height 34%, top 45.5%, left 50%, transform translate(-50%, -50%)
    wm_w = width * 0.77
    wm_h = height * 0.34
    wm_x = (width / 2) - (wm_w / 2)
    # y is from bottom in reportlab
    # css top is 45.5% from top -> center is 45.5% from top
    # reportlab center y = height * (1 - 0.455) = height * 0.545
    wm_center_y = height * (1 - 0.455)
    wm_y = wm_center_y - (wm_h / 2)
    
    try:
        wm_img = Image.open(watermark_path).convert("RGBA")
        alpha = wm_img.split()[3]
        alpha = alpha.point(lambda p: p * 0.17) # 17% opacity as per CSS
        wm_img.putalpha(alpha)
        
        bg = Image.new("RGBA", wm_img.size, (255, 255, 255, 255))
        composite = Image.alpha_composite(bg, wm_img)
        
        wm_io = io.BytesIO()
        composite.save(wm_io, format="PNG")
        wm_io.seek(0)
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(wm_io), wm_x, wm_y, width=wm_w, height=wm_h, mask='auto')
    except Exception as e:
        print(f"Failed to draw watermark: {e}")

    # 4. Define dynamic fields
    student = application.student
    user = student.user
    title = getattr(user, "title", "")
    if user.gender == "MALE":
        title = "Mr"
    elif user.gender == "FEMALE":
        title = "Ms"
    elif not title:
        title = "Mr/Ms"
    
    full_name = user.get_full_name()
    course_name = application.course.name
    
    # Use cohort dates
    cohort = application.assigned_cohort
    start_date_str = cohort.start_date.strftime("%d-%m-%Y") if cohort and cohort.start_date else "TBD"
    
    degree = getattr(student, "degree", "") or ""
    branch = getattr(student, "specialization", "") or ""
    year = getattr(student, "graduation_year", "") or ""
    
    degree_str = f"{degree}" if degree else ""
    if branch:
        degree_str += f" [{branch}]" if degree_str else branch
    if year:
        degree_str += f" {year} year" if degree_str else f"{year} year"
        
    college_name = getattr(student, "college", "") or ""
    city = getattr(student, "city", "") or ""
    state = getattr(student, "state", "") or ""
    college_place = f"{city}, {state}".strip(", ")
    
    domain = course_name
    duration = application.course.duration_weeks // 4 if getattr(application.course, "duration_weeks", None) else "3"
    mentor = "assigned mentor"
    
    # 5. Draw text
    c.setFillColorRGB(0.067, 0.067, 0.067) # #111 color
    
    # Student Details
    # CSS: left 11.5%, top 19.8%, font-size 13pt
    left_margin = width * 0.115
    y_student = height * (1 - 0.198) # top of block
    
    c.setFont("Times-Roman", 13)
    c.drawString(left_margin, y_student, f"{title}. {full_name}")
    
    y_offset = 18.2
    if degree_str:
        c.drawString(left_margin, y_student - y_offset, degree_str)
        y_offset += 18.2
    if college_name:
        c.drawString(left_margin, y_student - y_offset, f"{college_name}")
        y_offset += 18.2
    if college_place:
        c.drawString(left_margin, y_student - y_offset, f"{college_place}")
    
    # Letter Body (Paragraph for justification)
    # CSS: left 11.5%, top 29.2%, width 77%, font-size 12.8pt, line-height 1.48 (18.9pt)
    y_body_start = height * (1 - 0.292)
    body_width = width * 0.77
    
    style = ParagraphStyle(
        name="BodyStyle",
        fontName="Times-Roman",
        fontSize=12.8,
        leading=18.9,
        alignment=TA_JUSTIFY,
        textColor="#111111"
    )
    
    dear_text = f"Dear {full_name},"
    body_html = f"""
    SURE Trust is pleased to inform you that you are admitted as an Intern in the domain of
    “{domain}” to work on industry-relevant projects for {duration} months,
    starting from {start_date_str}. The management of SURE Trust has taken this decision after
    scrutinizing your technical skills in this domain. While there is no legal binding on either side
    in this contract, your commitment is taken as assured based on the words given by you. This
    internship requires you to work in complete coordination with the team, complete the assigned
    task by meeting the deadlines, and attend the weekly meetings mandatorily. You shall be
    reporting to {mentor} your mentor for your internship. It will be your responsibility to support
    the team in submitting the final report on project work completed in the required format and
    making it deployable. After completion of your internship, SURE Trust will give you an
    internship completion certificate after evaluating your performance. If this internship is
    acceptable to you kindly sign the letter and send it back for our records.
    """
    
    p_dear = Paragraph(dear_text, style)
    p_dear.wrapOn(c, body_width, height)
    p_dear.drawOn(c, left_margin, y_body_start - p_dear.height)
    
    p_body = Paragraph(body_html.replace('\n', ' '), style)
    p_body.wrapOn(c, body_width, height)
    p_body.drawOn(c, left_margin, y_body_start - p_dear.height - 14 - p_body.height)
    
    # Signatory Block
    # CSS: right 11.5%, top 64.5% (approx 35.5% from bottom)
    y_sig_block = height * (1 - 0.645)
    sig_right = width * (1 - 0.115)
    
    # Signature Image
    # CSS width 46mm, height 16mm
    sig_w = 46 * 2.83465
    sig_h = 16 * 2.83465
    sig_x = sig_right - sig_w
    sig_y = y_sig_block - sig_h
    sig_path = get_asset_path("signature.png")
    try:
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(sig_path), sig_x, sig_y, width=sig_w, height=sig_h, mask='auto')
    except Exception as e:
        print(f"Failed to draw signature: {e}")
        
    c.setFont("Times-Bold", 13)
    c.drawRightString(sig_right, sig_y - 15, "Prof. Radhakumari Challa")
    
    c.setFont("Times-Roman", 13)
    c.drawRightString(sig_right, sig_y - 31, "Founder & Executive Director, SURE Trust")
    
    # Recipient To Block
    # CSS left 11.5%, top 78.5%
    y_to_block = height * (1 - 0.785)
    c.setFont("Times-Roman", 13)
    c.drawString(left_margin, y_to_block, "To")
    c.drawString(left_margin, y_to_block - 18.2, f"{title}. {full_name}")
    
    # Generate UUID and Verification URL
    if not application.offer_letter_hash:
        application.offer_letter_hash = uuid.uuid4().hex
        application.save(update_fields=["offer_letter_hash"])
        
    frontend_url = getattr(settings, "OFFER_LETTER_FRONTEND_URL", "https://sureproed.com").rstrip('/')
    verification_url = f"{frontend_url}/verify-offer-letter/{application.offer_letter_hash}"
    
    # QR Code Generation
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=0,
    )
    qr.add_data(verification_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#000000", back_color="#ffffff")
    qr_io = io.BytesIO()
    qr_img.save(qr_io, format="PNG")
    qr_io.seek(0)
    
    # Real QR Verification Block
    # CSS: right 11.5%, top 75.0%, width 36mm
    y_qr_block = height * (1 - 0.750)
    qr_block_w = 36 * 2.83465
    qr_block_right = width * (1 - 0.115)
    qr_block_left = qr_block_right - qr_block_w
    
    # QR image is 92px in CSS, but let's make it fit 26mm to look right in the 36mm block
    qr_size = 26 * 2.83465 
    qr_img_x = qr_block_left + (qr_block_w - qr_size) / 2
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(qr_io), qr_img_x, y_qr_block - qr_size, width=qr_size, height=qr_size)
    
    c.setFont("Times-Roman", 7.5)
    scan_text = "Scan to verify"
    scan_text_w = c.stringWidth(scan_text, "Times-Roman", 7.5)
    c.drawString(qr_block_left + (qr_block_w - scan_text_w) / 2, y_qr_block - qr_size - 10, scan_text)
    
    c.setFont("Times-Roman", 5.5)
    uuid_text = f"Offer ID: {application.offer_letter_hash}"
    uuid_text_w = c.stringWidth(uuid_text, "Times-Roman", 5.5)
    c.drawString(qr_block_left + (qr_block_w - uuid_text_w) / 2, y_qr_block - qr_size - 18, uuid_text)
    
    # Footer
    y_footer = height * 0.055
    c.setFont("Times-Roman", 8.5)
    c.setFillColorRGB(0.133, 0.133, 0.133)
    
    # Left col
    c.drawString(left_margin, y_footer + 11.4, "NGO Partner for TATA Group")
    c.drawString(left_margin, y_footer, "AP/2022/0324016")
    
    # Center col
    center_text = "Registered on MCA Portal CSR00039792"
    center_text_w = c.stringWidth(center_text, "Times-Roman", 8.5)
    c.drawString((width - center_text_w) / 2, y_footer + 11.4, center_text)
    
    # Right col
    right_margin = width * (1 - 0.115)
    c.drawRightString(right_margin, y_footer + 11.4, "Registered on Darpan Portal -")
    
    c.showPage()
    c.save()
    buffer.seek(0)
    
    file_name = f"offer_letter_{application.application_number}.pdf"
    content_file = ContentFile(buffer.read(), name=file_name)
    return content_file


def issue_offer_letter(application):
    """
    Robust Two-Phase Offer Letter Generation:
    1. Lock application and reserve unique candidate hash under GENERATING status.
    2. Render and validate staged PDF using reserved candidate hash.
    3. Promote staged file to permanent private storage path.
    4. Commit second transaction setting ISSUED status, issued flag, timestamp.
    5. On failure, transition to FAILED and clear unissued references.
    """
    from django.db import transaction
    from common.models import UserRequest, Notification
    from common.services.notifications import notify_user, display_name
    from applications.models import Application, offer_letter_path
    
    # Step 1: Candidate Hash Reservation & Lock
    with transaction.atomic():
        locked_application = Application.objects.select_for_update().get(id=application.id)
        candidate_hash = locked_application.offer_letter_hash or uuid.uuid4().hex
        locked_application.offer_letter_hash = candidate_hash
        locked_application.offer_letter_status = Application.OfferLetterStatus.GENERATING
        locked_application.save(update_fields=["offer_letter_status", "offer_letter_hash", "updated_at"])

    # Step 2: Render & Validate Staged File
    saved_storage = None
    saved_name = None
    try:
        content_file = generate_offer_letter_pdf(locked_application)
        if not content_file or content_file.size < 500:
            raise ValueError("Rendered offer letter PDF is invalid or empty.")

        # Step 3: Promote staged file & commit final ISSUED state
        with transaction.atomic():
            locked_application = Application.objects.select_for_update().get(id=application.id)

            expected_path = offer_letter_path(locked_application, "offer_letter.pdf")
            locked_application.offer_letter_file.save(expected_path, content_file, save=False)
            saved_storage = locked_application.offer_letter_file.storage
            saved_name = locked_application.offer_letter_file.name

            locked_application.offer_letter_issued = True
            locked_application.offer_letter_status = Application.OfferLetterStatus.ISSUED
            locked_application.offer_letter_issued_at = timezone.now()
            locked_application.save(update_fields=["offer_letter_file", "offer_letter_issued", "offer_letter_status", "offer_letter_issued_at", "updated_at"])
            
            # Auto-resolve any pending user request
            pending_request = UserRequest.objects.filter(
                related_application=locked_application,
                category=UserRequest.Category.OFFER_LETTER,
                status__in=[UserRequest.Status.PENDING, UserRequest.Status.IN_PROGRESS]
            ).first()
            
            if pending_request:
                pending_request.status = UserRequest.Status.RESOLVED
                pending_request.admin_remarks = (pending_request.admin_remarks or "") + "\nAuto-resolved: Offer Letter generated."
                pending_request.resolved_at = timezone.now()
                pending_request.save(update_fields=["status", "admin_remarks", "resolved_at"])

                Notification.objects.filter(
                    notification_type=Notification.Type.ACTION_REQUIRED,
                    title="Offer Letter Requested",
                    message__icontains=display_name(locked_application.student.user)
                ).update(is_read=True)

            # Send Student Notification
            notify_user(
                user=locked_application.student.user,
                title="Offer Letter Issued",
                message=f"Your Offer Letter for {locked_application.course.name} has been successfully generated and is now available for download.",
                notification_type=Notification.Type.INFO
            )
    except Exception as exc:
        logger.error(f"Offer letter generation failed for {locked_application.application_number}: {exc}", exc_info=True)
        if saved_storage and saved_name:
            try:
                if saved_storage.exists(saved_name):
                    saved_storage.delete(saved_name)
            except Exception:
                logger.exception("Failed to clean up an uncommitted offer-letter file")
        with transaction.atomic():
            locked_application = Application.objects.select_for_update().get(id=application.id)
            locked_application.offer_letter_status = Application.OfferLetterStatus.FAILED
            locked_application.offer_letter_issued = False
            locked_application.offer_letter_hash = ""
            locked_application.save(update_fields=["offer_letter_status", "offer_letter_issued", "offer_letter_hash", "updated_at"])
        raise

    return locked_application
