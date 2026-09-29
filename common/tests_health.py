from django.test import TestCase
from rest_framework.test import APIClient

class HealthCheckEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check_returns_healthy(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "healthy")
        self.assertIn("database", response.data["components"])
        self.assertIn("endpoints", response.data)

    def test_api_health_check_returns_healthy(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "healthy")
        self.assertEqual(response.data["components"]["database"]["status"], "healthy")
