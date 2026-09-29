from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

import os
from django.conf import settings
from rest_framework.permissions import AllowAny

from .models import Course
from .serializers import CourseSerializer
from common.permissions import IsAdmin, IsAdminOrReadOnly
from rest_framework.permissions import IsAuthenticated
from common.cache_utils import bump_cache_version, versioned_cache_key
from django.core.cache import cache


class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.select_related("created_by", "approved_by").prefetch_related("modules").all().order_by("-created_at")
    serializer_class = CourseSerializer

    def get_permissions(self):
        """Strict RBAC: Only Admin can create, edit, or delete courses. Others get 403 Forbidden."""
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAdminOrReadOnly()]

    def get_queryset(self):
        qs = Course.objects.select_related("created_by", "approved_by").prefetch_related("modules", "cohorts").all().order_by("-created_at")
        user = self.request.user
        
        # Non-admins only see PUBLISHED courses ready to apply.
        # Once a cohort is set to ACTIVE/COMPLETED (and no other OPEN cohort exists), the course is hidden from UI application list.
        if not (user.is_authenticated and (user.is_staff or getattr(user, 'role', '') == 'ADMIN')):
            from cohorts.models import Cohort
            # Exclude courses whose cohorts have started/active/completed with no open cohort pending
            active_only_courses = Course.objects.filter(
                cohorts__status__in=[Cohort.Status.ACTIVE, Cohort.Status.COMPLETED, Cohort.Status.TRAINING, Cohort.Status.INTERNSHIP, Cohort.Status.SOFT_SKILLS]
            ).exclude(
                cohorts__status=Cohort.Status.OPEN
            )
            qs = qs.filter(status=Course.Status.PUBLISHED).exclude(id__in=active_only_courses)

        open_only = self.request.query_params.get("open_only")
        if open_only in ["true", "1", "yes"]:
            from cohorts.models import Cohort
            qs = qs.filter(
                status=Course.Status.PUBLISHED,
                cohorts__status=Cohort.Status.OPEN,
            ).distinct()

        category_param = self.request.query_params.get("category")
        if category_param:
            qs = qs.filter(category__iexact=category_param)
        return qs

    def _read_cache_key(self, request, action):
        user = request.user
        scope = "admin" if user.is_authenticated and (
            user.is_staff or getattr(user, "role", "") == "ADMIN"
        ) else "published"
        return versioned_cache_key("course-catalog", scope, action, request.get_full_path())

    def list(self, request, *args, **kwargs):
        key = self._read_cache_key(request, "list")
        payload = cache.get(key)
        if payload is not None:
            return Response(payload)
        response = super().list(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(key, response.data, timeout=60)
        return response

    def retrieve(self, request, *args, **kwargs):
        key = self._read_cache_key(request, f"detail:{kwargs.get('pk')}")
        payload = cache.get(key)
        if payload is not None:
            return Response(payload)
        response = super().retrieve(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(key, response.data, timeout=60)
        return response

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        bump_cache_version("course-catalog")

    def perform_update(self, serializer):
        course = serializer.save()
        bump_cache_version("course-catalog")
        if course.status == Course.Status.CANCELLED:
            from .services import handle_course_cancellation
            handle_course_cancellation(
                course,
                actor=self.request.user if hasattr(self, "request") else None,
            )

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        bump_cache_version("course-catalog")


class CourseCatalogView(APIView):
    """
    GET /api/courses/catalog/

    Public endpoint. Returns a list of all available course curriculum
    PDF files from the media/courses/catalog/ directory.

    Each item includes:
      - name         : Human-readable course name (derived from filename)
      - filename     : Exact filename on disk
      - url          : Absolute URL to download / open the PDF
      - size_bytes   : File size in bytes
      - size_kb      : Rounded kilobytes
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # No auth needed — purely public download links

    CATALOG_SUBPATH = os.path.join("courses", "catalog")

    def get(self, request, *args, **kwargs):
        catalog_dir = os.path.join(settings.MEDIA_ROOT, self.CATALOG_SUBPATH)
        base_url = request.build_absolute_uri(settings.MEDIA_URL)

        if not os.path.isdir(catalog_dir):
            return Response({"count": 0, "results": []})

        items = []
        for filename in sorted(os.listdir(catalog_dir)):
            if not filename.lower().endswith(".pdf"):
                continue
            filepath = os.path.join(catalog_dir, filename)
            size_bytes = os.path.getsize(filepath)
            # Build a human-readable name: strip extension, replace _ and - with spaces
            stem = os.path.splitext(filename)[0]
            readable_name = stem.replace("_", " ").replace("-", " ").strip()
            # Remove trailing random upload hashes (8 chars after last space that are alphanumeric)
            import re
            readable_name = re.sub(r'\s+[A-Za-z0-9]{6,10}$', '', readable_name).strip()

            download_url = f"{base_url.rstrip('/')}/{self.CATALOG_SUBPATH.replace(os.sep, '/')}/{filename}"

            items.append({
                "name": readable_name,
                "filename": filename,
                "url": download_url,
                "size_bytes": size_bytes,
                "size_kb": round(size_bytes / 1024, 1),
            })

        return Response({
            "count": len(items),
            "results": items,
        })
