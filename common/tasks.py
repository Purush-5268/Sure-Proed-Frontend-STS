import logging

from celery import shared_task

from .services import email_service

logger = logging.getLogger(__name__)


@shared_task
def send_async_email_verification(user_email, token):
    logger.info(f"Task: Sending email verification to {user_email}")
    return email_service.send_email_verification(user_email, token)

@shared_task
def notify_google_meet_cohosts_task(success_emails, session_title=None):
    import logging
    logger = logging.getLogger(__name__)
    
    if not success_emails:
        return
        
    from accounts.models import User
    from common.models import Notification
    from common.tasks import send_web_push_bulk_task
    
    users = User.objects.filter(email__in=success_emails, is_active=True)
    title = session_title if session_title else "your upcoming session"
    notifications = []
    for user in users:
        notifications.append(
            Notification(
                user=user,
                title="Co-Host Assignment",
                message=f"You have been assigned as a Co-Host for {title}. You have full moderation controls for this session.",
                type="INFO",
                action_url="/dashboard/"
            )
        )
        
    if notifications:
        created = Notification.objects.bulk_create(notifications)
        notification_ids = [n.id for n in created]
        send_web_push_bulk_task.delay(notification_ids)
        logger.info(f"Created notifications for {len(notifications)} co-hosts.")


@shared_task
def refresh_platform_statistics():
    """
    Periodic task to recalculate authoritative platform statistics
    and refresh the Redis cache without blocking user requests.
    """
    logger.info("Task: Refreshing platform statistics snapshot...")
    try:
        from .views import calculate_platform_stats
        from django.core.cache import cache
        
        data = calculate_platform_stats()
        
        # Overwrite cache with a 24-hour TTL (refreshed hourly)
        cache_key = 'platform:analytics:stats'
        cache.set(cache_key, data, timeout=86400)
        
        logger.info("Task: Platform statistics snapshot updated successfully.")
        return True
    except Exception as e:
        logger.error(f"Task: Failed to refresh platform statistics: {str(e)}", exc_info=True)
        return False


@shared_task
def send_async_password_reset_email(user_email, reset_link):
    logger.info(f"Task: Sending password reset to {user_email}")
    return email_service.send_password_reset_email(user_email, reset_link)


@shared_task
def send_async_password_reset_otp(user_email, otp):
    logger.info(f"Task: Sending password reset OTP to {user_email}")
    return email_service.send_password_reset_otp(user_email, otp)


@shared_task
def send_async_email_verification_otp(user_email, otp):
    logger.info(f"Task: Sending email verification OTP to {user_email}")
    return email_service.send_email_verification_otp(user_email, otp)



@shared_task
def send_async_application_confirmation(user_email, course_name, application_number):
    logger.info(f"Task: Sending application confirmation for {application_number} to {user_email}")
    return email_service.send_application_confirmation_email(user_email, course_name, application_number)


@shared_task
def send_async_exam_notification(user_email, exam_title, duration_minutes):
    logger.info(f"Task: Sending exam notification to {user_email}")
    return email_service.send_exam_notification_email(user_email, exam_title, duration_minutes)


@shared_task
def send_async_cohort_assignment(user_email, cohort_name, course_name):
    logger.info(f"Task: Sending cohort assignment notification to {user_email}")
    return email_service.send_cohort_assignment_email(user_email, cohort_name, course_name)


@shared_task
def send_async_assignment_reminder(user_email, assignment_title, deadline):
    logger.info(f"Task: Sending assignment reminder to {user_email}")
    return email_service.send_assignment_reminder_email(user_email, assignment_title, deadline)


@shared_task
def send_async_certificate_notification(user_email, certificate_number, download_url):
    logger.info(f"Task: Sending certificate notification to {user_email}")
    return email_service.send_certificate_notification_email(user_email, certificate_number, download_url)


