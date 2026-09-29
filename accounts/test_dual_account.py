from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import User


class DualAccountSwitchTests(APITestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            email="student@gmail.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            is_active=True,
            is_email_verified=True,
        )
        self.volunteer = User.objects.create_user(
            email="volunteer@sureproed.org",
            mapped_email="student@gmail.com",
            password="StrongPassword123!",
            role=User.Role.VOLUNTEER,
            is_active=True,
            is_email_verified=True,
        )
        self.unrelated_student = User.objects.create_user(
            email="unrelated@gmail.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            is_active=True,
            is_email_verified=True,
        )
        self.inactive_volunteer = User.objects.create_user(
            email="inactive@sureproed.org",
            mapped_email="unrelated@gmail.com",
            password="StrongPassword123!",
            role=User.Role.VOLUNTEER,
            is_active=False,
            is_email_verified=True,
        )

        self.switch_url = reverse("switch_account")
        self.login_url = reverse("token_obtain_pair")

    def get_token_for(self, user):
        response = self.client.post(
            self.login_url,
            {
                "email": user.email,
                "password": "StrongPassword123!",
                "role": user.role,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["access"]

    def test_student_to_linked_volunteer_succeeds(self):
        token = self.get_token_for(self.student)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.post(self.switch_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["role"], User.Role.VOLUNTEER)
        self.assertEqual(response.data["user"]["email"], self.volunteer.email)

    def test_volunteer_to_linked_student_succeeds(self):
        token = self.get_token_for(self.volunteer)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.post(self.switch_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["role"], User.Role.STUDENT)
        self.assertEqual(response.data["user"]["email"], self.student.email)

    def test_student_without_linked_volunteer_denied(self):
        unlinked = User.objects.create_user(email="unlinked@gmail.com", password="StrongPassword123!", role=User.Role.STUDENT)
        token = self.get_token_for(unlinked)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.post(self.switch_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_linked_volunteer_denied(self):
        token = self.get_token_for(self.unrelated_student)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.post(self.switch_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_me_endpoint_returns_dual_access_flag(self):
        token = self.get_token_for(self.student)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(reverse("user-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("has_dual_access"))
        self.assertEqual(response.data.get("linked_account_role"), User.Role.VOLUNTEER)

    def test_unlinked_user_me_endpoint_flag(self):
        unlinked = User.objects.create_user(email="unlinked2@gmail.com", password="StrongPassword123!", role=User.Role.STUDENT)
        token = self.get_token_for(unlinked)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(reverse("user-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data.get("has_dual_access"))
        self.assertIsNone(response.data.get("linked_account_role"))

    def test_invalid_jwt_denied(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalidtoken")
        response = self.client.post(self.switch_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
