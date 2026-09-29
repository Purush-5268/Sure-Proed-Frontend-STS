import os
import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal
import openpyxl
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from applications.models import Application, PreScreening, PreScreeningInterview
from applications.services.state_machine import transition_application_status
from cohorts.models import Cohort
from common.validators import validate_name
from courses.models import Course, CourseModule
from exams.models import Exam, ModuleTest, ModuleTestSubmission
from students.models import StudentProfile


class Command(BaseCommand):
    help = "Seed student accounts, profiles, cohort, applications, pre-screening exams, and module test marks from Excel"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to Excel file (defaults to Seed_With_Exam_Marks.xlsx or Seed.xlsx in project root)",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="SeedCohort@2026!",
            help="Common password for seeded student accounts",
        )
        parser.add_argument(
            "--reset-passwords",
            action="store_true",
            default=False,
            help="Force-reset passwords of already existing accounts to the common password",
        )
        parser.add_argument(
            "--course-code",
            type=str,
            default="VLSI-DESIGN",
            help="Course code to associate with the cohort (defaults to VLSI-DESIGN)",
        )

    def handle(self, *args, **options):
        file_path = options.get("file")
        common_password = options.get("password") or "SeedCohort@2026!"
        reset_passwords = bool(options.get("reset_passwords"))
        course_code = options.get("course_code") or "VLSI-DESIGN"
        if not file_path:
            candidates = [
                "Only_4_Students_G2-26_VLSI.xlsx",
                os.path.join(os.getcwd(), "Only_4_Students_G2-26_VLSI.xlsx"),
                r"C:\Users\tumma\Downloads\Only_4_Students_G2-26_VLSI.xlsx",
                "Seed_With_Exam_Marks_Updated.xlsx",
                os.path.join(os.getcwd(), "Seed_With_Exam_Marks_Updated.xlsx"),
                r"C:\Users\tumma\Downloads\Seed_With_Exam_Marks_Updated.xlsx",
                "Seed_With_Exam_Marks.xlsx",
                os.path.join(os.getcwd(), "Seed_With_Exam_Marks.xlsx"),
                r"C:\Users\tumma\Downloads\Seed_With_Exam_Marks.xlsx",
                "Seed.xlsx",
                os.path.join(os.getcwd(), "Seed.xlsx"),
                r"C:\Users\tumma\Downloads\Seed.xlsx",
            ]
            for candidate in candidates:
                if os.path.exists(candidate):
                    file_path = candidate
                    break

        if not file_path or not os.path.exists(file_path):
            raise CommandError(
                f"Excel file not found. Checked default 'Seed_With_Exam_Marks_Updated.xlsx', 'Seed_With_Exam_Marks.xlsx' and 'Seed.xlsx' in project root. "
                "Please place 'Seed_With_Exam_Marks_Updated.xlsx' in the project root or specify via --file <path_to_excel>."
            )

        self.stdout.write(self.style.NOTICE(f"Loading workbook: {file_path}"))
        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet = None
        for sname in ["Student Details & Marks", "Form responses 1"]:
            if sname in wb.sheetnames:
                sheet = wb[sname]
                break
        if sheet is None:
            sheet = wb.active

        header_row_idx = 1
        headers = [str(c.value).strip() if c.value is not None else "" for c in sheet[1]]
        if not any("email" in h.lower() for h in headers):
            # Check row 2 in case row 1 is a title banner
            row2_headers = [str(c.value).strip() if c.value is not None else "" for c in sheet[2]]
            if any("email" in h.lower() for h in row2_headers):
                header_row_idx = 2
                headers = row2_headers

        def get_col(row_data, *target_names):
            for target_name in target_names:
                for i, h in enumerate(headers):
                    if target_name.lower() in h.lower():
                        return row_data[i]
            return None

        def parse_marks(val):
            if val is None or str(val).strip() == "":
                return None
            try:
                return Decimal(str(round(float(val), 2))).quantize(Decimal("0.01"))
            except Exception:
                return None

        def parse_dob(dob_val):
            if not dob_val:
                return None
            if isinstance(dob_val, datetime):
                return dob_val.date()
            if isinstance(dob_val, date):
                return dob_val
            if isinstance(dob_val, str):
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"):
                    try:
                        return datetime.strptime(dob_val.strip(), fmt).date()
                    except ValueError:
                        pass
            return None

        def parse_grad_year(val):
            if not val:
                return 2026
            val_str = str(val).strip().lower()
            match = re.search(r"\b(20\d\d)\b", val_str)
            if match:
                return int(match.group(1))
            if "4th" in val_str:
                return 2026
            if "3rd" in val_str:
                return 2027
            if "2nd" in val_str:
                return 2028
            if "1st" in val_str:
                return 2029
            if "graduated" in val_str or "completed" in val_str:
                return 2025
            return 2026

        def clean_github(val):
            if not val:
                return None, None
            s = str(val).strip().replace(" ", "")
            if not s or s.lower() in ("-", "none", "n/a"):
                return None, None
            if "github.com/" in s:
                part = s.split("github.com/")[1]
                username = part.split("/")[0].split("?")[0].strip()
            else:
                username = s.lstrip("@").strip()
            if not username:
                return None, None
            return f"https://github.com/{username}", username

        # Fetch or validate course
        try:
            course = Course.objects.get(code=course_code)
        except Course.DoesNotExist:
            raise CommandError(f"Course with code '{course_code}' does not exist in the database.")

        self.stdout.write(f"Target Course: {course.name} ({course.code})")

        with transaction.atomic():
            # 1. Ensure the 4 Curriculum Modules exist for this Course
            modules_data = [
                (1, 1, "Fundamentals", "Module 1: Fundamentals"),
                (2, 2, "RTL Design and Scripting", "Module 2: RTL Design and Scripting"),
                (3, 3, "Verification (SV & UVM)", "Module 3: Verification (SV & UVM)"),
                (4, 4, "Synthesis and DFT", "Module 4: Synthesis and DFT"),
            ]
            modules_dict = {}
            for num, order, title, desc in modules_data:
                mod, mod_created = CourseModule.objects.update_or_create(
                    course=course,
                    module_number=num,
                    defaults={
                        "order": order,
                        "title": title,
                        "description": desc,
                        "duration_weeks": 4,
                        "is_active": True,
                    },
                )
                modules_dict[num] = mod
                if mod_created:
                    self.stdout.write(self.style.SUCCESS(f"Created Course Module: {mod}"))

            # 2. Ensure the Cohort exists and points to Module 4 in TRAINING
            cohort_code = "G2-26"
            cohort, cohort_created = Cohort.objects.get_or_create(
                code=cohort_code,
                course=course,
                defaults={
                    "name": f"{course.name} - {cohort_code}",
                    "start_date": timezone.now().date() - timedelta(days=60),
                    "end_date": timezone.now().date() + timedelta(days=120),
                    "status": Cohort.Status.TRAINING,
                    "training_started_at": timezone.now() - timedelta(days=60),
                    "current_module": modules_dict[4],
                    "max_students": 50,
                },
            )
            if cohort_created:
                self.stdout.write(self.style.SUCCESS(f"Created Cohort: {cohort.code} for {course.code} (Status: TRAINING)"))
            else:
                cohort.status = Cohort.Status.TRAINING
                cohort.current_module = modules_dict[4]
                if not cohort.training_started_at:
                    cohort.training_started_at = timezone.now() - timedelta(days=60)
                cohort.save()

            # 3. Ensure Module Tests exist for Modules 1, 2, 3, and 4
            tests_data = [
                (1, "Module 1: Fundamentals Quiz", 20, Decimal("20.00")),
                (2, "Module 2: RTL Design and Scripting Test", 20, Decimal("20.00")),
                (3, "Module 3: Verification (SV & UVM) Test", 15, Decimal("15.00")),
                (4, "Module 4: Synthesis and DFT Test", 10, Decimal("10.00")),
            ]
            tests_dict = {}
            for mod_num, test_title, q_count, max_marks in tests_data:
                test_obj, test_created = ModuleTest.objects.update_or_create(
                    course=course,
                    module=modules_dict[mod_num],
                    cohort=cohort,
                    defaults={
                        "title": test_title,
                        "total_questions": q_count,
                        "duration_minutes": 30,
                        "pass_percentage": Decimal("40.00"),
                        "is_released": True,
                        "is_active": True,
                    },
                )
                tests_dict[mod_num] = (test_obj, max_marks)
                if test_created:
                    self.stdout.write(self.style.SUCCESS(f"Created Module Test: {test_obj.title} (Max Marks: {max_marks})"))

            created_users_count = 0
            updated_users_count = 0
            enrolled_apps_count = 0
            target_cohort_display = f"{cohort.code} (Status: {cohort.status})"
            seeded_profiles = []

            # Iterate over data rows
            row_index = 0
            for row in sheet.iter_rows(min_row=header_row_idx + 1, values_only=True):
                if not any(row):
                    continue
                row_index += 1

                email = str(get_col(row, "Email id", "Email") or "").strip().lower()
                if not email or "@" not in email:
                    self.stdout.write(self.style.WARNING(f"Row {row_index}: Skipping invalid email '{email}'"))
                    continue

                raw_first_name = str(get_col(row, "First Name") or "").strip()
                raw_last_name = str(get_col(row, "Last Name") or "").strip()

                try:
                    first_name = validate_name(raw_first_name, field_name="First Name") if raw_first_name else ""
                except Exception:
                    first_name = raw_first_name

                try:
                    last_name = validate_name(raw_last_name, field_name="Last Name") if raw_last_name else ""
                except Exception:
                    last_name = raw_last_name

                gender_raw = str(get_col(row, "Gender") or "").strip().upper()
                if gender_raw.startswith("M"):
                    gender = User.Gender.MALE
                elif gender_raw.startswith("F"):
                    gender = User.Gender.FEMALE
                else:
                    gender = User.Gender.OTHER

                dob = parse_dob(get_col(row, "DOB", "Date of Birth"))
                phone = str(get_col(row, "Phone (WhatsApp)", "Phone Number", "Phone") or "").strip()
                college = str(get_col(row, "College") or "").strip()
                degree = str(get_col(row, "Highest Degree", "Degree") or "").strip()
                ed_level_raw = str(get_col(row, "Education level", "Education Level") or "").strip().upper()
                ed_level = (
                    StudentProfile.EducationLevel.POSTGRADUATE
                    if ed_level_raw == "PG"
                    else StudentProfile.EducationLevel.UNDERGRADUATE
                )
                specialization = str(get_col(row, "Specialization") or "").strip()
                grad_year = parse_grad_year(get_col(row, "Graduation Status / Year", "Graduation Year", "Graduation"))
                country = "India"
                state = str(get_col(row, "State") or "").strip()
                city = str(get_col(row, "City") or "").strip()
                gh_url, gh_user = clean_github(get_col(row, "GitHub Username", "Github"))
                linkedin_raw = str(get_col(row, "LinkedIn Profile", "LinkedIn") or "").strip()
                linkedin_url = linkedin_raw if linkedin_raw.startswith("http") else None

                # Check if user exists
                user = User.objects.filter(email=email).first()
                if not user:
                    user = User(
                        email=email,
                        first_name=first_name,
                        last_name=last_name,
                        gender=gender,
                        phone_number=phone,
                        date_of_birth=dob,
                        role=User.Role.STUDENT,
                        is_email_verified=True,
                        is_active=True,
                    )
                    user.set_password(common_password)
                    validate_password(common_password, user=user)
                    user.save()
                    created_users_count += 1
                else:
                    user.first_name = first_name
                    user.last_name = last_name
                    user.gender = gender
                    user.phone_number = phone
                    user.date_of_birth = dob
                    user.role = User.Role.STUDENT
                    user.is_email_verified = True
                    user.is_active = True
                    if reset_passwords or not user.has_usable_password():
                        user.set_password(common_password)
                        validate_password(common_password, user=user)
                    user.save()
                    updated_users_count += 1

                # Update student profile
                profile = StudentProfile.objects.get(user=user)
                profile.college = college
                profile.degree = degree
                profile.education_level = ed_level
                profile.specialization = specialization
                profile.graduation_year = grad_year
                profile.country = country
                profile.state = state
                profile.city = city
                # Remove linked accounts: no third-party OAuth links so students can authenticate/link manually directly via app
                user.is_social_auth_linked = False
                user.social_provider = None
                user.linkedin_id = None
                user.save(update_fields=["is_social_auth_linked", "social_provider", "linkedin_id"])

                profile._skip_github_auto_link = True
                profile.linkedin_url = None
                profile.linkedin_id = None
                profile.is_linkedin_connected = False
                profile.linkedin_profile_data = {}
                profile.github_username = None
                profile.github_url = None
                profile.is_github_connected = False
                profile.github_org_invite_status = "NOT_INVITED"
                profile.github_repo_url = None
                profile.verification_status = StudentProfile.VerificationStatus.VERIFIED
                profile.student_identity_issued_at = timezone.now() - timedelta(days=60)
                profile.save()
                StudentProfile.objects.filter(pk=profile.pk).update(
                    linkedin_url=None,
                    linkedin_id=None,
                    is_linkedin_connected=False,
                    linkedin_profile_data={},
                    github_username=None,
                    github_url=None,
                    is_github_connected=False,
                    github_org_invite_status="NOT_INVITED",
                    github_repo_url=None,
                )
                seeded_profiles.append(profile)

                # Get or create Application
                app_num = f"APP-2026-{cohort_code.replace('-', '')}-{user.id.hex[:6].upper()}"
                app, app_created = Application.objects.get_or_create(
                    student=profile,
                    course=course,
                    defaults={
                        "application_number": app_num,
                        "assigned_cohort": cohort,
                        "status": Application.Status.TRAINING,
                        "qualified": True,
                        "training_batch": "BATCH_1",
                        "role_verification_status": Application.RoleVerificationStatus.VERIFIED,
                        "role_verified_at": timezone.now() - timedelta(days=60),
                        "applied_at": timezone.now() - timedelta(days=120),
                    },
                )
                if not app_created:
                    app.assigned_cohort = cohort
                    app.qualified = True
                    app.training_batch = "BATCH_1"
                    app.role_verification_status = Application.RoleVerificationStatus.VERIFIED
                    app.role_verified_at = timezone.now() - timedelta(days=60)
                    app.applied_at = timezone.now() - timedelta(days=120)
                    app.save(update_fields=[
                        "assigned_cohort", "qualified", "training_batch",
                        "role_verification_status", "role_verified_at",
                        "applied_at", "updated_at",
                    ])
                    transition_application_status(
                        app,
                        Application.Status.TRAINING,
                        reason="Legacy Excel import enrollment reconciliation",
                        is_repair=True,
                    )

                enrolled_apps_count += 1

                # Extract exam marks from Excel
                adm_score = parse_marks(get_col(row, "Admission Test"))
                m1_score = parse_marks(get_col(row, "Module 1"))
                m2_score = parse_marks(get_col(row, "Module 2"))
                m3_score = parse_marks(get_col(row, "Module 3"))
                m4_score = parse_marks(get_col(row, "Module 4"))

                # 4. Seed Admission Test == Pre-Screen Exam
                if adm_score is not None:
                    adm_max = Decimal("50.00")
                    adm_pct = round((adm_score / adm_max) * Decimal("100"), 2)
                    app.qualification_score = adm_pct
                    app.qualified = True
                    app.save(update_fields=["qualification_score", "qualified", "updated_at"])

                    adm_time = timezone.now() - timedelta(days=55)
                    PreScreening.objects.update_or_create(
                        application=app,
                        defaults={
                            "status": PreScreening.Status.PASSED,
                            "scheduled_at": adm_time - timedelta(minutes=45),
                            "end_time": adm_time,
                            "is_released": True,
                            "interviewer": "SureTrust Admissions Committee",
                        },
                    )

                    Exam.objects.update_or_create(
                        application=app,
                        defaults={
                            "level": Exam.Level.MIXED,
                            "total_questions": 50,
                            "duration_minutes": 45,
                            "pass_percentage": Decimal("40.00"),
                            "status": Exam.Status.EVALUATED,
                            "marks_obtained": adm_score,
                            "total_marks": adm_max,
                            "percentage": adm_pct,
                            "qualified": True,
                            "started_at": adm_time - timedelta(minutes=40),
                            "submitted_at": adm_time,
                        },
                    )

                    interview_time = timezone.now() - timedelta(days=52)
                    PreScreeningInterview.objects.update_or_create(
                        application=app,
                        defaults={
                            "status": PreScreeningInterview.Status.PASSED,
                            "scheduled_at": interview_time - timedelta(minutes=30),
                            "end_time": interview_time,
                            "score": Decimal("85.00"),
                            "feedback": "Prescreen interview cleared. Recommended for VLSI cohort enrollment.",
                        },
                    )

                # 5. Seed Module 1 Test Submission
                if m1_score is not None:
                    test_obj, max_m = tests_dict[1]
                    m1_pct = round((m1_score / max_m) * Decimal("100"), 2)
                    m1_time = timezone.now() - timedelta(days=48)
                    ModuleTestSubmission.objects.update_or_create(
                        test=test_obj,
                        student=profile,
                        defaults={
                            "cohort": cohort,
                            "marks_obtained": m1_score,
                            "total_marks": max_m,
                            "percentage": m1_pct,
                            "qualified": True,
                            "status": ModuleTestSubmission.Status.SUBMITTED,
                            "result_source": ModuleTestSubmission.ResultSource.INTERNAL,
                            "started_at": m1_time - timedelta(minutes=20),
                            "submitted_at": m1_time,
                        },
                    )

                # 6. Seed Module 2 Test Submission
                if m2_score is not None:
                    test_obj, max_m = tests_dict[2]
                    m2_pct = round((m2_score / max_m) * Decimal("100"), 2)
                    m2_time = timezone.now() - timedelta(days=35)
                    ModuleTestSubmission.objects.update_or_create(
                        test=test_obj,
                        student=profile,
                        defaults={
                            "cohort": cohort,
                            "marks_obtained": m2_score,
                            "total_marks": max_m,
                            "percentage": m2_pct,
                            "qualified": True,
                            "status": ModuleTestSubmission.Status.SUBMITTED,
                            "result_source": ModuleTestSubmission.ResultSource.INTERNAL,
                            "started_at": m2_time - timedelta(minutes=25),
                            "submitted_at": m2_time,
                        },
                    )

                # 7. Seed Module 3 Test Submission
                if m3_score is not None:
                    test_obj, max_m = tests_dict[3]
                    m3_pct = round((m3_score / max_m) * Decimal("100"), 2)
                    m3_time = timezone.now() - timedelta(days=18)
                    ModuleTestSubmission.objects.update_or_create(
                        test=test_obj,
                        student=profile,
                        defaults={
                            "cohort": cohort,
                            "marks_obtained": m3_score,
                            "total_marks": max_m,
                            "percentage": m3_pct,
                            "qualified": True,
                            "status": ModuleTestSubmission.Status.SUBMITTED,
                            "result_source": ModuleTestSubmission.ResultSource.INTERNAL,
                            "started_at": m3_time - timedelta(minutes=20),
                            "submitted_at": m3_time,
                        },
                    )

                # 8. Seed Module 4 Test Submission
                if m4_score is not None:
                    test_obj, max_m = tests_dict[4]
                    m4_pct = round((m4_score / max_m) * Decimal("100"), 2)
                    m4_time = timezone.now() - timedelta(days=3)
                    ModuleTestSubmission.objects.update_or_create(
                        test=test_obj,
                        student=profile,
                        defaults={
                            "cohort": cohort,
                            "marks_obtained": m4_score,
                            "total_marks": max_m,
                            "percentage": m4_pct,
                            "qualified": True,
                            "status": ModuleTestSubmission.Status.SUBMITTED,
                            "result_source": ModuleTestSubmission.ResultSource.INTERNAL,
                            "started_at": m4_time - timedelta(minutes=15),
                            "submitted_at": m4_time,
                        },
                    )

                # Send welcome notification to seeded beta user
                try:
                    from common.models import Notification
                    from common.services.notifications import display_name, notify_user
                    notify_user(
                        user,
                        title="Welcome to Sureproed beta version Testing Users",
                        message=(
                            f"Hi {display_name(user)}, welcome to Sureproed beta version testing! "
                            f"Your account and enrollment for {course.name} (Cohort: {cohort.code}) are active. "
                            f"Explore your dashboard, track your timetable, and share your feedback."
                        ),
                        notification_type=Notification.Type.SUCCESS,
                        action_url="dashboard",
                        dedupe_key=f"welcome_beta:{user.id}",
                    )
                except Exception as notif_err:
                    self.stdout.write(self.style.WARNING(f"  [Notification warning]: {notif_err}"))

                self.stdout.write(
                    f"[{row_index}] Seeded {user.email} -> {user.get_full_name()} "
                    f"(Adm: {adm_score}/50, M1: {m1_score}/20, M2: {m2_score}/20, M3: {m3_score}/15, M4: {m4_score}/10)"
                )

            # Ensure cohort points to Module 4 and remains in TRAINING
            cohort.current_module = modules_dict[4]
            cohort.status = Cohort.Status.TRAINING
            cohort.save(update_fields=["current_module", "status", "updated_at"])

            from cohorts.services import sync_cohort_applications_status
            sync_cohort_applications_status(cohort, Cohort.Status.TRAINING)

            # Ensure all cohort students are verified and active
            User.objects.filter(
                student_profile__applications__assigned_cohort=cohort
            ).update(is_email_verified=True, is_active=True)

            # Create a pinned cohort announcement
            try:
                from common.models import Announcement
                Announcement.objects.get_or_create(
                    title="Welcome to Sureproed beta version Testing Users",
                    cohort=cohort,
                    defaults={
                        "message": (
                            "Welcome to the Sureproed Beta Testing Program! We are thrilled to have you test our platform. "
                            "Explore your active training modules, attendance schedules, and resources on your dashboard. "
                            "Your feedback helps us continuously improve the experience."
                        ),
                        "target_audience": Announcement.TargetAudience.COHORT,
                        "is_pinned": True,
                        "is_active": True,
                    },
                )
            except Exception:
                pass

        # Check and seed attendance from current workbook's "Attendance" sheet for seeded students
        if "Attendance" in wb.sheetnames and seeded_profiles:
            self.stdout.write("")
            self.stdout.write(self.style.NOTICE("Seeding Attendance from workbook 'Attendance' sheet for newly added students..."))
            ws_att = wb["Attendance"]
            att_header_row_idx = 1
            row1_vals = [str(c.value).strip() if c.value is not None else "" for c in ws_att[1]]
            row2_vals = [str(c.value).strip() if c.value is not None else "" for c in ws_att[2]]
            if sum(1 for v in row2_vals if v) > sum(1 for v in row1_vals if v):
                att_header_row_idx = 2
                att_header = row2_vals
            else:
                att_header = row1_vals

            from attendance.models import Attendance, AttendanceSummary
            db_sessions = list(Attendance.objects.filter(cohort=cohort).order_by("class_date", "start_time"))
            if not db_sessions:
                db_sessions = list(Attendance.objects.filter(cohort__code=cohort.code).order_by("class_date", "start_time"))

            month_map = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}

            # If sessions are not in database yet, auto-create the 50 sessions for this cohort!
            if not db_sessions:
                self.stdout.write(self.style.NOTICE("No existing attendance sessions found for cohort. Auto-generating 50 sessions from attendance register..."))
                admin_user = (
                    User.objects.filter(role__in=["ADMIN", "SUPER_ADMIN"]).first()
                    or User.objects.filter(is_superuser=True).first()
                )
                new_sessions = []
                sess_idx = 1
                for col_idx, h in enumerate(att_header):
                    if not h or h in ["No.", "Student Name", "Cohort", "Present", "Absent", "Attendance %"]:
                        continue
                    h_str = str(h).strip()
                    m = re.search(r'(\d{1,2})-([A-Za-z]{3})', h_str)
                    if m:
                        day = int(m.group(1))
                        month = month_map.get(m.group(2).capitalize(), 5)
                        c_date = date(2026, month, day)
                    else:
                        c_date = timezone.localdate()

                    if '3:30 to 5:30' in h_str:
                        s_time = time(15, 30, 0)
                        e_time = time(17, 30, 0)
                    elif '8:00 to 9:30' in h_str:
                        s_time = time(20, 0, 0)
                        e_time = time(21, 30, 0)
                    else:
                        s_time = time(19, 0, 0)
                        e_time = time(20, 30, 0)

                    session_title = f"{course.code} [{cohort.code}] - Session {sess_idx:02d} ({h_str})"
                    sess_obj, _ = Attendance.objects.get_or_create(
                        cohort=cohort,
                        class_date=c_date,
                        start_time=s_time,
                        defaults={
                            "course": course,
                            "title": session_title,
                            "end_time": e_time,
                            "class_type": Attendance.ClassType.DOMAIN,
                            "class_status": Attendance.ClassStatus.COMPLETED,
                            "conducted": True,
                            "conducted_by": admin_user,
                            "meeting_link": "https://meet.google.com/vlsi-g226-ses",
                            "notes": f"Historical Attendance Session {sess_idx:02d}",
                        },
                    )
                    new_sessions.append(sess_obj)
                    sess_idx += 1
                db_sessions = new_sessions

            col_to_session = {}
            used_session_ids = set()
            for col_idx, h in enumerate(att_header):
                if not h or h in ["No.", "Student Name", "Cohort", "Present", "Absent", "Attendance %"]:
                    continue
                h_str = str(h).strip()
                # 1. First priority: exact label match in session title among unused sessions
                matched_s = next((s for s in db_sessions if s.id not in used_session_ids and f"({h_str})" in s.title), None)
                if not matched_s:
                    m = re.search(r'(\d{1,2})-([A-Za-z]{3})', h_str)
                    if m:
                        day = int(m.group(1))
                        month = month_map.get(m.group(2).capitalize(), 5)
                        col_date = date(2026, month, day)
                        if '3:30 to 5:30' in h_str:
                            matched_s = next((s for s in db_sessions if s.id not in used_session_ids and s.class_date == col_date and s.start_time and s.start_time.hour < 18), None)
                        elif '8:00 to 9:30' in h_str:
                            matched_s = next((s for s in db_sessions if s.id not in used_session_ids and s.class_date == col_date and s.start_time and s.start_time.hour >= 18), None)

                        if not matched_s:
                            matched_s = next((s for s in db_sessions if s.id not in used_session_ids and s.class_date == col_date), None)
                if matched_s:
                    used_session_ids.add(matched_s.id)
                    col_to_session[col_idx] = (h_str, matched_s)

            self.stdout.write(self.style.SUCCESS(f"Matched {len(col_to_session)} attendance sessions in database."))
            att_rows = list(ws_att.iter_rows(min_row=att_header_row_idx + 1, values_only=True))

            # Fetch all cohort sessions from database to guarantee 100% READY coverage with zero NOT_READY
            all_cohort_sessions = list(Attendance.objects.filter(cohort=cohort).order_by("class_date", "start_time"))
            if not all_cohort_sessions:
                all_cohort_sessions = list(Attendance.objects.filter(cohort__code=cohort.code).order_by("class_date", "start_time"))

            with transaction.atomic():
                for p in seeded_profiles:
                    p_full_name = p.user.get_full_name().strip().upper()
                    target_row = None
                    for r in att_rows:
                        if not any(r):
                            continue
                        row_name = str(r[1] if len(r) > 1 else "").strip().upper()
                        if row_name and (row_name == p_full_name or row_name in p_full_name or p_full_name in row_name):
                            target_row = r
                            break

                    if not target_row:
                        self.stdout.write(self.style.WARNING(f"Could not find attendance row for {p.user.email} ({p_full_name})"))
                        continue

                    # Removed attendance seeding logic to prevent corruption of live Google Meet sessions.

                    # Invalidate user and admin attendance caches
                    from django.core.cache import cache
                    cache.delete(f"attendance:version:user_{p.user_id}")
                    cache.set(f"attendance:version:user_{p.user_id}", cache.get(f"attendance:version:user_{p.user_id}", 1) + 1)
                    cache.set("attendance:version:admin", cache.get("attendance:version:admin", 1) + 1)

                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  [Student Info] {p.user.get_full_name()} ({p.user.email}) processed successfully."
                        )
                    )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Seeding Completed Successfully with Exam & Module Marks!"))
        self.stdout.write(self.style.SUCCESS(f"  Created Users:     {created_users_count}"))
        self.stdout.write(self.style.SUCCESS(f"  Updated Users:     {updated_users_count}"))
        self.stdout.write(self.style.SUCCESS(f"  Enrolled Students: {enrolled_apps_count}"))
        self.stdout.write(self.style.SUCCESS(f"  Target Cohort:     {target_cohort_display}"))
        self.stdout.write(self.style.SUCCESS(f"  Current Module:    {cohort.current_module}"))
        self.stdout.write(self.style.SUCCESS(f"  Common Password:   {common_password}"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

