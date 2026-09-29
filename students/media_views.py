import mimetypes
import posixpath

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.views.decorators.http import require_GET


@require_GET
def student_profile_photo(request, filename):
    """Serve only public student profile photos when the proxy cannot serve MEDIA_ROOT."""
    safe_filename = posixpath.basename(filename)
    if not safe_filename or safe_filename != filename:
        raise Http404("Profile photo not found.")

    storage_name = f"students/photos/{safe_filename}"
    if not default_storage.exists(storage_name):
        raise Http404("Profile photo not found.")

    content_type = mimetypes.guess_type(safe_filename)[0] or "application/octet-stream"
    response = FileResponse(default_storage.open(storage_name, "rb"), content_type=content_type)
    response["Cache-Control"] = "no-cache, must-revalidate"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_GET
def student_banner_photo(request, filename):
    """Serve only public student banner photos when the proxy cannot serve MEDIA_ROOT."""
    safe_filename = posixpath.basename(filename)
    if not safe_filename or safe_filename != filename:
        raise Http404("Banner image not found.")

    storage_name = f"students/banners/{safe_filename}"
    if not default_storage.exists(storage_name):
        raise Http404("Banner image not found.")

    content_type = mimetypes.guess_type(safe_filename)[0] or "application/octet-stream"
    response = FileResponse(default_storage.open(storage_name, "rb"), content_type=content_type)
    response["Cache-Control"] = "no-cache, must-revalidate"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_GET
def student_resume_file(request, filename):
    """Serve student resumes directly from storage without caching."""
    safe_filename = posixpath.basename(filename)
    if not safe_filename or safe_filename != filename:
        raise Http404("Resume not found.")

    from django.db.models import Q
    from students.models import StudentProfile
    from students.permissions import can_read_student_document
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from common.storage import private_storage
    from django.core.files.storage import default_storage

    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        try:
            authenticated = JWTAuthentication().authenticate(request)
            user = authenticated[0] if authenticated else None
        except Exception:
            user = None

    if not user or not user.is_authenticated:
        raw_token = request.GET.get("token")
        if raw_token:
            from rest_framework_simplejwt.backends import TokenBackend
            from django.conf import settings
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                jwt_conf = getattr(settings, "SIMPLE_JWT", {})
                token_backend = TokenBackend(
                    algorithm=jwt_conf.get('ALGORITHM', 'HS256'),
                    signing_key=jwt_conf.get('SIGNING_KEY', settings.SECRET_KEY)
                )
                valid_data = token_backend.decode(raw_token, verify=True)
                user = User.objects.filter(id=valid_data.get('user_id'), is_active=True).first()
            except Exception:
                pass
            if not user or not user.is_authenticated:
                try:
                    from django.core.signing import TimestampSigner
                    val = TimestampSigner().unsign(raw_token, max_age=86400 * 7)
                    parts = val.split(":")
                    if len(parts) >= 3 and parts[0] == "resume":
                        user = User.objects.filter(id=parts[2], is_active=True).first()
                except Exception:
                    pass

    storage_name = f"students/resumes/{safe_filename}"
    profile = StudentProfile.objects.filter(
        Q(resume=storage_name) | Q(resume=safe_filename)
    ).first()
    allowed = bool(profile and can_read_student_document(user, profile))
    if not allowed:
        raise Http404("Resume not found.")

    storage = profile.resume.storage if (profile and profile.resume) else private_storage
    file_handle = None
    try:
        if storage.exists(storage_name):
            file_handle = storage.open(storage_name, "rb")
        elif private_storage.exists(storage_name):
            file_handle = private_storage.open(storage_name, "rb")
        elif default_storage.exists(storage_name):
            file_handle = default_storage.open(storage_name, "rb")
        elif default_storage.exists(safe_filename):
            file_handle = default_storage.open(safe_filename, "rb")
        else:
            raise Http404("Resume not found.")
    except Http404:
        raise
    except (FileNotFoundError, OSError):
        raise Http404("Resume not found.") from None

    content_type = mimetypes.guess_type(safe_filename)[0] or "application/pdf"
    response = FileResponse(file_handle, content_type=content_type)
    # Ensure resumes are never cached in Redis, reverse proxies, CDNs, or client browsers
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = f'inline; filename="{safe_filename}"'
    return response



@require_GET
def public_media_file(request, file_path):
    """Serve public media files from default_storage safely if proxy does not serve MEDIA_ROOT."""
    safe_path = posixpath.normpath(file_path).lstrip("/")
    if (
        not safe_path
        or safe_path.startswith("..")
        or "/../" in file_path
        or file_path.startswith("/")
        or "\\" in file_path
    ):
        raise Http404("Media file not found.")

    # Private documents must use their authenticated download endpoints.
    if safe_path.startswith(("offer_letters/", "students/resumes/")):
        raise Http404("Media file not found.")
    storage = default_storage
    if not storage.exists(safe_path):
        raise Http404("Media file not found.")

    content_type = mimetypes.guess_type(safe_path)[0] or "application/octet-stream"
    response = FileResponse(storage.open(safe_path, "rb"), content_type=content_type)
    response["Cache-Control"] = "public, max-age=604800"
    response["X-Content-Type-Options"] = "nosniff"
    filename = posixpath.basename(safe_path)
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


@require_GET
def offer_letter_media_file(request, file_path):
    """
    Serve private offer letters only to authenticated staff or the authorized student.
    Uses private_storage (PRIVATE_MEDIA_ROOT). Anonymous access returns 404.
    """
    safe_path = posixpath.normpath(file_path).lstrip("/")
    if (
        not safe_path
        or safe_path.startswith("..")
        or "/../" in file_path
        or file_path.startswith("/")
        or "\\" in file_path
    ):
        raise Http404("Offer letter not found.")

    storage_name = f"offer_letters/{safe_path}"
    from common.storage import private_storage
    if not private_storage.exists(storage_name):
        raise Http404("Offer letter not found.")

    from rest_framework_simplejwt.authentication import JWTAuthentication
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        try:
            authenticated = JWTAuthentication().authenticate(request)
            user = authenticated[0] if authenticated else None
        except Exception:
            user = None

    if not user or not user.is_authenticated:
        raise Http404("Offer letter not found.")

    is_staff_or_admin = (
        getattr(user, "is_staff", False)
        or getattr(user, "is_superuser", False)
        or getattr(user, "role", "") == "ADMIN"
    )

    if not is_staff_or_admin:
        from applications.models import Application
        app = Application.objects.filter(
            offer_letter_file=storage_name,
            student__user=user,
        ).first()

        if not app:
            filename = posixpath.basename(safe_path)
            app = Application.objects.filter(
                offer_letter_file__endswith=filename,
                student__user=user,
            ).first()

        if not app:
            raise Http404("Offer letter not found.")

        if app.offer_letter_status == Application.OfferLetterStatus.REVOKED:
            raise Http404("Offer letter not found.")

    try:
        file_handle = private_storage.open(storage_name, "rb")
    except (FileNotFoundError, OSError):
        raise Http404("Offer letter not found.")

    filename = posixpath.basename(safe_path)
    response = FileResponse(file_handle, content_type="application/pdf")
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response
