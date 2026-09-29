"""
Management command to immediately reconcile ALL students who have prior permission
but are still SUSPENDED. This restores their application status to their cohort's
current phase (TRAINING, INTERNSHIP_ASSIGNED, etc.).
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Restore access for all students who have prior permission but are still SUSPENDED"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        from applications.models import Application
        from attendance.models import PriorPermission
        from attendance.services.discipline_reconciliation_service import (
            reconcile_student_discipline,
            get_valid_disciplinary_causes,
        )

        dry_run = options['dry_run']

        # Find all SUSPENDED applications
        suspended_apps = Application.objects.filter(
            status=Application.Status.SUSPENDED
        ).select_related('student', 'student__user', 'assigned_cohort')

        self.stdout.write(f"\nFound {suspended_apps.count()} SUSPENDED application(s).\n")

        restored_count = 0
        still_suspended = 0
        errors = 0

        for app in suspended_apps:
            student = app.student
            user = student.user

            # Check if this student has ANY prior permissions
            pp_count = PriorPermission.objects.filter(student=student).count()

            # Get valid disciplinary causes (already excludes sessions with prior permission)
            causes = get_valid_disciplinary_causes(student)

            self.stdout.write(
                f"\n{'='*60}\n"
                f"Student: {user.first_name} {user.last_name} ({user.email})\n"
                f"App: {app.application_number} | Status: {app.status}\n"
                f"Cohort: {app.assigned_cohort.code if app.assigned_cohort else 'N/A'}\n"
                f"Prior Permissions: {pp_count}\n"
                f"Active Disciplinary Causes: {len(causes)}\n"
            )

            if causes:
                self.stdout.write(self.style.WARNING(
                    f"  → Still has {len(causes)} valid cause(s):"
                ))
                for c in causes:
                    self.stdout.write(
                        f"    - {c['session_title']} (date: {c['class_date']}, "
                        f"attendance: {c['attendance_percentage']}%)"
                    )
                still_suspended += 1
            else:
                if dry_run:
                    self.stdout.write(self.style.SUCCESS(
                        f"  → [DRY RUN] Would restore to cohort status"
                    ))
                    restored_count += 1
                else:
                    try:
                        result = reconcile_student_discipline(
                            student,
                            reason="Management command: restore prior permission students"
                        )
                        action = result.get("action")
                        target = result.get("target_status")

                        if action == "RESTORED":
                            self.stdout.write(self.style.SUCCESS(
                                f"  ✓ RESTORED → {target}"
                            ))
                            restored_count += 1
                        elif action == "NOT_SUSPENDED":
                            self.stdout.write(self.style.SUCCESS(
                                f"  ✓ Already not suspended"
                            ))
                            restored_count += 1
                        else:
                            self.stdout.write(self.style.WARNING(
                                f"  → Result: {action} (target: {target})"
                            ))
                            still_suspended += 1
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(
                            f"  ✗ ERROR: {e}"
                        ))
                        errors += 1

        self.stdout.write(
            f"\n{'='*60}\n"
            f"Summary:\n"
            f"  Restored: {restored_count}\n"
            f"  Still Suspended (valid causes): {still_suspended}\n"
            f"  Errors: {errors}\n"
        )
