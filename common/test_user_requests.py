from types import SimpleNamespace

from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from accounts.models import User
from common.admin import NotificationAdmin, UserRequestAdmin, UserRequestAdminForm
from common.models import Notification, UserRequest


class UserRequestResponseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            email="request-admin@example.com",
            password="test-pass",
        )
        self.student_user = User.objects.create_user(
            email="request-student@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
        )
        self.user_request = UserRequest.objects.create(
            sender=self.student_user,
            category=UserRequest.Category.OTHER,
            subject="Need administrator help",
            description="Please review this request.",
        )

    def test_notification_recipient_uses_searchable_dropdown(self):
        notification_admin = NotificationAdmin(Notification, AdminSite())
        self.assertEqual(notification_admin.autocomplete_fields, ("user",))

    def test_every_admin_request_update_requires_admin_remarks(self):
        form = UserRequestAdminForm(
            instance=self.user_request,
            data={
                "sender": str(self.student_user.pk),
                "sender_role": User.Role.STUDENT,
                "category": UserRequest.Category.OTHER,
                "subject": self.user_request.subject,
                "description": self.user_request.description,
                "status": UserRequest.Status.IN_PROGRESS,
                "admin_remarks": "",
            },
        )

        self.assertFalse(form.is_valid())
        self.assertIn("admin_remarks", form.errors)

    def test_admin_response_is_saved_notified_and_returned_to_student(self):
        self.user_request.status = UserRequest.Status.RESOLVED
        self.user_request.admin_remarks = "Your request was reviewed and approved."
        request = RequestFactory().post("/secure-admin/common/userrequest/")
        request.user = self.admin_user
        model_admin = UserRequestAdmin(UserRequest, AdminSite())

        model_admin.save_model(
            request,
            self.user_request,
            SimpleNamespace(changed_data=["status", "admin_remarks"]),
            change=True,
        )

        self.user_request.refresh_from_db()
        self.assertEqual(self.user_request.resolved_by, self.admin_user)
        self.assertIsNotNone(self.user_request.resolved_at)
        self.assertTrue(
            Notification.objects.filter(
                user=self.student_user,
                title=f"Admin responded to {self.user_request.request_number}",
                action_url="support_requests",
            ).exists()
        )

        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/requests/")
        self.assertEqual(response.status_code, 200, response.data)
        row = response.data["results"][0]
        self.assertEqual(row["admin_remarks"], "Your request was reviewed and approved.")
        self.assertIsNotNone(row["resolved_at"])
