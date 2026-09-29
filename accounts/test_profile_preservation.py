from django.test import TestCase

from accounts.models import User
from applications.models import Application
from courses.models import Course
from exams.models import Exam


class AcademicProfilePreservationTests(TestCase):
    def test_password_and_role_changes_preserve_existing_academic_history(self):
        user = User.objects.create_user(email="alumnus@example.com", role="STUDENT", password="Initial@Pass123!")
        profile = user.student_profile
        course = Course.objects.create(code="PRESERVE", name="Preserved course", domain="Technology")
        application = Application.objects.create(student=profile, course=course)
        exam = Exam.objects.create(application=application)
        user.role = "VOLUNTEER"
        user.save(update_fields=["role"])
        user.set_password("Changed@Pass987!")
        user.save(update_fields=["password"])
        self.assertTrue(type(profile).objects.filter(pk=profile.pk, user=user).exists())
        self.assertTrue(Application.objects.filter(pk=application.pk, student=profile).exists())
        self.assertTrue(Exam.objects.filter(pk=exam.pk, application=application).exists())

    def test_new_staff_account_does_not_create_a_student_profile(self):
        user = User.objects.create_user(email="staff-only@example.com", role="VOLUNTEER", password="Initial@Pass123!")
        self.assertFalse(hasattr(user, "student_profile"))
