import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.mail.backends.smtp import EmailBackend
from common.models import EmailDeliveryLog
import uuid
from django.utils import timezone

logger = logging.getLogger(__name__)

class EmailDeliveryService:
    @classmethod
    def send_transactional_email(cls, category: str, subject: str, message: str, recipient: str, html_message: str = None, idempotency_key: str = None):
        """
        Sends an individual transactional email through the central failover architecture.
        Includes idempotency checks, BCC auditing, and provider failover.
        """
        if not idempotency_key:
            idempotency_key = f"{category}:{uuid.uuid4()}"

        # 1. Idempotency Check
        log_entry, created = EmailDeliveryLog.objects.get_or_create(
            idempotency_key=idempotency_key,
            defaults={
                'email_category': category,
                'recipient': recipient,
                'status': EmailDeliveryLog.Status.PENDING,
            }
        )

        if not created and log_entry.status == EmailDeliveryLog.Status.SUCCESS:
            logger.warning(f"Duplicate email delivery prevented for {idempotency_key}")
            return True

        bcc_list = []
        if settings.EMAIL_AUDIT_BCC_ENABLED and settings.EMAIL_BCC_POLICY.get(category, False):
            bcc_list = settings.ADMIN_BCC_LIST

        msg = EmailMultiAlternatives(
            subject=subject,
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient],
            bcc=bcc_list
        )
        if html_message:
            msg.attach_alternative(html_message, "text/html")

        # 2. Try Primary Provider (ZeptoMail)
        log_entry.provider_attempted = EmailDeliveryLog.Provider.ZEPTOMAIL
        log_entry.attempt_count += 1
        log_entry.last_attempt_at = timezone.now()
        log_entry.save(update_fields=['provider_attempted', 'attempt_count', 'last_attempt_at'])

        try:
            msg.send(fail_silently=False)
            log_entry.status = EmailDeliveryLog.Status.SUCCESS
            log_entry.save(update_fields=['status'])
            logger.info(f"[{idempotency_key}] Sent successfully via ZeptoMail.")
            return True
        except Exception as primary_exc:
            error_str = str(primary_exc)
            logger.error(f"[{idempotency_key}] Primary provider failed: {error_str}")
            
            # 3. Classify Failure
            is_provider_failure = False
            if '535' in error_str or 'Authentication Failed' in error_str:
                is_provider_failure = True
                log_entry.failure_category = "auth_error"
            elif 'timeout' in error_str.lower():
                is_provider_failure = True
                log_entry.failure_category = "timeout"
            elif 'connection' in error_str.lower():
                is_provider_failure = True
                log_entry.failure_category = "network_error"
            else:
                log_entry.failure_category = "unknown_or_recipient_error"

            log_entry.error_message = error_str
            log_entry.save(update_fields=['failure_category', 'error_message'])

            # 4. Fallback Provider (Google Workspace)
            if settings.EMAIL_FALLBACK_ENABLED and is_provider_failure:
                logger.info(f"[{idempotency_key}] Attempting Google Workspace fallback.")
                log_entry.provider_attempted = EmailDeliveryLog.Provider.GOOGLE_WORKSPACE
                log_entry.attempt_count += 1
                log_entry.last_attempt_at = timezone.now()
                log_entry.save(update_fields=['provider_attempted', 'attempt_count', 'last_attempt_at'])

                try:
                    fallback_backend = EmailBackend(
                        host=settings.FALLBACK_EMAIL_HOST,
                        port=settings.FALLBACK_EMAIL_PORT,
                        username=settings.FALLBACK_EMAIL_HOST_USER,
                        password=settings.FALLBACK_EMAIL_HOST_PASSWORD,
                        use_tls=settings.FALLBACK_EMAIL_USE_TLS,
                    )
                    msg.connection = fallback_backend
                    msg.send(fail_silently=False)
                    log_entry.status = EmailDeliveryLog.Status.SUCCESS
                    log_entry.save(update_fields=['status'])
                    logger.info(f"[{idempotency_key}] Sent successfully via Google Fallback.")
                    return True
                except Exception as fallback_exc:
                    log_entry.status = EmailDeliveryLog.Status.FAILED
                    log_entry.error_message = f"Fallback error: {fallback_exc}"
                    log_entry.save(update_fields=['status', 'error_message'])
                    logger.error(f"[{idempotency_key}] Fallback provider also failed: {fallback_exc}")
                    return False
            else:
                log_entry.status = EmailDeliveryLog.Status.FAILED
                log_entry.save(update_fields=['status'])
                return False
