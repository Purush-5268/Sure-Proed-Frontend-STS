from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone
from datetime import timedelta
from accounts.models import User
from cohorts.models import Cohort
from attendance.models import Attendance
from students.models import StudentProfile
from applications.models import Application

class VolunteerContributionTests(APITestCase):
    def setUp(self):
        self.volunteer = User.objects.create_user(email="vol@test.com", password="pw", role="VOLUNTEER")
        self.other_volunteer = User.objects.create_user(email="vol2@test.com", password="pw", role="VOLUNTEER")
        self.student_user = User.objects.create_user(email="student@test.com", password="pw", role="STUDENT")
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.student_user)
        self.student_user2 = User.objects.create_user(email="student2@test.com", password="pw", role="STUDENT")
        self.student_profile2, _ = StudentProfile.objects.get_or_create(user=self.student_user2)

        self.cohort1 = Cohort.objects.create(name="Cohort 1", status="TRAINING")
        self.cohort1.volunteers.add(self.volunteer)

        # Enrolled student
        Application.objects.create(
            student=self.student_profile,
            assigned_cohort=self.cohort1,
            status="TRAINING"
        )
        Application.objects.create(
            student=self.student_profile2,
            assigned_cohort=self.cohort1,
            status="DROPPED" # inactive, shouldn't count
        )

        self.url = reverse("volunteer-contributions")

    def test_unauthorized_access(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_volunteer_isolation_and_metrics(self):
        # Create completed session for volunteer
        Attendance.objects.create(
            cohort=self.cohort1,
            title="Sess 1",
            class_date=timezone.now().date(),
            start_time=timezone.now().time(),
            conducted_by=self.volunteer,
            class_status="COMPLETED",
            conducted=True,
            google_meet_attendance_data={
                "class_metrics": {"duration_seconds": 3600},
                "expected_students": {
                    "1": {"attendance_percentage": 100},
                    "2": {"attendance_percentage": 50},
                }
            }
        )

        # Create canceled session for volunteer (should be ignored)
        Attendance.objects.create(
            cohort=self.cohort1,
            title="Sess Cancelled",
            class_date=timezone.now().date(),
            start_time=timezone.now().time(),
            conducted_by=self.volunteer,
            class_status="CANCELLED",
            conducted=False,
            google_meet_attendance_data={"class_metrics": {"duration_seconds": 3600}}
        )

        # Create session for OTHER volunteer
        Attendance.objects.create(
            cohort=self.cohort1,
            title="Other Vol Sess",
            class_date=timezone.now().date(),
            start_time=timezone.now().time(),
            conducted_by=self.other_volunteer,
            class_status="COMPLETED",
            conducted=True,
            google_meet_attendance_data={"class_metrics": {"duration_seconds": 7200}}
        )

        self.client.force_authenticate(user=self.volunteer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertEqual(data["summary"]["classes_conducted"], 1) # Only 1 completed by this vol
        self.assertEqual(data["summary"]["total_hours"], 1.0) # 3600 seconds = 1 hr
        self.assertEqual(data["summary"]["average_attendance"], 75.0) # (100+50)/2
        self.assertEqual(data["summary"]["students_impacted"], 1) # only student 1 is active (status=TRAINING)

        # Check cohort
        self.assertEqual(len(data["cohorts"]), 1)
        self.assertEqual(data["cohorts"][0]["name"], "Cohort 1")
        self.assertEqual(data["cohorts"][0]["students_count"], 1)

