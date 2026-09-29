from datetime import datetime, timedelta

from rest_framework import serializers
from django.utils import timezone

from .models import (
    Attendance,
    AbsenceWarning,
    AttendanceSummary,
)


class AttendanceSerializer(serializers.ModelSerializer):

    @staticmethod
    def _student_join_window_open(instance):
        if (
            not instance.meeting_link
            or not instance.class_date
            or not instance.start_time
            or instance.class_status in {
                Attendance.ClassStatus.COMPLETED,
                Attendance.ClassStatus.CANCELLED,
                Attendance.ClassStatus.RESCHEDULED,
            }
        ):
            return False

        time_zone = timezone.get_current_timezone()
        start_at = timezone.make_aware(
            datetime.combine(instance.class_date, instance.start_time),
            time_zone,
        )
        end_at = timezone.make_aware(
            datetime.combine(instance.class_date, instance.end_time),
            time_zone,
        ) if instance.end_time else start_at + timedelta(hours=1)
        now = timezone.now()
        return start_at - timedelta(minutes=15) <= now <= end_at + timedelta(minutes=15)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.historical_attendance_data:
            # The register records dates and P/A only; no meeting times are known.
            for field in ("start_time", "end_time", "class_start_time", "class_end_time"):
                data[field] = None
        user = getattr(self.context.get("request"), "user", None)
        if getattr(user, "role", None) == "STUDENT":
            profile = getattr(user, "student_profile", None)
            own_id = str(profile.pk) if profile else None
            for field in ("attendees", "joined_students"):
                data[field] = [value for value in data[field] if str(value) == own_id]
            # A student gets their own result, never the cohort's personal roster.
            for field in ("google_meet_attendance_data", "guest_emails", "whitelisted_guest_emails"):
                data.pop(field, None)
            data["calendar_event_id"] = None
            if not self._student_join_window_open(instance):
                data["meeting_link"] = None
        
        # Inject expected students roster for admin/mentor detail views if it's missing
        if getattr(self.context.get("view"), "action", None) == "retrieve" and getattr(user, "role", None) != "STUDENT":
            g_data = data.get("google_meet_attendance_data")
            if not g_data or "expected_students" not in g_data:
                try:
                    from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
                    expected_roster = RealMeetAttendanceService.get_expected_roster(instance)
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
                    if not g_data:
                        data["google_meet_attendance_data"] = {"status": "PENDING"}
                    data["google_meet_attendance_data"]["expected_students"] = empty_roster
                except Exception:
                    pass

        return data

    generator_info = serializers.SerializerMethodField()
    actual_student_count = serializers.SerializerMethodField()
    whitelist_email_count = serializers.SerializerMethodField()
    total_attendee_count = serializers.SerializerMethodField()
    # Override M2M fields with Google-derived values when data is READY
    attendees = serializers.SerializerMethodField()
    joined_students = serializers.SerializerMethodField()
    prior_permissions = serializers.SerializerMethodField()
    
    def get_prior_permissions(self, obj):
        return [
            {
                "student_id": pp.student_id,
                "student_name": f"{pp.student.user.first_name} {pp.student.user.last_name}".strip(),
                "reason": pp.reason
            }
            for pp in obj.prior_permissions.select_related('student__user').all()
        ]

    # Computed counts for Admin UI
    google_joined_count = serializers.SerializerMethodField()
    google_absent_count = serializers.SerializerMethodField()
    google_total_students = serializers.SerializerMethodField()
    # Aggregated status counts for Admin UI
    identity_review_required_count = serializers.SerializerMethodField()
    discipline_required_count = serializers.SerializerMethodField()
    name_change_required_count = serializers.SerializerMethodField()
    # Actual Google Meet class timings (from class_metrics)
    class_start_time = serializers.SerializerMethodField()
    class_end_time = serializers.SerializerMethodField()
    google_meet_start_time = serializers.SerializerMethodField()
    google_meet_end_time = serializers.SerializerMethodField()
    student_dashboard_data = serializers.SerializerMethodField()
    effective_status = serializers.SerializerMethodField()
    course_name = serializers.SerializerMethodField()
    cohort_code = serializers.SerializerMethodField()
    conducted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Attendance

        fields = [
            "id",

            "cohort",
            "course",
            "course_name",
            "cohort_code",
            "class_type",
            "lst_batch",

            "title",
            "class_date",
            "start_time",
            "end_time",

            "class_status",
            "effective_status",
            "conducted",
            "conducted_by",
            "conducted_by_name",

            "attendees",
            "joined_students",
            "prior_permissions",

            "meeting_link",
            "calendar_event_id",
            "google_meet_attendance_data",

            "recording_link",
            "notes",
            "guest_emails",
            "whitelisted_guest_emails",

            "created_at",
            "updated_at",

            "generator_info",
            "actual_student_count",
            "whitelist_email_count",
            "total_attendee_count",
            "google_joined_count",
            "google_absent_count",
            "google_total_students",
            "identity_review_required_count",
            "discipline_required_count",
            "name_change_required_count",
            "class_start_time",
            "class_end_time",
            "google_meet_start_time",
            "google_meet_end_time",
            "student_dashboard_data",
        ]

        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "google_meet_attendance_data",
            "generator_info",
            "actual_student_count",
            "whitelist_email_count",
            "total_attendee_count",
            "google_joined_count",
            "google_absent_count",
            "google_total_students",
            "identity_review_required_count",
            "discipline_required_count",
            "name_change_required_count",
            "class_start_time",
            "class_end_time",
            "google_meet_start_time",
            "google_meet_end_time",
            "student_dashboard_data",
            "prior_permissions",
            "effective_status",
            "course_name",
            "cohort_code",
            "conducted_by_name",
        ]

    def validate_class_status(self, value):
        if self.instance and self.instance.class_status == Attendance.ClassStatus.COMPLETED and value == Attendance.ClassStatus.CANCELLED:
            raise serializers.ValidationError("Cannot cancel a session that has already been completed.")
        return value

    def get_effective_status(self, obj):
        """Return the authoritative state.

        COMPLETED is only returned when an authorized user explicitly ends the class
        (Admin, Volunteer, or Mentor for domain classes sets class_status = COMPLETED
        in the DB). Time-based logic can only return ONGOING or SCHEDULED — never
        COMPLETED — so the frontend can safely trust this field without second-guessing it.
        """
        if obj.class_status in {
            Attendance.ClassStatus.COMPLETED,
            Attendance.ClassStatus.CANCELLED,
            Attendance.ClassStatus.RESCHEDULED,
        }:
            return obj.class_status

        # class_status is SCHEDULED — admin has NOT ended it yet.
        now = timezone.localtime()

        if obj.class_date > now.date():
            # Future date — genuinely scheduled
            return Attendance.ClassStatus.SCHEDULED

        if obj.class_date == now.date():
            if obj.start_time and obj.start_time <= now.time().replace(tzinfo=None):
                # Has started (even if past scheduled end time) — still ONGOING
                return "ONGOING"
            return Attendance.ClassStatus.SCHEDULED

        # Past date but still SCHEDULED in DB → admin never ended it, treat as ONGOING
        return "ONGOING"

    def get_course_name(self, obj):
        if obj.course_id:
            return obj.course.name
        if obj.cohort_id and obj.cohort.course_id:
            return obj.cohort.course.name
        return None

    def get_cohort_code(self, obj):
        return obj.cohort.code if obj.cohort_id else None

    def get_conducted_by_name(self, obj):
        if not obj.conducted_by_id:
            return "Admin/System"
        return obj.conducted_by.get_full_name().strip() or obj.conducted_by.email

    def _get_google_expected_students(self, obj):
        """Returns the expected_students dict from google_meet_attendance_data if status is READY, else None."""
        data = obj.google_meet_attendance_data
        if data and data.get("status") == "READY":
            return data.get("expected_students") or {}
        return None

    def get_attendees(self, obj):
        """When Google data is READY, return list of student IDs who actually joined (duration > 0 or join_time set).
        Falls back to M2M field for live sessions."""
        expected_students = self._get_google_expected_students(obj)
        if expected_students is not None:
            return [
                s_id for s_id, s_data in expected_students.items()
                if s_data.get("duration_seconds", 0) > 0 or s_data.get("join_time")
            ]
        # Fallback: M2M field (live sessions / pre-Google)
        return list(obj.attendees.values_list('id', flat=True))

    def get_joined_students(self, obj):
        """When Google data is READY, return Google joined list.
        Otherwise, fall back to the actual manual joined_students M2M field."""
        expected_students = self._get_google_expected_students(obj)
        if expected_students is not None:
            return [
                s_id for s_id, s_data in expected_students.items()
                if s_data.get("duration_seconds", 0) > 0 or s_data.get("join_time")
            ]
        # Fallback: actual manual joined_students M2M field
        return list(obj.joined_students.values_list('id', flat=True))

    def get_google_joined_count(self, obj):
        """Count of official students who joined according to Google data."""
        expected_students = self._get_google_expected_students(obj)
        if expected_students is not None:
            return sum(
                1 for s_data in expected_students.values()
                if s_data.get("duration_seconds", 0) > 0 or s_data.get("join_time")
            )
        return None

    def get_google_absent_count(self, obj):
        """Count of official students who did NOT join according to Google data."""
        if obj.historical_attendance_data:
            return None
        expected_students = self._get_google_expected_students(obj)
        if expected_students is not None:
            total = len(expected_students)
            joined = self.get_google_joined_count(obj)
            return max(0, total - joined)

        if obj.class_status == "COMPLETED" and (not obj.google_meet_attendance_data or obj.google_meet_attendance_data.get("status") != "READY"):
            total = self.get_google_total_students(obj) or 0
            joined = self.get_google_joined_count(obj) or 0
            return max(0, total - joined)
        return None

    def get_google_total_students(self, obj):
        """Total official enrolled students from Google expected_students when READY."""
        if obj.historical_attendance_data:
            return None
        expected_students = self._get_google_expected_students(obj)
        if expected_students is not None:
            return len(expected_students)

        if obj.class_status == "COMPLETED" and (not obj.google_meet_attendance_data or obj.google_meet_attendance_data.get("status") != "READY"):
            # Fallback to dynamic roster count if pending/empty
            from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
            try:
                roster = RealMeetAttendanceService.get_expected_roster(obj)
                return len(roster)
            except Exception:
                pass
        return None

    def get_identity_review_required_count(self, obj):
        if not obj.cohort:
            return 0
        from applications.models import Application
        from django.db.models import Q
        from students.models import StudentProfile
        students = Application.objects.filter(
            assigned_cohort=obj.cohort,
            status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
        ).values_list("student_id", flat=True)
        return StudentProfile.objects.filter(id__in=students).filter(
            Q(google_identity__isnull=True) | Q(google_identity__is_verified=False)
        ).count()

    def get_discipline_required_count(self, obj):
        return obj.warnings.filter(status__in=["PENDING", "APOLOGIZED"]).values('student_id').distinct().count()

    def get_name_change_required_count(self, obj):
        return self.get_identity_review_required_count(obj)

    def get_class_start_time(self, obj):
        """Official LMS scheduled class start time."""
        from django.utils import timezone
        from datetime import datetime
        if obj.class_date and obj.start_time is not None:
            return timezone.make_aware(datetime.combine(obj.class_date, obj.start_time)).isoformat()
        return None

    def get_class_end_time(self, obj):
        """Official LMS End Class timestamp."""
        if obj.class_status == "COMPLETED":
            from django.utils import timezone
            from datetime import datetime
            if obj.class_date and obj.end_time is not None:
                return timezone.make_aware(datetime.combine(obj.class_date, obj.end_time)).isoformat()
        return None

    def get_google_meet_start_time(self, obj):
        """Raw diagnostic Google Meet start time."""
        data = obj.google_meet_attendance_data
        if data and data.get("status") == "READY":
            return (data.get("class_metrics") or {}).get("start_time")
        return None

    def get_google_meet_end_time(self, obj):
        """Raw diagnostic Google Meet end time."""
        data = obj.google_meet_attendance_data
        if data and data.get("status") == "READY":
            return (data.get("class_metrics") or {}).get("end_time")
        return None

    def _resolve_discipline_status(self, session, student):
        """
        Determines discipline status for a student in a session.
        Returns: NORMAL, DISCIPLINE_REQUIRED, SUSPENSION_PENDING, RESOLVED_BY_PRIOR_PERMISSION
        """
        try:
            # Check if student has prior permission for this session
            prior_perm = session.prior_permissions.filter(student=student).exists()
            if prior_perm:
                return "RESOLVED_BY_PRIOR_PERMISSION"
            
            # Check if student has unresolved warnings
            pending_warning = session.warnings.filter(
                student=student,
                status__in=["PENDING", "APOLOGIZED"]
            ).exists()
            if pending_warning:
                return "DISCIPLINE_REQUIRED"
            
            return "NORMAL"
        except Exception:
            return "NORMAL"

    def _resolve_suspension_status(self, session, student):
        """
        Determines the session-specific disciplinary access state.
        Returns detailed statuses for frontend rendering of "Account Access".
        """
        try:
            prior_perm = session.prior_permissions.filter(student=student).first()
            warning = session.warnings.filter(student=student).first()

            # Check Prior Permission timing
            if prior_perm:
                from django.utils import timezone
                # If prior perm was created after the session started, it's retroactive
                is_retroactive = False
                if session.class_date:
                    import datetime
                    session_datetime = timezone.make_aware(datetime.datetime.combine(session.class_date, session.start_time or datetime.time(0, 0)))
                    if prior_perm.created_at > session_datetime:
                        is_retroactive = True
                
                if is_retroactive:
                    return "SUSPENSION_REVOKED_PRIOR_PERMISSION"
                else:
                    return "NO_SUSPENSION_PRIOR_PERMISSION"
                    
            if warning:
                return "SUSPENDED"
                
            return "NOT_SUSPENDED"
        except Exception:
            return "NOT_SUSPENDED"

    def _resolve_identity_status(self, student):
        """
        Determines Google identity verification status.
        Returns: MATCHED, IDENTITY_REVIEW_REQUIRED, UNRESOLVED, NAME_CHANGE_REQUIRED
        """
        try:
            google_identity = student.google_identity
            if not google_identity:
                return "UNRESOLVED"
            if not google_identity.is_verified:
                return "IDENTITY_REVIEW_REQUIRED"
            return "MATCHED"
        except Exception:
            return "UNRESOLVED"

    def _resolve_naming_compliance(self, student):
        """
        Determines if student's Google name matches required Meet name.
        Returns: COMPLIANT, NAME_CHANGE_REQUIRED
        """
        try:
            google_identity = student.google_identity
            if not google_identity or not google_identity.is_verified:
                return "NAME_CHANGE_REQUIRED"
            
            # For now, any verified Google identity is considered compliant
            # In production, you'd compare against required Meet name format
            return "COMPLIANT"
        except Exception:
            return "NAME_CHANGE_REQUIRED"

    def get_student_dashboard_data(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated or getattr(user, 'role', '') != 'STUDENT' or not hasattr(user, 'student_profile'):
            return None

        student = user.student_profile
        s_id = str(student.id)

        historical = obj.historical_attendance_data or {}
        if historical:
            result = (historical.get("expected_students") or {}).get(s_id)
            if not result:
                return {"status": "NOT_READY", "source": "HISTORICAL_REGISTER"}
            return {
                "status": "READY", "source": "HISTORICAL_REGISTER",
                "course": obj.course.name if obj.course_id else None,
                "cohort": obj.cohort.code if obj.cohort_id else None,
                "class_date": obj.class_date,
                "attendance_status": result["status"],
                "attendance_percentage": 100.0 if result["status"] == "PRESENT" else 0.0,
                "active_duration_seconds": None, "meet_start": None, "meet_end": None,
                "warning_state": None, "meeting_link": None,
                "discipline_status": self._resolve_discipline_status(obj, student),
                "suspension_status": self._resolve_suspension_status(obj, student),
                "identity_status": self._resolve_identity_status(student),
                "naming_compliance": self._resolve_naming_compliance(student),
            }

        course = obj.course.name if obj.course else (obj.cohort.course.name if getattr(obj.cohort, 'course', None) else obj.title)
        cohort = getattr(obj.cohort, 'code', None) or getattr(obj.cohort, 'name', None) or obj.lst_batch or "N/A"

        # Get warning state (works for both Late Join/Active classes and Completed classes)
        warning_state = None
        warning = obj.warnings.filter(student=student).first()
        if warning:
            warning_state = warning.status

        data = obj.google_meet_attendance_data
        if not data or data.get("status") != "READY" or s_id not in (data.get("expected_students") or {}):
            return {
                "status": "NOT_READY",
                "course": course,
                "cohort": cohort,
                "class_date": obj.class_date,
                "warning_state": warning_state,
                "meeting_link": obj.meeting_link,
                "discipline_status": self._resolve_discipline_status(obj, student),
                "suspension_status": self._resolve_suspension_status(obj, student),
                "identity_status": self._resolve_identity_status(student),
                "naming_compliance": self._resolve_naming_compliance(student),
            }

        metrics = data.get("class_metrics", {})
        expected = data.get("expected_students", {})
        s_data = expected.get(s_id, {})

        pct = s_data.get("attendance_percentage", 0)
        attendance_status = s_data.get("status", "NOT_READY")
        if attendance_status not in ["PRESENT", "ABSENT", "IDENTITY_REVIEW_REQUIRED"]:
            attendance_status = "NOT_READY"

        return {
            "status": "READY",
            "course": course,
            "cohort": cohort,
            "class_date": obj.class_date,
            "meet_start": metrics.get("start_time"),
            "meet_end": metrics.get("end_time"),
            "active_duration_seconds": s_data.get("duration_seconds", 0),
            "attendance_percentage": pct,
            "attendance_status": attendance_status,
            "warning_state": warning_state,
            "meeting_link": obj.meeting_link,
            "discipline_status": self._resolve_discipline_status(obj, student),
            "suspension_status": self._resolve_suspension_status(obj, student),
            "identity_status": self._resolve_identity_status(student),
            "naming_compliance": self._resolve_naming_compliance(student),
        }

    def get_generator_info(self, obj):
        if not obj.conducted_by:
            return "Admin/System"

        name = getattr(obj.conducted_by, "first_name", "")

        if name:
            return name

        return getattr(
            obj.conducted_by,
            "email",
            str(obj.conducted_by.id),
        )

    def get_actual_student_count(self, obj):
        if getattr(obj, "class_type", "DOMAIN") == "DOMAIN" and obj.cohort:

            from applications.models import Application

            return (
                Application.objects
                .filter(
                    assigned_cohort=obj.cohort,
                    status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"],
                    student__user__email__isnull=False,
                )
                .values("student_id")
                .distinct()
                .count()
            )

        elif obj.class_type == "LST":

            from applications.models import Application
            from cohorts.models import Cohort

            qs = Application.objects.filter(
                status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"],
                student__user__email__isnull=False,
            )

            if obj.lst_batch:
                return qs.filter(
                    assigned_cohort__lst_batch=obj.lst_batch,
                    assigned_cohort__status__in=[
                        Cohort.Status.ACTIVE,
                        Cohort.Status.TRAINING,
                        Cohort.Status.INTERNSHIP,
                        Cohort.Status.SOFT_SKILLS,
                    ]
                ).values("student_id").distinct().count()
            else:
                return qs.filter(
                    assigned_cohort__lst_batch__isnull=False,
                    assigned_cohort__status__in=[
                        Cohort.Status.ACTIVE,
                        Cohort.Status.TRAINING,
                        Cohort.Status.INTERNSHIP,
                        Cohort.Status.SOFT_SKILLS,
                    ]
                ).values("student_id").distinct().count()

        elif obj.class_type == "SOFTSKILLS":

            from applications.models import Application
            from cohorts.models import Cohort

            return (
                Application.objects
                .filter(
                    assigned_cohort__status=Cohort.Status.SOFT_SKILLS,
                    status__in=["SOFT_SKILLS"],
                    student__user__email__isnull=False,
                )
                .values("student_id")
                .distinct()
                .count()
            )

        elif obj.class_type == "CELEBRATION":

            from applications.models import Application

            return (
                Application.objects
                .filter(
                    assigned_cohort__isnull=False,
                    status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"],
                    student__user__email__isnull=False,
                )
                .values("student_id")
                .distinct()
                .count()
            )

        return 0

    def get_whitelist_email_count(self, obj):
        if not obj.guest_emails:
            return 0

        return len(
            set(
                str(email).lower().strip()
                for email in obj.guest_emails
                if str(email).strip()
            )
        )

    def get_total_attendee_count(self, obj):
        from attendance.services.attendee_resolver import AttendeeResolver

        emails = AttendeeResolver.resolve_session_attendees(obj)

        return len(emails)


class AbsenceWarningSerializer(serializers.ModelSerializer):

    session_title = serializers.CharField(
        source="session.title",
        read_only=True,
    )

    class_date = serializers.DateField(
        source="session.class_date",
        read_only=True,
    )

    student_name = serializers.SerializerMethodField()
    total_duration_percent = serializers.SerializerMethodField()

    def get_total_duration_percent(self, obj):
        from attendance.models import AttendanceSummary
        summary = AttendanceSummary.objects.filter(session=obj.session, student=obj.student).first()
        if summary and summary.total_session_minutes > 0:
            return round((summary.active_minutes / summary.total_session_minutes) * 100)
        return 0

    domain_name = serializers.CharField(
        source="session.cohort.name",
        read_only=True,
    )

    group_name = serializers.CharField(
        source="session.cohort.code",
        read_only=True,
    )

    class Meta:
        model = AbsenceWarning

        fields = [
            "id",
            "student",
            "student_name",
            "session",
            "session_title",
            "class_date",
            "domain_name",
            "group_name",
            "total_duration_percent",
            "resolved",
            "apology_text",
            "status",
            "created_at",
            "apology_submitted_at",
        ]

    def get_student_name(self, obj):
        name = getattr(
            obj.student.user,
            "first_name",
            "",
        )

        if name:
            return name

        return obj.student.user.email


class AttendanceSummarySerializer(serializers.ModelSerializer):

    session_title = serializers.CharField(
        source="session.title",
        read_only=True,
    )

    class_date = serializers.DateField(
        source="session.class_date",
        read_only=True,
    )

    class Meta:
        model = AttendanceSummary

        fields = [
            "id",
            "session",
            "session_title",
            "class_date",
            "student",
            "total_session_minutes",
            "active_minutes",
            "attendance_percentage",
            "last_updated",
        ]

        read_only_fields = fields
