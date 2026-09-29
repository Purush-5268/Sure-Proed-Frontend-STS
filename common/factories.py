import random
from datetime import time, timedelta
from decimal import Decimal

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from accounts.models import User
from applications.models import Application
from assignments.models import Assignment, Submission
from attendance.models import Attendance
from certificates.models import Certificate
from cohorts.models import Cohort
from companies.models import Company
from common.course_catalog import INTERNSHIP_OFFERINGS, internship_curriculum, internship_description
from courses.models import Course
from exams.models import Exam, Question
from students.models import StudentProfile


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Faker("bothify", text="user_#####_????@example.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    phone_number = factory.Faker("bothify", text="+91-9#########")
    role = User.Role.STUDENT
    is_active = True
    is_email_verified = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or "Password@123")
        if create:
            self.save()


class MentorFactory(UserFactory):
    role = User.Role.MENTOR


class AdminFactory(UserFactory):
    role = User.Role.ADMIN
    is_staff = True


class CompanyUserFactory(UserFactory):
    role = User.Role.COMPANY


class StudentProfileFactory(DjangoModelFactory):
    class Meta:
        model = StudentProfile

    user = factory.SubFactory(UserFactory)
    student_code = factory.Faker("bothify", text="STU-#####-????")
    is_public = factory.Faker("boolean")
    tagline = factory.Faker("job")
    bio = factory.Faker("paragraph")
    city = factory.Faker("city")
    state = factory.Faker("state")
    college = factory.Faker("company")
    degree = "B.Tech"
    specialization = factory.Iterator(["VLSI", "Embedded Systems", "Python", "Web Development"])
    graduation_year = factory.Iterator([2025, 2026, 2027, 2028])
    skills = factory.LazyFunction(lambda: random.sample(["Python", "Django", "React", "Verilog", "Embedded C"], 3))
    hobbies = factory.LazyFunction(lambda: random.sample(["Robotics", "Reading", "Coding", "Design"], 2))
    languages = factory.LazyFunction(lambda: ["English", "Hindi"])


class CourseFactory(DjangoModelFactory):
    class Meta:
        model = Course

    code = factory.Iterator([offering["code"] for offering in INTERNSHIP_OFFERINGS])
    name = factory.Iterator([offering["name"] for offering in INTERNSHIP_OFFERINGS])
    domain = factory.Iterator([offering["domain"] for offering in INTERNSHIP_OFFERINGS])
    subject = factory.Iterator([offering["subject"] for offering in INTERNSHIP_OFFERINGS])
    description = factory.LazyFunction(internship_description)
    curriculum = factory.LazyFunction(internship_curriculum)
    prerequisites = "Interest in the domain and commitment to complete the internship."
    duration_weeks = 24
    difficulty = factory.Iterator([Course.Difficulty.BEGINNER, Course.Difficulty.INTERMEDIATE])
    status = Course.Status.PUBLISHED
    created_by = factory.SubFactory(AdminFactory)


