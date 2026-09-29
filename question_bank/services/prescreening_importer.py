import json
import logging
import os
from typing import Dict, List, Optional, Tuple

from django.conf import settings
from courses.models import Course
from question_bank.models import QuestionBank

logger = logging.getLogger(__name__)

FOLDER_TO_COURSE_CODE = {
    "AI_ML": "AI-ML",
    "ANDROID_DEV": "ANDROID-DEV",
    "CAD_MECHANICAL": "CAD-MECHANICAL",
    "CIVIL_INDUSTRIAL": "CIVIL-INDUSTRIAL",
    "CLOUD_DEVOPS": "CLOUD-DEVOPS",
    "CORE_JAVA": "CORE-JAVA",
    "CYBER_SECURITY": "CYBER-SECURITY",
    "DATA_ANALYTICS": "DATA-ANALYTICS",
    "DIGITAL_MARKETING": "DIGITAL-MARKETING",
    "DSA_JAVA": "DSA-JAVA",
    "EMBEDDED_IOT": "EMBEDDED-IOT",
    "FULL_STACK_WEB": "FULL-STACK-WEB",
    "GEN_AI": "GEN-AI",
    "MEDICAL_CODING": "MEDICAL-CODING",
    "PCB_DESIGN": "PCB-DESIGN",
    "ROBOTICS": "ROBOTICS",
    "SALESFORCE": "SALESFORCE",
    "SAP_ABAP": "SAP-ABAP",
    "SAP_MM": "SAP-MM",
    "SOFTWARE_TESTING": "SOFTWARE-TESTING",
    "VLSI_DESIGN": "VLSI-DESIGN",
}


def _normalize_options(raw_options) -> List[str]:
    if not raw_options:
        return []
    if isinstance(raw_options, list):
        return [str(opt).strip() for opt in raw_options if opt is not None and str(opt).strip()]
    if isinstance(raw_options, dict):
        return [str(v).strip() for v in raw_options.values() if v is not None and str(v).strip()]
    return []


def _extract_correct_answer(q: dict, options: List[str]) -> Tuple[str, int]:
    if not options:
        return ("", 0)

    # Check correctOption (index or text)
    c_opt = q.get("correctOption")
    if c_opt is not None:
        if isinstance(c_opt, int) and 0 <= c_opt < len(options):
            return (options[c_opt], c_opt)
        if isinstance(c_opt, str):
            c_opt_str = c_opt.strip().upper()
            letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
            if c_opt_str in letter_map and letter_map[c_opt_str] < len(options):
                idx = letter_map[c_opt_str]
                return (options[idx], idx)
            for idx, opt in enumerate(options):
                if opt.strip().lower() == c_opt.strip().lower():
                    return (opt, idx)

    # Check correct / correct_answer
    raw_ans = q.get("correct") or q.get("correct_answer") or q.get("answer")
    if raw_ans is not None:
        raw_str = str(raw_ans).strip()
        letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
        if raw_str.upper() in letter_map and letter_map[raw_str.upper()] < len(options):
            idx = letter_map[raw_str.upper()]
            return (options[idx], idx)
        for idx, opt in enumerate(options):
            if opt.strip().lower() == raw_str.lower():
                return (opt, idx)

    return (options[0], 0)


def parse_quiz_file_questions(file_path: str) -> List[Dict]:
    if not os.path.exists(file_path):
        return []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        logger.error(f"Error reading quiz JSON {file_path}: {e}")
        return []

    raw_list = []
    if isinstance(data, dict):
        raw_list = data.get("questions", [])
        if not raw_list and "quizzes" in data:
            raw_list = data.get("quizzes", [])
    elif isinstance(data, list):
        raw_list = data

    questions = []
    for idx, q in enumerate(raw_list):
        if not isinstance(q, dict):
            continue
        text = str(q.get("text") or q.get("question") or q.get("prompt") or "").strip()
        image = str(q.get("image") or q.get("image_url") or "").strip()
        options = _normalize_options(q.get("options"))
        if not text and not image:
            continue
        if len(options) < 2:
            continue

        correct_ans, correct_idx = _extract_correct_answer(q, options)
        display_q = text if text else f"Question {idx + 1}: Refer to the image diagram and select the correct option."

        questions.append({
            "id": f"q-{idx + 1}",
            "question": display_q,
            "text": text,
            "image": image,
            "type": "image" if image else "text",
            "options": options,
            "correct": correct_ans,
            "correct_answer": correct_ans,
            "correctOption": correct_idx,
            "explanation": str(q.get("explanation", "")).strip(),
            "marks": q.get("marks", 1),
        })

    return questions


