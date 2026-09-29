from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from config.middleware import AdminHostRestrictionMiddleware


@override_settings(ADMIN_ALLOWED_HOSTS=["sureproed.com", "www.sureproed.com"])
class AdminHostRestrictionMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = AdminHostRestrictionMiddleware(
            lambda _request: HttpResponse("allowed")
        )

    def test_admin_is_allowed_on_public_domain(self):
        request = self.factory.get(
            "/secure-admin/exams/starttest/hub/",
            HTTP_HOST="sureproed.com",
        )

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    @override_settings(ADMIN_ALLOWED_HOSTS=["testserver"])
    def test_admin_uses_server_name_when_http_host_is_absent(self):
        request = self.factory.get("/secure-admin/")

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    def test_admin_is_blocked_on_public_ip(self):
        request = self.factory.get(
            "/secure-admin/",
            HTTP_HOST="106.51.129.34:8000",
        )

        response = self.middleware(request)

        self.assertEqual(response.status_code, 404)

    def test_forwarded_host_cannot_override_direct_ip_host(self):
        request = self.factory.get(
            "/secure-admin/",
            HTTP_HOST="106.51.129.34:8000",
            HTTP_X_FORWARDED_HOST="sureproed.com",
        )

        response = self.middleware(request)

        self.assertEqual(response.status_code, 404)

    def test_non_admin_route_is_not_changed(self):
        request = self.factory.get("/api/", HTTP_HOST="106.51.129.34:8000")

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)
