import ipaddress
import sys
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config("DEBUG", default=False, cast=bool)
SECRET_KEY = config("SECRET_KEY", default="")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-secret-key"
    else:
        raise ImproperlyConfigured("SECRET_KEY must be configured when DEBUG is disabled.")
if not DEBUG and (
    len(SECRET_KEY) < 50
    or len(set(SECRET_KEY)) < 5
    or SECRET_KEY.startswith("django-insecure-")
):
    raise ImproperlyConfigured(
        "SECRET_KEY must be a strong, unique value of at least 50 characters in production."
    )
ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1" if DEBUG else "",
    cast=Csv(),
)

# The admin portal is intentionally stricter than the public API. This guard
# remains effective even if an IP address is accidentally added to
# ALLOWED_HOSTS. Nginx and Gunicorn must also enforce the network boundary; see
# deployment/nginx/sureproed.conf and BACKEND_OPERATIONS_RUNBOOK.md.
ADMIN_URL_PATH = "/secure-admin/"
ADMIN_ALLOWED_HOSTS = config(
    "ADMIN_ALLOWED_HOSTS",
    default=(
        "localhost,127.0.0.1,testserver"
        if DEBUG
        else ""
    ),
    cast=Csv(),
)
ADMIN_PORTAL_URL = config(
    "ADMIN_PORTAL_URL",
    default="http://localhost:8000/secure-admin/" if DEBUG else "",
)
LOGIN_URL = "/secure-admin/login/"

if not DEBUG:
    if not ALLOWED_HOSTS:
        raise ImproperlyConfigured("ALLOWED_HOSTS must be configured in production.")
    if not ADMIN_ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "ADMIN_ALLOWED_HOSTS must be configured in production."
        )

    unsafe_admin_hosts = []
    normalized_admin_hosts = set()
    for configured_host in ADMIN_ALLOWED_HOSTS:
        raw_host = configured_host.strip().lower().rstrip(".")
        normalized_host = urlsplit(f"//{raw_host}").hostname or raw_host.strip("[]")
        normalized_admin_hosts.add(normalized_host)
        try:
            is_ip_address = bool(ipaddress.ip_address(normalized_host))
        except ValueError:
            is_ip_address = False
        if normalized_host in {"*", "localhost"} or is_ip_address:
            unsafe_admin_hosts.append(configured_host)

    if unsafe_admin_hosts:
        raise ImproperlyConfigured(
            "ADMIN_ALLOWED_HOSTS must contain DNS hostnames only in production; "
            f"remove: {', '.join(unsafe_admin_hosts)}"
        )

    admin_portal = urlsplit(ADMIN_PORTAL_URL)
    if (
        admin_portal.scheme != "https"
        or admin_portal.hostname not in normalized_admin_hosts
    ):
        raise ImproperlyConfigured(
            "ADMIN_PORTAL_URL must use HTTPS and a hostname listed in "
            "ADMIN_ALLOWED_HOSTS."
        )

# Reverse Proxy SSL Headers (Required for Cloudflare / Nginx / Traefik SSL proxy)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = config("USE_X_FORWARDED_HOST", default=False, cast=bool)
USE_X_FORWARDED_PORT = True

CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default=(
        "http://localhost:8000,http://127.0.0.1:8000,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://*.trycloudflare.com"
        if DEBUG
        else ""
    ),
    cast=Csv(),
)

# CORS (Cross-Origin Resource Sharing) Settings
CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=DEBUG, cast=bool)
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "cache-control",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_otp",
    "django_otp.plugins.otp_totp",
    "corsheaders",
    "rest_framework",
    "django_filters",
    "rest_framework_simplejwt",
    "drf_spectacular",
    "channels",
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
    "question_bank",
    "communications",
]

