import json
from unittest.mock import call, patch

from django.test import SimpleTestCase

from common.services.github_service import GitHubService


class GitHubRepositoryPermissionPolicyTests(SimpleTestCase):
    @patch("common.services.github_service.urllib.request.urlopen")
    def test_product_permissions_map_to_github_pull_and_push_roles(self, urlopen):
        urlopen.return_value.__enter__.return_value.status = 204

        self.assertTrue(
            GitHubService.add_collaborator(
                "sure-trust",
                "java-student-001",
                "student-one",
                permission="write",
                token="org-token",
            )
        )
        write_request = urlopen.call_args.args[0]
        self.assertEqual(json.loads(write_request.data), {"permission": "push"})

        self.assertTrue(
            GitHubService.add_collaborator(
                "sure-trust",
                "java-student-001",
                "trainer-one",
                permission="read",
                token="org-token",
            )
        )
        read_request = urlopen.call_args.args[0]
        self.assertEqual(json.loads(read_request.data), {"permission": "pull"})

    @patch.object(GitHubService, "add_collaborator", return_value=True)
    def test_student_gets_write_and_assigned_trainers_get_read(self, add_collaborator):
        access = GitHubService.ensure_repository_access(
            "sure-trust",
            "java-student-001",
            "student-one",
            trainer_usernames=["trainer-one", "TRAINER-ONE", "", "student-one", "trainer-two"],
            token="org-token",
        )

        self.assertTrue(access["ok"])
        self.assertEqual(
            add_collaborator.call_args_list,
            [
                call("sure-trust", "java-student-001", "student-one", permission="write", token="org-token"),
                call("sure-trust", "java-student-001", "trainer-one", permission="read", token="org-token"),
                call("sure-trust", "java-student-001", "trainer-two", permission="read", token="org-token"),
            ],
        )
        self.assertEqual(
            access["trainers"],
            [
                {"username": "trainer-one", "permission": "read", "granted": True},
                {"username": "trainer-two", "permission": "read", "granted": True},
            ],
        )

    @patch.object(GitHubService, "add_collaborator")
    def test_access_policy_reports_any_failed_required_invitation(self, add_collaborator):
        add_collaborator.side_effect = [True, True, False]

        access = GitHubService.ensure_repository_access(
            "sure-trust",
            "java-student-001",
            "student-one",
            trainer_usernames=["trainer-one", "trainer-two"],
            token="org-token",
        )

        self.assertFalse(access["ok"])
        self.assertEqual(access["failed_trainers"], ["trainer-two"])

    def test_arbitrary_permission_levels_are_rejected(self):
        with self.assertRaisesMessage(ValueError, "only receive read or write access"):
            GitHubService.add_collaborator(
                "sure-trust",
                "java-student-001",
                "trainer-one",
                permission="admin",
                token="org-token",
            )
