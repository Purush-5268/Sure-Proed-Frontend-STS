import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from accounts.views import _is_synthetic_linkedin_url
from students.models import StudentProfile
from volunteers.models import MentorProfile


class Command(BaseCommand):
    help = "Scan for and remove synthetic LinkedIn profile URLs generated from OAuth subject IDs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply the cleanup to the database. Without this flag, only a dry-run report is generated.",
        )
        parser.add_argument(
            "--report",
            type=str,
            default="cleanup_linkedin_urls_report.json",
            help="Path to save the JSON audit report.",
        )

    def handle(self, *args, **options):
        should_apply = bool(options.get("apply"))
        report_path = Path(options.get("report") or "cleanup_linkedin_urls_report.json")

        cleaned_students = []
        for profile in StudentProfile.objects.select_related("user").filter(linkedin_url__isnull=False).exclude(linkedin_url=""):
            sub = profile.linkedin_id
            if _is_synthetic_linkedin_url(profile.linkedin_url, sub):
                cleaned_students.append({
                    "profile_id": str(profile.id),
                    "user_id": str(profile.user_id),
                    "email": profile.user.email,
                    "linkedin_id": sub,
                    "invalid_url": profile.linkedin_url,
                })
                if should_apply:
                    profile.linkedin_url = None
                    profile.save(update_fields=["linkedin_url"])

        cleaned_mentors = []
        for profile in MentorProfile.objects.select_related("user").filter(linkedin_url__isnull=False).exclude(linkedin_url=""):
            # If mentor has linkedin sub or URL matches synthetic pattern
            user = profile.user
            sub = getattr(user, "linkedin_id", None)
            if _is_synthetic_linkedin_url(profile.linkedin_url, sub):
                cleaned_mentors.append({
                    "profile_id": str(profile.id),
                    "user_id": str(profile.user_id),
                    "email": profile.user.email,
                    "linkedin_id": sub,
                    "invalid_url": profile.linkedin_url,
                })
                if should_apply:
                    profile.linkedin_url = None
                    profile.save(update_fields=["linkedin_url"])

        report = {
            "mode": "apply" if should_apply else "dry-run",
            "cleaned_student_count": len(cleaned_students),
            "cleaned_students": cleaned_students,
            "cleaned_mentor_count": len(cleaned_mentors),
            "cleaned_mentors": cleaned_mentors,
        }

        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

        self.stdout.write(self.style.SUCCESS(
            f"Mode: {report['mode']} | Found {len(cleaned_students)} student profiles and {len(cleaned_mentors)} mentor profiles with synthetic LinkedIn URLs."
        ))
