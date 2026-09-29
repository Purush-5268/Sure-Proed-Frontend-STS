import json
import logging
import os
import random
import re
import uuid
from typing import Dict, List, Optional, Tuple

from django.conf import settings
from courses.models import Course
from question_bank.models import QuestionBank

logger = logging.getLogger(__name__)

DEFAULT_QUESTIONS_DIR = os.path.join(settings.BASE_DIR, "Questions")
MASTER_FILE = os.path.join(DEFAULT_QUESTIONS_DIR, "AnswerOfAllQus.json")

# Course Name & Code Keyword Mapping
COURSE_MATCH_KEYWORDS = {
    "java": ["java", "dsa-java", "dsajava", "core-java", "data structures & algorithms in java"],
    "full stack": ["full stack", "fullstack", "web development", "full-stack-web", "app-fullstack-qa"],
    "cloud": ["cloud", "devops", "cloud computing", "cloud-devops"],
    "genai": ["genai", "generative ai", "gen-ai"],
    "vlsi": ["vlsi", "silicon", "vlsi-design"],
    "testing": ["software testing", "qa automation", "testing", "software-testing", "qa"],
    "embedded": ["embedded", "iot", "embedded-iot"],
    "ai_ml": ["ai & ml", "artificial intelligence", "machine learning", "ai-ml", "data analytics", "data-analytics"],
    "cyber": ["cyber", "cybersecurity", "ethical hacking", "vapt", "cyber-security"],
    "android": ["android", "android-dev"],
}


def _match_course_for_title(program_title: str) -> List[Course]:
    title_lower = program_title.lower()
    courses = list(Course.objects.all())
    matched_courses = []
    
    # 1. Exact or substring match on course name / code
    for c in courses:
        name_lower = c.name.lower()
        code_lower = (c.code or "").lower()
        if name_lower in title_lower or title_lower in name_lower or code_lower in title_lower:
            matched_courses.append(c)
            
    # 2. Keyword category match
    for cat, keywords in COURSE_MATCH_KEYWORDS.items():
        if any(kw in title_lower for kw in keywords):
            for c in courses:
                name_lower = c.name.lower()
                code_lower = (c.code or "").lower()
                if any(kw in name_lower or kw in code_lower for kw in keywords):
                    if c not in matched_courses:
                        matched_courses.append(c)
                    
    return matched_courses


def parse_master_questions_file(file_path: str = MASTER_FILE) -> List[Dict]:
    if not os.path.exists(file_path):
        logger.warning("Master questions file not found at: %s", file_path)
        return []

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    exams = data.get("exams", [])
    parsed_banks = []

    for exam in exams:
        program = exam.get("program", "")
        raw_questions = exam.get("questions", [])
        if not raw_questions:
            continue

        normalized_questions = []
        for q in raw_questions:
            q_text = q.get("question", "").strip()
            raw_options = q.get("options", {})
            raw_answer = q.get("answer", "")

            # Convert options dict {"a": "...", "b": "..."} or list into List[str]
            options_list = []
            if isinstance(raw_options, dict):
                # Sort by key (a, b, c, d)
                for k in sorted(raw_options.keys()):
                    options_list.append(str(raw_options[k]).strip())
            elif isinstance(raw_options, list):
                options_list = [str(opt).strip() for opt in raw_options]

            # Resolve correct answer text
            correct_text = ""
            if isinstance(raw_answer, str):
                ans_clean = raw_answer.strip().lower()
                letter_idx = {"a": 0, "b": 1, "c": 2, "d": 3}
                if ans_clean in letter_idx and letter_idx[ans_clean] < len(options_list):
                    correct_text = options_list[letter_idx[ans_clean]]
                else:
                    correct_text = str(raw_answer).strip()
            elif isinstance(raw_answer, list) and raw_answer:
                # Multiple answers (select first or combined)
                first_ans = str(raw_answer[0]).strip().lower()
                letter_idx = {"a": 0, "b": 1, "c": 2, "d": 3}
                if first_ans in letter_idx and letter_idx[first_ans] < len(options_list):
                    correct_text = options_list[letter_idx[first_ans]]
                else:
                    correct_text = str(raw_answer[0]).strip()

            if q_text and len(options_list) >= 2:
                normalized_questions.append({
                    "id": str(uuid.uuid4()),
                    "question": q_text,
                    "options": options_list,
                    "correct": correct_text,
                    "marks": 1,
                    "topic": program,
                    "explanation": f"Curated verification from {program} syllabus.",
                    "verifier_answer": correct_text,
                    "verifier_result": "MATCH",
                    "confidence": 1.0,
                    "verification_explanation": "Official vetted answer key.",
                    "verified_by": "curated_master_bank",
                    "validation_status": "PASSED",
                    "approval_status": "AUTO_APPROVED",
                    "validation_failures": [],
                    "generated_by": "curated_syllabus_repository",
                })

        if normalized_questions:
            matched_courses = _match_course_for_title(program)
            parsed_banks.append({
                "program": program,
                "questions": normalized_questions,
                "courses": matched_courses,
                "course": matched_courses[0] if matched_courses else None,
            })

    return parsed_banks


