from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from accounts.models import User
from cohorts.models import Cohort
from courses.models import Course
from students.models import StudentProfile
from volunteers.models import VolunteerProfile
from django.utils import timezone
from datetime import timedelta

class VolunteerCohortAssignmentAndRevocationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        self.admin = User.objects.create_user(email="admin@suretrust.local", password="password123", role=User.Role.ADMIN)
        self.admin.is_staff = True
        self.admin.mapped_email = "admin2@gmail.com"
        self.admin.save()
        
        self.volunteer_a = User.objects.create_user(email="vola2@gmail.com", password="password123", role=User.Role.VOLUNTEER)
        self.volunteer_a.save()
        
        self.volunteer_b = User.objects.create_user(email="volb2@gmail.com", password="password123", role=User.Role.VOLUNTEER)
        self.volunteer_b.save()
        
        # Profiles are automatically created by signals

        
        self.student = User.objects.create_user(email="student@gmail.com", password="password123", role=User.Role.STUDENT)
        
        self.course = Course.objects.create(
            code="C1", name="Test Course", 
            duration_weeks=10, 
            status=Course.Status.PUBLISHED
        )
        
        self.cohort_g7 = Cohort.objects.create(
            code="G7 GenAI",
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=30),
            status=Cohort.Status.TRAINING
        )
        
        self.cohort_g3 = Cohort.objects.create(
            code="G3-26 VLSI",
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=30),
            status=Cohort.Status.INTERNSHIP
        )
        
        self.cohort_soft = Cohort.objects.create(
            code="SoftSkills",
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timedelta(days=30),
            status=Cohort.Status.SOFT_SKILLS
        )
        
        self.assign_url_a = f"/api/users/{self.volunteer_a.id}/assign-cohorts/"
        self.assign_url_b = f"/api/users/{self.volunteer_b.id}/assign-cohorts/"
        self.revoke_url = f"/api/users/{self.volunteer_a.id}/revoke-volunteer/"

    def test_assign_cohort_to_volunteer(self):
        self.client.force_authenticate(user=self.admin)
        
        # Test GET before assignment
        res = self.client.get(self.assign_url_a)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Check that none are assigned
        for c in res.data:
            self.assertFalse(c["assigned_to_current_volunteer"])
            
        # Post assignment
        res = self.client.post(self.assign_url_a, {"cohort_ids": [str(self.cohort_g7.id)]}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # GET after assignment
        res = self.client.get(self.assign_url_a)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        for c in res.data:
            if str(c["id"]) == str(self.cohort_g7.id):
                self.assertTrue(c["assigned_to_current_volunteer"])
                self.assertEqual(c["category"], "TRAINING")
            else:
                self.assertFalse(c["assigned_to_current_volunteer"])
                
        # Check B is not affected
        res_b = self.client.get(self.assign_url_b)
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        for c in res_b.data:
            self.assertFalse(c["assigned_to_current_volunteer"])

    def test_many_to_many_assignment(self):
        self.client.force_authenticate(user=self.admin)
        
        self.client.post(self.assign_url_a, {"cohort_ids": [str(self.cohort_g7.id)]}, format='json')
        self.client.post(self.assign_url_b, {"cohort_ids": [str(self.cohort_g7.id)]}, format='json')
        
        res_a = self.client.get(self.assign_url_a)
        res_b = self.client.get(self.assign_url_b)
        
        assigned_a = next(c for c in res_a.data if str(c["id"]) == str(self.cohort_g7.id))
        assigned_b = next(c for c in res_b.data if str(c["id"]) == str(self.cohort_g7.id))
        
        self.assertTrue(assigned_a["assigned_to_current_volunteer"])
        self.assertTrue(assigned_b["assigned_to_current_volunteer"])

    def test_unauthorized_access(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.post(self.assign_url_a, {"cohort_ids": []}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        
        res = self.client.get(self.assign_url_a)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        
        res = self.client.post(self.revoke_url, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_revoke_volunteer_access(self):
        self.client.force_authenticate(user=self.admin)
        
        # Pre-assign
        self.client.post(self.assign_url_a, {"cohort_ids": [str(self.cohort_g7.id)]}, format='json')
        self.client.post(self.assign_url_b, {"cohort_ids": [str(self.cohort_g7.id)]}, format='json')
        
        res = self.client.post(self.revoke_url, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        self.volunteer_a.refresh_from_db()
        self.assertEqual(self.volunteer_a.role, User.Role.STUDENT)
        self.assertEqual(self.volunteer_a.volunteered_cohorts.count(), 0)
        
        # Ensure profiles still exist
        self.assertTrue(StudentProfile.objects.filter(user=self.volunteer_a).exists())
        self.assertTrue(VolunteerProfile.objects.filter(user=self.volunteer_a).exists())
        
        # Ensure volunteer b still assigned
        self.assertEqual(self.volunteer_b.volunteered_cohorts.count(), 1)
