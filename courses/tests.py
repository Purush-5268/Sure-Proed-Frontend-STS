from django.test import TestCase
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import User
from cohorts.models import Cohort
from courses.models import Course, CourseModule


class CourseModuleAdminTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="course-admin@example.com",
            password="admin-pass-123",
        )
        device = TOTPDevice.objects.create(user=self.admin_user, name="tests", confirmed=True)
        self.client.force_login(self.admin_user)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()

    def test_course_create_page_does_not_have_screening_datetime(self):
        response = self.client.get("/secure-admin/courses/course/add/")

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'name="default_screening_at_0"')
        self.assertNotContains(response, 'name="requires_interview"')

    def test_cohort_create_page_has_default_screening_datetime_and_interview(self):
        response = self.client.get("/secure-admin/cohorts/cohort/add/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="default_screening_at_0"')
        self.assertContains(response, 'name="requires_interview"')
        self.assertContains(response, "Default pre-screen exam date and time")

    def test_course_module_changelist_renders_without_server_error(self):
        course = Course.objects.create(
            code="ADMIN-MODULE-101",
            name="Admin Module Test",
            domain="Testing",
            description="Verify the Course Module admin page.",
            created_by=self.admin_user,
        )
        CourseModule.objects.create(
            course=course,
            module_number=1,
            order=1,
            title="Foundation",
        )
        response = self.client.get("/secure-admin/courses/coursemodule/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Foundation")

    def test_cohort_code_is_unique_per_course_not_globally(self):
        first = Course.objects.create(
            code="BATCH-A",
            name="Batch Course A",
            domain="Testing",
            description="First course",
            created_by=self.admin_user,
        )
        second = Course.objects.create(
            code="BATCH-B",
            name="Batch Course B",
            domain="Testing",
            description="Second course",
            created_by=self.admin_user,
        )

        Cohort.objects.create(
            course=first,
            code="G1-26",
            start_date="2026-08-01",
            end_date="2026-11-01",
        )
        Cohort.objects.create(
            course=second,
            code="G1-26",
            start_date="2026-08-01",
            end_date="2026-11-01",
        )

        self.assertEqual(Cohort.objects.filter(code="G1-26").count(), 2)

    def test_course_edit_page_does_not_resubmit_cohort_rows(self):
        course = Course.objects.create(
            code="EDIT-PREREQ",
            name="Edit Prerequisites",
            domain="Testing",
            description="Course prerequisite editing",
            created_by=self.admin_user,
        )
        Cohort.objects.create(
            course=course,
            code="G1-26",
            status=Cohort.Status.TRAINING,
            start_date="2026-08-01",
            end_date="2026-11-01",
        )

        response = self.client.get(f"/secure-admin/courses/course/{course.pk}/change/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Manage 1 cohort(s)")
        self.assertNotContains(response, "cohorts-TOTAL_FORMS")

    def test_unauthenticated_user_can_list_published_courses(self):
        from rest_framework.test import APIClient
        client = APIClient()
        Course.objects.create(
            code="PUB-COURSE-101",
            name="Public Course",
            domain="Computer Science",
            description="Open for everyone to view",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )

        response = client.get("/api/courses/")
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        codes = [c["code"] for c in results]
        self.assertIn("PUB-COURSE-101", codes)

    def test_unauthenticated_user_cannot_create_courses(self):
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.post("/api/courses/", {"code": "HACK-202"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_has_open_cohort_visibility_rules(self):
        from courses.serializers import CourseSerializer
        course = Course.objects.create(
            code="VIS-CRS-1",
            name="Visibility Test Course",
            domain="Testing",
            description="Testing visibility rules",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )

        # 1. No cohorts -> has_open_cohort should be False
        self.assertFalse(CourseSerializer(course).data["has_open_cohort"])

        # 2. Draft cohort -> has_open_cohort must be False
        draft_cohort = Cohort.objects.create(
            course=course,
            code="VIS-DRAFT",
            status=Cohort.Status.DRAFT,
            start_date="2026-09-01",
            end_date="2026-12-01",
        )
        self.assertFalse(CourseSerializer(course).data["has_open_cohort"])

        # 3. Training / Soft Skills / Internship cohort -> has_open_cohort must be False
        draft_cohort.status = Cohort.Status.TRAINING
        draft_cohort.save()
        self.assertFalse(CourseSerializer(course).data["has_open_cohort"])

        draft_cohort.status = Cohort.Status.SOFT_SKILLS
        draft_cohort.save()
        self.assertFalse(CourseSerializer(course).data["has_open_cohort"])

        draft_cohort.status = Cohort.Status.INTERNSHIP
        draft_cohort.save()
        self.assertFalse(CourseSerializer(course).data["has_open_cohort"])

        # 4. Open cohort -> has_open_cohort must be True
        draft_cohort.status = Cohort.Status.OPEN
        draft_cohort.save()
        self.assertTrue(CourseSerializer(course).data["has_open_cohort"])

    def test_course_cancellation_cascades_to_cohorts_and_applications(self):
        from applications.models import Application
        from students.models import StudentProfile

        course = Course.objects.create(
            code="CANC-CRS-1",
            name="Cancellation Test Course",
            domain="Testing",
            description="Testing cancellation cascade",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )
        cohort = Cohort.objects.create(
            course=course,
            code="CANC-COH-1",
            status=Cohort.Status.OPEN,
            start_date="2026-09-01",
            end_date="2026-12-01",
        )
        student_user = User.objects.create_user(
            email="canc-student@example.com",
            password="testpass123",
            role=User.Role.STUDENT,
        )
        student_profile, _ = StudentProfile.objects.get_or_create(
            user=student_user,
            defaults={"student_code": "STU-CANC01"}
        )
        app = Application.objects.create(
            student=student_profile,
            course=course,
            assigned_cohort=cohort,
            status=Application.Status.COHORT_ASSIGNED,
            application_number="APP-CANC-001",
            role_verification_status=Application.RoleVerificationStatus.VERIFIED,
            qualified=True,
        )

        # Trigger Course cancellation
        course.status = Course.Status.CANCELLED
        course.save()

        cohort.refresh_from_db()
        app.refresh_from_db()

        self.assertEqual(cohort.status, Cohort.Status.CANCELLED)
        self.assertEqual(app.status, Application.Status.CANCELLED)

    def test_cohort_creation_blocked_for_non_published_courses(self):
        from django.core.exceptions import ValidationError
        from cohorts.serializers import CohortSerializer

        draft_course = Course.objects.create(
            code="DRAFT-CRS-1",
            name="Draft Course",
            domain="Testing",
            description="Draft",
            status=Course.Status.DRAFT,
            created_by=self.admin_user,
        )

        # Model clean should fail
        cohort = Cohort(
            course=draft_course,
            code="TEST-DRAFT-COH",
            start_date="2026-09-01",
            end_date="2026-12-01",
        )
        with self.assertRaises(ValidationError):
            cohort.clean()

        # Serializer validation should fail
        ser = CohortSerializer(data={
            "course": str(draft_course.id),
            "code": "SER-DRAFT-COH",
            "start_date": "2026-09-01",
            "end_date": "2026-12-01",
        })
        self.assertFalse(ser.is_valid())
        self.assertIn("course", ser.errors)

