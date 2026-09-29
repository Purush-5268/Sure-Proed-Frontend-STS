"""Import explicit P/A history without touching staff, credentials, or live sessions."""
import hashlib
import json
from datetime import datetime, time
from pathlib import Path
from uuid import UUID, uuid5

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from attendance.models import Attendance
from cohorts.models import Cohort
from students.models import StudentProfile
from attendance.management.commands.seed_attendance_from_excel import Command as LegacySeed

NAMESPACE = UUID("ec775ac8-1498-473b-b70b-376091157fd3")


class Command(BaseCommand):
    help = "Dry-run historical register reconciliation; use --apply --confirm-plan SHA to import."

    def add_arguments(self, parser):
        parser.add_argument("--attendance-file", required=True)
        parser.add_argument("--seed-file", required=True)
        parser.add_argument("--cohort-id", required=True)
        parser.add_argument("--expected-students", type=int, default=27)
        parser.add_argument("--expected-sessions", type=int, default=50)
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--confirm-plan")
        parser.add_argument("--report")

    def handle(self, *args, **options):
        with transaction.atomic():
            report = self.reconcile(options)
        if options.get("report"):
            Path(options["report"]).write_text(json.dumps(report, indent=2), encoding="utf-8")
        self.stdout.write(json.dumps(report, sort_keys=True))

    def reconcile(self, options):
        attendance_path, seed_path = Path(options["attendance_file"]), Path(options["seed_file"])
        cohort = Cohort.objects.select_for_update().select_related("course").get(pk=options["cohort_id"])
        if cohort.code != "G2-26" or cohort.course.code != "VLSI-DESIGN":
            raise CommandError("This mapping is only valid for G2-26 / VLSI-DESIGN.")
        source_hash = hashlib.sha256(attendance_path.read_bytes()).hexdigest()
        seed_hash = hashlib.sha256(seed_path.read_bytes()).hexdigest()
        seed = openpyxl.load_workbook(seed_path, read_only=True, data_only=True)
        try:
            rows = list(seed.active.values)
        finally:
            seed.close()
        email_columns = [i for i, h in enumerate(rows[0]) if "email" in str(h or "").lower()]
        if len(email_columns) != 1:
            raise CommandError("Seed must contain exactly one email column.")
        emails = [str(r[email_columns[0]]).strip().lower() for r in rows[1:] if r[email_columns[0]]]
        if len(emails) != options["expected_students"] or len(set(emails)) != len(emails):
            raise CommandError("Seed student count or uniqueness differs from the reviewed source.")
        mapping = LegacySeed.EXPLICIT_STUDENT_MAP
        if any(e not in mapping for e in emails):
            raise CommandError("A seed student has no explicit register mapping; fuzzy matching is disabled.")
        if len({mapping[e] for e in emails}) != len(emails):
            raise CommandError("Multiple accounts map to the same historical student.")

        wb = openpyxl.load_workbook(attendance_path, read_only=True, data_only=True)
        try:
            register = list(wb["Attendance Register"].values)
            daily = list(wb["Daily Summary"].values)
        finally:
            wb.close()
        meta = {}
        for row in daily[1:]:
            if not row[0]:
                continue
            label = str(row[2]).strip()
            if label in meta:
                raise CommandError("Duplicate historical session label.")
            date = row[1].date() if isinstance(row[1], datetime) else row[1]
            if isinstance(date, str):
                date = datetime.fromisoformat(date).date()
            if not date or date >= timezone.localdate():
                raise CommandError("Historical session date is missing or not in the past.")
            meta[label] = date
        columns = [(i, str(v).strip()) for i, v in enumerate(register[1]) if i >= 3 and str(v).strip() in meta]
        if len(columns) != options["expected_sessions"] or len(set(label for _, label in columns)) != len(columns) or len(columns) != len(meta):
            raise CommandError("Session columns do not match the complete daily summary.")
        named_rows = {}
        for index, row in enumerate(register[2:], 3):
            if not row[1]:
                continue
            name = str(row[1]).strip().upper()
            if name in named_rows:
                raise CommandError("Duplicate register student name.")
            named_rows[name] = (index, row)

        students = {}
        student_report = []
        for email in sorted(emails):
            matches = list(StudentProfile.objects.select_for_update().filter(user__email__iexact=email, user__role="STUDENT"))
            if len(matches) != 1:
                raise CommandError("A mapped primary email does not resolve to exactly one STUDENT profile.")
            profile = matches[0]
            if not profile.applications.filter(assigned_cohort=cohort).exists():
                raise CommandError("A mapped student has no application for the target cohort.")
            if mapping[email] not in named_rows:
                raise CommandError("An explicit student mapping is absent from the register.")
            row_number, row = named_rows[mapping[email]]
            marks = {label: str(row[i] or "").strip().upper() for i, label in columns}
            if any(mark not in {"P", "A"} for mark in marks.values()):
                raise CommandError("Only explicit P/A marks may be imported; blanks are not absences.")
            students[str(profile.pk)] = (profile, row_number, marks)
            student_report.append({"student_code": profile.student_code, "present": sum(m == "P" for m in marks.values()), "total": len(columns)})

        planned = []
        for _, label in columns:
            pk = uuid5(NAMESPACE, f"{cohort.pk}:whatsapp-register:{meta[label]}:{label}")
            snapshot = {
                "source": "HISTORICAL_REGISTER", "source_file": attendance_path.name,
                "source_sha256": source_hash, "seed_sha256": seed_hash,
                "sheet": "Attendance Register", "session_label": label, "time_known": False,
                "expected_students": {sid: {"status": "PRESENT" if marks[label] == "P" else "ABSENT", "source_row": rownum}
                                      for sid, (profile, rownum, marks) in students.items()},
            }
            planned.append((pk, label, meta[label], snapshot))
        plan_hash = hashlib.sha256(json.dumps(
            [(str(pk), label, str(date), snapshot) for pk, label, date, snapshot in planned], sort_keys=True
        ).encode()).hexdigest()
        if options["apply"] and options.get("confirm_plan") != plan_hash:
            raise CommandError("Import requires --confirm-plan matching the exact dry-run plan SHA.")

        existing_count = 0
        for pk, label, date, snapshot in planned:
            existing = Attendance.objects.filter(pk=pk).first()
            if existing:
                present_ids = {sid for sid, result in snapshot["expected_students"].items() if result["status"] == "PRESENT"}
                if (existing.historical_attendance_data != snapshot or existing.cohort_id != cohort.pk
                    or existing.course_id != cohort.course_id or existing.class_date != date
                    or existing.class_status != "COMPLETED" or not existing.conducted
                    or existing.google_meet_attendance_data or existing.meeting_link
                    or set(str(v) for v in existing.attendees.values_list("pk", flat=True)) != present_ids):
                    raise CommandError("Existing imported record differs; refusing to overwrite.")
                existing_count += 1
            elif Attendance.objects.filter(cohort=cohort, class_date=date).exclude(pk__in=[p[0] for p in planned]).exists():
                raise CommandError("An existing session overlaps a source date; review it before importing.")

        if options["apply"]:
            for pk, label, date, snapshot in planned:
                if Attendance.objects.filter(pk=pk).exists():
                    continue
                record = Attendance.objects.create(
                    id=pk, cohort=cohort, course=cohort.course, class_date=date,
                    title=f"{cohort.code} VLSI — Historical attendance — {label}",
                    start_time=time(0, 0), end_time=None, conducted=True, class_status="COMPLETED",
                    historical_attendance_data=snapshot,
                    notes="Imported historical P/A register. Session time and duration were not recorded.",
                )
                record.attendees.set([profile for profile, _, marks in students.values() if marks[label] == "P"])
        return {
            "applied": options["apply"], "plan_sha256": plan_hash, "source_sha256": source_hash,
            "seed_sha256": seed_hash, "sessions": len(planned), "existing": existing_count,
            "new": len(planned)-existing_count, "students": len(students),
            "marks": len(planned)*len(students), "student_totals": student_report,
        }

