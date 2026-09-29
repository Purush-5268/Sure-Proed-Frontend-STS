from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status
from django.utils import timezone

from accounts.models import User
from courses.models import Course
from cohorts.models import Cohort
from applications.models import Application
from students.models import StudentProfile


class StudentQualifiedFilterTestCase(APITestCase):
    def setUp(self):
        # Create Admin user
        self.admin = User.objects.create_superuser(
            email="admin_filter@suretrust.org",
            password="Password123!",
            first_name="Admin",
            last_name="Test",
        )
        self.client.force_authenticate(user=self.admin)

        # Create Course & Cohort
        self.course = Course.objects.create(
            name="Data Science Track",
            code="DS-101",
            description="Data science masterclass",
            created_by=self.admin,
        )
        self.cohort = Cohort.objects.create(
            course=self.course,
            code="DS-2026-B1",
            name="Data Science Batch 1",
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timezone.timedelta(days=90),
            created_by=self.admin,
        )

        # Student 1: qualified=True, status=COHORT_ASSIGNED
        self.user1 = User.objects.create_user(
            email="qualified_student@student.example.com",
            password="SecureP@ssw0rd123!",
            first_name="Alice",
            last_name="Qualified",
            role=User.Role.STUDENT,
        )
        self.profile1 = self.user1.student_profile
        self.app1 = Application.objects.create(
            student=self.profile1,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.COHORT_ASSIGNED,
            qualified=True,
        )

        # Student 2: qualified=False, status=REJECTED
        self.user2 = User.objects.create_user(
            email="unqualified_student@student.example.com",
            password="SecureP@ssw0rd123!",
            first_name="Bob",
            last_name="Unqualified",
            role=User.Role.STUDENT,
        )
        self.profile2 = self.user2.student_profile
        self.app2 = Application.objects.create(
            student=self.profile2,
            course=self.course,
            status=Application.Status.REJECTED,
            qualified=False,
        )

        # Student 3: qualified=None (pending), status=APPLIED
        self.user3 = User.objects.create_user(
            email="pending_student@student.example.com",
            password="SecureP@ssw0rd123!",
            first_name="Charlie",
            last_name="Pending",
            role=User.Role.STUDENT,
        )
        self.profile3 = self.user3.student_profile
        self.app3 = Application.objects.create(
            student=self.profile3,
            course=self.course,
            status=Application.Status.APPLIED,
        )

    def test_filter_qualified_true(self):
        response = self.client.get("/api/students/?qualified=true")
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        codes = [item["student_code"] for item in results]
        self.assertIn(self.profile1.student_code, codes)
        self.assertNotIn(self.profile2.student_code, codes)
        self.assertNotIn(self.profile3.student_code, codes)

    def test_filter_qualified_false(self):
        response = self.client.get("/api/students/?qualified=false")
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        codes = [item["student_code"] for item in results]
        self.assertIn(self.profile2.student_code, codes)
        self.assertNotIn(self.profile1.student_code, codes)
        self.assertNotIn(self.profile3.student_code, codes)

    def test_filter_qualified_null(self):
        response = self.client.get("/api/students/?qualified=null")
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        codes = [item["student_code"] for item in results]
        self.assertIn(self.profile3.student_code, codes)
        self.assertNotIn(self.profile1.student_code, codes)
        self.assertNotIn(self.profile2.student_code, codes)

    def test_combined_filters(self):
        url = f"/api/students/?course={self.course.code}&cohort={self.cohort.code}&qualified=true"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        codes = [item["student_code"] for item in results]
        self.assertEqual(codes, [self.profile1.student_code])


