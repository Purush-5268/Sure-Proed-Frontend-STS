from datetime import timedelta
from decimal import Decimal

from django.contrib import admin
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from unittest.mock import patch

from accounts.models import User
from cohorts.models import Cohort
from courses.models import Course
from applications.models import Application

from .models import Assignment, CapstoneProject, CapstoneSubmission, Submission


class CapstoneAdminTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.admin_user = User.objects.create_superuser(email="capstone-admin@example.com", password="test-pass")
        self.mentor = User.objects.create_user(
            email="capstone-mentor@suretrust.local", password="test-pass", role=User.Role.MENTOR
        )
        self.other_mentor = User.objects.create_user(
            email="other-capstone-mentor@suretrust.local", password="test-pass", role=User.Role.MENTOR
        )
        self.student_user = User.objects.create_user(
            email="capstone-student@example.com", password="test-pass", role=User.Role.STUDENT
        )
        self.student = self.student_user.student_profile
        self.student.github_repo_url = "https://github.com/Suretrust-Org/capstone-student"
        self.student.save(update_fields=["github_repo_url", "updated_at"])
        self.course = Course.objects.create(
            code="CAPSTONE-101",
            name="Capstone course",
            domain="Technology",
            description="Capstone admin test",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )
        today = timezone.localdate()
        self.cohort = Cohort.objects.create(
            code="CAP-A",
            name="Assigned cohort",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin_user,
        )
        self.other_cohort = Cohort.objects.create(
            code="CAP-B",
            name="Other cohort",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin_user,
        )
        self.cohort.mentors.add(self.mentor)
        self.other_cohort.mentors.add(self.other_mentor)
        now = timezone.now()
        self.capstone = Assignment.objects.create(
            cohort=self.cohort,
            title="Final industry capstone",
            description="Build and demonstrate the final solution.",
            assignment_type=Assignment.AssignmentType.CAPSTONE,
            created_by=self.mentor,
            begin_date=now,
            deadline=now + timedelta(days=30),
            status=Assignment.Status.PUBLISHED,
        )
        self.other_capstone = Assignment.objects.create(
            cohort=self.other_cohort,
            title="Private capstone",
            description="Another cohort's capstone.",
            assignment_type=Assignment.AssignmentType.CAPSTONE,
            created_by=self.other_mentor,
            begin_date=now,
            deadline=now + timedelta(days=30),
            status=Assignment.Status.PUBLISHED,
        )
        self.regular_assignment = Assignment.objects.create(
            cohort=self.cohort,
            title="Regular coding task",
            description="Not a capstone.",
            assignment_type=Assignment.AssignmentType.CODING,
            created_by=self.mentor,
            begin_date=now,
            deadline=now + timedelta(days=7),
            status=Assignment.Status.PUBLISHED,
        )
        self.submission = Submission.objects.create(
            assignment=self.capstone,
            student=self.student,
            submission_url="https://github.com/Suretrust-Org/capstone-student/tree/main/Final-capstone-project",
            submitted_at=now,
            evaluated=True,
            marks_obtained=Decimal("85.00"),
            passed=True,
            evaluated_by=self.mentor,
            evaluated_at=now,
        )

    def _request(self, user):
        request = self.factory.get("/secure-admin/assignments/")
        request.user = user
        return request

    def test_capstones_appear_only_in_dedicated_admin_sections(self):
        generic_projects = admin.site._registry[Assignment].get_queryset(self._request(self.admin_user))
        generic_submissions = admin.site._registry[Submission].get_queryset(self._request(self.admin_user))
        capstone_projects = admin.site._registry[CapstoneProject].get_queryset(self._request(self.admin_user))
        capstone_submissions = admin.site._registry[CapstoneSubmission].get_queryset(self._request(self.admin_user))

        self.assertQuerySetEqual(generic_projects, [self.regular_assignment])
        self.assertQuerySetEqual(generic_submissions, [])
        self.assertQuerySetEqual(capstone_projects, [self.capstone, self.other_capstone], ordered=False)
        self.assertQuerySetEqual(capstone_submissions, [self.submission])

    def test_mentor_sees_only_assigned_cohort_capstones(self):
        project_admin = admin.site._registry[CapstoneProject]
        submission_admin = admin.site._registry[CapstoneSubmission]

        self.assertQuerySetEqual(project_admin.get_queryset(self._request(self.mentor)), [self.capstone])
        self.assertQuerySetEqual(submission_admin.get_queryset(self._request(self.mentor)), [self.submission])

    def test_capstone_admin_shows_progress_and_clickable_links(self):
        project_admin = admin.site._registry[CapstoneProject]
        project = project_admin.get_queryset(self._request(self.admin_user)).get(pk=self.capstone.pk)
        submission_admin = admin.site._registry[CapstoneSubmission]

        self.assertEqual(project_admin.submitted_count(project), 1)
        self.assertEqual(project_admin.evaluated_count(project), 1)
        self.assertEqual(project_admin.passed_count(project), 1)
        self.assertIn(self.submission.submission_url, str(submission_admin.capstone_link(self.submission)))
        self.assertIn(self.student.github_repo_url, str(submission_admin.student_workspace_repository(self.submission)))


class AssignmentApiJourneyTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="assignment-admin@example.com", password="pwd")
        self.mentor = User.objects.create_user(
            email="assignment-mentor@example.com", password="pwd", role=User.Role.MENTOR
        )
        self.student_user = User.objects.create_user(
            email="assignment-student@example.com", password="pwd", role=User.Role.STUDENT
        )
        self.course = Course.objects.create(
            code="ASSIGN-API", name="Generic assignment course", domain="Technology",
            description="Assignment API tests", created_by=self.admin,
        )
        today = timezone.localdate()
        self.cohort = Cohort.objects.create(
            code="ASSIGN-A", name="Assignment cohort", course=self.course,
            start_date=today, end_date=today + timedelta(days=60),
            status=Cohort.Status.ACTIVE, created_by=self.admin,
        )
        self.cohort.mentors.add(self.mentor)
        self.application = Application.objects.create(
            student=self.student_user.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS,
        )
        now = timezone.now()
        self.assignment = Assignment.objects.create(
            cohort=self.cohort, title="Generic repository task", description="Build the requested solution.",
            created_by=self.mentor, begin_date=now - timedelta(hours=1),
            deadline=now + timedelta(days=5), status=Assignment.Status.PUBLISHED,
            files=[{"name": "Reference", "url": "https://example.com/reference"}],
        )
        self.client = APIClient()

    def test_active_student_receives_paginated_assignment_with_submission_state(self):
        self.client.force_authenticate(self.student_user)
        listed = self.client.get("/api/assignments/")
        self.assertEqual(listed.status_code, 200, listed.data)
        rows = listed.data.get("results", listed.data)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["cohort_code"], self.cohort.code)
        self.assertIsNone(rows[0]["my_submission"])

        submitted = self.client.post(
            "/api/submissions/",
            {
                "assignment": str(self.assignment.id),
                "submission_url": "https://github.com/example/student-work",
                "submission_text": "Ready for review",
            },
            format="json",
        )
        self.assertEqual(submitted.status_code, 201, submitted.data)

        listed_again = self.client.get("/api/assignments/")
        rows = listed_again.data.get("results", listed_again.data)
        self.assertEqual(rows[0]["my_submission"]["id"], submitted.data["id"])

        duplicate = self.client.post(
            "/api/submissions/",
            {"assignment": str(self.assignment.id), "submission_url": "https://github.com/example/again"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400, duplicate.data)

    def test_mentor_reviews_only_assigned_cohort_submissions(self):
        Submission.objects.create(
            assignment=self.assignment,
            student=self.student_user.student_profile,
            submission_url="https://github.com/example/student-work",
            submitted_at=timezone.now(),
        )
        self.client.force_authenticate(self.mentor)
        response = self.client.get(f"/api/assignments/{self.assignment.id}/submissions/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["student_code"], self.student_user.student_profile.student_code)

    def test_mentor_submission_list_respects_assignment_filter_inside_authorized_cohort(self):
        selected = Submission.objects.create(
            assignment=self.assignment,
            student=self.student_user.student_profile,
            submission_url="https://github.com/example/selected-work",
            submitted_at=timezone.now(),
        )
        other_assignment = Assignment.objects.create(
            cohort=self.cohort,
            title="Another cohort assignment",
            description="This submission must not leak into the filtered response.",
            created_by=self.mentor,
            begin_date=timezone.now() - timedelta(hours=1),
            deadline=timezone.now() + timedelta(days=5),
            status=Assignment.Status.PUBLISHED,
        )
        Submission.objects.create(
            assignment=other_assignment,
            student=self.student_user.student_profile,
            submission_url="https://github.com/example/other-work",
            submitted_at=timezone.now(),
        )

        self.client.force_authenticate(self.mentor)
        response = self.client.get("/api/submissions/", {"assignment": str(self.assignment.id)})

        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get("results", response.data)
        self.assertEqual([row["id"] for row in rows], [str(selected.id)])

    @patch("assignments.tasks.auto_grade_submission_task.delay")
    def test_autograding_requires_immutable_github_commit(self, delay):
        self.assignment.autograding_enabled = True
        self.assignment.autograding_rubric = "Correctness 70%, documentation 30%."
        self.assignment.save(update_fields=["autograding_enabled", "autograding_rubric", "updated_at"])
        self.client.force_authenticate(self.student_user)

        invalid = self.client.post(
            "/api/submissions/",
            {
                "assignment": str(self.assignment.id),
                "submission_url": "https://github.com/example/student-work",
                "commit_sha": "main",
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400, invalid.data)
        self.assertIn("commit_sha", invalid.data)

        valid = self.client.post(
            "/api/submissions/",
            {
                "assignment": str(self.assignment.id),
                "submission_url": "https://github.com/example/student-work",
                "commit_sha": "a" * 40,
            },
            format="json",
        )
        self.assertEqual(valid.status_code, 201, valid.data)
        delay.assert_called_once()

    def test_assignment_clean_validation_mismatched_module(self):
        from courses.models import CourseModule
        from django.core.exceptions import ValidationError
        from assignments.admin import AssignmentAdminForm

        # Create second course and module
        other_course = Course.objects.create(
            code="OTHER-201",
            name="Other course",
            domain="Design",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        module_other = CourseModule.objects.create(
            course=other_course,
            title="Design Basics",
            module_number=1,
            order=1,
            is_active=True,
        )
        # Attempt to link cohort from course 1 with module from course 2
        bad_assignment = Assignment(
            cohort=self.cohort,
            module=module_other,
            title="Bad Assignment",
            description="Testing mismatched module",
            begin_date=timezone.now(),
            deadline=timezone.now() + timedelta(days=7),
            created_by=self.admin,
        )
        with self.assertRaises(ValidationError) as cm:
            bad_assignment.clean()
        self.assertIn("module", cm.exception.message_dict)

        # Also test AssignmentAdminForm validation
        form = AssignmentAdminForm(data={
            "cohort": str(self.cohort.id),
            "module": str(module_other.id),
            "title": "Bad Form Assignment",
            "description": "Form test",
            "assignment_type": Assignment.AssignmentType.CODING,
            "begin_date": timezone.now().isoformat(),
            "deadline": (timezone.now() + timedelta(days=7)).isoformat(),
            "max_marks": "100.00",
            "pass_percentage": "60.00",
            "status": Assignment.Status.DRAFT,
        })
        self.assertFalse(form.is_valid())
        self.assertIn("module", form.errors)

    def test_assignment_cohort_modules_admin_endpoint(self):
        from courses.models import CourseModule
        import json
        module_correct = CourseModule.objects.create(
            course=self.course,
            title="Cohort Module 1",
            module_number=1,
            order=1,
            is_active=True,
        )
        factory = RequestFactory()
        request = factory.get(f"/secure-admin/assignments/assignment/cohort-modules/?cohort_id={self.cohort.id}")
        request.user = self.admin
        assignment_admin = admin.site._registry[Assignment]
        response = assignment_admin.get_cohort_modules_view(request)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn("modules", data)
        module_ids = [m["id"] for m in data["modules"]]
        self.assertIn(str(module_correct.id), module_ids)

    def test_student_resubmission_flow(self):
        self.client.force_authenticate(self.student_user)
        # 1. Initial submission
        first_sub = self.client.post(
            "/api/submissions/",
            {
                "assignment": str(self.assignment.id),
                "submission_url": "https://github.com/example/attempt-1",
                "submission_text": "First attempt",
            },
            format="json",
        )
        self.assertEqual(first_sub.status_code, 201, first_sub.data)
        sub_id = first_sub.data["id"]
        self.assertEqual(first_sub.data["resubmission_count"], 0)

        # 2. Mentor evaluates the submission
        submission_obj = Submission.objects.get(pk=sub_id)
        submission_obj.evaluated = True
        submission_obj.evaluated_by = self.mentor
        submission_obj.evaluated_at = timezone.now()
        submission_obj.marks_obtained = Decimal("45.00")
        submission_obj.passed = False
        submission_obj.feedback = "Needs improvement on test cases."
        submission_obj.save()

        # 3. Student attempts to resubmit without mentor asking -> blocked!
        unauthorized_resubmit = self.client.post(
            f"/api/submissions/{sub_id}/resubmit/",
            {
                "submission_url": "https://github.com/example/attempt-2",
                "submission_text": "Second attempt without mentor asking",
            },
            format="json",
        )
        self.assertEqual(unauthorized_resubmit.status_code, 400, unauthorized_resubmit.data)
        self.assertIn("assignment", unauthorized_resubmit.data)

        # 4. Mentor asks the user to resubmit
        self.client.force_authenticate(self.mentor)
        request_resp = self.client.post(
            f"/api/submissions/{sub_id}/request-resubmission/",
            {"remarks": "Please fix unit tests and resubmit."},
            format="json",
        )
        self.assertEqual(request_resp.status_code, 200, request_resp.data)
        self.assertTrue(request_resp.data["resubmission_requested"])
        self.assertEqual(request_resp.data["resubmission_remarks"], "Please fix unit tests and resubmit.")

        # 5. Now student resubmits via dedicated /resubmit/ endpoint -> success!
        self.client.force_authenticate(self.student_user)
        resubmit_resp = self.client.post(
            f"/api/submissions/{sub_id}/resubmit/",
            {
                "submission_url": "https://github.com/example/attempt-2",
                "submission_text": "Second attempt with unit tests fixed",
                "commit_sha": "b" * 40,
            },
            format="json",
        )
        self.assertEqual(resubmit_resp.status_code, 200, resubmit_resp.data)
        self.assertEqual(resubmit_resp.data["resubmission_count"], 1)
        self.assertFalse(resubmit_resp.data["resubmission_requested"])
        self.assertEqual(resubmit_resp.data["submission_text"], "Second attempt with unit tests fixed")
        self.assertEqual(resubmit_resp.data["evaluated"], False)
        self.assertIsNone(resubmit_resp.data["marks_obtained"])
        self.assertIsNone(resubmit_resp.data["passed"])

        # 6. Mentor asks user to resubmit again
        submission_obj.refresh_from_db()
        submission_obj.evaluated = True
        submission_obj.save()
        self.client.force_authenticate(self.mentor)
        self.client.post(
            f"/api/submissions/{sub_id}/request-resubmission/",
            {"remarks": "One more iteration needed."},
            format="json",
        )

        # 7. Student resubmits via POST /api/submissions/ with resubmit=True
        self.client.force_authenticate(self.student_user)
        post_resubmit = self.client.post(
            "/api/submissions/",
            {
                "assignment": str(self.assignment.id),
                "submission_url": "https://github.com/example/attempt-3",
                "submission_text": "Third attempt via POST",
                "resubmit": True,
            },
            format="json",
        )
        self.assertEqual(post_resubmit.status_code, 201, post_resubmit.data)
        self.assertEqual(post_resubmit.data["resubmission_count"], 2)
        self.assertFalse(post_resubmit.data["resubmission_requested"])
        self.assertEqual(post_resubmit.data["submission_text"], "Third attempt via POST")

    def test_deadline_enforcement_and_late_submission(self):
        # 1. Student submits before deadline -> SUCCESS
        self.assignment.deadline = timezone.now() + timedelta(days=1)
        self.assignment.allow_late_submissions = False
        self.assignment.save()

        self.client.force_authenticate(self.student_user)
        resp1 = self.client.post(
            "/api/submissions/",
            {"assignment": str(self.assignment.id), "submission_url": "https://github.com/example/1"},
            format="json"
        )
        self.assertEqual(resp1.status_code, 201)
        self.assertFalse(resp1.data["is_late"])

        # Delete submission to allow another test
        Submission.objects.all().delete()

        # 3. Student submits after deadline + late disabled -> REJECT
        self.assignment.deadline = timezone.now() - timedelta(days=1)
        self.assignment.save()

        resp2 = self.client.post(
            "/api/submissions/",
            {"assignment": str(self.assignment.id), "submission_url": "https://github.com/example/2", "submitted_at": (timezone.now() - timedelta(days=2)).isoformat()},
            format="json"
        )
        self.assertEqual(resp2.status_code, 400)
        self.assertEqual(resp2.data.get("detail"), "Submissions are closed for this assignment.")
        self.assertEqual(Submission.objects.count(), 0) # Verifies no submission created (manipulated submitted_at rejected)

        # 4. Student submits after deadline + late enabled -> SUCCESS
        self.assignment.allow_late_submissions = True
        self.assignment.save()

        resp3 = self.client.post(
            "/api/submissions/",
            {"assignment": str(self.assignment.id), "submission_url": "https://github.com/example/3"},
            format="json"
        )
        self.assertEqual(resp3.status_code, 201)
        self.assertTrue(resp3.data["is_late"])

        # 6. Student cannot provide/override is_late
        Submission.objects.all().delete()
        resp4 = self.client.post(
            "/api/submissions/",
            {"assignment": str(self.assignment.id), "submission_url": "https://github.com/example/4", "is_late": False},
            format="json"
        )
        self.assertEqual(resp4.status_code, 201)
        self.assertTrue(resp4.data["is_late"]) # Still True because server-controlled

    def test_mentor_cannot_access_another_cohorts_submission(self):
        other_course = Course.objects.create(code="OTHER", name="Other", domain="Technology", description="Other", created_by=self.admin)
        other_cohort = Cohort.objects.create(
            code="OTHER-C", name="Other Cohort", course=other_course,
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=60),
            status=Cohort.Status.ACTIVE, created_by=self.admin,
        )
        # Mentor is NOT in other_cohort
        other_assignment = Assignment.objects.create(
            cohort=other_cohort, title="Other", description="Other",
            created_by=self.admin, begin_date=timezone.now() - timedelta(hours=1),
            deadline=timezone.now() + timedelta(days=5), status=Assignment.Status.PUBLISHED,
        )
        from django.contrib.auth import get_user_model
        from students.models import StudentProfile
        new_user = get_user_model().objects.create(email="other@example.com", role="STUDENT", is_active=True)
        other_student = StudentProfile.objects.get(user=new_user)
        other_student.student_code = "OTHER1"
        other_student.save()
        Application.objects.create(
            student=other_student, course=other_course, assigned_cohort=other_cohort, status=Application.Status.IN_PROGRESS,
        )
        other_sub = Submission.objects.create(
            assignment=other_assignment, student=other_student,
            submission_url="https://github.com/other", submitted_at=timezone.now()
        )

        self.client.force_authenticate(self.mentor)
        
        # 8 & 9. Cannot see or access by ID
        resp_list = self.client.get("/api/submissions/")
        self.assertNotIn(str(other_sub.id), [s["id"] for s in resp_list.data["results"]])
        
        resp_detail = self.client.get(f"/api/submissions/{other_sub.id}/")
        self.assertEqual(resp_detail.status_code, 404)

        # 10. Cannot grade
        resp_grade = self.client.patch(f"/api/submissions/{other_sub.id}/", {"marks_obtained": 100}, format="json")
        self.assertEqual(resp_grade.status_code, 404)

        # 11. Cannot modify
        resp_req = self.client.post(f"/api/submissions/{other_sub.id}/request-resubmission/", {"remarks": "Hey"}, format="json")
        self.assertEqual(resp_req.status_code, 404)

        # 12. Nested assignment-submission endpoint
        resp_nested = self.client.get(f"/api/assignments/{other_assignment.id}/submissions/")
        self.assertEqual(resp_nested.status_code, 404) # Not found because assignment is filtered out
