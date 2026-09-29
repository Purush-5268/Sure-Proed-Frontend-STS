"""
Tests for attendance calculation semantics.

Tests the CORE clamping and interval-merging logic used by the real_meet_attendance_service.
These are pure-function tests — they replicate the exact algorithm from
get_structured_attendance() without needing Google API mocks.

Key rules verified:
- Denominator = official_end - official_start (LMS boundaries, NOT Google Meet times)
- Early joins are clamped to official start
- Late leaves are clamped to official end
- Overlapping intervals are merged before clamping
- Attendance % = min(100.0, round(active_duration / total_session_seconds * 100, 1))
"""
from django.test import SimpleTestCase
from datetime import datetime, time, timedelta
from django.utils import timezone


def _compute_attendance(official_start, official_end, intervals):
    """
    Pure-function replica of the clamping + merging logic from
    RealMeetAttendanceService.get_structured_attendance (lines 496-518).

    Args:
        official_start: aware datetime (scheduled class start)
        official_end: aware datetime (admin "End Class" click)
        intervals: list of (start_dt, end_dt) tuples (student join/leave)

    Returns:
        dict with duration_seconds, attendance_percentage, status
    """
    total_session_seconds = (official_end - official_start).total_seconds()

    if not intervals:
        return {
            "duration_seconds": 0,
            "attendance_percentage": 0.0,
            "status": "ABSENT",
        }

    intervals = sorted(intervals, key=lambda x: x[0])

    # Merge overlapping intervals
    merged = [intervals[0]]
    for curr in intervals[1:]:
        last = merged[-1]
        if curr[0] <= last[1]:
            merged[-1] = (last[0], max(last[1], curr[1]))
        else:
            merged.append(curr)

    # Clamp to official boundaries
    clamped_duration = 0
    for start, end in merged:
        c_start = max(start, official_start)
        c_end = min(end, official_end)
        if c_end > c_start:
            clamped_duration += (c_end - c_start).total_seconds()

    active_duration = int(clamped_duration)
    attendance_pct = min(100.0, round((active_duration / total_session_seconds) * 100, 1)) if total_session_seconds > 0 else 0.0
    status = "PRESENT" if attendance_pct > 0 else "ABSENT"

    return {
        "duration_seconds": active_duration,
        "attendance_percentage": attendance_pct,
        "status": status,
    }


