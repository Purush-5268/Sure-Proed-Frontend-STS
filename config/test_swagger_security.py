from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import RefreshToken


User = get_user_model()


class SwaggerAdminSecurityTests(TestCase):
    def setUp(self):
        self.client = Client()
        # Admin user
        self.admin_user = User.objects.create_user(
            email="admin@suretrust.org",
            first_name="Admin",
            last_name="User",
            role="ADMIN",
            is_staff=True,
            password="AdminPassword123!",
        )
        # Student user (non-admin)
        self.student_user = User.objects.create_user(
            email="student@example.com",
            first_name="Student",
            last_name="User",
            role="STUDENT",
            is_staff=False,
            password="StudentPassword123!",
        )
        # Mentor user (non-admin)
        self.mentor_user = User.objects.create_user(
            email="mentor@suretrust.org",
            first_name="Mentor",
            last_name="User",
            role="MENTOR",
            is_staff=False,
            password="MentorPassword123!",
        )

    def test_unauthenticated_browser_access_to_swagger_ui_redirects_to_login(self):
        """Unauthenticated browser request to /api/docs/ must redirect to login."""
        response = self.client.get(
            "/api/docs/",
            HTTP_ACCEPT="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("/secure-admin/login/", response["Location"])
        self.assertIn("next=/api/docs/", response["Location"])

    def test_unauthenticated_api_access_to_schema_is_forbidden(self):
        """Unauthenticated direct request to /api/schema/ must be denied (401 or 403)."""
        response = self.client.get("/api/schema/")
        self.assertIn(response.status_code, [401, 403])

    def test_student_cannot_access_swagger_ui(self):
        """Logged-in student (non-admin) must be denied access with 403 Forbidden."""
        self.client.force_login(self.student_user)
        response = self.client.get("/api/docs/")
        self.assertEqual(response.status_code, 403)

    def test_mentor_cannot_access_swagger_ui(self):
        """Logged-in mentor (non-admin) must be denied access with 403 Forbidden."""
        self.client.force_login(self.mentor_user)
        response = self.client.get("/api/docs/")
        self.assertEqual(response.status_code, 403)

    def test_student_cannot_access_schema(self):
        """Logged-in student cannot access OpenAPI schema."""
        self.client.force_login(self.student_user)
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 403)

    def test_student_jwt_cannot_access_schema(self):
        """Student with valid JWT Bearer token is denied access (403)."""
        refresh = RefreshToken.for_user(self.student_user)
        access_token = str(refresh.access_token)
        response = self.client.get(
            "/api/schema/",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_session_access_to_swagger_ui(self):
        """Logged-in Admin can access Swagger UI successfully (200 OK)."""
        self.client.force_login(self.admin_user)
        response = self.client.get("/api/docs/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"swagger-ui", response.content)

    def test_admin_session_access_to_schema(self):
        """Logged-in Admin can fetch the OpenAPI schema successfully (200 OK)."""
        self.client.force_login(self.admin_user)
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 200)

    def test_admin_jwt_access_to_schema(self):
        """Admin user using JWT Bearer token can fetch the schema (200 OK)."""
        refresh = RefreshToken.for_user(self.admin_user)
        access_token = str(refresh.access_token)
        response = self.client.get(
            "/api/schema/",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )
        self.assertEqual(response.status_code, 200)