MIDDLEWARE = [
    "config.middleware.PrivateAPIResponseMiddleware",
    "config.middleware.AdminHostRestrictionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

USE_SQLITE = config("USE_SQLITE", default=DEBUG, cast=bool)

if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "CONN_MAX_AGE": config("CONN_MAX_AGE", default=600, cast=int),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("POSTGRES_DB", default="suretrust"),
            "USER": config("POSTGRES_USER", default="suretrust"),
            "PASSWORD": config("POSTGRES_PASSWORD", default="suretrust_password"),
            "HOST": config("POSTGRES_HOST", default="localhost"),
            "PORT": config("POSTGRES_PORT", default="5432"),
            "CONN_MAX_AGE": 0,  # Required by Django 5.1 when pooling is enabled; the pool keeps connections open in the background
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {
                "pool": {
                    "min_size": config("DB_POOL_MIN_SIZE", default=2, cast=int),
                    "max_size": config("DB_POOL_MAX_SIZE", default=30, cast=int),
                    "timeout": config("DB_POOL_TIMEOUT", default=30, cast=int),
                }
            },
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "common.validators.StrongPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
PRIVATE_MEDIA_ROOT = BASE_DIR / "private_media"
PRIVATE_MEDIA_URL = None

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"



REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.CustomJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": [
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": config("THROTTLE_ANON_RATE", default="60/minute"),
        "user": config("THROTTLE_USER_RATE", default="300/minute"),
        "auth": config("THROTTLE_AUTH_RATE", default="20/minute"),
        "otp": config("THROTTLE_OTP_RATE", default="5/minute"),
        "sensitive": config("THROTTLE_SENSITIVE_RATE", default="10/minute"),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SureTrust Student Tracking API",
    "DESCRIPTION": "Production REST API documentation for SureTrust Student Tracking & Examination platform.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["common.permissions.IsAdmin"],
    "SERVE_AUTHENTICATION": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
        "accounts.authentication.CustomJWTAuthentication",
    ],
    "SCHEMA_PATH_PREFIX": r"/api",
    "COMPONENT_SPLIT_REQUEST": False,
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayOperationId": False,
        "filter": True,
    },
    "TAGS": [
        {"name": "Authentication & OAuth", "description": "User login, JWT tokens, email verification OTP, and OAuth2 linking (LinkedIn & GitHub)."},
        {"name": "users", "description": "User accounts, role assignments (Student, Mentor, Trustee, Company, Admin), and profiles."},
        {"name": "students", "description": "Student profiles, onboarding progress, cohort linkages, and academic status."},
        {"name": "courses", "description": "Academic courses, curricula, and course module management."},
        {"name": "cohorts", "description": "Active student cohorts, batch assignments, and mentor schedules."},
        {"name": "applications", "description": "Student admission applications, review workflow, and cohort acceptance."},
        {"name": "pre-screenings", "description": "Pre-screening assessments, evaluation criteria, and candidate scoring."},
        {"name": "pre-screening-interviews", "description": "Interview scheduling, panel evaluations, and feedback logs."},
        {"name": "community-activities", "description": "Student engagement tracking, extracurricular logs, and community events."},
        {"name": "attendance", "description": "Live class attendance tracking, QR check-ins, automated warning letters, and absence summaries."},
        {"name": "assignments", "description": "Course assignments, tasks, deadlines, and capstone project management."},
        {"name": "submissions", "description": "Student assignment submissions, mentor evaluations, grading, and feedback."},
        {"name": "certificates", "description": "Course completion certificates, unique verification hashes, and dynamic PDF generation."},
        {"name": "exams", "description": "Assessments, external exam links, launch tokens, and result callbacks."},
        {"name": "module-tests", "description": "Module-level test definitions and question criteria."},
        {"name": "module-test-submissions", "description": "Module test attempts, score recording, and passing validations."},
        {"name": "trainings", "description": "Live training batches, mentor allocations, and schedule configuration."},
        {"name": "training-sessions", "description": "Individual live session links (Google Meet), timestamps, and status."},
        {"name": "training-attendances", "description": "Attendance verification and audit trail for training sessions."},
        {"name": "companies", "description": "Hiring partner companies and corporate affiliations."},
        {"name": "job-postings", "description": "Placement drives, job vacancies, criteria, and deadlines."},
        {"name": "job-references", "description": "Student referrals, recommendation letters, and job application tracking."},
        {"name": "volunteers", "description": "Mentor and volunteer directory, volunteer tasks, and assistance requests."},
        {"name": "question-banks", "description": "Question bank management, categories, and automated paper generation."},
        {"name": "announcements", "description": "Broadcast notifications and cohort-specific announcements."},
        {"name": "notifications", "description": "User notifications, read/unread states, and Web Push integration."},
        {"name": "feedback", "description": "Student, mentor, and training feedback surveys and ratings."},
        {"name": "faqs", "description": "Frequently asked questions and knowledge base management."},
        {"name": "requests", "description": "Student and mentor support tickets and helpdesk requests."},
        {"name": "system-information", "description": "Platform health, system metrics, and configuration endpoints."},
    ],
}

