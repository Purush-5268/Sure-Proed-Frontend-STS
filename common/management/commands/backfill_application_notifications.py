from django.core.management.base import BaseCommand

from applications.models import Application
from common.models import Notification
from common.services.notifications import display_name, notify_user


class Command(BaseCommand):
    help = "Create missing personalized application notifications for existing applications."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        created = 0
        existing = 0
        applications = Application.objects.select_related("student__user", "course").iterator()
        for application in applications:
            user = application.student.user
            title = "Application received"
            message = (
                f"Hi {display_name(user)}, your application for {application.course.name} "
                f"was submitted successfully. Your application ID is {application.application_number}."
            )
            already_exists = Notification.objects.filter(
                user=user,
                title=title,
                message=message,
                action_url="application_tracker",
            ).exists()
            if already_exists:
                existing += 1
                continue
            if not options["dry_run"]:
                notify_user(
                    user,
                    title=title,
                    message=message,
                    notification_type=Notification.Type.SUCCESS,
                    action_url="application_tracker",
                    dedupe_key=f"application:{application.id}:submitted",
                )
            created += 1

        prefix = "Would create" if options["dry_run"] else "Created"
        self.stdout.write(self.style.SUCCESS(f"{prefix} {created}; already present {existing}."))
