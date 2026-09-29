from django.test import TestCase
from rest_framework.test import APIClient
from courses.models import Course
from cohorts.models import Cohort
from accounts.models import User
import datetime

class CohortAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(email="admin@example.com", password="password")
        self.student_user = User.objects.create_user(email="student@example.com", password="password", role="STUDENT")
        self.course = Course.objects.create(
            code="TEST101",
            name="Test Course",
            description="Course Description",
            difficulty="BEGINNER",
            duration_weeks=12,
            status="PUBLISHED"
        )

    def test_create_cohort_with_new_fields(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "code": "C01",
            "name": "Test Cohort",
            "course": str(self.course.id),
            "start_date": "2024-01-01",
            "end_date": "2024-06-01",
            "whatsapp_group_link": "https://chat.whatsapp.com/test",
            "rules_and_regulations": "Be nice.",
            "application_end_date": "2023-12-31T23:59:59Z"
        }
        response = self.client.post('/api/cohorts/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["whatsapp_group_link"], "https://chat.whatsapp.com/test")
        self.assertEqual(response.data["rules_and_regulations"], "Be nice.")
        self.assertIn("course_details", response.data)
        self.assertEqual(response.data["course_details"]["description"], "Course Description")
        self.assertEqual(response.data["application_end_date"], "2023-12-31T23:59:59Z")

    def test_whatsapp_visibility_public(self):
        cohort = Cohort.objects.create(
            code="C02",
            name="Test Cohort 2",
            course=self.course,
            start_date="2024-01-01",
            end_date="2024-06-01",
            whatsapp_group_link="https://chat.whatsapp.com/secret"
        )
        
        # Unauthenticated
        response = self.client.get(f'/api/cohorts/{cohort.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data.get("whatsapp_group_link"))
        
        # Authenticated Student (not enrolled)
        self.client.force_authenticate(user=self.student_user)
        response = self.client.get(f'/api/cohorts/{cohort.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data.get("whatsapp_group_link"))
        
        # Admin
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f'/api/cohorts/{cohort.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("whatsapp_group_link"), "https://chat.whatsapp.com/secret")
