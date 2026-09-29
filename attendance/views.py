import os
import uuid
import json
import logging
import hashlib
from datetime import datetime
from django.utils import timezone
from django.core.mail import send_mass_mail
from django.conf import settings
from django.http import HttpResponse
from django.db import transaction

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from common.permissions import IsAdmin

from .models import Attendance, AttendanceSummary
from .serializers import AttendanceSerializer, AttendanceSummarySerializer
from students.models import StudentProfile
from common.permissions import IsAdminOrReadOnly, IsMentorOrAdminOrReadOnly, IsMentorOrAdmin, IsAdminVolunteerOrMentorStrict, IsVolunteerOrMentorOrAdmin
from common.access import assigned_cohort_ids, can_manage_cohort, has_global_cohort_access

from attendance.services.google_meet_service import generate_google_meet


from django.core.cache import cache

logger = logging.getLogger(__name__)

class AttendanceViewSet(viewsets.ModelViewSet):
    # cohort__course is required by report_utils.get_report_path() which reads
    # session.cohort.course.domain — without it, every download fires a hidden query.
    queryset = (
        Attendance.objects
        .select_related("cohort__course", "conducted_by")
        .prefetch_related("attendees")
        .all()
        .order_by("-class_date", "-id")
    )
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, IsMentorOrAdminOrReadOnly]
    from rest_framework.filters import SearchFilter
    filter_backends = [SearchFilter]
    search_fields = ['cohort__course__name', 'cohort__name', 'title', 'conducted_by__email']

    @staticmethod
    def _session_schedule_label(session):
        """Return one unambiguous, user-facing class date/time label."""
        scheduled_at = timezone.make_aware(
            datetime.combine(session.class_date, session.start_time),
            timezone.get_current_timezone(),
        )
        zone = scheduled_at.tzname() or timezone.get_current_timezone_name()
        return f"{session.class_date:%Y-%m-%d} at {session.start_time:%I:%M %p} {zone}".replace(" at 0", " at ")

    @staticmethod
    def _session_notification_user_ids(session):
        """Resolve active platform accounts entitled to see this class."""
        from attendance.services.attendee_resolver import AttendeeResolver
        from django.contrib.auth import get_user_model
        from django.db.models.functions import Lower

        emails = {
            email.strip().lower()
            for email in AttendeeResolver.resolve_session_attendees(session)
            if email and email.strip()
        }
        emails.update(
            email.strip().lower()
            for email in session.prior_permissions.filter(student__user__email__isnull=False)
            .values_list("student__user__email", flat=True)
            if email and email.strip()
        )
        if not emails:
            return set()

        User = get_user_model()
        user_ids = set()
        email_list = list(emails)
        for index in range(0, len(email_list), 1000):
            user_ids.update(
                User.objects.annotate(email_lower=Lower("email"))
                .filter(is_active=True, email_lower__in=email_list[index:index + 1000])
                .values_list("id", flat=True)
            )
        return user_ids

    @classmethod
    def _sync_session_notifications(cls, session, user_ids, event="scheduled"):
        """Create or update exactly one notification per class and recipient."""
        from django.contrib.auth import get_user_model
        from common.models import Notification
        from common.services.notifications import notify_user

        action_url = f"/attendance/{session.id}/"
        schedule = cls._session_schedule_label(session)
        status_value = (session.class_status or "").upper()
        if status_value == Attendance.ClassStatus.CANCELLED:
            title = "Class cancelled"
            message = f"The class '{session.title}' scheduled for {schedule} has been cancelled."
            notification_type = Notification.Type.WARNING
        elif status_value == Attendance.ClassStatus.COMPLETED:
            title = "Class completed"
            message = f"The class '{session.title}' scheduled for {schedule} has been completed."
            notification_type = Notification.Type.INFO
        elif event == "starting_soon":
            title = "Class starts soon"
            message = f"Your class '{session.title}' starts at {schedule}."
            notification_type = Notification.Type.ACTION_REQUIRED
        elif event == "started":
            title = "Class started"
            message = f"Your class '{session.title}' is now live."
            notification_type = Notification.Type.ACTION_REQUIRED
        elif status_value == Attendance.ClassStatus.RESCHEDULED or event == "rescheduled":
            title = "Class rescheduled"
            message = f"The class '{session.title}' has been rescheduled to {schedule}."
            notification_type = Notification.Type.INFO
        elif event == "updated":
            title = "Class updated"
            message = f"The class '{session.title}' has been updated and is scheduled for {schedule}."
            notification_type = Notification.Type.INFO
        else:
            title = "Class scheduled"
            message = f"A new class '{session.title}' has been scheduled for {schedule}."
            notification_type = Notification.Type.INFO

        recipient_ids = set(user_ids)
        with transaction.atomic():
            users = list(
                get_user_model().objects.filter(pk__in=recipient_ids, is_active=True).order_by("pk")
            )
            active_recipient_ids = {user.pk for user in users}
            for user in users:
                user_message = message
                if getattr(user, 'role', '') == 'ADMIN':
                    user_message = message.replace("Your class", "The class")
                
                current = notify_user(
                    user,
                    title=title,
                    message=user_message,
                    notification_type=notification_type,
                    action_url=action_url,
                    dedupe_key=f"attendance:{session.id}:schedule",
                )
                # Adopt the new stable lifecycle row and remove legacy rows made
                # before attendance notifications had a deduplication key.
                Notification.objects.filter(user=user, action_url=action_url).exclude(pk=current.pk).delete()

            stale = Notification.objects.filter(action_url=action_url)
            if active_recipient_ids:
                stale = stale.exclude(user_id__in=active_recipient_ids)
            stale.delete()


    def get_queryset(self):
        user = self.request.user
        status_param = self.request.query_params.get('status', 'ALL')
        class_date = self.request.query_params.get('class_date')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        recent_days = self.request.query_params.get('recent_days')
        from django.utils.dateparse import parse_date
        for field_name, value in {
            "class_date": class_date,
            "date_from": date_from,
            "date_to": date_to,
        }.items():
            if value and parse_date(value) is None:
                raise ValidationError({field_name: "Use ISO date format YYYY-MM-DD."})

        # Scoped cache key to avoid privilege escalation/cache poisoning
        is_admin = has_global_cohort_access(user)
        filter_key = status_param
        if class_date or date_from or date_to or recent_days:
            filter_key += f":{class_date or ''}:{date_from or ''}:{date_to or ''}:{recent_days or ''}"

        search_param = self.request.query_params.get('search')
        if search_param:
            filter_key += f":search={search_param}"

        course_param = self.request.query_params.get('course') or self.request.query_params.get('course_id') or self.request.query_params.get('domain')
        cohort_param = self.request.query_params.get('cohort') or self.request.query_params.get('cohort_id')

        if course_param:
            filter_key += f":course={course_param}"
        if cohort_param:
            filter_key += f":cohort={cohort_param}"

        if is_admin:
            version = cache.get("attendance:version:admin", 1)
            cache_key = f"attendance:list:admin:v{version}:{filter_key}"
        else:
            version = cache.get(f"attendance:version:user_{user.id}", 1)
            cache_key = f"attendance:list:user_{user.id}:v{version}:{filter_key}"

        # Recheck student enrollment on every request, retaining versioned
        # cache invalidation for the staff dashboards.
        cached_pks = cache.get(cache_key) if is_admin and self.action == 'list' else None
        if cached_pks is not None:
            if not cached_pks:
                return self.queryset.model.objects.none()
            from django.db.models import Case, When
            preserved_order = Case(*(When(pk=pk, then=pos) for pos, pk in enumerate(cached_pks)))
            return (
                self.queryset.model.objects
                .select_related("cohort__course", "conducted_by")
                .prefetch_related("attendees")
                .filter(pk__in=cached_pks)
                .order_by(preserved_order)
            )

        qs = super().get_queryset()

        # Object-level authorization for MENTOR
        if is_admin:
            pass
        elif getattr(user, 'role', '') == 'MENTOR':
            from django.db.models import Q
            qs = qs.filter(
                (Q(class_type__in=["DOMAIN", "TRAINING"]) & (Q(cohort__mentors=user) | Q(cohort__current_mentors=user))) |
                Q(conducted_by=user)
            ).distinct()

        elif getattr(user, 'role', '') in {'VOLUNTEER', 'TRUSTEE'}:
            qs = qs.filter(cohort__volunteers=user).distinct()

        elif getattr(user, 'role', '') == 'STUDENT':
            from attendance.services.student_scope import student_attendance_queryset
            profile = StudentProfile.objects.filter(user=user).first()
            qs = student_attendance_queryset(profile, qs) if profile else qs.none()
        else:
            qs = qs.none()

        if status_param == 'ACTIVE':
            from attendance.models import Attendance
            qs = qs.filter(class_status__in=[
                Attendance.ClassStatus.SCHEDULED,
                Attendance.ClassStatus.RESCHEDULED
            ])
            qs = qs.exclude(conducted=False)

        # Apply 21-day default for operational attendance list if no explicit dates are passed
        if self.action == 'list' and getattr(user, 'role', '') != 'STUDENT' and status_param != 'ACTIVE' and not class_date and not date_from and not date_to and not recent_days:
            recent_days = "21"

        if class_date:
            qs = qs.filter(class_date=class_date)
        else:
            if date_from:
                qs = qs.filter(class_date__gte=date_from)
            elif recent_days:
                try:
                    days = int(recent_days)
                    from django.utils import timezone
                    from datetime import timedelta
                    cutoff_date = (timezone.now() - timedelta(days=days)).date()
                    qs = qs.filter(class_date__gte=cutoff_date)
                except ValueError:
                    pass
            if date_to:
                qs = qs.filter(class_date__lte=date_to)

        if course_param and cohort_param:
            from django.db.models import Q
            qs = qs.filter(Q(cohort__course_id=course_param) | Q(course_id=course_param), cohort_id=cohort_param)
        elif cohort_param:
            qs = qs.filter(cohort_id=cohort_param)
        elif course_param:
            from django.db.models import Q
            qs = qs.filter(Q(cohort__course_id=course_param) | Q(course_id=course_param))

        if is_admin and self.action == 'list':
            pks_list = list(qs.values_list('pk', flat=True))
            cache.set(cache_key, pks_list, timeout=300)
        return qs


    @staticmethod
    def send_class_emails_background(subject, message, recipient_list):
        chunk_size = 500
        for i in range(0, len(recipient_list), chunk_size):
            chunk = recipient_list[i:i + chunk_size]
            messages = ((subject, message, settings.DEFAULT_FROM_EMAIL, [email]) for email in chunk if email)
            try:
                send_mass_mail(messages, fail_silently=True)
            except Exception as e:
                logger.exception(f"Email chunk error: {e}")

    def create(self, request, *args, **kwargs):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        data = request.data.copy()
        data['conducted_by'] = request.user.id
        if hasattr(data, 'getlist'):
            raw_permissions = data.getlist("prior_permissions")
            data.pop("prior_permissions", None)
        else:
            raw_permissions = data.pop("prior_permissions", [])
            
        import json
        prior_permissions_data = []
        for item in raw_permissions:
            if isinstance(item, str):
                try:
                    parsed = json.loads(item)
                    if isinstance(parsed, list):
                        prior_permissions_data.extend(parsed)
                    else:
                        prior_permissions_data.append(parsed)
                except json.JSONDecodeError:
                    pass
            elif isinstance(item, list):
                prior_permissions_data.extend(item)
            else:
                prior_permissions_data.append(item)
        user_role = getattr(request.user, 'role', '').upper()

        session_type = data.pop("session_type", None)
        # Current mobile clients send the normalized class type directly.  Treat it
        # as the canonical requested type when the legacy session_type field is
        # absent; otherwise a cohort-backed Celebration/LST request was silently
        # rewritten as DOMAIN below.
        requested_class_type = str(data.get("class_type") or "").strip().upper()
        if not session_type and requested_class_type:
            session_type = requested_class_type
        group_name = data.pop("group_name", None)
        stream_id = data.pop("stream_id", None)
        lst_batch = data.pop("lst_batch", None)
        guest_emails = data.get("whitelisted_guest_emails") or data.get("guest_emails", [])

        # 🚨 FIX: User explicitly states to use the passed ID relationships, not infer from text.
        frontend_cohort_id = data.get("cohort") or data.get("cohort_id") or data.get("assigned_cohort_id") or data.get("frontend_cohort_id")

        # Sometimes frontend might pass the UUID in group_name if it was repurposed as a dropdown
        if not frontend_cohort_id and group_name:
            import uuid
            try:
                uuid.UUID(str(group_name))
                frontend_cohort_id = group_name
            except ValueError:
                pass

        if guest_emails:
            data['whitelisted_guest_emails'] = guest_emails
            data['guest_emails'] = guest_emails

        # Map frontend "Batch 1" to "BATCH_1" to pass serializer validation
        if lst_batch:
            lst_batch = lst_batch.replace(" ", "_").upper()
            data['lst_batch'] = lst_batch

        # Set class_type
        if not session_type:
            if frontend_cohort_id or user_role == 'MENTOR':
                session_type = "Domain"
            else:
                session_type = "General"

        session_type_upper = session_type.upper() if session_type else ""
        if session_type_upper in ("DOMAIN", "DOMAIN CLASS", "TRAINING", "TRAINING SESSION", "DOMAIN-SPECIFIC", "REGULAR DOMAIN CLASS"):
            data['class_type'] = "DOMAIN"
            session_type_upper = "DOMAIN"  # Normalize for subsequent checks
        elif session_type_upper == "LST" or "LIFE SKILLS TRAINING" in session_type_upper:
            data['class_type'] = "LST"
            data['lst_batch'] = lst_batch
        elif session_type_upper == "CELEBRATION" or "CELEBRATION" in session_type_upper:
            data['class_type'] = "CELEBRATION"
        elif session_type_upper == "UNIVERSAL":
            data['class_type'] = "UNIVERSAL"
        elif session_type_upper in ("SOFTSKILLS", "SOFT_SKILLS", "SOFT SKILLS") or "SOFT SKILLS" in session_type_upper:
            data['class_type'] = "SOFTSKILLS"

        course_name = session_type
        cohort_obj = None
        course_obj = None

        if frontend_cohort_id:
            try:
                from cohorts.models import Cohort
                cohort_obj = Cohort.objects.filter(pk=frontend_cohort_id).select_related("course").first()
                if cohort_obj and cohort_obj.course:
                    course_obj = cohort_obj.course
                    course_name = course_obj.code or course_obj.name or getattr(course_obj, "title", "Technical Domain")
                    data['course'] = str(course_obj.id)
            except Exception:
                pass

        if session_type_upper == "DOMAIN" and stream_id and not course_obj:
            try:
                from courses.models import Course
                course_obj = Course.objects.get(pk=stream_id)
                course_name = course_obj.code or course_obj.name or getattr(course_obj, "title", "Technical Domain")
                data['course'] = str(course_obj.id)

                # 🚨 FIX: Use the exact ID passed from frontend if available
                if frontend_cohort_id and not cohort_obj:
                    from cohorts.models import Cohort
                    cohort_obj = Cohort.objects.filter(pk=frontend_cohort_id).first()
                elif group_name and not cohort_obj:
                    from cohorts.models import Cohort
                    cohort_obj = Cohort.objects.filter(course=course_obj, code__iexact=group_name.strip()).first()
            except Exception:
                course_name = "Technical Domain"

        if cohort_obj:
            data['cohort'] = str(cohort_obj.id)

        from attendance.services.prior_permission_scope import validate_prior_permissions
        prior_permissions = validate_prior_permissions(prior_permissions_data, request.user, cohort_obj, data.get('class_type', 'DOMAIN'), data.get('lst_batch'))

        if user_role == "VOLUNTEER" and not has_global_cohort_access(request.user):
            if not can_manage_cohort(request.user, cohort_obj):
                return Response(
                    {"detail": "Volunteers may schedule classes only for an assigned cohort."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if user_role == "TRUSTEE" and not has_global_cohort_access(request.user):
            return Response(
                {"detail": "Trustees cannot schedule classes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        final_group = group_name.strip().upper() if group_name else (lst_batch or "General")
        provided_title = request.data.get("title")
        if provided_title:
            if course_name and course_name.upper() not in provided_title.upper() and course_name != "Technical Domain":
                session_title = f"{course_name} - {provided_title}"
            else:
                session_title = provided_title
        else:
            session_title = f"{course_name} [{final_group}]".upper()

        data['title'] = session_title

        # Normalize date to YYYY-MM-DD immediately so Django queries don't throw ValidationErrors
        def parse_dt(d_str, t_str):
            t_str = str(t_str).strip()
            if len(t_str.split(':')) == 2:
                t_str += ":00"
            try:
                return timezone.make_aware(datetime.strptime(f"{d_str} {t_str}", "%Y-%m-%d %H:%M:%S"))
            except ValueError:
                return timezone.make_aware(datetime.strptime(f"{d_str} {t_str}", "%d-%m-%Y %H:%M:%S"))

        if data.get('class_date') and data.get('start_time') and data.get('end_time'):
            try:
                start_dt = parse_dt(data['class_date'], data['start_time'])
                end_dt = parse_dt(data['class_date'], data['end_time'])
                data['class_date'] = start_dt.strftime("%Y-%m-%d")
                data['start_time'] = start_dt.strftime("%H:%M:%S")
                data['end_time'] = end_dt.strftime("%H:%M:%S")
            except ValueError:
                pass


        # 🚨 IDEMPOTENCY FIX: Prevent duplicate sessions during rapid double-clicks (Race Condition Lock)
        lock_material = "|".join(
            (
                str(request.user.pk),
                session_title,
                str(data.get("class_date") or ""),
                str(data.get("start_time") or ""),
            )
        )
        lock_key = "attendance:create:" + hashlib.sha256(lock_material.encode("utf-8")).hexdigest()
        if not cache.add(lock_key, "locked", timeout=60):
            return Response(
                {"detail": "A scheduling request for this exact session is already in progress. Please wait."},
                status=status.HTTP_409_CONFLICT
            )

        try:
            # Also check if it was recently created (in case of a slow retry after lock expires)
            from attendance.models import Attendance
            from datetime import timedelta
            two_mins_ago = timezone.now() - timedelta(minutes=2)
            existing_session = Attendance.objects.filter(
                title=session_title,
                class_date=data.get('class_date'),
                start_time=data.get('start_time'),
                conducted_by_id=request.user.id,
                created_at__gte=two_mins_ago
            ).first()

            if existing_session:
                updated_data = self.get_serializer(existing_session).data
                return Response(updated_data, status=status.HTTP_200_OK)

            if user_role == 'MENTOR':
                if session_type and str(session_type).upper() not in ["DOMAIN", "DOMAIN CLASS", "DOMAIN-SPECIFIC", "REGULAR DOMAIN CLASS", "TRAINING", "TRAINING SESSION"]:
                    return Response(
                        {"detail": "Mentors are strictly authorized to generate Domain or Training meetings only."},
                        status=status.HTTP_403_FORBIDDEN
                    )

                if not getattr(request.user, "has_all_cohorts_access", False):
                    if cohort_obj:
                        is_assigned = request.user.mentored_cohorts.filter(pk=cohort_obj.pk).exists() or cohort_obj.current_mentors.filter(pk=request.user.pk).exists()
                        if not is_assigned:
                            return Response(
                                {"detail": "You are not authorized for this cohort."},
                                status=status.HTTP_403_FORBIDDEN,
                            )

            try:
                start_dt = parse_dt(data['class_date'], data['start_time'])
                end_dt = parse_dt(data['class_date'], data['end_time'])

                # If the end time is mathematically earlier than the start time,
                # it means the class crosses midnight. Add 1 day to the end datetime.
                if end_dt <= start_dt:
                    end_dt += timezone.timedelta(days=1)

                from attendance.services.attendee_resolver import AttendeeResolver


                # Resolve students and add pre-generation guest emails
                attendee_emails = AttendeeResolver.resolve_emails_by_criteria(
                    class_type=data.get('class_type', 'DOMAIN'),
                    cohort_id=data.get('cohort'),
                    lst_batch=data.get('lst_batch')
                )

                guest_emails_str = data.get('guest_emails')
                final_guest_emails = set()
                if guest_emails_str:
                     final_guest_emails.update(e.strip().lower() for e in (guest_emails_str.split(',') if isinstance(guest_emails_str, str) else guest_emails_str) if e.strip())


                if final_guest_emails:
                    data['guest_emails'] = list(final_guest_emails)
                    attendee_emails.extend(data['guest_emails'])

                # Deduplicate
                attendee_emails.extend(student.user.email.strip().lower() for student, _ in prior_permissions if student.user.email)
                attendee_emails = list(set(attendee_emails))

                real_meet_link, real_event_id = generate_google_meet(session_title, start_dt, end_dt, attendee_emails=attendee_emails)
                data['meeting_link'] = real_meet_link
                data['calendar_event_id'] = real_event_id

            except Exception:
                logger.exception("Google API Error occurred during Meet generation.")
                data['meeting_link'] = ""

            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            
            try:
                with transaction.atomic():
                    instance = serializer.save()
                    from attendance.models import PriorPermission
                    for student, reason in prior_permissions:
                        PriorPermission.objects.get_or_create(session=instance, student=student,
                            defaults={"reason": reason, "granted_by": request.user})
            except Exception as e:
                calendar_event_id = data.get('calendar_event_id')
                if calendar_event_id:
                    from attendance.services.google_calendar_lifecycle import compensate_failed_creation
                    compensate_failed_creation(calendar_event_id, attendance_id=None)
                raise e

            # Dispatch ZeptoMail invitations based on user type and class type
            if data.get('meeting_link'):
                try:
                    from common.tasks import send_async_session_invitations_task, send_async_guest_invitations_task
                    start_str = start_dt.strftime("%Y-%m-%d %I:%M %p")

                    # 1. Send to whitelisted guests (direct link email)
                    guest_emails_list = data.get('guest_emails', [])
                    if guest_emails_list:
                        send_async_guest_invitations_task.delay(
                            recipient_emails=guest_emails_list,
                            session_title=session_title,
                            start_time_str=start_str,
                            meeting_link=data['meeting_link'],
                            session_id=str(instance.id)
                        )

                    # 2. Send to regular LST/SOFTSKILLS/CELEBRATION students (Dashboard email, NO meet link)
                    if data.get('class_type') in ["LST", "SOFTSKILLS", "CELEBRATION"]:
                        guest_set = set(guest_emails_list)
                        attendee_emails_normalized = [e.strip().lower() for e in attendee_emails if e and e.strip()]
                        student_emails = [e for e in attendee_emails_normalized if e not in guest_set]
                        if student_emails:
                            send_async_session_invitations_task.delay(
                                recipient_emails=student_emails,
                                session_title=session_title,
                                start_time_str=start_str,
                                meeting_link=None,
                                session_id=str(instance.id)
                            )
                except Exception as e:
                    logger.error(f"Failed to queue ZeptoMail invitations for session {instance.id}: {e}")

            # Bump admin cache version so versioned keys are invalidated
            try:
                cache.incr("attendance:version:admin")
            except ValueError:
                cache.set("attendance:version:admin", 2, timeout=None)

            # Efficiently map attendee emails to user IDs safely (case-insensitive fallback)
            user_ids = set()
            if 'attendee_emails' in locals() and attendee_emails:
                from django.contrib.auth import get_user_model
                from django.db.models.functions import Lower
                User = get_user_model()
                for i in range(0, len(attendee_emails), 1000):
                    chunk = attendee_emails[i:i+1000]
                    user_ids.update(
                        User.objects.annotate(email_lower=Lower('email'))
                        .filter(email_lower__in=chunk)
                        .values_list('id', flat=True)
                    )

            # Bump per-user cache versions for the creator and all attendees
            all_user_ids = set(user_ids) | {request.user.id}
            for uid in all_user_ids:
                try:
                    cache.incr(f"attendance:version:user_{uid}")
                except ValueError:
                    cache.set(f"attendance:version:user_{uid}", 2, timeout=None)

            # Create one stable notification per enrolled account. Subsequent
            # class edits update this row instead of adding stale copies.
            if instance.cohort and user_ids:
                self._sync_session_notifications(instance, user_ids, event="scheduled")

            logger.info(f"AUDIT: {user_role} {request.user.email} created attendance session {instance.id} ({session_title}).")

            try:
                from common.services.notifications import notify_admins
                notify_admins(
                    title="Class Scheduled",
                    message=f"{user_role.capitalize()} {request.user.get_full_name() or request.user.email} has scheduled a new session: '{instance.title}' for {instance.class_date}.",
                    notification_type="INFO",
                    action_url="timetable"
                )
            except Exception as e:
                logger.error(f"Failed to notify admins of new class schedule {instance.id}: {e}")

            updated_data = self.get_serializer(instance).data
            headers = self.get_success_headers(updated_data)
            return Response(updated_data, status=status.HTTP_201_CREATED, headers=headers)
        finally:
            # Important: Ensure the lock is released!
            cache.delete(lock_key)


    def perform_update(self, serializer):
        user = self.request.user
        if getattr(user, "role", "") == "VOLUNTEER" and not has_global_cohort_access(user):
            target = serializer.validated_data.get("cohort", serializer.instance.cohort)
            if not can_manage_cohort(user, target):
                raise PermissionDenied("Volunteers may modify classes only within assigned cohorts.")
                
        notification_fields = (
            "title", "class_date", "start_time", "class_status",
            "cohort_id", "class_type", "lst_batch",
        )
        old_notification_state = tuple(getattr(serializer.instance, field) for field in notification_fields)
        old_recipient_ids = self._session_notification_user_ids(serializer.instance)

        # Reconcile discipline if class is being cancelled
        reconcile_cancellation = False
        if serializer.validated_data.get("class_status") == "CANCELLED" and serializer.instance.class_status != "CANCELLED":
            reconcile_cancellation = True
            
            # Explicit Google Calendar Lifecycle hook for cancellation
            from attendance.services.google_calendar_lifecycle import safe_delete_google_meet
            actor = getattr(self.request.user, "email", "API_USER")
            status_result = safe_delete_google_meet(serializer.instance.calendar_event_id, attendance_id=serializer.instance.id, actor=f"API_CANCEL:{actor}")
            if status_result == "FAILED":
                from rest_framework.exceptions import APIException
                raise APIException("Failed to cancel Google Calendar event. The session cannot be cancelled until the event is cleaned up. Please try again.")
            
        # Ensure exact end time is logged when an active session is completed
        if serializer.validated_data.get("class_status") == "COMPLETED" and serializer.instance.class_status != "COMPLETED":
            serializer.validated_data["end_time"] = timezone.localtime(timezone.now()).time()
            
        with transaction.atomic():
            instance = serializer.save()
            new_notification_state = tuple(getattr(instance, field) for field in notification_fields)
            new_recipient_ids = self._session_notification_user_ids(instance)
            if old_notification_state != new_notification_state or old_recipient_ids != new_recipient_ids:
                event = "rescheduled" if instance.class_status == Attendance.ClassStatus.RESCHEDULED else "updated"
                self._sync_session_notifications(instance, new_recipient_ids, event=event)
        
        if reconcile_cancellation:
            from attendance.services.discipline_reconciliation_service import reconcile_session_discipline_after_change
            try:
                reconcile_session_discipline_after_change(instance.id, action_type="CANCELLED")
            except Exception as e:
                logger.error(f"Failed to reconcile discipline after cancelling session {instance.id} via API: {e}")

    def perform_destroy(self, instance):
        # Explicit Google Calendar Lifecycle hook for deletion
        from attendance.services.google_calendar_lifecycle import safe_delete_google_meet
        actor = getattr(self.request.user, "email", "API_USER")
        status_result = safe_delete_google_meet(instance.calendar_event_id, attendance_id=instance.id, actor=f"API_DELETE:{actor}")
        if status_result == "FAILED":
            from rest_framework.exceptions import APIException
            raise APIException("Failed to delete Google Calendar event. The session cannot be deleted until the event is cleaned up. Please try again.")
            
        from attendance.services.discipline_reconciliation_service import reconcile_session_discipline_after_change
        try:
            reconcile_session_discipline_after_change(instance.id, action_type="DELETED")
        except Exception as e:
            logger.error(f"Failed to reconcile discipline before deleting session {instance.id} via API: {e}")
        instance.delete()

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()

        user_role = getattr(request.user, 'role', '')
        if user_role == "TRUSTEE" and not has_global_cohort_access(request.user):
            return Response(
                {"detail": "Trustees cannot modify classes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        conducted_val = request.data.get("conducted")
        if conducted_val is False or str(conducted_val).lower() == "false":
            from datetime import datetime as datetime_type, timedelta
            from django.utils.dateparse import parse_time

            now_dt = timezone.localtime(timezone.now())
            requested_end_time = request.data.get("end_time")

            if requested_end_time in (None, ""):
                end_time = now_dt.time().replace(tzinfo=None)
            else:
                end_time = parse_time(str(requested_end_time))
                if end_time is None:
                    return Response(
                        {"end_time": "Use a valid 24-hour time such as 18:30 or 18:30:00."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            time_zone = timezone.get_current_timezone()
            class_start = timezone.make_aware(
                datetime_type.combine(instance.class_date, instance.start_time),
                time_zone,
            )
            class_end = timezone.make_aware(
                datetime_type.combine(instance.class_date, end_time),
                time_zone,
            )
            if class_end < class_start:
                class_end += timedelta(days=1)

            if now_dt < class_start:
                return Response(
                    {"detail": "This class has not started yet and cannot be ended."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if class_end > now_dt + timedelta(minutes=1):
                return Response(
                    {"end_time": "The class end time cannot be in the future."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Lock the row so simultaneous End Class clicks cannot move the cutoff
            # or queue attendance discipline more than once.
            with transaction.atomic():
                instance = Attendance.objects.select_for_update().get(pk=instance.pk)
                if instance.class_status == Attendance.ClassStatus.COMPLETED:
                    return Response(
                        {
                            "detail": "Class was already ended. The original attendance cutoff was kept.",
                            "attendance_status": "ATTENDANCE_PENDING",
                            "end_time": instance.end_time.strftime("%H:%M:%S") if instance.end_time else None,
                        },
                        status=status.HTTP_200_OK,
                    )
                if instance.class_status == Attendance.ClassStatus.CANCELLED:
                    return Response(
                        {"detail": "A cancelled class cannot be ended."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                instance.conducted = False
                instance.end_time = end_time
                instance.class_status = Attendance.ClassStatus.COMPLETED
                instance.save(update_fields=["conducted", "end_time", "class_status", "updated_at"])

            logger.info(
                "AUDIT: User %s ended attendance session %s at %s",
                request.user.email,
                instance.id,
                end_time,
            )
            self._invalidate_session_cache(instance, request.user.id)

            try:
                from attendance.tasks import finalize_meet_attendance_task
                finalize_meet_attendance_task.delay(str(instance.id))
            except Exception as e:
                logger.error(f"Failed to queue attendance finalization: {e}")

            return Response(
                {
                    "detail": "Class ended successfully. Attendance finalization queued.",
                    "attendance_status": "ATTENDANCE_PENDING",
                    "end_time": end_time.strftime("%H:%M:%S"),
                },
                status=status.HTTP_200_OK,
            )

        old_meeting_link = instance.meeting_link
        response = super().partial_update(request, *args, **kwargs)

        instance.refresh_from_db()
        new_meeting_link = instance.meeting_link

        if not old_meeting_link and new_meeting_link:
            try:
                from common.tasks import send_async_session_invitations_task, send_async_guest_invitations_task
                import datetime
                start_str = instance.start_time.strftime("%Y-%m-%d %I:%M %p") if instance.start_time else "Scheduled Time"
                if isinstance(instance.start_time, datetime.time) and instance.class_date:
                    start_str = f"{instance.class_date.strftime('%Y-%m-%d')} {instance.start_time.strftime('%I:%M %p')}"

                from attendance.services.attendee_resolver import AttendeeResolver
                attendee_emails = AttendeeResolver.resolve_emails_by_criteria(
                    class_type=instance.class_type,
                    cohort_id=instance.cohort_id if instance.cohort else None,
                    lst_batch=instance.lst_batch
                )

                guest_emails_list = instance.guest_emails or []

                # 1. Send to whitelisted guests (direct link email)
                if guest_emails_list:
                    send_async_guest_invitations_task.delay(
                        recipient_emails=guest_emails_list,
                        session_title=instance.title,
                        start_time_str=start_str,
                        meeting_link=new_meeting_link,
                        session_id=str(instance.id)
                    )

                # 2. Send to regular LST/SOFTSKILLS/CELEBRATION students (Dashboard email, NO meet link)
                if instance.class_type in ["LST", "SOFTSKILLS", "CELEBRATION"]:
                    guest_set = set(guest_emails_list)
                    attendee_emails_normalized = [e.strip().lower() for e in attendee_emails if e and e.strip()]
                    student_emails = [e for e in attendee_emails_normalized if e not in guest_set]
                    if student_emails:
                        send_async_session_invitations_task.delay(
                            recipient_emails=student_emails,
                            session_title=instance.title,
                            start_time_str=start_str,
                            meeting_link=None,
                            session_id=str(instance.id)
                        )
            except Exception as e:
                logger.error(f"Failed to queue ZeptoMail invitations on update for session {instance.id}: {e}")

        self._invalidate_session_cache(instance, request.user.id)
        return response

    def _invalidate_session_cache(self, instance, request_user_id):
        # Clear both admin global caches and the specific caches of everyone invited
        student_user_ids = list(instance.attendees.values_list('user_id', flat=True))
        all_user_ids = set(student_user_ids) | {request_user_id}

        try:
            cache.incr("attendance:version:admin")
        except ValueError:
            cache.set("attendance:version:admin", 2, timeout=None)

        for uid in all_user_ids:
            try:
                cache.incr(f"attendance:version:user_{uid}")
            except ValueError:
                cache.set(f"attendance:version:user_{uid}", 2, timeout=None)

    @action(detail=True, methods=['post'], url_path='grant-prior-permission', permission_classes=[IsAuthenticated, IsAdminVolunteerOrMentorStrict])
    def grant_prior_permission(self, request, pk=None):
        """
        Grants a student prior permission for this session, exempting them from disciplinary action.
        """
        session = self.get_object()
        student_id = request.data.get('student_id')
        reason = request.data.get('reason', '')

        if not student_id:
            return Response({"error": "student_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        from attendance.models import PriorPermission
        from students.models import StudentProfile

        from attendance.services.prior_permission_scope import validate_prior_permissions
        validated = validate_prior_permissions([{"student_id": student_id, "reason": reason}], request.user, session.cohort, session.class_type, session.lst_batch)
        student, reason = validated[0]

        permission, created = PriorPermission.objects.get_or_create(
            session=session,
            student=student,
            defaults={
                "reason": reason,
                "granted_by": request.user
            }
        )

        if created:
            from attendance.tasks import sync_prior_permission_invitation
            def queue_invitation():
                try:
                    sync_prior_permission_invitation.delay(str(permission.pk))
                except Exception:
                    logger.warning("Could not queue prior-permission invitation")

            transaction.on_commit(queue_invitation)
            
        from attendance.services.discipline_reconciliation_service import reconcile_student_discipline_after_prior_permission
        reconcile_student_discipline_after_prior_permission(student, session)

        return Response({
            "message": "Prior permission granted.",
            "created": created
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='revoke-prior-permission', permission_classes=[IsAuthenticated, IsAdminVolunteerOrMentorStrict])
    def revoke_prior_permission(self, request, pk=None):
        """
        Revokes a prior permission for this session.
        """
        session = self.get_object()
        student_id = request.data.get('student_id')

        if not student_id:
            return Response({"error": "student_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        from attendance.models import PriorPermission

        deleted, _ = PriorPermission.objects.filter(session=session, student_id=student_id).delete()
        if deleted:
            # JSON revert and discipline are handled by PriorPermission post_delete signal
            return Response({"message": "Prior permission revoked."}, status=status.HTTP_200_OK)
        return Response({"error": "Prior permission not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], url_path='add-attendees', permission_classes=[IsAuthenticated, IsAdminVolunteerOrMentorStrict])
    def add_attendees(self, request, pk=None):
        """
        Dynamically whitelists external emails to a live class.
        Automatically deduplicates and safely triggers an async Google Calendar sync.
        """
        session = self.get_object()
        emails = request.data.get('emails', [])

        if not isinstance(emails, list):
            return Response({"error": "emails must be a list of strings"}, status=status.HTTP_400_BAD_REQUEST)

        from django.db import transaction

        with transaction.atomic():
            # Lock the session row to prevent race conditions during concurrent whitelist updates
            session = Attendance.objects.select_for_update().get(pk=self.get_object().pk)

            existing_emails = set([e.lower().strip() for e in (session.guest_emails or [])])
            new_emails = set([e.lower().strip() for e in emails if isinstance(e, str) and e.strip()])
            combined = list(existing_emails.union(new_emails))

            session.guest_emails = combined
            session.save(update_fields=['guest_emails'])

        # Update Google Calendar event if calendar_event_id exists
        if session.calendar_event_id:
            from attendance.services.google_meet_service import add_attendees_to_google_event
            add_attendees_to_google_event(session.calendar_event_id, combined)

        return Response({
            "message": "Attendees added and calendar synced.",
            "guest_emails": combined
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='generate-lst', permission_classes=[IsAuthenticated, IsVolunteerOrMentorOrAdmin])
    def generate_lst(self, request):
        """
        Manually generate an LST class for a specific batch.
        """
        if getattr(request.user, "role", "") == "VOLUNTEER" and not has_global_cohort_access(request.user):
            raise PermissionDenied("Global cohort access is required to schedule a batch-wide LST class.")
        lst_batch = request.data.get('lst_batch')
        title = request.data.get('title')
        class_date = request.data.get('class_date')
        start_time = request.data.get('start_time')
        end_time = request.data.get('end_time')
        guest_emails = request.data.get('whitelisted_guest_emails') or request.data.get('guest_emails', [])

        if not all([lst_batch, title, class_date, start_time, end_time]):
            return Response({"error": "Missing required fields. Please provide lst_batch, title, class_date, start_time, and end_time."}, status=status.HTTP_400_BAD_REQUEST)

        from attendance.services.attendee_resolver import AttendeeResolver
        from attendance.services.google_meet_service import generate_google_meet

        emails = AttendeeResolver.resolve_emails_by_criteria(class_type="LST", lst_batch=lst_batch)

        # Merge with guest emails and deduplicate
        if guest_emails:
            emails = list(set(emails + guest_emails))

        # 🚨 IDEMPOTENCY FIX: Prevent duplicate sessions during rapid double-clicks (Race Condition Lock)
        lock_key = f"lock:meet_generate:{title}:{class_date}:{start_time}"
        from django.core.cache import cache
        if not cache.add(lock_key, "locked", timeout=60):
            return Response(
                {"detail": "A scheduling request for this exact session is already in progress. Please wait."},
                status=status.HTTP_409_CONFLICT
            )

        try:
            # Also check if it was recently created (in case of a slow retry after lock expires)
            from attendance.models import Attendance
            from datetime import timedelta
            from django.utils import timezone
            two_mins_ago = timezone.now() - timedelta(minutes=2)
            existing_session = Attendance.objects.filter(
                title=title,
                class_date=class_date,
                start_time=start_time,
                conducted_by_id=request.user.id,
                created_at__gte=two_mins_ago
            ).first()

            if existing_session:
                return Response({
                    "session_id": str(existing_session.id),
                    "meeting_link": existing_session.meeting_link,
                    "calendar_event_id": existing_session.calendar_event_id,
                    "title": existing_session.title,
                    "batch": existing_session.lst_batch,
                    "scheduled_date": str(existing_session.class_date),
                    "scheduled_start_time": str(existing_session.start_time),
                    "attendee_count": existing_session.total_attendee_count or 0,
                    "duplicate": True
                }, status=status.HTTP_200_OK)

            target_date = datetime.strptime(class_date, "%Y-%m-%d").date()
            start_dt = timezone.make_aware(datetime.strptime(f"{class_date} {start_time}", "%Y-%m-%d %H:%M:%S"))
            end_dt = timezone.make_aware(datetime.strptime(f"{class_date} {end_time}", "%Y-%m-%d %H:%M:%S"))

            meet_link, event_id = generate_google_meet(title, start_dt, end_dt, attendee_emails=emails)

            session = Attendance.objects.create(
                class_type="LST",
                lst_batch=lst_batch,
                title=title,
                class_date=target_date,
                start_time=start_time,
                end_time=end_time,
                meeting_link=meet_link,
                calendar_event_id=event_id,
                conducted=True,
                conducted_by=request.user,
                guest_emails=guest_emails
            )

            # Dispatch ZeptoMail invitations based on user type
            if meet_link:
                try:
                    from common.tasks import send_async_session_invitations_task, send_async_guest_invitations_task
                    start_str = start_dt.strftime("%Y-%m-%d %I:%M %p")

                    # 1. Send to whitelisted guests (direct link email)
                    if guest_emails:
                        send_async_guest_invitations_task.delay(
                            recipient_emails=guest_emails,
                            session_title=title,
                            start_time_str=start_str,
                            meeting_link=meet_link,
                            session_id=str(session.id)
                        )

                    # 2. Send to regular LST students (Dashboard email, NO meet link)
                    guest_set = set(guest_emails) if guest_emails else set()
                    emails_normalized = [e.strip().lower() for e in emails if e and e.strip()]
                    student_emails = [e for e in emails_normalized if e not in guest_set]
                    if student_emails:
                        send_async_session_invitations_task.delay(
                            recipient_emails=student_emails,
                            session_title=title,
                            start_time_str=start_str,
                            meeting_link=None,
                            session_id=str(session.id)
                        )
                except Exception as e:
                    logger.error(f"Failed to queue ZeptoMail invitations for session {session.id}: {e}")

            # Bump admin cache version so the frontend sees the new class instantly
            from django.core.cache import cache
            try:
                cache.incr("attendance:version:admin")
            except ValueError:
                cache.set("attendance:version:admin", 2, timeout=None)

            # Fetch all emails that were invited and bump their per-user cache versions
            invited_emails = list(emails)
            if invited_emails:
                from django.contrib.auth import get_user_model
                from django.db.models.functions import Lower
                User = get_user_model()

                user_ids = User.objects.annotate(email_lower=Lower('email')) \
                                       .filter(email_lower__in=invited_emails) \
                                       .values_list('id', flat=True)

                for uid in user_ids:
                    try:
                        cache.incr(f"attendance:version:user_{uid}")
                    except ValueError:
                        cache.set(f"attendance:version:user_{uid}", 2, timeout=None)

            return Response({
                "session_id": str(session.id),
                "meeting_link": meet_link,
                "calendar_event_id": event_id,
                "title": title,
                "batch": lst_batch,
                "scheduled_date": class_date,
                "scheduled_start_time": start_time,
                "attendee_count": len(emails)
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.exception("Error generating LST manual meeting")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if 'lock_key' in locals():
                from django.core.cache import cache
                cache.delete(lock_key)

    @action(detail=False, methods=['post'], url_path='setup-lst-automation', permission_classes=[IsAuthenticated, IsAdmin])
    def setup_lst_automation(self, request):
        """
        Configure alternating LST automation.
        Creates/updates two RecurringSchedule records (BATCH_1 and BATCH_2) offset by 7 days.
        """
        first_sunday = request.data.get('first_sunday')
        start_time = request.data.get('start_time')
        end_time = request.data.get('end_time')
        starting_batch = request.data.get('starting_batch')
        is_paused = request.data.get('is_paused', False)

        if not all([first_sunday, start_time, end_time, starting_batch]):
            return Response({"error": "Missing required fields."}, status=status.HTTP_400_BAD_REQUEST)

        from attendance.models import RecurringSchedule
        from datetime import datetime, timedelta

        try:
            target_date = datetime.strptime(first_sunday, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        if target_date.weekday() != 6: # 0=Monday, 6=Sunday
            return Response({"error": "The selected date must be a Sunday."}, status=status.HTTP_400_BAD_REQUEST)

        # Batch 1 and 2 logic
        batch_1_date = target_date if starting_batch == "BATCH_1" else target_date + timedelta(days=7)
        batch_2_date = target_date if starting_batch == "BATCH_2" else target_date + timedelta(days=7)

        # Update or create Batch 1
        RecurringSchedule.objects.update_or_create(
            class_type="LST",
            lst_batch="BATCH_1",
            defaults={
                "start_time": start_time,
                "end_time": end_time,
                "next_run": datetime.combine(batch_1_date, datetime.strptime(start_time, "%H:%M:%S").time()),
                "frequency_days": 14,
                "is_paused": is_paused,
            }
        )

        # Update or create Batch 2
        RecurringSchedule.objects.update_or_create(
            class_type="LST",
            lst_batch="BATCH_2",
            defaults={
                "start_time": start_time,
                "end_time": end_time,
                "next_run": datetime.combine(batch_2_date, datetime.strptime(start_time, "%H:%M:%S").time()),
                "frequency_days": 14,
                "is_paused": is_paused,
            }
        )

        return Response({
            "message": "Alternating LST schedule configured successfully.",
            "next_batch_1": str(batch_1_date),
            "next_batch_2": str(batch_2_date)
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='toggle-lst-automation', permission_classes=[IsAuthenticated, IsAdmin])
    def toggle_lst_automation(self, request):
        """
        Toggle the is_paused state of the automated LST schedule globally.
        """
        is_paused = request.data.get('is_paused')

        if is_paused is None:
            return Response({"error": "Missing is_paused."}, status=status.HTTP_400_BAD_REQUEST)

        from attendance.models import RecurringSchedule
        schedules = RecurringSchedule.objects.filter(class_type="LST")

        if not schedules.exists():
            return Response({"error": "No LST recurring schedule found. Please configure it first."}, status=status.HTTP_404_NOT_FOUND)

        schedules.update(is_paused=is_paused)

        return Response({"message": f"Global LST Automation {'paused' if is_paused else 'resumed'}."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='get-lst-automation', permission_classes=[IsAuthenticated, IsAdmin])
    def get_lst_automation(self, request):
        """
        Fetch the current LST automation configuration.
        """
        from attendance.models import RecurringSchedule
        schedules = RecurringSchedule.objects.filter(class_type="LST").order_by('next_run')

        if not schedules.exists():
            return Response({"configured": False})

        # Determine the starting batch (the one with the earliest next_run)
        first_schedule = schedules.first()
        is_paused = schedules.filter(is_paused=False).count() == 0

        return Response({
            "configured": True,
            "is_paused": is_paused,
            "starting_batch": first_schedule.lst_batch,
            "first_sunday": first_schedule.next_run.date().isoformat(),
            "start_time": first_schedule.start_time.strftime("%H:%M:%S"),
            "end_time": first_schedule.end_time.strftime("%H:%M:%S"),
            "schedules": [
                {
                    "batch": s.lst_batch,
                    "next_run": s.next_run.date().isoformat()
                } for s in schedules
            ]
        })

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def warnings(self, request):
        try:
            profile = getattr(request.user, 'student_profile', None)
            if not profile:
                return Response([])
            from .models import AbsenceWarning
            warnings = AbsenceWarning.objects.filter(student=profile, resolved=False).select_related('session')
            data = []
            for w in warnings:
                data.append({
                    "id": w.id,
                    "session_title": w.session.title,
                    "class_date": w.session.class_date,
                    "status": w.status,
                    "apology_text": w.apology_text,
                })
            return Response(data)
        except Exception as e:
            logger.exception(f"Error fetching warnings: {e}")
            return Response([])



    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated], url_path='official-attendance')
    def official_attendance(self, request, pk=None):
        session = self.get_object()
        user = request.user
        role = getattr(user, 'role', '')

        # 1. Authorization
        if has_global_cohort_access(user) or role == 'VOLUNTEER':
            pass
        elif role == 'MENTOR':
            if session.class_type in ['LST', 'CELEBRATION'] and session.conducted_by != user:
                return Response({"detail": "Mentors cannot view LST or Celebration reports."}, status=status.HTTP_403_FORBIDDEN)
            elif session.class_type in ['DOMAIN', 'TRAINING']:
                # get_object already restricts mentors to assigned cohorts.
                # New mentor provisioning assigns the cohort relation directly.
                authorized_course_ids = [str(session.cohort.course_id)] if session.cohort else []

                # Verify mentor is authorized for this session's course
                if session.cohort and str(session.cohort.course_id) not in authorized_course_ids:
                    return Response({"detail": "Not authorized for this domain's report."}, status=status.HTTP_403_FORBIDDEN)

                # Extra check: if they request a specific course/domain/cohort scope, verify they own it
                scope = request.query_params.get('scope', 'all')
                if scope == 'course':
                    req_course = request.query_params.get('course_id')
                    if req_course and req_course not in authorized_course_ids:
                        return Response({"detail": "You are not authorized to filter by this course."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Students cannot access official attendance."}, status=status.HTTP_403_FORBIDDEN)

        # 2. Extract scope
        scope = request.query_params.get('scope', 'all')
        scope_id = None
        if scope == 'domain':
            scope_id = request.query_params.get('domain_id')
        elif scope == 'course':
            scope_id = request.query_params.get('course_id')
        elif scope == 'cohort':
            scope_id = request.query_params.get('cohort_id')

        # 3. Call Official Google Workspace Service or use cached data
        force_refresh = request.query_params.get('force_refresh') == 'true'
        if force_refresh:
            from django.core.cache import cache
            lock_key = f"manual_sync_lock_{session.id}"
            lock_acquired = cache.add(lock_key, "LOCKED", 300)

            if not lock_acquired:
                return Response({
                    "status": "SYNC_IN_PROGRESS",
                    "message": "Sync already in progress."
                }, status=status.HTTP_202_ACCEPTED)

            from attendance.tasks import manual_sync_meet_attendance_task
            manual_sync_meet_attendance_task.delay(str(session.id))
            
            return Response({
                "status": "SYNC_QUEUED",
                "message": "Identity sync started. You can continue working."
            }, status=status.HTTP_202_ACCEPTED)

        if session.google_meet_attendance_data and session.google_meet_attendance_data.get("status") in ["READY", "ATTENDANCE_FAILED"]:
            # In case the JSON snapshot is already ready or failed, use it to save API calls
            result = session.google_meet_attendance_data

            # The cached result might need filtering based on the requested scope
            if scope != 'all' and result.get("status") == "READY":
                # Clone result to avoid mutating the cached object for this response
                result = dict(result)

                if "expected_students" in result:
                    filtered_students = {}
                    for sid, sdata in result.get("expected_students", {}).items():
                        if scope == 'domain' and str(sdata.get('domain_id')) == str(scope_id):
                            filtered_students[sid] = sdata
                        elif scope == 'course' and str(sdata.get('course_id')) == str(scope_id):
                            filtered_students[sid] = sdata
                        elif scope == 'cohort' and str(sdata.get('cohort_id')) == str(scope_id):
                            filtered_students[sid] = sdata
                    result['expected_students'] = filtered_students

                    # For unmatched participants, they don't have deterministic cohort IDs.
                    # We check if the session itself belongs to the requested scope.
                    # If it does not explicitly match, we clear the unmatched_participants to avoid leakage.
                    session_in_scope = False
                    if scope == 'cohort' and session.cohort and str(session.cohort.id) == str(scope_id):
                        session_in_scope = True
                    elif scope == 'course' and session.cohort and str(session.cohort.course_id) == str(scope_id):
                        session_in_scope = True
                    elif scope == 'domain' and session.cohort and session.cohort.course and str(session.cohort.course.domain_id) == str(scope_id):
                        session_in_scope = True

                    if not session_in_scope:
                        result['unmatched_participants'] = []
                else:
                    filtered_participants = []
                    for p in result.get('participants', []):
                        if scope == 'domain' and str(p.get('domain_id')) == str(scope_id):
                            filtered_participants.append(p)
                        elif scope == 'course' and str(p.get('course_id')) == str(scope_id):
                            filtered_participants.append(p)
                        elif scope == 'cohort' and str(p.get('cohort_id')) == str(scope_id):
                            filtered_participants.append(p)
                    result['participants'] = filtered_participants
        else:
            from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
            result = RealMeetAttendanceService.get_structured_attendance(session, scope=scope, scope_id=scope_id)

            # Save the result globally if it is READY (ignoring scope filtering for the DB snapshot)
            if result.get("status") == "READY":
                full_result = RealMeetAttendanceService.get_structured_attendance(session, scope='all')
                if full_result.get("status") == "READY":
                    session.google_meet_attendance_data = full_result
                    participant_student_ids = []
                    if "expected_students" in full_result:
                        for s_id, s_data in full_result["expected_students"].items():
                            if s_data.get("status") in ["PRESENT", "BELOW_THRESHOLD"]:
                                participant_student_ids.append(s_id)
                    else:
                        for p in full_result.get('participants', []):
                            if p.get('student_id'):
                                participant_student_ids.append(p['student_id'])

                    if participant_student_ids:
                        session.attendees.add(*participant_student_ids)
                    session.save(update_fields=['google_meet_attendance_data'])

        if result.get("status") == "NOT_READY":
            return Response(result, status=status.HTTP_425_TOO_EARLY)
        elif result.get("status") == "ATTENDANCE_FAILED":
            return Response(result, status=status.HTTP_404_NOT_FOUND)
        elif result.get("status") == "CONFIG_ERROR":
            return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        elif result.get("status") == "ERROR":
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        # --- DYNAMIC ACCOUNT STATUS INJECTION ---
        if result and isinstance(result, dict) and "expected_students" in result:
            import copy
            result = copy.deepcopy(result)
            from applications.models import Application
            student_ids = list(result.get("expected_students", {}).keys())
            if student_ids:
                apps = Application.objects.filter(student_id__in=student_ids, assigned_cohort_id=session.cohort_id)
                status_map = {str(app.student_id): app.status for app in apps}
                for sid, sdata in result.get("expected_students", {}).items():
                    if sid in status_map:
                        sdata["account_status"] = status_map[sid]
        # ----------------------------------------

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def export_excel(self, request):
        """
        Exports formatted attendance spreadsheet with 12h AM/PM timestamps and student status.
        """
        cohort_id = request.query_params.get("cohort")
        qs = self.filter_queryset(self.get_queryset())

        filename_base = "sureproed_attendance_report"
        if cohort_id:
            qs = qs.filter(cohort_id=cohort_id)
            try:
                from cohorts.models import Cohort
                from django.utils import timezone
                import re
                cohort = Cohort.objects.get(id=cohort_id)
                course_name = cohort.course.name if cohort.course else ""
                cohort_code = cohort.name or cohort.code
                date_str = timezone.now().strftime('%Y-%m-%d')

                parts = []
                if course_name: parts.append(course_name)
                if cohort_code: parts.append(cohort_code)
                parts.append(date_str)

                if parts:
                    raw_filename = "_".join(parts)
                    safe_filename = re.sub(r'[\\/*?:"<>|]', '', raw_filename).strip().replace(' ', '_')
                    if len(safe_filename) > 100:
                        safe_filename = safe_filename[:100].strip('_')
                    if safe_filename:
                        filename_base = safe_filename
            except Exception:
                pass

        try:
            import openpyxl
            from openpyxl.styles import Alignment, Font, PatternFill
            from openpyxl.utils import get_column_letter

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Attendance Summary"

            # Title Header
            ws.merge_cells("A1:F1")
            title_cell = ws["A1"]
            title_cell.value = "Sure ProEd - Attendance Tracking Report"
            title_cell.font = Font(name="Calibri", size=16, bold=True, color="FFFFFF")
            title_cell.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
            title_cell.alignment = Alignment(horizontal="center", vertical="center")

            # Column Headers
            headers = ["Class Date", "Cohort Code", "Session Title", "Current Mentor", "Conducted By", "Present Count", "Notes"]
            ws.append([])  # Blank row 2
            ws.append(headers)

            header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
            header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

            for col_idx, header in enumerate(headers, 1):
                cell = ws.cell(row=3, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center", vertical="center")

            for att in qs:
                conducted_by_str = "N/A"
                if att.conducted_by:
                    conducted_by_str = att.conducted_by.get_full_name().strip() or att.conducted_by.email
                class_date_str = (
                    f"{att.class_date:%Y-%m-%d} {att.start_time:%I:%M %p}"
                    if att.class_date and att.start_time else ""
                )
                cohort_code = att.cohort.code if att.cohort else "N/A"

                # Do not use attendees.count() as the source of official attendance
                if att.google_meet_attendance_data and att.google_meet_attendance_data.get("status") == "READY":
                    data = att.google_meet_attendance_data
                    if "expected_students" in data:
                        present_cnt = sum(1 for s in data["expected_students"].values() if s.get("status") in ["PRESENT", "BELOW_THRESHOLD"])
                    else:
                        participants = data.get("participants", [])
                        present_cnt = len([p for p in participants if p.get("student_id")])
                else:
                    present_cnt = 0

                current_mentor_str = "N/A"
                if att.cohort and att.cohort.current_mentors.exists():
                    cm = att.cohort.current_mentors.first()
                    current_mentor_str = cm.get_full_name().strip() or cm.email

                ws.append([
                    class_date_str,
                    cohort_code,
                    att.title or "Regular Class Session",
                    current_mentor_str,
                    conducted_by_str,
                    present_cnt,
                    att.notes or "",
                ])

            # Auto-fit column widths
            for col in ws.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

            response = HttpResponse(
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            response["Content-Disposition"] = f'attachment; filename="{filename_base}.xlsx"'
            response["Access-Control-Expose-Headers"] = "Content-Disposition"
            wb.save(response)
            return response

        except ImportError:
            import csv
            # Fallback to CSV export if openpyxl is not installed
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
            writer = csv.writer(response)
            writer.writerow(["Class Date", "Cohort Code", "Session Title", "Current Mentor", "Conducted By", "Present Count", "Notes"])
            for att in qs:
                if att.google_meet_attendance_data and att.google_meet_attendance_data.get("status") == "READY":
                    data = att.google_meet_attendance_data
                    if "expected_students" in data:
                        present_cnt = sum(1 for s in data["expected_students"].values() if s.get("status") in ["PRESENT", "BELOW_THRESHOLD"])
                    else:
                        participants = data.get("participants", [])
                        present_cnt = len([p for p in participants if p.get("student_id")])
                else:
                    present_cnt = 0

                current_mentor_str = "N/A"
                if att.cohort and att.cohort.current_mentors.exists():
                    cm = att.cohort.current_mentors.first()
                    current_mentor_str = cm.get_full_name().strip() or cm.email

                writer.writerow([
                    f"{att.class_date:%Y-%m-%d} {att.start_time:%I:%M %p}" if att.class_date and att.start_time else "",
                    att.cohort.code if att.cohort else "N/A",
                    att.title or "Regular Class Session",
                    current_mentor_str,
                    att.conducted_by.get_full_name().strip() or att.conducted_by.email if att.conducted_by else "N/A",
                    present_cnt,
                    att.notes or "",
                ])
            return response

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated], url_path='official-attendance/download')
    def official_attendance_download(self, request, pk=None):
        session = self.get_object()
        user = request.user
        role = getattr(user, 'role', '')

        # 1. Authorization (same as structured API)
        if has_global_cohort_access(user) or role == 'VOLUNTEER':
            pass
        elif role == 'MENTOR':
            if session.class_type in ['LST', 'CELEBRATION'] and session.conducted_by != user:
                return Response({"detail": "Mentors cannot view LST or Celebration reports."}, status=status.HTTP_403_FORBIDDEN)
            elif session.class_type in ['DOMAIN', 'TRAINING']:
                is_authorized = False
                if session.cohort and session.cohort.mentors.filter(pk=user.pk).exists():
                    is_authorized = True
                if session.cohort and session.cohort.current_mentors.filter(pk=user.pk).exists():
                    is_authorized = True

                if not is_authorized:
                    return Response({"detail": "Not authorized for this domain's report."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Students cannot access official attendance."}, status=status.HTTP_403_FORBIDDEN)

        if not session.google_meet_attendance_data or session.google_meet_attendance_data.get("status") not in ["READY", "ATTENDANCE_FAILED"]:
            from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
            result = RealMeetAttendanceService.get_structured_attendance(session)
            if result.get("status") == "READY":
                session.google_meet_attendance_data = result
                participant_student_ids = []
                for s_id, data in result.get('expected_students', {}).items():
                    if data.get('status') == 'PRESENT':
                        participant_student_ids.append(s_id)
                if participant_student_ids:
                    session.attendees.add(*participant_student_ids)
                session.save(update_fields=['google_meet_attendance_data'])

            else:
                status_code = status.HTTP_202_ACCEPTED
                if result.get("status") in ["ERROR", "CONFIG_ERROR"]:
                    status_code = status.HTTP_400_BAD_REQUEST

                return Response(
                    {"detail": result.get("message", "Attendance data is pending. Please wait for Google to finalize the conference log.")},
                    status=status_code
                )

        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Detailed Attendance Report"

        ws.merge_cells("A1:Q1")
        title_cell = ws["A1"]
        title_cell.value = f"Attendance Report: {session.title}"
        title_cell.font = Font(name="Calibri", size=16, bold=True, color="FFFFFF")
        title_cell.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 30

        # 17-column table (Added Prior Approved + Account Status for discipline verification)
        headers = [
            "Sl.No", "Student ID", "Student Name", "Student Email",
            "Class Date", "Class Start Time", "Class End Time", "Class Duration",
            "Google Meet Join Time", "Google Meet Leave Time",
            "Active Duration", "Attendance %", "Status",
            "Portal Joined", "Portal Join Time",
            "Prior Approved", "Account Status"
        ]

        header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

        data = session.google_meet_attendance_data
        class_metrics = data.get("class_metrics", {})

        c_start = class_metrics.get("start_time", "")
        c_end = class_metrics.get("end_time", "")
        c_dur_sec = class_metrics.get("duration_seconds", 0)
        c_dur_str = f"{int(c_dur_sec // 60)} min {int(c_dur_sec % 60)} sec" if c_dur_sec else "N/A"

        class_date_str = f"{session.class_date:%Y-%m-%d}" if session.class_date else ""
        session_title = session.title or "Regular Class Session"

        red_fill = PatternFill(start_color="FFFFE2E2", end_color="FFFFE2E2", fill_type="solid")
        red_font = Font(name="Calibri", bold=True, color="FF991B1B")
        green_fill = PatternFill(start_color="FFDCFCE7", end_color="FFDCFCE7", fill_type="solid")
        green_font = Font(name="Calibri", bold=True, color="FF166534")

        # Expected Students — shallow copy so we don't mutate the cached DB object
        sl_no = 1
        expected_students = {k: dict(v) for k, v in (data.get("expected_students") or {}).items()}
        unmatched_participants = list(data.get("unmatched_participants") or [])

        # --- DYNAMIC ACCOUNT STATUS INJECTION ---
        if expected_students:
            from applications.models import Application
            student_ids = list(expected_students.keys())
            apps = Application.objects.filter(student_id__in=student_ids, assigned_cohort_id=session.cohort_id)
            status_map = {str(app.student_id): app.status for app in apps}
            for sid, sdata in expected_students.items():
                if sid in status_map:
                    sdata["account_status"] = status_map[sid]
        # ----------------------------------------

        # Pre-compute total_session_seconds from class_metrics for use in both official and guest rows
        total_session_seconds = c_dur_sec if c_dur_sec else 0
        if not total_session_seconds:
            # Fallback: compute from start/end strings
            try:
                from datetime import datetime as _dt
                if c_start and c_end:
                    _s = _dt.fromisoformat(str(c_start).replace('Z', '+00:00'))
                    _e = _dt.fromisoformat(str(c_end).replace('Z', '+00:00'))
                    total_session_seconds = max(0, (_e - _s).total_seconds())
            except Exception:
                total_session_seconds = 0

        # --- BACKWARD COMPATIBILITY / OLD SCHEMA FALLBACK ---
        if not expected_students and "participants" in data:
            expected_students = {}
            unmatched_participants = []

            # 1. Fetch expected apps
            if session.class_type == "DOMAIN":
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
            elif session.class_type == 'SOFTSKILLS':
                active_statuses = ["SOFT_SKILLS"]
            else:
                active_statuses = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]

            from applications.models import Application, Cohort
            expected_apps = Application.objects.select_related('student__user', 'course', 'assigned_cohort').filter(
                status__in=active_statuses,
                student__user__email__isnull=False
            )

            if session.class_type == "DOMAIN":
                expected_apps = expected_apps.exclude(assigned_cohort__status=Cohort.Status.SOFT_SKILLS)

            if session.cohort:
                expected_apps = expected_apps.filter(assigned_cohort=session.cohort)
            elif session.lst_batch:
                expected_apps = expected_apps.filter(training_batch=session.lst_batch)

            roster_email = {}
            roster_name = {}

            for app in expected_apps:
                u = app.student.user
                email = u.email.strip().lower() if u.email else ""
                name = f"{u.first_name} {u.last_name}".strip().lower()

                if email: roster_email[email] = app
                if name: roster_name[name] = app

                s_id = str(app.student.id)
                expected_students[s_id] = {
                    "student_id": s_id,
                    "name": f"{u.first_name} {u.last_name}".strip(),
                    "email": email,
                    "course_id": app.course.name if app.course else "N/A",
                    "cohort_id": app.assigned_cohort.code if app.assigned_cohort else "N/A",
                    "status": "ABSENT",
                    "join_time": None,
                    "leave_time": None,
                    "duration_seconds": 0,
                    "attendance_percentage": 0,
                    "_intervals": []
                }

            for p in data.get("participants", []):
                p_email = p.get("email")
                p_email = p_email.strip().lower() if p_email else ""
                p_name = p.get("name")
                p_name = p_name.strip().lower() if p_name else ""

                matched_app = None

                if p_email and p_email in roster_email:
                    matched_app = roster_email[p_email]
                elif p_name and p_name in roster_name:
                    matched_app = roster_name[p_name]


                if matched_app:
                    s_id = str(matched_app.student.id)
                    jt_str = p.get("join_time")
                    lt_str = p.get("leave_time")
                    if jt_str and lt_str:
                        from datetime import datetime
                        try:
                            jt = datetime.fromisoformat(jt_str.replace('Z', '+00:00'))
                            lt = datetime.fromisoformat(lt_str.replace('Z', '+00:00'))
                            expected_students[s_id]["_intervals"].append((jt, lt))
                        except:
                            pass
                else:
                    unmatched_participants.append(p)

            from django.utils import timezone
            from datetime import datetime

            c_start_str = class_metrics.get("start_time")
            c_end_str = class_metrics.get("end_time")
            try:
                if c_start_str:
                    d_start = datetime.fromisoformat(c_start_str.replace('Z', '+00:00'))
                else:
                    # fallback
                    d_start = timezone.make_aware(datetime.combine(session.class_date, session.start_time)) if session.class_date and session.start_time else timezone.now()

                # Fallback duration calculation
                if session.class_status == "COMPLETED" and session.end_time:
                    d_end = timezone.make_aware(datetime.combine(session.class_date, session.end_time))
                    if d_end < d_start:
                        from datetime import timedelta
                        d_end += timedelta(days=1)
                else:
                    d_end = timezone.now()
                total_session_seconds = max(0, (d_end - d_start).total_seconds())

                # UPDATE string formats for row output
                if not c_start:
                    c_start = d_start.isoformat()
                if not c_end:
                    c_end = d_end.isoformat()
                if c_dur_sec == 0:
                    c_dur_str = f"{int(total_session_seconds // 60)} min {int(total_session_seconds % 60)} sec"
            except:
                total_session_seconds = session.duration.total_seconds() if hasattr(session.duration, 'total_seconds') else 3600
                if c_dur_sec == 0:
                    c_dur_str = f"{int(total_session_seconds // 60)} min {int(total_session_seconds % 60)} sec"

            for s_id, s_data in expected_students.items():
                intervals = s_data.pop("_intervals", [])
                if intervals:
                    intervals.sort(key=lambda x: x[0])
                    merged = [intervals[0]]
                    for curr in intervals[1:]:
                        last = merged[-1]
                        if curr[0] <= last[1]:
                            merged[-1] = (last[0], max(last[1], curr[1]))
                        else:
                            merged.append(curr)

                    join_t = merged[0][0]
                    leave_t = max(i[1] for i in merged)
                    active_dur = sum((end - start).total_seconds() for start, end in merged)

                    s_data["join_time"] = join_t.isoformat()
                    s_data["leave_time"] = leave_t.isoformat()
                    s_data["duration_seconds"] = int(active_dur)
                    s_data["attendance_percentage"] = min(100.0, round((active_dur / total_session_seconds) * 100, 2)) if total_session_seconds > 0 else 0
                    s_data["status"] = "PRESENT"

        # ---- Build counts for CLASS SUMMARY (computed from the now-reconciled data) ----
        total_students = len(expected_students)
        present_count = sum(1 for s in expected_students.values() if s.get("status") == "PRESENT")
        below_threshold_count = sum(
            1 for s in expected_students.values()
            if s.get("attendance_percentage", 0) < 96 and s.get("status") != "ABSENT"
        )
        absent_count = sum(1 for s in expected_students.values() if s.get("status") == "ABSENT")
        whitelisted_count = len([p for p in unmatched_participants
                                 if (p.get("email") or "").strip().lower() in
                                 {e.strip().lower() for e in (getattr(session, 'guest_emails', None) or []) if e}])

        # ---- Resolve summary metadata from real DB fields ----
        course_display = "N/A"
        if session.course and getattr(session.course, 'name', None):
            course_display = session.course.name
        elif session.cohort and getattr(session.cohort, 'course', None) and getattr(session.cohort.course, 'name', None):
            course_display = session.cohort.course.name
        elif session.title:
            course_display = session.title

        cohort_display = "N/A"
        if session.cohort:
            cohort_display = getattr(session.cohort, 'code', None) or getattr(session.cohort, 'name', None) or str(session.cohort)
        elif session.lst_batch:
            cohort_display = session.get_lst_batch_display() if hasattr(session, 'get_lst_batch_display') else session.lst_batch

        mentor_display = "Not Assigned"
        if session.cohort and session.cohort.current_mentors.exists():
            mentor = session.cohort.current_mentors.first()
            full = mentor.get_full_name().strip() if hasattr(mentor, 'get_full_name') else ""
            email = getattr(mentor, 'email', '')
            mentor_display = f"{full} ({email})".strip() if full else (email or "N/A")
            role = getattr(mentor, 'role', '')
            if role:
                mentor_display += f" [{role}]"
        elif getattr(session, 'conducted_by', None):
            full = session.conducted_by.get_full_name().strip() if hasattr(session.conducted_by, 'get_full_name') else ""
            email = getattr(session.conducted_by, 'email', '')
            role  = getattr(session.conducted_by, 'role', '')
            mentor_display = f"{full} ({email})".strip() if full else (email or "N/A")
            if role:
                mentor_display += f" [{role}]"

        conducted_by_display = "N/A"
        if session.conducted_by:
            full = session.conducted_by.get_full_name().strip() if hasattr(session.conducted_by, 'get_full_name') else ""
            email = getattr(session.conducted_by, 'email', '')
            role  = getattr(session.conducted_by, 'role', '')
            conducted_by_display = f"{full} ({email})".strip() if full else (email or "N/A")
            if role:
                conducted_by_display += f"  [{role}]"

        meet_link_display = session.meeting_link or "N/A"

        # Format Google timings for summary (IST-friendly display)
        from datetime import datetime as _dt
        from zoneinfo import ZoneInfo
        _IST = ZoneInfo('Asia/Kolkata')
        def _fmt_dt(iso_str):
            """Format an ISO datetime string to a readable IST time."""
            if not iso_str:
                return "N/A"
            try:
                dt = _dt.fromisoformat(str(iso_str).replace('Z', '+00:00'))
                dt_ist = dt.astimezone(_IST)
                return dt_ist.strftime('%d %b %Y  %I:%M %p IST')
            except Exception:
                return str(iso_str)

        summary_start = _fmt_dt(c_start)
        summary_end = _fmt_dt(c_end)
        summary_dur = c_dur_str if c_dur_str and c_dur_str != "N/A" else (
            f"{int(total_session_seconds // 60)} min {int(total_session_seconds % 60)} sec"
            if total_session_seconds else "N/A"
        )

        # ---- Emit CLASS SUMMARY block ----
        label_font   = Font(name="Calibri", size=10, bold=True, color="1E3A8A")
        value_font   = Font(name="Calibri", size=10)
        divider_font = Font(name="Calibri", size=9, italic=True, color="6B7280")
        section_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        section_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        NUM_COLS = len(headers)  # 13

        def _summary_row(label, value, bold_value=False):
            """Append a two-cell label/value row spanning the full table width."""
            ws.append([""] * NUM_COLS)
            r = ws.max_row
            ws.cell(row=r, column=1).value = label
            ws.cell(row=r, column=1).font = label_font
            ws.cell(row=r, column=1).alignment = Alignment(horizontal="left", vertical="center", indent=1)
            ws.cell(row=r, column=3).value = value
            fnt = Font(name="Calibri", size=10, bold=bold_value)
            ws.cell(row=r, column=3).font = fnt
            ws.cell(row=r, column=3).alignment = Alignment(horizontal="left", vertical="center")
            ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=NUM_COLS)

        def _section_heading(text):
            ws.append([""] * NUM_COLS)
            r = ws.max_row
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=NUM_COLS)
            ws.cell(row=r, column=1).value = text
            ws.cell(row=r, column=1).font = section_font
            ws.cell(row=r, column=1).fill = section_fill
            ws.cell(row=r, column=1).alignment = Alignment(horizontal="left", vertical="center", indent=1)
            ws.row_dimensions[r].height = 20

        def _blank():
            ws.append([""] * NUM_COLS)

        # --- Blank row between title and summary ---
        _blank()

        _section_heading("CLASS SUMMARY")
        _summary_row("Course / Domain",   course_display)
        _summary_row("Cohort / Group",    cohort_display)
        _summary_row("Mentor / Trainer",  mentor_display)
        _summary_row("Class Date",        class_date_str)
        _summary_row("Google Meet Start",  summary_start)
        _summary_row("Google Meet End",    summary_end)
        _summary_row("Google Meet Duration", summary_dur)
        _blank()
        _summary_row("Total Students",     total_students)
        _summary_row("Present",            present_count)
        _summary_row("Below Threshold (<96%)", below_threshold_count)
        _summary_row("Absent",             absent_count)
        _summary_row("Whitelisted Guests", whitelisted_count)
        _blank()
        _summary_row("Scheduled / Created By", conducted_by_display)
        _summary_row("Google Meet Link",   meet_link_display)
        _blank()

        # ---- OFFICIAL STUDENT ATTENDANCE section heading ----
        _section_heading("OFFICIAL STUDENT ATTENDANCE")
        _blank()

        # ---- Column headers for student table ----
        ws.append(headers)
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=ws.max_row, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # Pre-fetch real application statuses and student codes from DB
        from applications.models import Application
        from students.models import StudentProfile
        student_ids = list(expected_students.keys())
        app_status_lookup = {}
        student_code_lookup = {}
        if student_ids:
            app_qs = Application.objects.filter(
                student_id__in=student_ids
            ).values_list('student_id', 'status')
            for sid, app_st in app_qs:
                app_status_lookup[str(sid)] = app_st

            code_qs = StudentProfile.objects.filter(
                id__in=student_ids
            ).values_list('id', 'student_code')
            for sid, scode in code_qs:
                student_code_lookup[str(sid)] = scode or str(sid)

        # Pre-fetch prior permissions for this session (for green highlighting)
        from attendance.models import PriorPermission
        prior_permission_ids = set(
            str(sid) for sid in
            PriorPermission.objects.filter(session=session).values_list('student_id', flat=True)
        )

        for s_id, s_data in expected_students.items():
            duration = s_data.get("duration_seconds", 0)
            minutes = int(duration // 60)
            seconds = int(duration % 60)
            duration_str = f"{minutes} min {seconds} sec" if duration > 0 else "0 sec"

            attendance_percentage = s_data.get("attendance_percentage", 0)
            real_app_status = s_data.get("account_status", app_status_lookup.get(s_id, ""))
            has_prior_permission = s_id in prior_permission_ids or s_data.get("status") in ["PRIOR_PERMISSION", "PRIOR PERMISSION"]

            # Determine status string
            if has_prior_permission:
                status_str = "PRIOR PERMISSION"
            elif s_data.get("status") == "IDENTITY_REVIEW_REQUIRED":
                status_str = "IDENTITY REVIEW REQUIRED"
            elif real_app_status == "SUSPENDED":
                status_str = "ACCOUNT SUSPENDED"
            elif attendance_percentage < 96 and s_data.get("status") != "ABSENT":
                status_str = "SUSPENSION PENDING"
            else:
                status_str = s_data.get("status", "ABSENT")

            # Use human-readable student_code instead of UUID
            display_student_id = student_code_lookup.get(s_id, s_id)

            portal_joined_time = session.portal_join_logs.get(s_id)
            portal_joined = "Yes" if portal_joined_time else "No"

            row = [
                sl_no,
                display_student_id,
                s_data.get("name", "N/A"),
                s_data.get("email", "N/A"),
                class_date_str,
                c_start,
                c_end,
                c_dur_str,
                s_data.get("join_time") or "",
                s_data.get("leave_time") or "",
                duration_str,
                f"{attendance_percentage}%",
                status_str,
                portal_joined,
                portal_joined_time or "N/A",
                "Y" if has_prior_permission else "N",
                real_app_status or "N/A"
            ]
            ws.append(row)

            # Color coding: Green=Prior Permission, Red=Absent/Suspended/Pending Suspension
            row_len = len(row) + 1
            if has_prior_permission:
                for col_idx in range(1, row_len):
                    ws.cell(row=ws.max_row, column=col_idx).fill = green_fill
                    ws.cell(row=ws.max_row, column=col_idx).font = green_font
            elif real_app_status == "SUSPENDED" or s_data.get("status") == "ABSENT" or attendance_percentage < 96:
                for col_idx in range(1, row_len):
                    ws.cell(row=ws.max_row, column=col_idx).fill = red_fill
                    ws.cell(row=ws.max_row, column=col_idx).font = red_font
            sl_no += 1

        whitelisted_participants = []
        unauthorized_participants = []
        guest_emails_raw = getattr(session, 'guest_emails', None) or []
        whitelist_emails = {e.strip().lower() for e in guest_emails_raw if e and e.strip()}

        # unmatched_participants is already populated from the correct schema source above.
        # Classify each as WHITELISTED GUEST (email in session.guest_emails) or EXTERNAL / UNAUTHORIZED.
        # If Google did not expose the participant email (email = "N/A" / empty), we cannot
        # reliably identify them as whitelisted, so they are treated as EXTERNAL / UNAUTHORIZED.
        for p in unmatched_participants:
            p_email = (p.get("email") or "").strip().lower()
            is_whitelisted = bool(p_email and p_email not in ("n/a", "") and p_email in whitelist_emails)
            if is_whitelisted:
                whitelisted_participants.append(p)
            else:
                unauthorized_participants.append(p)

        def render_section(title, p_list, default_status):
            if not p_list:
                return
            for _ in range(5):
                ws.append([])
            ws.append([title])
            ws.merge_cells(start_row=ws.max_row, start_column=1, end_row=ws.max_row, end_column=len(headers))
            ws.cell(row=ws.max_row, column=1).font = Font(bold=True, color="1E3A8A")
            ws.cell(row=ws.max_row, column=1).alignment = Alignment(horizontal="center")

            ws.append(headers)
            for col_idx, header in enumerate(headers, 1):
                cell = ws.cell(row=ws.max_row, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center", vertical="center")

            ext_sl = 1
            for u_data in p_list:
                duration = u_data.get("duration_seconds", 0)
                minutes = int(duration // 60)
                seconds = int(duration % 60)
                duration_str = f"{minutes} min {seconds} sec" if duration > 0 else "0 sec"

                u_email = u_data.get("email")
                u_email_str = u_email if u_email else "N/A"

                attendance_percentage = u_data.get("attendance_percentage", 0)
                if attendance_percentage == 0 and duration > 0 and total_session_seconds > 0:
                    attendance_percentage = min(100.0, round((duration / total_session_seconds) * 100, 2))

                ws.append([
                    ext_sl,
                    "N/A",
                    u_data.get("name", "Anonymous"),
                    u_email_str,
                    class_date_str,
                    c_start,
                    c_end,
                    c_dur_str,
                    u_data.get("join_time") or "",
                    u_data.get("leave_time") or "",
                    duration_str,
                    f"{attendance_percentage}%",
                    default_status,
                    "No",
                    "N/A"
                ])

                if default_status == "IDENTITY NOT RESOLVED":
                    ws.cell(row=ws.max_row, column=3).font = red_font
                    ws.cell(row=ws.max_row, column=13).font = red_font

                ext_sl += 1

        render_section("--- WHITELISTED / ADDITIONAL GOOGLE PARTICIPANTS ---", whitelisted_participants, "WHITELISTED / PRESENT")
        render_section("--- UNRESOLVED GOOGLE PARTICIPANTS ---", unauthorized_participants, "IDENTITY NOT RESOLVED")

        for col in ws.columns:
            col_letter = get_column_letter(col[0].column)
            if col_letter == 'A':
                ws.column_dimensions[col_letter].width = 8
            else:
                max_len = 0
                for cell in col:
                    val_str = str(cell.value or '')
                    # Ignore merged/title headers that span multiple columns
                    if not val_str.startswith("---") and not val_str.startswith("Attendance Report:"):
                        max_len = max(max_len, len(val_str))
                ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        from django.http import HttpResponse
        import re

        if session.class_type in ["LST", "SOFTSKILLS", "CELEBRATION", "UNIVERSAL"]:
            raw_title = session.title or f"{session.class_type} Session"
            safe_filename = re.sub(r'[\\/*?:"<>|]', '', raw_title).strip()
            if not safe_filename:
                safe_filename = "Session"
            filename = f"{safe_filename}.xlsx"
        else:
            parts = []
            if session.cohort:
                if session.cohort.course and session.cohort.course.name:
                    parts.append(session.cohort.course.name)
                cohort_identifier = session.cohort.name or session.cohort.code
                if cohort_identifier:
                    parts.append(cohort_identifier)
            elif session.title:
                parts.append(session.title)

            if not parts:
                parts.append("Session")

            date_str = session.class_date.strftime('%Y-%m-%d') if session.class_date else "UnknownDate"
            parts.append(date_str)

            raw_filename = "_".join(parts)
            safe_filename = re.sub(r'[\\/*?:"<>|]', '', raw_filename).strip()
            safe_filename = safe_filename.replace(' ', '_')

            if len(safe_filename) > 100:
                safe_filename = safe_filename[:100].strip('_')

            filename = f"{safe_filename}.xlsx"

        from io import BytesIO
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Access-Control-Expose-Headers"] = "Content-Disposition"
        return response
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def chat_history(self, request):
        warning_id = request.query_params.get("warning_id")
        if not warning_id:
            return Response({"detail": "warning_id required"}, status=400)

        from .models import AbsenceWarning, PermissionRequestMessage
        try:
            warning = AbsenceWarning.objects.select_related('student__user').get(id=warning_id)
            user = request.user

            is_authorized = False
            if has_global_cohort_access(user) or can_manage_cohort(user, warning.session.cohort):
                is_authorized = True
            elif warning.student.user == user:
                is_authorized = True

            if not is_authorized:
                return Response({"detail": "Unauthorized"}, status=403)

            messages = PermissionRequestMessage.objects.filter(warning=warning).select_related('sender').order_by('created_at')
            data = []
            for msg in messages:
                data.append({
                    "message_id": str(msg.id),
                    "message": msg.message,
                    "sender_id": str(msg.sender.id),
                    "sender_name": f"{msg.sender.first_name} {msg.sender.last_name}",
                    "timestamp": msg.created_at.isoformat()
                })
            return Response(data)
        except AbsenceWarning.DoesNotExist:
            return Response({"detail": "Warning not found"}, status=404)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def resolve_warning(self, request):
        try:
            warning_id = request.data.get("warning_id")
            apology_text = request.data.get("apology_text")
            from .models import AbsenceWarning
            warning = AbsenceWarning.objects.get(id=warning_id, student__user=request.user)
            if apology_text:
                warning.apology_text = apology_text
                warning.status = 'APOLOGIZED'
                warning.save()
                return Response({"detail": "Apology submitted. Waiting for admin approval."})

            warning.resolved = True
            warning.status = 'ACCEPTED'
            warning.save()
            return Response({"detail": "Resolved"})
        except Exception as e:
            return Response({"detail": str(e)}, status=400)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def admin_queries(self, request):
        if not getattr(request.user, 'role', '') in ['ADMIN', 'VOLUNTEER', 'TRUSTEE']:
            return Response({"detail": "Unauthorized"}, status=403)
        from .models import AbsenceWarning
        from .serializers import AbsenceWarningSerializer
        qs = AbsenceWarning.objects.exclude(status='PENDING').select_related('session__cohort', 'student__user').order_by('-created_at', '-id', '-id')
        if not has_global_cohort_access(request.user):
            qs = qs.filter(session__cohort_id__in=assigned_cohort_ids(request.user))
        serializer = AbsenceWarningSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def admin_update_query(self, request):
        if not getattr(request.user, 'role', '') in ['ADMIN', 'VOLUNTEER', 'TRUSTEE']:
            return Response({"detail": "Unauthorized"}, status=403)
        warning_id = request.data.get("warning_id")
        action = request.data.get("action")
        from .models import AbsenceWarning
        try:
            warning = AbsenceWarning.objects.get(id=warning_id)
            if not (has_global_cohort_access(request.user) or can_manage_cohort(request.user, warning.session.cohort)):
                return Response({"detail": "Unauthorized"}, status=403)
            if action == 'ACCEPT':
                warning.status = 'ACCEPTED'
                warning.resolved = True
            elif action == 'REJECT':
                warning.status = 'REJECTED'
            warning.save()
            return Response({"detail": f"Query {action}ED."})
        except Exception as e:
            return Response({"detail": str(e)}, status=400)

    @action(detail=False, methods=['post'], url_path='request-permission', permission_classes=[IsAuthenticated])
    def request_permission(self, request):
        user = request.user
        if getattr(user, 'role', '') != 'STUDENT' or not hasattr(user, 'student_profile'):
            return Response({"detail": "Only students can request permission."}, status=403)

        session_id = request.data.get("session_id")
        reason = request.data.get("reason")
        if not session_id or not reason:
            return Response({"detail": "session_id and reason are required."}, status=400)

        from attendance.models import Attendance, AbsenceWarning, PermissionRequestMessage
        from django.utils import timezone
        import datetime

        try:
            session = Attendance.objects.get(id=session_id)
        except Attendance.DoesNotExist:
            return Response({"detail": "Session not found."}, status=404)

        data = session.google_meet_attendance_data
        is_ready = data and data.get("status") == "READY"

        if not is_ready:
            # Active session late-join request path
            if session.class_status in ['COMPLETED', 'ENDED']:
                return Response({"detail": "Session has ended, but attendance data is not yet ready. Please wait."}, status=400)

            # Server-side time verification
            now = timezone.localtime(timezone.now())

            if isinstance(session.class_date, datetime.date):
                session_date = session.class_date
            elif isinstance(session.class_date, str):
                session_date = datetime.datetime.strptime(session.class_date, "%Y-%m-%d").date()
            else:
                return Response({"detail": "Invalid class date format."}, status=400)

            if isinstance(session.start_time, datetime.time):
                start_time = session.start_time
            elif isinstance(session.start_time, str):
                start_time = datetime.datetime.strptime(session.start_time, "%H:%M:%S").time()
            else:
                return Response({"detail": "Invalid start time format."}, status=400)

            class_start = timezone.make_aware(datetime.datetime.combine(session_date, start_time))

            if session.end_time:
                if isinstance(session.end_time, datetime.time):
                    end_time = session.end_time
                else:
                    end_time = datetime.datetime.strptime(session.end_time, "%H:%M:%S").time()
                class_end = timezone.make_aware(datetime.datetime.combine(session_date, end_time))
            else:
                class_end = class_start + datetime.timedelta(hours=2)

            if class_end < class_start:
                class_end = class_end + datetime.timedelta(days=1)

            if now < class_start:
                return Response({"detail": "Session has not started yet. You can join without permission during the open window."}, status=400)

            if now > class_end:
                return Response({"detail": "Session is completely over. Please wait for attendance data to be ready before requesting permission."}, status=400)

            # Check authorization for active class
            is_authorized = session.attendees.filter(user=user).exists()
            if not is_authorized and session.cohort:
                is_authorized = user.student_profile.applications.filter(assigned_cohort=session.cohort).exists()

            if not is_authorized:
                return Response({"detail": "You are not an expected student in this session."}, status=403)

        else:
            # Completed session absence request path
            s_id = str(user.student_profile.id)
            expected = data.get("expected_students", {})
            s_data = expected.get(s_id)

            if not s_data:
                return Response({"detail": "You are not an expected student in this session."}, status=400)

        warning = AbsenceWarning.objects.filter(student=user.student_profile, session=session).first()
        if not warning:
            warning = AbsenceWarning.objects.create(student=user.student_profile, session=session, status="PENDING")

        if PermissionRequestMessage.objects.filter(warning=warning, sender=user).exists():
            return Response({"detail": "You have already submitted a permission request."}, status=400)

        msg = PermissionRequestMessage.objects.create(
            warning=warning,
            sender=user,
            message=reason
        )

        warning.status = 'APOLOGIZED'
        warning.apology_text = reason
        warning.apology_submitted_at = timezone.now()
        warning.save(update_fields=['status', 'apology_text', 'apology_submitted_at'])

        title = "New Permission Request"
        student_name = user.get_full_name() or getattr(user.student_profile, 'name', "A student")
        cohort_code = getattr(session.cohort, 'code', getattr(session, 'lst_batch', "Unknown Cohort"))
        message_body = f"{student_name} submitted a permission request for {cohort_code}."

        from common.models import Notification
        from common.services.notifications import notify_mentors

        if session.cohort:
            notify_mentors(
                cohort=session.cohort,
                title=title,
                message=message_body,
                notification_type=Notification.Type.ACTION_REQUIRED,
                action_url=f"/attendance/{session.id}"
            )

        return Response({"detail": "Permission request submitted successfully."})

    @action(detail=False, methods=['post'], url_path='warnings/create', permission_classes=[IsAuthenticated])
    def create_warning(self, request):
        """
        Manually trigger an absence warning for a student for a specific session.
        Payload: { "student_id": "uuid", "session_id": "uuid", "reason": "optional text" }
        """
        user = request.user
        if getattr(user, 'role', '') not in ["ADMIN", "VOLUNTEER", "MENTOR"]:
            return Response({"detail": "Permission denied"}, status=403)

        student_id = request.data.get("student_id")
        session_id = request.data.get("session_id")

        if not student_id or not session_id:
            return Response({"detail": "student_id and session_id are required"}, status=400)

        from attendance.models import Attendance, AbsenceWarning
        from students.models import StudentProfile

        try:
            session = Attendance.objects.get(id=session_id)
            student = StudentProfile.objects.get(id=student_id)
        except (Attendance.DoesNotExist, StudentProfile.DoesNotExist):
            return Response({"detail": "Session or Student not found"}, status=404)

        if not (has_global_cohort_access(user) or can_manage_cohort(user, session.cohort)):
            return Response({"detail": "You do not have permission to manage this cohort"}, status=403)

        warning, created = AbsenceWarning.objects.get_or_create(
            student=student,
            session=session,
            defaults={"status": "PENDING"}
        )

        if not created:
            return Response({"detail": "Warning already exists for this student and session"}, status=400)

        # Try to send notification
        try:
            from common.models import Notification
            Notification.objects.create(
                user=student.user,
                title="Absence Warning Issued",
                message=f"You have been issued a warning for missing the session: {session.title}.",
                notification_type="WARNING",
                action_url=f"/student/warnings"
            )
        except Exception as e:
            logger.error(f"Failed to send warning notification: {e}")

        return Response({"detail": "Warning created successfully", "warning_id": warning.id}, status=201)

    @action(detail=False, methods=['get'], url_path='alerts/low', permission_classes=[IsAuthenticated, IsVolunteerOrMentorOrAdmin])
    def low_attendance_alerts(self, request):
        from attendance.models import AbsenceWarning
        from attendance.serializers import AbsenceWarningSerializer
        from cohorts.models import Cohort
        from datetime import timedelta
        from django.utils import timezone
        from django.db.models import Q

        user = request.user
        cutoff = timezone.now() - timedelta(days=21)
        qs = AbsenceWarning.objects.filter(
            status="PENDING", 
            session__class_date__gte=cutoff
        ).select_related("student__user", "session__cohort")

        if getattr(user, 'role', '') == 'VOLUNTEER' and not getattr(user, 'has_all_cohorts_access', False):
            # Scope to cohorts the volunteer is assigned to
            allowed_cohorts = Cohort.objects.filter(Q(mentors=user) | Q(volunteers=user))
            qs = qs.filter(session__cohort__in=allowed_cohorts)
            
        course_id = request.query_params.get('course')
        cohort_id = request.query_params.get('cohort')
        search = request.query_params.get('search')
        
        if course_id:
            qs = qs.filter(session__cohort__course_id=course_id)
        if cohort_id:
            qs = qs.filter(session__cohort_id=cohort_id)
        if search:
            qs = qs.filter(
                Q(student__user__first_name__icontains=search) |
                Q(student__user__last_name__icontains=search) |
                Q(student__user__email__icontains=search)
            )

        serializer = AbsenceWarningSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='dashboard-alerts', permission_classes=[IsAuthenticated, IsVolunteerOrMentorOrAdmin])
    def dashboard_alerts(self, request):
        from attendance.models import AbsenceWarning, Attendance
        from attendance.serializers import AbsenceWarningSerializer, AttendanceSerializer
        from cohorts.models import Cohort
        from datetime import timedelta
        from django.utils import timezone
        from django.db.models import Q
        
        user = request.user
        cutoff = timezone.now() - timedelta(days=21)
        warnings_qs = AbsenceWarning.objects.filter(
            status="PENDING", 
            resolved=False,
            session__class_date__gte=cutoff
        ).select_related("student__user", "session__cohort")
        sessions_qs = Attendance.objects.filter(class_status="COMPLETED", class_date__gte=cutoff)
        
        if getattr(user, 'role', '') == 'VOLUNTEER' and not getattr(user, 'has_all_cohorts_access', False):
            allowed_cohorts = Cohort.objects.filter(Q(mentors=user) | Q(volunteers=user))
            warnings_qs = warnings_qs.filter(session__cohort__in=allowed_cohorts)
            sessions_qs = sessions_qs.filter(cohort__in=allowed_cohorts)
            
        course_id = request.query_params.get('course')
        cohort_id = request.query_params.get('cohort')
        search = request.query_params.get('search')
        
        if course_id:
            warnings_qs = warnings_qs.filter(session__cohort__course_id=course_id)
            sessions_qs = sessions_qs.filter(cohort__course_id=course_id)
        if cohort_id:
            warnings_qs = warnings_qs.filter(session__cohort_id=cohort_id)
            sessions_qs = sessions_qs.filter(cohort_id=cohort_id)
        if search:
            warnings_qs = warnings_qs.filter(
                Q(student__user__first_name__icontains=search) |
                Q(student__user__last_name__icontains=search) |
                Q(student__user__email__icontains=search)
            )
            
        # 1 & 2. Warnings & Suspensions (already computed by discipline service, so we just return them)
        all_warnings = warnings_qs.all()
        
        # Determine discipline status: < 96% = suspension under unified policy
        suspensions = []
        warnings = []
        
        for w in all_warnings:
            pct = 0
            student_data = w.session.google_meet_attendance_data.get('expected_students', {}).get(str(w.student_id))
            if student_data:
                pct = student_data.get('attendance_percentage', 0)
            
            # Use serializer for consistent output formatting
            w_data = AbsenceWarningSerializer(w).data
            w_data["actual_percentage"] = pct
            
            if pct < 96:
                suspensions.append(w_data)
            else:
                warnings.append(w_data)
                
        # 3. Identity Reviews (sessions with unmatched participants)
        identity_reviews = []
        for s in sessions_qs.order_by("-class_date", "-start_time")[:100]:
            data = s.google_meet_attendance_data or {}
            unmatched = data.get("unmatched_participants", [])
            if unmatched:
                # Need to manually get expected students with IDENTITY_REVIEW_REQUIRED
                expected = data.get("expected_students", {})
                review_students = [
                    v for k, v in expected.items() 
                    if v.get("status") == "IDENTITY_REVIEW_REQUIRED"
                ]
                if unmatched or review_students:
                    s_data = AttendanceSerializer(s).data
                    s_data["unmatched_participants"] = unmatched
                    s_data["review_required_students"] = review_students
                    identity_reviews.append(s_data)
                    
        return Response({
            "suspensions": suspensions,
            "warnings": warnings,
            "identity_reviews": identity_reviews
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='portal-join', permission_classes=[IsAuthenticated])
    def portal_join(self, request, pk=None):
        from django.db import transaction
        from django.utils import timezone

        profile = getattr(request.user, 'student_profile', None)
        if not profile:
            return Response({"detail": "Student profile required."}, status=status.HTTP_403_FORBIDDEN)

        instance = self.get_object()

        if request.user.role != 'STUDENT':
            return Response({"detail": "Student account required."}, status=status.HTTP_403_FORBIDDEN)
        from datetime import datetime, timedelta
        # Lock before validation so cancellation/rescheduling cannot race a join.
        with transaction.atomic():
            session = self.get_queryset().select_for_update().get(pk=instance.pk)
            if session.class_status in ['COMPLETED', 'CANCELLED', 'RESCHEDULED'] or not session.start_time:
                return Response({"detail": "This class is not available to join."}, status=status.HTTP_400_BAD_REQUEST)
            start = timezone.make_aware(datetime.combine(session.class_date, session.start_time))
            end = timezone.make_aware(datetime.combine(session.class_date, session.end_time)) if session.end_time else start + timedelta(hours=1)
            if not start - timedelta(minutes=15) <= timezone.now() <= end + timedelta(minutes=15):
                return Response({"detail": "Joining opens 15 minutes before class."}, status=status.HTTP_400_BAD_REQUEST)
            prof_id_str = str(profile.id)
            if prof_id_str not in session.portal_join_logs:
                session.portal_join_logs[prof_id_str] = timezone.now().isoformat()
                session.save(update_fields=['portal_join_logs'])
            session.joined_students.add(profile)

        return Response({"detail": "Portal join recorded securely."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='identity-review', permission_classes=[IsAuthenticated, IsAdmin])
    def identity_review(self, request, pk=None):
        session = self.get_object()
        data = session.google_meet_attendance_data or {}
        unmatched = data.get("unmatched_participants", [])
        return Response({"unmatched_participants": unmatched}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='resolve-identity', permission_classes=[IsAuthenticated, IsVolunteerOrMentorOrAdmin])
    @transaction.atomic
    def resolve_identity(self, request, pk=None):
        session = self.get_object()
        session = Attendance.objects.select_for_update().get(pk=session.pk)
        student_id = request.data.get("student_id")
        participant_email = request.data.get("participant_email")
        participant_name = request.data.get("participant_name")

        if not student_id:
            return Response({"error": "student_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        data = session.google_meet_attendance_data or {}
        unmatched = data.get("unmatched_participants", [])
        
        participant = None
        for p in unmatched:
            if (participant_email and p.get("email") == participant_email) or \
               (participant_name and p.get("name") == participant_name):
                participant = p
                break
                
        if not participant:
            return Response({"error": "Participant not found in unmatched list."}, status=status.HTTP_404_NOT_FOUND)
            
        expected = data.get("expected_students", {})
        
        student_record = None
        student_record_key = None
        for key, record in expected.items():
            if str(record.get("student_id")).replace("-", "").lower() == str(student_id).replace("-", "").lower():
                student_record = record
                student_record_key = key
                break
        
        if not student_record:
            return Response({"error": "Student must belong to this session's finalized roster."}, status=status.HTTP_400_BAD_REQUEST)

        dur = participant.get("duration_seconds", 0)
        c_dur_sec = data.get("class_metrics", {}).get("duration_seconds", 0)
        
        student_record["duration_seconds"] = student_record.get("duration_seconds", 0) + dur
        student_record["join_time"] = participant.get("join_time") or student_record.get("join_time")
        student_record["leave_time"] = participant.get("leave_time") or student_record.get("leave_time")
        
        conf_dur = c_dur_sec if c_dur_sec else student_record["duration_seconds"]
        student_record["attendance_percentage"] = min(100.0, round((student_record["duration_seconds"] / conf_dur) * 100, 2)) if conf_dur > 0 else 0
        student_record["status"] = "PRESENT"
        
        expected[student_record_key] = student_record
        data["expected_students"] = expected
        data["unmatched_participants"] = [u for u in unmatched if u != participant]
        
        session.google_meet_attendance_data = data
        session.save(update_fields=["google_meet_attendance_data"])
        
        from students.models import StudentIdentityAlias
        from attendance.services.real_meet_attendance_service import _extract_name_tokens
        from rest_framework.exceptions import ValidationError
        canonical = _extract_name_tokens(participant.get("name") or "")[1]
        if canonical:
            alias, _ = StudentIdentityAlias.objects.get_or_create(
                normalized_alias=canonical,
                defaults={"student_id": student_id, "verified_by": request.user},
            )
            if str(alias.student_id) != str(student_id):
                raise ValidationError({"error": "This identity is already assigned to another student."})

        from attendance.services.discipline_service import evaluate_session_discipline
        evaluate_session_discipline(session)
        
        from attendance.services.discipline_reconciliation_service import reconcile_student_discipline
        from students.models import StudentProfile
        student = StudentProfile.objects.filter(id=student_id).first()
        if student:
            reconcile_student_discipline(student, reason="Identity resolved and attendance restored")
        
        return Response({"message": "Identity resolved successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='prior-permission', permission_classes=[IsAuthenticated, IsVolunteerOrMentorOrAdmin])
    def prior_permission(self, request, pk=None):
        session = self.get_object()
        student_id = request.data.get("student_id")
        reason = request.data.get("reason", "")
        
        if not student_id:
            return Response({"error": "student_id is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        from attendance.models import PriorPermission
        from students.models import StudentProfile
        
        student = StudentProfile.objects.filter(id=student_id).first()
        if not student:
            return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)
            
        pp, created = PriorPermission.objects.get_or_create(
            session=session,
            student=student,
            defaults={"reason": reason, "granted_by": request.user}
        )
        
        pp.save()
        
        from attendance.services.discipline_reconciliation_service import reconcile_student_discipline_after_prior_permission
        reconcile_student_discipline_after_prior_permission(student, session)
        
        return Response({"message": "Prior permission granted."}, status=status.HTTP_200_OK)

class AttendanceSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AttendanceSummarySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        # Base queryset to prevent N+1 queries
        qs = AttendanceSummary.objects.select_related(
            "session__cohort__course",
            "student__user"
        ).order_by("-last_updated", "-id", "-id")

        # Object-level authorization for STUDENT
        if getattr(user, 'role', '') == 'STUDENT':
            return qs.filter(student__user=user)

        # Object-level authorization for MENTOR
        elif getattr(user, 'role', '') == 'MENTOR':
            from django.db.models import Q
            authorized_course_ids = []
            if hasattr(user, 'mentor_profile') and user.mentor_profile:
                if user.mentor_profile.course_id:
                    authorized_course_ids.append(user.mentor_profile.course_id)
                authorized_course_ids.extend(list(user.mentor_profile.additional_courses.values_list('id', flat=True)))

            return qs.filter(
                Q(session__cohort__course_id__in=authorized_course_ids)
            ).distinct()

        # Object-level authorization for ADMIN/VOLUNTEER
        elif has_global_cohort_access(user) or getattr(user, 'role', '') == 'VOLUNTEER':
            if not has_global_cohort_access(user):
                qs = qs.filter(session__cohort__volunteers=user).distinct()
            student_id = self.request.query_params.get("student")
            cohort_id = self.request.query_params.get("cohort")
            if student_id:
                qs = qs.filter(student_id=student_id)
            if cohort_id:
                qs = qs.filter(session__cohort_id=cohort_id)
            return qs

        return qs.none()


class AbsenceWarningViewSet(viewsets.ModelViewSet):
    from attendance.models import AbsenceWarning
    from attendance.serializers import AbsenceWarningSerializer
    queryset = AbsenceWarning.objects.all()
    serializer_class = AbsenceWarningSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset.select_related("student__user", "session__cohort")
        if getattr(user, 'role', '') == 'STUDENT':
            return qs.filter(student__user=user)
        return qs

    @action(detail=True, methods=['post'], url_path='grant-reaccess', permission_classes=[IsAuthenticated, IsAdmin])
    def grant_reaccess(self, request, pk=None):
        warning = self.get_object()
        reason = request.data.get("reason")
        
        if not reason:
            return Response({"error": "A mandatory reason must be provided to grant re-access."}, status=status.HTTP_400_BAD_REQUEST)
            
        if warning.status == "ACCEPTED":
            return Response({"error": "Re-access already granted (apology accepted)."}, status=status.HTTP_400_BAD_REQUEST)
            
        warning.status = "ACCEPTED"
        warning.resolved = True
        warning.save(update_fields=['status', 'resolved'])
        
        from attendance.services.discipline_reconciliation_service import reconcile_student_discipline_for_session
        reconcile_student_discipline_for_session(warning.student, warning.session, reason=f"Admin granted Re-access for '{warning.session.title}': {reason}")
            
        return Response({"message": "Re-access granted successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='message', permission_classes=[IsAuthenticated])
    def message(self, request, pk=None):
        """Admin/Volunteer only: Send a direct in-app notification message to the student regarding this warning."""
        role = getattr(request.user, 'role', '')
        if not (request.user.is_superuser or role in ['ADMIN', 'VOLUNTEER']):
            return Response({"error": "Only admins and volunteers can message."}, status=status.HTTP_403_FORBIDDEN)
            
        message_text = request.data.get("message")
        if not message_text:
            return Response({"error": "Message text is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        warning = self.get_object()
        student_user = warning.student.user
        
        if not student_user:
            return Response({"error": "Student has no associated user account."}, status=status.HTTP_400_BAD_REQUEST)
            
        from common.services.notifications import notify_user
        from common.models import Notification
        from django.utils import timezone
        
        notify_user(
            user=student_user,
            title=f"Admin Message: Attendance Query",
            message=message_text,
            notification_type=Notification.Type.INFO,
            action_url="student/warnings",
            dedupe_key=f"warning:{warning.id}:msg:{timezone.now().timestamp()}"
        )
        
        return Response({"detail": "Message sent successfully to the student."}, status=status.HTTP_200_OK)
