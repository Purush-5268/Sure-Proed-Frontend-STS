from datetime import time
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from common import test_volunteer_workspace_permissions as fixtures
from common.models import Notification
from attendance.models import RecurringSchedule
from attendance.services.prior_permission_scope import validate_prior_permissions
from attendance.services.attendee_resolver import AttendeeResolver
from attendance.tasks import send_lst_generation_reminder_task


class CombinedScopeTests(TestCase):
    setUp = fixtures.VolunteerWorkspacePermissionTests.setUp

    def test_combined_batches_preserve_global_and_student_scope(self):
        self.cohort.lst_batch='BATCH_1'; self.cohort.save()
        self.other_cohort.lst_batch='BATCH_3'; self.other_cohort.save()
        self.application.status='TRAINING'; self.application.save()
        self.other_application.status='TRAINING'; self.other_application.save()
        payload=[{'student_id':str(self.student.pk)}]
        self.assertEqual(validate_prior_permissions(payload,self.admin,None,'LST','COMBINED')[0][0].pk,self.student.pk)
        with self.assertRaises(PermissionDenied):
            validate_prior_permissions(payload,self.volunteer,None,'LST','COMBINED')
        with self.assertRaises(PermissionDenied):
            validate_prior_permissions([{'student_id':str(self.other_student_user.student_profile.pk)}],self.admin,None,'LST','COMBINED')
        emails=AttendeeResolver.resolve_emails_by_criteria(class_type='LST',lst_batch='COMBINED')
        self.assertIn(self.student_user.email,emails)
        self.assertNotIn(self.other_student_user.email,emails)

    def test_final_reminder_updates_existing_notification(self):
        RecurringSchedule.objects.create(class_type='LST',lst_batch='BATCH_1',start_time=time(12),end_time=time(13),next_run=timezone.now())
        send_lst_generation_reminder_task(False)
        first=Notification.objects.get(user=self.admin)
        send_lst_generation_reminder_task(True)
        latest=Notification.objects.get(user=self.admin)
        self.assertEqual(first.pk,latest.pk)
        self.assertNotEqual(first.message,latest.message)
