import json
import logging
from collections import defaultdict
from datetime import datetime, date
import re
import openpyxl
import uuid

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from students.models import StudentProfile
from cohorts.models import Cohort
from applications.models import Application

logger = logging.getLogger(__name__)

class DryRunException(Exception):
    pass

class Command(BaseCommand):
    help = "Bulk onboard students from an Excel workbook."

    def add_arguments(self, parser):
        parser.add_argument("excel_path", type=str, help="Path to the Excel file")
        parser.add_argument("--cohort", type=str, help="Process only a specific cohort code", required=False)
        parser.add_argument("--dry-run", action="store_true", help="Perform a dry run without modifying the database")
        parser.add_argument("--report", type=str, default="onboard_report.json", help="Path to output the report JSON")

    def handle(self, *args, **options):
        excel_path = options["excel_path"]
        target_cohort = options.get("cohort")
        is_dry_run = options["dry_run"]
        report_path = options["report"]
        
        self.stdout.write(f"Reading {excel_path} using openpyxl...")
        
        try:
            wb = openpyxl.load_workbook(excel_path, data_only=True)
        except Exception as e:
            self.stderr.write(f"Failed to read Excel file: {e}")
            return

        report = {
            "total_rows": 0,
            "valid_rows": 0,
            "invalid_rows": 0,
            "new_students": 0,
            "existing_students": 0,
            "already_linked": 0,
            "different_role": 0,
            "duplicates_in_excel": 0,
            "missing_email": 0,
            "invalid_email": 0,
            "missing_name": 0,
            "cohort_not_found": 0,
            "cohort_ambiguous": 0,
            "review_required": 0,
            "database_write_count": 0,
            "created_students": [],
            "rows": []
        }
        
        # Preload Cohorts to avoid N+1 queries for resolution
        cohorts_by_code = defaultdict(list)
        for cohort in Cohort.objects.all():
            code_lower = cohort.code.lower().strip()
            name_lower = cohort.name.lower().strip() if cohort.name else ""
            cohorts_by_code[code_lower].append(cohort)
            if name_lower and name_lower != code_lower:
                cohorts_by_code[name_lower].append(cohort)
            
        def get_cohort(cohort_str):
            if cohort_str and str(cohort_str).strip():
                clean_str = str(cohort_str).strip().lower()
                matches = cohorts_by_code.get(clean_str, [])
                if len(matches) == 1:
                    return matches[0]
                elif len(matches) > 1:
                    return "AMBIGUOUS"
            return None

        # Preload Users by email
        existing_users_by_email = {}
        for u in User.objects.all():
            existing_users_by_email[u.email.lower().strip()] = u

        def _process():
            # Pass 1: Gather rows, identify exact dupes, and identity conflicts
            all_rows = []
            
            # Use 'All Responses' if it exists, otherwise use the first sheet
            if 'All Responses' in wb.sheetnames:
                sheets_to_process = [wb['All Responses']]
            else:
                sheets_to_process = [wb.active]
                
            for sheet in sheets_to_process:
                sheet_name = sheet.title
                headers = []
                for row_idx, row in enumerate(sheet.iter_rows(values_only=True)):
                    if row_idx == 0:
                        headers = [str(c).strip() if c else "" for c in row]
                        continue
                        
                    if not any(row):
                        continue
                        
                    row_dict = {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
                    cohort_raw = row_dict.get("Cohort", "")
                    cohort_str = str(cohort_raw).strip() if cohort_raw else ""
                    
                    resolved_cohort = get_cohort(cohort_str)
                    
                    if target_cohort and resolved_cohort and resolved_cohort != "AMBIGUOUS" and resolved_cohort.code.lower().strip() != target_cohort.lower().strip():
                        continue
                        
                    all_rows.append({
                        "sheet": sheet_name,
                        "row_number": row_idx + 1,
                        "data": row_dict,
                        "cohort_str": cohort_str,
                        "resolved_cohort": resolved_cohort
                    })
                    
            emails_seen = {}
            person_keys = {}
            for r in all_rows:
                data = r["data"]
                email_raw = data.get("Email id (SUREProed email id which is used during LST)", None)
                if not email_raw or not str(email_raw).strip():
                    email_raw = data.get("Email id", None)
                email = str(email_raw).strip().lower() if email_raw else ""
                
                first = str(data.get("First Name", "")).strip().lower()
                last = str(data.get("Last Name", "")).strip().lower()
                phone = str(data.get("Phone Number(Whatsapp)", "")).strip()
                if not phone:
                    phone = str(data.get("Phone Number", "")).strip()
                    
                person_key = f"{first} {last} {phone}"
                
                r["email"] = email
                r["raw_email"] = str(email_raw) if email_raw else ""
                r["person_key"] = person_key
                
                if email:
                    emails_seen.setdefault(email, []).append(r)
                if person_key.strip():
                    person_keys.setdefault(person_key, []).append(r)
                    
            # Pass 2: Evaluate and import
            processed_emails = set()
            
            for r in all_rows:
                report["total_rows"] += 1
                data = r["data"]
                
                email = r["email"]
                person_key = r["person_key"]
                resolved_cohort = r["resolved_cohort"]
                
                row_result = {
                    "sheet": r["sheet"],
                    "row_number": r["row_number"],
                    "student_name": f"{data.get('First Name', '')} {data.get('Last Name', '')}".strip(),
                    "email": r["raw_email"],
                    "cohort": r["cohort_str"],
                    "resolved_cohort_id": str(resolved_cohort.id) if hasattr(resolved_cohort, 'id') else None,
                    "resolved_course_id": str(resolved_cohort.course_id) if hasattr(resolved_cohort, 'course_id') else None,
                    "result": "",
                    "reason": ""
                }
                
                # Check duplicates
                if email in processed_emails:
                    report["duplicates_in_excel"] += 1
                    report["invalid_rows"] += 1
                    row_result["result"] = "INVALID"
                    row_result["reason"] = "DUPLICATE_IN_EXCEL"
                    report["rows"].append(row_result)
                    continue
                    
                if email:
                    processed_emails.add(email)
                    
                # Identity conflict check
                if person_key.strip():
                    unique_emails = set(row["email"] for row in person_keys[person_key] if row["email"])
                    if len(unique_emails) > 1:
                        report["review_required"] += 1
                        report["invalid_rows"] += 1
                        row_result["result"] = "REVIEW_REQUIRED"
                        row_result["reason"] = "POSSIBLE_IDENTITY_CONFLICT"
                        report["rows"].append(row_result)
                        continue
                
                if not email:
                    report["missing_email"] += 1
                    report["invalid_rows"] += 1
                    row_result["result"] = "INVALID"
                    row_result["reason"] = "MISSING_EMAIL"
                    report["rows"].append(row_result)
                    continue
                    
                email = email.strip()
                email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
                if not re.match(email_regex, email):
                    report["review_required"] += 1
                    report["invalid_rows"] += 1
                    row_result["result"] = "REVIEW_REQUIRED"
                    row_result["reason"] = "INVALID_EMAIL"
                    report["rows"].append(row_result)
                    continue
                    
                if " @" in r["raw_email"] or "@ " in r["raw_email"] or "\t@" in r["raw_email"]:
                    email = email.replace(" ", "").replace("\t", "") # Clean it up!

                first_name_raw = data.get("First Name", "")
                if not first_name_raw or str(first_name_raw).strip().lower() == "nan":
                    report["missing_name"] += 1
                    report["invalid_rows"] += 1
                    row_result["result"] = "INVALID"
                    row_result["reason"] = "MISSING_FIRST_NAME"
                    report["rows"].append(row_result)
                    continue
                    
                # Cohort resolution
                if resolved_cohort == "AMBIGUOUS":
                    report["cohort_ambiguous"] += 1
                    report["invalid_rows"] += 1
                    row_result["result"] = "INVALID"
                    row_result["reason"] = "COHORT_AMBIGUOUS"
                    report["rows"].append(row_result)
                    continue
                elif resolved_cohort is None:
                    report["cohort_not_found"] += 1
                    report["invalid_rows"] += 1
                    row_result["result"] = "INVALID"
                    row_result["reason"] = "COHORT_NOT_FOUND"
                    report["rows"].append(row_result)
                    continue
                    
                # Extract DOB safely
                dob_raw = data.get("DOB", None)
                dob = None
                if dob_raw:
                    try:
                        if isinstance(dob_raw, datetime):
                            dob = dob_raw.date()
                            year = dob.year
                        else:
                            dob_str = str(dob_raw).strip()
                            if "2026" in dob_str or "2025" in dob_str:
                                year = 2026
                            elif len(dob_str) >= 4:
                                m = re.search(r'\d{4}', dob_str)
                                if m:
                                    year = int(m.group(0))
                                    dob = datetime.strptime(dob_str, "%Y-%m-%d").date() # very optimistic, might fail but we catch it
                                else:
                                    year = 0
                            else:
                                year = 0
                                
                        if year >= 2015:
                            pass # Just accept it per user request
                    except:
                        pass
                        
                grad_year_raw = data.get("Graduation Year", None)
                grad_year = None
                if grad_year_raw and str(grad_year_raw).lower() != "nan":
                    try:
                        grad_year = int(float(str(grad_year_raw)))
                        if grad_year < 2000 or grad_year > 2030:
                            grad_year = None
                    except:
                        grad_year = None

                user = existing_users_by_email.get(email)
                if user:
                    if user.role == User.Role.STUDENT:
                        report["existing_students"] += 1
                        report["valid_rows"] += 1
                        
                        has_profile = hasattr(user, "student_profile")
                        if has_profile:
                            app = user.student_profile.applications.filter(course_id=resolved_cohort.course_id).first()
                            if app:
                                if app.assigned_cohort_id == resolved_cohort.id:
                                    row_result["result"] = "VALID"
                                    row_result["reason"] = "ALREADY_EXISTS_AND_CORRECT_COHORT"
                                else:
                                    row_result["result"] = "REVIEW_REQUIRED"
                                    row_result["reason"] = "ALREADY_EXISTS_DIFFERENT_COHORT"
                                    report["review_required"] += 1
                            else:
                                if not is_dry_run:
                                    Application.objects.create(
                                        student=user.student_profile,
                                        course=resolved_cohort.course,
                                        assigned_cohort=resolved_cohort,
                                        status=Application.Status.TRAINING
                                    )
                                report["existing_students"] += 1
                                report["valid_rows"] += 1
                                row_result["result"] = "VALID"
                                row_result["reason"] = "ALREADY_EXISTS_CREATED_APPLICATION"
                        else:
                            row_result["result"] = "REVIEW_REQUIRED"
                            row_result["reason"] = "ALREADY_EXISTS_STUDENT_NO_PROFILE"
                            report["review_required"] += 1
                    else:
                        linked = User.objects.filter(
                            mapped_email__iexact=email,
                            role=User.Role.STUDENT,
                            is_active=True
                        ).first()
                        
                        if linked:
                            report["already_linked"] += 1
                            report["valid_rows"] += 1
                            row_result["result"] = "VALID"
                            row_result["reason"] = "ALREADY_EXISTS_AND_LINKED"
                        else:
                            report["different_role"] += 1
                            report["invalid_rows"] += 1
                            row_result["result"] = "INVALID"
                            row_result["reason"] = "ALREADY_EXISTS_DIFFERENT_ROLE"
                    
                    report["rows"].append(row_result)
                    continue
                    
                # New student
                report["new_students"] += 1
                report["valid_rows"] += 1
                row_result["result"] = "VALID"
                row_result["reason"] = "NEW_STUDENT"
                report["rows"].append(row_result)
                
                report["created_students"].append({
                    "email": email,
                    "name": row_result["student_name"]
                })
                
                if not is_dry_run:
                    first_name = str(data.get("First Name", "")).strip()
                    last_name = str(data.get("Last Name", "")).strip()
                    
                    gender_raw = data.get("Gender", None)
                    gender = None
                    if gender_raw and str(gender_raw).lower() != "nan":
                        gender_str = str(gender_raw).strip().upper()
                        if gender_str in ["MALE", "FEMALE", "OTHER"]:
                            gender = gender_str
                    
                    phone_raw = data.get("Phone Number(Whatsapp)", None)
                    if not phone_raw or str(phone_raw).lower() == "nan":
                        phone_raw = data.get("Phone Number", None)
                    phone = str(phone_raw).strip() if phone_raw and str(phone_raw).lower() != "nan" else ""
                    
                    user = User.objects.create(
                        email=email,
                        first_name=first_name,
                        last_name=last_name,
                        role=User.Role.STUDENT,
                        gender=gender,
                        date_of_birth=dob,
                        phone_number=phone[:20] if phone else ""
                    )
                    user.set_unusable_password()
                    user.save()
                    report["database_write_count"] += 1
                    
                    degree = str(data.get("Highest Degree", "")).strip()
                    college = str(data.get("College", "")).strip()
                    country = str(data.get("Country", "India")).strip()
                    state = str(data.get("State", "")).strip()
                    city = str(data.get("City", "")).strip()
                    specialization = str(data.get("Specialization", "")).strip()
                    linkedin = str(data.get("Linked In Profile Url", "")).strip()
                    github = str(data.get("Github Username", "")).strip()
                    
                    edu_level = str(data.get("Education level", "")).strip().upper()
                    if edu_level not in [c[0] for c in StudentProfile.EducationLevel.choices]:
                        edu_level = StudentProfile.EducationLevel.UNDERGRADUATE

                    profile = user.student_profile
                    profile.degree = degree[:150] if degree != "nan" else ""
                    profile.college = college[:255] if college != "nan" else ""
                    profile.country = country[:100] if country != "nan" else "India"
                    profile.state = state[:100] if state != "nan" else ""
                    profile.city = city[:100] if city != "nan" else ""
                    profile.specialization = specialization[:150] if specialization != "nan" else ""
                    profile.linkedin_url = linkedin if linkedin != "nan" and linkedin.startswith("http") else ""
                    profile.github_username = github[:100] if github != "nan" else ""
                    profile.graduation_year = grad_year
                    profile.education_level = edu_level
                    profile.is_public = False
                    profile.save()
                    report["database_write_count"] += 1
                    
                    Application.objects.create(
                        student=profile,
                        course=resolved_cohort.course,
                        assigned_cohort=resolved_cohort,
                        status=Application.Status.TRAINING
                    )
                    report["database_write_count"] += 1
                    
            if is_dry_run:
                raise DryRunException("Dry run complete.")
                
        try:
            with transaction.atomic():
                _process()
        except DryRunException:
            self.stdout.write(self.style.SUCCESS("Dry run completed. No database changes were committed."))
            report["database_write_count"] = 0
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Error during import: {e}"))
            
        with open(report_path, "w") as f:
            json.dump(report, f, indent=4)
            
        self.stdout.write(self.style.SUCCESS(f"Report generated at: {report_path}"))
        self.stdout.write(f"Total rows processed: {report['total_rows']}")
        self.stdout.write(f"Valid clean students: {report['valid_rows']}")
        self.stdout.write(f"New students to create: {report['new_students']}")
        self.stdout.write(f"Existing students: {report['existing_students']}")
        self.stdout.write(f"Duplicates in excel: {report['duplicates_in_excel']}")
        self.stdout.write(f"Review required (invalid/suspicious): {report['review_required']}")
        self.stdout.write(f"Database write count: {report['database_write_count']}")
        
        if is_dry_run and report["new_students"] > 0:
            self.stdout.write("\nStudents that would be created:")
            for s in report["created_students"]:
                self.stdout.write(f" - {s['name']} ({s['email']})")
                
            self.stdout.write("\nRecords that would be created per student:")
            self.stdout.write(" - 1 User record")
            self.stdout.write(" - 1 StudentProfile record")
            self.stdout.write(" - 1 Application record (Status: COHORT_ASSIGNED)")
