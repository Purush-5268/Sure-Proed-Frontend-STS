from datetime import time
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from attendance.models import AbsenceWarning, Attendance, AttendanceSummary
from common import test_volunteer_workspace_permissions as workspace_tests


class ReleaseAccessTests(TestCase):
    setUp = workspace_tests.VolunteerWorkspacePermissionTests.setUp
    rows = staticmethod(workspace_tests.VolunteerWorkspacePermissionTests.rows)

    def sessions(self):
        cache.clear()
        result = []
        for cohort in [self.cohort, self.other_cohort]:
            result.append(Attendance.objects.create(
                cohort=cohort, title="Scoped class", class_date=timezone.localdate(),
                start_time=time(10), end_time=time(11), conducted_by=self.mentor,
            ))
        self.client.force_authenticate(self.volunteer)
        return result

    def test_directory_and_profiles_follow_assignment_and_global_grant(self):
        self.sessions()
        for path, assigned, other in [
            ("/api/students/", self.student.pk, self.other_student_user.student_profile.pk),
            ("/api/cohorts/", self.cohort.pk, self.other_cohort.pk),
        ]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, response.data)
            ids = {str(row["id"]) for row in self.rows(response)}
            self.assertIn(str(assigned), ids)
            self.assertNotIn(str(other), ids)
        self.volunteer.has_all_cohorts_access = True
        self.volunteer.save(update_fields=["has_all_cohorts_access"])
        for path, other in [("/api/students/", self.other_student_user.student_profile.pk), ("/api/cohorts/", self.other_cohort.pk)]:
            ids = {str(row["id"]) for row in self.rows(self.client.get(path))}
            self.assertIn(str(other), ids)

    def test_assignment_revocation_takes_effect_after_cached_read(self):
        assigned, other = self.sessions()
        self.assertEqual(len(self.rows(self.client.get("/api/attendance/"))), 1)
        self.cohort.volunteers.remove(self.volunteer)
        self.assertEqual(self.rows(self.client.get("/api/attendance/")), [])
        self.volunteer.has_all_cohorts_access = True
        self.volunteer.save(update_fields=["has_all_cohorts_access"])
        self.assertEqual(len(self.rows(self.client.get("/api/attendance/"))), 2)
        self.volunteer.has_all_cohorts_access = False
        self.volunteer.save(update_fields=["has_all_cohorts_access"])
        self.assertEqual(self.rows(self.client.get("/api/attendance/")), [])

    def test_reports_summary_and_updates_reject_unassigned_cohort(self):
        assigned, other = self.sessions()
        for session in [assigned, other]:
            AttendanceSummary.objects.create(session=session, student=self.student)
        response = self.client.get("/api/attendance/summary/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(self.rows(response)), 1)
        for suffix in ["", "official-attendance/", "official-attendance/download/"]:
            self.assertEqual(self.client.get(f"/api/attendance/{other.pk}/{suffix}").status_code, 404)
        response = self.client.patch(f"/api/attendance/{assigned.pk}/", {"cohort": str(self.other_cohort.pk)}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        assigned.refresh_from_db()
        self.assertEqual(assigned.cohort_id, self.cohort.pk)

    def test_assigned_mentor_can_read_report_without_legacy_profile_course(self):
        assigned, other = self.sessions()
        assigned.google_meet_attendance_data = {"status": "READY", "participants": [], "expected_students": {}}
        assigned.save(update_fields=["google_meet_attendance_data"])
        self.client.force_authenticate(self.mentor)
        response = self.client.get(f"/api/attendance/{assigned.pk}/official-attendance/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get(f"/api/attendance/{other.pk}/official-attendance/").status_code, 404)

    @patch("attendance.views.generate_google_meet")
    def test_unassigned_class_creation_is_rejected_before_google_call(self, google):
        self.sessions()
        response = self.client.post("/api/attendance/", {
            "cohort": str(self.other_cohort.pk), "title": "Forbidden", "class_type": "DOMAIN",
            "class_date": str(timezone.localdate()), "start_time": "10:00", "end_time": "11:00",
        }, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(self.client.post("/api/attendance/generate-lst/", {}, format="json").status_code, 403)
        google.assert_not_called()

    @patch("attendance.views.generate_google_meet")
    def test_explicit_mobile_class_type_is_preserved_for_an_assigned_cohort(self, google):
        """The mobile schedule form sends class_type without the legacy session_type."""
        google.return_value = ("https://meet.google.com/abc-defg-hij", "calendar-event")
        self.client.force_authenticate(self.volunteer)

        response = self.client.post("/api/attendance/", {
            "cohort": str(self.cohort.pk),
            "title": "Cohort celebration",
            "class_type": "CELEBRATION",
            "class_date": str(timezone.localdate()),
            "start_time": "10:00",
            "end_time": "11:00",
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        session = Attendance.objects.get(pk=response.data["id"])
        self.assertEqual(session.class_type, Attendance.ClassType.CELEBRATION)
        google.assert_called_once()

    def test_warning_queries_and_decisions_are_scoped(self):
        assigned, other = self.sessions()
        warning = AbsenceWarning.objects.create(session=other, student=self.student, status="APOLOGIZED")
        response = self.client.get("/api/attendance/admin_queries/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.rows(response), [])
        self.assertEqual(self.client.get("/api/attendance/chat_history/", {"warning_id": str(warning.pk)}).status_code, 403)
        response = self.client.post("/api/attendance/admin_update_query/", {"warning_id": str(warning.pk), "action": "ACCEPT"}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        warning.refresh_from_db()
        self.assertEqual(warning.status, "APOLOGIZED")

    def test_only_admin_can_grant_and_revoke_global_access(self):
        self.sessions()
        self.volunteer.is_staff = True
        self.volunteer.save(update_fields=["is_staff"])
        grant = reverse("cohort-grant-all-cohorts-access")
        revoke = reverse("cohort-revoke-all-cohorts-access")
        payload = {"user_id": str(self.volunteer.pk)}
        self.assertEqual(self.client.post(grant, payload, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(grant, payload, format="json").status_code, 200)
        self.volunteer.refresh_from_db()
        self.assertTrue(self.volunteer.has_all_cohorts_access)
        self.assertEqual(self.client.post(revoke, payload, format="json").status_code, 200)
        self.volunteer.refresh_from_db()
        self.assertFalse(self.volunteer.has_all_cohorts_access)