class AttendanceSemanticsTests(SimpleTestCase):
    """
    Tests the exact clamping + interval-merging algorithm from the attendance service.
    Uses SimpleTestCase (no database needed — pure logic tests).
    """

    def setUp(self):
        self.class_date = timezone.now().date()
        # Scheduled Start: 09:30:00
        self.start_time = time(9, 30)
        # End Class Clicked At: 10:39:26
        self.end_time = time(10, 39, 26)

        self.official_start = timezone.make_aware(
            datetime.combine(self.class_date, self.start_time)
        )
        self.official_end = timezone.make_aware(
            datetime.combine(self.class_date, self.end_time)
        )
        # Denominator: 1:09:26 = 4166 seconds
        self.expected_denominator = 4166

    def _dt(self, t):
        """Helper to create an aware datetime from a time object."""
        return timezone.make_aware(datetime.combine(self.class_date, t))

    def test_denominator_is_strict_lms_boundaries(self):
        """
        Verify the denominator is official_end - official_start
        Scheduled start: 09:30:00
        Admin End Class: 10:39:26
        Denominator = 1:09:26 = 4166 seconds
        """
        total = (self.official_end - self.official_start).total_seconds()
        self.assertEqual(int(total), self.expected_denominator)

        # Student joins at 9:30, leaves 10:39:26 (100%)
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 30)), self._dt(time(10, 39, 26)))]
        )
        self.assertEqual(result["attendance_percentage"], 100.0)
        self.assertEqual(result["duration_seconds"], 4166)

    def test_early_join_trimmed(self):
        """
        Student joins 09:20, Class starts 09:30 -> trimmed to 09:30
        """
        # 09:20 - 10:39:26. Expected active duration: exactly 4166 (09:30-10:39:26)
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 20)), self._dt(time(10, 39, 26)))]
        )
        self.assertEqual(result["duration_seconds"], 4166)
        self.assertEqual(result["attendance_percentage"], 100.0)

    def test_late_join(self):
        """
        Student joins 09:45, Class starts 09:30 -> attendance starts 09:45
        """
        # 09:45 - 10:39:26.
        # Denominator: 4166. Numerator: 10:39:26 - 09:45:00 = 54:26 = 3266
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 45)), self._dt(time(10, 39, 26)))]
        )
        self.assertEqual(result["duration_seconds"], 3266)
        expected_pct = min(100.0, round(3266 / 4166 * 100, 1))
        self.assertEqual(result["attendance_percentage"], expected_pct)

    def test_early_leave(self):
        """
        Student leaves 10:20, Class ends 10:39:26
        """
        # 09:30 - 10:20. Numerator: 50 minutes = 3000 seconds
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 30)), self._dt(time(10, 20)))]
        )
        self.assertEqual(result["duration_seconds"], 3000)
        expected_pct = min(100.0, round(3000 / 4166 * 100, 1))
        self.assertEqual(result["attendance_percentage"], expected_pct)

    def test_post_end_class_trimmed(self):
        """
        Student leaves 10:50, Class ends 10:39:26 -> trimmed to 10:39:26
        """
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 30)), self._dt(time(10, 50)))]
        )
        self.assertEqual(result["duration_seconds"], 4166)
        self.assertEqual(result["attendance_percentage"], 100.0)

    def test_overlapping_intervals_merged(self):
        """
        Intervals: 09:40-10:00 and 09:55-10:30.
        Merged should be 09:40-10:30 (50 minutes = 3000 seconds)
        """
        result = _compute_attendance(
            self.official_start, self.official_end,
            [
                (self._dt(time(9, 40)), self._dt(time(10, 0))),
                (self._dt(time(9, 55)), self._dt(time(10, 30))),
            ]
        )
        self.assertEqual(result["duration_seconds"], 3000)

    def test_valid_zero_percent(self):
        """
        Student has no valid intervals within class time.
        """
        # Student joined and left before class started (09:10-09:20)
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 10)), self._dt(time(9, 20)))]
        )
        self.assertEqual(result["duration_seconds"], 0)
        self.assertEqual(result["attendance_percentage"], 0.0)
        self.assertEqual(result["status"], "ABSENT")

    def test_no_intervals_is_absent(self):
        """No intervals at all -> ABSENT with 0%."""
        result = _compute_attendance(
            self.official_start, self.official_end, []
        )
        self.assertEqual(result["duration_seconds"], 0)
        self.assertEqual(result["attendance_percentage"], 0.0)
        self.assertEqual(result["status"], "ABSENT")

    def test_gap_in_attendance(self):
        """
        Student joins 09:30-10:00, disconnects, rejoins 10:10-10:39:26.
        Two non-overlapping intervals.
        Active = 30min + 29min26sec = 1800 + 1766 = 3566 seconds
        """
        result = _compute_attendance(
            self.official_start, self.official_end,
            [
                (self._dt(time(9, 30)), self._dt(time(10, 0))),
                (self._dt(time(10, 10)), self._dt(time(10, 39, 26))),
            ]
        )
        self.assertEqual(result["duration_seconds"], 3566)
        expected_pct = min(100.0, round(3566 / 4166 * 100, 1))
        self.assertEqual(result["attendance_percentage"], expected_pct)
        self.assertEqual(result["status"], "PRESENT")

    def test_both_boundaries_clamped(self):
        """
        Student joins before start (09:10) and leaves after end (11:00).
        Should be clamped to exactly the session duration.
        """
        result = _compute_attendance(
            self.official_start, self.official_end,
            [(self._dt(time(9, 10)), self._dt(time(11, 0)))]
        )
        self.assertEqual(result["duration_seconds"], 4166)
        self.assertEqual(result["attendance_percentage"], 100.0)