class StudentFileUploadsTestCase(TestCase):
    @staticmethod
    def _pdf_file(filename, lines):
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from reportlab.pdfgen import canvas

        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer)
        y = 800
        for line in lines:
            pdf.drawString(50, y, line)
            y -= 22
        pdf.save()
        return SimpleUploadedFile(filename, buffer.getvalue(), content_type="application/pdf")

    @staticmethod
    def _resume_lines():
        return [
            "File Tester - Resume",
            "Email: file_test_student@student.example.com | Phone: +91 9876543210",
            "Professional Summary",
            "Motivated software engineering student seeking an internship and practical development opportunities.",
            "Education",
            "Bachelor of Technology in Computer Science, Example University, graduating in 2027.",
            "Technical Skills",
            "Python, Django, REST APIs, PostgreSQL, Git, HTML, CSS, JavaScript and automated testing.",
            "Projects",
            "Built a student management platform and a secure portfolio application using Django.",
            "Experience",
            "Completed a software development internship involving API design, debugging, and documentation.",
            "Certifications and Achievements",
            "Completed cloud fundamentals and Python programming certifications with practical assessments.",
        ]

    @classmethod
    def _docx_file(cls, filename, lines):
        import io
        import zipfile
        from xml.sax.saxutils import escape

        from django.core.files.uploadedfile import SimpleUploadedFile

        paragraphs = "".join(
            f"<w:p><w:r><w:t>{escape(line)}</w:t></w:r></w:p>" for line in lines
        )
        document_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{paragraphs}</w:body></w:document>"
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>"
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", content_types)
            archive.writestr("word/document.xml", document_xml)
        return SimpleUploadedFile(
            filename,
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    def setUp(self):
        import os
        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        import io

        self.user = User.objects.create_user(
            email="file_test_student@student.example.com",
            password="SecureP@ssw0rd123!",
            first_name="File",
            last_name="Tester",
            role=User.Role.STUDENT,
        )
        self.profile = self.user.student_profile
        self.code = self.profile.student_code

        # Create dummy image
        img = Image.new('RGB', (100, 100), color='blue')
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        self.photo1 = SimpleUploadedFile(f"{self.code}_old.jpg", buf.getvalue(), content_type="image/jpeg")
        self.photo2 = SimpleUploadedFile(f"{self.code}_new.jpg", buf.getvalue(), content_type="image/jpeg")

        self.resume1 = self._pdf_file(f"{self.code}_old.pdf", self._resume_lines())
        self.resume2 = self._pdf_file(f"{self.code}_new.pdf", self._resume_lines())

    def test_deterministic_upload_paths_and_old_file_deletion(self):
        import os

        # 1. First upload
        self.profile.profile_photo = self.photo1
        self.profile.resume = self.resume1
        self.profile.save()

        first_photo_path = self.profile.profile_photo.path
        first_resume_path = self.profile.resume.path

        self.assertIn(self.code, first_photo_path)
        self.assertTrue(first_photo_path.endswith(".jpg"))
        self.assertIn(self.code, first_resume_path)
        self.assertTrue(first_resume_path.endswith(".pdf"))
        self.assertTrue(os.path.exists(first_photo_path))
        self.assertTrue(os.path.exists(first_resume_path))

        # 2. Re-upload new photo and resume
        self.profile.profile_photo = self.photo2
        self.profile.resume = self.resume2
        self.profile.save()

        new_photo_path = self.profile.profile_photo.path
        new_resume_path = self.profile.resume.path

        self.assertIn(self.code, new_photo_path)
        self.assertTrue(new_photo_path.endswith(".jpg"))
        self.assertIn(self.code, new_resume_path)
        self.assertTrue(new_resume_path.endswith(".pdf"))
        self.assertTrue(os.path.exists(new_photo_path))
        self.assertTrue(os.path.exists(new_resume_path))
        self.assertEqual(first_photo_path, new_photo_path)
        matching_photos = [
            name for name in os.listdir(os.path.dirname(new_photo_path))
            if name.startswith(f"{self.code}_photo")
        ]
        self.assertEqual(matching_photos, [f"{self.code}_photo.jpg"])

        # 3. Delete profile and ensure files cleaned up
        self.profile.delete()
        self.assertFalse(os.path.exists(new_photo_path))
        self.assertFalse(os.path.exists(new_resume_path))

    def test_resume_and_photo_security_validation(self):
        from common.validators import validate_resume_file, validate_profile_photo_file
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.files.uploadedfile import SimpleUploadedFile

        # 1. Invalid resume extension (.exe pretending to be resume)
        bad_ext_resume = SimpleUploadedFile("malicious.exe", b"MZ dummy header", content_type="application/octet-stream")
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(bad_ext_resume)

        # 2. Fake PDF header (file extension .pdf but bad magic bytes)
        fake_pdf = SimpleUploadedFile("fake.pdf", b"NOT_A_PDF_HEADER", content_type="application/pdf")
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(fake_pdf)

        # 3. HTML script tag injection inside PDF extension
        script_pdf = SimpleUploadedFile("script.pdf", b"%PDF- <script>alert(1)</script>", content_type="application/pdf")
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(script_pdf)

        # 4. A malformed file with only a PDF-looking header is rejected
        malformed_pdf = SimpleUploadedFile(
            "malformed.pdf",
            b"%PDF-1.7 This is not a real PDF document",
            content_type="application/pdf",
        )
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(malformed_pdf)

        # 5. A real but unrelated PDF is rejected because it is not a resume
        unrelated_pdf = self._pdf_file(
            "unrelated.pdf",
            [
                "Community Event Agenda",
                "Welcome to the annual community gathering and cultural programme.",
                "The schedule contains registration, lunch, games, music, awards, and closing remarks.",
                "Guests should arrive early and carry their event admission confirmation.",
            ],
        )
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(unrelated_pdf)

        # 6. A genuine, readable resume passes
        valid_pdf = self._pdf_file("valid.pdf", self._resume_lines())
        self.assertIsNone(validate_resume_file(valid_pdf))

        valid_docx = self._docx_file("valid.docx", self._resume_lines())
        self.assertIsNone(validate_resume_file(valid_docx))

        fake_docx = SimpleUploadedFile(
            "fake.docx",
            b"PK\x03\x04not-a-real-word-document",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(fake_docx)

        # 7. Identity checking rejects somebody else's resume
        wrong_identity_pdf = self._pdf_file(
            "wrong-person.pdf",
            [
                line.replace("File Tester", "Different Person").replace(
                    "file_test_student@student.example.com", "different.person@example.com"
                )
                for line in self._resume_lines()
            ],
        )
        with self.assertRaises(DjangoValidationError):
            validate_resume_file(wrong_identity_pdf, student_profile=self.profile)

    def test_profile_api_serializer_rejects_non_resume_document(self):
        from students.serializers import StudentProfileSerializer

        unrelated_pdf = self._pdf_file(
            "meeting-notes.pdf",
            [
                "Weekly Operations Meeting Notes",
                "The team discussed office maintenance, travel bookings, procurement, and the event calendar.",
                "Action items include ordering supplies, confirming catering, and arranging the next meeting.",
                "Attendees reviewed budgets and administrative deadlines before closing the discussion.",
            ],
        )
        serializer = StudentProfileSerializer(
            self.profile,
            data={"resume": unrelated_pdf},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("resume", serializer.errors)

        valid_serializer = StudentProfileSerializer(
            self.profile,
            data={"resume": self._pdf_file("my-resume.pdf", self._resume_lines())},
            partial=True,
        )
        self.assertTrue(valid_serializer.is_valid(), valid_serializer.errors)

    def test_profile_api_returns_400_for_invalid_resume_instead_of_500(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.user)
        invalid_resume = SimpleUploadedFile(
            "not-a-resume.pdf",
            b"%PDF-1.4\nThis is not a readable resume document.",
            content_type="application/pdf",
        )

        response = client.patch(
            f"/api/students/{self.profile.id}/",
            {"resume": invalid_resume},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("resume", response.data)
        self.assertNotIn("['", str(response.data["resume"]))

    def test_resume_accepts_common_cv_section_heading_variants(self):
        from common.validators import validate_resume_file

        cv = self._pdf_file(
            "alternate-headings-cv.pdf",
            [
                "File Tester - Curriculum Vitae",
                "Email: file_test_student@student.example.com | Phone: +91 9876543210",
                "Academic Background",
                "Bachelor of Technology in Computer Science, Example University, 2027.",
                "Core Competencies",
                "Python, Django REST APIs, PostgreSQL, Git, JavaScript, testing and debugging.",
                "Professional History",
                "Software development intern responsible for APIs, documentation and automated tests.",
                "Key Assignments",
                "Developed a secure student platform and portfolio application for practical use.",
            ],
        )

        self.assertIsNone(validate_resume_file(cv, student_profile=self.profile))

    def test_pdf_extraction_prefers_structurally_complete_cv_text(self):
        from common.validators import _resume_extraction_quality

        partial_header = "File Tester Curriculum Vitae email@example.com"
        complete_cv = (
            "File Tester email@example.com mobile 9876543210 education Bachelor degree "
            "skills Python Django projects student platform internship software developer "
            "achievements hackathon winner"
        )

        self.assertGreater(
            _resume_extraction_quality(complete_cv),
            _resume_extraction_quality(partial_header),
        )

    def test_technical_cv_with_publication_terms_is_not_treated_as_research_paper(self):
        from common.validators import validate_resume_file

        technical_cv = self._pdf_file(
            "technical-cv.pdf",
            [
                "File Tester - Curriculum Vitae",
                "Email: file_test_student@student.example.com | Mobile: +91 9876543210",
                "LinkedIn: linkedin.com/in/file-tester | GitHub: github.com/file-tester",
                "SKILLS",
                "Python, embedded systems, verification methodology, APIs and automated testing.",
                "PROJECTS",
                "Built an IoT platform and documented the methodology and technical references.",
                "TRAINING",
                "Software development internship involving implementation, debugging and documentation.",
                "PUBLICATIONS",
                "Contributed a journal manuscript and a book chapter about real-time applications.",
                "EDUCATION",
                "Bachelor of Technology in Computer Science, Example University, graduating in 2027.",
            ],
        )

        self.assertIsNone(validate_resume_file(technical_cv, student_profile=self.profile))

    def test_standalone_academic_paper_remains_rejected(self):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from common.validators import validate_resume_file

        paper = self._pdf_file(
            "research-paper.pdf",
            [
                "A Novel Analysis of Distributed Sensor Networks",
                "Abstract",
                "This manuscript studies a distributed sensing methodology for industrial systems.",
                "Introduction",
                "Prior journal literature motivates this experimental analysis and its hypotheses.",
                "Methodology",
                "The experimental procedure compares measurements across several controlled datasets.",
                "References",
                "Journal of Sensor Research, Volume 12, DOI: 10.1000/example-reference.",
            ],
        )

        with self.assertRaises(DjangoValidationError):
            validate_resume_file(paper)

    def test_serializer_uses_saved_linkedin_photo_when_local_photo_is_missing(self):
        from students.serializers import StudentProfileSerializer

        linkedin_photo = "https://media.licdn.com/profile-photo.jpg"
        self.profile.profile_photo = None
        self.profile.linkedin_profile_data = {
            "sub": "linkedin-user-123",
            "picture": linkedin_photo,
        }
        self.profile.save()

        data = StudentProfileSerializer(self.profile).data

        self.assertEqual(data["linkedin_profile_photo_url"], linkedin_photo)
        self.assertEqual(data["profile_photo"], linkedin_photo)

    def test_serializer_supports_legacy_linkedin_photo_data(self):
        from students.serializers import StudentProfileSerializer

        linkedin_photo = "https://media.licdn.com/legacy-profile-photo.jpg"
        self.profile.profile_photo = None
        self.profile.linkedin_profile_data = {
            "profilePicture": {
                "displayImage~": {
                    "elements": [{"identifiers": [{"identifier": linkedin_photo}]}]
                }
            }
        }
        self.profile.save()

        data = StudentProfileSerializer(self.profile).data

        self.assertEqual(data["linkedin_profile_photo_url"], linkedin_photo)
        self.assertEqual(data["profile_photo"], linkedin_photo)
