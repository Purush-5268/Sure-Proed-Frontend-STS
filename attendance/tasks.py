import logging
import datetime
from django.utils import timezone
from celery import shared_task

logger = logging.getLogger(__name__)

from django.core.cache import cache


def class_lifecycle_event(session, now):
    """Resolve the one time-sensitive event due for a scheduled class."""
    if session.class_status != "SCHEDULED" or not session.class_date or not session.start_time:
        return None
    scheduled_at = timezone.make_aware(
        datetime.datetime.combine(session.class_date, session.start_time),
        timezone.get_current_timezone(),
    )
    until_start = scheduled_at - now
    if datetime.timedelta(0) < until_start <= datetime.timedelta(minutes=5):
        return "starting_soon"
    since_start = now - scheduled_at
    if datetime.timedelta(0) <= since_start <= datetime.timedelta(minutes=2):
        return "started"
    return None


@shared_task
def dispatch_class_lifecycle_notifications():
    """Emit idempotent T-5 and T notifications; safe to run every 15 seconds."""
    from attendance.models import Attendance
    from attendance.views import AttendanceViewSet

    now = timezone.now()
    local_now = timezone.localtime(now)
    candidate_dates = [local_now.date(), local_now.date() + datetime.timedelta(days=1)]
    sessions = Attendance.objects.filter(
        class_date__in=candidate_dates,
        class_status=Attendance.ClassStatus.SCHEDULED,
    ).select_related("cohort")
    emitted = {"starting_soon": 0, "started": 0}
    for session in sessions:
        event = class_lifecycle_event(session, now)
        if event is None:
            continue
        recipient_ids = AttendanceViewSet._session_notification_user_ids(session)
        if not recipient_ids:
            continue
        AttendanceViewSet._sync_session_notifications(session, recipient_ids, event=event)
        emitted[event] += len(recipient_ids)
    return emitted

@shared_task(bind=True, max_retries=12, default_retry_delay=300)
def finalize_meet_attendance_task(self, session_id: str):
    """
    Background task queued when End Class is clicked.
    Polls Google Meet for finalized attendance. Retries every 5 mins up to 1 hour.
    Implements a strict per-session idempotency lock to prevent concurrent execution.
    """
    from attendance.models import Attendance
    from attendance.services.real_meet_attendance_service import RealMeetAttendanceService

    lock_key = f"attendance_finalization_lock_{session_id}"
    # Acquire lock with 15 minute expiry to prevent crashes from permanently locking the session
    lock_acquired = cache.add(lock_key, "LOCKED", 900)
    
    if not lock_acquired:
        logger.warning(f"Session {session_id} is already being finalized by another worker. Retrying...")
        raise self.retry(countdown=30) # Backoff and retry

    try:
        session = Attendance.objects.get(id=session_id)
        if session.historical_attendance_data and not session.meeting_link:
            return {"status": "SKIPPED_HISTORICAL"}
            
        result = RealMeetAttendanceService.get_structured_attendance(session)

        if result.get("status") == "READY":
            # Idempotency: if already finalized, don't redo discipline (unless recalculating, but logic handles it safely)
            session.google_meet_attendance_data = result
            participant_student_ids = []
            for s_id, data in result.get('expected_students', {}).items():
                if data.get('status') == 'PRESENT':
                    participant_student_ids.append(s_id)

            # Sync attendees (Google is authoritative)
            session.attendees.set(participant_student_ids)
            session.save(update_fields=['google_meet_attendance_data'])
            logger.info(f"Finalized Meet attendance for session {session_id}")

            # --- AUTO-GENERATE ABSENCE SUSPENSIONS (< 96%) ---
            from attendance.services.discipline_service import evaluate_session_discipline
            try:
                evaluate_session_discipline(session)
            except Exception as e:
                logger.error(f"Error evaluating discipline for session {session_id}: {e}")
            # ----------------------------------------------

        elif result.get("status") in ["NOT_READY", "ERROR"]:
            logger.info(f"Meet attendance not ready for session {session_id}, retrying...")
            # Release lock before retrying
            cache.delete(lock_key)
            raise self.retry()

    except self.MaxRetriesExceededError:
        logger.warning(f"Max retries exceeded for session {session_id}. Marking as FAILED.")
        # We don't fabricate attendance. We update the JSON to show it failed.
        try:
            session = Attendance.objects.get(id=session_id)
            # Generate a baseline roster so the frontend can still display expected students
            from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
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
            session.google_meet_attendance_data = {
                "status": "ATTENDANCE_FAILED",
                "message": "Google did not provide attendance data within the retry window.",
                "expected_students": empty_roster
            }
            session.save(update_fields=['google_meet_attendance_data'])
        except Exception:
            pass
    except Attendance.DoesNotExist:
        logger.warning(f"Attendance session {session_id} not found for sync.")
    except Exception as e:
        logger.error(f"Error finalizing Meet attendance for session {session_id}: {e}")
        # Release lock before retrying
        cache.delete(lock_key)
        raise self.retry(exc=e)
    finally:
        # Always release the lock when we successfully finish (or MaxRetriesExceeded/DoesNotExist)
        cache.delete(lock_key)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def manual_sync_meet_attendance_task(self, session_id: str):
    """
    Background task queued when Admin/Volunteer clicks "Sync Identities".
    Uses authoritative Meet sync service without triggering auto-suspensions.
    Releases the manual sync lock upon completion.
    """
    from attendance.models import Attendance
    from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
    from django.core.cache import cache
    import logging
    logger = logging.getLogger(__name__)
    
    lock_key = f"manual_sync_lock_{session_id}"
    
    try:
        session = Attendance.objects.get(id=session_id)
        result = RealMeetAttendanceService.get_structured_attendance(session, scope='all')
        
        if result.get("status") == "READY":
            session.google_meet_attendance_data = result
            participant_student_ids = []
            if "expected_students" in result:
                for s_id, s_data in result.get("expected_students", {}).items():
                    if s_data.get("status") in ["PRESENT", "BELOW_THRESHOLD"]:
                        participant_student_ids.append(s_id)
            else:
                for p in result.get('participants', []):
                    if p.get('student_id'):
                        participant_student_ids.append(p['student_id'])

            if participant_student_ids:
                session.attendees.add(*participant_student_ids)
            session.save(update_fields=['google_meet_attendance_data'])
            logger.info(f"Manual sync completed for session {session_id}")
            
        elif result.get("status") in ["NOT_READY", "ERROR"]:
            logger.info(f"Meet attendance not ready for manual sync on session {session_id}, retrying...")
            raise self.retry()
            
    except self.MaxRetriesExceededError:
        logger.warning(f"Max retries exceeded for manual sync on session {session_id}.")
    except Attendance.DoesNotExist:
        logger.warning(f"Attendance session {session_id} not found for manual sync.")
    except Exception as e:
        logger.error(f"Error in manual sync for session {session_id}: {e}")
        raise self.retry(exc=e)
    finally:
        cache.delete(lock_key)