# Production Security Headers
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=not DEBUG, cast=bool)
SESSION_COOKIE_SECURE = not DEBUG or config("SESSION_COOKIE_SECURE", default=False, cast=bool)
CSRF_COOKIE_SECURE = not DEBUG or config("CSRF_COOKIE_SECURE", default=False, cast=bool)
SECURE_HSTS_SECONDS = config(
    "SECURE_HSTS_SECONDS",
    default=(31536000 if not DEBUG else 0),
    cast=int,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=not DEBUG,
    cast=bool,
)
SECURE_HSTS_PRELOAD = config("SECURE_HSTS_PRELOAD", default=not DEBUG, cast=bool)
SECURE_BROWSER_XSS_FILTER = config("SECURE_BROWSER_XSS_FILTER", default=True, cast=bool)
SECURE_CONTENT_TYPE_NOSNIFF = config("SECURE_CONTENT_TYPE_NOSNIFF", default=True, cast=bool)
X_FRAME_OPTIONS = config("X_FRAME_OPTIONS", default="DENY")

# CORS Settings
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:5173")
GITHUB_OAUTH_FRONTEND_URL = config("GITHUB_OAUTH_FRONTEND_URL", default=FRONTEND_URL)
OFFER_LETTER_FRONTEND_URL = config("OFFER_LETTER_FRONTEND_URL", default=FRONTEND_URL)
CERTIFICATE_VERIFICATION_URL = config(
    "CERTIFICATE_VERIFICATION_URL",
    default=f"{FRONTEND_URL.rstrip('/')}/certificate/verify/{{code}}",
)

# Redis-backed API/session caching. Cache data uses database 2 so it never
# collides with the Celery broker (DB 0) or Celery results (DB 1).
_redis_cache_url = config("REDIS_CACHE_URL", default="redis://127.0.0.1:6379/2")
_cache_backend = config(
    "CACHE_BACKEND",
    default="django.core.cache.backends.redis.RedisCache",
)
_cache_location = config("CACHE_LOCATION", default=_redis_cache_url)
_cache_options = {}

if "redis" in _cache_backend.lower():
    try:
        import redis

        redis.Redis.from_url(
            _cache_location,
            socket_connect_timeout=0.35,
            socket_timeout=0.35,
        ).ping()
        _cache_options = {
            "socket_connect_timeout": 0.5,
            "socket_timeout": 0.5,
        }
    except Exception:
        # Local development and maintenance commands remain available if Redis
        # is temporarily unavailable. Production monitoring should alert when
        # the backend shown by `manage.py cache_health` is not Redis.
        _cache_backend = "django.core.cache.backends.locmem.LocMemCache"
        _cache_location = "suretrust-local-fallback"

CACHES = {
    "default": {
        "BACKEND": _cache_backend,
        "LOCATION": _cache_location,
        "TIMEOUT": config("CACHE_DEFAULT_TIMEOUT", default=300, cast=int),
        "KEY_PREFIX": config("CACHE_KEY_PREFIX", default="suretrust-api"),
        "OPTIONS": _cache_options,
    }
}

