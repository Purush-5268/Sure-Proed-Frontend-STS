from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import EmailVerificationOTP, PasswordResetOTP, User
from applications.models import Application, CommunityActivity, PreScreening, PreScreeningInterview, ApplicationStatusAudit
from assignments.models import Assignment, Submission, CapstoneProject, CapstoneSubmission
from attendance.models import Attendance, AttendanceRecord, AbsenceWarning, AttendanceSummary, PermissionRequestMessage
from certificates.models import Certificate
from cohorts.chat_models import CohortConversation, CohortMessage, CohortChatReadState
from cohorts.models import Cohort
from common.models import Achievement, Notification, UserRequest, PushSubscription
from feedback.models import Feedback
from companies.models import Company, JobReference
from courses.models import Course, CourseModule
from exams.models import Exam, InternalExamAttempt, ExamSecurityEvent, ModuleTest, ModuleTestSubmission
from students.models import StudentProfile, StudentPlacement
from trainings.models import Training, TrainingSession, TrainingAttendance, TrainingAbsentee


class UserDeletionPolicyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email="owner@suretrust.local",
            password="pass",
            role=User.Role.ADMIN,
        )
        self.course = Course.objects.create(
            code="DELETE-TEST",
            name="Deletion Test",
            domain="Testing",
            description="Deletion policy test course",
            created_by=self.owner,
        )

    def test_student_deletion_removes_person_owned_records(self):
        student_user = User.objects.create_user(
            email="delete-student@example.com",
            password="pass",
            role=User.Role.STUDENT,
        )
        student = student_user.student_profile
        application = Application.objects.create(
            application_number="APP-DELETE-STUDENT",
            student=student,
            course=self.course,
        )
        prescreening = PreScreening.objects.create(application=application, scheduled_at=timezone.now())
        interview = PreScreeningInterview.objects.create(application=application, scheduled_at=timezone.now())
        activity = CommunityActivity.objects.create(
            application=application,
            activity_type=CommunityActivity.ActivityType.TREE_PLANTATION,
            title="Tree Plantation",
            activity_date=date.today(),
        )
        audit = ApplicationStatusAudit.objects.create(application=application, from_status="APPLIED", to_status="SCREENING_SCHEDULED")

        exam = Exam.objects.filter(application=application).first() or Exam.objects.create(application=application)
        attempt = InternalExamAttempt.objects.create(
            exam=exam,
            student=student,
            status=InternalExamAttempt.Status.IN_PROGRESS,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        security_event = ExamSecurityEvent.objects.create(attempt=attempt, event_type="TAB_SWITCH")

        cohort = Cohort.objects.create(
            code="DELETE-STUDENT-COHORT",
            course=self.course,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            created_by=self.owner,
        )
        module = CourseModule.objects.create(course=self.course, module_number=1, title="Intro")
        mod_test = ModuleTest.objects.create(title="Module 1 Test", course=self.course, cohort=cohort, module=module)
        mod_sub = ModuleTestSubmission.objects.create(test=mod_test, student=student)

        assignment = Assignment.objects.create(
            cohort=cohort,
            title="Assignment 1",
            begin_date=timezone.now(),
            deadline=timezone.now() + timedelta(days=5),
        )
        submission = Submission.objects.create(
            assignment=assignment,
            student=student,
            submission_url="https://github.com/test/repo",
            submitted_at=timezone.now(),
        )

        capstone = CapstoneProject.objects.create(
            cohort=cohort,
            title="Capstone Project",
            begin_date=timezone.now(),
            deadline=timezone.now() + timedelta(days=10),
        )
        cap_sub = CapstoneSubmission.objects.create(
            assignment=capstone,
            student=student,
            submission_url="https://github.com/test/capstone",
            submitted_at=timezone.now(),
        )

        attendance_session = Attendance.objects.create(
            cohort=cohort,
            title="Class 1",
            class_date=date.today(),
            start_time=time(9, 0),
            conducted_by=self.owner,
        )
        warning = AbsenceWarning.objects.create(student=student, session=attendance_session)
        summary = AttendanceSummary.objects.create(student=student, session=attendance_session, total_session_minutes=60, active_minutes=60, attendance_percentage=100)
        perm_req = PermissionRequestMessage.objects.create(warning=warning, sender=student_user, message="Doctor visit")

        training = Training.objects.create(title="Training 1")
        training_session = TrainingSession.objects.create(training=training, cohort=cohort, title="Training Session 1", session_date=date.today(), start_time=time(14, 0))
        tr_att = TrainingAttendance.objects.create(session=training_session, student=student, status=TrainingAttendance.Status.PRESENT)

        placement = StudentPlacement.objects.create(
            student=student,
            company_name="Tech Corp",
            designation="Dev",
            joining_date=date.today(),
        )

        notification = Notification.objects.create(
            user=student_user,
            title="Private notice",
            message="Student-specific content",
        )
        feedback = Feedback.objects.create(
            user=student_user,
            feedback_type=Feedback.FeedbackType.SYSTEM,
            comments="Student-specific feedback",
        )
        user_request = UserRequest.objects.create(sender=student_user, subject="Help", description="Need help")
        push_sub = PushSubscription.objects.create(user=student_user, endpoint="https://push.example.com/sub/1")

        conversation = CohortConversation.objects.create(cohort=cohort)
        message = CohortMessage.objects.create(
            conversation=conversation,
            sender=student_user,
            body="Student-authored personal message",
        )
        read_state = CohortChatReadState.objects.create(conversation=conversation, user=student_user)

        achievement = Achievement.objects.create(
            title="Student achievement",
            description="Student-specific achievement",
            student=student,
        )
        certificate = Certificate.objects.create(
            certificate_number="CERT-DELETE-STUDENT",
            verification_code="VERIFY-DELETE-STUDENT",
            recipient_name="Delete Student",
            recipient_user=student_user,
            certificate_type=Certificate.CertificateType.PARTICIPATION,
            issued_at=timezone.now(),
        )
        meet_session = Attendance.objects.create(
            cohort=cohort,
            title="Meet data cleanup",
            class_date=date.today(),
            start_time=time(11, 0),
            conducted_by=self.owner,
            guest_emails=[student_user.email, "other@example.com"],
            whitelisted_guest_emails=[student_user.email, "other@example.com"],
            google_meet_attendance_data=[
                {"email": student_user.email, "minutes": 30},
                {"email": "other@example.com", "minutes": 40},
            ],
        )
        EmailVerificationOTP.objects.create(email=student_user.email)
        PasswordResetOTP.objects.create(email=student_user.email)

        ids = {
            "user": student_user.pk,
            "student": student.pk,
            "application": application.pk,
            "prescreening": prescreening.pk,
            "interview": interview.pk,
            "activity": activity.pk,
            "audit": audit.pk,
            "exam": exam.pk,
            "attempt": attempt.pk,
            "security_event": security_event.pk,
            "mod_sub": mod_sub.pk,
            "submission": submission.pk,
            "cap_sub": cap_sub.pk,
            "warning": warning.pk,
            "summary": summary.pk,
            "perm_req": perm_req.pk,
            "tr_att": tr_att.pk,
            "placement": placement.pk,
            "notification": notification.pk,
            "feedback": feedback.pk,
            "user_request": user_request.pk,
            "push_sub": push_sub.pk,
            "message": message.pk,
            "read_state": read_state.pk,
            "achievement": achievement.pk,
            "certificate": certificate.pk,
        }

        student_user.delete()

        self.assertFalse(User.objects.filter(pk=ids["user"]).exists())
        self.assertFalse(StudentProfile.objects.filter(pk=ids["student"]).exists())
        self.assertFalse(Application.objects.filter(pk=ids["application"]).exists())
        self.assertFalse(PreScreening.objects.filter(pk=ids["prescreening"]).exists())
        self.assertFalse(PreScreeningInterview.objects.filter(pk=ids["interview"]).exists())
        self.assertFalse(CommunityActivity.objects.filter(pk=ids["activity"]).exists())
        self.assertFalse(ApplicationStatusAudit.objects.filter(pk=ids["audit"]).exists())
        self.assertFalse(Exam.objects.filter(pk=ids["exam"]).exists())
        self.assertFalse(InternalExamAttempt.objects.filter(pk=ids["attempt"]).exists())
        self.assertFalse(ExamSecurityEvent.objects.filter(pk=ids["security_event"]).exists())
        self.assertFalse(ModuleTestSubmission.objects.filter(pk=ids["mod_sub"]).exists())
        self.assertFalse(Submission.objects.filter(pk=ids["submission"]).exists())
        self.assertFalse(CapstoneSubmission.objects.filter(pk=ids["cap_sub"]).exists())
        self.assertFalse(AbsenceWarning.objects.filter(pk=ids["warning"]).exists())
        self.assertFalse(AttendanceSummary.objects.filter(pk=ids["summary"]).exists())
        self.assertFalse(PermissionRequestMessage.objects.filter(pk=ids["perm_req"]).exists())
        self.assertFalse(TrainingAttendance.objects.filter(pk=ids["tr_att"]).exists())
        self.assertFalse(StudentPlacement.objects.filter(pk=ids["placement"]).exists())
        self.assertFalse(Notification.objects.filter(pk=ids["notification"]).exists())
        self.assertFalse(Feedback.objects.filter(pk=ids["feedback"]).exists())
        self.assertFalse(UserRequest.objects.filter(pk=ids["user_request"]).exists())
        self.assertFalse(PushSubscription.objects.filter(pk=ids["push_sub"]).exists())
        self.assertFalse(CohortMessage.objects.filter(pk=ids["message"]).exists())
        self.assertFalse(CohortChatReadState.objects.filter(pk=ids["read_state"]).exists())
        self.assertFalse(Achievement.objects.filter(pk=ids["achievement"]).exists())
        self.assertFalse(Certificate.objects.filter(pk=ids["certificate"]).exists())

        meet_session.refresh_from_db()
        self.assertEqual(meet_session.guest_emails, ["other@example.com"])
        self.assertEqual(meet_session.whitelisted_guest_emails, ["other@example.com"])
        self.assertEqual(
            meet_session.google_meet_attendance_data,
            [{"email": "other@example.com", "minutes": 40}],
        )
        self.assertFalse(EmailVerificationOTP.objects.filter(email="delete-student@example.com").exists())
        self.assertFalse(PasswordResetOTP.objects.filter(email="delete-student@example.com").exists())

    def test_admin_only_api_delete_permissions(self):
        student_user = User.objects.create_user(
            email="student-del-perm@example.com",
            password="pass",
            role=User.Role.STUDENT,
        )
        target_user = User.objects.create_user(
            email="target-user@example.com",
            password="pass",
            role=User.Role.STUDENT,
        )

        # 1. Non-admin cannot delete
        self.client.force_authenticate(user=student_user)
        response = self.client.delete(f"/api/users/{target_user.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=target_user.id).exists())

        # 2. Admin can delete
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(f"/api/users/{target_user.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(id=target_user.id).exists())

    def test_cohort_transfer_and_timetable_updates(self):
        student_user = User.objects.create_user(
            email="transfer-timetable@example.com",
            password="pass",
            role=User.Role.STUDENT,
        )
        student = student_user.student_profile
        course_b = Course.objects.create(code="COURSE-B", name="Course B", domain="Domain B", created_by=self.owner)

        cohort_a = Cohort.objects.create(code="COHORT-A", name="Cohort A", course=self.course, start_date=date.today(), end_date=date.today() + timedelta(days=30))
        cohort_b = Cohort.objects.create(code="COHORT-B", name="Cohort B", course=course_b, start_date=date.today(), end_date=date.today() + timedelta(days=30))

        app = Application.objects.create(
            application_number="APP-TRANSFER-1",
            student=student,
            course=self.course,
            assigned_cohort=cohort_a,
            status=Application.Status.COHORT_ASSIGNED,
        )
        Application.objects.filter(pk=app.pk).update(applied_at=timezone.now() - timedelta(days=2))

        att_a = Attendance.objects.create(cohort=cohort_a, title="Class in A", class_date=date.today() + timedelta(days=1), start_time=time(10, 0), conducted_by=self.owner)
        att_b = Attendance.objects.create(cohort=cohort_b, title="Class in B", class_date=date.today() + timedelta(days=1), start_time=time(11, 0), conducted_by=self.owner)

        self.client.force_authenticate(user=student_user)

        # 1. Initially student is in Cohort A: timetable sees att_a, not att_b
        res1 = self.client.get("/api/attendance/")
        self.assertEqual(res1.status_code, 200)
        pks1 = [str(item["id"]) for item in (res1.data.get("results") if isinstance(res1.data, dict) else res1.data)]
        self.assertIn(str(att_a.id), pks1)
        self.assertNotIn(str(att_b.id), pks1)

        # 2. Transfer student to Cohort B
        app.assigned_cohort = cohort_b
        app.course = course_b
        app.save()

        # Invalidate cache
        from django.core.cache import cache
        cache.clear()

        # 3. Timetable now returns att_b and no longer att_a
        res2 = self.client.get("/api/attendance/")
        self.assertEqual(res2.status_code, 200)
        pks2 = [str(item["id"]) for item in (res2.data.get("results") if isinstance(res2.data, dict) else res2.data)]
        self.assertIn(str(att_b.id), pks2)
        self.assertNotIn(str(att_a.id), pks2)

    def test_staff_deletion_anonymizes_shared_operational_records(self):
        cohort = Cohort.objects.create(
            code="DELETE-COHORT",
            course=self.course,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            created_by=self.owner,
        )
        assignment = Assignment.objects.create(
            cohort=cohort,
            title="Shared assignment",
            description="Must survive creator deletion",
            created_by=self.owner,
            begin_date=timezone.now(),
            deadline=timezone.now() + timedelta(days=7),
        )
        attendance = Attendance.objects.create(
            cohort=cohort,
            title="Shared class",
            class_date=date.today(),
            start_time=time(10, 0),
            conducted_by=self.owner,
        )
        company_user = User.objects.create_user(
            email="company-delete-test@example.com",
            password="pass",
            role=User.Role.COMPANY,
        )
        company = Company.objects.create(user=company_user, name="Deletion Test Company")
        job_reference = JobReference.objects.create(
            cohort=cohort,
            company=company,
            title="Shared opening",
            apply_url="https://example.com/apply",
            created_by=self.owner,
        )
        owner_id = self.owner.pk

        self.owner.delete()

        self.assertFalse(User.objects.filter(pk=owner_id).exists())
        self.course.refresh_from_db()
        cohort.refresh_from_db()
        assignment.refresh_from_db()
        attendance.refresh_from_db()
        job_reference.refresh_from_db()
        self.assertIsNone(self.course.created_by_id)
        self.assertIsNone(cohort.created_by_id)
        self.assertIsNone(assignment.created_by_id)
        self.assertIsNone(attendance.conducted_by_id)
        self.assertIsNone(job_reference.created_by_id)
