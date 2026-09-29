import os
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import AdministratorProfile
from communications.models import (
    RoleConversation,
    RoleConversationReadState,
    RoleMessage,
    RoleMessageAttachment,
)

User = get_user_model()


class RoleCommunicationsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin
        self.admin = User.objects.create_superuser(
            email="superadmin@suretrust.local",
            password="Password123!",
            first_name="Platform",
            last_name="Admin",
        )

        # Trustee A & B
        self.trustee_a = User.objects.create_user(
            email="trustee_a@suretrust.local",
            password="Password123!",
            first_name="Trustee",
            last_name="Alpha",
            role=User.Role.TRUSTEE,
        )
        self.trustee_b = User.objects.create_user(
            email="trustee_b@suretrust.local",
            password="Password123!",
            first_name="Trustee",
            last_name="Beta",
            role=User.Role.TRUSTEE,
        )

        # Advisor A & B (Role TRUSTEE + category ADVISORY)
        self.advisor_a = User.objects.create_user(
            email="advisor_a@suretrust.local",
            password="Password123!",
            first_name="Advisor",
            last_name="Alpha",
            role=User.Role.TRUSTEE,
        )
        p_adv_a, _ = AdministratorProfile.objects.get_or_create(user=self.advisor_a)
        p_adv_a.category = AdministratorProfile.Category.ADVISORY
        p_adv_a.save()

        self.advisor_b = User.objects.create_user(
            email="advisor_b@suretrust.local",
            password="Password123!",
            first_name="Advisor",
            last_name="Beta",
            role=User.Role.TRUSTEE,
        )
        p_adv_b, _ = AdministratorProfile.objects.get_or_create(user=self.advisor_b)
        p_adv_b.category = AdministratorProfile.Category.ADVISORY
        p_adv_b.save()

        # Volunteer A & B
        self.volunteer_a = User.objects.create_user(
            email="volunteer_a@suretrust.local",
            password="Password123!",
            first_name="Volunteer",
            last_name="Alpha",
            role=User.Role.VOLUNTEER,
        )
        self.volunteer_b = User.objects.create_user(
            email="volunteer_b@suretrust.local",
            password="Password123!",
            first_name="Volunteer",
            last_name="Beta",
            role=User.Role.VOLUNTEER,
        )

        # Student (should be denied access entirely)
        self.student = User.objects.create_user(
            email="student@gmail.com",
            password="Password123!",
            first_name="Student",
            last_name="User",
            role=User.Role.STUDENT,
        )

    def test_conversations_list_visibility(self):
        """Admin sees all 3 groups; Trustee sees only TRUSTEE_GROUP; etc."""
        # 1. Admin
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(reverse("role_conversations_list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        groups = [c["group_type"] for c in res.data]
        self.assertCountEqual(groups, ["TRUSTEE_GROUP", "ADVISOR_GROUP", "VOLUNTEER_GROUP"])

        # 2. Trustee
        self.client.force_authenticate(user=self.trustee_a)
        res = self.client.get(reverse("role_conversations_list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["group_type"], "TRUSTEE_GROUP")

        # 3. Advisor
        self.client.force_authenticate(user=self.advisor_a)
        res = self.client.get(reverse("role_conversations_list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["group_type"], "ADVISOR_GROUP")

        # 4. Volunteer
        self.client.force_authenticate(user=self.volunteer_a)
        res = self.client.get(reverse("role_conversations_list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["group_type"], "VOLUNTEER_GROUP")

        # 5. Student denied
        self.client.force_authenticate(user=self.student)
        res = self.client.get(reverse("role_conversations_list"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_trustee_message_flow_and_isolation(self):
        """Trustee A sends message -> Trustee B & Admin see it; Advisor & Volunteer receive 403."""
        self.client.force_authenticate(user=self.trustee_a)
        msg_url = reverse("role_conversation_messages", kwargs={"group_type": "TRUSTEE_GROUP"})
        res = self.client.post(msg_url, {"content": "Hello Fellow Trustees!"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["sender_role"], "TRUSTEE")

        # Trustee B reads
        self.client.force_authenticate(user=self.trustee_b)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["content"], "Hello Fellow Trustees!")

        # Admin reads
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        # Advisor tries to read Trustee messages -> 403 Forbidden
        self.client.force_authenticate(user=self.advisor_a)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Volunteer tries to read Trustee messages -> 403 Forbidden
        self.client.force_authenticate(user=self.volunteer_a)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_advisor_message_flow_and_isolation(self):
        """Advisor A sends message -> Advisor B & Admin see it; Trustee & Volunteer receive 403."""
        self.client.force_authenticate(user=self.advisor_a)
        msg_url = reverse("role_conversation_messages", kwargs={"group_type": "ADVISOR_GROUP"})
        res = self.client.post(msg_url, {"content": "Advisor Council Strategy Meeting"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["sender_role"], "ADVISOR")

        # Advisor B reads
        self.client.force_authenticate(user=self.advisor_b)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["results"][0]["content"], "Advisor Council Strategy Meeting")

        # Admin reads
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Trustee tries to read Advisor messages -> 403 Forbidden
        self.client.force_authenticate(user=self.trustee_a)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Volunteer tries to read Advisor messages -> 403 Forbidden
        self.client.force_authenticate(user=self.volunteer_a)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_volunteer_message_flow_and_isolation(self):
        """Volunteer A sends message -> Volunteer B & Admin see it; Trustee & Advisor receive 403."""
        self.client.force_authenticate(user=self.volunteer_a)
        msg_url = reverse("role_conversation_messages", kwargs={"group_type": "VOLUNTEER_GROUP"})
        res = self.client.post(msg_url, {"content": "Class Coordination Note"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["sender_role"], "VOLUNTEER")

        # Volunteer B reads
        self.client.force_authenticate(user=self.volunteer_b)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["results"][0]["content"], "Class Coordination Note")

        # Trustee tries to read Volunteer messages -> 403 Forbidden
        self.client.force_authenticate(user=self.trustee_a)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Advisor tries to read Volunteer messages -> 403 Forbidden
        self.client.force_authenticate(user=self.advisor_a)
        res = self.client.get(msg_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_replies_directed_to_intended_group(self):
        """Admin can reply to each group separately, and replies remain isolated."""
        self.client.force_authenticate(user=self.admin)

        # 1. Reply to Trustees
        url_t = reverse("role_conversation_messages", kwargs={"group_type": "TRUSTEE_GROUP"})
        res = self.client.post(url_t, {"content": "Admin reply for Trustees only"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 2. Reply to Advisors
        url_a = reverse("role_conversation_messages", kwargs={"group_type": "ADVISOR_GROUP"})
        res = self.client.post(url_a, {"content": "Admin reply for Advisors only"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Verify Trustee sees only Trustee message
        self.client.force_authenticate(user=self.trustee_a)
        res = self.client.get(url_t)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["content"], "Admin reply for Trustees only")

        # Verify Advisor sees only Advisor message
        self.client.force_authenticate(user=self.advisor_a)
        res = self.client.get(url_a)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["content"], "Admin reply for Advisors only")

    def test_document_attachment_upload_and_download_protection(self):
        """Document can be attached to message, and unauthorized users cannot download it."""
        self.client.force_authenticate(user=self.trustee_a)
        msg_url = reverse("role_conversation_messages", kwargs={"group_type": "TRUSTEE_GROUP"})

        fake_pdf = SimpleUploadedFile("minutes.pdf", b"%PDF-1.4 test document content", content_type="application/pdf")
        res = self.client.post(msg_url, {"content": "Please review minutes", "file": fake_pdf}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["attachments"]), 1)

        attachment_id = res.data["attachments"][0]["id"]
        download_url = res.data["attachments"][0]["download_url"]

        # Trustee B can download attachment
        self.client.force_authenticate(user=self.trustee_b)
        dl_res = self.client.get(download_url)
        self.assertEqual(dl_res.status_code, status.HTTP_200_OK)

        # Admin can download attachment
        self.client.force_authenticate(user=self.admin)
        dl_res = self.client.get(download_url)
        self.assertEqual(dl_res.status_code, status.HTTP_200_OK)

        # Advisor CANNOT download Trustee attachment -> 403 Forbidden
        self.client.force_authenticate(user=self.advisor_a)
        dl_res = self.client.get(download_url)
        self.assertEqual(dl_res.status_code, status.HTTP_403_FORBIDDEN)

        # Volunteer CANNOT download Trustee attachment -> 403 Forbidden
        self.client.force_authenticate(user=self.volunteer_a)
        dl_res = self.client.get(download_url)
        self.assertEqual(dl_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_read_tracking_and_unread_counts(self):
        """Unread counts accurately reflect unread messages and clear on read."""
        # Trustee A posts
        self.client.force_authenticate(user=self.trustee_a)
        msg_url = reverse("role_conversation_messages", kwargs={"group_type": "TRUSTEE_GROUP"})
        self.client.post(msg_url, {"content": "Message 1"})
        self.client.post(msg_url, {"content": "Message 2"})

        # Trustee B checks unread summary
        self.client.force_authenticate(user=self.trustee_b)
        unread_url = reverse("role_conversation_unread_summary")
        res = self.client.get(unread_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_unread"], 2)
        self.assertEqual(res.data["groups"]["TRUSTEE_GROUP"], 2)

        # Trustee B marks read
        read_url = reverse("role_conversation_mark_read", kwargs={"group_type": "TRUSTEE_GROUP"})
        read_res = self.client.post(read_url)
        self.assertEqual(read_res.status_code, status.HTTP_200_OK)

        # Unread count should now be 0
        res = self.client.get(unread_url)
        self.assertEqual(res.data["total_unread"], 0)