# Separate examination-platform integration. The result secret must be shared
# only between the two backend servers and must never be embedded in Android/web clients.
EXAM_PLATFORM_URL = config("EXAM_PLATFORM_URL", default="http://localhost:3000/exam")
EXAM_PLATFORM_SHARED_SECRET = config("EXAM_PLATFORM_SHARED_SECRET", default="")
EXAM_LAUNCH_TOKEN_TTL_SECONDS = config(
    "EXAM_LAUNCH_TOKEN_TTL_SECONDS", default=300, cast=int
)
EXAM_RESULT_MAX_CLOCK_SKEW_SECONDS = config(
    "EXAM_RESULT_MAX_CLOCK_SKEW_SECONDS", default=300, cast=int
)
ALLOW_INTERNAL_EXAM_SUBMISSION = config(
    "ALLOW_INTERNAL_EXAM_SUBMISSION", default=False, cast=bool
)
JITSI_DOMAIN = config("JITSI_DOMAIN", default="meet.jit.si")

# Persist sessions in the database while allowing Redis to serve repeat reads.
# This keeps admin sessions recoverable across a Redis restart.
SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"
SESSION_CACHE_ALIAS = "default"






SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}



CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=config("REDIS_URL", default="redis://localhost:6379/0"))
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://localhost:6379/1")
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = config("CELERY_TASK_ALWAYS_EAGER", default=DEBUG, cast=bool)
CELERY_TASK_EAGER_PROPAGATES = config("CELERY_TASK_EAGER_PROPAGATES", default=DEBUG, cast=bool)


# Email Backend (ZeptoMail SMTP)
EMAIL_BACKEND = config("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = config("EMAIL_HOST", default="smtp.zeptomail.in")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=(EMAIL_PORT == 587), cast=bool)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=(EMAIL_PORT == 465), cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="emailapikey")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default=config("ZEPTOMAIL_API_TOKEN", default=""))
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@sureproed.com")
SERVER_EMAIL = DEFAULT_FROM_EMAIL
ZEPTOMAIL_API_TOKEN = config("ZEPTOMAIL_API_TOKEN", default=EMAIL_HOST_PASSWORD)
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=15, cast=int)

# Fallback Email Config (Google Workspace)
EMAIL_FALLBACK_ENABLED = config("EMAIL_FALLBACK_ENABLED", default=False, cast=bool)
FALLBACK_EMAIL_HOST = config("FALLBACK_EMAIL_HOST", default="smtp.gmail.com")
FALLBACK_EMAIL_PORT = config("FALLBACK_EMAIL_PORT", default=587, cast=int)
FALLBACK_EMAIL_USE_TLS = config("FALLBACK_EMAIL_USE_TLS", default=True, cast=bool)
FALLBACK_EMAIL_HOST_USER = config("FALLBACK_EMAIL_HOST_USER", default="")
FALLBACK_EMAIL_HOST_PASSWORD = config("FALLBACK_EMAIL_HOST_PASSWORD", default="")

# Admin Audit BCC Configuration
EMAIL_AUDIT_BCC_ENABLED = config("EMAIL_AUDIT_BCC_ENABLED", default=False, cast=bool)
ADMIN_BCC_LIST = config("ADMIN_BCC_LIST", default="", cast=lambda v: [s.strip() for s in v.split(",") if s.strip()])

EMAIL_BCC_POLICY = {
    "application_confirmation": True,
    "otp": False,
    "password_reset": False,
    "class_scheduled": False,
    "critical_admin_alert": True,
    "bulk_invitation": False,
}

