from django.urls import path
from .views import VolunteerContributionView

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MentorProfileViewSet,
    VolunteerHelpRequestViewSet,
    VolunteerProfileViewSet,
    VolunteerTaskViewSet,
)

router = DefaultRouter()
router.register(r"tasks", VolunteerTaskViewSet, basename="volunteer-task")
router.register(r"help-requests", VolunteerHelpRequestViewSet, basename="volunteer-help-request")
router.register(r"profiles", VolunteerProfileViewSet, basename="volunteer-profile")
router.register(r"mentor-profiles", MentorProfileViewSet, basename="mentor-profile")

urlpatterns = [
    path("me/contributions/", VolunteerContributionView.as_view(), name="volunteer-contributions"),
    path("<uuid:user_id>/contributions/", VolunteerContributionView.as_view(), name="specific-volunteer-contributions"),
    path("", include(router.urls)),
]