@shared_task
def auto_schedule_lst_classes_task():
    """
    Automated LST scheduling using RecurringSchedule.
    Idempotent: checks for existing session.
    """
    from attendance.models import Attendance, RecurringSchedule
    from attendance.services.attendee_resolver import AttendeeResolver
    from attendance.services.google_meet_service import generate_google_meet
    from django.contrib.auth import get_user_model
    User = get_user_model()

    now = timezone.now()

    # Get active LST schedules where next_run is due
    schedules = RecurringSchedule.objects.filter(
        class_type="LST",
        is_paused=False,
        next_run__lte=now + datetime.timedelta(hours=24) # Look ahead 24h
    )

    # Needs a system user for conducted_by if we don't have one
    system_user = User.objects.filter(is_superuser=True).first()

    for schedule in schedules:
        target_date = schedule.next_run.date()

        # 1. Idempotency Check
        exists = Attendance.objects.filter(
            class_type="LST",
            lst_batch__in=[schedule.lst_batch, "COMBINED"],
            class_date=target_date,
            calendar_event_id__isnull=False
        ).exists()

        if exists:
            logger.info(f"LST session for {schedule.lst_batch} on {target_date} already exists. Skipping.")
        else:
            # 2. Resolve Emails
            emails = AttendeeResolver.resolve_emails_by_criteria(
                class_type="LST",
                lst_batch=schedule.lst_batch
            )

            # 3. Generate Meet
            title = f"LST Class - {schedule.lst_batch.replace('_', ' ').title()}"
            start_dt = timezone.make_aware(datetime.datetime.combine(target_date, schedule.start_time))
            end_dt = timezone.make_aware(datetime.datetime.combine(target_date, schedule.end_time))

            try:
                meet_link, event_id = generate_google_meet(title, start_dt, end_dt, attendee_emails=emails)

                # 4. Create Session
                session = Attendance.objects.create(
                    class_type="LST",
                    lst_batch=schedule.lst_batch,
                    title=title,
                    class_date=target_date,
                    start_time=schedule.start_time,
                    end_time=schedule.end_time,
                    meeting_link=meet_link,
                    calendar_event_id=event_id,
                    conducted=True,
                    conducted_by=system_user
                )
                logger.info(f"Successfully auto-scheduled LST session for {schedule.lst_batch} on {target_date}")

                # Send ZeptoMail invitations using Celery bulk task
                if emails:
                    try:
                        from common.tasks import send_async_session_invitations_task
                        start_str = start_dt.strftime("%Y-%m-%d %I:%M %p")
                        send_async_session_invitations_task.delay(
                            recipient_emails=emails,
                            session_title=title,
                            start_time_str=start_str,
                            meeting_link=meet_link,
                            session_id=str(session.id)
                        )
                    except Exception as e:
                        logger.error(f"Failed to queue ZeptoMail invitations for automated session {title}: {e}")
            except Exception as e:
                logger.error(f"Failed to auto-schedule LST {schedule.lst_batch} on {target_date}: {e}")
                continue # Don't advance next_run if generation failed!

        # 5. Advance next_run safely
        # E.g. next_run += frequency_days, but ensure it goes past 'now'
        new_next_run = schedule.next_run
        while new_next_run <= now:
            new_next_run += datetime.timedelta(days=schedule.frequency_days)

        schedule.next_run = new_next_run
        schedule.save(update_fields=['next_run'])


