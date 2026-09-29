import datetime
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from students.models import StudentProfile
from attendance.models import Attendance, AbsenceWarning, PermissionRequestMessage

User = get_user_model()

class LateJoinPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create Student User
        self.student_user = User.objects.create_user(
            email="student@test.com", 
            password="password123",
            role="STUDENT"
        )
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.student_user)
        
        # Create Another Student (Unauthorized)
        self.other_user = User.objects.create_user(
            email="other@test.com", 
            password="password123",
            role="STUDENT"
        )
        self.other_profile, _ = StudentProfile.objects.get_or_create(user=self.other_user)
        
        # Create Active Session (Started 1 hour ago, ends in 1 hour)
        now = timezone.localtime(timezone.now())
        start = (now - datetime.timedelta(hours=1)).time()
        end = (now + datetime.timedelta(hours=1)).time()
        
        self.session_active = Attendance.objects.create(
            title="Active Class",
            class_date=(now - datetime.timedelta(hours=1)).date(),
            start_time=start,
            end_time=end,
            class_status='ONGOING',
            conducted_by=self.student_user
        )
        self.session_active.attendees.add(self.student_profile)
        
        # Create Expired Session (Ended 1 hour ago)
        start_exp = (now - datetime.timedelta(hours=3)).time()
        end_exp = (now - datetime.timedelta(hours=1)).time()
        
        self.session_expired = Attendance.objects.create(
            title="Expired Class",
            class_date=(now - datetime.timedelta(hours=3)).date(),
            start_time=start_exp,
            end_time=end_exp,
            class_status='COMPLETED',
            conducted_by=self.student_user
        )
        self.session_expired.attendees.add(self.student_profile)
        
        # Create Future Session (Starts in 1 hour)
        start_fut = (now + datetime.timedelta(hours=1)).time()
        end_fut = (now + datetime.timedelta(hours=3)).time()
        
        self.session_future = Attendance.objects.create(
            title="Future Class",
            class_date=(now + datetime.timedelta(hours=1)).date(),
            start_time=start_fut,
            end_time=end_fut,
            class_status='SCHEDULED',
            conducted_by=self.student_user
        )
        self.session_future.attendees.add(self.student_profile)
        
        self.url = '/api/attendance/request-permission/'

    def test_request_permission_active_session_success(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.url, {
            "session_id": self.session_active.id,
            "reason": "Traffic jam"
        })
        self.assertEqual(response.status_code, 200)
        
        # Verify Warning is created and APOLOGIZED
        warning = AbsenceWarning.objects.get(session=self.session_active, student=self.student_profile)
        self.assertEqual(warning.status, 'APOLOGIZED')
        self.assertEqual(warning.apology_text, "Traffic jam")
        
        # Verify Message is created
        msg = PermissionRequestMessage.objects.get(warning=warning)
        self.assertEqual(msg.message, "Traffic jam")

    def test_request_permission_unauthorized_student(self):
        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(self.url, {
            "session_id": self.session_active.id,
            "reason": "Traffic jam"
        })
        self.assertEqual(response.status_code, 403)
        self.assertIn("You are not an expected student", response.data['detail'])

    def test_request_permission_expired_session(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.url, {
            "session_id": self.session_expired.id,
            "reason": "Forgot to join"
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("Session has ended", response.data['detail'])

    def test_request_permission_future_session(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.url, {
            "session_id": self.session_future.id,
            "reason": "Will be late"
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("Session has not started yet", response.data['detail'])

    def test_duplicate_request(self):
        self.client.force_authenticate(user=self.student_user)
        # First request
        self.client.post(self.url, {
            "session_id": self.session_active.id,
            "reason": "Traffic"
        })
        # Second request
        response = self.client.post(self.url, {
            "session_id": self.session_active.id,
            "reason": "Traffic still"
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("already submitted", response.data['detail'])
