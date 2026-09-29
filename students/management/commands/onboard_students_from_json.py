import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from applications.models import Application
from cohorts.models import Cohort
from students.models import StudentProfile


PRESERVED_COHORT_CODES = {"G3-26", "G31", "G40", "G19"}


def normalize_email(value):
    return re.sub(r"\s+", "", str(value or "")).lower()


def normalize_phone(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def normalize_gender(value):
    cleaned = str(value or "").strip().upper()
    return {
        "M": User.Gender.MALE,
        "MALE": User.Gender.MALE,
        "F": User.Gender.FEMALE,
        "FEMALE": User.Gender.FEMALE,
        "O": User.Gender.OTHER,
        "OTHER": User.Gender.OTHER,
    }.get(cleaned)


def normalize_education_level(value):
    cleaned = str(value or "").strip().upper()
    return {
        "UG": StudentProfile.EducationLevel.UNDERGRADUATE,
        "UNDERGRADUATE": StudentProfile.EducationLevel.UNDERGRADUATE,
        "PG": StudentProfile.EducationLevel.POSTGRADUATE,
        "POSTGRADUATE": StudentProfile.EducationLevel.POSTGRADUATE,
        "DIPLOMA": StudentProfile.EducationLevel.DIPLOMA,
    }.get(cleaned, StudentProfile.EducationLevel.OTHER)


def normalize_github_username(value):
    cleaned = str(value or "").strip().replace(" ", "")
    if not cleaned:
        return ""
    match = re.search(r"github\.com/([^/?#]+)", cleaned, flags=re.IGNORECASE)
    username = match.group(1) if match else cleaned.lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", username):
        return ""
    return username


class Command(BaseCommand):
    help = "Safely onboard canonical student records from a validated JSON export."

    def add_arguments(self, parser):
        parser.add_argument("json_path", type=str)
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Commit changes. Without this flag the command performs a dry run.",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="Cohorts@2026",
            help="Common default password for created student accounts (defaults to Cohorts@2026).",
        )
        parser.add_argument("--report", type=str, default="onboard_students_report.json")

    def handle(self, *args, **options):
        source_path = Path(options["json_path"])
        report_path = Path(options["report"])
        should_apply = bool(options["apply"])
        common_password = options.get("password") or "Cohorts@2026"
        if not source_path.is_file():
            raise CommandError(f"Canonical JSON file not found: {source_path}")

        try:
            rows = json.loads(source_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f"Unable to read canonical JSON: {exc}") from exc
        if not isinstance(rows, list) or not rows:
            raise CommandError("Canonical JSON must contain a non-empty list of records.")

        cohort_codes = {str(row.get("cohort_code") or "").strip() for row in rows}
        preserved = cohort_codes & PRESERVED_COHORT_CODES
        if preserved:
            raise CommandError(
                "Input contains preserved cohorts that must not be modified: "
                + ", ".join(sorted(preserved))
            )
        if "" in cohort_codes:
            raise CommandError("Every record must include cohort_code.")

        cohorts = {cohort.code: cohort for cohort in Cohort.objects.select_related("course").filter(code__in=cohort_codes)}
        missing_cohorts = cohort_codes - set(cohorts)
        if missing_cohorts:
            raise CommandError("Cohorts not found: " + ", ".join(sorted(missing_cohorts)))
        if any(cohorts[code].course_id is None for code in cohort_codes):
            raise CommandError("Every target cohort must have a course.")

        emails = [normalize_email(row.get("email")) for row in rows]
        phones = [normalize_phone(row.get("phone_number")) for row in rows]
        duplicate_emails = sorted(key for key, count in Counter(emails).items() if key and count > 1)
        duplicate_phones = sorted(key for key, count in Counter(phones).items() if key and count > 1)
        if duplicate_emails:
            raise CommandError(f"Input contains {len(duplicate_emails)} duplicate email keys.")
        if duplicate_phones:
            raise CommandError(f"Input contains {len(duplicate_phones)} duplicate phone keys.")

        existing_users = list(User.objects.all())
        users_by_email = {normalize_email(user.email): user for user in existing_users if user.email}
        users_by_mapped_email = {
            normalize_email(user.mapped_email): user for user in existing_users if user.mapped_email
        }
        users_by_phone = {}
        for user in existing_users:
            phone = normalize_phone(user.phone_number)
            if phone:
                users_by_phone.setdefault(phone, []).append(user)

        decisions = []
        blocking_conflicts = []
        for index, row in enumerate(rows, start=1):
            email = emails[index - 1]
            phone = phones[index - 1]
            cohort_code = str(row.get("cohort_code") or "").strip()
            source_row = row.get("source_row")
            reason = "CREATE"
            existing_user = users_by_email.get(email)

            if not email or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                reason = "INVALID_EMAIL"
            elif not str(row.get("first_name") or "").strip():
                reason = "MISSING_FIRST_NAME"
            elif len(phone) != 10:
                reason = "INVALID_PHONE"
            elif email in users_by_mapped_email and users_by_mapped_email[email] is not existing_user:
                reason = "EMAIL_USED_AS_MAPPED_EMAIL"
            elif users_by_phone.get(phone) and all(user is not existing_user for user in users_by_phone[phone]):
                reason = "PHONE_USED_BY_ANOTHER_ACCOUNT"
            elif existing_user:
                if existing_user.role != User.Role.STUDENT or not hasattr(existing_user, "student_profile"):
                    reason = "EXISTING_NON_STUDENT_OR_MISSING_PROFILE"
                elif Application.objects.filter(
                    student=existing_user.student_profile,
                    assigned_cohort__code=cohort_code,
                ).exists():
                    reason = "ALREADY_ONBOARDED"
                else:
                    reason = "EXISTING_STUDENT_DIFFERENT_COHORT"

            decision = {
                "source_row": source_row,
                "cohort_code": cohort_code,
                "result": reason,
            }
            decisions.append(decision)
            if reason not in {"CREATE", "ALREADY_ONBOARDED"}:
                blocking_conflicts.append(decision)

        counts = Counter(decision["result"] for decision in decisions)
        report = {
            "mode": "apply" if should_apply else "dry-run",
            "input_records": len(rows),
            "cohort_counts": dict(sorted(Counter(row["cohort_code"] for row in rows).items())),
            "decision_counts": dict(sorted(counts.items())),
            "created_users": 0,
            "created_profiles": 0,
            "created_applications": 0,
            "preserved_cohort_codes": sorted(PRESERVED_COHORT_CODES),
            "decisions": decisions,
        }

        if blocking_conflicts:
            self._write_report(report_path, report)
            raise CommandError(
                f"Validation found {len(blocking_conflicts)} blocking conflicts. No records were changed."
            )

        if should_apply:
            with transaction.atomic():
                for row, decision in zip(rows, decisions):
                    if decision["result"] == "ALREADY_ONBOARDED":
                        continue
                    cohort = cohorts[row["cohort_code"]]
                    dob = self._parse_date(row.get("date_of_birth"))
                    gender = normalize_gender(row.get("gender"))
                    phone = normalize_phone(row.get("phone_number"))
                    email = normalize_email(row.get("email"))
                    user = User.objects.create(
                        email=email,
                        first_name=str(row.get("first_name") or "").strip()[:100],
                        last_name=str(row.get("last_name") or "").strip()[:100],
                        gender=gender,
                        phone_number=phone,
                        date_of_birth=dob,
                        role=User.Role.STUDENT,
                        is_active=True,
                        is_email_verified=True,
                    )
                    user.set_password(common_password)
                    user.save(update_fields=["password", "updated_at"])
                    report["created_users"] += 1

                    profile = user.student_profile
                    profile.date_of_birth = dob
                    profile.college = str(row.get("college") or "").strip()[:255]
                    profile.degree = str(row.get("degree") or "").strip()[:150]
                    profile.education_level = normalize_education_level(row.get("education_level"))
                    profile.specialization = str(row.get("specialization") or "").strip()[:150]
                    profile.graduation_year = row.get("graduation_year") or None
                    profile.country = str(row.get("country") or "India").strip()[:100]
                    profile.state = str(row.get("state") or "").strip()[:100]
                    profile.city = str(row.get("city") or "").strip()[:100]
                    profile.linkedin_url = None
                    github_username = normalize_github_username(row.get("github_username"))
                    profile.github_username = github_username or None
                    profile.github_url = f"https://github.com/{github_username}" if github_username else None
                    profile.is_public = False
                    profile.save()
                    report["created_profiles"] += 1

                    Application.objects.create(
                        student=profile,
                        course=cohort.course,
                        assigned_cohort=cohort,
                        status=Application.Status.TRAINING,
                        qualified=True,
                    )
                    report["created_applications"] += 1

        self._write_report(report_path, report)
        self.stdout.write(self.style.SUCCESS(json.dumps({
            "mode": report["mode"],
            "input_records": report["input_records"],
            "cohort_counts": report["cohort_counts"],
            "decision_counts": report["decision_counts"],
            "created_users": report["created_users"],
            "created_profiles": report["created_profiles"],
            "created_applications": report["created_applications"],
        }, sort_keys=True)))

    @staticmethod
    def _parse_date(value):
        if not value:
            return None
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise CommandError(f"Invalid ISO date in canonical input: {value}") from exc

    @staticmethod
    def _write_report(path, report):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
