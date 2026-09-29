from django.contrib import admin

try:
    from django_otp.admin import OTPAdminSite
    BaseAdminSite = OTPAdminSite
except ImportError:
    BaseAdminSite = admin.AdminSite


SECTION_MAP = [
    {
        "name": "User Management",
        "app_label": "sec_user_management",
        "models": [
            ("accounts", "usersearch"),
            ("accounts", "user"),
            ("students", "studentprofile"),
            ("volunteers", "mentorprofile"),
            ("volunteers", "volunteerprofile"),
        ],
    },
    {
        "name": "Admissions & Applications",
        "app_label": "sec_admissions_applications",
        "models": [
            ("applications", "application"),
            ("applications", "prescreening"),
            ("applications", "prescreeninginterview"),
            ("applications", "communityactivity"),
            ("exams", "externalexamattempt"),
            ("exams", "exam"),
        ],
    },
    {
        "name": "Academic Management",
        "app_label": "sec_academic_management",
        "models": [
            ("cohorts", "cohort"),
            ("courses", "course"),
            ("courses", "coursemodule"),
        ],
    },
    {
        "name": "Class Management",
        "app_label": "sec_class_management",
        "models": [
            ("attendance", "classschedule"),
            ("attendance", "attendancerecord"),
            ("attendance", "absencewarning"),
            ("attendance", "attendancesummary"),
            ("attendance", "attendance"),
        ],
    },
    {
        "name": "Assignments & Projects",
        "app_label": "sec_assignments_projects",
        "models": [
            ("assignments", "assignment"),
            ("assignments", "submission"),
            ("assignments", "capstoneproject"),
            ("assignments", "capstonesubmission"),
        ],
    },
    {
        "name": "Assessments & Results",
        "app_label": "sec_assessments_results",
        "models": [
            ("exams", "moduletest"),
            ("exams", "moduletestsubmission"),
        ],
    },
    {
        "name": "Training Management",
        "app_label": "sec_training_management",
        "models": [
            ("trainings", "trainingbatchdivision"),
            ("trainings", "training"),
            ("trainings", "trainingsession"),
            ("trainings", "trainingattendance"),
            ("trainings", "trainingabsentee"),
            ("attendance", "recurringschedule"),
        ],
    },
    {
        "name": "Volunteer Management",
        "app_label": "sec_volunteer_management",
        "models": [
            ("volunteers", "volunteertask"),
            ("volunteers", "volunteerhelprequest"),
        ],
    },
    {
        "name": "Placements & Companies",
        "app_label": "sec_placements_companies",
        "models": [
            ("companies", "company"),
            ("companies", "jobposting"),
            ("companies", "jobreference"),
        ],
    },
    {
        "name": "Certificates",
        "app_label": "sec_certificates",
        "models": [
            ("certificates", "certificate"),
        ],
    },
    {
        "name": "Communication & Support",
        "app_label": "sec_communication_support",
        "models": [
            ("common", "announcement"),
            ("common", "notification"),
            ("common", "faq"),
            ("common", "userrequest"),
            ("feedback", "feedback"),
        ],
    },
    {
        "name": "System & Security",
        "app_label": "sec_system_security",
        "models": [
            ("auth", "group"),
            ("otp_totp", "totpdevice"),
            ("accounts", "emailverificationotp"),
            ("accounts", "passwordresetotp"),
            ("common", "systeminformation"),
        ],
    },
]


class SureTrustAdminSite(BaseAdminSite):
    def get_app_list(self, request, app_label=None):
        app_list = super().get_app_list(request, app_label=app_label)

        # Build lookup table: (app_label, model_name) -> model_dict
        model_lookup = {}
        for app in app_list:
            orig_app_label = app["app_label"].lower()
            for model in app["models"]:
                model_name = model["object_name"].lower()
                model_lookup[(orig_app_label, model_name)] = model

        used_keys = set()
        custom_app_list = []

        for section in SECTION_MAP:
            section_models = []
            for target_app, target_model in section["models"]:
                key = (target_app.lower(), target_model.lower())
                if key in model_lookup:
                    section_models.append(model_lookup[key])
                    used_keys.add(key)

            if section_models:
                custom_app_list.append({
                    "name": section["name"],
                    "app_label": section["app_label"],
                    "app_url": "",
                    "has_module_perms": True,
                    "models": section_models,
                })

        remaining_models = []
        for key, model in model_lookup.items():
            if key not in used_keys:
                remaining_models.append(model)

        if remaining_models:
            custom_app_list.append({
                "name": "Other Administration",
                "app_label": "other_administration",
                "app_url": "",
                "has_module_perms": True,
                "models": remaining_models,
            })

        return custom_app_list


def setup_custom_admin_site():
    admin.site.__class__ = SureTrustAdminSite
