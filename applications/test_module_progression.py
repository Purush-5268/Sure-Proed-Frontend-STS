from decimal import Decimal
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase
from django.utils import timezone

from accounts.models import User
from applications.admin import ApplicationAdmin
from applications.models import Application
from cohorts.models import Cohort
from courses.models import Course, CourseModule
from exams.models import ModuleTest, ModuleTestSubmission
from students.models import StudentProfile


class ModuleProgressionTests(TestCase):
    def setUp(self):
        self.site = AdminSite()
        self.admin = ApplicationAdmin(Application, self.site)
        self.rf = RequestFactory()

        self.user = User.objects.create_user(
            email="mod_student@example.com",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        self.student = getattr(self.user, "student_profile", None) or StudentProfile.objects.get(user=self.user)

        self.course = Course.objects.create(
            name="VLSI Designing",
            code="VLSI-PROG",
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
        self.module3 = CourseModule.objects.create(
            course=self.course,
            module_number=3,
            title="FPGA Prototyping",
            order=3,
        )

        today = timezone.now().date()
        self.cohort = Cohort.objects.create(
            name="G2-26 - VLSI-PROG",
            code="G2-26-PROG",
            course=self.course,
            start_date=today,
            end_date=today + timezone.timedelta(days=90),
            current_module=self.module1,
        )
        self.application = Application.objects.create(
            application_number="APP-PROG-001",
            student=self.student,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.TRAINING,
        )

        self.module1_test = ModuleTest.objects.create(
            title="CMOS Basics Test",
            course=self.course,
            cohort=self.cohort,
            module=self.module1,
            pass_percentage=Decimal("60.00"),
            total_questions=10,
        )

    def test_cohort_get_next_module(self):
        # Current is module1 -> next should be module2
        self.cohort.current_module = self.module1
        self.assertEqual(self.cohort.get_next_module(), self.module2)

        # Current is module2 -> next should be module3
        self.cohort.current_module = self.module2
        self.assertEqual(self.cohort.get_next_module(), self.module3)

        # Current is module3 (last module) -> next should be None
        self.cohort.current_module = self.module3
        self.assertIsNone(self.cohort.get_next_module())

        # Current is None -> next should be module1 (first module)
        self.cohort.current_module = None
        self.assertEqual(self.cohort.get_next_module(), self.module1)

    def test_cohort_advance_to_next_module(self):
        # Start at module1
        self.cohort.current_module = self.module1
        self.cohort.save()

        # Advance once -> module2
        advanced = self.cohort.advance_to_next_module()
        self.assertEqual(advanced, self.module2)
        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.current_module, self.module2)

        # Advance again -> module3
        advanced2 = self.cohort.advance_to_next_module()
        self.assertEqual(advanced2, self.module3)
        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.current_module, self.module3)

        # Advance past final module -> None
        advanced_final = self.cohort.advance_to_next_module()
        self.assertIsNone(advanced_final)
        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.current_module, self.module3)

    def test_auto_progression_when_module_test_qualified(self):
        # Cohort starts at module1
        self.cohort.current_module = self.module1
        self.cohort.save()

        # Student takes module1 test and passes
        submission = ModuleTestSubmission.objects.create(
            test=self.module1_test,
            student=self.student,
            cohort=self.cohort,
            marks_obtained=Decimal("80.00"),
            total_marks=Decimal("100.00"),
        )
        # Verify submission qualified
        self.assertTrue(submission.qualified)

        # Verify cohort automatically advanced to module2
        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.current_module, self.module2)

        # Application current_module property also updates
        self.application.refresh_from_db()
        self.assertEqual(self.application.current_module, self.module2)

        # If another student takes the same test and passes, cohort should not overshoot
        user2 = User.objects.create_user(
            email="mod_student2@example.com",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        student2 = getattr(user2, "student_profile", None) or StudentProfile.objects.get(user=user2)
        ModuleTestSubmission.objects.create(
            test=self.module1_test,
            student=student2,
            cohort=self.cohort,
            marks_obtained=Decimal("90.00"),
            total_marks=Decimal("100.00"),
        )
        self.cohort.refresh_from_db()
        # Stays at module2!
        self.assertEqual(self.cohort.current_module, self.module2)

    def test_application_admin_advance_module_view(self):
        admin_user = User.objects.create_superuser(
            email="admin_prog@example.com",
            password="SecurePassword123!",
            role=User.Role.ADMIN,
        )
        request = self.rf.post(f"/secure-admin/applications/application/{self.application.pk}/advance-module-admin/")
        request.user = admin_user
        from django.contrib.messages.storage.fallback import FallbackStorage
        setattr(request, "session", {})
        messages_storage = FallbackStorage(request)
        setattr(request, "_messages", messages_storage)

        self.cohort.current_module = self.module1
        self.cohort.save()

        response = self.admin.advance_module_admin_view(request, str(self.application.pk))
        self.assertEqual(response.status_code, 302)

        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.current_module, self.module2)