@shared_task
def send_async_session_invitations_task(recipient_emails, session_title, start_time_str, meeting_link, session_id=None):
    """
    Sends bulk class invitations via ZeptoMail using BCC chunking.
    Used for LST, UNIVERSAL, and SOFTSKILLS sessions.
    """
    if not recipient_emails:
        return 0
        
    if session_id:
        from attendance.models import Attendance
        session = Attendance.objects.filter(id=session_id).first()
        if session:
            if session.class_type == "DOMAIN":
                logger.warning(f"Task: Blocking generic scheduled email for DOMAIN session {session_id} to avoid unauthorized notifications.")
                return 0
            session_title = session.title
    else:
        logger.warning(f"Task: Blocking legacy generic scheduled email because session_id is missing (session_title: '{session_title}').")
        return 0

    logger.info(f"Task: Sending ZeptoMail invitations to {len(recipient_emails)} students for '{session_title}'")
    
    subject = f"Sure ProEd - Class Scheduled: {session_title}"
    
    # Text fallback
    message = (
        f"Hello,\n\n"
        f"A new session '{session_title}' has been scheduled.\n"
        f"Date & Time: {start_time_str}\n\n"
        f"Important Instructions:\n"
        f"- Please join the session via your Student Dashboard.\n"
        f"- You must join before the scheduled time with your camera turned on.\n"
        f"- Late comers will not be allowed or entertained.\n"
        f"- Your attendance and active duration are strictly tracked.\n\n"
        f"Best regards,\nSure ProEd Team"
    )
    
    # HTML version
    html_message = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.5;">
        <h2>Class Scheduled</h2>
        <p>A new session has been scheduled for you.</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Topic:</strong> {session_title}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> {start_time_str}</p>
        </div>
        <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-left: 4px solid #ffeeba; margin-bottom: 20px;">
            <h4 style="margin-top: 0; margin-bottom: 10px;">Important Instructions:</h4>
            <ul style="margin-bottom: 0; padding-left: 20px;">
                <li>Please join the session directly through your <strong>Student Dashboard</strong>.</li>
                <li>You <strong>must join before the scheduled time</strong> with your camera turned on.</li>
                <li><strong>Late comers will not be entertained.</strong></li>
                <li>Your attendance and active duration in the meeting are strictly tracked.</li>
            </ul>
        </div>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">
            This is an automated notification from Sure ProEd.
        </p>
    </div>
    """
    
    return email_service.send_bulk_session_invitations(
        subject=subject,
        message=message,
        recipient_list=recipient_emails,
        html_message=html_message
    )


@shared_task
def send_async_guest_invitations_task(recipient_emails, session_title, start_time_str, meeting_link, session_id=None):
    """
    Sends bulk class invitations via ZeptoMail using BCC chunking specifically for guests.
    Includes the direct Google Meet link.
    """
    if not recipient_emails:
        return 0
        
    if session_id:
        from attendance.models import Attendance
        session = Attendance.objects.filter(id=session_id).first()
        if session:
            session_title = session.title
            
    logger.info(f"Task: Sending guest ZeptoMail invitations to {len(recipient_emails)} guests for '{session_title}'")
    
    subject = f"Sure ProEd - Guest Invitation: {session_title}"
    
    # Text fallback
    message = (
        f"Hello,\n\n"
        f"You have been invited as a guest to the session '{session_title}'.\n"
        f"Date & Time: {start_time_str}\n\n"
        f"Please join using the following link:\n{meeting_link}\n\n"
        f"Best regards,\nSure ProEd Team"
    )
    
    # HTML version
    html_message = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.5;">
        <h2>Guest Invitation</h2>
        <p>You have been invited as a guest to a session.</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Topic:</strong> {session_title}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> {start_time_str}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{meeting_link}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Join Meeting</a>
        </div>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">
            This is an automated notification from Sure ProEd.
        </p>
    </div>
    """
    
    return email_service.send_bulk_session_invitations(
        subject=subject,
        message=message,
        recipient_list=recipient_emails,
        html_message=html_message
    )


@shared_task
def process_resume_and_photo_verification(student_profile_id):
    logger.info(f"Task: Processing resume and photo verification for profile {student_profile_id}")
    from students.models import StudentProfile
    from students.services.verification_service import process_profile_verification

    try:
        profile = StudentProfile.objects.get(id=student_profile_id)
        process_profile_verification(profile)
    except StudentProfile.DoesNotExist:
        logger.warning(f"StudentProfile {student_profile_id} not found for verification.")


import json
from django.conf import settings
try:
    from pywebpush import webpush, WebPushException
