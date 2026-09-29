from django.test import TestCase, override_settings
from unittest.mock import patch, MagicMock
from common.services.email_delivery_service import EmailDeliveryService
from common.models import EmailDeliveryLog
import uuid


class TestEmailDeliveryService(TestCase):

    @patch('django.core.mail.EmailMultiAlternatives.send')
    def test_zeptomail_success(self, mock_send):
        # 1. ZeptoMail success -> only ZeptoMail used
        res = EmailDeliveryService.send_transactional_email(
            category="general",
            subject="Test",
            message="Test Msg",
            recipient="student@example.com"
        )
        self.assertTrue(res)
        mock_send.assert_called_once()
        
        log = EmailDeliveryLog.objects.first()
        self.assertEqual(log.status, EmailDeliveryLog.Status.SUCCESS)
        self.assertEqual(log.provider_attempted, EmailDeliveryLog.Provider.ZEPTOMAIL)

    @override_settings(EMAIL_FALLBACK_ENABLED=True)
    @patch('django.core.mail.backends.smtp.EmailBackend.send_messages')
    @patch('django.core.mail.EmailMultiAlternatives.send')
    def test_zeptomail_authentication_failure_fallback(self, mock_primary_send, mock_fallback_send):
        # 3. ZeptoMail authentication failure -> fallback considered.
        mock_primary_send.side_effect = Exception("535 Authentication Failed")
        
        res = EmailDeliveryService.send_transactional_email(
            category="general",
            subject="Test",
            message="Test Msg",
            recipient="student@example.com"
        )
        self.assertTrue(res)
        mock_primary_send.assert_called_once()
        mock_fallback_send.assert_called_once()
        
        log = EmailDeliveryLog.objects.first()
        self.assertEqual(log.status, EmailDeliveryLog.Status.SUCCESS)
        self.assertEqual(log.provider_attempted, EmailDeliveryLog.Provider.GOOGLE_WORKSPACE)
        self.assertEqual(log.failure_category, "auth_error")

    @override_settings(EMAIL_FALLBACK_ENABLED=True)
    @patch('django.core.mail.backends.smtp.EmailBackend.send_messages')
    @patch('django.core.mail.EmailMultiAlternatives.send')
    def test_zeptomail_timeout_fallback(self, mock_primary_send, mock_fallback_send):
        # 2. ZeptoMail timeout -> fallback considered.
        mock_primary_send.side_effect = Exception("Connection timeout")
        
        res = EmailDeliveryService.send_transactional_email(
            category="general",
            subject="Test",
            message="Test Msg",
            recipient="student@example.com"
        )
        self.assertTrue(res)
        mock_primary_send.assert_called_once()
        mock_fallback_send.assert_called_once()
        
        log = EmailDeliveryLog.objects.first()
        self.assertEqual(log.failure_category, "timeout")
        self.assertEqual(log.provider_attempted, EmailDeliveryLog.Provider.GOOGLE_WORKSPACE)

    @override_settings(EMAIL_FALLBACK_ENABLED=True)
    @patch('django.core.mail.backends.smtp.EmailBackend.send_messages')
    @patch('django.core.mail.EmailMultiAlternatives.send')
    def test_invalid_recipient_no_fallback(self, mock_primary_send, mock_fallback_send):
        # 4. Invalid recipient -> no Google fallback
        # Let's say it's just an unknown error (e.g. ValueError or smtplib.SMTPRecipientsRefused)
        mock_primary_send.side_effect = ValueError("Invalid email format")
        
        res = EmailDeliveryService.send_transactional_email(
            category="general",
            subject="Test",
            message="Test Msg",
            recipient="bademail"
        )
        self.assertFalse(res)
        mock_primary_send.assert_called_once()
        mock_fallback_send.assert_not_called()
        
        log = EmailDeliveryLog.objects.first()
        self.assertEqual(log.status, EmailDeliveryLog.Status.FAILED)
        self.assertEqual(log.provider_attempted, EmailDeliveryLog.Provider.ZEPTOMAIL)
        self.assertEqual(log.failure_category, "unknown_or_recipient_error")

    @override_settings(EMAIL_FALLBACK_ENABLED=True)
    @patch('django.core.mail.backends.smtp.EmailBackend.send_messages')
    @patch('django.core.mail.EmailMultiAlternatives.send')
    def test_both_providers_fail(self, mock_primary_send, mock_fallback_send):
        # 7. Both providers fail -> final failure recorded
        mock_primary_send.side_effect = Exception("535 Authentication Failed")
        mock_fallback_send.side_effect = Exception("Google SMTP Error")

        res = EmailDeliveryService.send_transactional_email(
            category="general",
            subject="Test",
            message="Test Msg",
            recipient="student@example.com"
        )
        self.assertFalse(res)
        
        log = EmailDeliveryLog.objects.first()
        self.assertEqual(log.status, EmailDeliveryLog.Status.FAILED)
        self.assertEqual(log.provider_attempted, EmailDeliveryLog.Provider.GOOGLE_WORKSPACE)
        self.assertIn("Google SMTP Error", log.error_message)

    @patch('django.core.mail.EmailMultiAlternatives.send')
    def test_duplicate_request(self, mock_send):
        # 8. Duplicate request -> no duplicate transactional email.
        idem_key = "otp:123"
        
        # First send
        res1 = EmailDeliveryService.send_transactional_email(
            category="otp", subject="Test", message="Msg", recipient="a@a.com", idempotency_key=idem_key
        )
        self.assertTrue(res1)
        self.assertEqual(mock_send.call_count, 1)
        
        # Second send with same key
        res2 = EmailDeliveryService.send_transactional_email(
            category="otp", subject="Test", message="Msg", recipient="a@a.com", idempotency_key=idem_key
        )
        self.assertTrue(res2)
        # Should NOT have sent another email
        self.assertEqual(mock_send.call_count, 1)

    @override_settings(
        EMAIL_AUDIT_BCC_ENABLED=True, 
        ADMIN_BCC_LIST=["admin@domain.com"],
        EMAIL_BCC_POLICY={"otp": False, "critical": True}
    )
    @patch('django.core.mail.EmailMultiAlternatives')
    def test_bcc_policy(self, mock_email_class):
        mock_instance = mock_email_class.return_value
        
        # 12. BCC policy disabled for category -> no BCC
        EmailDeliveryService.send_transactional_email(
            category="otp", subject="Test", message="Msg", recipient="a@a.com"
        )
        # Check that bcc was empty
        mock_email_class.assert_called_with(
            subject='Test', body='Msg', from_email=mock_email_class.call_args[1].get('from_email'), 
            to=['a@a.com'], bcc=[]
        )
        
        # 13. BCC policy enabled for category -> configured audit recipient receives BCC
        EmailDeliveryService.send_transactional_email(
            category="critical", subject="Test", message="Msg", recipient="b@b.com"
        )
        mock_email_class.assert_called_with(
            subject='Test', body='Msg', from_email=mock_email_class.call_args[1].get('from_email'), 
            to=['b@b.com'], bcc=["admin@domain.com"]
        )
