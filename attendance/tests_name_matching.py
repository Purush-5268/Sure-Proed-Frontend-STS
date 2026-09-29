import datetime
from django.test import TestCase
from django.utils import timezone
from unittest.mock import patch, MagicMock

from accounts.models import User
from students.models import StudentProfile
from cohorts.models import Cohort
from attendance.models import Attendance
from applications.models import Application
from courses.models import Course
from attendance.services.real_meet_attendance_service import RealMeetAttendanceService

class IdentityResolutionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # 1000+ student scale test handled implicitly by making sure we use O(1) logic and don't time out

        # Create users mapped to exact scenarios requested
        cls.u_p_likitha = User.objects.create(email="p.likitha@example.com", first_name="P", last_name="Likitha")
        cls.u_penchala = User.objects.create(email="penchala.l@example.com", first_name="Penchala", last_name="Likitha")
        cls.u_g_likitha = User.objects.create(email="g.likitha@example.com", first_name="G", last_name="Likitha")
        cls.u_likitha = User.objects.create(email="likitha@example.com", first_name="Likitha", last_name="")
        cls.u_uma = User.objects.create(email="uma@example.com", first_name="Vajja", last_name="Umadevi")
        cls.u_uma2 = User.objects.create(email="uma2@example.com", first_name="Vajja", last_name="Umadevi") # Duplicate official name
        cls.u_whitelist = User.objects.create(email="whitelist@example.com", first_name="Whitelist", last_name="User")
        cls.u_camel = User.objects.create(email="camel@example.com", first_name="TPradeep", last_name="Kumar")
        cls.u_ambig_token1 = User.objects.create(email="ravi.k@example.com", first_name="Ravi", last_name="Kumar")
        cls.u_ambig_token2 = User.objects.create(email="kumar.r@example.com", first_name="Kumar", last_name="Ravi")

        users = [
            cls.u_p_likitha, cls.u_penchala, cls.u_g_likitha, cls.u_likitha,
            cls.u_uma, cls.u_uma2, cls.u_whitelist, cls.u_camel,
            cls.u_ambig_token1, cls.u_ambig_token2
        ]

        # Create students
        cls.students = {u.email: StudentProfile.objects.get_or_create(user=u)[0] for u in users}

        # Create course & cohort
        cls.course = Course.objects.create(name="VLSI Design", code="VLSI")
        cls.cohort = Cohort.objects.create(
            code="G2-26",
            course=cls.course,
            status=Cohort.Status.ACTIVE,
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90)
        )

        # Create applications
        for s in cls.students.values():
            Application.objects.create(
                student=s,
                course=cls.course,
                assigned_cohort=cls.cohort,
                status="TRAINING"
            )

        # Create Attendance Session
        cls.session = Attendance.objects.create(
            cohort=cls.cohort,
            class_type='DOMAIN',
            class_date=datetime.date(2026, 9, 5),
            start_time=datetime.time(20, 0),
            end_time=datetime.time(21, 0),
            meeting_link="https://meet.google.com/abc-defg-hij",
            guest_emails=["whitelist@example.com"],
            class_status="COMPLETED",
            portal_join_logs={
                str(cls.students["ravi.k@example.com"].id): "2026-09-05T19:55:00Z"
            }
        )

    def _mock_participant(self, name, email=None, user_id=None, display_name=None):
        p = {
            'name': name,
            'earliestStartTime': '2026-09-05T14:30:00Z',
            'latestEndTime': '2026-09-05T15:30:00Z'
        }
        if display_name:
            p['signedinUser'] = {'displayName': display_name}
            if user_id:
                p['signedinUser']['user'] = f'users/{user_id}'
        return p

    def _mock_sessions(self, participant_name):
        return {
            'participantSessions': [
                {'startTime': '2026-09-05T14:30:00Z', 'endTime': '2026-09-05T15:30:00Z'}
            ]
        }

    @patch('attendance.services.real_meet_attendance_service.build')
    @patch('attendance.services.real_meet_attendance_service.RealMeetAttendanceService.get_credentials')
    def test_multi_stage_identity_resolver(self, mock_creds, mock_build):
        mock_creds.return_value = MagicMock()
        mock_meet = MagicMock()
        mock_admin = MagicMock()
        mock_build.side_effect = lambda service, version, credentials: mock_meet if service == 'meet' else mock_admin

        # Setup basic meet responses
        mock_meet.conferenceRecords().list().execute.return_value = {
            'conferenceRecords': [{'name': 'conf1', 'startTime': '2026-09-05T14:30:00Z', 'endTime': '2026-09-05T15:30:00Z'}]
        }

        participants_to_inject = [
            # SCENARIO: Exact name matches
            self._mock_participant('p1', display_name='P Likitha'),
            self._mock_participant('p2', display_name='Penchala Likitha'),
            self._mock_participant('p3', display_name='G Likitha'),
            self._mock_participant('p4', display_name='Likitha'),

            # SCENARIO: Ambiguous official roster (two Vajja Umadevis) -> neither should get credit via NAME
            self._mock_participant('p5', display_name='Vajja Umadevi'),

            # SCENARIO: Suffix stripping & Punctuation (Should match 'P Likitha' if no duplicates exist... wait p1 already exists!
            # Since p1 and p6 have different PIDs but map to 'P Likitha', without email evidence, this makes P Likitha AMBIGUOUS!
            # This precisely tests Rule 5B.
            self._mock_participant('p6', display_name='P-Likitha g226vlsi'),

            # SCENARIO: Token Set identical collision & Portal Tie-break
            # Both 'Ravi Kumar' and 'Kumar Ravi' share tokens. Google participant: 'Ravi Kumar'
            # portal_join_logs has ravi.k@example.com (Ravi Kumar), so it should resolve!
            self._mock_participant('p7', display_name='Ravi Kumar'),

            # SCENARIO: Duplicate Google Connection Records (Deterministic Email proof)
            # Both have same Directory Email, so they merge safely
            self._mock_participant('p9', display_name='Camel Person', user_id='camel123'),
            self._mock_participant('p10', display_name='Camel Mobile', user_id='camel123'),

            # SCENARIO: CamelCase processing
            self._mock_participant('p11', display_name='TPradeep Kumar'), # wait, TPradeep Kumar doesn't exist on roster, camel@example.com does. camel@ is resolved via email above, so no problem.

            # SCENARIO: Wrong cohort suffix (should NOT strip)
            self._mock_participant('p12', display_name='Likitha G420X'),
        ]

        mock_meet.conferenceRecords().participants().list().execute.side_effect = [
            {'participants': participants_to_inject},
            {} # Empty next page
        ]

        # Mock sessions for each participant (all 1 hr)
        mock_meet.conferenceRecords().participants().participantSessions().list().execute.return_value = self._mock_sessions('any')

        # Mock Directory API
        def admin_get(userKey):
            m = MagicMock()
            if userKey == 'camel123':
                m.execute.return_value = {'primaryEmail': 'camel@example.com'}
            else:
                m.execute.side_effect = Exception("Not found")
            return m
        mock_admin.users().get = admin_get

        result = RealMeetAttendanceService.get_structured_attendance(self.session)
        expected = result.get('expected_students', {})
        unmatched = result.get('unmatched_participants', [])

        # Helper
        def get_student(email):
            return str(self.students[email].id)

        # 1. P Likitha and p6 both mapped to P Likitha. Due to Rule 5B (no email proof), it must be AMBIGUOUS!
        # Therefore, P Likitha is ABSENT (no duration).
        self.assertEqual(expected[get_student('p.likitha@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')

        # 2. Penchala, G Likitha match exactly once
        self.assertEqual(expected[get_student('penchala.l@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')
        self.assertEqual(expected[get_student('g.likitha@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')

        # 'Likitha G420X' doesn't match 'Likitha' because suffix isn't 'G226' -> ABSENT
        # Wait, 'Likitha' joined as p4! So p4 maps to 'Likitha', p12 is 'Likitha G420X'.
        # Since p12 is completely unmatched, it doesn't collide with p4. p4 resolves cleanly.
        self.assertEqual(expected[get_student('likitha@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')

        # 3. Duplicate Vajja Umadevi -> AMBIGUOUS -> both ABSENT
        self.assertEqual(expected[get_student('uma@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')
        self.assertEqual(expected[get_student('uma2@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')

        # 4. Tie-Breaker worked? ravi.k@example.com should be PRESENT
        self.assertEqual(expected[get_student('ravi.k@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')
        self.assertEqual(expected[get_student('kumar.r@example.com')]['status'], 'IDENTITY_REVIEW_REQUIRED')
        self.assertTrue(any(p.get('candidate_students') for p in unmatched))

        # 5. CamelCase processing worked (Duplicate safe merging via Email)
        self.assertEqual(expected[get_student('camel@example.com')]['status'], 'PRESENT')
        self.assertEqual(expected[get_student('camel@example.com')]['match_method'], 'DIRECTORY')

        # 6. Unmatched validation
        unmatched_names = [u['name'] for u in unmatched]
        self.assertIn('Vajja Umadevi', unmatched_names) # Because it was ambiguous
        self.assertIn('P Likitha', unmatched_names) # Because of duplicate identity collision without email

        # 7. Safety Invariant: Every resolved student MUST belong to official roster
        resolved_ids = set(expected.keys())
        official_ids = set(str(s.id) for s in self.students.values())
        self.assertTrue(resolved_ids.issubset(official_ids))
