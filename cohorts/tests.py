from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort
from cohorts.services import ensure_cohort_repository_access
from courses.models import Course, CourseModule
from exams.models import ModuleTest, Exam
from question_bank.models import QuestionBank


class CohortApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="cohort-admin@example.com",
            password="test-password",
        )
        device = TOTPDevice.objects.create(user=self.admin, name="tests", confirmed=True)
        self.client.force_login(self.admin)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()
        self.mentor = User.objects.create_user(
            email="cohort-mentor@example.com",
            password="test-password",
            role=User.Role.MENTOR,
        )
        self.volunteer = User.objects.create_user(
            email="cohort-vol@example.com",
            password="test-password",
            role=User.Role.VOLUNTEER,
        )
        self.course = Course.objects.create(
            code="COHORT-101",
            name="Cohort Management Course",
            domain="Engineering",
            description="Testing cohort creation",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )

    def test_admin_can_create_cohort_standard_payload(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "code": "C101-BATCH1",
            "name": "Batch 1 - Cohort Management",
            "course": str(self.course.id),
            "start_date": "2026-09-01",
            "end_date": "2026-11-30",
            "max_students": 45,
            "status": "OPEN",
            "mentors": [str(self.mentor.id)],
            "volunteers": [str(self.volunteer.id)],
        }
        response = self.client.post("/api/cohorts/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        cohort = Cohort.objects.get(id=response.data["id"])
        self.assertEqual(cohort.code, "C101-BATCH1")
        self.assertEqual(cohort.max_students, 45)
        self.assertIn(self.mentor, cohort.mentors.all())
        self.assertIn(self.volunteer, cohort.volunteers.all())

    def test_repository_access_includes_only_trainers_assigned_to_the_cohort(self):
        cohort = Cohort.objects.create(
            code="C101-GITHUB-ACCESS",
            course=self.course,
            status=Cohort.Status.TRAINING,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        assigned_profile = self.mentor.mentor_profile
        assigned_profile.github_username = "assigned-trainer"
        assigned_profile.save(update_fields=["github_username", "updated_at"])
        cohort.mentors.add(self.mentor)
        cohort.current_mentors.add(self.mentor)

        other_trainer = User.objects.create_user(
            email="other-cohort-trainer@example.com",
            password="test-password",
            role=User.Role.MENTOR,
        )
        other_profile = other_trainer.mentor_profile
        other_profile.github_username = "other-trainer"
        other_profile.save(update_fields=["github_username", "updated_at"])
        other_cohort = Cohort.objects.create(
            code="C101-GITHUB-OTHER",
            course=self.course,
            status=Cohort.Status.TRAINING,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        other_cohort.mentors.add(other_trainer)

        granted = {
            "ok": True,
            "student": {"username": "student-one", "permission": "write", "granted": True},
            "trainers": [{"username": "assigned-trainer", "permission": "read", "granted": True}],
            "failed_trainers": [],
        }
        with patch(
            "cohorts.services.GitHubService.ensure_repository_access",
            return_value=granted,
        ) as ensure_access:
            result = ensure_cohort_repository_access(
                cohort,
                "https://github.com/sure-trust/cohort-student-one",
                "student-one",
            )

        self.assertEqual(result, granted)
        ensure_access.assert_called_once_with(
            "sure-trust",
            "cohort-student-one",
            "student-one",
            trainer_usernames=["assigned-trainer"],
        )

    def test_admin_can_create_cohort_with_camel_case_and_aliases(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "courseId": str(self.course.id),
            "startDate": "2026-09-01T00:00:00.000Z",
            "endDate": "2026-12-01T00:00:00.000Z",
            "maxStudents": "50",
            "lstBatch": "BATCH_1",
            "mentorId": self.mentor.email,
            "volunteerId": self.volunteer.email,
        }
        response = self.client.post("/api/cohorts/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        cohort = Cohort.objects.get(id=response.data["id"])
        self.assertEqual(cohort.course, self.course)
        self.assertEqual(cohort.max_students, 50)
        self.assertEqual(cohort.lst_batch, "BATCH_1")
        self.assertIn(self.mentor, cohort.mentors.all())
        self.assertIn(self.volunteer, cohort.volunteers.all())

    def test_admin_can_create_cohort_with_course_code_and_auto_dates(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "course": "COHORT-101",
        }
        response = self.client.post("/api/cohorts/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        cohort = Cohort.objects.get(id=response.data["id"])
        self.assertEqual(cohort.course, self.course)
        self.assertTrue(cohort.code.startswith("COHORT-101-C"))
        self.assertEqual(cohort.start_date, timezone.localdate())
        self.assertEqual(cohort.end_date, timezone.localdate() + timedelta(days=90))

    def test_admin_change_view_for_active_cohort(self):
        active_cohort = Cohort.objects.create(
            code="C101-ACTIVE",
            course=self.course,
            status=Cohort.Status.ACTIVE,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        active_cohort.mentors.add(self.mentor)
        active_cohort.volunteers.add(self.volunteer)

        self.client.force_login(self.admin)
        url = f"/secure-admin/cohorts/cohort/{active_cohort.id}/change/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_admin_change_view_for_completed_and_cancelled_cohorts(self):
        for status_val in [Cohort.Status.COMPLETED, Cohort.Status.CANCELLED]:
            cohort = Cohort.objects.create(
                code=f"C101-{status_val}",
                course=self.course,
                status=status_val,
                max_students=30,
                start_date=timezone.localdate(),
                end_date=timezone.localdate() + timedelta(days=60),
                created_by=self.admin,
            )
            self.client.force_login(self.admin)
            url = f"/secure-admin/cohorts/cohort/{cohort.id}/change/"
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)

    def test_admin_change_post_for_active_cohort(self):
        active_cohort = Cohort.objects.create(
            code="C101-ACTIVE-POST",
            course=self.course,
            status=Cohort.Status.ACTIVE,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        self.client.force_login(self.admin)
        url = f"/secure-admin/cohorts/cohort/{active_cohort.id}/change/"
        post_data = {
            "lst_batch": "BATCH_2",
            "_save": "Save",
            "applications-TOTAL_FORMS": "0",
            "applications-INITIAL_FORMS": "0",
            "applications-MIN_NUM_FORMS": "0",
            "applications-MAX_NUM_FORMS": "1000",
            "question_banks-TOTAL_FORMS": "0",
            "question_banks-INITIAL_FORMS": "0",
            "question_banks-MIN_NUM_FORMS": "0",
            "question_banks-MAX_NUM_FORMS": "1000",
            "module_tests-TOTAL_FORMS": "0",
            "module_tests-INITIAL_FORMS": "0",
            "module_tests-MIN_NUM_FORMS": "0",
            "module_tests-MAX_NUM_FORMS": "1000",
        }
        response = self.client.post(url, post_data)
        self.assertEqual(response.status_code, 302)
        active_cohort.refresh_from_db()
        self.assertEqual(active_cohort.lst_batch, "BATCH_2")

    def test_cohort_change_post_all_states(self):
        module = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            title="Module 1",
            topics=["Topic 1", "Topic 2"],
        )
        for status in [
            Cohort.Status.DRAFT,
            Cohort.Status.OPEN,
            Cohort.Status.ACTIVE,
            Cohort.Status.TRAINING,
            Cohort.Status.COMPLETED,
            Cohort.Status.CANCELLED,
        ]:
            cohort = Cohort.objects.create(
                code=f"C101-{status}-POSTALL",
                name=f"Cohort {status}",
                course=self.course,
                status=status,
                max_students=30,
                start_date=timezone.localdate(),
                end_date=timezone.localdate() + timedelta(days=60),
                created_by=self.admin,
            )
            cohort.mentors.add(self.mentor)
            cohort.volunteers.add(self.volunteer)

            student_user = User.objects.create_user(
                email=f"student-{status.lower()}@example.com",
                password="test-password",
                role=User.Role.STUDENT,
            )
            student_prof = student_user.student_profile
            app = Application.objects.create(
                application_number=f"APP-{status}-001",
                student=student_prof,
                course=self.course,
                assigned_cohort=cohort,
                status=Application.Status.COHORT_ASSIGNED,
                role_verification_status=Application.RoleVerificationStatus.VERIFIED,
            )
            Exam.objects.create(
                application=app,
                status=Exam.Status.EVALUATED,
                marks_obtained=8,
                total_marks=10,
                percentage=80,
                qualified=True,
            )

            qb = QuestionBank.objects.create(
                bank_type=QuestionBank.BankType.MODULE_TEST,
                course=self.course,
                cohort=cohort,
                module=module,
                title=f"QB for {cohort.code}",
            )

            mt = ModuleTest.objects.create(
                title=f"MT for {cohort.code}",
                course=self.course,
                cohort=cohort,
                module=module,
            )

            url = f"/secure-admin/cohorts/cohort/{cohort.id}/change/"
            post_data = {
                "code": cohort.code,
                "name": cohort.name,
                "course": str(self.course.id),
                "start_date": "2026-09-01",
                "end_date": "2026-11-30",
                "max_students": "40",
                "status": status,
                "lst_batch": "BATCH_1",
                "meeting_link": "https://meet.google.com/test-meet",
                "mentors": [str(self.mentor.id)],
                "volunteers": [str(self.volunteer.id)],
                "_save": "Save",
                "applications-TOTAL_FORMS": "1",
                "applications-INITIAL_FORMS": "1",
                "applications-MIN_NUM_FORMS": "0",
                "applications-MAX_NUM_FORMS": "1000",
                "applications-0-id": str(app.id),
                "applications-0-assigned_cohort": str(cohort.id),
                "question_banks-TOTAL_FORMS": "1",
                "question_banks-INITIAL_FORMS": "1",
                "question_banks-MIN_NUM_FORMS": "0",
                "question_banks-MAX_NUM_FORMS": "1000",
                "question_banks-0-id": str(qb.id),
                "question_banks-0-cohort": str(cohort.id),
                "question_banks-0-title": qb.title,
                "question_banks-0-bank_type": qb.bank_type,
                "question_banks-0-difficulty": qb.difficulty,
                "question_banks-0-total_questions_per_set": "10",
                "question_banks-0-is_active": "on",
                "module_tests-TOTAL_FORMS": "1",
                "module_tests-INITIAL_FORMS": "1",
                "module_tests-MIN_NUM_FORMS": "0",
                "module_tests-MAX_NUM_FORMS": "1000",
                "module_tests-0-id": str(mt.id),
                "module_tests-0-cohort": str(cohort.id),
                "module_tests-0-title": mt.title,
                "module_tests-0-module": str(module.id),
                "module_tests-0-level": mt.level,
                "module_tests-0-total_questions": "10",
                "module_tests-0-duration_minutes": "30",
                "module_tests-0-pass_percentage": "60",
                "module_tests-0-is_active": "on",
            }
            post_resp = self.client.post(url, post_data)
            self.assertIn(post_resp.status_code, [200, 302], f"POST failed with {post_resp.status_code} for status {status}")

    def test_admin_can_assign_volunteer_to_cohort_with_enrolled_students(self):
        cohort = Cohort.objects.create(
            code="C101-VOL-ASSIGN",
            name="Cohort Vol Assign",
            course=self.course,
            status=Cohort.Status.OPEN,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        student_user = User.objects.create_user(
            email="enrolled-student@example.com",
            password="test-password",
            role=User.Role.STUDENT,
        )
        student_prof = student_user.student_profile
        app = Application.objects.create(
            application_number="APP-ENROLLED-001",
            student=student_prof,
            course=self.course,
            assigned_cohort=cohort,
            status=Application.Status.COHORT_ASSIGNED,
            role_verification_status=Application.RoleVerificationStatus.VERIFIED,
        )

        new_volunteer = User.objects.create_user(
            email="new-volunteer@example.com",
            password="test-password",
            role=User.Role.VOLUNTEER,
        )

        url = f"/secure-admin/cohorts/cohort/{cohort.id}/change/"
        post_data = {
            "code": cohort.code,
            "name": cohort.name,
            "course": str(self.course.id),
            "start_date": "2026-09-01",
            "end_date": "2026-11-30",
            "max_students": "30",
            "status": "OPEN",
            "volunteers": [str(new_volunteer.id)],
            "_save": "Save",
            "applications-TOTAL_FORMS": "1",
            "applications-INITIAL_FORMS": "1",
            "applications-MIN_NUM_FORMS": "0",
            "applications-MAX_NUM_FORMS": "1000",
            "applications-0-id": str(app.id),
            "applications-0-assigned_cohort": str(cohort.id),
            "question_banks-TOTAL_FORMS": "0",
            "question_banks-INITIAL_FORMS": "0",
            "question_banks-MIN_NUM_FORMS": "0",
            "question_banks-MAX_NUM_FORMS": "1000",
            "module_tests-TOTAL_FORMS": "0",
            "module_tests-INITIAL_FORMS": "0",
            "module_tests-MIN_NUM_FORMS": "0",
            "module_tests-MAX_NUM_FORMS": "1000",
        }
        post_resp = self.client.post(url, post_data)
        self.assertEqual(post_resp.status_code, 302)
        cohort.refresh_from_db()
        self.assertIn(new_volunteer, cohort.volunteers.all(), f"Volunteers in cohort: {list(cohort.volunteers.all())}")

    def test_training_status_records_start_and_exposes_grace_deadline(self):
        cohort = Cohort.objects.create(
            code="C101-TRAINING-TIME",
            course=self.course,
            status=Cohort.Status.TRAINING,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )

        self.assertIsNotNone(cohort.training_started_at)
        self.assertEqual(
            cohort.github_repository_eligible_at,
            cohort.training_started_at + timedelta(days=15),
        )
        self.assertFalse(cohort.can_provision_github_repositories)

    def test_repository_creation_api_rejects_trigger_during_grace_period(self):
        cohort = Cohort.objects.create(
            code="C101-TRAINING-EARLY",
            course=self.course,
            status=Cohort.Status.TRAINING,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f"/api/cohorts/{cohort.id}/create-github-repositories/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "GITHUB_REPOSITORY_GRACE_PERIOD_NOT_COMPLETE")

    def test_repository_creation_api_runs_after_grace_period(self):
        cohort = Cohort.objects.create(
            code="C101-TRAINING-READY",
            course=self.course,
            status=Cohort.Status.TRAINING,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        Cohort.objects.filter(pk=cohort.pk).update(
            training_started_at=timezone.now() - timedelta(days=15, minutes=1)
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f"/api/cohorts/{cohort.id}/create-github-repositories/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["created_count"], 0)
        cohort.refresh_from_db()
        self.assertIsNotNone(cohort.github_repositories_last_provisioned_at)

    def test_repository_creation_api_batches_connected_enrolled_students(self):
        cohort = Cohort.objects.create(
            code="C101-TRAINING-BATCH",
            course=self.course,
            status=Cohort.Status.TRAINING,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        Cohort.objects.filter(pk=cohort.pk).update(
            training_started_at=timezone.now() - timedelta(days=16)
        )
        cohort.mentors.add(self.mentor)
        mentor_profile = self.mentor.mentor_profile
        mentor_profile.github_username = "readonly_mentor"
        mentor_profile.github_url = "https://github.com/readonly_mentor"
        mentor_profile.is_github_connected = True
        mentor_profile.save(update_fields=[
            "github_username", "github_url", "is_github_connected", "updated_at"
        ])
        student_user = User.objects.create_user(
            email="repo-student@example.com",
            password="test-password",
            role=User.Role.STUDENT,
        )
        student = student_user.student_profile
        student.github_username = "repo_student"
        student.github_url = "https://github.com/repo_student"
        student.is_github_connected = True
        student.save(update_fields=[
            "github_username", "github_url", "is_github_connected", "updated_at"
        ])
        Application.objects.create(
            application_number="APP-REPO-BATCH-001",
            student=student,
            course=self.course,
            assigned_cohort=cohort,
            status=Application.Status.COHORT_ASSIGNED,
        )
        self.client.force_authenticate(self.admin)

        with patch(
            "cohorts.services.GitHubService.create_and_initialize_student_repo",
            return_value={"html_url": "https://github.com/sure-trust/cohort-repo"},
        ) as create_repo, patch(
            "cohorts.services.GitHubService.invite_user_to_org",
            return_value={"state": "pending"},
        ):
            response = self.client.post(
                f"/api/cohorts/{cohort.id}/create-github-repositories/",
                {},
                format="json",
            )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["created_count"], 1)
        create_repo.assert_called_once()
        self.assertEqual(create_repo.call_args.kwargs["github_username"], "repo_student")
        self.assertEqual(create_repo.call_args.kwargs["batch_name"], cohort.code)
        self.assertEqual(
            create_repo.call_args.kwargs["instructor_usernames"], ["readonly_mentor"]
        )
        student.refresh_from_db()
        self.assertEqual(student.github_repo_url, "https://github.com/sure-trust/cohort-repo")

    def test_unauthenticated_user_can_view_open_cohorts_only(self):
        client = APIClient()
        open_cohort = Cohort.objects.create(
            code="C101-OPEN-PUB",
            course=self.course,
            status=Cohort.Status.OPEN,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        active_cohort = Cohort.objects.create(
            code="C101-ACTIVE-PRIV",
            course=self.course,
            status=Cohort.Status.ACTIVE,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )

        response = client.get("/api/cohorts/")
        self.assertEqual(response.status_code, 200)
        
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        result_codes = [c["code"] for c in results]
        self.assertIn("C101-OPEN-PUB", result_codes)
        self.assertNotIn("C101-ACTIVE-PRIV", result_codes)

    def test_unauthenticated_user_cannot_create_or_modify_cohorts(self):
        client = APIClient()
        post_response = client.post("/api/cohorts/", {"code": "HACK-101"}, format="json")
        self.assertEqual(post_response.status_code, 401)

    def test_student_can_view_open_cohorts_and_assigned_cohorts(self):
        client = APIClient()
        student_user = User.objects.create_user(
            email="student-view-tester@example.com",
            password="test-password",
            role=User.Role.STUDENT,
        )
        student_profile = student_user.student_profile
        
        open_cohort = Cohort.objects.create(
            code="C101-STUDENT-OPEN",
            course=self.course,
            status=Cohort.Status.OPEN,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        assigned_cohort = Cohort.objects.create(
            code="C101-STUDENT-ASSIGNED",
            course=self.course,
            status=Cohort.Status.ACTIVE,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        other_active_cohort = Cohort.objects.create(
            code="C101-OTHER-ACTIVE",
            course=self.course,
            status=Cohort.Status.ACTIVE,
            max_students=30,
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin,
        )
        
        Application.objects.create(
            application_number="APP-STUDENT-001",
            student=student_profile,
            course=self.course,
            assigned_cohort=assigned_cohort,
            status=Application.Status.COHORT_ASSIGNED,
        )

        client.force_authenticate(student_user)
        response = client.get("/api/cohorts/")
        self.assertEqual(response.status_code, 200)

        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        result_codes = [c["code"] for c in results]
        self.assertIn("C101-STUDENT-OPEN", result_codes)
        self.assertIn("C101-STUDENT-ASSIGNED", result_codes)
        self.assertNotIn("C101-OTHER-ACTIVE", result_codes)

class CohortApplicationSyncTests(TestCase):
    def setUp(self):
        from courses.models import Course
        from cohorts.models import Cohort
        self.admin = User.objects.create_superuser(email="admin-sync@example.com", password="pwd")
        self.course = Course.objects.create(
            code="SYNC-101", name="Sync Course", status=Course.Status.PUBLISHED, created_by=self.admin
        )
        self.cohort = Cohort.objects.create(
            code="C-SYNC1", course=self.course, status=Cohort.Status.ACTIVE,
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=60),
            created_by=self.admin
        )
        
    def _create_student_app(self, status):
        user = User.objects.create_user(email=f"stu-{status}-{timezone.now().timestamp()}@example.com", password="pwd", role=User.Role.STUDENT)
        return Application.objects.create(
            application_number=f"APP-{status}-{user.id}",
            student=user.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=status
        )

    def test_sync_active_to_training(self):
        from cohorts.services import sync_cohort_application_statuses
        app1 = self._create_student_app(Application.Status.COHORT_ASSIGNED)
        app2 = self._create_student_app(Application.Status.IN_PROGRESS)
        app_dropped = self._create_student_app(Application.Status.DROPPED)
        app_applied = self._create_student_app(Application.Status.APPLIED)

        result = sync_cohort_application_statuses(self.cohort, self.admin, Cohort.Status.ACTIVE, Cohort.Status.TRAINING)
        
        self.assertEqual(result["updated"], 2)
        
        app1.refresh_from_db()
        app2.refresh_from_db()
        app_dropped.refresh_from_db()
        app_applied.refresh_from_db()

        self.assertEqual(app1.status, Application.Status.TRAINING)
        self.assertEqual(app2.status, Application.Status.TRAINING)
        self.assertEqual(app_dropped.status, Application.Status.DROPPED)
        self.assertEqual(app_applied.status, Application.Status.APPLIED)

        self.assertEqual(app1.status_audits.count(), 1)
        audit = app1.status_audits.first()
        self.assertEqual(audit.from_status, Application.Status.COHORT_ASSIGNED)
        self.assertEqual(audit.to_status, Application.Status.TRAINING)

    def test_sync_no_regression(self):
        from cohorts.services import sync_cohort_application_statuses
        app_training = self._create_student_app(Application.Status.TRAINING)
        # Accidental rollback of cohort
        result = sync_cohort_application_statuses(self.cohort, self.admin, Cohort.Status.TRAINING, Cohort.Status.ACTIVE)
        
        app_training.refresh_from_db()
        self.assertEqual(app_training.status, Application.Status.TRAINING) # Did not regress to IN_PROGRESS
        self.assertEqual(result["skipped"], 1)

    def test_cohort_screening_at_and_requires_interview_controls(self):
        future_time = timezone.now() + timedelta(days=7)
        cohort = Cohort.objects.create(
            code="C-SCREEN-TEST",
            name="Screening Test Cohort",
            course=self.course,
            start_date="2026-10-01",
            end_date="2026-12-31",
            status=Cohort.Status.OPEN,
            default_screening_at=future_time,
            requires_interview=False,
        )
        self.assertEqual(cohort.default_screening_at, future_time)
        self.assertFalse(cohort.requires_interview)

        # Test screening schedule service uses cohort default_screening_at
        from applications.services.screening_schedule_service import create_course_default_screening_schedule
        user = User.objects.create_user(email="test-cohort-screen@example.com", password="pw", role=User.Role.STUDENT)
        app = Application.objects.create(
            application_number="APP-COHORT-SCREEN-01",
            student=user.student_profile,
            course=self.course,
            assigned_cohort=cohort,
            status=Application.Status.APPLIED,
        )
        ps = create_course_default_screening_schedule(app)
        self.assertIsNotNone(ps)
        self.assertEqual(ps.scheduled_at, future_time)