# LinkedIn OAuth 2.0 Settings
LINKEDIN_CLIENT_ID = config("LINKEDIN_CLIENT_ID", default="")
LINKEDIN_CLIENT_SECRET = config("LINKEDIN_CLIENT_SECRET", default="")
LINKEDIN_REDIRECT_URI = config(
    "LINKEDIN_REDIRECT_URI",
    default="https://api.sureproed.com/api/auth/linkedin/callback/",
)
LINKEDIN_SCOPE = config("LINKEDIN_SCOPE", default="openid profile email")

# GitHub OAuth 2.0 & Organization Settings
GITHUB_CLIENT_ID = config("GITHUB_CLIENT_ID", default="dev_github_client_id")
GITHUB_CLIENT_SECRET = config("GITHUB_CLIENT_SECRET", default="dev_github_client_secret")
GITHUB_REDIRECT_URI = config(
    "GITHUB_REDIRECT_URI",
    default="https://api.sureproed.com/api/auth/github/callback/",
)
GITHUB_ORG_NAME = config("GITHUB_ORG_NAME", default="sure-trust")
GITHUB_ORG_ADMIN_TOKEN = config("GITHUB_ORG_ADMIN_TOKEN", default="")

# Google Meet & Calendar Integration
GOOGLE_CLIENT_ID = config("GOOGLE_CLIENT_ID", default="")
GOOGLE_CLIENT_SECRET = config("GOOGLE_CLIENT_SECRET", default="")
GOOGLE_REFRESH_TOKEN = config("GOOGLE_REFRESH_TOKEN", default="")
GOOGLE_OAUTH_REDIRECT_URI = config("GOOGLE_OAUTH_REDIRECT_URI", default="")
GOOGLE_OAUTH_FRONTEND_REDIRECT_URL = config("GOOGLE_OAUTH_FRONTEND_REDIRECT_URL", default="")

GROQ_API_KEY = config("GROQ_API_KEY", default="")
GEMINI_API_KEY = config("GEMINI_API_KEY", default="")

# AI Provider Pipeline Configuration (Primary Generator: Groq | Secondary Verifier: Gemini)
AI_GENERATOR_PROVIDER = config("AI_GENERATOR_PROVIDER", default="groq")
AI_GENERATOR_MODEL = config("AI_GENERATOR_MODEL", default="openai/gpt-oss-120b")
AI_GENERATOR_API_KEY = config(
    "AI_GENERATOR_API_KEY",
    default=config("GROQ_API_KEY", default=config("GEMINI_API_KEY", default="")),
)
AI_GENERATOR_BASE_URL = config("AI_GENERATOR_BASE_URL", default="")

AI_VERIFIER_PROVIDER = config("AI_VERIFIER_PROVIDER", default="gemini")
AI_VERIFIER_MODEL = config("AI_VERIFIER_MODEL", default="gemini-3.6-flash")
AI_VERIFIER_API_KEY = config(
    "AI_VERIFIER_API_KEY",
    default=config("GEMINI_API_KEY", default=AI_GENERATOR_API_KEY),
)
AI_VERIFIER_BASE_URL = config("AI_VERIFIER_BASE_URL", default="")
AI_VERIFIER_MIN_CONFIDENCE = config(
    "AI_VERIFIER_MIN_CONFIDENCE", default=0.80, cast=float
)

AI_MAX_ATTEMPTS_PER_QUESTION = config("AI_MAX_ATTEMPTS_PER_QUESTION", default=5, cast=int)
AI_QUESTION_BANK_MAX_RETRIES = config("AI_QUESTION_BANK_MAX_RETRIES", default=2, cast=int)
AI_QUESTION_BANK_RETRY_DELAY_MINUTES = config(
    "AI_QUESTION_BANK_RETRY_DELAY_MINUTES", default=10, cast=float
)
AI_GEMINI_MIN_REQUEST_INTERVAL_SECONDS = config(
    "AI_GEMINI_MIN_REQUEST_INTERVAL_SECONDS", default=4.2, cast=float
)
FAILED_QUESTION_BANK_RETENTION_HOURS = config(
    "FAILED_QUESTION_BANK_RETENTION_HOURS", default=1, cast=float
)

