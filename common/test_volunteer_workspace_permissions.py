from datetime import time, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application, CommunityActivity, PreScreeningInterview
from attendance.models import Attendance
from cohorts.models import Cohort
from courses.models import Course
from volunteers.models import VolunteerTask


class VolunteerWorkspacePermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(email="workspace-admin@example.com", password="test-pass")
        self.volunteer = User.objects.create_user(
            email="workspace-volunteer@example.com", password="test-pass", role=User.Role.VOLUNTEER
        )
        self.mentor = User.objects.create_user(
            email="workspace-mentor@example.com", password="test-pass", role=User.Role.MENTOR
        )
        self.student_user = User.objects.create_user(
            email="workspace-student@example.com", password="test-pass", role=User.Role.STUDENT,
            first_name="Assigned", last_name="Student",
        )
        self.outsider = User.objects.create_user(
            email="workspace-outsider@example.com", password="test-pass", role=User.Role.VOLUNTEER
        )
        self.other_student_user = User.objects.create_user(
            email="workspace-other-student@example.com", password="test-pass", role=User.Role.STUDENT
        )
        self.course = Course.objects.create(
            code="WORKSPACE-101", name="Volunteer Workspace", domain="Technology",
            description="Volunteer permission tests", status=Course.Status.PUBLISHED,
            requires_interview=True, created_by=self.admin,
        )
        today = timezone.localdate()
        self.cohort = Cohort.objects.create(
            code="WORKSPACE-A", name="Assigned cohort", course=self.course,
            start_date=today, end_date=today + timedelta(days=60),
            status=Cohort.Status.ACTIVE, created_by=self.admin,
        )
        self.other_cohort = Cohort.objects.create(
            code="WORKSPACE-B", name="Other cohort", course=self.course,
            start_date=today, end_date=today + timedelta(days=60),
            status=Cohort.Status.ACTIVE, created_by=self.admin,
        )
        self.cohort.volunteers.add(self.volunteer)
        self.cohort.mentors.add(self.mentor)
        self.other_cohort.volunteers.add(self.outsider)
        self.student = self.student_user.student_profile
        self.student.is_linkedin_connected = True
        self.student.linkedin_url = "https://linkedin.com/in/assigned-student"
        self.student.save(update_fields=["is_linkedin_connected", "linkedin_url", "updated_at"])
        self.application = Application.objects.create(
            application_number="APP-WORKSPACE-001", student=self.student, course=self.course,
            assigned_cohort=self.cohort, status=Application.Status.QUALIFIED, qualified=True,
        )
        self.other_application = Application.objects.create(
            application_number="APP-WORKSPACE-002", student=self.other_student_user.student_profile,
            course=self.course, assigned_cohort=self.other_cohort,
            status=Application.Status.QUALIFIED, qualified=True,
        )

    @staticmethod
    def rows(response):
        return response.data.get("results", response.data) if isinstance(response.data, dict) else response.data

    def test_volunteer_reads_only_assigned_cohort_attendance(self):
        assigned = Attendance.objects.create(
            cohort=self.cohort, title="Assigned session", class_date=timezone.localdate(),
            start_time=time(10), end_time=time(11), conducted_by=self.mentor,
        )
        Attendance.objects.create(
            cohort=self.other_cohort, title="Private session", class_date=timezone.localdate(),
            start_time=time(12), end_time=time(13), conducted_by=self.outsider,
        )
        self.client.force_authenticate(self.volunteer)

        response = self.client.get("/api/attendance/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({str(row["id"]) for row in self.rows(response)}, {str(assigned.id)})

    def test_assigned_volunteer_can_schedule_and_decide_interview(self):
        self.client.force_authenticate(self.volunteer)
        scheduled_at = (timezone.now() + timedelta(days=1)).isoformat()

        created = self.client.post(
            "/api/pre-screening-interviews/",
            {
                "application": str(self.application.id),
                "scheduled_at": scheduled_at,
                "meeting_link": "https://meet.example.com/interview",
                "status": PreScreeningInterview.Status.SCHEDULED,
            },
            format="json",
        )

        self.assertEqual(created.status_code, 201, created.data)
        interview = PreScreeningInterview.objects.get(pk=created.data["id"])
        self.assertEqual(interview.interviewer, self.volunteer)

        decided = self.client.patch(
            f"/api/pre-screening-interviews/{interview.id}/",
            {"status": PreScreeningInterview.Status.PASSED, "score": "88", "feedback": "Strong candidate."},
            format="json",
        )
        self.assertEqual(decided.status_code, 200, decided.data)
        interview.refresh_from_db()
        self.assertEqual(interview.status, PreScreeningInterview.Status.PASSED)

    def test_assigned_volunteer_can_verify_community_activity(self):
        activity = CommunityActivity.objects.create(
            application=self.application,
            activity_type=CommunityActivity.ActivityType.TREE_PLANTATION,
            title="Community planting", activity_date=timezone.localdate(),
        )
        self.client.force_authenticate(self.volunteer)

        response = self.client.post(
            f"/api/community-activities/{activity.id}/verify/",
            {"status": CommunityActivity.Status.VERIFIED, "verification_remarks": "Evidence verified."},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        activity.refresh_from_db()
        self.assertEqual(activity.verified_by, self.volunteer)
        self.assertEqual(activity.status, CommunityActivity.Status.VERIFIED)

    def test_volunteer_directory_is_shared_cohort_only(self):
        self.client.force_authenticate(self.volunteer)

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 200, response.data)
        emails = {row["email"] for row in self.rows(response)}
        self.assertIn(self.student_user.email, emails)
        self.assertIn(self.mentor.email, emails)
        self.assertNotIn(self.other_student_user.email, emails)
        self.assertNotIn(self.outsider.email, emails)

    def test_volunteer_tasks_are_cohort_scoped(self):
        other_task = VolunteerTask.objects.create(
            title="Private task", cohort=self.other_cohort, assigned_to=self.outsider, assigned_by=self.admin,
        )
        self.client.force_authenticate(self.volunteer)

        created = self.client.post(
            "/api/volunteers/tasks/",
            {
                "title": "Assigned task", "cohort": str(self.cohort.id),
                "assigned_to": str(self.volunteer.id), "priority": VolunteerTask.Priority.HIGH,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)

        visible = self.client.get("/api/volunteers/tasks/")
        self.assertEqual(visible.status_code, 200, visible.data)
        ids = {str(row["id"]) for row in self.rows(visible)}
        self.assertIn(str(created.data["id"]), ids)
        self.assertNotIn(str(other_task.id), ids)