@shared_task
def cleanup_completed_cohort_meet_data():
    """
    Idempotent daily task to clear expired Google Meet access links
    for cohorts that have been COMPLETED for more than 30 days.
    Preserves attendance snapshots and attendees relationships. The snapshot
    records historical roster membership, including absences and percentages;
    deleting it would change academic history for late-enrolled students.
    """
    from attendance.models import Attendance
    from cohorts.models import Cohort
    from exams.models import ModuleTest

    now = timezone.now()
    cutoff_date = now - datetime.timedelta(days=30)

    # Safest proxy for completed_at is updated_at on the Cohort model
    # since we don't have a dedicated completed_at field for cohorts.
    completed_cohorts = Cohort.objects.filter(
        status=Cohort.Status.COMPLETED,
        updated_at__lte=cutoff_date
    )

    cleaned_cohort_count = 0
    cleaned_attendance_count = 0
    cleaned_moduletest_count = 0

    for cohort in completed_cohorts:
        # 1. Clean Attendance records
        attendance_qs = Attendance.objects.filter(
            cohort=cohort
        ).exclude(
            meeting_link="",
            calendar_event_id=""
        )

        # Batch update to avoid memory bloat
        att_count = attendance_qs.update(
            meeting_link="",
            calendar_event_id=""
        )
        cleaned_attendance_count += att_count

        # 2. Clean Cohort meeting_link
        if cohort.meeting_link:
            cohort.meeting_link = ""
            cohort.save(update_fields=['meeting_link', 'updated_at'])

        # 3. Clean cohort-specific ModuleTests (DO NOT touch global ModuleTests)
        moduletest_qs = ModuleTest.objects.filter(
            cohort=cohort
        ).exclude(
            meeting_link="",
            calendar_event_id=""
        )
        mt_count = moduletest_qs.update(
            meeting_link="",
            calendar_event_id=""
        )
        cleaned_moduletest_count += mt_count

        cleaned_cohort_count += 1

    if cleaned_cohort_count > 0:
        logger.info(
            f"Cleanup complete: Processed {cleaned_cohort_count} completed cohorts. "
            f"Cleared {cleaned_attendance_count} attendance records and {cleaned_moduletest_count} module tests."
        )
@shared_task
def sync_prior_permission_invitation(permission_id):
    """Preserve VM invitation behavior; recheck the grant before external delivery."""
    from attendance.models import PriorPermission
    from attendance.services.google_meet_service import add_attendees_to_google_event
    from common.tasks import send_async_session_invitations_task
    permission = PriorPermission.objects.select_related('session', 'student__user').filter(pk=permission_id).first()
    if permission is None or not permission.student.user.is_active:
        return
    session = permission.session
    if session.class_status == 'CANCELLED':
        return
    email = permission.student.user.email.strip().lower()
    if not email:
        return
    if session.calendar_event_id:
        add_attendees_to_google_event(session.calendar_event_id, [email])
    if session.meeting_link:
        if session.class_type == "DOMAIN":
            from common.tasks import send_async_guest_invitations_task
            send_async_guest_invitations_task.delay(
                recipient_emails=[email],
                session_title=session.title,
                start_time_str=f'{session.class_date} {session.start_time}',
                meeting_link=session.meeting_link,
                session_id=str(session.id)
            )
        else:
            send_async_session_invitations_task.delay(
                recipient_emails=[email],
                session_title=session.title,
                start_time_str=f'{session.class_date} {session.start_time}',
                meeting_link=session.meeting_link,
                session_id=str(session.id)
            )


