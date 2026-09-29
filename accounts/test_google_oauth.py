from unittest.mock import patch, MagicMock
from django.urls import reverse
from rest_framework import status
from django.utils import timezone
from students.models import GoogleStudentIdentity, StudentProfile
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()

class TestGoogleOAuthAndAttendanceResolution(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='test@example.com', password='password')
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_google_connect_url_generation(self):
        url = reverse('google_connect_url')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("authorization_url", response.data)

    @patch('accounts.views.GoogleOAuthService')
    def test_google_oauth_callback_strict_email(self, mock_service):
        from django.core.cache import cache
        # Mock Google OAuth Service
        mock_service.exchange_code_for_token.return_value = {"access_token": "fake_token"}
        mock_service.fetch_user_profile.return_value = {
            "email": "different.email@gmail.com",
            "name": "Different Name",
            "sub": "12345"
        }
        
        state = "test_state_123"
        cache.set(f"google_oauth_state:{state}", {"user_id": str(self.user.id), "client_type": "web"}, timeout=600)
        
        url = reverse('google_callback')
        response = self.client.get(url, {"state": state, "code": "fake_code"})
        
        self.assertEqual(response.status_code, 302)
        self.assertIn("error", response.url)
        self.assertIn("must+exactly+match", response.url)

    @patch('accounts.views.GoogleOAuthService')
    def test_google_oauth_callback_success(self, mock_service):
        from django.core.cache import cache
        mock_service.exchange_code_for_token.return_value = {"access_token": "fake_token"}
        mock_service.fetch_user_profile.return_value = {
            "email": self.user.email,
            "name": "Test User From Google",
            "sub": "12345"
        }
        
        state = "test_state_456"
        cache.set(f"google_oauth_state:{state}", {"user_id": str(self.user.id), "client_type": "web"}, timeout=600)
        
        url = reverse('google_callback')
        response = self.client.get(url, {"state": state, "code": "fake_code"})
        
        self.assertEqual(response.status_code, 302)
        self.assertIn("success", response.url)
        
        identity = GoogleStudentIdentity.objects.get(student=self.student_profile)
        self.assertEqual(identity.google_email, self.user.email)
        self.assertEqual(identity.google_profile_name, "Test User From Google")
        self.assertTrue(identity.is_verified)
