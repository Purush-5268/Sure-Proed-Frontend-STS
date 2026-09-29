import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from students.models import StudentProfile


class Command(BaseCommand):
    help = "Preview or quarantine unreferenced photo files for one student."

    def add_arguments(self, parser):
        parser.add_argument("--student-code", required=True)
        parser.add_argument(
            "--quarantine",
            action="store_true",
            help="Move orphan files into a recoverable quarantine directory. Default is preview only.",
        )
        parser.add_argument(
            "--keep-latest",
            action="store_true",
            help=(
                "Select the newest readable legacy photo, normalize it to the deterministic current filename, "
                "and update the database. Requires --quarantine to make changes."
            ),
        )

    def handle(self, *args, **options):
        student_code = options["student_code"].strip()
        profile = StudentProfile.objects.filter(student_code__iexact=student_code).first()
        if not profile:
            raise CommandError(f"Student profile '{student_code}' was not found.")

        media_root = Path(settings.MEDIA_ROOT).resolve()
        photos_root = (media_root / "students" / "photos").resolve()
        if not photos_root.exists():
            self.stdout.write(self.style.WARNING(f"Photo directory does not exist: {photos_root}"))
            return
        if not photos_root.is_relative_to(media_root):
            raise CommandError("Resolved student photo directory is outside MEDIA_ROOT.")

        active_name = profile.profile_photo.name if profile.profile_photo else ""
        active_path = (media_root / active_name).resolve() if active_name else None
        candidates = sorted(
            path for path in photos_root.glob(f"{profile.student_code}_photo*")
            if path.is_file() and path.resolve().is_relative_to(photos_root)
        )
        selected_latest = None
        if options["keep_latest"] and candidates:
            from PIL import Image

            readable = []
            for candidate in candidates:
                try:
                    with Image.open(candidate) as image:
                        image.verify()
                    readable.append(candidate)
                except Exception:
                    self.stdout.write(self.style.WARNING(f"  INVALID {candidate.name}"))
            if readable:
                selected_latest = max(readable, key=lambda path: path.stat().st_mtime_ns)
                active_path = selected_latest.resolve()

        orphans = [
            path for path in candidates
            if active_path is None or path.resolve() != active_path
        ]

        self.stdout.write(f"Student: {profile.student_code}")
        self.stdout.write(f"Database photo: {active_name or '(none)'}")
        if options["keep_latest"]:
            self.stdout.write(
                f"Newest readable photo: {selected_latest.name if selected_latest else '(none)'}"
            )
        self.stdout.write(f"Matching files: {len(candidates)}")
        self.stdout.write(f"Unreferenced files: {len(orphans)}")
        for orphan in orphans:
            self.stdout.write(f"  ORPHAN {orphan.name}")

        if not options["quarantine"]:
            self.stdout.write(self.style.WARNING("Preview only; no files were moved."))
            return
        if not orphans and not selected_latest:
            self.stdout.write(self.style.SUCCESS("Nothing to quarantine."))
            return

        timestamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
        quarantine_root = (
            media_root / "quarantine" / "student_photos" / profile.student_code / timestamp
        ).resolve()
        if not quarantine_root.is_relative_to(media_root):
            raise CommandError("Resolved quarantine directory is outside MEDIA_ROOT.")
        quarantine_root.mkdir(parents=True, exist_ok=False)

        for orphan in orphans:
            shutil.move(str(orphan), str(quarantine_root / orphan.name))

        if selected_latest:
            deterministic_name = f"{profile.student_code}_photo.jpg"
            deterministic_path = photos_root / deterministic_name
            if selected_latest.resolve() != deterministic_path.resolve():
                shutil.move(str(selected_latest), str(deterministic_path))
            relative_name = deterministic_path.relative_to(media_root).as_posix()
            StudentProfile.objects.filter(pk=profile.pk).update(profile_photo=relative_name)

        self.stdout.write(
            self.style.SUCCESS(
                f"Moved {len(orphans)} orphan file(s) to {quarantine_root}. "
                + (
                    f"The newest readable photo is now {profile.student_code}_photo.jpg."
                    if selected_latest
                    else "The database-referenced photo was preserved."
                )
            )
        )
