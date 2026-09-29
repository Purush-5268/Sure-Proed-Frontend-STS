from django.apps import apps
from django.contrib import admin
from django.test import SimpleTestCase


class ProjectAdminRegistrationTests(SimpleTestCase):
    project_apps = {
        "accounts",
        "students",
        "courses",
        "cohorts",
        "applications",
        "exams",
        "attendance",
        "assignments",
        "certificates",
        "companies",
        "common",
        "trainings",
        "feedback",
        "volunteers",
    }

    excluded_models = {
        "exams.ExternalExamAttempt",
        "exams.ExamProctoringRoom",
        "attendance.PermissionRequestMessage",
        "common.Achievement",
        "common.OrganizationalUpdate",
    }

    def test_every_project_model_is_registered_in_superadmin(self):
        project_models = [
            model for model in apps.get_models()
            if model._meta.app_label in self.project_apps
        ]
        missing = sorted(
            model._meta.label for model in project_models
            if model not in admin.site._registry and model._meta.label not in self.excluded_models
        )
        self.assertEqual(missing, [])
