from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from rest_framework.test import APIClient
from accounts.models import User
from applications.models import Application, ApplicationStatusAudit
from attendance.models import Attendance
from attendance.services.student_scope import student_attendance_queryset, attendance_metrics
from cohorts.models import Cohort
from courses.models import Course
from exams.models import Exam


class StudentAttendanceIsolationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(email='new-student@example.com', password='Test123!abc', role='STUDENT')
        self.student = self.user.student_profile
        self.course = Course.objects.create(code='ISOLATION', name='Isolation', domain='Technology', status='PUBLISHED')
        self.cohort = Cohort.objects.create(code='G2-26', name='Existing cohort', course=self.course, status='TRAINING', start_date=timezone.localdate()-timedelta(days=90), end_date=timezone.localdate()+timedelta(days=90))
        self.client.force_authenticate(self.user)

    def enroll(self):
        return Application.objects.create(application_number='ISO-001', student=self.student, course=self.course, assigned_cohort=self.cohort, status='TRAINING', qualified=True, is_admin_assigned=True)

    def session(self, days=-1, **extra):
        fields=dict(title='Class', cohort=self.cohort, class_date=timezone.localdate()+timedelta(days=days), start_time=time(10), end_time=time(11), class_status='COMPLETED', conducted=True)
        fields.update(extra)
        return Attendance.objects.create(**fields)

    def test_new_student_sees_no_global_or_other_cohort_records(self):
        self.session()
        for kind,batch in [('CELEBRATION',None),('UNIVERSAL',None),('LST',None),('LST',''),('LST','GENERAL')]:
            self.session(class_type=kind, lst_batch=batch, cohort=None)
        response=self.client.get('/api/attendance/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['count'],0)
        stats=self.client.get('/api/students/statistics/').data
        self.assertIsNone(stats['active_cohort'])
        self.assertEqual(stats['module_grades'],[])
        self.assertFalse(stats['screening_qualified'])

    def test_admin_assignment_is_not_an_exam_result(self):
        self.enroll()
        stats=self.client.get('/api/students/statistics/').data
        self.assertIsNotNone(stats['active_cohort'])
        self.assertIsNone(stats['screening_marks_obtained'])
        self.assertFalse(stats['screening_qualified'])
        self.assertEqual(stats['attendance_percentage'],0)

    def test_historical_classes_do_not_become_absences_for_late_enrollment(self):
        app=self.enroll()
        self.session(days=-20)
        tomorrow=self.session(days=1,class_status='SCHEDULED')
        self.assertEqual(list(student_attendance_queryset(self.student)),[tomorrow])
        self.assertEqual(attendance_metrics(self.student,app)['total'],0)

    def test_imported_roster_retains_both_old_presence_and_absence(self):
        app=self.enroll()
        for pct in (100,0):
            self.session(days=-30,google_meet_attendance_data={'status':'READY','expected_students':{str(self.student.pk):{'attendance_percentage':pct}}})
        self.assertEqual(student_attendance_queryset(self.student).count(),2)
        self.assertEqual(attendance_metrics(self.student,app),{'total':2,'present':1,'percentage':50.0,'arithmetic_percentage':50.0})
        stats=self.client.get('/api/students/statistics/').data
        self.assertEqual(stats['attendance_percentage'],50.0)
        self.assertEqual(float(stats['journey']['metrics']['attendance_percentage']),50.0)

    def test_explicit_historical_attendee_is_preserved(self):
        app=self.enroll()
        old=self.session(days=-30)
        old.attendees.add(self.student)
        self.assertEqual(attendance_metrics(self.student,app)['percentage'],100)

    def test_future_cancelled_and_unpublished_sessions_are_not_absences(self):
        app=self.enroll()
        for days, state in [(1,'COMPLETED'),(-1,'CANCELLED'),(-1,'RESCHEDULED'),(-1,'SCHEDULED')]:
            session=self.session(days=days,class_status=state)
            session.attendees.add(self.student)
        self.assertEqual(attendance_metrics(self.student,app)['total'],0)

    def test_student_visibility_is_rechecked_after_enrollment_changes(self):
        app=self.enroll()
        self.session(days=1)
        self.assertEqual(self.client.get('/api/attendance/').data['count'],1)
        Application.objects.filter(pk=app.pk).update(status='DROPPED')
        self.assertEqual(self.client.get('/api/attendance/').data['count'],0)

    def test_other_students_roster_does_not_leak_history(self):
        self.enroll()
        self.session(days=-30,google_meet_attendance_data={'status':'READY','expected_students':{'another-student':{'attendance_percentage':100}}})
        self.assertEqual(student_attendance_queryset(self.student).count(),0)

    def test_published_zero_mark_exam_is_a_real_failed_result(self):
        app=self.enroll()
        Exam.objects.create(application=app,status='EVALUATED',marks_obtained=Decimal('0'),total_marks=100,percentage=Decimal('0'),qualified=False)
        stats=self.client.get('/api/students/statistics/').data
        self.assertEqual(float(stats['screening_marks_obtained']),0)
        self.assertFalse(stats['screening_qualified'])

    def test_unpublished_exam_does_not_expose_provisional_marks(self):
        app=self.enroll()
        Exam.objects.create(application=app,status='IN_PROGRESS',marks_obtained=90,total_marks=100,percentage=90,qualified=True)
        stats=self.client.get('/api/students/statistics/').data
        self.assertIsNone(stats['screening_marks_obtained'])
        self.assertIsNone(stats['screening_percentage'])
        self.assertFalse(stats['screening_qualified'])

    def test_missing_student_in_report_is_not_fabricated_as_absent(self):
        from attendance.serializers import AttendanceSerializer
        from rest_framework.test import APIRequestFactory
        self.enroll()
        session=self.session(google_meet_attendance_data={'status':'READY','expected_students':{}})
        request=APIRequestFactory().get('/')
        request.user=self.user
        data=AttendanceSerializer(session,context={'request':request}).data
        self.assertEqual(data['student_dashboard_data']['status'],'NOT_READY')

    def test_student_meeting_link_is_hidden_until_the_fifteen_minute_join_window(self):
        from attendance.serializers import AttendanceSerializer
        from rest_framework.test import APIRequestFactory

        self.enroll()
        session = self.session(
            days=0,
            class_status='SCHEDULED',
            conducted=False,
            start_time=time(10),
            end_time=time(11),
            meeting_link='https://meet.google.com/abc-defg-hij',
        )
        request = APIRequestFactory().get('/')
        request.user = self.user
        current_zone = timezone.get_current_timezone()

        with patch('attendance.serializers.timezone.now', return_value=timezone.make_aware(datetime.combine(session.class_date, time(9, 44, 59)), current_zone)):
            self.assertIsNone(AttendanceSerializer(session, context={'request': request}).data['meeting_link'])

        with patch('attendance.serializers.timezone.now', return_value=timezone.make_aware(datetime.combine(session.class_date, time(9, 45)), current_zone)):
            data = AttendanceSerializer(session, context={'request': request}).data
            self.assertEqual(data['meeting_link'], session.meeting_link)
            self.assertIsNone(data['calendar_event_id'])

    def test_portal_join_uses_the_same_fifteen_minute_boundary(self):
        self.enroll()
        session = self.session(
            # The enrollment is created by this test, so use a future class.
            # A same-day 10:00 fixture can legitimately predate enrollment on a
            # CI run executed after 10:00 and must remain hidden.
            days=1,
            class_status='SCHEDULED',
            conducted=False,
            start_time=time(10),
            end_time=time(11),
            meeting_link='https://meet.google.com/abc-defg-hij',
        )
        current_zone = timezone.get_current_timezone()
        before_window = timezone.make_aware(datetime.combine(session.class_date, time(9, 44, 59)), current_zone)
        with patch('attendance.views.timezone.now', return_value=before_window):
            self.assertEqual(self.client.post(f'/api/attendance/{session.pk}/portal-join/').status_code, 400)

        opens_at = timezone.make_aware(datetime.combine(session.class_date, time(9, 45)), current_zone)
        with patch('attendance.views.timezone.now', return_value=opens_at):
            self.assertEqual(self.client.post(f'/api/attendance/{session.pk}/portal-join/').status_code, 200)

    def test_ended_meet_still_counts_after_end_class_clears_conducted(self):
        app=self.enroll()
        for pct in (100,0):
            self.session(days=-1,conducted=False,google_meet_attendance_data={
                'status':'READY','expected_students':{str(self.student.pk):{'attendance_percentage':pct}}
            })
        self.assertEqual(attendance_metrics(self.student,app),{'total':2,'present':1,'percentage':50.0,'arithmetic_percentage':50.0})
        stats=self.client.get('/api/students/statistics/').data
        self.assertEqual(stats['attendance_percentage'],50.0)
        self.assertEqual(float(stats['journey']['metrics']['attendance_percentage']),50.0)
