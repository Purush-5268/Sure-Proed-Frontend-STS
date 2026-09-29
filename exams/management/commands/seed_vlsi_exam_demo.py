from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from applications.models import Application, PreScreening
from applications.services.state_machine import repair_application_state
from courses.models import Course
from exams.attempts import ensure_proctoring_rooms
from exams.models import Exam, InternalExamAttempt
from question_bank.models import QuestionBank


DEMO_EMAIL = "vlsi.exam.demo@example.com"
DEMO_PASSWORD = "VlsiDemo@2026!"


def paper_sets():
    questions = [
        ("Binary 1010 is equal to which decimal value?", ["8", "10", "12", "14"], "10"),
        ("Which logic gate outputs 1 only when all inputs are 1?", ["OR", "XOR", "AND", "NOR"], "AND"),
        ("CMOS combines which transistor types?", ["BJT and JFET", "NMOS and PMOS", "SCR and TRIAC", "LED and diode"], "NMOS and PMOS"),
        ("Setup time is measured relative to which clock event?", ["Active clock edge", "Power-on reset", "Clock period end", "Asynchronous clear only"], "Active clock edge"),
        ("Which Verilog assignment is normally used in sequential always blocks?", ["Blocking =", "Non-blocking <=", "Continuous assign", "Force"], "Non-blocking <="),
        ("A Karnaugh map is primarily used to do what?", ["Route a PCB", "Minimize Boolean logic", "Measure current", "Generate a clock"], "Minimize Boolean logic"),
        ("A D flip-flop stores how many bits?", ["1", "2", "4", "8"], "1"),
        ("Clock skew is the difference in what?", ["Supply voltage", "Clock arrival time", "Transistor width", "Logic level"], "Clock arrival time"),
        ("In an ideal MOSFET, the gate controls current between which terminals?", ["Base and emitter", "Drain and source", "Anode and cathode", "Collector and emitter"], "Drain and source"),
        ("Which platform is generally reprogrammable after manufacture?", ["Mask ROM", "Standard-cell ASIC", "FPGA", "Gate-array ASIC"], "FPGA"),
    ]
    return {
        code: {
            "label": f"Paper {code}",
            "questions": [
                {
                    "id": f"{code}-vlsi-{index:02d}",
                    "question": question,
                    "options": options,
                    "correct": correct,
                    "marks": 1,
                }
                for index, (question, options, correct) in enumerate(questions, start=1)
            ],
        }
        for code in "ABCD"
    }


