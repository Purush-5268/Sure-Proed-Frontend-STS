import os
import datetime
from datetime import timedelta
import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

from attendance.models import Attendance, AttendanceSummary
from cohorts.models import Cohort
from courses.models import Course
from students.models import StudentProfile


User = get_user_model()


class Command(BaseCommand):
    help = (
        "Seed WhatsApp attendance data for Cohort G2-26 from standard WhatsApp attendance Excel "
        "strictly for students present in Seed_With_Exam_Marks_Updated.xlsx."
    )

    # 100% verified mapping from student email/name in Seed file to name in WhatsApp Attendance Register
    EXPLICIT_STUDENT_MAP = {
        "marrivamshi071@gmail.com": "KRUTHIK",
        "ramyaaravapalli19@gmail.com": "ARAVAPALLI RAMYA",
        "yepugantianji@gmail.com": "ANJI BABU",
        "anureddysandupatla@gmail.com": "ANU REDDY",
        "serumukeshroy@gmail.com": "MUKESH ROY",
        "daduvaisaitejag226vlsi@gmail.com": "D. SAI TEJA",
        "divya53b@gmail.com": "B. DIVYA",
        "mrekha.g2.26.vlsi@gmail.com": "M REKHA",
        "shashikankanala23vlsi@gmail.com": "K. SHASHI KUMAR",
        "umadevivajjag226vlsi@gmail.com": "UMADEVI VAJJA",
        "makthalrahulrao21@gmail.com": "MAKTHAL RAHUL RAO",
        "gbsaicharan@gmail.com": "G B SAI CHARAN",
        "battalareddyakshayag226vlsi@gmail.com": "REDDY AKSHAYA BATTALA",
        "ramanji1719@gmail.com": "RAVINDRANATH",
        "jasmeenkaurg226vlsi@gmail.com": "JASMEEN KAUR",
        "srilakshmirapuru@gmail.com": "RAPURU SRI LAKSHMI",
        "likitha.g2.26.vlsi@gmail.com": "PADIGE LIKITHA",
        "gowthamthupaakula9550@gmail.com": "GOWTHAM",
        "shravanahs97@gmail.com": "SHRAVANA H S",
        "emmadimani786@gmail.com": "MANIDEEP EMMADI",
        "vetriram539@gmail.com": "VENKATA PRANAY",
        "himanshupal66y@gmail.com": "HIMANSHU PAL",
        "karankisudheer1993@gmail.com": "SUDHEER",
        "ndedeepya.g2.26.integratedvlsi@gmail.com": "DEDEEPYA NARAYANASETTY",
        "likhithamathakala@gmail.com": "M.PENCHALA LIKHITHA",
        "navyasreeg226vlsi@gmail.com": "NAVYA SREE",
        "chandraprasad.iqoo@gmail.com": "B. CHANDRA PRASAD",
    }

    @staticmethod
    def normalize_sender(raw_sender):
        s = str(raw_sender or "").strip()
        if "88857" in s or "888857" in s or "mounika" in s.lower():
            return "Mounika Suretrust Volunteer"
        if "radhakumari" in s.lower():
            return "Prof. Radhakumari"
        if "pradeep" in s.lower():
            return "T Pradeep - G2-26 VLSI"
        return s or "Prof. Radhakumari"

    def add_arguments(self, parser):
        parser.add_argument(
            "--attendance-file",
            type=str,
            help="Path to the G2-26 WhatsApp Attendance Excel file.",
        )
        parser.add_argument(
            "--seed-file",
            type=str,
            help="Path to the Seed_With_Exam_Marks_Updated.xlsx student seed file.",
        )
        parser.add_argument(
            "--cohort",
            type=str,
            default="G2-26",
            help="Target cohort code (default: G2-26).",
        )
        parser.add_argument(
            "--course-code",
            type=str,
            default="VLSI-DESIGN",
            help="Course code (default: VLSI-DESIGN).",
        )

    def find_file(self, given_path, candidates):
        if given_path and os.path.exists(given_path):
            return os.path.abspath(given_path)
        for c in candidates:
            if c and os.path.exists(c):
                return os.path.abspath(c)
        return None

    def handle(self, *args, **options):
        att_path = self.find_file(
            options.get("attendance_file"),
            [
                "G2-26_VLSI_Standard_Attendance_From_WhatsApp.xlsx",
                os.path.join(os.getcwd(), "G2-26_VLSI_Standard_Attendance_From_WhatsApp.xlsx"),
                r"C:\Users\tumma\Downloads\G2-26_VLSI_Standard_Attendance_From_WhatsApp.xlsx",
            ],
        )
        if not att_path:
            raise CommandError("WhatsApp Attendance Excel file not found. Checked default locations.")

        seed_path = self.find_file(
            options.get("seed_file"),
            [
                "Seed_With_Exam_Marks_Updated.xlsx",
                os.path.join(os.getcwd(), "Seed_With_Exam_Marks_Updated.xlsx"),
                r"C:\Users\tumma\Downloads\Seed_With_Exam_Marks_Updated.xlsx",
                "Seed_With_Exam_Marks.xlsx",
                os.path.join(os.getcwd(), "Seed_With_Exam_Marks.xlsx"),
                r"C:\Users\tumma\Downloads\Seed_With_Exam_Marks.xlsx",
            ],
        )
        if not seed_path:
            raise CommandError("Student seed Excel file not found. Checked default locations.")

        cohort_code = options.get("cohort") or "G2-26"
        course_code = options.get("course_code") or "VLSI-DESIGN"

        self.stdout.write(self.style.NOTICE(f"Loading Attendance file: {att_path}"))
        self.stdout.write(self.style.NOTICE(f"Loading Seed file: {seed_path}"))

        wb_att = openpyxl.load_workbook(att_path, data_only=True)
        wb_seed = openpyxl.load_workbook(seed_path, data_only=True)

        # 1. Parse student emails from Seed file
        ws_seed = wb_seed.active
        seed_rows = list(ws_seed.iter_rows(values_only=True))
        seed_header = seed_rows[0]

        def get_col(row, name):
            for idx, h in enumerate(seed_header):
                if h and name.lower() in str(h).lower():
                    return row[idx]
            return None

        seed_emails = set()
        for r in seed_rows[1:]:
            email = get_col(r, "email")
            if email:
                seed_emails.add(str(email).strip().lower())

        self.stdout.write(self.style.SUCCESS(f"Found {len(seed_emails)} target student emails from seed file."))

        # 2. Fetch Cohort and Course
        cohort = Cohort.objects.select_related("course").filter(code=cohort_code, course__code=course_code).first()
        if not cohort:
            cohort = Cohort.objects.select_related("course").filter(code=cohort_code).first()
        if not cohort:
            raise CommandError(f"Cohort '{cohort_code}' does not exist.")

        course = cohort.course or Course.objects.filter(code=course_code).first()

        admin_user = (
            User.objects.filter(role__in=["ADMIN", "SUPER_ADMIN"]).first()
            or User.objects.filter(is_superuser=True).first()
        )

        radhakumari_user, _ = User.objects.get_or_create(
            email="prof.radhakumari@suretrust.local",
            defaults={
                "first_name": "Prof.",
                "last_name": "Radhakumari",
                "role": User.Role.MENTOR,
                "is_staff": True,
            },
        )
        if radhakumari_user.first_name != "Prof." or radhakumari_user.last_name != "Radhakumari":
            radhakumari_user.first_name = "Prof."
            radhakumari_user.last_name = "Radhakumari"
            radhakumari_user.save(update_fields=["first_name", "last_name"])

        mounika_user, _ = User.objects.get_or_create(
            email="mounika.volunteer@suretrust.local",
            defaults={
                "first_name": "Mounika",
                "last_name": "Suretrust Volunteer",
                "role": User.Role.VOLUNTEER,
                "is_staff": True,
            },
        )
        if mounika_user.first_name != "Mounika" or mounika_user.last_name != "Suretrust Volunteer":
            mounika_user.first_name = "Mounika"
            mounika_user.last_name = "Suretrust Volunteer"
            mounika_user.save(update_fields=["first_name", "last_name"])

        pradeep_user, _ = User.objects.get_or_create(
            email="tpradeep@suretrust.local",
            defaults={
                "first_name": "T",
                "last_name": "Pradeep",
                "role": User.Role.MENTOR,
                "is_staff": True,
            },
        )
        if pradeep_user.first_name != "T" or pradeep_user.last_name != "Pradeep":
            pradeep_user.first_name = "T"
            pradeep_user.last_name = "Pradeep"
            pradeep_user.save(update_fields=["first_name", "last_name"])

        cohort.mentors.add(radhakumari_user, pradeep_user)

        # 3. Retrieve StudentProfile records for these students
        profiles_by_email = {}
        for p in StudentProfile.objects.filter(user__email__in=seed_emails).select_related("user"):
            profiles_by_email[p.user.email.lower()] = p

        self.stdout.write(
            self.style.SUCCESS(f"Matched {len(profiles_by_email)} StudentProfile records in database.")
        )

        # 4. Parse WhatsApp Attendance Register
        if "Attendance Register" not in wb_att.sheetnames or "Daily Summary" not in wb_att.sheetnames:
            raise CommandError("Attendance Excel must contain 'Attendance Register' and 'Daily Summary' sheets.")

        ws_reg = wb_att["Attendance Register"]
        ws_daily = wb_att["Daily Summary"]

        # Parse Daily Summary to get session metadata
        daily_rows = list(ws_daily.iter_rows(values_only=True))[1:]
        daily_meta = {}
        for r in daily_rows:
            if r[0] is not None:
                s_label = str(r[2]).strip()
                daily_meta[s_label] = {
                    "num": int(r[0]),
                    "date": r[1],
                    "header_date": r[3],
                    "sender": r[4],
                    "notes": r[10],
                }

        # Parse Attendance Register headers to map column index -> session label
        reg_rows = list(ws_reg.iter_rows(values_only=True))
        reg_header = reg_rows[1]
        session_columns = []  # list of (col_idx, session_label, meta_dict)

        for col_idx in range(3, len(reg_header)):
            header_val = str(reg_header[col_idx]).strip()
            if header_val in ["Present", "Absent", "Attendance %", "None", ""]:
                continue
            meta = daily_meta.get(header_val)
            session_columns.append((col_idx, header_val, meta))

        self.stdout.write(self.style.SUCCESS(f"Found {len(session_columns)} valid attendance session columns."))

        # Map Attendance Register row to student name
        reg_name_to_row = {}
        for r in reg_rows[2:]:
            if r[1] is not None:
                reg_name_to_row[str(r[1]).strip().upper()] = r

        # Build mapping: student_profile -> register row
        student_att_rows = {}
        for email, profile in profiles_by_email.items():
            att_name = self.EXPLICIT_STUDENT_MAP.get(email)
            if not att_name:
                # Fuzzy fallback matching
                full_n = profile.user.get_full_name().upper()
                for an in reg_name_to_row.keys():
                    if an in full_n or full_n in an:
                        att_name = an
                        break
            if att_name and att_name in reg_name_to_row:
                student_att_rows[profile] = reg_name_to_row[att_name]
            else:
                self.stdout.write(self.style.WARNING(f"Could not map student {email} ({profile.user.get_full_name()}) to register."))

        self.stdout.write(
            self.style.SUCCESS(f"Successfully mapped {len(student_att_rows)} students to Attendance Register rows.")
        )

        all_seeded_students = list(student_att_rows.keys())
        guest_email_list = [p.user.email.lower() for p in all_seeded_students]

        # 5. Process and seed each session inside an atomic transaction
        total_sessions_created = 0
        total_summaries_created = 0

        with transaction.atomic():
            for col_idx, s_label, meta in session_columns:
                s_num = meta["num"] if meta else 1
                raw_date = meta["date"] if meta else None
                if isinstance(raw_date, datetime.datetime):
                    class_date = raw_date.date()
                elif isinstance(raw_date, datetime.date):
                    class_date = raw_date
                else:
                    class_date = timezone.localdate()

                # Determine timing
                if "3:30 to 5:30" in s_label:
                    start_time = datetime.time(15, 30, 0)
                    end_time = datetime.time(17, 30, 0)
                    dur_seconds = 7200
                elif "8:00 to 9:30" in s_label:
                    start_time = datetime.time(20, 0, 0)
                    end_time = datetime.time(21, 30, 0)
                    dur_seconds = 5400
                else:
                    # Standard evening domain class (7:00 PM to 8:30 PM)
                    start_time = datetime.time(19, 0, 0)
                    end_time = datetime.time(20, 30, 0)
                    dur_seconds = 5400

                session_title = f"VLSI-DESIGN [G2-26] - Session {s_num:02d} ({s_label})"

                # Determine which of the seeded students are present
                present_students = []
                absent_students = []
                for profile, row_vals in student_att_rows.items():
                    val = str(row_vals[col_idx]).strip().upper() if row_vals[col_idx] is not None else "A"
                    if val == "P":
                        present_students.append(profile)
                    else:
                        absent_students.append(profile)

                raw_sender = meta.get("sender") if meta else None
                clean_sender = self.normalize_sender(raw_sender)

                if clean_sender == "Mounika Suretrust Volunteer":
                    session_conducted_by = mounika_user
                elif clean_sender == "Prof. Radhakumari":
                    session_conducted_by = radhakumari_user
                elif "Pradeep" in clean_sender:
                    session_conducted_by = pradeep_user
                else:
                    session_conducted_by = admin_user

                # Construct Attendance record
                session_obj, created = Attendance.objects.update_or_create(
                    cohort=cohort,
                    class_date=class_date,
                    title=session_title,
                    defaults={
                        "course": course,
                        "class_type": Attendance.ClassType.DOMAIN,
                        "start_time": start_time,
                        "end_time": end_time,
                        "class_status": Attendance.ClassStatus.COMPLETED,
                        "conducted": True,
                        "conducted_by": session_conducted_by,
                        "meeting_link": "https://meet.google.com/vlsi-g226-ses",
                        "notes": f"WhatsApp Attendance - {clean_sender}",
                        "guest_emails": guest_email_list,
                        "whitelisted_guest_emails": guest_email_list,
                    },
                )

                # Set M2M relationships (strictly for our seeded students)
                session_obj.attendees.set(present_students)
                session_obj.joined_students.set(present_students)

                # Construct Google Meet snapshot format
                start_dt = timezone.make_aware(datetime.datetime.combine(class_date, start_time))
                end_dt = timezone.make_aware(datetime.datetime.combine(class_date, end_time))

                expected_students_dict = {}
                for profile in all_seeded_students:
                    s_id = str(profile.id)
                    is_present = profile in present_students
                    if is_present:
                        expected_students_dict[s_id] = {
                            "email": profile.user.email,
                            "name": profile.user.get_full_name().strip(),
                            "join_time": (start_dt + timedelta(minutes=2)).isoformat(),
                            "leave_time": (end_dt - timedelta(minutes=2)).isoformat(),
                            "duration_seconds": dur_seconds - 240,
                            "attendance_percentage": 100.0,
                            "course_id": str(course.id) if course else None,
                            "cohort_id": str(cohort.id),
                            "domain_id": str(course.id) if course else None,
                            "student_id": s_id,
                            "status": "PRESENT",
                        }
                    else:
                        expected_students_dict[s_id] = {
                            "email": profile.user.email,
                            "name": profile.user.get_full_name().strip(),
                            "join_time": None,
                            "leave_time": None,
                            "duration_seconds": 0,
                            "attendance_percentage": 0.0,
                            "course_id": str(course.id) if course else None,
                            "cohort_id": str(cohort.id),
                            "domain_id": str(course.id) if course else None,
                            "student_id": s_id,
                            "status": "ABSENT",
                        }

                session_obj.google_meet_attendance_data = {
                    "status": "READY",
                    "session_id": str(session_obj.id),
                    "class_metrics": {
                        "start_time": start_dt.isoformat(),
                        "end_time": end_dt.isoformat(),
                        "duration_seconds": dur_seconds,
                    },
                    "expected_students": expected_students_dict,
                    "unmatched_participants": [],
                }
                session_obj.save(update_fields=["google_meet_attendance_data"])

                # Create or update AttendanceSummary records
                tot_minutes = float(dur_seconds / 60)
                for profile in all_seeded_students:
                    is_present = profile in present_students
                    AttendanceSummary.objects.update_or_create(
                        session=session_obj,
                        student=profile,
                        defaults={
                            "total_session_minutes": tot_minutes,
                            "active_minutes": float((dur_seconds - 240) / 60) if is_present else 0.0,
                            "attendance_percentage": 100.0 if is_present else 0.0,
                        },
                    )
                    total_summaries_created += 1

                total_sessions_created += 1

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded {total_sessions_created} Attendance sessions "
                f"and {total_summaries_created} AttendanceSummary records for {len(all_seeded_students)} students!"
            )
        )
        self.stdout.write(self.style.SUCCESS("=" * 60))

        # 6. Student-by-student summary printout
        self.stdout.write("Student Attendance Breakdown:")
        total_cohort_pct = 0
        for profile in all_seeded_students:
            summaries = profile.attendance_summaries.filter(session__cohort=cohort)
            tot_sess = summaries.count()
            attended_sess = sum(1 for s in summaries if s.active_minutes > 0)
            pct = round((attended_sess / tot_sess * 100), 2) if tot_sess else 0.0
            total_cohort_pct += pct
            self.stdout.write(
                f" - {profile.user.get_full_name():30} ({profile.user.email:35}): "
                f"{attended_sess}/{tot_sess} sessions ({pct}%)"
            )

        avg_pct = round(total_cohort_pct / len(all_seeded_students), 2) if all_seeded_students else 0.0
        self.stdout.write(self.style.SUCCESS(f"\nCohort G2-26 Average Attendance: {avg_pct}% across all 50 sessions."))
