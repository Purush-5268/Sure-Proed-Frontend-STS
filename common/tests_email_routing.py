from django.test import TestCase
from unittest.mock import patch, call
from django.contrib.auth import get_user_model
import datetime
from django.utils import timezone

from common.tasks import send_async_session_invitations_task, send_async_guest_invitations_task
from attendance.models import Attendance, PriorPermission
from attendance.tasks import sync_prior_permission_invitation

User = get_user_model()

class EmailRoutingTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="teststudent@example.com", password="password", role="STUDENT")
        self.user2 = User.objects.create_user(email="teststudent2@example.com", password="password", role="STUDENT")
        
        # DOMAIN session
        self.domain_session = Attendance.objects.create(
            title="Domain Session 1",
            class_type="DOMAIN",
            class_date=timezone.now().date(),
            start_time=datetime.time(10, 0),
            meeting_link="https://meet.google.com/abc-defg-hij"
        )
        
        # LST session
        self.lst_session = Attendance.objects.create(
            title="LST Session 1",
            class_type="LST",
            class_date=timezone.now().date(),
            start_time=datetime.time(14, 0),
            meeting_link="https://meet.google.com/xyz-uvwx-yza"
        )

    @patch('common.services.email_service.send_bulk_session_invitations')
    def test_1_domain_generic_task_zero_emails(self, mock_send):
        # Even if someone accidentally queues a generic email for DOMAIN, it should block
        result = send_async_session_invitations_task(
            recipient_emails=["teststudent@example.com"],
            session_title=self.domain_session.title,
            start_time_str="10:00 AM",
            meeting_link=None,
            session_id=str(self.domain_session.id)
        )
        self.assertEqual(result, 0)
        mock_send.assert_not_called()

    @patch('common.tasks.send_async_guest_invitations_task.delay')
    @patch('common.tasks.send_async_session_invitations_task.delay')
    def test_2_domain_prior_permission_calls_guest_task(self, mock_generic_delay, mock_guest_delay):
        # Create student profile (dummy) for prior permission
        from students.models import StudentProfile
        sp, created = StudentProfile.objects.get_or_create(user=self.user)
        
        pp = PriorPermission.objects.create(
            session=self.domain_session,
            student=sp,
            reason="Sick"
        )
        
        sync_prior_permission_invitation(pp.id)
        
        # Should call guest (meet link)
        mock_guest_delay.assert_called_once_with(
            recipient_emails=[self.user.email],
            session_title=self.domain_session.title,
            start_time_str=f"{self.domain_session.class_date} {self.domain_session.start_time}",
            meeting_link=self.domain_session.meeting_link,
            session_id=str(self.domain_session.id)
        )
        # Should NOT call generic
        mock_generic_delay.assert_not_called()

    @patch('common.services.email_service.send_bulk_session_invitations')
    def test_4_lst_generic_task_works(self, mock_send):
        mock_send.return_value = 1
        result = send_async_session_invitations_task(
            recipient_emails=["teststudent@example.com"],
            session_title=self.lst_session.title,
            start_time_str="2:00 PM",
            meeting_link=None,
            session_id=str(self.lst_session.id)
        )
        mock_send.assert_called_once()

    @patch('common.services.email_service.send_bulk_session_invitations')
    def test_5_lst_guest_task_works(self, mock_send):
        mock_send.return_value = 1
        result = send_async_guest_invitations_task(
            recipient_emails=["teststudent@example.com"],
            session_title=self.lst_session.title,
            start_time_str="2:00 PM",
            meeting_link="https://meet.google.com/xyz",
            session_id=str(self.lst_session.id)
        )
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        self.assertIn("Guest Invitation", kwargs.get("subject", ""))

    @patch('common.services.email_service.send_bulk_session_invitations')
    def test_6_delayed_domain_generic_task_blocks(self, mock_send):
        # Same as 1, proves block inside task
        result = send_async_session_invitations_task(
            recipient_emails=["teststudent@example.com"],
            session_title=self.domain_session.title,
            start_time_str="10:00 AM",
            meeting_link=None,
            session_id=str(self.domain_session.id)
        )
        self.assertEqual(result, 0)
        mock_send.assert_not_called()

    @patch('common.services.email_service.send_bulk_session_invitations')
    def test_8_legacy_generic_task_no_session_id(self, mock_send):
        # session_id=None -> should block to prevent unverified sends
        result = send_async_session_invitations_task(
            recipient_emails=["teststudent@example.com"],
            session_title="Unknown Title",
            start_time_str="10:00 AM",
            meeting_link=None,
            session_id=None
        )
        self.assertEqual(result, 0)
        mock_send.assert_not_called()
        
    @patch('common.services.email_service.send_bulk_session_invitations')
    def test_9_multiple_students_guest_link(self, mock_send):
        mock_send.return_value = 2
        result = send_async_guest_invitations_task(
            recipient_emails=["teststudent@example.com", "teststudent2@example.com"],
            session_title=self.domain_session.title,
            start_time_str="10:00 AM",
            meeting_link=self.domain_session.meeting_link,
            session_id=str(self.domain_session.id)
        )
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        self.assertEqual(len(kwargs["recipient_list"]), 2)

    def test_10_prior_permission_lst_uses_generic(self):
        from students.models import StudentProfile
        sp, created = StudentProfile.objects.get_or_create(user=self.user)
        pp = PriorPermission.objects.create(
            session=self.lst_session,
            student=sp,
            reason="Sick"
        )
        with patch('common.tasks.send_async_session_invitations_task.delay') as mock_generic_delay:
            with patch('common.tasks.send_async_guest_invitations_task.delay') as mock_guest_delay:
                sync_prior_permission_invitation(pp.id)
                mock_generic_delay.assert_called_once()
                mock_guest_delay.assert_not_called()
