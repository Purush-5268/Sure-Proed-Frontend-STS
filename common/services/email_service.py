import logging

from django.conf import settings
from common.services.email_delivery_service import EmailDeliveryService
import uuid

logger = logging.getLogger(__name__)


def send_transactional_email(subject, message, recipient_list, html_message=None, category="general"):
    """
    Deprecated internal interface to route to EmailDeliveryService.
    All transactional emails must be sent individually.
    """
    success = True
    for recipient in recipient_list:
        idempotency_key = f"{category}:{recipient}:{uuid.uuid4()}"
        res = EmailDeliveryService.send_transactional_email(
            category=category,
            subject=subject,
            message=message,
            recipient=recipient,
            html_message=html_message,
            idempotency_key=idempotency_key
        )
        if not res:
            success = False
    return success

def send_bulk_session_invitations(subject, message, recipient_list, html_message=None):
    """
    High-throughput bulk email delivery using BCC chunking.
    Avoids revealing recipient emails and limits SMTP batch size (50 max) per ZeptoMail limits.
    For Bulk, we bypass the strict individual transactional logging as it is rate-limited via Celery,
    but we could also route it through a modified bulk endpoint in the future.
    """
    from django.core.mail import EmailMultiAlternatives
    success_count = 0
    chunk_size = 50
    for i in range(0, len(recipient_list), chunk_size):
        chunk = recipient_list[i:i + chunk_size]
        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                bcc=chunk
            )
            if html_message:
                msg.attach_alternative(html_message, "text/html")
            msg.send(fail_silently=False)
            success_count += len(chunk)
            logger.info(f"Bulk chunk sent successfully to {len(chunk)} recipients.")
        except Exception as exc:
            logger.error(f"Failed to send bulk session email chunk: {exc}")
    return success_count


def send_email_verification(user_email, token):
    subject = "Sure ProEd - Verify Your Email"
    message = f"Thank you for registering. Please verify your email using token: {token}"
    return send_transactional_email(subject, message, [user_email], category="email_verification")