def sync_prescreening_banks_from_disk(overwrite: bool = False, course_code: Optional[str] = None) -> Dict:
    """
    Scans Questions/quiz_catalog.json and Questions/Pre_Screening_Exams to import
    and sync all Pre-Screening Exam question banks into the database.
    """
    base_dir = os.path.join(settings.BASE_DIR, "Questions")
    catalog_path = os.path.join(base_dir, "quiz_catalog.json")

    results = {
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "errors": [],
    }

    # Load from catalog if exists
    quizzes = []
    if os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                catalog = json.load(f)
                quizzes = catalog.get("quizzes", [])
        except Exception as e:
            logger.error(f"Failed to read quiz_catalog.json: {e}")

    # If no catalog or missing entries, scan directory directly
    if not quizzes:
        prescreen_dir = os.path.join(base_dir, "Pre_Screening_Exams")
        if os.path.exists(prescreen_dir):
            for root, _, files in os.walk(prescreen_dir):
                for file in files:
                    if file.endswith(".json"):
                        rel_folder = os.path.basename(root)
                        code = FOLDER_TO_COURSE_CODE.get(rel_folder, rel_folder)
                        full_p = os.path.join(root, file)
                        rel_p = os.path.relpath(full_p, base_dir).replace("\\", "/")
                        title = os.path.splitext(file)[0].replace("_", " ")
                        quizzes.append({
                            "title": title,
                            "course_code": code,
                            "exam_type": "PRESCREENING",
                            "relative_path": rel_p,
                        })

    # Cache courses
    courses_by_code = {c.code: c for c in Course.objects.all()}

    for entry in quizzes:
        c_code = entry.get("course_code")
        if course_code and c_code != course_code:
            continue

        if entry.get("exam_type") != "PRESCREENING":
            continue

        course = courses_by_code.get(c_code)
        if not course:
            results["skipped"] += 1
            continue

        rel_path = entry.get("relative_path", "")
        file_path = os.path.join(base_dir, rel_path.replace("/", os.sep))
        if not os.path.exists(file_path):
            results["skipped"] += 1
            continue

        questions = parse_quiz_file_questions(file_path)
        if not questions:
            results["skipped"] += 1
            continue

        title = entry.get("title") or f"{course.name} Pre-Screening Quiz"
        sets_data = {
            "A": {
                "label": "Paper A",
                "questions": questions,
            }
        }

        existing = QuestionBank.objects.filter(
            course=course,
            title=title,
            bank_type=QuestionBank.BankType.PRESCREENING,
        ).first()

        if existing:
            if overwrite or not existing.sets_data or len(existing.sets_data.get("A", {}).get("questions", [])) < len(questions):
                existing.sets_data = sets_data
                existing.total_questions_per_set = len(questions)
                existing.status = QuestionBank.Status.APPROVED
                existing.lifecycle_status = QuestionBank.LifecycleStatus.OPEN
                existing.is_active = True
                existing.save()
                results["updated"] += 1
            else:
                results["skipped"] += 1
        else:
            QuestionBank.objects.create(
                course=course,
                title=title,
                bank_type=QuestionBank.BankType.PRESCREENING,
                difficulty=QuestionBank.Difficulty.EASY,
                sets_data=sets_data,
                total_questions_per_set=len(questions),
                status=QuestionBank.Status.APPROVED,
                lifecycle_status=QuestionBank.LifecycleStatus.OPEN,
                is_active=True,
            )
            results["created"] += 1

    return results
