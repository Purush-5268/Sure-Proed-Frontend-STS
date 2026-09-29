from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase

from accounts.models import User
from applications.admin import ApplicationAdmin
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from students.models import StudentProfile


class ApplicationCurrentModuleAdminTests(TestCase):
    def setUp(self):
        self.site = AdminSite()
        self.admin = ApplicationAdmin(Application, self.site)
        self.rf = RequestFactory()

        self.user = User.objects.create_user(
            email="stu_mod@example.com",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        self.student = getattr(self.user, "student_profile", None) or StudentProfile.objects.get(user=self.user)
        self.course = Course.objects.create(
            name="VLSI Designing",
            code="VLSI-DESIGN",
        )
        self.module1 = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            title="CMOS Basics",
            order=1,
        )
        self.module2 = CourseModule.objects.create(
            course=self.course,
            module_number=2,
            title="Verilog HDL",
            order=2,
        )
        from django.utils import timezone
        today = timezone.now().date()
        self.cohort = Cohort.objects.create(
            name="G2-26 - VLSI-DESIGN",
            code="G2-26",
            course=self.course,
            start_date=today,
            end_date=today + timezone.timedelta(days=90),
            current_module=self.module1,
        )
        self.application = Application.objects.create(
            application_number="APP-MOD-001",
            student=self.student,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.TRAINING,
        )

    def test_application_current_module_property(self):
        # With cohort having module1
        self.assertEqual(self.application.current_module, self.module1)

        # Update cohort current module to module2
        self.cohort.current_module = self.module2
        self.cohort.save()
        self.application.refresh_from_db()
        self.assertEqual(self.application.current_module, self.module2)

        # Cohort without current module
        self.cohort.current_module = None
        self.cohort.save()
        self.application.refresh_from_db()
        self.assertIsNone(self.application.current_module)

        # Application without assigned cohort
        self.application.assigned_cohort = None
        self.assertIsNone(self.application.current_module)

    def test_admin_current_module_display(self):
        # 1. With current_module set
        html = self.admin.current_module(self.application)
        self.assertIn("Module 1: CMOS Basics", html)
        self.assertIn(str(self.module1.id), html)

        # 2. When cohort has no current module set
        self.cohort.current_module = None
        self.cohort.save()
        self.application.refresh_from_db()
        html = self.admin.current_module(self.application)
        self.assertIn("Not set", html)
        self.assertIn("2 available in course", html)

        # 3. When no cohort is assigned
        self.application.assigned_cohort = None
        html = self.admin.current_module(self.application)
        self.assertIn("No cohort assigned", html)

    def test_cohort_management_actions_includes_module_info(self):
        html = self.admin.cohort_management_actions(self.application)
        self.assertIn("Current Module:", html)
        self.assertIn("Module 1: CMOS Basics", html)
