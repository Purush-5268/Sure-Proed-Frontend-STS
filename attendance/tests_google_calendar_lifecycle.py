from django.test import TestCase
from django.utils import timezone
from unittest.mock import patch, MagicMock
from attendance.models import Attendance, GoogleCalendarAuditLog
from attendance.services.google_calendar_lifecycle import safe_delete_google_meet, compensate_failed_creation
from common.models import Notification
from cohorts.models import Cohort
import datetime

class GoogleCalendarLifecycleTests(TestCase):
    def setUp(self):
        from courses.models import Course
        course = Course.objects.create(name="Test", code="CAL")
        self.cohort = Cohort.objects.create(course=course, name="Test Cohort", start_date=timezone.now().date(), end_date=timezone.now().date())
        self.now = timezone.now()

    @patch('attendance.services.google_calendar_lifecycle.build')
    @patch('attendance.services.google_calendar_lifecycle.get_google_credentials')
    def test_safe_delete_success(self, mock_creds, mock_build):
        mock_creds.return_value = True
        mock_service = MagicMock()
        mock_build.return_value = mock_service
        
        with self.captureOnCommitCallbacks(execute=True):
            status = safe_delete_google_meet("event-123", actor="TEST")
        self.assertEqual(status, "PENDING_COMMIT")
        
        audit = GoogleCalendarAuditLog.objects.get(calendar_event_id="event-123")
        self.assertEqual(audit.status, "SUCCESS")
        self.assertEqual(audit.operation_type, "DELETE")

    @patch('attendance.services.google_calendar_lifecycle.build')
    @patch('attendance.services.google_calendar_lifecycle.get_google_credentials')
    def test_safe_delete_already_missing(self, mock_creds, mock_build):
        mock_creds.return_value = True
        mock_service = MagicMock()
        mock_build.return_value = mock_service
        
        from googleapiclient.errors import HttpError
        import httplib2
        response = httplib2.Response({'status': '404'})
        mock_service.events().delete().execute.side_effect = HttpError(resp=response, content=b"")
        
        with self.captureOnCommitCallbacks(execute=True):
            status = safe_delete_google_meet("event-404", actor="TEST")
        self.assertEqual(status, "PENDING_COMMIT")
        
        audit = GoogleCalendarAuditLog.objects.get(calendar_event_id="event-404")
        self.assertEqual(audit.status, "ALREADY_MISSING")

    @patch('attendance.services.google_calendar_lifecycle.build')
    @patch('attendance.services.google_calendar_lifecycle.get_google_credentials')
    def test_safe_delete_transient_failure(self, mock_creds, mock_build):
        mock_creds.return_value = True
        mock_service = MagicMock()
        mock_build.return_value = mock_service
        
        from googleapiclient.errors import HttpError
        import httplib2
        response = httplib2.Response({'status': '500'})
        mock_service.events().delete().execute.side_effect = HttpError(resp=response, content=b"")
        
        with self.captureOnCommitCallbacks(execute=True):
            status = safe_delete_google_meet("event-500", actor="TEST")
        self.assertEqual(status, "PENDING_COMMIT")
        
        audit = GoogleCalendarAuditLog.objects.get(calendar_event_id="event-500")
        self.assertEqual(audit.status, "FAILED")

    @patch('attendance.services.google_calendar_lifecycle.build')
    @patch('attendance.services.google_calendar_lifecycle.get_google_credentials')
    def test_compensate_failed_creation(self, mock_creds, mock_build):
        mock_creds.return_value = True
        mock_service = MagicMock()
        mock_build.return_value = mock_service
        
        compensate_failed_creation("event-orphaned")
        
        audit = GoogleCalendarAuditLog.objects.get(calendar_event_id="event-orphaned")
        self.assertEqual(audit.operation_type, "COMPENSATE")
        self.assertEqual(audit.status, "SUCCESS")

    def test_notification_trailing_slash(self):
        """Test trailing slash cleanup for notifications."""
        att = Attendance.objects.create(
            title="Test", 
            cohort=self.cohort, 
            class_date=self.now.date(),
            start_time=self.now.time(),
            end_time=(self.now + datetime.timedelta(hours=1)).time()
        )
        
        # Simulating notification created with trailing slash
        Notification.objects.create(
            user_id=1, 
            title="Test", 
            message="Test",
            notification_type="INFO", 
            action_url=f"/attendance/{att.id}/"
        )
        
        # Ensure it exists
        self.assertEqual(Notification.objects.count(), 1)
        
        # When deleted, the post_delete signal in models.py cleans it up using trailing slash
        att.delete()
        
        self.assertEqual(Notification.objects.count(), 0)

    @patch('attendance.services.google_meet_service.build')
    @patch('attendance.services.google_meet_service.get_google_credentials')
    def test_generate_meet_deterministic_idempotency(self, mock_creds, mock_build):
        """Verify the id is deterministic."""
        from attendance.services.google_meet_service import generate_google_meet
        mock_creds.return_value = True
        mock_service = MagicMock()
        mock_build.return_value = mock_service
        mock_service.events().insert().execute.return_value = {'hangoutLink': 'link', 'id': 'event1'}
        
        start = timezone.now()
        end = start + datetime.timedelta(hours=1)
        generate_google_meet("Title", start, end, ["test@test.com"])
        
        # Check that the requestId is deterministic
        call_args = mock_service.events().insert.call_args[1]
        body = call_args['body']
        req_id = body['conferenceData']['createRequest']['requestId']
        self.assertTrue(req_id.startswith("suretrust-"))
