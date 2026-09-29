from django.core.management.base import BaseCommand
from accounts.models import User
from courses.models import Course
from common.course_catalog import INTERNSHIP_OFFERINGS, internship_curriculum, internship_description


class Command(BaseCommand):
    help = "Synchronize the 27 official SureTrust 6-month internship courses in the database safely."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Archive non-official courses and sync official offerings.",
        )

    def handle(self, *args, **options):
        admin = User.objects.filter(is_superuser=True).first() or User.objects.filter(is_staff=True).first()
        if not admin:
            admin = User.objects.create_superuser(
                email="admin@suretrust.local",
                password="Admin@123"
            )

        official_codes = set()
        created_count = 0
        updated_count = 0

        for offering in INTERNSHIP_OFFERINGS:
            code = offering["code"]
            name = offering["name"]
            official_codes.add(code)

            # Look up course by code OR by matching name
            course = Course.objects.filter(code=code).first() or Course.objects.filter(name=name).first()
            category_val = offering.get("category", "Non-Medical")

            if course:
                course.code = code
                course.name = name
                course.category = category_val
                course.domain = offering["domain"]
                course.subject = offering["subject"]
                course.description = internship_description()
                course.curriculum = internship_curriculum()
                course.prerequisites = offering["prerequisites"]
                if not course.eligibility_criteria:
                    course.eligibility_criteria = offering["prerequisites"]
                course.duration_weeks = 24
                course.difficulty = Course.Difficulty.BEGINNER
                course.minimum_attendance_percentage = 75
                course.minimum_assignment_percentage = 60
                course.status = Course.Status.PUBLISHED
                course.save()
                updated_count += 1
            else:
                Course.objects.create(
                    code=code,
                    name=name,
                    category=category_val,
                    domain=offering["domain"],
                    subject=offering["subject"],
                    description=internship_description(),
                    curriculum=internship_curriculum(),
                    prerequisites=offering["prerequisites"],
                    eligibility_criteria=offering["prerequisites"],
                    duration_weeks=24,
                    difficulty=Course.Difficulty.BEGINNER,
                    minimum_attendance_percentage=75,
                    minimum_assignment_percentage=60,
                    status=Course.Status.PUBLISHED,
                    created_by=admin,
                )
                created_count += 1

        # Safely handle legacy/extra courses without delete() to avoid ForeignKeyViolation on mentors_mentorprofile
        extra_courses = Course.objects.exclude(code__in=official_codes)
        archived_count = 0
        for extra in extra_courses:
            if extra.status != Course.Status.ARCHIVED:
                extra.status = Course.Status.ARCHIVED
                extra.save()
                archived_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully synced {len(INTERNSHIP_OFFERINGS)} official courses ({created_count} created, {updated_count} updated, {archived_count} archived)."
            )
        )
