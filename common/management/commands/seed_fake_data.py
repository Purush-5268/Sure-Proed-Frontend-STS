from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from applications.models import Application
from common.course_catalog import INTERNSHIP_OFFERINGS, internship_curriculum, internship_description
from common.factories import (
    ApplicationFactory,
    AssignmentFactory,
    AttendanceFactory,
    CohortFactory,
    CompanyFactory,
    ExamFactory,
    QuestionFactory,
    StudentProfileFactory,
    SubmissionFactory,
)
from courses.models import Course


class Command(BaseCommand):
    help = "Create fake development data for API testing."

    def add_arguments(self, parser):
        parser.add_argument("--students", type=int, default=10)
        parser.add_argument("--courses", type=int, default=0)
        parser.add_argument("--questions", type=int, default=20)

    @transaction.atomic
    def handle(self, *args, **options):
        admin, _ = User.objects.get_or_create(
            email="admin@suretrust.local",
            defaults={
                "first_name": "Sure",
                "last_name": "Admin",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "is_email_verified": True,
            },
        )
        admin.set_password("Admin@123")
        admin.save()

        mentor, _ = User.objects.get_or_create(
            email="mentor@suretrust.local",
            defaults={
                "first_name": "Sure",
                "last_name": "Mentor",
                "role": User.Role.MENTOR,
                "is_staff": True,
                "is_email_verified": True,
            },
        )
        mentor.set_password("Mentor@123")
        mentor.save()

        course_limit = options["courses"] or len(INTERNSHIP_OFFERINGS)
        courses = []
        for offering in INTERNSHIP_OFFERINGS[:course_limit]:
            course, _ = Course.objects.get_or_create(
                code=offering["code"],
                defaults={
                    "name": offering["name"],
                    "domain": offering["domain"],
                    "subject": offering["subject"],
                    "description": internship_description(),
                    "curriculum": internship_curriculum(),
                    "prerequisites": offering.get("prerequisites", "Interest in the domain and commitment to complete the internship."),
                    "duration_weeks": 24,
                    "difficulty": Course.Difficulty.BEGINNER,
                    "minimum_attendance_percentage": 75,
                    "minimum_assignment_percentage": 60,
                    "status": Course.Status.PUBLISHED,
                    "created_by": admin,
                },
            )
            courses.append(course)
        cohorts = [CohortFactory(course=course, created_by=admin, mentors=[mentor]) for course in courses]
        students = [StudentProfileFactory() for _ in range(options["students"])]
        questions = [QuestionFactory(created_by=admin) for _ in range(options["questions"])]

        applications = []
        for index, student in enumerate(students):
            course = courses[index % len(courses)]
            cohort = cohorts[index % len(cohorts)]
            application = ApplicationFactory(
                student=student,
                course=course,
                assigned_cohort=cohort,
                status=Application.Status.COHORT_ASSIGNED,
                qualified=True,
                qualification_score=72,
            )
            applications.append(application)
            ExamFactory(application=application, questions=questions[:5])

        for cohort in cohorts:
            AttendanceFactory(cohort=cohort, conducted_by=mentor, attendees=students[:5])
            assignment = AssignmentFactory(cohort=cohort, created_by=mentor)
            for student in students[:3]:
                SubmissionFactory(assignment=assignment, student=student, evaluated_by=mentor)

        company = CompanyFactory()
        company.shortlisted_students.add(*students[:3])

        self.stdout.write(self.style.SUCCESS("Fake development data created."))
        self.stdout.write("Login users:")
        self.stdout.write("  admin@suretrust.local / Admin@123")
        self.stdout.write("  mentor@suretrust.local / Mentor@123")
        self.stdout.write(f"Totals: {User.objects.count()} users, {len(students)} students, {len(courses)} courses.")
