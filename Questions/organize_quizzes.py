import os
import json
import glob
import re
import hashlib
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, "Quiz_platform_quizes")
DEST_DIR = os.path.join(BASE_DIR, "Organized_Quizzes")

# Course code & quiz mapping configuration
# Format: Title -> (Course Code, Type: "PRESCREENING" | "MODULE_TEST" | "TEST", Clean Title, Module Topic/Target)
QUIZ_METADATA = {
    "AI and ML Screening Test": ("AI-ML", "PRESCREENING", "AI_and_ML_Screening_Test", "AI & ML Prerequisite Screening"),
    "Python Screening Test": ("AI-ML", "PRESCREENING", "Python_Screening_Test", "Python Programming Screening"),
    "DATA SCIENCE": ("AI-ML", "PRESCREENING", "Data_Science_Screening_Test", "Data Science & Math Screening"),
    "Data Analytics Test": ("DATA-ANALYTICS", "PRESCREENING", "Data_Analytics_Screening_Test", "Data Analytics & SQL Screening"),
    "Full Stack Development": ("FULL-STACK-WEB", "PRESCREENING", "Full_Stack_Development_Screening_Test", "Web Basics & Programming Screening"),
    "Basic HTML, CSS & JavaScript": ("FULL-STACK-WEB", "MODULE_TEST", "Basic_HTML_CSS_JavaScript", "Module 1: Web Fundamentals"),
    "HTML & CSS": ("FULL-STACK-WEB", "MODULE_TEST", "HTML_and_CSS_Core", "Module 1: HTML & CSS Core"),
    "JavaScript Basics": ("FULL-STACK-WEB", "MODULE_TEST", "JavaScript_Basics", "Module 2: JavaScript Essentials"),
    "Cyber Security": ("CYBER-SECURITY", "PRESCREENING", "Cyber_Security_Screening_Test", "Networking & Security Screening"),
    "Embedded Systems and IoT": ("EMBEDDED-IOT", "PRESCREENING", "Embedded_Systems_and_IoT_Screening_Test", "Embedded C & IoT Screening"),
    "INTEGRATED VLSI ADMISSION TEST": ("VLSI-DESIGN", "PRESCREENING", "Integrated_VLSI_Admission_Test", "Digital Electronics & CMOS Screening"),
    "Module 1 - Integrated VLSI": ("VLSI-DESIGN", "MODULE_TEST", "Module_1_Integrated_VLSI", "Module 1: Introduction to VLSI"),
    "Module 1 Quiz for G2-26 VLSI Batch": ("VLSI-DESIGN", "MODULE_TEST", "Module_1_VLSI_Batch_Test", "Module 1: VLSI Design Overview"),
    "MODULE 1  QUIZ": ("VLSI-DESIGN", "MODULE_TEST", "Module_1_VLSI_Concepts", "Module 1: VLSI Concepts"),
    "G3-2026  Module 1": ("VLSI-DESIGN", "MODULE_TEST", "Module_1_VLSI_Basics", "Module 1: VLSI Basics"),
    "Module 2 - RTL": ("VLSI-DESIGN", "MODULE_TEST", "Module_2_RTL_Design", "Module 2: RTL & Verilog"),
    "Module 4 - DFT": ("VLSI-DESIGN", "MODULE_TEST", "Module_4_DFT", "Module 4: Design for Testability"),
    "DFT": ("VLSI-DESIGN", "MODULE_TEST", "Module_4_DFT_With_Images", "Module 4: Design for Testability"),
    "DFT Quiz": ("VLSI-DESIGN", "MODULE_TEST", "Module_4_DFT_Concepts", "Module 4: DFT Concepts"),
    "DFT Quiz by Abhishek sir": ("VLSI-DESIGN", "MODULE_TEST", "Module_4_DFT_Advanced", "Module 4: DFT Advanced"),
    "DEF Assignment Quiz for G1-26 by Sri. Abhishek": ("VLSI-DESIGN", "MODULE_TEST", "DFT_DEF_Assignment_Quiz", "Module 4: DFT/DEF Assignment"),
    "Module 5 - Physical Design": ("VLSI-DESIGN", "MODULE_TEST", "Module_5_Physical_Design", "Module 5: Physical Design & Floorplanning"),
    "Module 6 - AMS": ("VLSI-DESIGN", "MODULE_TEST", "Module_6_AMS", "Module 6: Analog & Mixed Signal"),
    "Module 6 Quiz for G3 - G4 VLSI": ("VLSI-DESIGN", "MODULE_TEST", "Module_6_AMS_Assessment", "Module 6: AMS Assessment"),
    "G15 AutoCAD Admission Test": ("CAD-MECHANICAL", "PRESCREENING", "AutoCAD_Admission_Test", "AutoCAD & Engineering Drawing Screening"),
    "Gen AI": ("GEN-AI", "PRESCREENING", "Generative_AI_Screening_Test", "Generative AI Screening"),
    "JAVA": ("CORE-JAVA", "PRESCREENING", "Java_Applications_Screening_Test", "Java Programming Screening"),
    "Java Programming Assessment": ("CORE-JAVA", "MODULE_TEST", "Java_Programming_Assessment", "Module Test: Java OOP & Logic"),
    "DSA in Java Test": ("DSA-JAVA", "PRESCREENING", "DSA_in_Java_Admission_Test", "DSA in Java Screening"),
    "DSA in Java Test on 24-03-2026": ("DSA-JAVA", "PRESCREENING", "DSA_in_Java_Comprehensive_Test", "Comprehensive DSA in Java"),
    "DSA C++ Admission Test": ("DSA-JAVA", "PRESCREENING", "DSA_CPP_Admission_Test", "DSA in C++ Screening"),
    "DSA in Java Performance Test": ("DSA-JAVA", "MODULE_TEST", "DSA_in_Java_Performance_Test", "Module Test: DSA Practical"),
    "Cloud and Devops": ("CLOUD-DEVOPS", "PRESCREENING", "Cloud_and_DevOps_Screening_Test", "Cloud & Linux Screening"),
    "Digital Marketing": ("DIGITAL-MARKETING", "PRESCREENING", "Digital_Marketing_Screening_Test", "Digital Marketing Screening"),
    "Flutter Test Paper  Beginner to Advanced": ("ANDROID-DEV", "PRESCREENING", "Flutter_Android_Screening_Test", "Mobile App Development Screening"),
    "Med coding": ("MEDICAL-CODING", "PRESCREENING", "Medical_Coding_Screening_Test", "Medical Coding & Terminology Screening"),
    "PCB Designing Admission test": ("PCB-DESIGN", "PRESCREENING", "PCB_Designing_Admission_Test", "Circuit Design & PCB Screening"),
    "Robotics Screening Test": ("ROBOTICS", "PRESCREENING", "Robotics_Screening_Test", "Robotics & Microcontrollers Screening"),
    "Salesforce Entrance Test": ("SALESFORCE", "PRESCREENING", "Salesforce_Entrance_Test", "Salesforce CRM Screening"),
    "SAP-ABAP": ("SAP-ABAP", "PRESCREENING", "SAP_ABAP_Screening_Test", "SAP ABAP Screening"),
    "SAP MM Admission Test": ("SAP-MM", "PRESCREENING", "SAP_MM_Admission_Test", "SAP MM & Logistics Screening"),
    "Software Testing & Tools": ("SOFTWARE-TESTING", "PRESCREENING", "Software_Testing_Screening_Test", "Manual & Automation Testing Screening"),
    "English": ("CIVIL-INDUSTRIAL", "PRESCREENING", "Aptitude_and_English_Screening_Test", "General Aptitude & English"),
    "Dummy test": (None, "TEST", "Dummy_Test", "Developer Test"),
    "UAT Testing by Suhail Khan": (None, "TEST", "UAT_Testing_Dummy", "UAT Test"),
}

