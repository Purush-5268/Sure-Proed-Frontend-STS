import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from attendance.models import Attendance
from attendance.services.real_meet_attendance_service import RealMeetAttendanceService

failed_sessions = Attendance.objects.filter(class_status="COMPLETED").exclude(google_meet_attendance_data__isnull=True)
count = 0
for session in failed_sessions:
    data = session.google_meet_attendance_data
    if data and data.get("status") in ["FAILED", "ATTENDANCE_FAILED"] and "expected_students" not in data:
        expected_roster = RealMeetAttendanceService.get_expected_roster(session)
        empty_roster = {}
        for email, app in expected_roster.items():
            student_id = str(app.student.id)
            empty_roster[student_id] = {
                "email": email,
                "name": f"{app.student.user.first_name} {app.student.user.last_name}".strip(),
                "join_time": None,
                "leave_time": None,
                "duration_seconds": 0,
                "attendance_percentage": 0.0,
                "course_id": app.course.name if app.course else "N/A",
                "cohort_id": app.assigned_cohort.code if app.assigned_cohort else "N/A",
                "student_id": student_id,
                "status": "ABSENT",
                "account_status": app.status,
                "match_method": None,
                "naming_compliant": True,
                "prior_permission": None
            }
        data["expected_students"] = empty_roster
        session.google_meet_attendance_data = data
        session.save(update_fields=['google_meet_attendance_data'])
        count += 1
        print(f"Fixed roster for session {session.id}")
print(f"Total fixed: {count}")
