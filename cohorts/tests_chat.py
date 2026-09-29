"""
Focused integration tests for:
  - Part 1: UserRequest admin resolve/reject actions
  - Part 2: Cohort Group Chat REST API

Run with:
  python manage.py test cohorts.tests_chat common.test_user_requests
"""
import uuid
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from dateutil.relativedelta import relativedelta
from django.utils import timezone

from accounts.models import User
from students.models import StudentProfile
from courses.models import Course
from cohorts.models import Cohort
from applications.models import Application
from common.models import UserRequest
from cohorts.chat_models import CohortConversation, CohortMessage, CohortChatReadState


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def make_user(email, role="STUDENT", **kwargs):
    return User.objects.create_user(email=email, password="test1234", role=role, **kwargs)


def make_student(email):
    user = make_user(email, role="STUDENT", first_name="Test")
    profile, _ = StudentProfile.objects.get_or_create(
        user=user, defaults={"student_code": f"STU-{email[:6].upper()}"}
    )
    return user, profile


def make_cohort(course, admin, code="C-TEST"):
    return Cohort.objects.create(
        code=code,
        name=code,
        course=course,
        start_date=timezone.now().date() - relativedelta(months=2),
        end_date=timezone.now().date() + relativedelta(months=1),
        status=Cohort.Status.ACTIVE,
        created_by=admin,
    )


