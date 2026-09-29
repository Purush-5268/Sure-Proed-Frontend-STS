from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from accounts.models import User
from applications.models import Application
from courses.models import Course
from cohorts.models import Cohort
from exams.models import ModuleTest, ModuleTestSubmission
from exams.tasks import enforce_missed_module_tests


class MissedModuleReviewTests(TestCase):
    def test_missed_test_is_idempotent_and_preserves_access(self):
        user = User.objects.create_user(email='missed-review@example.com', role='STUDENT')
        course = Course.objects.create(code='REVIEW', name='Review')
        cohort = Cohort.objects.create(code='REVIEW-1', course=course, start_date=timezone.localdate(), end_date=timezone.localdate())
        app = Application.objects.create(student=user.student_profile, course=course,
            assigned_cohort=cohort, status='TRAINING')
        Application.objects.filter(pk=app.pk).update(applied_at=timezone.now()-timedelta(days=3))
        test = ModuleTest.objects.create(title='Ended test', course=course, cohort=cohort,
            end_time=timezone.now()-timedelta(days=1), is_active=True, is_released=True)
        self.assertEqual(enforce_missed_module_tests()['enforced_missed_tests'], 1)
        self.assertEqual(enforce_missed_module_tests()['enforced_missed_tests'], 0)
        app.refresh_from_db()
        self.assertEqual(app.status, 'TRAINING')
        self.assertEqual(app.assigned_cohort_id, cohort.pk)
        self.assertEqual(ModuleTestSubmission.objects.get(test=test).status, 'MISSED')

    def test_new_student_is_not_penalized_for_an_old_test(self):
        user = User.objects.create_user(email='new-review@example.com', role='STUDENT')
        course = Course.objects.create(code='NEW-REVIEW', name='Review')
        cohort = Cohort.objects.create(code='REVIEW-2', course=course, start_date=timezone.localdate(), end_date=timezone.localdate())
        Application.objects.create(student=user.student_profile, course=course,
            assigned_cohort=cohort, status='TRAINING')
        ModuleTest.objects.create(title='Old test', course=course, cohort=cohort,
            end_time=timezone.now()-timedelta(days=1), is_active=True, is_released=True)
        self.assertEqual(enforce_missed_module_tests()['enforced_missed_tests'], 0)
        self.assertFalse(ModuleTestSubmission.objects.exists())