def normalize_str(s):
    return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

def clean_question_content(questions):
    """Normalize questions and compute content hash."""
    cleaned = []
    for idx, q in enumerate(questions):
        text = (q.get("text") or "").strip()
        image = (q.get("image") or "").strip()
        options = [str(o).strip() for o in q.get("options", [])]
        correct = q.get("correctOption", 0)
        marks = q.get("marks", 1)

        # Fix known duplicates from legacy quiz typos
        if len(options) == 4 and len(set(options)) < 4:
            seen = set()
            for o_i in range(len(options)):
                if options[o_i] in seen:
                    # Provide slight variation or fix typo
                    if "decreases" in options[o_i] and o_i == 0:
                        options[o_i] = options[o_i].replace("decreases", "increases")
                    elif "95%" in options[o_i] and o_i == 2:
                        options[o_i] = "90% pure"
                    else:
                        options[o_i] = f"{options[o_i]} (Alternative)"
                seen.add(options[o_i])

        cleaned.append({
            "id": f"q-{idx + 1}",
            "text": text,
            "image": image,
            "type": "image" if image else "text",
            "options": options,
            "correctOption": correct,
            "marks": marks
        })
    return cleaned

def main():
    files = sorted(glob.glob(os.path.join(SOURCE_DIR, "*.json")))
    print(f"Found {len(files)} source quiz files.")

    # Deduplicate by (Title, Content Hash)
    unique_quizzes = {}
    title_counts = defaultdict(int)

    sorted_keys = sorted(QUIZ_METADATA.keys(), key=lambda k: len(normalize_str(k)), reverse=True)

    for fpath in files:
        fname = os.path.basename(fpath)
        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
        
        raw_title = data.get("title", "").strip()
        title_counts[raw_title] += 1

        # Match title to metadata key (exact normalized first, then longest substring)
        meta = None
        norm_raw = normalize_str(raw_title)
        for key in sorted_keys:
            if normalize_str(key) == norm_raw:
                meta = QUIZ_METADATA[key]
                break
        if not meta:
            for key in sorted_keys:
                norm_key = normalize_str(key)
                if norm_key in norm_raw or norm_raw in norm_key:
                    meta = QUIZ_METADATA[key]
                    break
        
        if not meta:
            print(f"WARNING: Unknown quiz title '{raw_title}' in {fname}")
            continue

        course_code, exam_type, clean_title, module_topic = meta
        if exam_type == "TEST":
            continue  # Skip dummy tests

        cleaned_questions = clean_question_content(data.get("questions", []))
        
        # Calculate content hash (based on text, options, and image presence)
        content_repr = [(q["text"], len(q["image"]), tuple(q["options"]), q["correctOption"]) for q in cleaned_questions]
        content_hash = hashlib.md5(json.dumps(content_repr, sort_keys=True).encode("utf-8")).hexdigest()

        key = (course_code, exam_type, clean_title, content_hash)
        if key not in unique_quizzes:
            unique_quizzes[key] = {
                "source_file": fname,
                "title": raw_title,
                "clean_title": clean_title,
                "course_code": course_code,
                "exam_type": exam_type,
                "module_topic": module_topic,
                "timer": data.get("timer", 15),
                "questions": cleaned_questions,
                "total_questions": len(cleaned_questions),
                "image_questions_count": sum(1 for q in cleaned_questions if q["image"]),
            }

    print(f"\nIdentified {len(unique_quizzes)} unique active quizzes after deduplicating.")

    # Create directory structure
    os.makedirs(DEST_DIR, exist_ok=True)
    catalog = []

    for (course_code, exam_type, clean_title, content_hash), quiz in sorted(unique_quizzes.items()):
        folder_type = "Pre_Screening_Exams" if exam_type == "PRESCREENING" else "Module_Tests"
        course_folder = os.path.join(DEST_DIR, folder_type, course_code.replace("-", "_"))
        os.makedirs(course_folder, exist_ok=True)

        target_fname = f"{clean_title}.json"
        target_path = os.path.join(course_folder, target_fname)

        # Save clean quiz JSON
        output_data = {
            "title": quiz["title"],
            "clean_title": quiz["clean_title"],
            "course_code": quiz["course_code"],
            "exam_type": quiz["exam_type"],
            "module_topic": quiz["module_topic"],
            "timer": quiz["timer"],
            "total_questions": quiz["total_questions"],
            "image_questions_count": quiz["image_questions_count"],
            "source_original_file": quiz["source_file"],
            "questions": quiz["questions"],
        }

        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        rel_path = os.path.relpath(target_path, DEST_DIR).replace("\\", "/")
        catalog.append({
            "quiz_id": f"{course_code.lower()}-{clean_title.lower()}",
            "title": quiz["title"],
            "clean_title": quiz["clean_title"],
            "course_code": quiz["course_code"],
            "exam_type": quiz["exam_type"],
            "module_topic": quiz["module_topic"],
            "timer": quiz["timer"],
            "total_questions": quiz["total_questions"],
            "image_questions_count": quiz["image_questions_count"],
            "relative_path": rel_path,
        })

    # Save catalog.json
    catalog_path = os.path.join(DEST_DIR, "quiz_catalog.json")
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump({"total_quizzes": len(catalog), "quizzes": catalog}, f, indent=2, ensure_ascii=False)

    print(f"\nSuccessfully created organized quiz catalog at: {catalog_path}")
    print(f"Total organized quizzes: {len(catalog)}")
    prescreening_cnt = sum(1 for q in catalog if q["exam_type"] == "PRESCREENING")
    moduletest_cnt = sum(1 for q in catalog if q["exam_type"] == "MODULE_TEST")
    print(f"  Pre-Screening Quizzes: {prescreening_cnt}")
    print(f"  Module Test Quizzes: {moduletest_cnt}")

if __name__ == "__main__":
    main()
