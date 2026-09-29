import uuid
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from accounts.models import User
from students.models import StudentProfile
from courses.models import Course
from cohorts.models import Cohort
from applications.models import Application

class WhatsAppOnboardingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="test_student@example.com", 
            password="testpassword", 
            role="STUDENT", 
            is_active=True
        )
        self.student = StudentProfile.objects.create(
            user=self.user,
            student_code="STU-000001",
            first_name="Test",
            last_name="Student",
            name="Test Student"
        )
        
        self.course = Course.objects.create(
            name="Cybersecurity",
            code="CS-101",
            description="Test Course",
            difficulty="Beginner"
        )
        
        self.open_cohort = Cohort.objects.create(
            code="G17 CS",
            name="Cohort 17",
            course=self.course,
            status=Cohort.Status.OPEN,
            whatsapp_group_link="https://chat.whatsapp.com/open"
        )
        
        self.open_cohort_2 = Cohort.objects.create(
            code="G18 CS",
            name="Cohort 18",
            course=self.course,
            status=Cohort.Status.OPEN,
            whatsapp_group_link="https://chat.whatsapp.com/open2"
        )
        
        self.training_cohort = Cohort.objects.create(
            code="G16 CS",
            name="Cohort 16",
            course=self.course,
            status=Cohort.Status.TRAINING,
            whatsapp_group_link="https://chat.whatsapp.com/training"
        )

    def test_student_self_application_with_explicit_cohort(self):
        self.client.force_authenticate(user=self.user)
        
        response = self.client.post("/api/applications/", {
            "course": str(self.course.id),
            "assigned_cohort": str(self.open_cohort.id)
        })
        
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "APPLIED")
        self.assertEqual(response.data["assigned_cohort"], str(self.open_cohort.id))
        
    def test_student_self_application_without_cohort_rejected(self):
        self.client.force_authenticate(user=self.user)
        
        response = self.client.post("/api/applications/", {
            "course": str(self.course.id)
        })
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("You must select a valid OPEN cohort", str(response.data))
        
    def test_whatsapp_link_exposed_during_onboarding(self):
        app = Application.objects.create(
            student=self.student,
            course=self.course,
            assigned_cohort=self.open_cohort,
            status="APPLIED"
        )
        
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/applications/{app.id}/")
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["whatsapp_group_link"], "https://chat.whatsapp.com/open")
        self.assertIn("cohort", response.data)
        self.assertEqual(response.data["cohort"]["id"], str(self.open_cohort.id))
        
    def test_whatsapp_link_hidden_during_training(self):
        app = Application.objects.create(
            student=self.student,
            course=self.course,
            assigned_cohort=self.training_cohort,
            status="TRAINING"
        )
        
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"/api/applications/{app.id}/")
        
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data.get("whatsapp_group_link"))
        
    def test_whatsapp_link_hidden_from_other_students(self):
        app = Application.objects.create(
            student=self.student,
            course=self.course,
            assigned_cohort=self.open_cohort,
            status="APPLIED"
        )
        
        other_user = User.objects.create_user(
            email="other_student@example.com", 
            password="testpassword", 
            role="STUDENT", 
            is_active=True
        )
        
        self.client.force_authenticate(user=other_user)
        response = self.client.get(f"/api/applications/{app.id}/")
        
        if response.status_code == 200:
            self.assertIsNone(response.data.get("whatsapp_group_link"))
