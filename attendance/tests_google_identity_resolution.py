import uuid
from unittest.mock import patch, MagicMock
from django.utils import timezone
import datetime
from students.models import StudentProfile, GoogleStudentIdentity
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course
from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()

class MockSession:
    def __init__(self, cohort):
        self.id = uuid.uuid4()
        self.class_type = 'DOMAIN'
        self.cohort_id = cohort.id
        self.cohort = cohort
        self.lst_batch = None
        self.guest_emails = []
        self.portal_join_logs = []
        self.class_date = timezone.now().date()
        self.start_time = datetime.time(10, 0)
        self.end_time = datetime.time(11, 0)
        self.class_status = "COMPLETED"
        self.historical_attendance_data = None
        self.meeting_link = "https://meet.google.com/abc-defg-hij"

class TestRealMeetAttendanceResolution(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='test@example.com', password='password', first_name='Paidipilli', last_name='Purushotham')
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.user)
        self.course = Course.objects.create(name='Test Course', code='VLSI')
        self.cohort = Cohort.objects.create(
            name='Test Cohort', 
            status='ACTIVE',
            code='G2-26',
            course=self.course,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + datetime.timedelta(days=30)
        )
        self.application = Application.objects.create(
            student=self.student_profile,
            assigned_cohort=self.cohort,
            course=self.course,
            status='IN_PROGRESS',
            required_meet_display_name="Legacy Required Meet Name"
        )
        
        self.google_identity = GoogleStudentIdentity.objects.create(
            student=self.student_profile,
            google_subject_id="sub123",
            google_email=self.user.email,
            google_profile_name="P Purushotham - G2-26 VLSI",
            is_verified=True
        )

        self.session = MockSession(self.cohort)

    def _setup_mock_meet_service(self, participants_data, directory_email=None):
        mock_creds = MagicMock()
        patcher_creds = patch('attendance.services.real_meet_attendance_service.RealMeetAttendanceService.get_credentials', return_value=mock_creds)
        patcher_build = patch('attendance.services.real_meet_attendance_service.build')

        self.addCleanup(patcher_creds.stop)
        self.addCleanup(patcher_build.stop)

        mock_get_creds = patcher_creds.start()
        mock_build = patcher_build.start()

        mock_meet = MagicMock()
        actual_class_start = timezone.make_aware(datetime.datetime.combine(self.session.class_date, self.session.start_time))
        actual_class_end = timezone.make_aware(datetime.datetime.combine(self.session.class_date, self.session.end_time))

        start_iso = actual_class_start.isoformat().replace("+00:00", "Z")
        end_iso = actual_class_end.isoformat().replace("+00:00", "Z")

        mock_conf = MagicMock()
        mock_conf.list().execute.return_value = {
            'conferenceRecords': [{'name': 'conferences/123', 'startTime': start_iso, 'endTime': end_iso}]
        }
        mock_meet.conferenceRecords.return_value = mock_conf

        mock_part = MagicMock()
        mock_part.list().execute.return_value = {'participants': participants_data}
        mock_conf.participants.return_value = mock_part

        mock_part_sess = MagicMock()
        mock_part_sess.list().execute.return_value = {
            'participantSessions': [{'startTime': start_iso, 'endTime': end_iso}]
        }
        mock_part.participantSessions.return_value = mock_part_sess

        mock_admin = MagicMock()
        mock_admin.users().get().execute.return_value = {'primaryEmail': directory_email} if directory_email else {}

        def build_side_effect(serviceName, version, credentials=None):
            if serviceName == 'meet': return mock_meet
            if serviceName == 'admin': return mock_admin
        mock_build.side_effect = build_side_effect

        # Patch PriorPermission.objects.filter to return an empty queryset to avoid UUID errors with MockSession
        patcher_prior = patch('attendance.models.PriorPermission.objects.filter')
        self.addCleanup(patcher_prior.stop)
        mock_prior = patcher_prior.start()
        mock_prior.return_value.select_related.return_value = []

    def test_resolution_with_google_identity(self):
        # 5. Google email match exists and profile name is different (GOOGLE_IDENTITY wins)
        participants = [{
            'name': 'participants/456',
            'signedinUser': {'displayName': 'Different Profile Name', 'user': 'users/123'}
        }]
        self._setup_mock_meet_service(participants, directory_email=self.user.email)

        self.google_identity.google_profile_name = "Different Name"
        self.google_identity.save()

        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        expected = result['expected_students'][str(self.student_profile.id)]
        self.assertEqual(expected['status'], 'PRESENT')
        self.assertEqual(expected['match_method'], 'GOOGLE_IDENTITY')
        self.assertFalse(expected['naming_compliant']) # DB google_profile_name is non-compliant

    def test_resolution_with_google_profile_name(self):
        # 1. Connected Google Profile Name exactly matches Meet displayName
        # 2. Meet participant has no email but exact Google Profile Name match exists
        participants = [{
            'name': 'participants/456',
            'anonymousUser': {'displayName': 'P Purushotham - G2-26 VLSI'}
        }]
        self._setup_mock_meet_service(participants, directory_email=None) # No email
        
        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        expected = result['expected_students'][str(self.student_profile.id)]
        self.assertEqual(expected['status'], 'PRESENT')
        self.assertEqual(expected['match_method'], 'GOOGLE_PROFILE_NAME')
        self.assertTrue(expected['naming_compliant'])

    def test_resolution_google_profile_name_mismatch(self):
        # 3. Google Profile Name does not match Meet displayName -> fallback
        # 9. Existing REQUIRED_MEET_NAME matching must continue to work exactly as before.
        participants = [{
            'name': 'participants/456',
            'anonymousUser': {'displayName': 'Legacy Required Meet Name'}
        }]
        self._setup_mock_meet_service(participants, directory_email=None)

        self.google_identity.google_profile_name = "Another Bad Name"
        self.google_identity.save()

        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        expected = result['expected_students'][str(self.student_profile.id)]
        self.assertEqual(expected['status'], 'PRESENT')
        self.assertEqual(expected['match_method'], 'REQUIRED_MEET_NAME')
        self.assertFalse(expected['naming_compliant']) # DB google_profile_name is non-compliant

    def test_resolution_google_profile_name_ambiguous(self):
        # 4. Two students have the same normalized Google Profile Name
        user2 = User.objects.create_user(email='test2@example.com', password='password', first_name='Other', last_name='Student')
        student_profile2, _ = StudentProfile.objects.get_or_create(user=user2)
        Application.objects.create(
            student=student_profile2, assigned_cohort=self.cohort, course=self.course, status='IN_PROGRESS', required_meet_display_name="Other"
        )
        GoogleStudentIdentity.objects.create(
            student=student_profile2, google_subject_id="sub456", google_email=user2.email, google_profile_name="P Purushotham - G2-26 VLSI", is_verified=True
        )

        participants = [{
            'name': 'participants/456',
            'anonymousUser': {'displayName': 'P Purushotham - G2-26 VLSI'}
        }]
        self._setup_mock_meet_service(participants, directory_email=None)

        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        expected1 = result['expected_students'][str(self.student_profile.id)]
        expected2 = result['expected_students'][str(student_profile2.id)]

        # Identity review required because it matched multiple students on profile name
        self.assertEqual(expected1['status'], 'IDENTITY_REVIEW_REQUIRED')
        self.assertEqual(expected2['status'], 'IDENTITY_REVIEW_REQUIRED')

    def test_required_name_stale_but_google_profile_name_matches(self):
        # 6. Required Meet Name is stale/wrong but Google Profile Name exactly matches the Meet participant.
        self.application.required_meet_display_name = "Stale Old Name"
        self.application.required_meet_display_name_normalized = "staleoldname"
        self.application.save()

        participants = [{
            'name': 'participants/456',
            'anonymousUser': {'displayName': 'P Purushotham - G2-26 VLSI'}
        }]
        self._setup_mock_meet_service(participants, directory_email=None)

        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        expected = result['expected_students'][str(self.student_profile.id)]
        self.assertEqual(expected['status'], 'PRESENT')
        self.assertEqual(expected['match_method'], 'GOOGLE_PROFILE_NAME')
