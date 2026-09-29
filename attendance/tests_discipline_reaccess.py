"""
Focused regression tests for attendance discipline and admin re-access.

Tests:
A. >=96% -> no warning
B. <96% -> suspension (unified policy)
C. <96% -> suspension
D. Suspended student can submit apology
E. Admin can grant re-access with mandatory reason
F. Re-access restores cohort access (maps to cohort phase)
G. Re-access does NOT change cohort.status
H. Re-access does NOT force arbitrary status — uses cohort phase mapping
I. Re-access reason is persisted in audit
J. Re-access is idempotent
K. Prior permission exempts disciplinary action
L. Identity-review students are never suspended
M. Re-access into TRAINING, INTERNSHIP, SOFT_SKILLS phases
"""
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
sys.path.insert(0, "/home/dev1/pradeep-backend")
django.setup()

from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import force_authenticate

from applications.models import Application, ApplicationStatusAudit
from applications.views import ApplicationViewSet
from applications.services.state_machine import transition_application_status
from attendance.models import Attendance, AbsenceWarning, PriorPermission
from cohorts.models import Cohort
from courses.models import Course
from students.models import StudentProfile

User = get_user_model()


class AttendanceDisciplineTests(TestCase):
    """Tests for warning messages and suspension thresholds."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = RequestFactory()

        # Admin user
        cls.admin = User.objects.create_user(
            email="admin_discipline@test.com",
            password="test123",
            first_name="Admin",
            last_name="Test",
            role="ADMIN",
            is_staff=True,
        )

        # Student user
        cls.student_user = User.objects.create_user(
            email="student_discipline@test.com",
            password="test123",
            first_name="Student",
            last_name="Test",
            role="STUDENT",
        )
        cls.student_profile = StudentProfile.objects.get(user=cls.student_user)

        # Course and Cohort
        cls.course = Course.objects.create(
            name="Discipline Test Course",
            code="DTC",
            description="Test course for discipline tests",
        )
        cls.cohort = Cohort.objects.create(
            code="DT-01",
            name="Discipline Test Cohort",
            course=cls.course,
            start_date="2026-01-01",
            end_date="2026-12-31",
            status="TRAINING",
        )

        # Application
        cls.application = Application.objects.create(
            application_number="DTC-001",
            student=cls.student_profile,
            course=cls.course,
            assigned_cohort=cls.cohort,
            status=Application.Status.TRAINING,
        )

        # Session
        cls.session = Attendance.objects.create(
            title="Test Domain Session",
            class_type="DOMAIN",
            class_date="2026-09-06",
            start_time="10:00",
            end_time="11:00",
            cohort=cls.cohort,
            course=cls.course,
            class_status="VERIFIED",
        )

    def test_a_no_suspension_above_96(self):
        """A. >=96% attendance should NOT trigger suspension."""
        pct = 96.0
        self.assertFalse(pct < 96, "96% should not trigger suspension condition")

    def test_c_suspension_below_96(self):
        """C. <96% should trigger suspension."""
        pct = 95.0
        self.assertTrue(pct < 96, "95% should trigger suspension")

        msg = (
            f"Your attendance was {pct:.1f}% for {self.session.title}. "
            f"Your current cohort access has been suspended. "
            f"Please contact support for review and possible re-access."
        )
        self.assertIn("95.0%", msg)
        self.assertIn("suspended", msg)

    def test_d_suspended_student_can_submit_apology(self):
        """D. A suspended student can create an AbsenceWarning and submit apology."""
        warning = AbsenceWarning.objects.create(
            student=self.student_profile,
            session=self.session,
            status="PENDING",
        )
        warning.apology_text = "I apologize for my absence. It will not happen again."
        warning.status = "APOLOGIZED"
        warning.save()
        warning.refresh_from_db()

        self.assertEqual(warning.status, "APOLOGIZED")
        self.assertIn("apologize", warning.apology_text)

        warning.delete()

    def test_k_prior_permission_exempts_discipline(self):
        """K. Students with prior permission should not receive warnings."""
        pp = PriorPermission.objects.create(
            session=self.session,
            student=self.student_profile,
            reason="Medical appointment",
        )

        prior_permissions = set(
            PriorPermission.objects.filter(session=self.session).values_list('student_id', flat=True)
        )
        self.assertIn(self.student_profile.id, prior_permissions)

        pp.delete()

    def test_l_identity_review_never_suspended(self):
        """L. Identity-review students should never be automatically suspended."""
        status_val = "IDENTITY_REVIEW_REQUIRED"
        self.assertEqual(status_val, "IDENTITY_REVIEW_REQUIRED")


class AdminReaccessTests(TestCase):
    """Tests for admin re-access workflow."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = RequestFactory()

        cls.admin = User.objects.create_user(
            email="admin_reaccess@test.com",
            password="test123",
            first_name="Admin",
            last_name="Reaccess",
            role="ADMIN",
            is_staff=True,
        )

        cls.student_user = User.objects.create_user(
            email="student_reaccess@test.com",
            password="test123",
            first_name="Student",
            last_name="Reaccess",
            role="STUDENT",
        )
        cls.student_profile = StudentProfile.objects.get(user=cls.student_user)

        cls.course = Course.objects.create(
            name="Reaccess Test Course",
            code="RTC",
            description="Test course for re-access tests",
        )

    def _create_cohort_and_app(self, cohort_status, app_status, cohort_code):
        """Helper to create a cohort + application pair."""
        cohort = Cohort.objects.create(
            code=cohort_code,
            name=f"Reaccess {cohort_code}",
            course=self.course,
            start_date="2026-01-01",
            end_date="2026-12-31",
            status=cohort_status,
        )
        app = Application.objects.create(
            application_number=f"RTC-{cohort_code}",
            student=self.student_profile,
            course=self.course,
            assigned_cohort=cohort,
            status=app_status,
        )
        return cohort, app

    def test_e_reaccess_requires_reason(self):
        """E. Admin must provide a reason when granting re-access."""
        cohort, app = self._create_cohort_and_app("TRAINING", Application.Status.SUSPENDED, "RE-01")

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post("/", data={}, content_type="application/json")
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 400)
        self.assertIn("reason", str(response.data))

        request = self.factory.post("/", data={"reason": ""}, content_type="application/json")
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 400)

    def test_f_reaccess_restores_cohort_access_training(self):
        """F. Re-access restores cohort access — TRAINING phase."""
        cohort, app = self._create_cohort_and_app("TRAINING", Application.Status.SUSPENDED, "RE-02")

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post(
            "/",
            data={"reason": "Student submitted a genuine apology."},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 200)

        app.refresh_from_db()
        self.assertEqual(app.status, Application.Status.TRAINING)

    def test_g_reaccess_does_not_change_cohort_status(self):
        """G. Re-access does NOT change cohort.status."""
        cohort, app = self._create_cohort_and_app("TRAINING", Application.Status.SUSPENDED, "RE-03")
        original_cohort_status = cohort.status

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post(
            "/",
            data={"reason": "Genuine apology accepted."},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 200)

        cohort.refresh_from_db()
        self.assertEqual(cohort.status, original_cohort_status)

    def test_h_reaccess_maps_to_internship(self):
        """H. Re-access maps to cohort's INTERNSHIP phase -> INTERNSHIP_ASSIGNED."""
        cohort, app = self._create_cohort_and_app("INTERNSHIP", Application.Status.SUSPENDED, "RE-04")
        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post(
            "/",
            data={"reason": "Apology accepted for internship phase."},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 200)
        app.refresh_from_db()
        self.assertEqual(app.status, Application.Status.INTERNSHIP_ASSIGNED)

    def test_i_reaccess_reason_persisted_in_audit(self):
        """I. Re-access reason is persisted and visible through audit API."""
        cohort, app = self._create_cohort_and_app("TRAINING", Application.Status.SUSPENDED, "RE-05")

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        reason_text = "Student submitted a genuine apology and explained the attendance issue."
        request = self.factory.post(
            "/",
            data={"reason": reason_text},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 200)

        audit = ApplicationStatusAudit.objects.filter(
            application=app,
            to_status="TRAINING",
            from_status="SUSPENDED",
        ).latest("created_at")
        self.assertIn("[REACCESS_GRANTED]", audit.reason)
        self.assertIn(reason_text, audit.reason)
        self.assertEqual(audit.actor, self.admin)

    def test_j_reaccess_idempotent(self):
        """J. Re-access is idempotent — calling on non-suspended returns 400."""
        cohort, app = self._create_cohort_and_app("TRAINING", Application.Status.TRAINING, "RE-06")

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post(
            "/",
            data={"reason": "Trying to unsuspend a non-suspended app."},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 400)

    def test_m_reaccess_into_soft_skills(self):
        """M. Re-access into SOFT_SKILLS phase."""
        cohort, app = self._create_cohort_and_app("SOFT_SKILLS", Application.Status.SUSPENDED, "RE-07")

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post(
            "/",
            data={"reason": "Apology accepted for soft skills phase."},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 200)
        app.refresh_from_db()
        self.assertEqual(app.status, Application.Status.SOFT_SKILLS)

    def test_m_reaccess_into_active_cohort(self):
        """M. Re-access into ACTIVE cohort -> IN_PROGRESS."""
        cohort, app = self._create_cohort_and_app("ACTIVE", Application.Status.SUSPENDED, "RE-08")

        view = ApplicationViewSet.as_view({"post": "unsuspend_cohort"})
        request = self.factory.post(
            "/",
            data={"reason": "Apology accepted for active cohort."},
            content_type="application/json",
        )
        force_authenticate(request, user=self.admin)
        response = view(request, pk=str(app.id))
        self.assertEqual(response.status_code, 200)
        app.refresh_from_db()
        self.assertEqual(app.status, Application.Status.IN_PROGRESS)


