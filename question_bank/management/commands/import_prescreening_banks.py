from django.core.management.base import BaseCommand
from question_bank.services.prescreening_importer import sync_prescreening_banks_from_disk


class Command(BaseCommand):
    help = "Import and sync pre-screening quiz files from Questions/Pre_Screening_Exams into QuestionBank records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite existing question banks with the same title.",
        )
        parser.add_argument(
            "--course",
            type=str,
            default=None,
            help="Specific course code to import for (e.g. AI-ML).",
        )

    def handle(self, *args, **options):
        overwrite = options.get("overwrite", False)
        course_code = options.get("course")

        self.stdout.write(self.style.NOTICE("Starting import of Pre-Screening Question Banks..."))
        results = sync_prescreening_banks_from_disk(overwrite=overwrite, course_code=course_code)

        self.stdout.write(self.style.SUCCESS(
            f"Import complete! Created: {results['created']}, Updated: {results['updated']}, Skipped: {results['skipped']}"
        ))
