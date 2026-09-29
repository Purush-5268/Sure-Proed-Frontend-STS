from django.test import SimpleTestCase

class SeederIsolationTest(SimpleTestCase):
    def test_seeder_does_not_mutate_attendance(self):
        """
        Ensures that the student import management command does not 
        accidentally contain logic to mutate or backfill Attendance sessions.
        This protects the operational boundaries between student on-boarding
        and live Google Meet attendance data.
        """
        with open('students/management/commands/seed_students_from_excel.py', 'r') as f:
            content = f.read()
            self.assertNotIn("historical_attendance_data", content, "Seeder script must not backfill historical_attendance_data")
            self.assertNotIn("google_meet_attendance_data", content, "Seeder script must not backfill google_meet_attendance_data")
            self.assertNotIn("AttendanceSummary.objects.update_or_create", content, "Seeder script must not create attendance summaries for live classes")
