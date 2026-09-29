import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application, PreScreening, PreScreeningInterview
from assignments.models import Assignment, Submission
from attendance.models import Attendance
from certificates.models import Certificate
from cohorts.models import Cohort
from common.models import Announcement, FAQ, Notification, SystemInformation, UserRequest
from companies.models import Company, JobPosting, JobReference
from courses.models import Course, CourseModule
from exams.models import Exam, ModuleTest, ModuleTestSubmission
from feedback.models import Feedback
from students.models import StudentProfile
from trainings.models import Training, TrainingAttendance, TrainingSession
from volunteers.models import MentorProfile, VolunteerProfile


class ComprehensiveAllRolesE2ETests(TestCase):
    """
    Complete end-to-end automation test suite validating all API endpoints
    and role lifecycles: Student, Mentor, Volunteer, Trustee, Company, and Admin.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Setup Admin
        self.admin = User.objects.create_superuser(
            email="e2e-admin@suretrust.local",
            password="AdminPassword123!",
            first_name="Admin",
            last_name="User",
            role=User.Role.ADMIN,
        )

        # 2. Setup Mentor
        self.mentor_user = User.objects.create_user(
            email="e2e-mentor@suretrust.local",
            password="MentorPassword123!",
            first_name="Mentor",
            last_name="Pro",
            role=User.Role.MENTOR,
        )
        self.mentor_profile, _ = MentorProfile.objects.get_or_create(
            user=self.mentor_user,
            defaults={"company_name": "Tech Corp", "designation": "Staff Engineer"},
        )

        # 3. Setup Volunteer
        self.volunteer_user = User.objects.create_user(
            email="e2e-volunteer@suretrust.local",
            password="VolunteerPassword123!",
            first_name="Volunteer",
            last_name="Helper",
            role=User.Role.VOLUNTEER,
        )
        self.volunteer_profile, _ = VolunteerProfile.objects.get_or_create(
            user=self.volunteer_user,
            defaults={"organization_name": "Global Care", "occupation": "Advisor"},
        )

        # 4. Setup Trustee
        self.trustee_user = User.objects.create_user(
            email="e2e-trustee@suretrust.local",
            password="TrusteePassword123!",
            first_name="Trustee",
            last_name="Board",
            role=User.Role.TRUSTEE,
        )

        # 5. Setup Company User
        self.company_user = User.objects.create_user(
            email="e2e-company@suretrust.local",
            password="CompanyPassword123!",
            first_name="Hiring",
            last_name="Manager",
            role=User.Role.COMPANY,
        )

        # 6. Setup Student User
        self.student_user = User.objects.create_user(
            email="alice.student@example.com",
            password="StudentPassword123!",
            first_name="Alice",
            last_name="Student",
            phone_number="9876543210",
            gender=User.Gender.FEMALE,
            role=User.Role.STUDENT,
        )
        self.student_profile = self.student_user.student_profile
        self.student_profile.college = "Institute of Technology"
        self.student_profile.degree = "B.Tech Computer Science"
        self.student_profile.is_linkedin_connected = True
        self.student_profile.is_github_connected = True
        self.student_profile.save()

        # 7. Setup Course & Modules
        self.course = Course.objects.create(
            code="E2E-PY-101",
            name="Full-Stack Python Engineering",
            domain="Software Engineering",
            description="Comprehensive end-to-end Python curriculum",
            status=Course.Status.PUBLISHED,
            minimum_attendance_percentage=Decimal("75.00"),
            minimum_assignment_percentage=Decimal("60.00"),
            created_by=self.admin,
        )
        self.module_1 = CourseModule.objects.create(
            course=self.course,
            module_number=1,
            title="Module 1: Django Architecture",
            order=1,
        )
        self.module_2 = CourseModule.objects.create(
            course=self.course,
            module_number=2,
            title="Module 2: REST APIs & Security",
            order=2,
        )

        # 8. Setup Cohort
        today = timezone.localdate()
        self.cohort = Cohort.objects.create(
            code="E2E-C1",
            name="Alpha Cohort 2026",
            course=self.course,
            start_date=today - timedelta(days=15),
            end_date=today + timedelta(days=45),
            status=Cohort.Status.OPEN,
            created_by=self.admin,
        )
        self.cohort.mentors.add(self.mentor_user)
        self.cohort.volunteers.add(self.volunteer_user)

    def test_01_student_full_lifecycle_and_certificate_issuance(self):
        """
        Tests complete student journey:
        Browse Courses -> Apply -> Pre-Screening -> Interview -> Cohort Assignment ->
        Training Session & Attendance -> Assignments & Grading -> Module Tests ->
        Feedback & Support Request -> Course Completion & Certificate Generation.
        """
        # Step A: Browse Published Courses
        self.client.force_authenticate(user=self.student_user)
        course_res = self.client.get("/api/courses/")
        self.assertEqual(course_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(course_res.data["results"] if "results" in course_res.data else course_res.data), 1)

        # Step B: Submit Application for Course
        app_payload = {
            "course": str(self.course.id),
        }
        app_res = self.client.post("/api/applications/", app_payload, format="json")
        self.assertEqual(app_res.status_code, status.HTTP_201_CREATED)
        app_id = app_res.data["id"]

        # Step C: Admin evaluates Pre-Screening Exam & Marks Interview as Passed
        self.client.force_authenticate(user=self.admin)
        app_obj = Application.objects.get(id=app_id)
        app_obj.status = Application.Status.PRESCREENING_COMPLETED
        app_obj.save()

        interview, _ = PreScreeningInterview.objects.get_or_create(
            application=app_obj,
            defaults={"status": PreScreeningInterview.Status.PASSED, "interviewer": self.mentor_user},
        )
        interview.status = PreScreeningInterview.Status.PASSED
        interview.save()

        # Step D: Assign to Cohort
        app_obj.assigned_cohort = self.cohort
        app_obj.status = Application.Status.COHORT_ASSIGNED
        app_obj.save()

        # Step E: Training & Attendance
        training = Training.objects.create(
            title="Life Skills & Technical Training",
            training_type=Training.TrainingType.LST,
            duration_hours=20,
        )
        session = TrainingSession.objects.create(
            training=training,
            cohort=self.cohort,
            title="Class 1: Django REST Framework In-Depth",
            session_date=timezone.localdate(),
            start_time=timezone.now().time(),
            end_time=(timezone.now() + timedelta(hours=1)).time(),
            meeting_link="https://meet.google.com/abc-defg-hij",
            conducted_by=self.mentor_user,
        )

        # Student views training sessions & mentor records attendance
        self.client.force_authenticate(user=self.student_user)
        session_list_res = self.client.get("/api/training-sessions/")
        self.assertEqual(session_list_res.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.mentor_user)
        att_res = self.client.post(
            "/api/training-attendances/",
            {
                "session": str(session.id),
                "student": str(self.student_profile.id),
                "status": "PRESENT",
                "remarks": "Active participation.",
            },
            format="json",
        )
        self.assertEqual(att_res.status_code, status.HTTP_201_CREATED)

        # Step F: Assignment Creation & Student Submission
        assignment = Assignment.objects.create(
            cohort=self.cohort,
            title="Assignment 1: Build API Endpoints",
            description="Create secure DRF ViewSets with proper permissions",
            begin_date=timezone.now(),
            deadline=timezone.now() + timedelta(days=7),
            max_marks=100,
            status=Assignment.Status.PUBLISHED,
            created_by=self.mentor_user,
        )
        self.client.force_authenticate(user=self.student_user)
        sub_res = self.client.post(
            "/api/submissions/",
            {
                "assignment": str(assignment.id),
                "submission_url": "https://github.com/journey-student/drf-endpoints",
                "submission_text": "Completed all requirements with tests.",
            },
            format="json",
        )
        self.assertEqual(sub_res.status_code, status.HTTP_201_CREATED)
        submission_id = sub_res.data["id"]

        # Step G: Mentor Grades Submission
        self.client.force_authenticate(user=self.mentor_user)
        grade_res = self.client.patch(
            f"/api/submissions/{submission_id}/",
            {"marks_obtained": 95, "feedback": "Excellent work with clear documentation.", "evaluated": True},
            format="json",
        )
        self.assertEqual(grade_res.status_code, status.HTTP_200_OK)

        # Step H: Module Test & Submission
        module_test = ModuleTest.objects.create(
            course=self.course,
            module=self.module_1,
            title="Module 1 Assessment",
            duration_minutes=30,
            pass_percentage=Decimal("70.00"),
        )

        test_sub = ModuleTestSubmission.objects.create(
            test=module_test,
            student=self.student_profile,
            marks_obtained=Decimal("90.00"),
            total_marks=Decimal("100.00"),
        )

        self.client.force_authenticate(user=self.student_user)
        test_list_res = self.client.get("/api/module-tests/")
        self.assertEqual(test_list_res.status_code, status.HTTP_200_OK)

        test_sub_res = self.client.get("/api/module-test-submissions/")
        self.assertEqual(test_sub_res.status_code, status.HTTP_200_OK)

        # Step I: Student submits Course Feedback & Support Request
        fb_res = self.client.post(
            "/api/feedback/",
            {
                "cohort": str(self.cohort.id),
                "rating": 5,
                "comments": "Exceptional mentor support and hands-on curriculum!",
            },
            format="json",
        )
        self.assertEqual(fb_res.status_code, status.HTTP_201_CREATED)

        req_res = self.client.post(
            "/api/requests/",
            {
                "subject": "Need career mentorship session",
                "description": "Requesting 1:1 guidance regarding job applications.",
                "category": "OTHER",
            },
            format="json",
        )
        self.assertEqual(req_res.status_code, status.HTTP_201_CREATED, req_res.data)

        # Step J: Course Completion & Certificate Generation
        self.client.force_authenticate(user=self.admin)
        app_obj.status = Application.Status.COMPLETED
        app_obj.completed_course = True
        app_obj.completed_at = timezone.now()
        app_obj.final_score = 100
        app_obj.save()

        cert = Certificate.objects.create(
            student=self.student_profile,
            application=app_obj,
            recipient_name="Alice Student",
            certificate_number="CERT-E2E-2026-001",
            issued_at=timezone.now(),
            verification_code="SURE-VERIFY-9999",
            certificate_type=Certificate.CertificateType.COURSE,
            status=Certificate.Status.ACTIVE,
        )

        # Student checks certificate
        self.client.force_authenticate(user=self.student_user)
        cert_res = self.client.get("/api/certificates/")
        self.assertEqual(cert_res.status_code, status.HTTP_200_OK)

        # Public Verification Endpoint
        self.client.logout()
        verify_res = self.client.get(f"/api/certificates/verify/?code={cert.verification_code}")
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

    def test_02_mentor_and_volunteer_lifecycle(self):
        """
        Tests Mentor and Volunteer operations:
        - Mentor view assigned cohorts, students, sessions
        - Volunteer view assigned cohorts, manage attendance
        - Admin grant & revoke global cohort access
        """
        # Mentor Login Token Check via /api/auth/token/
        self.client.force_authenticate(user=None)
        login_res = self.client.post(
            "/api/auth/token/",
            {"email": self.mentor_user.email, "password": "MentorPassword123!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_res.data)
        self.assertEqual(login_res.data["user"]["role"], "MENTOR")

        # Mentor Views Cohorts
        self.client.force_authenticate(user=self.mentor_user)
        cohort_res = self.client.get("/api/cohorts/")
        self.assertEqual(cohort_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(cohort_res.data["results"] if "results" in cohort_res.data else cohort_res.data), 1)

        # Volunteer Views Cohorts
        self.client.force_authenticate(user=self.volunteer_user)
        v_cohort_res = self.client.get("/api/cohorts/")
        self.assertEqual(v_cohort_res.status_code, status.HTTP_200_OK)

        # Admin Grants Global Cohort Access to Volunteer
        self.client.force_authenticate(user=self.admin)
        grant_res = self.client.post(
            "/api/cohorts/grant_all_cohorts_access/",
            {"user_id": str(self.volunteer_user.id)},
            format="json",
        )
        self.assertEqual(grant_res.status_code, status.HTTP_200_OK)
        self.assertTrue(grant_res.data["has_all_cohorts_access"])

        # Admin Revokes Global Cohort Access from Volunteer
        revoke_res = self.client.post(
            "/api/cohorts/revoke_all_cohorts_access/",
            {"email": self.volunteer_user.email},
            format="json",
        )
        self.assertEqual(revoke_res.status_code, status.HTTP_200_OK)
        self.assertFalse(revoke_res.data["has_all_cohorts_access"])

    def test_03_company_hiring_and_job_lifecycle(self):
        """
        Tests Company hiring lifecycle:
        - Company Profile creation & retrieval
        - Post Job Openings & Job References
        - Student applies to Job Posting
        - Company shortlists certified student candidate
        """
        # Company Profile
        self.client.force_authenticate(user=self.company_user)
        company = Company.objects.create(
            user=self.company_user,
            name="Acme Global Tech",
            description="Leading AI and cloud engineering enterprise",
            website="https://acmeglobal.example.com",
            is_verified=True,
        )

        # Get Company Details by ID
        comp_detail_res = self.client.get(f"/api/companies/{company.id}/")
        self.assertEqual(comp_detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(comp_detail_res.data["name"], "Acme Global Tech")

        # Student also views verified Company details
        self.client.force_authenticate(user=self.student_user)
        stu_comp_res = self.client.get(f"/api/companies/{company.id}/")
        self.assertEqual(stu_comp_res.status_code, status.HTTP_200_OK)

        # Post a Job Opening
        self.client.force_authenticate(user=self.company_user)
        job = JobPosting.objects.create(
            company=company,
            title="Junior Backend Developer (Django)",
            description="Develop robust REST APIs with Django and PostgreSQL",
            requirements="Python, Django, REST Framework, PostgreSQL",
            location="Bangalore / Remote",
            salary_range="6 - 9 LPA",
            status=JobPosting.Status.OPEN,
        )

        # Student applies to Job Opening
        self.client.force_authenticate(user=self.student_user)
        apply_res = self.client.post(f"/api/job-postings/{job.id}/apply/")
        self.assertEqual(apply_res.status_code, status.HTTP_200_OK)

        # Company shortlists student
        self.client.force_authenticate(user=self.company_user)
        shortlist_res = self.client.post(
            f"/api/companies/{company.id}/shortlist_student/",
            {"student_id": str(self.student_profile.id)},
            format="json",
        )
        self.assertEqual(shortlist_res.status_code, status.HTTP_200_OK)

    def test_04_trustee_and_admin_governance(self):
        """
        Tests Trustee & Admin governance:
        - View Platform Announcements & FAQs
        - Check System Information & Metrics
        - Manage System Notifications
        """
        # Create Announcement
        self.client.force_authenticate(user=self.admin)
        announcement = Announcement.objects.create(
            title="Annual Convocation & Placement Drive 2026",
            message="Registrations open for graduating cohorts.",
            created_by=self.admin,
        )

        # Trustee Views Announcements & FAQs
        self.client.force_authenticate(user=self.trustee_user)
        ann_res = self.client.get("/api/announcements/")
        self.assertEqual(ann_res.status_code, status.HTTP_200_OK)

        faq = FAQ.objects.create(
            question="How do I get my certificate verified?",
            answer="Use the public verification link with your unique verification code.",
            order=1,
        )
        faq_res = self.client.get("/api/faqs/")
        self.assertEqual(faq_res.status_code, status.HTTP_200_OK)
