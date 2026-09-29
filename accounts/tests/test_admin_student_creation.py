import os
import django
import sys
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import RequestFactory
from accounts.views import UserViewSet
from accounts.models import User
from courses.models import Course
from cohorts.models import Cohort
from applications.models import Application
from students.models import StudentProfile

factory = RequestFactory()

# Test 1: Mismatched Course and Cohort
course1 = Course.objects.create(name=f"Course1 {uuid.uuid4()}", code=f"C1-{uuid.uuid4().hex[:6]}")
course2 = Course.objects.create(name=f"Course2 {uuid.uuid4()}", code=f"C2-{uuid.uuid4().hex[:6]}")
cohort1 = Cohort.objects.create(course=course1, name=f"Cohort1 {uuid.uuid4()}", code=f"CH1-{uuid.uuid4().hex[:6]}")

# Delete old test users
User.objects.filter(email='testadminadd_mismatch@example.com').delete()
User.objects.filter(email='testadminadd_match@example.com').delete()

print("--- Test 1: Mismatched Course and Cohort ---")
request = factory.post('/api/users/', {
    'email': 'testadminadd_mismatch@example.com',
    'password': 'Password123!',
    'role': 'STUDENT',
    'first_name': 'Test',
    'last_name': 'Mismatch',
    'course_id': str(course2.id),
    'cohort_id': str(cohort1.id)
}, format='json')
request.user = User.objects.filter(is_superuser=True).first()
if not request.user:
    request.user = User.objects.create_superuser('admin@example.com', 'admin@example.com', 'password')

view = UserViewSet.as_view({'post': 'create'})
response = view(request)
if response.status_code == 400:
    print("SUCCESS: Mismatched course/cohort returned 400")
else:
    print("FAILED: Expected 400, got", response.status_code)
    
# Ensure user was NOT created
if User.objects.filter(email='testadminadd_mismatch@example.com').exists():
    print("FAILED: User was created despite mismatched course/cohort!")
else:
    print("SUCCESS: User was NOT created, transaction aborted.")

print("\n--- Test 2: Matching Course and Cohort (TRAINING) ---")
cohort1.status = Cohort.Status.TRAINING
cohort1.save()

request2 = factory.post('/api/users/', {
    'email': 'testadminadd_match@example.com',
    'password': 'Password123!',
    'role': 'STUDENT',
    'first_name': 'Test',
    'last_name': 'Match',
    'course_id': str(course1.id),
    'cohort_id': str(cohort1.id)
}, format='json')
request2.user = request.user
response2 = view(request2)
print("Status Code:", response2.status_code)
print("Response Data:", response2.data if hasattr(response2, 'data') else None)

user = User.objects.filter(email='testadminadd_match@example.com').first()
student = StudentProfile.objects.filter(user=user).first()
app = Application.objects.filter(student=student).first()

print("User created:", user is not None)
print("Student Profile created:", student is not None)
print("Student Identity Issued:", student.student_identity_issued_at is not None if student else False)
print("Application created:", app is not None)

assert user is not None
assert student is not None
assert student.student_identity_issued_at is not None
assert app is not None
assert app.status == "TRAINING"
assert app.qualified is True
assert app.role_verification_status == "VERIFIED"
assert app.assigned_cohort.id == cohort1.id
assert app.is_admin_assigned is True

print("Test 2 assertions passed successfully.")
