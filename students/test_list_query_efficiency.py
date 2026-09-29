from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course
from students.models import StudentProfile


class StudentListQueryEfficiencyTests(APITestCase):
    def test_staff_list_does_not_query_per_student(self):
        mentor = User.objects.create_user(
            email="mentor-query-test@sureproed.mentor",
            mapped_email="mentor-query-test@example.com",
            password="Password@123",
            role=User.Role.MENTOR,
            has_all_cohorts_access=True,
        )
        course = Course.objects.create(
            code="QUERY-PERF",
            name="Query performance",
            domain="Performance",
            description="Query-count regression fixture",
            status=Course.Status.PUBLISHED,
        )
        today = timezone.localdate()
        cohort = Cohort.objects.create(
            code="QUERY-COHORT",
            course=course,
            start_date=today,
            end_date=today + timedelta(days=30),
            status=Cohort.Status.ACTIVE,
        )
        cohort.mentors.add(mentor)
        for index in range(10):
            student_user = User.objects.create_user(
                email=f"student-query-{index}@example.com",
                password="Password@123",
                role=User.Role.STUDENT,
            )
            profile = StudentProfile.objects.get(user=student_user)
            profile.student_code = f"STU-QUERY-{index:03d}"
            profile.save(update_fields=["student_code", "updated_at"])
            Application.objects.create(
                application_number=f"APP-PERF-{index:03d}",
                student=profile,
                course=course,
                assigned_cohort=cohort,
                status=Application.Status.IN_PROGRESS,
            )

        self.client.force_authenticate(mentor)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get("/api/students/?page_size=100")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 10)
        self.assertLessEqual(
            len(queries),
            12,
            "The staff student list must use a fixed number of queries.",
        )
