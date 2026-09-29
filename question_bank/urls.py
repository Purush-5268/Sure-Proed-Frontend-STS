from rest_framework.routers import DefaultRouter

from .views import QuestionBankViewSet

router = DefaultRouter()
router.register("", QuestionBankViewSet, basename="questionbank")

urlpatterns = router.urls