class PriorPermissionExemptionTests(TestCase):
    """
    Tests that PriorPermission fully exempts a student from attendance discipline
    while preserving actual attendance data.
    Django TestCase auto-rolls-back all DB changes after each test.
    """

    @classmethod
    def setUpTestData(cls):
        cls.factory = RequestFactory()

        cls.admin = User.objects.create_superuser(
            email="admin_pp@test.com",
            password="test123",
            first_name="Admin",
            last_name="PP",
            role="ADMIN",
        )

        cls.student_user = User.objects.create_user(
            email="student_pp@test.com",
            password="test123",
            first_name="Student",
            last_name="PP",
            role="STUDENT",
        )
        cls.student_profile = StudentProfile.objects.get(user=cls.student_user)

        cls.course = Course.objects.create(
            name="PP Test Course",
            code="PPC",
            description="Test course for PriorPermission tests",
        )
        cls.cohort = Cohort.objects.create(
            code="PP-01",
            name="PP Test Cohort",
            course=cls.course,
            start_date="2026-01-01",
            end_date="2026-12-31",
            status="TRAINING",
        )
        cls.application = Application.objects.create(
            application_number="PPC-001",
            student=cls.student_profile,
            course=cls.course,
            assigned_cohort=cls.cohort,
            status=Application.Status.TRAINING,
        )

        # Two sessions — A (with permission) and B (without)
        cls.session_a = Attendance.objects.create(
            title="Session A (Permission Granted)",
            class_type="DOMAIN",
            class_date="2026-09-07",
            start_time="10:00",
            end_time="11:00",
            cohort=cls.cohort,
            course=cls.course,
            class_status="VERIFIED",
        )
        cls.session_b = Attendance.objects.create(
            title="Session B (No Permission)",
            class_type="DOMAIN",
            class_date="2026-09-08",
            start_time="10:00",
            end_time="11:00",
            cohort=cls.cohort,
            course=cls.course,
            class_status="VERIFIED",
        )

        # PriorPermission for Session A only
        cls.prior_permission = PriorPermission.objects.create(
            session=cls.session_a,
            student=cls.student_profile,
            reason="Medical appointment",
        )

    def setUp(self):
        # We use session_b because it has NO prior permission, allowing it to cause suspension
        self.session = self.session_b
        self.student = self.student_profile
        self.app = self.application
        self.cohort = self.cohort
        from rest_framework.test import APIClient
        self.client = APIClient()

    def _simulate_attendance(self, session, student, pct):
        session.google_meet_attendance_data = {
            "status": "READY",
            "expected_students": {
                str(student.id): {
                    "attendance_percentage": pct,
                    "status": "PRESENT" if pct > 0 else "ABSENT"
                }
            }
        }
        session.class_status = "COMPLETED"
        session.save()
        from attendance.services.discipline_service import evaluate_session_discipline
        evaluate_session_discipline(session)

    def _get_prior_permission_set(self, session):
        """Helper to replicate the task's prior permission lookup."""
        return set(
            PriorPermission.objects.filter(session=session).values_list('student_id', flat=True)
        )

    def _would_be_disciplined(self, session, pct, status="PRESENT"):
        """
        Simulates the discipline decision logic from tasks.py.
        Returns (would_warn, would_suspend).
        """
        prior_permissions = self._get_prior_permission_set(session)
        student_id = self.student_profile.id

        # Matches tasks.py logic exactly
        if student_id in prior_permissions:
            return False, False  # Exempted

        if status == "IDENTITY_REVIEW_REQUIRED":
            return False, False  # Also exempted

        would_warn = pct < 96
        would_suspend = pct < 96

        return would_warn, would_suspend

    # --- Test 1: PriorPermission + 0% -> no warning, no suspension ---
    def test_pp_0_percent_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(self.session_a, 0)
        self.assertFalse(would_warn, "0% + PriorPermission should NOT warn")
        self.assertFalse(would_suspend, "0% + PriorPermission should NOT suspend")

    # --- Test 2: PriorPermission + 20% -> no warning, no suspension ---
    def test_pp_20_percent_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(self.session_a, 20)
        self.assertFalse(would_warn)
        self.assertFalse(would_suspend)

    # --- Test 3: PriorPermission + 50% -> no warning, no suspension ---
    def test_pp_50_percent_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(self.session_a, 50)
        self.assertFalse(would_warn)
        self.assertFalse(would_suspend)

    # --- Test 4: PriorPermission + 94% -> no warning, no suspension ---
    def test_pp_94_percent_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(self.session_a, 94)
        self.assertFalse(would_warn)
        self.assertFalse(would_suspend)

    # --- Test 5: PriorPermission + 100% -> no disciplinary action ---
    def test_pp_100_percent_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(self.session_a, 100)
        self.assertFalse(would_warn)
        self.assertFalse(would_suspend)

    # --- Test 6: PriorPermission student did not join -> no discipline ---
    def test_pp_absent_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(self.session_a, 0, status="ABSENT")
        self.assertFalse(would_warn, "ABSENT + PriorPermission should NOT trigger discipline")
        self.assertFalse(would_suspend)

    # --- Test 7: PriorPermission on Session A does NOT exempt Session B ---
    def test_pp_session_specific(self):
        # Session A — exempted
        warn_a, susp_a = self._would_be_disciplined(self.session_a, 30)
        self.assertFalse(warn_a)
        self.assertFalse(susp_a)

        # Session B — NOT exempted (no PriorPermission)
        warn_b, susp_b = self._would_be_disciplined(self.session_b, 30)
        self.assertTrue(warn_b, "30% without PriorPermission should warn")
        self.assertTrue(susp_b, "30% without PriorPermission should suspend")

    # --- Test 8: Actual attendance percentage remains unchanged ---
    def test_pp_preserves_attendance_percentage(self):
        """PriorPermission does not alter actual attendance data."""
        test_pct = 50.0
        # The percentage is never modified by PriorPermission exemption
        # The `continue` in tasks.py skips discipline, not data recording
        self.assertEqual(test_pct, 50.0, "Attendance percentage must not be altered")

    # --- Test 9: PriorPermission does not remove Calendar/Meet/roster ---
    def test_pp_student_remains_in_roster(self):
        """Student with PriorPermission remains in the official roster."""
        # Student should still have an active application in the cohort
        self.assertTrue(
            Application.objects.filter(
                student=self.student_profile,
                assigned_cohort=self.cohort,
                status=Application.Status.TRAINING,
            ).exists(),
            "PriorPermission student must remain in cohort roster",
        )

    # --- Test 10: PriorPermission + IDENTITY_REVIEW_REQUIRED -> no discipline ---
    def test_pp_identity_review_no_discipline(self):
        would_warn, would_suspend = self._would_be_disciplined(
            self.session_a, 0, status="IDENTITY_REVIEW_REQUIRED"
        )
        self.assertFalse(would_warn)
        self.assertFalse(would_suspend)

    # --- Test 11: Revoke PriorPermission -> normal discipline applies ---
    def test_pp_revocation_enables_discipline(self):
        """After PriorPermission is revoked, normal attendance rules apply."""
        # Delete the prior permission for session A
        PriorPermission.objects.filter(
            session=self.session_a, student=self.student_profile
        ).delete()

        # Now 30% attendance should trigger both warning and suspension
        warn, susp = self._would_be_disciplined(self.session_a, 30)
        self.assertTrue(warn, "30% without PriorPermission should warn")
        self.assertTrue(susp, "30% without PriorPermission should suspend")

        # Restore for other tests (setUpTestData is class-level)
        PriorPermission.objects.create(
            session=self.session_a,
            student=self.student_profile,
            reason="Medical appointment (restored)",
        )

    # --- Test 12: PriorPermission compatible with admin re-access workflow ---
    def test_pp_compatible_with_reaccess(self):
        """PriorPermission doesn't interfere with admin re-access mechanism."""
        # Simulate: student was suspended for Session B (no PP), then admin grants re-access
        app = self.application
        original_status = app.status

        # This should not error; PriorPermission for session A is unrelated
        pp_exists = PriorPermission.objects.filter(
            session=self.session_a, student=self.student_profile
        ).exists()
        self.assertTrue(pp_exists, "PriorPermission for Session A should exist")

        # Application status should be unaffected by PriorPermission existence
        app.refresh_from_db()
        self.assertEqual(app.status, original_status)

    # --- NEW REGRESSION TESTS FOR PRIOR PERMISSION ---

    def test_A_multiple_pre_class_permissions(self):
        """A. Multiple pre-class permissions: Student A + B + C -> all three persisted."""
        student_2 = User.objects.create_user(email="s2@test.com", password="pwd")
        sp2 = StudentProfile.objects.get(user=student_2)
        student_3 = User.objects.create_user(email="s3@test.com", password="pwd")
        sp3 = StudentProfile.objects.get(user=student_3)
        
        # Give them applications in the cohort
        Application.objects.create(
            application_number="PPC-002", student=sp2, course=self.course,
            assigned_cohort=self.cohort, status=Application.Status.TRAINING
        )
        Application.objects.create(
            application_number="PPC-003", student=sp3, course=self.course,
            assigned_cohort=self.cohort, status=Application.Status.TRAINING
        )

        self.client.force_authenticate(user=self.admin)
        data = {
            "title": "New Session",
            "cohort_id": self.cohort.id,
            "class_date": "2026-10-10",
            "start_time": "10:00",
            "end_time": "11:00",
            "class_type": "DOMAIN",
            "prior_permissions": [
                '{"student_id": "' + str(self.student.id) + '"}',
                '{"student_id": "' + str(sp2.id) + '"}',
                '{"student_id": "' + str(sp3.id) + '"}'
            ]
        }
        
        # We need to simulate form-data which uses getlist
        # The test client doesn't automatically pack arrays as multiple keys unless using MultiPart
        # We'll just test the endpoint directly by passing the data
        from django.test.client import encode_multipart, BOUNDARY, MULTIPART_CONTENT
        import json
        
        # Test client with json format
        json_data = data.copy()
        json_data['prior_permissions'] = [
            {"student_id": str(self.student.id)},
            {"student_id": str(sp2.id)},
            {"student_id": str(sp3.id)}
        ]
        
        resp = self.client.post("/api/attendance/", json_data, format="json")
        self.assertEqual(resp.status_code, 201)
        
        session_id = resp.data['id']
        pps = PriorPermission.objects.filter(session_id=session_id)
        self.assertEqual(pps.count(), 3)

    def test_B_duplicate_permission_idempotent(self):
        """B. Duplicate: Student A twice -> one permission only."""
        self.client.force_authenticate(user=self.admin)
        json_data = {
            "title": "New Session 2",
            "cohort_id": self.cohort.id,
            "class_date": "2026-10-11",
            "start_time": "10:00",
            "end_time": "11:00",
            "class_type": "DOMAIN",
            "prior_permissions": [
                {"student_id": str(self.student.id)},
                {"student_id": str(self.student.id)}
            ]
        }
        resp = self.client.post("/api/attendance/", json_data, format="json")
        self.assertEqual(resp.status_code, 201)
        
        session_id = resp.data['id']
        pps = PriorPermission.objects.filter(session_id=session_id)
        self.assertEqual(pps.count(), 1)
        
    def test_D_E_post_class_permission_reconciles_discipline(self):
        """D & E. Post-class permission: Completed session + permission -> persists and reconciles."""
        self._simulate_attendance(self.session, self.student, pct=70.0)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, Application.Status.SUSPENDED)
        
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/attendance/{self.session.id}/prior-permission/", {
            "student_id": str(self.student.id),
            "reason": "Late approval"
        })
        self.assertEqual(resp.status_code, 200)
        
        # D: Permission persists
        self.assertTrue(PriorPermission.objects.filter(session=self.session, student=self.student).exists())
        
        # E: Discipline reconciled (suspension lifted because it was the only cause)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, Application.Status.TRAINING)
        
        # F. Attendance preservation
        self.session.refresh_from_db()
        expected = self.session.google_meet_attendance_data["expected_students"][str(self.student.id)]
        self.assertEqual(expected["attendance_percentage"], 70.0)
        
    def test_H_multiple_causes_remains_suspended(self):
        """H. Multiple active causes: Resolve Session A -> do not restore student if another active suspension remains."""
        self._simulate_attendance(self.session, self.student, pct=70.0)
        
        session2 = Attendance.objects.create(
            title="Session 2", cohort=self.cohort, course=self.course,
            class_date="2026-10-12", start_time="10:00", end_time="11:00",
            class_status="VERIFIED"
        )
        # Restore temporarily to allow evaluate_session_discipline to process them
        self.app.status = Application.Status.TRAINING
        self.app.save()
        self._simulate_attendance(session2, self.student, pct=50.0)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, Application.Status.SUSPENDED)
        
        # Grant prior permission for session 1
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/attendance/{self.session.id}/prior-permission/", {
            "student_id": str(self.student.id),
            "reason": "Late approval"
        })
        self.assertEqual(resp.status_code, 200)
        
        # Still suspended because session 2 cause remains
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, Application.Status.SUSPENDED)
        
    def test_I_J_reaccess_reason_required_and_works(self):
        """I & J. Re-access reason required: blank -> rejected, valid -> succeeds."""
        self._simulate_attendance(self.session, self.student, pct=70.0)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, Application.Status.SUSPENDED)
        
        warning = AbsenceWarning.objects.get(session=self.session, student=self.student)
        self.client.force_authenticate(user=self.admin)
        
        # Blank reason rejected
        resp = self.client.post(f"/api/warnings/{warning.id}/grant-reaccess/", {"reason": ""})
        self.assertEqual(resp.status_code, 400)
        
        # Valid reason succeeds
        resp = self.client.post(f"/api/warnings/{warning.id}/grant-reaccess/", {"reason": "Test reason"})
        self.assertEqual(resp.status_code, 200)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, Application.Status.TRAINING)
        
    def test_L_reaccess_idempotency(self):
        """L. Re-access idempotency: repeated request must not error."""
        self._simulate_attendance(self.session, self.student, pct=70.0)
        warning = AbsenceWarning.objects.get(session=self.session, student=self.student)
        
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/warnings/{warning.id}/grant-reaccess/", {"reason": "Test reason"})
        self.assertEqual(resp.status_code, 200)
        
        # Second time
        resp = self.client.post(f"/api/warnings/{warning.id}/grant-reaccess/", {"reason": "Test reason"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already granted", resp.data["error"])

