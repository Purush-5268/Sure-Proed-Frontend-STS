from django.utils import timezone
from unittest.mock import patch
from django.test import RequestFactory, TestCase
from accounts.models import User
from students.models import StudentProfile
from attendance.models import Attendance
from courses.models import Course
from cohorts.models import Cohort
from attendance.views import AttendanceViewSet
from rest_framework import status
from rest_framework.test import force_authenticate

class AttendanceContractTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        
        self.admin = User.objects.create(email="admin_contract@test.com", is_superuser=True)
        
        self.course = Course.objects.create(name="Contract Course", code="C-CONTRACT")
        self.cohort_y = Cohort.objects.create(name="Cohort Y", code="C-Y", course=self.course, start_date=timezone.localdate(), end_date=timezone.localdate())
        self.cohort_z = Cohort.objects.create(name="Cohort Z", code="C-Z", course=self.course, start_date=timezone.localdate(), end_date=timezone.localdate())
        
        self.s1 = StudentProfile.objects.get_or_create(user=User.objects.create(email="s1@test.com"))[0] # PRESENT
        self.s2 = StudentProfile.objects.get_or_create(user=User.objects.create(email="s2@test.com"))[0] # BELOW_THRESHOLD
        self.s3 = StudentProfile.objects.get_or_create(user=User.objects.create(email="s3@test.com"))[0] # ABSENT
        self.s4 = StudentProfile.objects.get_or_create(user=User.objects.create(email="s4@test.com"))[0] # LEGACY PRESENT
        
        self.session = Attendance.objects.create(
            title="Contract Test Session",
            class_date=timezone.localdate(), start_time="10:00", end_time="11:00",
            class_type="DOMAIN",
            cohort=self.cohort_y
        )
        
        self.view_detail = AttendanceViewSet.as_view({'get': 'official_attendance'})
        self.view_excel = AttendanceViewSet.as_view({'get': 'export_excel'})
        
    @patch('attendance.services.real_meet_attendance_service.RealMeetAttendanceService.get_structured_attendance')
    def test_sync_and_scope(self, mock_get_structured):
        # 1. Mock the new authoritative response
        mock_data = {
            "status": "READY",
            "expected_students": {
                str(self.s1.id): {"status": "PRESENT", "cohort_id": str(self.cohort_y.id)},
                str(self.s2.id): {"status": "BELOW_THRESHOLD", "cohort_id": str(self.cohort_y.id)},
                str(self.s3.id): {"status": "ABSENT", "cohort_id": str(self.cohort_y.id)}
            },
            "unmatched_participants": [
                {"name": "Ambiguous User"}
            ]
        }
        mock_get_structured.return_value = mock_data
        
        # 2. Call the endpoint (forcing a refresh to trigger sync)
        req = self.factory.get(f'/api/attendance/{self.session.id}/official-attendance/?force_refresh=true')
        force_authenticate(req, user=self.admin)
        res = self.view_detail(req, pk=self.session.id)
        self.assertEqual(res.status_code, 200)
        
        # 3. Verify Attendee Sync
        # S1 (PRESENT) and S2 (BELOW_THRESHOLD) should be attendees. S3 (ABSENT) should not.
        attendee_ids = set(self.session.attendees.values_list('id', flat=True))
        self.assertIn(self.s1.id, attendee_ids)
        self.assertIn(self.s2.id, attendee_ids)
        self.assertNotIn(self.s3.id, attendee_ids)
        
        # 4. Verify Idempotency (calling again shouldn't duplicate)
        # Django M2M .add() is natively idempotent, but we test anyway.
        self.view_detail(req, pk=self.session.id)
        self.assertEqual(self.session.attendees.count(), 2)
        
        # 5. Verify Scope Filtering: Correct Scope (Cohort Y)
        req_y = self.factory.get(f'/api/attendance/{self.session.id}/official-attendance/?scope=cohort&cohort_id={self.cohort_y.id}')
        force_authenticate(req_y, user=self.admin)
        res_y = self.view_detail(req_y, pk=self.session.id)
        
        data_y = res_y.data
        self.assertEqual(len(data_y["expected_students"]), 3)
        self.assertEqual(len(data_y["unmatched_participants"]), 1) # Session is in scope, return exceptions
        
        # 6. Verify Scope Filtering: Wrong Scope (Cohort Z)
        req_z = self.factory.get(f'/api/attendance/{self.session.id}/official-attendance/?scope=cohort&cohort_id={self.cohort_z.id}')
        force_authenticate(req_z, user=self.admin)
        res_z = self.view_detail(req_z, pk=self.session.id)
        
        self.assertEqual(res_z.status_code, 404)  # A mismatched cohort filter must not expose the report.

        # 7. Verify Excel Export with new structure
        req_excel = self.factory.get('/api/attendance/export_excel/')
        force_authenticate(req_excel, user=self.admin)
        res_excel = self.view_excel(req_excel)
        self.assertEqual(res_excel.status_code, 200)
        
    def test_legacy_snapshot(self):
        # 1. Setup a legacy snapshot in DB
        self.session.google_meet_attendance_data = {
            "status": "READY",
            "participants": [
                {"student_id": str(self.s4.id), "cohort_id": str(self.cohort_y.id)},
                {"name": "No Student ID"}
            ]
        }
        self.session.save()
        
        # 2. Scope filtering should fallback to participants
        req_y = self.factory.get(f'/api/attendance/{self.session.id}/official-attendance/?scope=cohort&cohort_id={self.cohort_y.id}')
        force_authenticate(req_y, user=self.admin)
        res_y = self.view_detail(req_y, pk=self.session.id)
        
        data_y = res_y.data
        self.assertIn("participants", data_y)
        self.assertEqual(len(data_y["participants"]), 1)
        self.assertEqual(data_y["participants"][0]["student_id"], str(self.s4.id))
        
        # 3. Verify Excel Export with legacy structure
        req_excel = self.factory.get('/api/attendance/export_excel/')
        force_authenticate(req_excel, user=self.admin)
        res_excel = self.view_excel(req_excel)
        self.assertEqual(res_excel.status_code, 200)

if __name__ == "__main__":
    import unittest
    unittest.main()
