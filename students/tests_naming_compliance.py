from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from students.models import StudentProfile, GoogleStudentIdentity
from applications.models import Application
from courses.models import Course
from cohorts.models import Cohort
from students.services.naming_compliance import check_naming_compliance

User = get_user_model()

class NamingComplianceLogicTests(TestCase):
    def test_naming_compliance_logic(self):
        # Student Name: Paidipilli Purushotham
        # Cohort: G2-26
        # Course: VLSI
        
        # 1. Full recognizable name + correct cohort + course → true
        self.assertTrue(check_naming_compliance(
            google_profile_name="Paidipilli Purushotham - G2-26 VLSI",
            student_full_name="Paidipilli Purushotham",
            cohort_code="G2-26",
            course_code="VLSI"
        ))
        
        # 2. Initial/short recognizable name + correct cohort + course → true
        self.assertTrue(check_naming_compliance(
            google_profile_name="P Purushotham - G2-26 VLSI",
            student_full_name="Paidipilli Purushotham",
            cohort_code="G2-26",
            course_code="VLSI"
        ))
        
        # 3. Unrelated name + correct cohort + course → false
        self.assertFalse(check_naming_compliance(
            google_profile_name="Ganesh - G2-26 VLSI",
            student_full_name="Paidipilli Purushotham",
            cohort_code="G2-26",
            course_code="VLSI"
        ))
        
        # 4. Correct name + wrong cohort → false
        self.assertFalse(check_naming_compliance(
            google_profile_name="P Purushotham - G2-25 VLSI",
            student_full_name="Paidipilli Purushotham",
            cohort_code="G2-26",
            course_code="VLSI"
        ))
        
        # 5. Correct name + wrong course → false
        self.assertFalse(check_naming_compliance(
            google_profile_name="P Purushotham - G2-26 JAVA",
            student_full_name="Paidipilli Purushotham",
            cohort_code="G2-26",
            course_code="VLSI"
        ))
        
        # 6. Cohort + course but no student name → false
        self.assertFalse(check_naming_compliance(
            google_profile_name="G2-26 VLSI",
            student_full_name="Paidipilli Purushotham",
            cohort_code="G2-26",
            course_code="VLSI"
        ))

        # 10/11. Missing data -> null
        self.assertIsNone(check_naming_compliance(None, "Name", "C", "D"))
        self.assertIsNone(check_naming_compliance("Name", None, "C", "D"))


class NamingComplianceSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="test_student@example.com", 
            password="Password123!",
            first_name="Paidipilli",
            last_name="Purushotham",
            role=User.Role.STUDENT,
        )
        self.student_profile = StudentProfile.objects.get(user=self.user)
        self.course = Course.objects.create(name="Test Course", code="VLSI")
        from django.utils import timezone
        import datetime
        now = timezone.now()
        self.cohort = Cohort.objects.create(
            name="Test Cohort", 
            course=self.course,
            code="G2-26",
            start_date=now.date(),
            end_date=now.date() + datetime.timedelta(days=30)
        )
        
        self.application = Application.objects.create(
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/students/me/"

    def _create_google_identity(self, profile_name):
        return GoogleStudentIdentity.objects.create(
            student=self.student_profile,
            google_email="test.google@gmail.com",
            google_profile_name=profile_name,
            is_verified=True
        )

    def test_matching_google_profile_name_compliant(self):
        self._create_google_identity("P Purushotham - G2-26 VLSI")
        
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        
        google_identity = response.data.get("google_identity")
        self.assertIsNotNone(google_identity)
        self.assertTrue(google_identity.get("naming_compliant", {}).get("is_compliant"))

    def test_non_matching_google_profile_name_compliant(self):
        self._create_google_identity("Ganesh G2-26 VLSI")
        
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        
        google_identity = response.data.get("google_identity")
        self.assertIsNotNone(google_identity)
        self.assertFalse(google_identity.get("naming_compliant", {}).get("is_compliant"))

    def test_dynamic_changing_google_name(self):
        identity = self._create_google_identity("Wrong Name")
        response = self.client.get(self.url)
        self.assertFalse(response.data["google_identity"]["naming_compliant"]["is_compliant"])
        
        identity.google_profile_name = "P Purushotham - G2-26 VLSI"
        identity.save()
        
        response = self.client.get(self.url)
        self.assertTrue(response.data["google_identity"]["naming_compliant"]["is_compliant"])

    def test_dynamic_changing_cohort(self):
        identity = self._create_google_identity("P Purushotham - G2-26 VLSI")
        response = self.client.get(self.url)
        self.assertTrue(response.data["google_identity"]["naming_compliant"]["is_compliant"])
        
        self.cohort.code = "G18"
        self.cohort.save()
        
        response = self.client.get(self.url)
        self.assertFalse(response.data["google_identity"]["naming_compliant"]["is_compliant"])
        
    def test_dynamic_changing_course(self):
        identity = self._create_google_identity("P Purushotham - G2-26 VLSI")
        response = self.client.get(self.url)
        self.assertTrue(response.data["google_identity"]["naming_compliant"]["is_compliant"])
        
        self.course.code = "JAVA"
        self.course.save()
        
        response = self.client.get(self.url)
        self.assertFalse(response.data["google_identity"]["naming_compliant"]["is_compliant"])

    def test_no_google_identity(self):
        response = self.client.get(self.url)
        self.assertIsNone(response.data.get("google_identity"))

    def test_missing_google_profile_name(self):
        identity = self._create_google_identity("")
        response = self.client.get(self.url)
        google_identity = response.data.get("google_identity")
        self.assertIsNotNone(google_identity)
        self.assertIsNone(google_identity.get("naming_compliant"))
        
    def test_missing_current_application(self):
        self.application.delete()
        self._create_google_identity("P Purushotham - G2-26 VLSI")
        response = self.client.get(self.url)
        
        google_identity = response.data.get("google_identity")
        self.assertIsNotNone(google_identity)
        self.assertIsNone(google_identity.get("naming_compliant"))