class CohortFactory(DjangoModelFactory):
    class Meta:
        model = Cohort

    code = factory.Faker("bothify", text="G##-????")
    name = factory.LazyAttribute(lambda obj: f"{obj.course.name} - {obj.code}")
    course = factory.SubFactory(CourseFactory)
    start_date = factory.LazyFunction(lambda: timezone.localdate() + timedelta(days=7))
    end_date = factory.LazyAttribute(lambda obj: obj.start_date + timedelta(weeks=obj.course.duration_weeks))
    max_students = 30
    status = Cohort.Status.OPEN
    meeting_link = "https://meet.example.com/suretrust"
    created_by = factory.SubFactory(AdminFactory)

    @factory.post_generation
    def mentors(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            self.mentors.add(*extracted)


class ApplicationFactory(DjangoModelFactory):
    class Meta:
        model = Application

    application_number = factory.Faker("bothify", text="APP-2026-#####-????")
    student = factory.SubFactory(StudentProfileFactory)
    course = factory.SubFactory(CourseFactory)
    status = Application.Status.APPLIED


class QuestionFactory(DjangoModelFactory):
    class Meta:
        model = Question

    domain = factory.Iterator(["VLSI", "Embedded Systems", "Software"])
    subject = factory.Iterator(["Verilog", "C Programming", "Django"])
    question = factory.Faker("sentence")
    question_type = Question.QuestionType.MCQ
    difficulty = factory.Iterator([Question.Difficulty.EASY, Question.Difficulty.MEDIUM])
    options = factory.LazyFunction(lambda: ["Option A", "Option B", "Option C", "Option D"])
    correct_answer = factory.LazyFunction(lambda: ["Option A"])
    marks = Decimal("1.00")
    tags = factory.LazyFunction(lambda: ["screening", "mvp"])
    created_by = factory.SubFactory(AdminFactory)


class ExamFactory(DjangoModelFactory):
    class Meta:
        model = Exam

    application = factory.SubFactory(ApplicationFactory)
    level = Exam.Level.MIXED
    duration_minutes = 45
    pass_percentage = Decimal("60.00")
    status = Exam.Status.EVALUATED
    total_marks = Decimal("10.00")
    marks_obtained = Decimal("8.00")
    percentage = Decimal("80.00")
    qualified = True
    submitted_at = factory.LazyFunction(timezone.now)
    evaluated_at = factory.LazyFunction(timezone.now)

    @factory.post_generation
    def questions(self, create, extracted, **kwargs):
        if not create:
            return
        questions = extracted or [QuestionFactory() for _ in range(5)]
        self.questions.add(*questions)


class AttendanceFactory(DjangoModelFactory):
    class Meta:
        model = Attendance

    cohort = factory.SubFactory(CohortFactory)
    title = factory.Faker("sentence", nb_words=4)
    class_date = factory.LazyFunction(timezone.localdate)
    start_time = time(18, 0)
    end_time = time(19, 30)
    conducted = True
    conducted_by = factory.SubFactory(MentorFactory)
    meeting_link = "https://meet.example.com/suretrust"

    @factory.post_generation
    def attendees(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            self.attendees.add(*extracted)


class AssignmentFactory(DjangoModelFactory):
    class Meta:
        model = Assignment

    cohort = factory.SubFactory(CohortFactory)
    title = factory.Faker("sentence", nb_words=5)
    description = factory.Faker("paragraph")
    assignment_type = Assignment.AssignmentType.CODING
    created_by = factory.SubFactory(MentorFactory)
    begin_date = factory.LazyFunction(timezone.now)
    deadline = factory.LazyFunction(lambda: timezone.now() + timedelta(days=7))
    status = Assignment.Status.PUBLISHED


class SubmissionFactory(DjangoModelFactory):
    class Meta:
        model = Submission

    assignment = factory.SubFactory(AssignmentFactory)
    student = factory.SubFactory(StudentProfileFactory)
    submission_text = factory.Faker("paragraph")
    submission_url = factory.Faker("url")
    submitted_at = factory.LazyFunction(timezone.now)
    evaluated = True
    evaluated_by = factory.SubFactory(MentorFactory)
    evaluated_at = factory.LazyFunction(timezone.now)
    marks_obtained = Decimal("78.00")
    passed = True
    feedback = factory.Faker("sentence")


class CertificateFactory(DjangoModelFactory):
    class Meta:
        model = Certificate

    certificate_number = factory.Faker("bothify", text="CERT-2026-#####")
    verification_code = factory.Faker("bothify", text="VERIFY-######-????")
    student = factory.SubFactory(StudentProfileFactory)
    application = factory.SubFactory(ApplicationFactory)
    certificate_type = Certificate.CertificateType.COURSE
    issued_at = factory.LazyFunction(timezone.now)
    issued_by = factory.SubFactory(AdminFactory)
    status = Certificate.Status.ACTIVE


class CompanyFactory(DjangoModelFactory):
    class Meta:
        model = Company

    user = factory.SubFactory(CompanyUserFactory)
    name = factory.Faker("company")
    description = factory.Faker("paragraph")
    website = factory.Faker("url")
    industry = factory.Iterator(["Semiconductor", "IT Services", "Education", "Manufacturing"])
    location = factory.Faker("city")
    is_verified = True

    @factory.post_generation
    def shortlisted_students(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            self.shortlisted_students.add(*extracted)
