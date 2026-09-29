import logging
from django.conf import settings
from django.core.management.base import BaseCommand
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send a test email via configured ZeptoMail SMTP backend to verify email delivery."

    def add_arguments(self, parser):
        parser.add_argument(
            "recipient_email",
            type=str,
            help="Recipient email address to send the test message to.",
        )
        parser.add_argument(
            "--subject",
            type=str,
            default="Sure ProEd - ZeptoMail SMTP Verification",
            help="Optional custom subject.",
        )

    def handle(self, *args, **options):
        recipient = options["recipient_email"]
        subject = options["subject"]

        self.stdout.write(self.style.NOTICE(f"--- ZeptoMail SMTP Diagnostic ---"))
        self.stdout.write(f"EMAIL_BACKEND: {settings.EMAIL_BACKEND}")
        self.stdout.write(f"EMAIL_HOST: {settings.EMAIL_HOST}")
        self.stdout.write(f"EMAIL_PORT: {settings.EMAIL_PORT}")
        self.stdout.write(f"EMAIL_USE_TLS: {getattr(settings, 'EMAIL_USE_TLS', False)}")
        self.stdout.write(f"EMAIL_USE_SSL: {getattr(settings, 'EMAIL_USE_SSL', False)}")
        self.stdout.write(f"EMAIL_HOST_USER: {settings.EMAIL_HOST_USER}")
        self.stdout.write(f"DEFAULT_FROM_EMAIL: {settings.DEFAULT_FROM_EMAIL}")
        has_password = bool(getattr(settings, 'EMAIL_HOST_PASSWORD', None))
        self.stdout.write(f"EMAIL_HOST_PASSWORD configured: {has_password}")
        self.stdout.write(f"Sending test email to: {recipient}...")

        message = (
            "Congratulations! Your ZeptoMail SMTP configuration is active and working properly.\n\n"
            "This is an automated test message sent from Sure ProEd backend."
        )
        html_message = (
            "<h2>Sure ProEd - ZeptoMail Verification</h2>"
            "<p style='color: #10b981; font-weight: bold;'>ZeptoMail SMTP is successfully configured and working!</p>"
            "<p>This email confirms that transactional emails are ready to send.</p>"
        )

        try:
            sent_count = send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                html_message=html_message,
                fail_silently=False,
            )
            if sent_count > 0:
                self.stdout.write(
                    self.style.SUCCESS(f"[SUCCESS] Test email successfully sent to {recipient}!")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"[WARNING] send_mail returned 0 sent messages.")
                )
        except Exception as exc:
            self.stdout.write(
                self.style.ERROR(f"[ERROR] Failed to send test email: {exc}")
            )
