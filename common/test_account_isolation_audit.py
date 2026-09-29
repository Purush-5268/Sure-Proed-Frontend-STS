import time
from datetime import time as clock_time
from asgiref.sync import async_to_sync
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from accounts.models import AdministratorProfile
from attendance.models import Attendance, AbsenceWarning
from attendance.middleware import JWTAuthMiddleware
from attendance.consumers import PermissionChatConsumer
from common.test_volunteer_workspace_permissions import VolunteerWorkspacePermissionTests


class AccountIsolationAuditTests(TransactionTestCase):
    setUp = VolunteerWorkspacePermissionTests.setUp

    def test_staff_mentor_cannot_upsert_another_student_profile(self):
        self.mentor.is_staff = True
        self.mentor.save()
        self.client.force_authenticate(self.mentor)
        response = self.client.post("/api/students/", {"user": str(self.other_student_user.pk), "bio": "overwritten"})
        self.assertEqual(response.status_code, 403)
        self.other_student_user.student_profile.refresh_from_db()
        self.assertNotEqual(self.other_student_user.student_profile.bio, "overwritten")

    def test_prior_permissions_reject_outside_cohort_and_bad_ids(self):
        session = Attendance.objects.create(cohort=self.cohort, title="Class", class_date=timezone.localdate(), start_time=clock_time(10), end_time=clock_time(11), conducted_by=self.mentor)
        self.client.force_authenticate(self.mentor)
        path = f"/api/attendance/{session.pk}/grant-prior-permission/"
        self.assertEqual(self.client.post(path, {"student_id": str(self.other_student_user.student_profile.pk)}).status_code, 403)
        self.assertEqual(self.client.post(path, {"student_id": "invalid"}).status_code, 400)
        self.assertEqual(self.client.post(path, {"student_id": str(self.student.pk)}).status_code, 200)

    def test_administrator_profiles_cannot_be_retrieved_or_upserted_by_other_accounts(self):
        profile, _ = AdministratorProfile.objects.get_or_create(user=self.admin)
        from config.urls import router
        prefix = next(prefix for prefix, view, base in router.registry if view.__name__ == "AdministratorProfileViewSet")
        self.client.force_authenticate(self.student_user)
        self.assertEqual(self.client.get(f"/api/{prefix}/{profile.pk}/").status_code, 404)
        response = self.client.post(f"/api/{prefix}/", {"user": str(self.admin.pk), "category": "TRUSTEE"})
        self.assertIn(response.status_code, [400, 403])

    def test_websocket_rejects_refresh_tokens_and_disabled_users(self):
        async def resolve(token):
            captured = {}
            async def inner(scope, receive, send): captured.update(scope)
            await JWTAuthMiddleware(inner)({"query_string": b"", "subprotocols": ["Bearer", token]}, None, None)
            return captured["user"]
        refresh = RefreshToken.for_user(self.student_user)
        self.assertFalse(async_to_sync(resolve)(str(refresh)).is_authenticated)
        self.assertEqual(async_to_sync(resolve)(str(refresh.access_token)).pk, self.student_user.pk)
        self.student_user.is_active = False
        self.student_user.save()
        self.assertFalse(async_to_sync(resolve)(str(refresh.access_token)).is_authenticated)

    def test_revoked_prior_permission_does_not_send_invitation(self):
        import uuid
        from unittest.mock import patch
        from attendance.tasks import sync_prior_permission_invitation
        with patch('attendance.services.google_meet_service.add_attendees_to_google_event') as calendar, patch('common.tasks.send_async_session_invitations_task.delay') as mail:
            sync_prior_permission_invitation(str(uuid.uuid4()))
        calendar.assert_not_called()
        mail.assert_not_called()

    def test_private_chat_scope_and_revocation_are_rechecked(self):
        session = Attendance.objects.create(cohort=self.cohort, title="Class", class_date=timezone.localdate(), start_time=clock_time(10), end_time=clock_time(11), conducted_by=self.mentor)
        warning = AbsenceWarning.objects.create(session=session, student=self.student)
        consumer = PermissionChatConsumer()
        consumer.scope = {"auth_expires": time.time() + 60}
        check = async_to_sync(consumer.check_authorization)
        self.assertTrue(check(warning.pk, self.student_user))
        self.assertFalse(check(warning.pk, self.other_student_user))
        self.assertTrue(check(warning.pk, self.mentor))
        self.cohort.mentors.remove(self.mentor)
        self.assertFalse(check(warning.pk, self.mentor))
        consumer.scope["auth_expires"] = 0
        self.assertFalse(check(warning.pk, self.student_user))
