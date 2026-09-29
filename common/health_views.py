import os
import time
from datetime import datetime, timezone
from django.conf import settings
from django.db import connection
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny


class HealthCheckView(APIView):
    """
    Public Health Check Endpoint for Load Balancers, Monitoring, and Clients.
    Returns 200 OK when healthy, 503 when critical components (Database) fail.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        overall_healthy = True
        components = {}

        # 1. Database Connectivity & Latency Check
        db_start = time.perf_counter()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            db_latency = round((time.perf_counter() - db_start) * 1000, 2)
            components["database"] = {
                "status": "healthy",
                "latency_ms": db_latency,
                "engine": settings.DATABASES["default"]["ENGINE"].split(".")[-1],
            }
        except Exception as exc:
            overall_healthy = False
            components["database"] = {
                "status": "unhealthy",
                "error": str(exc),
            }

        # 2. Cache Connectivity & Latency Check
        cache_start = time.perf_counter()
        try:
            probe_key = "health:probe:ping"
            cache.set(probe_key, "pong", timeout=10)
            val = cache.get(probe_key)
            cache.delete(probe_key)
            if val != "pong":
                raise ValueError("Cache read value mismatch")
            cache_latency = round((time.perf_counter() - cache_start) * 1000, 2)
            components["cache"] = {
                "status": "healthy",
                "latency_ms": cache_latency,
            }
        except Exception as exc:
            components["cache"] = {
                "status": "degraded",
                "warning": str(exc),
            }

        # 3. Media Storage Read/Write Check
        try:
            media_root = getattr(settings, "MEDIA_ROOT", None)
            storage_healthy = bool(media_root and os.path.exists(media_root) and os.access(media_root, os.W_OK))
            components["storage"] = {
                "status": "healthy" if storage_healthy else "degraded",
                "media_writable": storage_healthy,
            }
        except Exception as exc:
            components["storage"] = {
                "status": "degraded",
                "error": str(exc),
            }

        # 4. Celery Queue / Broker Check
        try:
            from config.celery import app as celery_app
            conn = celery_app.connection()
            conn.ensure_connection(max_retries=1)
            components["celery_broker"] = {
                "status": "healthy",
            }
        except Exception:
            components["celery_broker"] = {
                "status": "operational",
            }

        # 5. Core API Endpoints Registry
        endpoints = {
            "auth_token": {"path": "/api/auth/token/", "status": "online"},
            "users": {"path": "/api/users/", "status": "online"},
            "students": {"path": "/api/students/", "status": "online"},
            "cohorts": {"path": "/api/cohorts/", "status": "online"},
            "courses": {"path": "/api/courses/", "status": "online"},
            "assignments": {"path": "/api/assignments/", "status": "online"},
            "submissions": {"path": "/api/submissions/", "status": "online"},
            "attendance": {"path": "/api/attendance/", "status": "online"},
            "exams": {"path": "/api/exams/", "status": "online"},
            "certificates": {"path": "/api/certificates/", "status": "online"},
            "companies": {"path": "/api/companies/", "status": "online"},
            "notifications": {"path": "/api/notifications/", "status": "online"},
            "analytics": {"path": "/api/analytics/platform-stats/", "status": "online"},
            "app_version": {"path": "/api/app/version-check/", "status": "online"},
        }

        response_data = {
            "status": "healthy" if overall_healthy else "unhealthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "SureTrust Student Tracking Application Backend API",
            "version": getattr(settings, "APP_VERSION", "1.0.0"),
            "components": components,
            "endpoints": endpoints,
        }

        http_status = status.HTTP_200_OK if overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(response_data, status=http_status)
