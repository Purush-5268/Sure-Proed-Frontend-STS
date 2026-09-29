import uuid
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import User
from students.models import StudentProfile
from courses.models import Course
from cohorts.models import Cohort
from applications.models import Application, ApplicationStatusAudit

class OfferLetterTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_superuser(
            email="admin@test.com", password="admin", first_name="Admin"
        )

        # Student user
        self.student_user = User.objects.create_user(
            email="student@test.com", password="student", role=User.Role.STUDENT, first_name="Student"
        )
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.student_user)
        self.student_profile.student_code = "STU-001"
        self.student_profile.save()

        # Admin-created student (to test the rule that Admin-created students work too)
        self.admin_student_user = User.objects.create_user(
            email="admincreated@test.com", password="student", role=User.Role.STUDENT, first_name="AdminStudent"
        )
        self.admin_student_profile, _ = StudentProfile.objects.get_or_create(user=self.admin_student_user)
        self.admin_student_profile.student_code = "STU-002"
        self.admin_student_profile.save()

        # Course
        self.course = Course.objects.create(
            code="WEB101",
            name="Web Dev",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
            duration_weeks=12
        )

        # Cohorts
        self.start_date_eligible = timezone.now() - relativedelta(months=2)
        self.start_date_ineligible = timezone.now() - relativedelta(days=10)

        self.cohort_eligible = Cohort.objects.create(
            code="COH-E", name="Cohort E", course=self.course,
            start_date=self.start_date_eligible, end_date=self.start_date_eligible + relativedelta(months=3),
            status=Cohort.Status.ACTIVE, created_by=self.admin
        )

        self.cohort_ineligible = Cohort.objects.create(
            code="COH-I", name="Cohort I", course=self.course,
            start_date=self.start_date_ineligible, end_date=self.start_date_ineligible + relativedelta(months=3),
            status=Cohort.Status.ACTIVE, created_by=self.admin
        )

        # Applications
        self.app_eligible = Application.objects.create(
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort_eligible,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True
        )

        self.app_ineligible = Application.objects.create(
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort_ineligible,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True
        )

        self.app_admin_created = Application.objects.create(
            student=self.admin_student_profile,
            course=self.course,
            assigned_cohort=self.cohort_eligible,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True
        )

    def test_generate_offer_letter_success(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_eligible.pk})
        
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app_eligible.refresh_from_db()
        self.assertTrue(self.app_eligible.offer_letter_issued)
        self.assertIsNotNone(self.app_eligible.offer_letter_file)
        self.assertIsNotNone(self.app_eligible.offer_letter_hash)
        
    def test_generate_offer_letter_idempotency(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_eligible.pk})
        
        response1 = self.client.post(url)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        url1 = response1.json()["url"]
        
        # Second click
        response2 = self.client.post(url)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        url2 = response2.json()["url"]
        
        self.assertEqual(url1, url2)
        self.assertIn("Offer letter already generated", response2.json()["message"])

    def test_generate_offer_letter_ineligible_time(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_ineligible.pk})
        
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("one calendar month", response.json()["error"])

    def test_generate_offer_letter_suspended(self):
        self.app_eligible.status = Application.Status.SUSPENDED
        self.app_eligible.save()
        
        self.client.force_authenticate(user=self.admin)
        url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_eligible.pk})
        
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot generate", response.json()["error"])

    def test_generate_offer_letter_accepts_training_and_internship_statuses(self):
        self.client.force_authenticate(user=self.admin)
        for application_status in (
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
        ):
            user = User.objects.create_user(
                email=f"{application_status.lower()}@test.com",
                password="student",
                role=User.Role.STUDENT,
            )
            application = Application.objects.create(
                student=user.student_profile,
                course=self.course,
                assigned_cohort=self.cohort_eligible,
                status=application_status,
                qualified=True,
            )
            response = self.client.post(
                reverse("application-generate-offer-letter", kwargs={"pk": application.pk})
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_generate_offer_letter_audits_legacy_verified_cohort_repair(self):
        self.app_eligible.status = Application.Status.PRESCREENING_PENDING
        self.app_eligible.role_verification_status = Application.RoleVerificationStatus.VERIFIED
        self.app_eligible.save(update_fields=[
            "status", "role_verification_status", "updated_at",
        ])
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("application-generate-offer-letter", kwargs={"pk": self.app_eligible.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.app_eligible.refresh_from_db()
        self.assertEqual(self.app_eligible.status, Application.Status.COHORT_ASSIGNED)
        audit = ApplicationStatusAudit.objects.filter(
            application=self.app_eligible,
            to_status=Application.Status.COHORT_ASSIGNED,
        ).latest("created_at")
        self.assertTrue(audit.is_repair)
        self.assertEqual(audit.actor, self.admin)
        
    def test_verify_offer_letter_api_route(self):
        self.client.force_authenticate(user=self.admin)
        gen_url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_admin_created.pk})
        self.client.post(gen_url)
        
        self.app_admin_created.refresh_from_db()
        offer_hash = self.app_admin_created.offer_letter_hash
        
        # Public Verification via new exact route
        verify_url = reverse("verify_offer_letter_api", kwargs={"uuid": offer_hash})
        self.client.logout()
        
        response = self.client.get(verify_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["full_name"], "AdminStudent")
        self.assertEqual(data["uuid"], offer_hash)

    def test_verify_offer_letter_suspended_status(self):
        self.client.force_authenticate(user=self.admin)
        gen_url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_eligible.pk})
        self.client.post(gen_url)
        
        self.app_eligible.refresh_from_db()
        offer_hash = self.app_eligible.offer_letter_hash
        
        # Suspend
        self.app_eligible.status = Application.Status.SUSPENDED
        self.app_eligible.save()
        
        verify_url = reverse("verify_offer_letter_api", kwargs={"uuid": offer_hash})
        self.client.logout()
        
        response = self.client.get(verify_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        data = response.json()
        self.assertFalse(data["valid"])
        self.assertEqual(data["status"], "SUSPENDED")

    def test_process_automatic_offer_letters_task(self):
        from applications.tasks import process_automatic_offer_letters
        
        # Run Celery task synchronously
        result = process_automatic_offer_letters()
        self.assertIn("Generated", result)
        
        self.app_eligible.refresh_from_db()
        self.assertTrue(self.app_eligible.offer_letter_issued)
        self.assertIsNotNone(self.app_eligible.offer_letter_file)
        
        self.app_ineligible.refresh_from_db()
        self.assertFalse(self.app_ineligible.offer_letter_issued)

    def test_bulk_generate_cohort_offer_letters(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse("application-generate-offer-letters-for-cohort")
        
        response = self.client.post(url, {"cohort_id": str(self.cohort_eligible.id)})
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn("queued", response.json()["message"])

    def test_request_offer_letter(self):
        self.client.force_authenticate(user=self.student_user)
        url = reverse("application-request-offer-letter", kwargs={"pk": self.app_eligible.pk})
        
        response = self.client.post(url, {"reason": "I need it for internship credit"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("request_id", response.json())
        
        from common.models import UserRequest
        req = UserRequest.objects.filter(related_application=self.app_eligible, category=UserRequest.Category.OFFER_LETTER).first()
        self.assertIsNotNone(req)
        self.assertEqual(req.status, UserRequest.Status.PENDING)
        
        # Second request should be blocked
        response2 = self.client.post(url, {"reason": "Asking again"})
        self.assertEqual(response2.status_code, status.HTTP_409_CONFLICT)
        
from rest_framework.test import APITransactionTestCase

class ConcurrencyOfferLetterTests(APITransactionTestCase):
    def setUp(self):
        from accounts.models import User
        from students.models import StudentProfile
        from courses.models import Course
        from cohorts.models import Cohort
        from applications.models import Application
        from django.utils import timezone
        
        self.admin = User.objects.create_superuser("admin_conc@test.com", "password")
        self.admin.role = "ADMIN"
        self.admin.save()
        
        self.student_user = User.objects.create_user("student_conc@test.com", "password")
        self.student_user.role = "STUDENT"
        self.student_user.save()
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.student_user)
        
        self.course = Course.objects.create(name="Conc Course", code="CONC101", created_by=self.admin)
        self.cohort = Cohort.objects.create(
            course=self.course,
            code="CONC-C1",
            start_date=timezone.now().date() - timezone.timedelta(days=40),
            end_date=timezone.now().date() + timezone.timedelta(days=30),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        self.app_eligible = Application.objects.create(
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS
        )

    def test_concurrent_request_offer_letter(self):
        import concurrent.futures
        from django.db import connection
        
        self.client.force_authenticate(user=self.student_user)
        from django.urls import reverse
        url = reverse("application-request-offer-letter", kwargs={"pk": self.app_eligible.pk})
        
        if connection.vendor == "sqlite":
            # SQLite does not support concurrent write transactions across multiple threads
            res1 = self.client.post(url, {"reason": "First request"})
            res2 = self.client.post(url, {"reason": "Duplicate request"})
            from rest_framework import status
            self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
            self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        else:
            def make_request():
                connection.close()
                return self.client.post(url, {"reason": "Concurrent request"})

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(make_request) for _ in range(5)]
                results = [f.result() for f in futures]

            from rest_framework import status
            status_codes = [r.status_code for r in results]
            self.assertEqual(status_codes.count(status.HTTP_201_CREATED), 1)
            self.assertEqual(status_codes.count(status.HTTP_409_CONFLICT), 4)
        
        from common.models import UserRequest
        count = UserRequest.objects.filter(related_application=self.app_eligible, category=UserRequest.Category.OFFER_LETTER).count()
        self.assertEqual(count, 1)

    def test_download_offer_letter(self):
        # Generate letter first
        self.client.force_authenticate(user=self.admin)
        from django.urls import reverse
        gen_url = reverse("application-generate-offer-letter", kwargs={"pk": self.app_eligible.pk})
        self.client.post(gen_url)
        
        # Try download as owner
        self.client.force_authenticate(user=self.student_user)
        download_url = reverse("application-download-offer-letter", kwargs={"pk": self.app_eligible.pk})
        
        from rest_framework import status
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        
        # Try download as non-owner
        admin_student_user = User.objects.create_user("admin_stu@test.com", "password")
        self.client.force_authenticate(user=admin_student_user)
        response2 = self.client.get(download_url)
        self.assertIn(response2.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])