def send_password_reset_email(user_email, reset_link):
    subject = "Sure ProEd - Password / Account Setup"
    message = f"Click the link below to set up or reset your password:\n{reset_link}"
    html_message = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
    </head>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <p>Welcome to Sure ProEd!</p>
        <p>Click the link below to set up or reset your password:</p>
        <p style="margin-top: 20px;">
            <a href="{reset_link}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Set up your password
            </a>
        </p>
        <p style="margin-top: 30px; font-size: 12px; color: #666;">
            If you're having trouble clicking the button, copy and paste this link into your web browser:<br>
            <a href="{reset_link}">{reset_link}</a>
        </p>
    </body>
    </html>
    '''
    return send_transactional_email(subject, message, [user_email], html_message=html_message, category="password_reset")


def send_password_reset_otp(user_email, otp):
    subject = "Sure ProEd - Password Reset OTP Code"
    message = f"Your password reset verification code is: {otp}\n\nThis OTP is valid for 5 minutes."
    html_message = f"<h2>Sure ProEd Password Reset</h2><p>Your verification code is: <strong>{otp}</strong></p><p>This OTP will expire in 5 minutes.</p>"
    return send_transactional_email(subject, message, [user_email], html_message=html_message, category="otp")


def send_email_verification_otp(user_email, otp):
    subject = "Sure ProEd - Email Verification Code"
    message = f"Your email verification code is: {otp}\n\nThis code will expire in 10 minutes."
    html_message = f"<h2>Sure ProEd Email Verification</h2><p>Your verification code is: <strong>{otp}</strong></p><p>This code will expire in 10 minutes.</p>"
    return send_transactional_email(subject, message, [user_email], html_message=html_message, category="otp")



def send_application_confirmation_email(user_email, course_name, application_number):
    subject = f"Sure ProEd - Application Received ({application_number})"
    message = f"Your application for '{course_name}' has been received. Application Number: {application_number}"
    return send_transactional_email(subject, message, [user_email], category="application_confirmation")


def send_exam_notification_email(user_email, exam_title, duration_minutes):
    subject = f"Sure ProEd - Exam Scheduled: {exam_title}"
    message = f"Your exam '{exam_title}' has been scheduled. Duration: {duration_minutes} minutes."
    return send_transactional_email(subject, message, [user_email], category="exam_scheduled")


def send_cohort_assignment_email(user_email, cohort_name, course_name):
    subject = f"Sure ProEd - Assigned to Cohort: {cohort_name}"
    message = f"Congratulations! You have been assigned to cohort '{cohort_name}' for course '{course_name}'."
    return send_transactional_email(subject, message, [user_email], category="cohort_assigned")


def send_assignment_reminder_email(user_email, assignment_title, deadline):
    subject = f"Sure ProEd - Reminder: Assignment Due ({assignment_title})"
    message = f"Reminder: Your assignment '{assignment_title}' is due by {deadline}."
    return send_transactional_email(subject, message, [user_email], category="assignment_reminder")


def send_certificate_notification_email(user_email, certificate_number, download_url):
    subject = "Sure ProEd - Congratulations! Your Certificate is Ready"
    message = f"Your certificate ({certificate_number}) is ready for download:\n{download_url}"
    return send_transactional_email(subject, message, [user_email], category="certificate_ready")


def send_course_discontinue_otp(user_email: str, course_name: str, otp: str):
    subject = f"Sure ProEd - Course Discontinuation OTP: {course_name}"
    message = (
        f"You have requested to discontinue your enrollment in '{course_name}'.\n\n"
        f"Your verification code is: {otp}\n\n"
        f"This code will expire in 10 minutes. If you did not make this request, please contact support immediately."
    )
    html_message = (
        f"<h2>Sure ProEd Course Discontinuation</h2>"
        f"<p>You have requested to discontinue your enrollment in <strong>{course_name}</strong>.</p>"
        f"<p>Your confirmation OTP code is: <strong style='font-size: 24px; color: #DC2626;'>{otp}</strong></p>"
        f"<p>This code will expire in 10 minutes.</p>"
        f"<p><em>If you did not request this, please ignore this email or contact support.</em></p>"
    )
    return send_transactional_email(subject, message, [user_email], html_message=html_message, category="otp")


def send_course_dropout_notification_email(user_email: str, course_name: str, cohort_name: str | None = None):
    subject = f"Sure ProEd - Discontinued from Course: {course_name}"
    cohort_str = f" ({cohort_name})" if cohort_name else ""
    message = (
        f"Your application/enrollment for '{course_name}'{cohort_str} has been marked as Dropped.\n\n"
        f"Any scheduled pre-screening exams for this application have been automatically cancelled.\n"
        f"You are now eligible to apply for another course on the Sure ProEd platform."
    )
    html_message = (
        f"<h2>Sure ProEd Course Status Update</h2>"
        f"<p>Your application/enrollment for <strong>{course_name}</strong>{cohort_str} has been marked as <strong>Dropped</strong>.</p>"
        f"<p>Any scheduled pre-screening examination for this application has been automatically cancelled.</p>"
        f"<p>You are now eligible to browse and apply for another open course on the platform.</p>"
    )
    return send_transactional_email(subject, message, [user_email], html_message=html_message, category="course_dropped")


def send_csr_notification_email(csr_request):
    """
    Send an email notification for a new CSR Partnership Enquiry.
    """
    subject = "New CSR Partnership Enquiry – SURE ProEd"
    recipient_email = "suretrust2020@gmail.com"
    
    # Check if a custom CSR notification email is configured in environment
    import os
    env_email = os.environ.get("CSR_NOTIFICATION_EMAIL")
    if env_email:
        recipient_email = env_email
        
    message = (
        f"New CSR Partnership Enquiry\n\n"
        f"Name: {csr_request.name}\n"
        f"Designation: {csr_request.designation}\n"
        f"Organization: {csr_request.organization}\n"
        f"Email: {csr_request.email}\n"
        f"Phone: {csr_request.phone or 'Not provided'}\n"
        f"Area of Interest: {csr_request.area_of_interest}\n"
        f"Message: {csr_request.message}\n\n"
        f"Submitted On: {csr_request.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"CSR Request ID: {csr_request.reference_id}\n"
    )
    
    html_message = (
        f"<h2>New CSR Partnership Enquiry</h2>"
        f"<table style='width:100%; border-collapse: collapse;'>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd; width:150px;'><strong>Name:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.name}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Designation:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.designation}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Organization:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.organization}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Email:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.email}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Phone:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.phone or 'Not provided'}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Area of Interest:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.area_of_interest}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Message:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.message}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>Submitted On:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</td></tr>"
        f"<tr><td style='padding:8px; border-bottom:1px solid #ddd;'><strong>CSR Request ID:</strong></td><td style='padding:8px; border-bottom:1px solid #ddd;'>{csr_request.reference_id}</td></tr>"
        f"</table>"
    )
    
    return send_transactional_email(subject, message, [recipient_email], html_message=html_message, category="csr_enquiry")