ASGI_APPLICATION = "config.asgi.application"

_channel_layer_backend = config(
    "CHANNEL_LAYER_BACKEND",
    default=(
        "channels.layers.InMemoryChannelLayer"
        if DEBUG
        else "channels_redis.core.RedisChannelLayer"
    ),
)
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": _channel_layer_backend,
        "CONFIG": (
            {"hosts": [config("REDIS_URL", default="redis://localhost:6379/0")]}
            if "RedisChannelLayer" in _channel_layer_backend
            else {}
        ),
    },
}

# Web Push Notifications
WEB_PUSH_VAPID_PUBLIC_KEY = config("WEB_PUSH_VAPID_PUBLIC_KEY", default="")
WEB_PUSH_VAPID_PRIVATE_KEY = config("WEB_PUSH_VAPID_PRIVATE_KEY", default="")
WEB_PUSH_VAPID_CLAIMS_EMAIL = config("WEB_PUSH_VAPID_CLAIMS_EMAIL", default="")

# Celery Beat Schedule
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    'dispatch_class_lifecycle_notifications': {
        'task': 'attendance.tasks.dispatch_class_lifecycle_notifications',
        'schedule': 15.0, # T-5 and T class events should be emitted within seconds
    },
    'reconcile_ended_google_meets': {
        'task': 'attendance.tasks.reconcile_ended_google_meet_sessions_task',
        'schedule': 60.0,
    },
    'auto_schedule_lst_classes': {
        'task': 'attendance.tasks.auto_schedule_lst_classes_task',
        'schedule': crontab(minute=0, hour=12, day_of_week='sun'), # Run at 12 PM Sunday
    },
    'lst_generation_reminder_1': {
        'task': 'attendance.tasks.send_lst_generation_reminder_task',
        'schedule': crontab(minute=0, hour=11, day_of_week='sun'), # 11:00 AM Sunday
        'kwargs': {'is_final_reminder': False},
    },
    'lst_generation_reminder_2': {
        'task': 'attendance.tasks.send_lst_generation_reminder_task',
        'schedule': crontab(minute=30, hour=11, day_of_week='sun'), # 11:30 AM Sunday
        'kwargs': {'is_final_reminder': True},
    },
    'auto_generate_offer_letters': {
        'task': 'applications.tasks.process_automatic_offer_letters',
        'schedule': crontab(minute=30, hour=0), # Run daily at 12:30 AM
    },
    'finalize_expired_assessment_attempts': {
        'task': 'exams.tasks.finalize_expired_assessment_attempts',
        'schedule': crontab(minute='*/5'), # Run every 5 minutes to avoid idle process churn
    },
    'enforce_missed_module_tests': {
        'task': 'exams.tasks.enforce_missed_module_tests',
        'schedule': 300.0, # Every 5 minutes
    },
    'refresh_platform_statistics': {
        'task': 'common.tasks.refresh_platform_statistics',
        'schedule': crontab(minute=0), # Run hourly
    },
    'cleanup_failed_question_banks': {
        'task': 'question_bank.tasks.cleanup_failed_question_banks_task',
        'schedule': crontab(minute='*/30'),
    },
    'auto_provision_eligible_cohort_github_repos': {
        'task': 'cohorts.tasks.auto_provision_eligible_cohorts_task',
        'schedule': crontab(minute=0, hour=1), # Run daily at 1:00 AM
    },
    'cleanup_completed_cohort_meet_data': {
        'task': 'attendance.tasks.cleanup_completed_cohort_meet_data',
        'schedule': crontab(minute=0, hour=2), # Run daily at 2:00 AM
    },
}

# Private server credentials; never include this file in source control or the APK.
FCM_PROJECT_ID = config("FCM_PROJECT_ID", default="")
FCM_CREDENTIALS_FILE = config("FCM_CREDENTIALS_FILE", default="")