def make_application(student_profile, course, cohort, app_status=Application.Status.IN_PROGRESS):
    return Application.objects.create(
        student=student_profile,
        course=course,
        assigned_cohort=cohort,
        status=app_status,
        qualified=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Part 1: UserRequest Admin Resolution
# ─────────────────────────────────────────────────────────────────────────────
class UserRequestAdminResolutionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@test.local", password="admin123"
        )
        self.student_user, _ = make_student("student@test.local")
        self.request_obj = UserRequest.objects.create(
            sender=self.student_user,
            sender_role="STUDENT",
            category=UserRequest.Category.TECHNICAL_ISSUE,
            subject="My test request",
            description="Something is broken",
        )
        self.url = reverse("userrequest-update-status", kwargs={"pk": self.request_obj.pk})

    def test_admin_can_mark_in_progress(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {"new_status": "IN_PROGRESS", "admin_remarks": "Looking into it"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.request_obj.refresh_from_db()
        self.assertEqual(self.request_obj.status, UserRequest.Status.IN_PROGRESS)
        self.assertEqual(self.request_obj.admin_remarks, "Looking into it")

    def test_admin_can_resolve(self):
        self.request_obj.status = UserRequest.Status.IN_PROGRESS
        self.request_obj.save()
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {"new_status": "RESOLVED", "admin_remarks": "Fixed!"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.request_obj.refresh_from_db()
        self.assertEqual(self.request_obj.status, UserRequest.Status.RESOLVED)
        self.assertEqual(self.request_obj.resolved_by, self.admin)
        self.assertIsNotNone(self.request_obj.resolved_at)

    def test_admin_can_reject(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {"new_status": "REJECTED", "admin_remarks": "Not valid"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.request_obj.refresh_from_db()
        self.assertEqual(self.request_obj.status, UserRequest.Status.REJECTED)

    def test_invalid_transition_rejected(self):
        # PENDING → CLOSED is not allowed
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {"new_status": "CLOSED"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_cannot_update_status(self):
        """Ordinary students must never change request status."""
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.url, {"new_status": "RESOLVED"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_count_admin(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse("userrequest-pending-count")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("pending_count", response.json())

    def test_pending_count_student_denied(self):
        self.client.force_authenticate(user=self.student_user)
        url = reverse("userrequest-pending-count")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ─────────────────────────────────────────────────────────────────────────────
# Part 2: Cohort Group Chat REST API
# ─────────────────────────────────────────────────────────────────────────────
class CohortChatRestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(email="chatadmin@test.local", password="admin123")
        self.course = Course.objects.create(
            code="CHAT101", name="Chat Course",
            status=Course.Status.PUBLISHED, created_by=self.admin
        )
        self.cohort = make_cohort(self.course, self.admin, code="CHAT-C1")
        self.cohort2 = make_cohort(self.course, self.admin, code="CHAT-C2")

        self.student_user, self.student_profile = make_student("chatstudent@test.local")
        self.other_student, self.other_profile = make_student("other@test.local")
        self.suspended_user, self.suspended_profile = make_student("suspended@test.local")
        self.mentor = make_user("mentor@test.local", role="MENTOR", first_name="Mentor")
        self.cohort.mentors.add(self.mentor)

        # Active application for student
        make_application(self.student_profile, self.course, self.cohort)
        # Suspended application
        make_application(self.suspended_profile, self.course, self.cohort, Application.Status.SUSPENDED)
        # other student is in cohort2, not cohort
        make_application(self.other_profile, self.course, self.cohort2)

        self.messages_url = reverse("cohort_chat_messages", kwargs={"cohort_id": self.cohort.id})
        self.unread_url = reverse("cohort_chat_unread", kwargs={"cohort_id": self.cohort.id})
        self.read_url = reverse("cohort_chat_read", kwargs={"cohort_id": self.cohort.id})

    # ── Authorization ──────────────────────────────────────────────────────

    def test_authorized_student_can_read_messages(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authorized_student_can_send_message(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.messages_url, {"body": "Hello cohort!"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["body"], "Hello cohort!")

    def test_unauthorized_student_denied(self):
        """other_student is in cohort2, not this cohort."""
        self.client.force_authenticate(user=self.other_student)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_suspended_student_denied(self):
        self.client.force_authenticate(user=self.suspended_user)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_suspended_student_cannot_send(self):
        self.client.force_authenticate(user=self.suspended_user)
        response = self.client.post(self.messages_url, {"body": "I should not send"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_restored_student_allowed(self):
        """Restoring the application re-grants access."""
        app = Application.objects.get(student=self.suspended_profile, assigned_cohort=self.cohort)
        app.status = Application.Status.COHORT_ASSIGNED
        app.save()
        self.client.force_authenticate(user=self.suspended_user)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authorized_mentor_allowed(self):
        self.client.force_authenticate(user=self.mentor)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unauthorized_mentor_denied(self):
        """Mentor not assigned to this cohort must be denied."""
        other_mentor = make_user("othermentor@test.local", role="MENTOR")
        # Not added to self.cohort.mentors
        self.client.force_authenticate(user=other_mentor)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_always_allowed(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.messages_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Cohort Isolation ───────────────────────────────────────────────────

    def test_cohort_isolation(self):
        """Messages sent to cohort must NOT appear in cohort2."""
        self.client.force_authenticate(user=self.student_user)
        self.client.post(self.messages_url, {"body": "Cohort 1 message"})

        # other_student is in cohort2 only
        url_c2 = reverse("cohort_chat_messages", kwargs={"cohort_id": self.cohort2.id})
        self.client.force_authenticate(user=self.other_student)
        response = self.client.get(url_c2)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        bodies = [m["body"] for m in response.json()["results"]]
        self.assertNotIn("Cohort 1 message", bodies)

    # ── Pagination ─────────────────────────────────────────────────────────

    def test_pagination_returns_at_most_page_size(self):
        """Create 60 messages; list should return at most 50 and has_more=True."""
        conv, _ = CohortConversation.objects.get_or_create(cohort=self.cohort)
        CohortMessage.objects.bulk_create([
            CohortMessage(conversation=conv, sender=self.admin, body=f"msg {i}")
            for i in range(60)
        ])
        self.client.force_authenticate(user=self.student_user)
        response = self.client.get(self.messages_url)
        data = response.json()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(data["results"]), 50)
        self.assertTrue(data["has_more"])

    # ── Duplicate conversation prevention ──────────────────────────────────

    def test_duplicate_conversation_prevented(self):
        """Accessing chat multiple times must not create duplicate conversations."""
        self.client.force_authenticate(user=self.student_user)
        self.client.get(self.messages_url)
        self.client.get(self.messages_url)
        count = CohortConversation.objects.filter(cohort=self.cohort).count()
        self.assertEqual(count, 1)

    # ── Unread count ───────────────────────────────────────────────────────

    def test_unread_count(self):
        """After admin sends a message, student should see 1 unread."""
        conv, _ = CohortConversation.objects.get_or_create(cohort=self.cohort)
        # Mark as read first (empty)
        self.client.force_authenticate(user=self.student_user)
        self.client.post(self.read_url)
        # Admin sends a message
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.messages_url, {"body": "Admin message"})
        # Student checks unread
        self.client.force_authenticate(user=self.student_user)
        response = self.client.get(self.unread_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.json()["unread_count"], 1)

    def test_mark_read(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.messages_url, {"body": "Test"})
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.read_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "marked_read")

    # ── Messages survive suspension ────────────────────────────────────────

    def test_messages_survive_suspension(self):
        """Suspending a student must not delete their messages."""
        conv, _ = CohortConversation.objects.get_or_create(cohort=self.cohort)
        self.client.force_authenticate(user=self.student_user)
        self.client.post(self.messages_url, {"body": "I will be suspended soon"})

        app = Application.objects.get(student=self.student_profile, assigned_cohort=self.cohort)
        app.status = Application.Status.SUSPENDED
        app.save()

        # Message must still exist in DB
        count = CohortMessage.objects.filter(conversation=conv, sender=self.student_user).count()
        self.assertEqual(count, 1)

    # ── Empty body rejected ────────────────────────────────────────────────

    def test_empty_body_rejected(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.post(self.messages_url, {"body": ""})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
