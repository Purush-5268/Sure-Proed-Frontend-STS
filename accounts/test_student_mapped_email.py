from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase, RequestFactory
from rest_framework.test import APIClient
from accounts.models import User


class StudentMappedEmailTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(email="student@example.com", role="STUDENT", password="Student@123!")
        self.admin = User.objects.create_superuser(email="admin@suretrust.local", password="Admin@123!")

    def test_model_save_rejects_instead_of_silently_erasing_input(self):
        self.student.mapped_email = "alternate@example.com"
        with self.assertRaisesMessage(ValidationError, "Mapped email is not allowed for Students"):
            self.student.save()
        self.student.refresh_from_db()
        self.assertFalse(self.student.mapped_email)

    def test_database_also_rejects_bulk_updates_that_bypass_validation(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.filter(pk=self.student.pk).update(mapped_email="alternate@example.com")

    def test_django_admin_change_and_add_forms_show_field_error(self):
        request = RequestFactory().post("/admin/accounts/user/")
        request.user = self.admin
        model_admin = admin.site._registry[User]
        for instance in [self.student, None]:
            form_type = model_admin.get_form(request, obj=instance)
            form = form_type(data={"email": "newstudent@example.com", "role": "STUDENT", "mapped_email": "alternate@example.com", "password1": "Student@123!", "password2": "Student@123!"}, instance=instance)
            self.assertFalse(form.is_valid())
            self.assertIn("Mapped email is not allowed for Students", str(form.errors.get("mapped_email")))

    def test_administrator_api_cannot_add_student_mapped_email(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.patch(f"/api/users/{self.student.pk}/", {"mapped_email": "alternate@example.com"}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("mapped_email", response.data)

    def test_staff_mapped_email_and_empty_student_mapping_remain_valid(self):
        staff = User.objects.create_user(email="mentor@suretrust.local", role="MENTOR", mapped_email="personal@example.com", password="Mentor@123!")
        staff.full_clean()
        staff.save()
        self.assertEqual(staff.mapped_email, "personal@example.com")
        for empty in [None, ""]:
            self.student.mapped_email = empty
            self.student.full_clean()
            self.student.save()

    def test_role_conversion_requires_explicitly_removing_staff_mapping(self):
        staff = User.objects.create_user(email="staff@example.com", role="VOLUNTEER", mapped_email="personal@example.com", password="Staff@123!")
        staff.role = "STUDENT"
        with self.assertRaises(ValidationError):
            staff.save()
        staff.mapped_email = None
        staff.save()
        self.assertEqual(staff.role, "STUDENT")
