from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import User
from feedback.models import Feedback
import uuid


class FeedbackApiTests(APITestCase):
    def setUp(self):
        self.student_user = User.objects.create_user(
            email="feedback_student@example.com",
            password="StrongPassword123!",
            first_name="Feedback",
            last_name="Student",
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(user=self.student_user)

    def test_submit_course_feedback(self):
        payload = {
            "feedback_type": "COURSE",
            "rating": 5,
            "comments": "Module: Module 1 | Mentor: Dr. Test | Excellent course",
            "related_id": str(uuid.uuid4()),
        }
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Feedback.objects.count(), 1)
        fb = Feedback.objects.first()
        self.assertEqual(fb.user, self.student_user)
        self.assertEqual(fb.feedback_type, "COURSE")
        self.assertEqual(fb.rating, 5)

    def test_submit_system_feedback_empty_related_id(self):
        payload = {
            "feedback_type": "SYSTEM",
            "rating": 4,
            "comments": "App is running very smoothly",
            "related_id": "",
        }
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        fb = Feedback.objects.first()
        self.assertIsNone(fb.related_id)

    def test_get_own_feedbacks(self):
        Feedback.objects.create(
            user=self.student_user,
            feedback_type=Feedback.FeedbackType.COURSE,
            rating=5,
            comments="Great",
        )
        res = self.client.get("/api/feedback/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)

class MentorFeedbackTests(APITestCase):
    def setUp(self):
        self.student_user = User.objects.create_user(
            email="mentor_student@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )
        self.mentor_user = User.objects.create_user(
            email="mentor@example.com",
            password="StrongPassword123!",
            role=User.Role.MENTOR,
        )
        self.unauthorized_mentor = User.objects.create_user(
            email="other_mentor@example.com",
            password="StrongPassword123!",
            role=User.Role.MENTOR,
        )
        
        from students.models import StudentProfile
        from courses.models import Course, CourseModule
        from cohorts.models import Cohort
        from applications.models import Application
        
        self.student_profile, _ = StudentProfile.objects.get_or_create(user=self.student_user)
        self.student_profile.student_code = "TEST1"
        self.student_profile.save()
        self.course = Course.objects.create(name="Course 1", code="C1")
        self.other_course = Course.objects.create(name="Course 2", code="C2")
        
        self.module1 = CourseModule.objects.create(course=self.course, module_number=1, title="M1", order=1)
        self.module2 = CourseModule.objects.create(course=self.course, module_number=2, title="M2", order=2)
        self.other_module = CourseModule.objects.create(course=self.other_course, module_number=1, title="OM1", order=1)
        
        from django.utils import timezone
        import datetime
        now = timezone.now()
        self.cohort = Cohort.objects.create(
            name="Cohort 1", 
            course=self.course, 
            code="CH1", 
            start_date=now.date(), 
            end_date=(now + datetime.timedelta(days=30)).date()
        )
        self.cohort.mentors.add(self.mentor_user)
        
        self.application = Application.objects.create(
            student=self.student_profile,
            course=self.course,
            assigned_cohort=self.cohort,
            status=Application.Status.IN_PROGRESS
        )
        
        self.client.force_authenticate(user=self.student_user)

    def test_submit_valid_mentor_feedback(self):
        payload = {
            "feedback_type": "MENTOR",
            "related_id": str(self.mentor_user.id),
            "module": self.module1.id,
            "rating": 5,
            "explanation_rating": "VERY_CLEAR",
            "interaction_rating": "YES_ALWAYS",
            "comments": "Great mentor",
            "improvements_text": "None"
        }
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Feedback.objects.count(), 1)
        fb = Feedback.objects.first()
        self.assertEqual(fb.module, self.module1)
        self.assertEqual(fb.related_id, self.mentor_user.id)
        self.assertEqual(fb.rating, 5)

    def test_unauthorized_mentor_fails(self):
        payload = {
            "feedback_type": "MENTOR",
            "related_id": str(self.unauthorized_mentor.id),
            "module": self.module1.id,
            "rating": 5,
            "explanation_rating": "VERY_CLEAR",
            "interaction_rating": "YES_ALWAYS",
            "comments": "Great"
        }
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Feedback.objects.count(), 0)

    def test_unauthorized_module_fails(self):
        payload = {
            "feedback_type": "MENTOR",
            "related_id": str(self.mentor_user.id),
            "module": self.other_module.id,
            "rating": 5,
            "explanation_rating": "VERY_CLEAR",
            "interaction_rating": "YES_ALWAYS",
            "comments": "Great"
        }
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Feedback.objects.count(), 0)

    def test_missing_required_fields_fails(self):
        payload = {
            "feedback_type": "MENTOR",
            "related_id": str(self.mentor_user.id),
            "module": self.module1.id,
            # missing explanation_rating and interaction_rating
            "rating": 5,
        }
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("explanation_rating", res.data)
        
    def test_upsert_same_module(self):
        # First submission
        payload = {
            "feedback_type": "MENTOR",
            "related_id": str(self.mentor_user.id),
            "module": self.module1.id,
            "rating": 4,
            "explanation_rating": "CLEAR",
            "interaction_rating": "SOMETIMES",
            "comments": "Good"
        }
        self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(Feedback.objects.count(), 1)
        
        # Upsert: same mentor and module, new rating
        payload["rating"] = 5
        res = self.client.post("/api/feedback/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Feedback.objects.count(), 1)
        self.assertEqual(Feedback.objects.first().rating, 5)
        
    def test_separate_feedback_different_modules(self):
        # M1
        payload1 = {
            "feedback_type": "MENTOR",
            "related_id": str(self.mentor_user.id),
            "module": self.module1.id,
            "rating": 4,
            "explanation_rating": "CLEAR",
            "interaction_rating": "SOMETIMES",
            "comments": "Good"
        }
        self.client.post("/api/feedback/", payload1, format="json")
        
        # M2
        payload2 = {
            "feedback_type": "MENTOR",
            "related_id": str(self.mentor_user.id),
            "module": self.module2.id,
            "rating": 5,
            "explanation_rating": "VERY_CLEAR",
            "interaction_rating": "YES_ALWAYS",
            "comments": "Better"
        }
        self.client.post("/api/feedback/", payload2, format="json")
        self.assertEqual(Feedback.objects.count(), 2)
