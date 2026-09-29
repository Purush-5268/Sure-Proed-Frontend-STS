from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort, GitHubProvisioningQueue
from cohorts.services import (
    process_single_github_queue_item,
    provision_cohort_student_repositories,
)
from courses.models import Course
from students.models import StudentProfile


class GitHubProvisioningQueueTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(
            name="VLSI Design",
            code="VLSI",
            duration_weeks=12,
        )
        self.cohort = Cohort.objects.create(
            course=self.course,
            code="VLSI-G2-26",
            start_date=timezone.now().date(),
            end_date=(timezone.now() + timedelta(days=90)).date(),
            status=Cohort.Status.TRAINING,
            training_started_at=timezone.now() - timedelta(days=20),
        )

        # Student 1: Valid GitHub user
        self.user1 = User.objects.create_user(
            email="alice@example.com",
            password="SecurePassword123!",
            first_name="Alice",
            last_name="Smith",
            role=User.Role.STUDENT,
        )
        self.profile1 = getattr(self.user1, "student_profile", None) or StudentProfile.objects.get(user=self.user1)
        self.profile1.github_username = "alice-gh"
        self.profile1.is_github_connected = True
        self.profile1.save()

        self.app1 = Application.objects.create(
            student=self.profile1,
            course=self.course,
            status=Application.Status.TRAINING,
            assigned_cohort=self.cohort,
        )

        # Student 2: Will fail repo creation
        self.user2 = User.objects.create_user(
            email="bob@example.com",
            password="SecurePassword123!",
            first_name="Bob",
            last_name="Jones",
            role=User.Role.STUDENT,
        )
        self.profile2 = getattr(self.user2, "student_profile", None) or StudentProfile.objects.get(user=self.user2)
        self.profile2.github_username = "bob-broken-gh"
        self.profile2.is_github_connected = True
        self.profile2.save()

        self.app2 = Application.objects.create(
            student=self.profile2,
            course=self.course,
            status=Application.Status.TRAINING,
            assigned_cohort=self.cohort,
        )

        # Student 3: No GitHub account connected
        self.user3 = User.objects.create_user(
            email="charlie@example.com",
            password="SecurePassword123!",
            first_name="Charlie",
            last_name="Brown",
            role=User.Role.STUDENT,
        )
        self.profile3 = getattr(self.user3, "student_profile", None) or StudentProfile.objects.get(user=self.user3)
        self.profile3.github_username = ""
        self.profile3.is_github_connected = False
        self.profile3.save()

        self.app3 = Application.objects.create(
            student=self.profile3,
            course=self.course,
            status=Application.Status.TRAINING,
            assigned_cohort=self.cohort,
        )

    @patch("cohorts.services.ensure_cohort_repository_access")
    def test_existing_repository_reapplies_required_collaborator_access(self, ensure_access):
        self.profile1.github_repo_url = "https://github.com/sure-trust/vlsi-alice"
        self.profile1.save(update_fields=["github_repo_url", "updated_at"])
        queue_item = GitHubProvisioningQueue.objects.create(
            cohort=self.cohort,
            student=self.profile1,
            github_username="alice-gh",
            repo_name="vlsi-alice",
        )

        status = process_single_github_queue_item(queue_item)

        self.assertEqual(status, GitHubProvisioningQueue.Status.SUCCESS)
        ensure_access.assert_called_once_with(
            self.cohort,
            "https://github.com/sure-trust/vlsi-alice",
            "alice-gh",
        )

    @patch(
        "cohorts.services.ensure_cohort_repository_access",
        side_effect=ValueError("trainer access failed"),
    )
    def test_existing_repository_is_failed_when_access_cannot_be_confirmed(self, ensure_access):
        self.profile1.github_repo_url = "https://github.com/sure-trust/vlsi-alice"
        self.profile1.save(update_fields=["github_repo_url", "updated_at"])
        queue_item = GitHubProvisioningQueue.objects.create(
            cohort=self.cohort,
            student=self.profile1,
            github_username="alice-gh",
            repo_name="vlsi-alice",
        )

        status = process_single_github_queue_item(queue_item)

        self.assertEqual(status, GitHubProvisioningQueue.Status.FAILED)
        queue_item.refresh_from_db()
        self.assertEqual(queue_item.retry_count, 1)
        self.assertIn("trainer access failed", queue_item.error_message)

    @patch("common.services.github_service.GitHubService.repo_exists", return_value=False)
    @patch("common.services.github_service.GitHubService.invite_user_to_org")
    @patch("common.services.github_service.GitHubService.create_and_initialize_student_repo")
    def test_queue_processing_and_failure_isolation(
        self,
        mock_create_repo,
        mock_invite_org,
        mock_repo_exists,
    ):
        mock_invite_org.return_value = {"state": "pending"}

        # Define side effect: Alice succeeds, Bob fails
        def side_effect_create(github_username, repo_name, **kwargs):
            if github_username == "bob-broken-gh":
                return {"error": "GitHub username does not exist on GitHub"}
            return {"html_url": f"https://github.com/sure-trust/{repo_name}", "name": repo_name}

        mock_create_repo.side_effect = side_effect_create

        # Run provisioning through queue architecture
        results = provision_cohort_student_repositories(self.cohort, force=True)

        self.assertEqual(results["created_count"], 1)
        self.assertEqual(results["failed_count"], 1)
        self.assertEqual(results["skipped_no_github_count"], 1)

        # Check queue records
        queue_alice = GitHubProvisioningQueue.objects.get(cohort=self.cohort, student=self.profile1)
        self.assertEqual(queue_alice.status, GitHubProvisioningQueue.Status.SUCCESS)
        self.assertTrue(queue_alice.repo_url.startswith("https://github.com/sure-trust/"))

        # Bob should be recorded in the Failed Queue with error message and retry_count=1
        queue_bob = GitHubProvisioningQueue.objects.get(cohort=self.cohort, student=self.profile2)
        self.assertEqual(queue_bob.status, GitHubProvisioningQueue.Status.FAILED)
        self.assertIn("GitHub username does not exist", queue_bob.error_message)
        self.assertEqual(queue_bob.retry_count, 1)

        # Charlie should be recorded as SKIPPED_NO_GITHUB
        queue_charlie = GitHubProvisioningQueue.objects.get(cohort=self.cohort, student=self.profile3)
        self.assertEqual(queue_charlie.status, GitHubProvisioningQueue.Status.SKIPPED_NO_GITHUB)

    @patch("common.services.github_service.GitHubService.repo_exists", return_value=False)
    @patch("common.services.github_service.GitHubService.invite_user_to_org", return_value={"state": "pending"})
    @patch("common.services.github_service.GitHubService.create_and_initialize_student_repo")
    def test_retry_failed_item(
        self,
        mock_create_repo,
        mock_invite_org,
        mock_repo_exists,
    ):
        # Create a pre-existing failed item for Bob
        queue_bob = GitHubProvisioningQueue.objects.create(
            cohort=self.cohort,
            student=self.profile2,
            github_username="bob-fixed-gh",
            repo_name=f"vlsi-{self.profile2.student_code}".lower(),
            status=GitHubProvisioningQueue.Status.FAILED,
            retry_count=1,
            error_message="Previous error",
        )

        mock_create_repo.return_value = {
            "html_url": f"https://github.com/sure-trust/{queue_bob.repo_name}",
            "name": queue_bob.repo_name,
        }

        # Retry the single item
        status = process_single_github_queue_item(queue_bob)

        self.assertEqual(status, GitHubProvisioningQueue.Status.SUCCESS)
        queue_bob.refresh_from_db()
        self.assertEqual(queue_bob.status, GitHubProvisioningQueue.Status.SUCCESS)
        self.assertIsNone(queue_bob.error_message)
