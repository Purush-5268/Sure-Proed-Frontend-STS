import json
import os
from django.core.management.base import BaseCommand
from courses.models import Course
from question_bank.models import QuestionBank

class Command(BaseCommand):
    help = "Import organized quizzes from Quiz Platform into SureProED Question Banks"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate the import process without writing to the database.",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite existing question banks with the same title and course.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        overwrite = options["overwrite"]

        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        base_dir = os.path.join(backend_dir, "Questions")
        catalog_path = os.path.join(base_dir, "quiz_catalog.json")

        if not os.path.exists(catalog_path):
            self.stderr.write(self.style.ERROR(f"Catalog file not found at: {catalog_path}"))
            return

        with open(catalog_path, "r", encoding="utf-8") as f:
            catalog = json.load(f)

        quizzes = catalog.get("quizzes", [])
        self.stdout.write(self.style.NOTICE(f"Found {len(quizzes)} quizzes in catalog."))

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for entry in quizzes:
            course_code = entry["course_code"]
            rel_path = entry["relative_path"]
            exam_type = entry["exam_type"]
            title = entry["title"]

            course = Course.objects.filter(code=course_code).first()
            if not course:
                self.stdout.write(self.style.WARNING(f"Course code '{course_code}' not found in DB! Skipping '{title}'."))
                skipped_count += 1
                continue

            file_path = os.path.join(base_dir, rel_path.replace("/", os.sep))
            if not os.path.exists(file_path):
                self.stdout.write(self.style.WARNING(f"File not found: {file_path}. Skipping."))
                skipped_count += 1
                continue

            with open(file_path, "r", encoding="utf-8") as f:
                quiz_data = json.load(f)

            raw_questions = quiz_data.get("questions", [])
            questions_payload = []

            for idx, q in enumerate(raw_questions):
                opts = q.get("options", [])
                c_opt = q.get("correctOption", 0)
                if 0 <= c_opt < len(opts):
                    correct_ans = opts[c_opt]
                else:
                    correct_ans = opts[0] if opts else ""

                q_text = q.get("text", "").strip()
                image = q.get("image", "").strip()
                if not q_text and image:
                    q_text = f"Question {idx + 1}: Refer to the image diagram and select the correct option."

                questions_payload.append({
                    "id": f"q-{idx + 1}",
                    "question": q_text,
                    "text": q.get("text", "").strip(),
                    "image": image,
                    "type": "image" if image else "text",
                    "options": opts,
                    "correct": correct_ans,
                    "correct_answer": correct_ans,
                    "correctOption": c_opt,
                    "marks": q.get("marks", 1),
                })

            sets_data = {
                "A": {
                    "label": "Paper A",
                    "questions": questions_payload,
                }
            }

            bank_type = (
                QuestionBank.BankType.PRESCREENING
                if exam_type == "PRESCREENING"
                else QuestionBank.BankType.MODULE_TEST
            )

            existing = QuestionBank.objects.filter(
                course=course,
                title=title,
                bank_type=bank_type,
            ).first()

            if existing:
                if dry_run:
                    self.stdout.write(f"[DRY-RUN] Would update QuestionBank: {title} ({course.code})")
                    updated_count += 1
                else:
                    existing.sets_data = sets_data
                    existing.total_questions_per_set = len(questions_payload)
                    existing.status = QuestionBank.Status.APPROVED
                    existing.lifecycle_status = QuestionBank.LifecycleStatus.OPEN
                    existing.is_active = True
                    existing.save()
                    self.stdout.write(self.style.SUCCESS(f"Updated QuestionBank: {title} ({course.code})"))
                    updated_count += 1
            else:
                if dry_run:
                    self.stdout.write(f"[DRY-RUN] Would create QuestionBank: {title} ({course.code}) [{len(questions_payload)} Qs]")
                    created_count += 1
                else:
                    QuestionBank.objects.create(
                        course=course,
                        title=title,
                        bank_type=bank_type,
                        difficulty=QuestionBank.Difficulty.EASY if bank_type == QuestionBank.BankType.PRESCREENING else QuestionBank.Difficulty.MEDIUM,
                        sets_data=sets_data,
                        total_questions_per_set=len(questions_payload),
                        status=QuestionBank.Status.APPROVED,
                        lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                        is_active=True,
                    )
                    self.stdout.write(self.style.SUCCESS(f"Created QuestionBank: {title} ({course.code}) [{len(questions_payload)} Qs]"))
                    created_count += 1

        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(self.style.NOTICE(f"Import Summary: Created: {created_count}, Updated: {updated_count}, Skipped: {skipped_count}"))
        self.stdout.write("=" * 50 + "\n")
