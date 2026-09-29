import logging
from django.core.management.base import BaseCommand
from question_bank.services.backup_loader import seed_all_curated_banks, parse_master_questions_file

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Loads and seeds official curated backup questions from the Questions/ repository into QuestionBank models."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Parsing curated questions from Questions/ directory..."))
        
        parsed = parse_master_questions_file()
        self.stdout.write(self.style.SUCCESS(f"Found {len(parsed)} exam syllabi in repository."))
        
        for item in parsed:
            matched_course = item.get("course")
            course_name = matched_course.name if matched_course else "NOT MATCHED"
            self.stdout.write(f" - {item['program']} -> {course_name} ({len(item['questions'])} questions)")

        self.stdout.write(self.style.NOTICE("\nSeeding Question Banks in Database..."))
        results = seed_all_curated_banks()
        
        self.stdout.write(self.style.SUCCESS(f"\nSuccessfully created/updated {len(results)} Curated Question Banks:"))
        for course_name, bank_id, total_q in results:
            self.stdout.write(self.style.SUCCESS(f"  [OK] {course_name}: {total_q} questions (ID: {bank_id})"))
