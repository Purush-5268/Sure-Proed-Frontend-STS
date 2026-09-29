from common.health_views import HealthCheckView
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import include, path

from config.admin_site import setup_custom_admin_site
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.authentication import BasicAuthentication, SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.authentication import JWTAuthentication

from common.permissions import IsAdmin

setup_custom_admin_site()

from accounts.views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    FrontendLoginView,
    GitHubCallbackView,
    GitHubConnectURLView,
    GitHubDisconnectView,
    GoogleConnectURLView,
    GoogleCallbackView,
    LinkedInCallbackView,
    LinkedInConnectURLView,
    LinkedInSSOLoginURLView,
    LinkedInSSOCallbackView,
    LinkedInDisconnectView,
    SendEmailVerificationOTPView,
    SwitchAccountView,
    UserViewSet,
    VerifyEmailOTPView,
)
from applications.views import ApplicationViewSet, CommunityActivityViewSet, PreScreeningViewSet, PreScreeningInterviewViewSet, VerifyOfferLetterAPIView, ApplicationStatusAuditViewSet
from assignments.views import AssignmentViewSet, SubmissionViewSet
from attendance.views import AttendanceViewSet, AttendanceSummaryViewSet, AbsenceWarningViewSet
from certificates.views import CertificateViewSet
from cohorts.views import CohortViewSet
from cohorts.chat_views import (
    CohortChatMessagesView,
    CohortChatUnreadCountView,
    CohortChatMarkReadView,
    CohortChatDeleteMessageView,
)
from common.views import (
    AnnouncementViewSet,
    FAQViewSet,
    NotificationViewSet,
    SystemInformationViewSet,
    UserRequestViewSet,
    AchievementViewSet,
    OrganizationalUpdateViewSet,
    PlatformStatisticsView,
    PublicPeopleView,
    AppVersionCheckView,
)
from companies.views import CompanyViewSet, JobPostingViewSet, JobReferenceViewSet
from courses.views import CourseViewSet, CourseCatalogView
from exams.views import (
    ExamViewSet,
    ManualExaminationViewSet,
    ModuleTestSubmissionViewSet,
    ModuleTestViewSet,
)
from feedback.views import FeedbackViewSet
from students.views import StudentProfileViewSet, StudentPlacementViewSet, AdminPlacementVerificationView, PublicPlacementListView
from students.media_views import (
    student_profile_photo,
    student_banner_photo,
    student_resume_file,
    offer_letter_media_file,
    public_media_file,
)
from trainings.views import (
    TrainingAttendanceViewSet,
    TrainingSessionViewSet,
    TrainingViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
from accounts.views import AdministratorProfileViewSet
router.register("trustees/profiles", AdministratorProfileViewSet, basename="trusteeprofile")
router.register("achievements", AchievementViewSet, basename="achievement")
router.register("updates", OrganizationalUpdateViewSet, basename="update")
router.register("students", StudentProfileViewSet, basename="studentprofile")
router.register("student-placements", StudentPlacementViewSet, basename="studentplacement")
router.register("admin-placements", AdminPlacementVerificationView, basename="admin-placements")
router.register("public-placements", PublicPlacementListView, basename="public-placements")
router.register("courses", CourseViewSet, basename="course")
router.register("cohorts", CohortViewSet)
router.register("applications", ApplicationViewSet, basename="application")
router.register("application-status-audits", ApplicationStatusAuditViewSet, basename="application_status_audit")
router.register("community-activities", CommunityActivityViewSet, basename="communityactivity")
router.register("pre-screenings", PreScreeningViewSet, basename="prescreening")
router.register("pre-screening-interviews", PreScreeningInterviewViewSet, basename="prescreeninginterview")
router.register("exams", ExamViewSet)
router.register("manual-examinations", ManualExaminationViewSet, basename="manual-examination")
router.register("module-tests", ModuleTestViewSet, basename="moduletest")
router.register("module-test-submissions", ModuleTestSubmissionViewSet, basename="moduletestsubmission")
router.register("attendance/summary", AttendanceSummaryViewSet, basename="attendance-summary")
router.register("attendance", AttendanceViewSet)
router.register("warnings", AbsenceWarningViewSet, basename="absence-warning")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("submissions", SubmissionViewSet, basename="submission")
router.register("certificates", CertificateViewSet, basename="certificate")
router.register("companies", CompanyViewSet)
router.register("job-postings", JobPostingViewSet, basename="jobposting")
router.register("job-references", JobReferenceViewSet, basename="jobreference")
router.register("system-information", SystemInformationViewSet, basename="systeminformation")
router.register("faqs", FAQViewSet, basename="faq")
router.register("announcements", AnnouncementViewSet, basename="announcement")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("requests", UserRequestViewSet, basename="userrequest")
router.register("trainings", TrainingViewSet, basename="training")
router.register("training-sessions", TrainingSessionViewSet, basename="trainingsession")
router.register("training-attendances", TrainingAttendanceViewSet, basename="trainingattendance")
router.register("feedback", FeedbackViewSet, basename="feedback")

from django.http import HttpResponse

def privacy_policy(request):
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - SURE ProEd LMS</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; }
            h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            h2 { color: #333; margin-top: 24px; font-size: 1.2rem; }
            p { color: #444; }
        </style>
    </head>
    <body>
        <h1>Privacy Policy</h1>
        <p><strong>Effective Date:</strong> September 2026</p>
        <p><strong>App:</strong> SURE ProEd LMS</p>

        <h2>1. Information We Collect</h2>
        <p>SURE ProEd LMS requests access to your basic Google account profile information (such as your name, email address, and profile photo) when you choose to connect your Google account.</p>

        <h2>2. How We Use Your Information</h2>
        <p>Your Google profile details are strictly used to:
            <ul>
                <li>Authenticate your identity within the student portal.</li>
                <li>Match your official enrolled student identity with your classroom and attendance records.</li>
            </ul>
        We do not access your private emails, Google Drive files, or contacts. We never sell, rent, or share your data with external third-party advertisers.</p>

        <h2>3. Data Retention and Security</h2>
        <p>Your information is stored in secure, encrypted cloud databases and is strictly accessible only to authorized academic administrators.</p>

        <h2>4. Contact Us</h2>
        <p>For questions or requests regarding your data, contact: <strong>radha@sureproed.in</strong></p>
    </body>
    </html>
    """
    return HttpResponse(html_content, content_type="text/html")

def terms_of_service(request):
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Terms of Service - SURE ProEd LMS</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; }
            h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            h2 { color: #333; margin-top: 24px; font-size: 1.2rem; }
            p { color: #444; }
        </style>
    </head>
    <body>
        <h1>Terms of Service</h1>
        <p><strong>Effective Date:</strong> September 2026</p>
        <p><strong>App:</strong> SURE ProEd LMS</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By using the SURE ProEd LMS, you agree to comply with these terms of service and our academic honor code.</p>

        <h2>2. Proper Usage</h2>
        <p>Students must use their real, official identities during academic sessions. Sharing account credentials is strictly prohibited.</p>

        <h2>3. Intellectual Property</h2>
        <p>All course content, materials, and recordings provided within the LMS remain the intellectual property of SURE ProEd. Unauthorized distribution is prohibited.</p>

        <h2>4. Contact Us</h2>
        <p>For questions regarding these terms, contact: <strong>radha@sureproed.in</strong></p>
    </body>
    </html>
    """
    return HttpResponse(html_content, content_type="text/html")


class ProtectedSpectacularAPIView(SpectacularAPIView):
    permission_classes = [IsAdmin]
    authentication_classes = [SessionAuthentication, BasicAuthentication, JWTAuthentication]


class ProtectedSpectacularSwaggerView(SpectacularSwaggerView):
    permission_classes = [IsAdmin]
    authentication_classes = [SessionAuthentication, BasicAuthentication, JWTAuthentication]

    def handle_exception(self, exc):
        if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
            accept = self.request.META.get("HTTP_ACCEPT", "")
            if "text/html" in accept:
                return redirect(f"/secure-admin/login/?next={self.request.path}")
        return super().handle_exception(exc)


class ProtectedSpectacularRedocView(SpectacularRedocView):
    permission_classes = [IsAdmin]
    authentication_classes = [SessionAuthentication, BasicAuthentication, JWTAuthentication]

    def handle_exception(self, exc):
        if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
            accept = self.request.META.get("HTTP_ACCEPT", "")
            if "text/html" in accept:
                return redirect(f"/secure-admin/login/?next={self.request.path}")
        return super().handle_exception(exc)


# Aliases for backwards compatibility
PublicSpectacularAPIView = ProtectedSpectacularAPIView
PublicSpectacularSwaggerView = ProtectedSpectacularSwaggerView
PublicSpectacularRedocView = ProtectedSpectacularRedocView


def api_root_view(request):
    return JsonResponse({
        "status": "online",
        "service": "SureTrust Student Tracking Application Backend API",
        "version": "1.0.0",
        "documentation": "/api/docs/",
        "admin": "/secure-admin/",
    })


urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health_check_root"),
    path("health", HealthCheckView.as_view()),
    path("api/health/", HealthCheckView.as_view(), name="health_check_api"),
    path("api/health", HealthCheckView.as_view()),
    path("", api_root_view, name="api_root"),
    path("privacy/", privacy_policy, name="privacy_policy"),
    path("privacy", privacy_policy),
    path("terms/", terms_of_service, name="terms_of_service"),
    path("terms", terms_of_service),
    path("media/students/photos/<str:filename>", student_profile_photo, name="student_profile_photo"),
    path("media/students/banners/<str:filename>", student_banner_photo, name="student_banner_photo"),
    path("media/students/resumes/<path:filename>", student_resume_file, name="student_resume_file"),
    path("media/offer_letters/<path:file_path>", offer_letter_media_file, name="offer_letter_media_file"),
    path("media/<path:file_path>", public_media_file, name="public_media_file"),
    path("login/", FrontendLoginView.as_view(), name="frontend_login_slash"),
    path("login", FrontendLoginView.as_view(), name="frontend_login"),
    path("secure-admin/", admin.site.urls),
    path("api/auth/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/switch-account/", SwitchAccountView.as_view(), name="switch_account"),
    path("api/auth/send-verification-otp/", SendEmailVerificationOTPView.as_view(), name="send_verification_otp"),
    path("api/auth/verify-email-otp/", VerifyEmailOTPView.as_view(), name="verify_email_otp"),
    path("api/auth/linkedin/connect/", LinkedInConnectURLView.as_view(), name="linkedin_connect_url"),
    path("api/auth/linkedin/callback/", LinkedInCallbackView.as_view(), name="linkedin_callback"),
    path("api/auth/linkedin/sso/login-url/", LinkedInSSOLoginURLView.as_view(), name="linkedin_sso_login_url"),
    path("api/auth/linkedin/sso/callback/", LinkedInSSOCallbackView.as_view(), name="linkedin_sso_callback"),
    path("api/auth/linkedin/disconnect/", LinkedInDisconnectView.as_view(), name="linkedin_disconnect"),
    path("api/auth/github/connect/", GitHubConnectURLView.as_view(), name="github_connect_url"),
    path("api/auth/github/callback/", GitHubCallbackView.as_view(), name="github_callback"),
    path("api/auth/github/disconnect/", GitHubDisconnectView.as_view(), name="github_disconnect"),
    path("api/auth/google/connect/", GoogleConnectURLView.as_view(), name="google_connect_url"),
    path("api/auth/google/callback/", GoogleCallbackView.as_view(), name="google_callback"),
    path("api/schema/", ProtectedSpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", ProtectedSpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", ProtectedSpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    
    # Analytics/Statistics
    path("api/analytics/platform-stats/", PlatformStatisticsView.as_view(), name="platform-stats"),
    path("api/analytics/public-people/", PublicPeopleView.as_view(), name="public-people"),
    path("api/volunteers/", include("volunteers.urls")),
    path("api/question-banks/", include("question_bank.urls")),
    path("api/communications/", include("communications.urls")),
    path("api/offer-letters/verify/<str:uuid>/", VerifyOfferLetterAPIView.as_view(), name="verify_offer_letter_api"),
    # Course Curriculum Catalog — public PDF download directory
    path("api/courses/catalog/", CourseCatalogView.as_view(), name="course_catalog"),
    # Cohort Group Chat REST endpoints
    path("api/cohorts/<uuid:cohort_id>/chat/messages/", CohortChatMessagesView.as_view(), name="cohort_chat_messages"),
    path("api/cohorts/<uuid:cohort_id>/chat/unread-count/", CohortChatUnreadCountView.as_view(), name="cohort_chat_unread"),
    path("api/cohorts/<uuid:cohort_id>/chat/read/", CohortChatMarkReadView.as_view(), name="cohort_chat_read"),
    path("api/cohorts/<uuid:cohort_id>/chat/messages/<uuid:message_id>/", CohortChatDeleteMessageView.as_view(), name="cohort_chat_delete_message"),
    # Mobile App OTA Updates
    path("api/app/version-check/", AppVersionCheckView.as_view(), name="app_version_check"),
    path("api/", include(router.urls)),
]

from django.urls import re_path
from django.views.static import serve
from django.views.decorators.cache import cache_control

# Cache aggressively (30 days) so Cloudflare edge servers handle the load instead of Django
cached_serve = cache_control(max_age=86400 * 30, public=True)(serve)

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', cached_serve, {'document_root': settings.MEDIA_ROOT}),
]

