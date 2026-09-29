from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application
from assignments.models import Assignment
from attendance.models import Attendance
from certificates.models import Certificate
from cohorts.models import Cohort
from common.models import Announcement, Notification, PushSubscription, UserRequest
from companies.models import Company, JobReference
from courses.models import Course
from exams.models import Exam
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice


class DashboardApiContractTests(TestCase):
    """Protect the student and mentor dashboard API contract."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="dashboard-admin@example.com",
            password="test-pass",
        )
        self.mentor = User.objects.create_user(
            email="mentor-one@example.com",
            password="test-pass",
            first_name="Mentor",
            last_name="One",
            role=User.Role.MENTOR,
        )
        self.other_mentor = User.objects.create_user(
            email="mentor-two@example.com",
            password="test-pass",
            role=User.Role.MENTOR,
        )
        self.volunteer = User.objects.create_user(
            email="volunteer-one@example.com",
            password="test-pass",
            role=User.Role.VOLUNTEER,
        )
        self.other_volunteer = User.objects.create_user(
            email="volunteer-two@example.com",
            password="test-pass",
            role=User.Role.VOLUNTEER,
        )
        self.trustee = User.objects.create_user(
            email="trustee-one@example.com",
            password="test-pass",
            role=User.Role.TRUSTEE,
        )
        self.company_user = User.objects.create_user(
            email="company-one@example.com",
            password="test-pass",
            role=User.Role.COMPANY,
        )
        self.student_user = User.objects.create_user(
            email="student-one@example.com",
            password="test-pass",
            first_name="Student",
            last_name="One",
            role=User.Role.STUDENT,
        )
        self.other_student_user = User.objects.create_user(
            email="student-two@example.com",
            password="test-pass",
            role=User.Role.STUDENT,
        )
        self.student = self.student_user.student_profile
        self.other_student = self.other_student_user.student_profile

        self.course = Course.objects.create(
            code="DASH-101",
            name="Dashboard Engineering",
            domain="Technology",
            description="Dashboard contract course",
            status=Course.Status.PUBLISHED,
            created_by=self.admin,
        )
        today = timezone.localdate()
        self.cohort = Cohort.objects.create(
            code="DASH-C1",
            name="Dashboard Cohort One",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        self.other_cohort = Cohort.objects.create(
            code="DASH-C2",
            name="Dashboard Cohort Two",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=90),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin,
        )
        self.cohort.mentors.add(self.mentor)
        self.other_cohort.mentors.add(self.other_mentor)
        self.cohort.volunteers.add(self.volunteer)
        self.other_cohort.volunteers.add(self.other_volunteer)

        self.application = Application.objects.create(
            application_number="APP-DASH-001",
            student=self.student,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS,
            qualified=True,
        )
        Application.objects.create(
            application_number="APP-DASH-002",
            student=self.other_student,
            course=self.course,
            assigned_cohort=self.other_cohort,
            status=Application.Status.IN_PROGRESS,
            qualified=True,
        )

    @staticmethod
    def _items(response):
        data = response.json()
        return data.get("results", data) if isinstance(data, dict) else data

    def test_student_statistics_exposes_prescreen_marks_and_grade(self):
        Exam.objects.create(
            application=self.application,
            status=Exam.Status.EVALUATED,
            submitted_at=timezone.now(),
            marks_obtained=Decimal("42.00"),
            total_marks=Decimal("50.00"),
            percentage=Decimal("84.00"),
            qualified=True,
        )
        Notification.objects.create(
            user=self.student_user,
            title="Your screening result is ready",
            message="You scored 42 out of 50.",
        )
        self.client.force_authenticate(self.student_user)

        response = self.client.get("/api/students/statistics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(str(response.data["screening_marks_obtained"])), Decimal("42.00"))
        self.assertEqual(Decimal(str(response.data["screening_total_marks"])), Decimal("50.00"))
        self.assertEqual(Decimal(str(response.data["screening_percentage"])), Decimal("84.00"))
        self.assertEqual(response.data["screening_grade"], "A")
        self.assertTrue(response.data["screening_qualified"])
        self.assertEqual(response.data["unread_notification_count"], 1)
        self.assertEqual(response.data["journey"]["total_steps"], 18)
        self.assertEqual(len(response.data["journey"]["steps"]), 18)

    def test_existing_applications_can_backfill_real_personal_notifications(self):
        Notification.objects.all().delete()

        call_command("backfill_application_notifications")
        call_command("backfill_application_notifications")

        notifications = Notification.objects.filter(
            user=self.student_user,
            title="Application received",
            action_url="application_tracker",
        )
        self.assertEqual(notifications.count(), 1)
        self.assertIn(self.application.application_number, notifications.get().message)

    def test_mentor_application_reads_are_limited_to_assigned_cohort(self):
        self.client.force_authenticate(self.mentor)

        response = self.client.get("/api/applications/")

        self.assertEqual(response.status_code, 200)
        applications = self._items(response)
        self.assertEqual([item["application_number"] for item in applications], ["APP-DASH-001"])
        self.assertIn("pre_screening_interview", applications[0])
        self.assertIn("screening_exam", applications[0])
        self.assertIn("student_role_verified", applications[0])

    def test_course_catalog_cache_is_invalidated_after_admin_update(self):
        self.client.force_authenticate(self.admin)
        first = self.client.get("/api/courses/")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self._items(first)[0]["name"], "Dashboard Engineering")

        changed = self.client.patch(
            f"/api/courses/{self.course.id}/",
            {"name": "Updated Dashboard Engineering"},
            format="json",
        )
        self.assertEqual(changed.status_code, 200)

        refreshed = self.client.get("/api/courses/")
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(self._items(refreshed)[0]["name"], "Updated Dashboard Engineering")

    def test_bell_notifications_are_personal_and_mark_read_actions_work(self):
        own_one = Notification.objects.create(
            user=self.student_user,
            title="Your timetable changed",
            message="A class was rescheduled.",
            action_url="timetable",
        )
        own_two = Notification.objects.create(
            user=self.student_user,
            title="Assignment published",
            message="Open your assignments.",
            action_url="assignments",
        )
        Notification.objects.create(
            user=self.other_student_user,
            title="Private message for another student",
            message="This must never appear in the first student's bell.",
        )
        self.client.force_authenticate(self.student_user)

        listing = self.client.get("/api/notifications/")
        rows = self._items(listing)

        self.assertEqual(listing.status_code, 200)
        self.assertEqual({row["id"] for row in rows}, {str(own_one.id), str(own_two.id)})
        self.assertEqual({row["action_url"] for row in rows}, {"timetable", "assignments"})

        marked = self.client.post(f"/api/notifications/{own_one.id}/mark-read/")
        self.assertEqual(marked.status_code, 200)
        self.assertTrue(marked.data["is_read"])

        # Underscore endpoint test
        marked_underscore = self.client.post(f"/api/notifications/{own_two.id}/mark_read/")
        self.assertEqual(marked_underscore.status_code, 200)
        self.assertTrue(marked_underscore.data["is_read"])

        mark_all = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(mark_all.status_code, 200)
        self.assertFalse(Notification.objects.filter(user=self.student_user, is_read=False).exists())

    def test_cohort_announcement_routes_only_to_assigned_role_members(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            "/api/announcements/",
            {
                "title": "AI/ML cohort starts 24/08/2026",
                "message": "Welcome to your assigned AI/ML cohort.",
                "target_audience": Announcement.TargetAudience.COHORT,
                "cohort": str(self.cohort.id),
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        recipients = set(
            Notification.objects.filter(title="Announcement: AI/ML cohort starts 24/08/2026")
            .values_list("user__email", flat=True)
        )
        self.assertEqual(
            recipients,
            {self.student_user.email, self.mentor.email, self.volunteer.email},
        )
        self.assertNotIn(self.other_student_user.email, recipients)
        self.assertNotIn(self.other_mentor.email, recipients)
        self.assertNotIn(self.other_volunteer.email, recipients)
        self.assertNotIn(self.trustee.email, recipients)
        self.assertNotIn(self.company_user.email, recipients)

    def test_role_announcement_does_not_leak_to_other_roles_or_other_cohorts(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/announcements/",
            {
                "title": "Student registration checklist",
                "message": "Complete the student registration steps.",
                "target_audience": Announcement.TargetAudience.STUDENTS,
                "cohort": str(self.cohort.id),
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        recipients = list(
            Notification.objects.filter(title="Announcement: Student registration checklist")
            .values_list("user__email", flat=True)
        )
        self.assertEqual(recipients, [self.student_user.email])

        for user in (self.mentor, self.volunteer, self.trustee, self.company_user, self.other_student_user):
            self.client.force_authenticate(user)
            announcements = self._items(self.client.get("/api/announcements/"))
            self.assertNotIn("Student registration checklist", {item["title"] for item in announcements})
            bell = self._items(self.client.get("/api/notifications/"))
            self.assertNotIn("Announcement: Student registration checklist", {item["title"] for item in bell})

    def test_all_users_announcement_is_intentional_and_reaches_every_active_role(self):
        self.client.force_authenticate(self.admin)
        sent = self.client.post(
            "/api/announcements/",
            {
                "title": "Platform maintenance",
                "message": "The platform will be unavailable for ten minutes.",
                "target_audience": Announcement.TargetAudience.ALL,
            },
            format="json",
        )
        self.assertEqual(sent.status_code, 201, sent.data)

        expected = {
            self.admin.email,
            self.mentor.email,
            self.other_mentor.email,
            self.volunteer.email,
            self.other_volunteer.email,
            self.student_user.email,
            self.other_student_user.email,
            self.trustee.email,
            self.company_user.email,
        }
        recipients = set(
            Notification.objects.filter(title="Announcement: Platform maintenance")
            .values_list("user__email", flat=True)
        )
        self.assertEqual(recipients, expected)

        for user in (self.student_user, self.mentor, self.volunteer, self.trustee, self.company_user):
            self.client.force_authenticate(user)
            bell = self._items(self.client.get("/api/notifications/"))
            self.assertIn("Announcement: Platform maintenance", {item["title"] for item in bell})

        self.client.force_authenticate(self.admin)
        missing_audience = self.client.post(
            "/api/announcements/",
            {"title": "Ambiguous broadcast", "message": "Audience was omitted."},
            format="json",
        )
        self.assertEqual(missing_audience.status_code, 400)

    def test_staff_mentor_sees_only_own_support_requests(self):
        self.mentor.is_staff = True
        self.mentor.save(update_fields=["is_staff"])
        student_request = UserRequest.objects.create(
            sender=self.student_user,
            category=UserRequest.Category.OFFER_LETTER,
            subject="Student offer letter request",
            description="This must remain private from the mentor request inbox.",
        )
        mentor_request = UserRequest.objects.create(
            sender=self.mentor,
            category=UserRequest.Category.MENTOR_SUPPORT,
            subject="Mentor class support",
            description="Please help reschedule a class.",
        )

        self.client.force_authenticate(self.mentor)
        rows = self._items(self.client.get("/api/requests/"))

        self.assertEqual({row["id"] for row in rows}, {str(mentor_request.id)})
        self.assertNotIn(str(student_request.id), {row["id"] for row in rows})

    def test_volunteer_support_inboxes_are_scoped_to_own_and_assigned_students(self):
        own_request = UserRequest.objects.create(
            sender=self.volunteer,
            category=UserRequest.Category.VOLUNTEER_SUPPORT,
            subject="Volunteer support",
            description="A request from the signed-in volunteer.",
        )
        assigned_student_request = UserRequest.objects.create(
            sender=self.student_user,
            category=UserRequest.Category.ATTENDANCE,
            subject="Assigned cohort request",
            description="This student belongs to the volunteer's cohort.",
        )
        other_student_request = UserRequest.objects.create(
            sender=self.other_student_user,
            category=UserRequest.Category.ATTENDANCE,
            subject="Other cohort request",
            description="This student must not be visible to another volunteer.",
        )

        self.client.force_authenticate(self.volunteer)
        sent = self._items(self.client.get("/api/requests/?scope=mine"))
        received = self._items(self.client.get("/api/requests/?scope=received"))
        all_visible = self._items(self.client.get("/api/requests/"))

        self.assertEqual({row["id"] for row in sent}, {str(own_request.id)})
        self.assertEqual({row["id"] for row in received}, {str(assigned_student_request.id)})
        self.assertEqual(
            {row["id"] for row in all_visible},
            {str(own_request.id), str(assigned_student_request.id)},
        )
        self.assertNotIn(str(other_student_request.id), {row["id"] for row in all_visible})

    def test_volunteer_cannot_resolve_or_message_their_own_sent_request(self):
        own_request = UserRequest.objects.create(
            sender=self.volunteer,
            category=UserRequest.Category.VOLUNTEER_SUPPORT,
            subject="Volunteer support",
            description="A sent request must remain separate from the reviewer inbox.",
        )
        self.client.force_authenticate(self.volunteer)

        status_response = self.client.post(
            f"/api/requests/{own_request.pk}/update-status/",
            {"new_status": UserRequest.Status.RESOLVED},
            format="json",
        )
        message_response = self.client.post(
            f"/api/requests/{own_request.pk}/message/",
            {"message": "This must not send a self-message."},
            format="json",
        )

        self.assertEqual(status_response.status_code, 403)
        self.assertEqual(message_response.status_code, 403)
        own_request.refresh_from_db()
        self.assertEqual(own_request.status, UserRequest.Status.PENDING)

    def test_mentor_messages_only_authorized_recipient_roles(self):
        self.mentor.is_staff = True
        self.mentor.save(update_fields=["is_staff"])
        self.client.force_authenticate(self.mentor)

        allowed_targets = (self.student_user, self.admin, self.volunteer, self.company_user)
        directory = self._items(self.client.get("/api/users/"))
        self.assertEqual(
            {row["email"] for row in directory},
            {self.mentor.email, *(target.email for target in allowed_targets)},
        )
        for target in allowed_targets:
            response = self.client.post(
                "/api/notifications/",
                {
                    "user_id": str(target.id),
                    "title": "Mentor message",
                    "message": f"Personal message for {target.email}",
                    "notification_type": Notification.Type.INFO,
                },
                format="json",
            )
            self.assertEqual(response.status_code, 201, response.data)

        for target in (self.other_student_user, self.other_volunteer, self.other_mentor, self.trustee):
            response = self.client.post(
                "/api/notifications/",
                {"user_id": str(target.id), "title": "Blocked", "message": "Must not route."},
                format="json",
            )
            self.assertEqual(response.status_code, 403, response.data)

    def test_mentor_student_list_is_limited_to_assigned_cohort(self):
        self.client.force_authenticate(self.mentor)

        response = self.client.get("/api/students/")

        self.assertEqual(response.status_code, 200)
        rows = self._items(response)
        self.assertEqual([row["student_code"] for row in rows], [self.student.student_code])
        self.assertEqual(rows[0]["cohort"], str(self.cohort.id))
        self.assertEqual(rows[0]["cohort_code"], self.cohort.code)

    def test_mentor_certificates_are_limited_to_assigned_students(self):
        Certificate.objects.create(
            certificate_number="CERT-DASH-001",
            verification_code="VERIFY-DASH-001",
            student=self.student,
            application=self.application,
            issued_at=timezone.now(),
            issued_by=self.admin,
        )
        other_application = Application.objects.get(application_number="APP-DASH-002")
        Certificate.objects.create(
            certificate_number="CERT-DASH-002",
            verification_code="VERIFY-DASH-002",
            student=self.other_student,
            application=other_application,
            issued_at=timezone.now(),
            issued_by=self.admin,
        )
        self.client.force_authenticate(self.mentor)

        response = self.client.get("/api/certificates/")

        self.assertEqual(response.status_code, 200)
        rows = self._items(response)
        self.assertEqual([row["certificate_number"] for row in rows], ["CERT-DASH-001"])

    def test_mentor_can_publish_assignment_with_android_date_fields(self):
        self.client.force_authenticate(self.mentor)

        response = self.client.post(
            "/api/assignments/",
            {
                "cohort": str(self.cohort.id),
                "title": "API-linked assignment",
                "description": "Complete the dashboard task.",
                "assignment_type": Assignment.AssignmentType.PROJECT,
                "begin_date": str(timezone.localdate()),
                "deadline": str(timezone.localdate() + timedelta(days=7)),
                "max_marks": "100.00",
                "pass_percentage": "60.00",
                "status": Assignment.Status.PUBLISHED,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        assignment = Assignment.objects.get(pk=response.data["id"])
        self.assertEqual(assignment.created_by, self.mentor)
        self.assertEqual(timezone.localtime(assignment.begin_date).hour, 0)
        self.assertEqual(timezone.localtime(assignment.deadline).hour, 23)
        self.assertTrue(
            Notification.objects.filter(
                user=self.student_user,
                title="New assignment published",
            ).exists()
        )

    def test_mentor_can_schedule_class_without_spoofing_conductor(self):
        self.client.force_authenticate(self.mentor)

        response = self.client.post(
            "/api/attendance/",
            {
                "cohort": str(self.cohort.id),
                "title": "Data structures live class",
                "class_date": str(timezone.localdate() + timedelta(days=1)),
                "start_time": "18:00:00",
                "end_time": "19:30:00",
                "conducted": False,
                "meeting_link": "https://meet.example.com/dashboard-class",
                "whitelisted_guest_emails": [
                    "Guest.One@example.com",
                    "guest.two@example.com",
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        session = Attendance.objects.get(pk=response.data["id"])
        self.assertEqual(session.conducted_by, self.mentor)
        self.assertFalse(session.conducted)
        self.assertEqual(session.class_status, Attendance.ClassStatus.SCHEDULED)
        self.assertEqual(
            session.whitelisted_guest_emails,
            ["guest.one@example.com", "guest.two@example.com"],
        )
        self.assertFalse(session.notes)
        self.assertTrue(
            Notification.objects.filter(
                user=self.student_user,
                title="Class scheduled",
            ).exists()
        )

        action_url = f"/attendance/{session.id}/"
        original = Notification.objects.get(user=self.student_user, action_url=action_url)
        self.assertIn("at 6:00 PM", original.message)
        self.assertEqual(original.dedupe_key, f"attendance:{session.id}:schedule")
        self.assertFalse(
            Notification.objects.filter(user=self.other_student_user, action_url=action_url).exists()
        )

        update = self.client.patch(
            f"/api/attendance/{session.id}/",
            {
                "start_time": "19:15:00",
                "class_status": Attendance.ClassStatus.RESCHEDULED,
            },
            format="json",
        )
        self.assertEqual(update.status_code, 200, update.data)

        current_rows = Notification.objects.filter(user=self.student_user, action_url=action_url)
        self.assertEqual(current_rows.count(), 1)
        current = current_rows.get()
        self.assertEqual(current.pk, original.pk)
        self.assertEqual(current.title, "Class rescheduled")
        self.assertIn("at 7:15 PM", current.message)
        self.assertFalse(current.is_read)

        self.client.force_authenticate(self.student_user)
        visible = [
            row for row in self._items(self.client.get("/api/notifications/"))
            if row.get("action_url") == action_url
        ]
        self.assertEqual(len(visible), 1)
        self.assertEqual(visible[0]["id"], str(original.pk))

    def test_company_profile_and_job_reference_are_mentor_owned_and_cohort_scoped(self):
        self.client.force_authenticate(self.mentor)
        company_response = self.client.post(
            "/api/companies/",
            {
                "name": "Mentor One Technologies",
                "website": "https://mentor-one.example.com",
                "industry": "Semiconductor",
                "location": "Hyderabad",
            },
            format="json",
        )
        self.assertEqual(company_response.status_code, 201, company_response.data)
        company = Company.objects.get(pk=company_response.data["id"])
        self.assertEqual(company.user, self.mentor)

        job_response = self.client.post(
            "/api/job-references/",
            {
                "cohort": str(self.cohort.id),
                "company": str(company.id),
                "title": "Graduate VLSI Engineer",
                "employment_type": JobReference.EmploymentType.FULL_TIME,
                "location": "Hyderabad",
                "description": "Entry-level opening for the assigned cohort.",
                "apply_url": "https://mentor-one.example.com/jobs/vlsi",
                "deadline": str(timezone.localdate() + timedelta(days=15)),
                "is_active": True,
                "notify_students": True,
            },
            format="json",
        )

        self.assertEqual(job_response.status_code, 201, job_response.data)
        job = JobReference.objects.get(pk=job_response.data["id"])
        self.assertEqual(job.created_by, self.mentor)
        self.assertEqual(job.cohort, self.cohort)
        self.assertTrue(
            Notification.objects.filter(
                user=self.student_user,
                title="New job reference",
            ).exists()
        )
        self.assertFalse(
            Notification.objects.filter(
                user=self.other_student_user,
                title="New job reference",
            ).exists()
        )

        self.client.force_authenticate(self.student_user)
        student_jobs = self.client.get("/api/job-references/")
        self.assertEqual(student_jobs.status_code, 200)
        self.assertEqual(len(self._items(student_jobs)), 1)

    def test_other_mentor_cannot_write_to_unassigned_cohort(self):
        self.client.force_authenticate(self.other_mentor)

        response = self.client.post(
            "/api/attendance/",
            {
                "cohort": str(self.cohort.id),
                "title": "Unauthorized class",
                "class_date": str(timezone.localdate() + timedelta(days=1)),
                "start_time": "10:00:00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_push_subscription_and_notification_admin_change_views(self):
        device = TOTPDevice.objects.create(user=self.admin, name="tests", confirmed=True)
        self.client.force_login(self.admin)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()

        sub = PushSubscription.objects.create(
            user=self.student_user,
            endpoint="https://fcm.googleapis.com/fcm/send/test-sub-123",
            p256dh="test_p256dh",
            auth="test_auth",
            user_agent="Mozilla/5.0 Test",
            is_active=True,
        )
        notif = Notification.objects.create(
            user=self.student_user,
            title="Test Notice",
            message="Test body",
            notification_type=Notification.Type.INFO,
            is_read=False,
        )

        sub_resp = self.client.get(f"/secure-admin/common/pushsubscription/{sub.id}/change/")
        self.assertEqual(sub_resp.status_code, 200)

        notif_resp = self.client.get(f"/secure-admin/common/notification/{notif.id}/change/")
        self.assertEqual(notif_resp.status_code, 200)