class Command(BaseCommand):
    help = "Create or reset one isolated VLSI pre-screening candidate for end-to-end testing."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=DEMO_EMAIL)
        parser.add_argument("--password", default=DEMO_PASSWORD)

    @transaction.atomic
    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        password = options["password"]
        course = Course.objects.filter(code__iexact="VLSI-DESIGN").first()
        if not course:
            course = Course.objects.filter(name__icontains="VLSI").order_by("name").first()
        if not course:
            raise CommandError("No VLSI Design course exists; create the real course before seeding the demo.")

        admin = User.objects.filter(is_superuser=True, is_active=True).order_by("created_at").first()
        if not admin:
            admin = User.objects.filter(role=User.Role.ADMIN, is_active=True).order_by("created_at").first()
        if not admin:
            raise CommandError("An active administrator is required to own the demo question bank.")

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "role": User.Role.STUDENT,
                "first_name": "VLSI",
                "last_name": "Exam Demo",
                "phone_number": "9000000000",
                "is_email_verified": True,
            },
        )
        user.role = User.Role.STUDENT
        user.first_name = "VLSI"
        user.last_name = "Exam Demo"
        user.phone_number = "9000000000"
        user.is_email_verified = True
        user.is_active = True
        user.set_password(password)
        user.save()

        profile = user.student_profile
        profile.college = "SURE ProEd Test College"
        profile.degree = "B.Tech"
        profile.specialization = "Electronics and Communication Engineering"
        profile.city = "Hyderabad"
        profile.state = "Telangana"
        profile.country = "India"
        profile.linkedin_url = "https://www.linkedin.com/in/vlsi-exam-demo"
        profile.github_url = "https://github.com/vlsi-exam-demo"
        profile.status = profile.Status.AVAILABLE
        profile.student_identity_issued_at = profile.student_identity_issued_at or timezone.now()
        profile.save()

        application = Application.objects.filter(student=profile, course=course).order_by("created_at").first()
        if not application:
            application = Application.objects.create(
                student=profile,
                course=course,
                status=Application.Status.EXAM_PENDING,
            )
        if application.status != Application.Status.EXAM_PENDING:
            application = repair_application_state(
                application,
                Application.Status.EXAM_PENDING,
                admin,
                "Reset the isolated VLSI exam demo candidate for another test run.",
            )
        application.assigned_cohort = None
        application.qualified = None
        application.qualification_score = None
        application.role_verification_status = Application.RoleVerificationStatus.PENDING
        application.completed_course = False
        application.completed_at = None
        application.final_score = None
        application.save()

        exam, _ = Exam.objects.get_or_create(application=application)
        exam.level = Exam.Level.MIXED
        exam.total_questions = 10
        exam.duration_minutes = 45
        exam.pass_percentage = 60
        exam.status = Exam.Status.PENDING
        exam.started_at = None
        exam.submitted_at = None
        exam.marks_obtained = None
        exam.percentage = None
        exam.qualified = None
        exam.proctor_name = "Django Admin Assigned Proctor"
        exam.proctoring_enabled = True
        exam.proctoring_required = True
        exam.proctoring_room_count = 4
        exam.proctoring_capacity_per_room = 50
        exam.save()

        now = timezone.now()
        PreScreening.objects.update_or_create(
            application=application,
            defaults={
                "interviewer": "Django Admin Assigned Proctor",
                "scheduled_at": now - timedelta(minutes=2),
                "end_time": now + timedelta(minutes=60),
                "status": PreScreening.Status.SCHEDULED,
                "remarks": "Isolated VLSI exam-module integration test window.",
            },
        )

        bank, _ = QuestionBank.objects.update_or_create(
            exam=exam,
            title="[TEST] VLSI Design Pre-Screening Demo",
            defaults={
                "bank_type": QuestionBank.BankType.PRESCREENING,
                "course": course,
                "cohort": None,
                "module": None,
                "module_test": None,
                "description": "Isolated deterministic paper bank for production integration testing.",
                "difficulty": QuestionBank.Difficulty.MIXED,
                "source_topics": course.course_prerequisites or ["Digital Logic", "CMOS", "Verilog"],
                "sets_data": paper_sets(),
                "total_questions_per_set": 10,
                "is_ai_generated": False,
                "status": QuestionBank.Status.APPROVED,
                "lifecycle_status": QuestionBank.LifecycleStatus.OPEN,
                "error_message": "",
                "is_active": True,
                "created_by": admin,
            },
        )

        deleted_attempts, _ = InternalExamAttempt.objects.filter(exam=exam).delete()
        rooms = ensure_proctoring_rooms(exam, bank, reconfigure=True)
        for room in rooms:
            room.assigned_students.remove(profile)
        rooms[0].assigned_students.add(profile)

        self.stdout.write(self.style.SUCCESS("VLSI exam demo candidate is ready."))
        self.stdout.write(f"Email: {email}")
        self.stdout.write(f"Password: {password}")
        self.stdout.write(f"Student code: {profile.student_code}")
        self.stdout.write(f"Application: {application.application_number}")
        self.stdout.write(f"Exam ID: {exam.id}")
        self.stdout.write(f"Question bank ID: {bank.id}")
        self.stdout.write(f"Assigned room: {rooms[0].code}")
        self.stdout.write(f"Reset attempts: {deleted_attempts}")
