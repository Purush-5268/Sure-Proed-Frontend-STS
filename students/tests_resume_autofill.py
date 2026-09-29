from django.test import TestCase

from accounts.models import User
from accounts.views import sync_student_profile_from_linkedin
from students.services.resume_profile_service import (
    autofill_student_profile_from_resume,
    extract_profile_details,
)


class ResumeAndLinkedInAutofillTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="autofill.student@example.com",
            password="StrongPassword123!",
            first_name="Auto",
            last_name="Fill",
            role=User.Role.STUDENT,
        )
        self.profile = self.user.student_profile

    @staticmethod
    def resume_text():
        return """
Auto Fill
LinkedIn: https://www.linkedin.com/in/auto-fill
GitHub: https://github.com/auto-fill
Mobile: +91 9876543210
PROFESSIONAL SUMMARY
Embedded systems student experienced in Python, Django, testing, and IoT development.
SKILLS
Languages: Python, C++, Embedded C
Tools: Django, PostgreSQL, Git, FreeRTOS
EDUCATION
Example Technical University
Bachelor of Technology
Electronics and Communication Engineering; CGPA: 8.5
Expected graduation: 2027
PROJECTS
Built a secure student platform and an IoT monitoring application.
"""

    def test_resume_extracts_reliable_profile_details(self):
        details = extract_profile_details(self.resume_text())

        self.assertEqual(details["user"]["phone_number"], "+91 9876543210")
        self.assertEqual(details["profile"]["college"], "Example Technical University")
        self.assertEqual(details["profile"]["degree"], "Bachelor of Technology")
        self.assertEqual(details["profile"]["specialization"], "Electronics and Communication Engineering")
        self.assertEqual(details["profile"]["graduation_year"], 2027)
        self.assertIn("Python", details["profile"]["skills"])

    def test_degree_date_suffix_is_not_saved_as_part_of_degree(self):
        details = extract_profile_details(
            """
EDUCATION
Example University
Bachelor of Technology Aug' 2024 - Present
Electronics and Communication Engineering
"""
        )

        self.assertEqual(details["profile"]["degree"], "Bachelor of Technology")

    def test_resume_fills_only_blank_fields(self):
        self.profile.college = "Student Entered College"
        self.profile.skills = ["Student Entered Skill"]
        self.profile.save(update_fields=["college", "skills", "updated_at"])
        self.user.phone_number = "+91 9000000000"
        self.user.save(update_fields=["phone_number", "updated_at"])

        changed = autofill_student_profile_from_resume(self.profile.id, self.resume_text())

        self.profile.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(self.profile.college, "Student Entered College")
        self.assertEqual(self.profile.skills, ["Student Entered Skill"])
        self.assertEqual(self.user.phone_number, "+91 9000000000")
        self.assertEqual(self.profile.degree, "Bachelor of Technology")
        self.assertEqual(self.profile.specialization, "Electronics and Communication Engineering")
        self.assertIn("degree", changed["profile"])
        self.assertNotIn("college", changed["profile"])

    def test_linkedin_sync_fills_blanks_without_overwriting_user_values(self):
        self.profile.college = "Student Entered College"
        self.profile.skills = ["Student Entered Skill"]
        self.profile.save(update_fields=["college", "skills", "updated_at"])

        sync_student_profile_from_linkedin(
            self.profile,
            {
                "sub": "linkedin-autofill-user",
                "headline": "LinkedIn Headline",
                "summary": "LinkedIn summary text",
                "college": "LinkedIn College",
                "degree": "LinkedIn Degree",
                "skills": ["LinkedIn Skill"],
            },
        )

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.college, "Student Entered College")
        self.assertEqual(self.profile.skills, ["Student Entered Skill"])
        self.assertEqual(self.profile.degree, "LinkedIn Degree")
        self.assertEqual(self.profile.tagline, "LinkedIn Headline")
        self.assertEqual(self.profile.bio, "LinkedIn summary text")
