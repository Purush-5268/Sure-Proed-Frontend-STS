from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase
from django.utils import timezone

from accounts.models import User
from students.admin import StudentProfileAdmin
from students.models import StudentProfile
from students.services.excel_export_service import generate_student_github_repos_excel
from students.services.repo_lookup_service import (
    auto_link_existing_repo,
    find_existing_repo_for_student,
    load_repo_catalog,
)


class GitHubRepoImportAndExcelTests(TestCase):
    def setUp(self):
        self.site = AdminSite()
        self.admin = StudentProfileAdmin(StudentProfile, self.site)
        self.rf = RequestFactory()

        # Create student matching one of the records in existing_github_repos.json
        # Record: THORAT YASH SANDIP / yashthorat1912
        self.user = User.objects.create_user(
            email="yash_thorat@example.com",
            password="SecurePassword123!",
            first_name="THORAT",
            last_name="YASH SANDIP",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        self.student = getattr(self.user, "student_profile", None) or StudentProfile.objects.get(user=self.user)

    def test_catalog_loads_successfully(self):
        catalog = load_repo_catalog()
        self.assertIn("by_username", catalog)
        self.assertIn("by_name", catalog)
        self.assertGreater(catalog.get("total_records", 0), 3000)
        self.assertIn("yashthorat1912", catalog["by_username"])

    def test_find_existing_repo_by_username_and_name(self):
        # Match by name
        record = find_existing_repo_for_student(self.student)
        self.assertIsNotNone(record)
        self.assertEqual(record["github_username"], "yashthorat1912")
        self.assertIn("THORAT-YASH-SANDIP-g29-fsd", record["repo_url"])

    def test_auto_link_on_student_profile_save(self):
        # Empty repo URL initially
        self.student.github_repo_url = None
        self.student.github_username = "yashthorat1912"
        self.student.save()

        self.student.refresh_from_db()
        self.assertIsNotNone(self.student.github_repo_url)
        self.assertIn("THORAT-YASH-SANDIP-g29-fsd", self.student.github_repo_url)
        self.assertTrue(self.student.is_github_connected)

    def test_excel_export_service_generates_valid_workbook(self):
        response = generate_student_github_repos_excel(queryset=StudentProfile.objects.filter(id=self.student.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        self.assertGreater(len(response.content), 1000)

    def test_admin_excel_export_view(self):
        admin_user = User.objects.create_superuser(
            email="admin_gh_report@example.com",
            password="SecurePassword123!",
            role=User.Role.ADMIN,
        )
        request = self.rf.get("/secure-admin/students/studentprofile/export-github-repos-excel/")
        request.user = admin_user

        response = self.admin.export_github_repos_excel_view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def test_sync_github_id(self):
        pradeep_user = User.objects.create_user(
            email="tummala.pradeep@example.com",
            password="SecurePassword123!",
            first_name="Tummala",
            last_name="Pradeep",
            role=User.Role.STUDENT,
        )
        profile = getattr(pradeep_user, "student_profile", None) or StudentProfile.objects.get(user=pradeep_user)

        from django.core.management import call_command
        call_command("import_github_repos")

        profile.refresh_from_db()
        self.assertEqual(profile.github_username, "albertpradeep-007")
        self.assertEqual(profile.github_url, "https://github.com/albertpradeep-007")
        self.assertEqual(profile.github_repo_url, "https://github.com/sure-trust/TUMMALA-PRADEEP-g2-26-vlsi")
        self.assertTrue(profile.is_github_connected)
        self.assertEqual(profile.github_org_invite_status, "ACCEPTED")
