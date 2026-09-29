from django.apps import AppConfig


class QuestionBankConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "question_bank"
    verbose_name = "Question Banks & AI Generator"

    def ready(self):
        # Register Celery tasks on application startup and make the task module
        # available for deterministic test patching.
        from . import tasks  # noqa: F401