except ImportError:
    webpush = None
    WebPushException = Exception

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_web_push_task(self, notification_id):
    # Check VAPID settings early to avoid unnecessary DB queries
    private_key = getattr(settings, 'WEB_PUSH_VAPID_PRIVATE_KEY', None)
    claims_email = getattr(settings, 'WEB_PUSH_VAPID_CLAIMS_EMAIL', None)
    if not private_key or not claims_email:
        return

    from common.models import Notification, PushSubscription
    try:
        notif = Notification.objects.get(id=notification_id, user__is_active=True)
    except Notification.DoesNotExist:
        logger.warning(f"Notification {notification_id} not found for Web Push.")
        return

    # Don't send if no active subscriptions
    subscriptions = PushSubscription.objects.filter(user=notif.user, is_active=True)
    if not subscriptions.exists():
        return

    payload = json.dumps({
        "notification_id": str(notif.id),
        "title": getattr(notif, 'title', 'SURE ProEd Notification'),
        "message": notif.message,
        "action_url": "/"
    })

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth
                    }
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": f"mailto:{claims_email}"}
            )
            # Update last_used_at safely
            from django.utils import timezone
            sub.last_used_at = timezone.now()
            sub.save(update_fields=['last_used_at'])
            
        except WebPushException as ex:
            if ex.response and ex.response.status_code in [404, 410]:
                logger.info(f"Subscription {sub.id} is dead. Deactivating.")
                sub.is_active = False
                sub.save(update_fields=['is_active'])
            else:
                logger.error("Web Push delivery failed")
        except Exception as e:
            logger.error("Web Push delivery failed")

@shared_task
def send_web_push_bulk_task(notification_ids):
    """
    Coordinates bulk push delivery.
    """
    if not notification_ids:
        return
        
    chunk_size = 50
    for i in range(0, len(notification_ids), chunk_size):
        chunk = notification_ids[i:i + chunk_size]
        process_web_push_chunk.delay(chunk)

@shared_task
def process_web_push_chunk(notification_ids):
    private_key = getattr(settings, 'WEB_PUSH_VAPID_PRIVATE_KEY', None)
    claims_email = getattr(settings, 'WEB_PUSH_VAPID_CLAIMS_EMAIL', None)
    if not private_key or not claims_email:
        return

    from common.models import Notification, PushSubscription
    notifications = Notification.objects.filter(id__in=notification_ids).select_related('user')

    user_ids = [n.user_id for n in notifications]
    subs = PushSubscription.objects.filter(user_id__in=user_ids, is_active=True)
    
    subs_by_user = {}
    for s in subs:
        subs_by_user.setdefault(s.user_id, []).append(s)

    dead_subs = []
    active_subs = []
    
    from django.utils import timezone
    now = timezone.now()

    for notif in notifications:
        user_subs = subs_by_user.get(notif.user_id, [])
        if not user_subs:
            continue
            
        payload = json.dumps({
            "notification_id": str(notif.id),
            "title": getattr(notif, 'title', 'SURE ProEd Notification'),
            "message": notif.message,
            "action_url": "/"
        })
        
        for sub in user_subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth}
                    },
                    data=payload,
                    vapid_private_key=private_key,
                    vapid_claims={"sub": f"mailto:{claims_email}"}
                )
                sub.last_used_at = now
                active_subs.append(sub)
            except WebPushException as ex:
                if ex.response and ex.response.status_code in [404, 410]:
                    dead_subs.append(sub)
                else:
                    logger.error(f"WebPush error: {ex}")
            except Exception as e:
                logger.error(f"Unexpected WebPush error: {e}")

    if dead_subs:
        PushSubscription.objects.filter(id__in=[s.id for s in dead_subs]).update(is_active=False)
        
    if active_subs:
        PushSubscription.objects.filter(id__in=[s.id for s in active_subs]).update(last_used_at=now)


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def send_csr_notification_email_task(self, request_id):
    """
    Background task to send the CSR partnership enquiry email.
    """
    logger.info(f"Task: Sending CSR notification for request {request_id}")
    
    from communications.models import CSRPartnershipRequest
    try:
        csr_request = CSRPartnershipRequest.objects.get(id=request_id)
        email_service.send_csr_notification_email(csr_request)
    except CSRPartnershipRequest.DoesNotExist:
        logger.warning(f"CSR Request {request_id} not found, skipping email notification.")
    except Exception as exc:
        logger.error(f"Error sending CSR email for {request_id}: {exc}")
        raise self.retry(exc=exc)


from common.services.mobile_push import send_mobile_push  # noqa: F401