def seed_curated_question_bank_for_course(
    course: Course,
    num_sets: int = 4,
    questions_per_set: int = 10,
    bank_type: str = QuestionBank.BankType.PRESCREENING,
) -> Optional[QuestionBank]:
    """
    Creates or updates a QuestionBank using the curated syllabus backup questions.
    """
    banks = parse_master_questions_file()
    matching_bank = None
    
    # 1. Match by course in parsed courses
    for b in banks:
        if any(c.id == course.id for c in b.get("courses", [])):
            matching_bank = b
            break

    # 2. Try finding by name or code substring
    if not matching_bank:
        for b in banks:
            prog_lower = b["program"].lower()
            course_name_lower = course.name.lower()
            course_code_lower = (course.code or "").lower()
            if (
                prog_lower in course_name_lower
                or course_name_lower in prog_lower
                or course_code_lower in prog_lower
            ):
                matching_bank = b
                break

    # 3. Fallback to keyword matching
    if not matching_bank:
        course_name_lower = course.name.lower()
        course_code_lower = (course.code or "").lower()
        for cat, keywords in COURSE_MATCH_KEYWORDS.items():
            if any(kw in course_name_lower or kw in course_code_lower for kw in keywords):
                for b in banks:
                    prog_lower = b["program"].lower()
                    if any(kw in prog_lower for kw in keywords):
                        matching_bank = b
                        break
            if matching_bank:
                break

    if not matching_bank or not matching_bank["questions"]:
        logger.warning("No curated questions found matching course: %s", course.name)
        return None

    all_questions = list(matching_bank["questions"])
    random.seed(42)  # Deterministic shuffle
    random.shuffle(all_questions)

    # Build 4 sets
    set_labels = ["A", "B", "C", "D"][:num_sets]
    sets_data = {}

    for i, label in enumerate(set_labels):
        start_idx = (i * questions_per_set) % len(all_questions)
        set_q = []
        for offset in range(questions_per_set):
            q_copy = dict(all_questions[(start_idx + offset) % len(all_questions)])
            q_copy["id"] = str(uuid.uuid4())
            set_q.append(q_copy)
        sets_data[label] = {
            "label": f"Paper {label}",
            "questions": set_q,
        }

    title = f"{course.name} - Curated Question Bank"
    qb, _ = QuestionBank.objects.update_or_create(
        course=course,
        bank_type=bank_type,
        defaults={
            "title": title,
            "difficulty": QuestionBank.Difficulty.MIXED,
            "total_questions_per_set": questions_per_set,
            "status": QuestionBank.Status.APPROVED,
            "lifecycle_status": QuestionBank.LifecycleStatus.OPEN,
            "is_active": True,
            "is_ai_generated": False,
            "sets_data": sets_data,
            "error_message": None,
            "source_topics": [matching_bank["program"]],
        }
    )
    logger.info("Successfully seeded curated QuestionBank %s for %s", qb.id, course.name)
    return qb


def seed_all_curated_banks() -> List[Tuple[str, str, int]]:
    """Seeds all available curated backup banks for all eligible courses in DB."""
    results = []
    seen_course_ids = set()
    courses = Course.objects.all()
    for course in courses:
        qb = seed_curated_question_bank_for_course(course)
        if qb and course.id not in seen_course_ids:
            seen_course_ids.add(course.id)
            total_q = sum(len(p.get("questions", [])) for p in qb.sets_data.values()) if isinstance(qb.sets_data, dict) else 0
            results.append((course.name, str(qb.id), total_q))
    return results
