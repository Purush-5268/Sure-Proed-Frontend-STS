import logging
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from cohorts.models import Cohort
from common.models import Notification, Announcement
from common.services.notifications import display_name, notify_user
from common.services.email_service import send_transactional_email

logger = logging.getLogger(__name__)
User = get_user_model()


class Command(BaseCommand):
    help = "Send 'Welcome to Sureproed beta version Testing Users' notification and announcement to students."

    def add_arguments(self, parser):
        parser.add_argument(
            "--cohort",
            type=str,
            default="G2-26",
            help="Cohort code to target (default: G2-26). Pass 'ALL' to target all enrolled students.",
        )
        parser.add_argument(
            "--send-email",
            action="store_true",
            default=False,
            help="Also send transactional welcome email to recipient mailboxes.",
        )
        parser.add_argument(
            "--create-announcement",
            action="store_true",
            default=True,
            help="Create a pinned dashboard announcement for the cohort/students.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate and display intended recipients without writing to the database.",
        )

    def handle(self, *args, **options):
        cohort_code = options["cohort"].strip()
        send_email = options["send_email"]
        create_announcement = options["create_announcement"]
        dry_run = options["dry_run"]

        title = "Welcome to Sureproed beta version Testing Users"
        
        cohort = None
        if cohort_code.upper() != "ALL":
            cohort = Cohort.objects.filter(code__iexact=cohort_code).first()
            if not cohort:
                self.stderr.write(self.style.ERROR(f"Cohort with code '{cohort_code}' not found."))
                return
            users_qs = User.objects.filter(
                student_profile__applications__assigned_cohort=cohort
            ).distinct()
        else:
            users_qs = User.objects.filter(role=User.Role.STUDENT, is_active=True).distinct()

        users = list(users_qs)
        if not users:
            self.stdout.write(self.style.WARNING("No target students found."))
            return

        self.stdout.write(f"Targeting {len(users)} student(s) in cohort '{cohort_code}'...")

        # 1. Pinned Dashboard Announcement
        if create_announcement and not dry_run:
            announcement_msg = (
                "Welcome to the Sureproed Beta Testing Program! We are thrilled to have you test our platform. "
                "Explore your active training modules, attendance schedules, and resources on your dashboard. "
                "Your feedback helps us continuously improve the experience."
            )
            ann, ann_created = Announcement.objects.get_or_create(
                title=title,
                cohort=cohort,
                defaults={
                    "message": announcement_msg,
                    "target_audience": Announcement.TargetAudience.COHORT if cohort else Announcement.TargetAudience.STUDENTS,
                    "is_pinned": True,
                    "is_active": True,
                },
            )
            status_txt = "Created" if ann_created else "Already active"
            self.stdout.write(self.style.SUCCESS(f"[Announcement]: {status_txt} -> '{title}'"))

        # 2. Individual In-App Notification (+ optional email)
        notified_count = 0
        emails_sent_count = 0

        for user in users:
            name = display_name(user)
            course_name = ""
            if cohort and cohort.course:
                course_name = f" for {cohort.course.name}"
            
            message = (
                f"Hi {name}, welcome to Sureproed beta version testing! "
                f"Your account and enrollment{course_name} are active. "
                f"Explore your dashboard, track your timetable, and share your feedback."
            )

            if dry_run:
                self.stdout.write(f"  [DRY RUN] Would notify: {user.email} ({name})")
                notified_count += 1
                continue

            notif = notify_user(
                user,
                title=title,
                message=message,
                notification_type=Notification.Type.SUCCESS,
                action_url="dashboard",
                dedupe_key=f"welcome_beta:{user.id}",
            )
            if notif:
                notified_count += 1

            if send_email and user.email:
                subject = "Welcome to Sureproed Beta Testing!"
                email_sent = send_transactional_email(
                    subject=subject,
                    message=message,
                    recipient_list=[user.email],
                )
                if email_sent:
                    emails_sent_count += 1

        prefix = "[DRY RUN] Would notify" if dry_run else "Successfully notified"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS(f"{prefix} {notified_count} student(s)."))
        if send_email:
            self.stdout.write(self.style.SUCCESS(f"Emails sent: {emails_sent_count}"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
