from datetime import time, timedelta

from django.contrib import admin
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import Attendance
from cohorts.models import Cohort
from courses.models import Course

from .models import MentorProfile, VolunteerProfile
from .admin import MentorProfileAdminForm, VolunteerProfileAdminForm
from .serializers import MentorProfileSerializer, VolunteerProfileSerializer


class StaffProfileAndTimetableTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.factory = RequestFactory()
        self.admin_user = User.objects.create_superuser(email="staff-profile-admin@example.com", password="pass-test")
        self.mentor = User.objects.create_user(
            email="mentor@suretrust.local", password="pass-test", role=User.Role.MENTOR
        )
        self.other_mentor = User.objects.create_user(
            email="other-mentor@suretrust.local", password="pass-test", role=User.Role.MENTOR
        )
        self.volunteer = User.objects.create_user(
            email="volunteer@suretrust.local", password="pass-test", role=User.Role.VOLUNTEER
        )
        self.trustee = User.objects.create_user(
            email="trustee@example.com", password="pass-test", role=User.Role.TRUSTEE
        )
        self.course = Course.objects.create(
            code="PROFILE-101",
            name="Profile timetable course",
            domain="Technology",
            description="Profile timetable test",
            status=Course.Status.PUBLISHED,
            created_by=self.admin_user,
        )
        today = timezone.localdate()
        self.assigned = Cohort.objects.create(
            code="PROFILE-A",
            name="Assigned cohort",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=30),
            status=Cohort.Status.ACTIVE,
            meeting_link="https://meet.google.com/cohort-room",
            created_by=self.admin_user,
        )
        self.other = Cohort.objects.create(
            code="PROFILE-B",
            name="Other cohort",
            course=self.course,
            start_date=today,
            end_date=today + timedelta(days=30),
            status=Cohort.Status.ACTIVE,
            created_by=self.admin_user,
        )
        self.assigned.mentors.add(self.mentor)
        self.assigned.volunteers.add(self.volunteer, self.trustee)
        self.other.mentors.add(self.other_mentor)
        self.assigned_class = Attendance.objects.create(
            cohort=self.assigned,
            title="Assigned class",
            class_date=today + timedelta(days=1),
            start_time=time(10, 0),
            end_time=time(11, 0),
            meeting_link="https://meet.google.com/assigned-room",
            conducted_by=self.mentor,
        )
        self.other_class = Attendance.objects.create(
            cohort=self.other,
            title="Private class",
            class_date=today + timedelta(days=1),
            start_time=time(12, 0),
            conducted_by=self.other_mentor,
        )

    def test_role_assignment_automatically_creates_profiles(self):
        self.assertTrue(MentorProfile.objects.filter(user=self.mentor).exists())
        self.assertTrue(VolunteerProfile.objects.filter(user=self.volunteer).exists())
        self.assertTrue(VolunteerProfile.objects.filter(user=self.trustee).exists())

    def test_mentor_and_volunteer_admin_timetable_is_assignment_scoped(self):
        timetable_admin = admin.site._registry[Attendance]
        mentor_request = self.factory.get("/secure-admin/attendance/attendance/")
        mentor_request.user = self.mentor
        volunteer_request = self.factory.get("/secure-admin/attendance/attendance/")
        volunteer_request.user = self.volunteer

        self.assertQuerySetEqual(timetable_admin.get_queryset(mentor_request), [self.assigned_class])
        self.assertQuerySetEqual(timetable_admin.get_queryset(volunteer_request), [self.assigned_class])
        self.assertIn("https://meet.google.com/assigned-room", str(timetable_admin.google_meet(self.assigned_class)))

    def test_profile_api_contains_only_assigned_cohorts_classes_and_meet_links(self):
        self.client.force_authenticate(self.volunteer)
        response = self.client.get("/api/volunteers/profiles/")

        self.assertEqual(response.status_code, 200, response.data)
        payload = response.data[0] if isinstance(response.data, list) else response.data["results"][0]
        self.assertEqual(payload["email"], self.volunteer.email)
        self.assertEqual([cohort["code"] for cohort in payload["assigned_cohorts"]], [self.assigned.code])
        self.assertEqual([item["title"] for item in payload["upcoming_classes"]], ["Assigned class"])
        self.assertEqual(payload["upcoming_classes"][0]["meeting_link"], "https://meet.google.com/assigned-room")

    def test_mentor_profile_admin_renders_assigned_timetable_and_google_meet(self):
        profile_admin = admin.site._registry[MentorProfile]
        rendered = str(profile_admin.assigned_class_timetable(self.mentor.mentor_profile))
        self.assertIn("Assigned class", rendered)
        self.assertIn("https://meet.google.com/assigned-room", rendered)
        self.assertNotIn("Private class", rendered)

    def test_mentor_profile_admin_exposes_photo_and_linkedin_id(self):
        self.mentor.linkedin_id = "verified-linkedin-member-id"
        self.mentor.save(update_fields=["linkedin_id", "updated_at"])
        profile = self.mentor.mentor_profile
        profile_admin = admin.site._registry[MentorProfile]

        form = MentorProfileAdminForm(instance=profile)

        self.assertEqual(form.fields["linkedin_id"].initial, self.mentor.linkedin_id)
        self.assertIn("profile_photo", profile_admin.fields)
        self.assertIn("profile_photo_preview", profile_admin.readonly_fields)

    def test_mentor_profile_admin_saves_linkedin_id_on_user(self):
        profile = self.mentor.mentor_profile
        profile_admin = admin.site._registry[MentorProfile]
        request = self.factory.post("/secure-admin/volunteers/mentorprofile/")
        request.user = self.admin_user
        form = type("AdminForm", (), {"cleaned_data": {"linkedin_id": "updated-linkedin-id"}})()

        profile_admin.save_model(request, profile, form, change=True)

        self.mentor.refresh_from_db()
        self.assertEqual(self.mentor.linkedin_id, "updated-linkedin-id")

    def test_mentor_profile_api_exposes_photo_and_read_only_linkedin_id(self):
        self.mentor.linkedin_id = "api-linkedin-id"
        self.mentor.save(update_fields=["linkedin_id", "updated_at"])
        profile = self.mentor.mentor_profile
        profile.profile_photo = "mentors/photos/test/profile.jpg"
        profile.save(update_fields=["profile_photo", "updated_at"])

        serializer = MentorProfileSerializer(profile)

        self.assertEqual(serializer.data["linkedin_id"], "api-linkedin-id")
        self.assertTrue(serializer.data["profile_photo"].endswith("/media/mentors/photos/test/profile.jpg"))
        self.assertTrue(serializer.fields["linkedin_id"].read_only)

    def test_non_photo_partial_save_preserves_persisted_photo_reference(self):
        profile = self.mentor.mentor_profile
        profile.profile_photo = "mentors/photos/test/original.jpg"
        profile.save(update_fields=["profile_photo", "updated_at"])

        profile.profile_photo = "mentors/photos/test/not-persisted.jpg"
        profile.bio = "Updated without saving the in-memory photo change."
        profile.save(update_fields=["bio", "updated_at"])

        profile.refresh_from_db()
        self.assertEqual(profile.profile_photo.name, "mentors/photos/test/original.jpg")

    def test_volunteer_profile_admin_exposes_photo_and_saves_user_linkedin_id(self):
        profile = self.volunteer.volunteer_profile
        profile_admin = admin.site._registry[VolunteerProfile]
        form = VolunteerProfileAdminForm(instance=profile)

        self.assertIn("profile_photo", profile_admin.fields)
        self.assertIn("profile_photo_preview", profile_admin.readonly_fields)
        self.assertIn("linkedin_id", form.fields)

        request = self.factory.post("/secure-admin/volunteers/volunteerprofile/")
        request.user = self.admin_user
        submitted_form = type(
            "AdminForm",
            (),
            {"cleaned_data": {"linkedin_id": "volunteer-linkedin-id"}},
        )()
        profile_admin.save_model(request, profile, submitted_form, change=True)

        self.volunteer.refresh_from_db()
        self.assertEqual(self.volunteer.linkedin_id, "volunteer-linkedin-id")

    def test_volunteer_profile_api_exposes_photo_and_read_only_linkedin_id(self):
        self.volunteer.linkedin_id = "api-volunteer-linkedin-id"
        self.volunteer.save(update_fields=["linkedin_id", "updated_at"])
        profile = self.volunteer.volunteer_profile
        profile.profile_photo = "volunteers/photos/test/profile.jpg"
        profile.save(update_fields=["profile_photo", "updated_at"])

        serializer = VolunteerProfileSerializer(profile)

        self.assertEqual(serializer.data["linkedin_id"], "api-volunteer-linkedin-id")
        self.assertTrue(serializer.data["profile_photo"].endswith("/media/volunteers/photos/test/profile.jpg"))
        self.assertTrue(serializer.fields["linkedin_id"].read_only)

    def test_volunteer_non_photo_partial_save_preserves_photo_reference(self):
        profile = self.volunteer.volunteer_profile
        profile.profile_photo = "volunteers/photos/test/original.jpg"
        profile.save(update_fields=["profile_photo", "updated_at"])

        profile.profile_photo = "volunteers/photos/test/not-persisted.jpg"
        profile.bio = "Updated without persisting the in-memory photo change."
        profile.save(update_fields=["bio", "updated_at"])

        profile.refresh_from_db()
        self.assertEqual(profile.profile_photo.name, "volunteers/photos/test/original.jpg")