@shared_task
def send_lst_generation_reminder_task(is_final_reminder=False):
    """
    Sends a reminder to admins about the upcoming automated LST generation.
    Checks which batch is due today and notifies accordingly.
    """
    from attendance.models import RecurringSchedule
    from common.services.notifications import notify_users_bulk
    from django.contrib.auth import get_user_model
    import datetime
    from django.utils import timezone

    now = timezone.now()
    # Find any LST schedule due today
    schedule = RecurringSchedule.objects.filter(
        class_type="LST",
        is_paused=False,
        next_run__date=timezone.localdate(now)
    ).first()

    if not schedule:
        return

    User = get_user_model()
    admin_users = User.objects.filter(role='ADMIN', is_active=True)
    
    batch_name = (schedule.lst_batch or "GENERAL").replace('_', ' ').title()
    
    if not is_final_reminder:
        message = f"Today's LST is scheduled for {batch_name} and will be automatically generated at 12:00 PM. Please verify the dashboard for any Prior Permission or clubbing changes."
    else:
        message = f"Reminder: {batch_name} LST will be automatically generated at 12:00 PM. Please verify any Prior Permission or Batch 1 + Batch 2 clubbing requirement in the dashboard."

    notify_users_bulk(
        users=list(admin_users),
        title="LST Auto-Generation Reminder",
        message=message,
        notification_type="INFO",
        action_url="/admin/schedule",
        dedupe_key=f"lst-generation:{schedule.pk}:{timezone.localdate().isoformat()}"
    )
    logger.info(f"Sent {'final ' if is_final_reminder else ''}LST generation reminder for {batch_name}")

@shared_task
def reconcile_ended_google_meet_sessions_task():
    """
    Checks active Google Meet sessions to see if the host clicked 'End call for everyone'.
    If the Meet is officially ended, atomicaly completes the class and triggers attendance calculation.
    """
    from attendance.models import Attendance
    from attendance.services.google_meet_service import check_meet_conference_ended
    from django.db import transaction
    from django.utils import timezone
    from django.core.cache import cache
    import logging

    logger = logging.getLogger(__name__)

    sessions = Attendance.objects.filter(
        class_status__in=[Attendance.ClassStatus.SCHEDULED],
        meeting_link__isnull=False
    ).exclude(meeting_link="")

    for session in sessions:
        try:
            meet_end_time = check_meet_conference_ended(session.meeting_link)
            if meet_end_time:
                with transaction.atomic():
                    # Lock the specific row to prevent races with Website End Class
                    locked_session = Attendance.objects.select_for_update().get(id=session.id)
                    if locked_session.class_status == Attendance.ClassStatus.COMPLETED:
                        continue  # Already ended by website

                    locked_session.conducted = False
                    locked_session.end_time = timezone.localtime(meet_end_time).time()
                    locked_session.class_status = Attendance.ClassStatus.COMPLETED
                    locked_session.save(update_fields=["conducted", "end_time", "class_status"])

                logger.info(f"AUDIT: Auto-completed session {session.id} from Google Meet end time {meet_end_time}")

                # Replicate cache invalidation
                student_user_ids = list(session.attendees.values_list('user_id', flat=True))
                all_user_ids = set(student_user_ids)
                if session.conducted_by_id:
                    all_user_ids.add(session.conducted_by_id)

                try:
                    cache.incr("attendance:version:admin")
                except ValueError:
                    cache.set("attendance:version:admin", 2, timeout=None)

                for uid in all_user_ids:
                    if uid:
                        try:
                            cache.incr(f"attendance:version:user_{uid}")
                        except ValueError:
                            cache.set(f"attendance:version:user_{uid}", 2, timeout=None)

                # Queue the existing attendance finalization logic
                finalize_meet_attendance_task.delay(str(session.id))
        except Exception as e:
            logger.error(f"Failed to reconcile Google Meet end for session {session.id}: {e}")
