import logging
from typing import Optional
from googleapiclient.errors import HttpError
from attendance.services.google_meet_service import get_google_credentials, build
from attendance.models import GoogleCalendarAuditLog

logger = logging.getLogger(__name__)

def _log_audit(calendar_event_id: str, operation_type: str, status: str, actor: str, attendance_id=None, error_message: str = None):
    try:
        GoogleCalendarAuditLog.objects.create(
            calendar_event_id=calendar_event_id,
            attendance_id=attendance_id,
            operation_type=operation_type,
            actor=actor,
            status=status,
            error_message=error_message
        )
    except Exception as e:
        logger.error(f"Failed to write GoogleCalendarAuditLog: {e}")

def safe_delete_google_meet(calendar_event_id: str, attendance_id=None, actor="SYSTEM") -> str:
    """
    Safely deletes a Google Calendar event.
    Since Google API is external, this defers the actual deletion to transaction.on_commit
    so that if the Django transaction rolls back, the event is not deleted.
    Returns "PENDING_COMMIT" or "SUCCESS" (if no ID).
    """
    if not calendar_event_id:
        return "SUCCESS"  # Nothing to delete

    creds = get_google_credentials()
    if not creds:
        _log_audit(calendar_event_id, "DELETE", "FAILED", actor, attendance_id, "Missing Google credentials")
        return "FAILED"

    from django.db import transaction
    def _execute_google_delete():
        try:
            service = build('calendar', 'v3', credentials=creds)
            service.events().delete(calendarId='primary', eventId=calendar_event_id, sendUpdates='none').execute()
            _log_audit(calendar_event_id, "DELETE", "SUCCESS", actor, attendance_id)
        except HttpError as e:
            if e.resp.status in [404, 410]:
                _log_audit(calendar_event_id, "DELETE", "ALREADY_MISSING", actor, attendance_id, str(e))
            else:
                _log_audit(calendar_event_id, "DELETE", "FAILED", actor, attendance_id, str(e))
                logger.error(f"Failed to delete Google Calendar event {calendar_event_id}: {e}")
        except Exception as e:
            _log_audit(calendar_event_id, "DELETE", "FAILED", actor, attendance_id, str(e))
            logger.error(f"Unexpected error deleting Google Calendar event {calendar_event_id}: {e}")
            
    transaction.on_commit(_execute_google_delete)
    return "PENDING_COMMIT"

def compensate_failed_creation(calendar_event_id: str, attendance_id=None):
    """
    Called immediately when Django fails to save an Attendance record after Google API succeeded.
    """
    if not calendar_event_id:
        return

    creds = get_google_credentials()
    if not creds:
        _log_audit(calendar_event_id, "COMPENSATE", "FAILED", "SYSTEM", attendance_id, "Missing Google credentials")
        return

    try:
        service = build('calendar', 'v3', credentials=creds)
        service.events().delete(calendarId='primary', eventId=calendar_event_id, sendUpdates='none').execute()
        _log_audit(calendar_event_id, "COMPENSATE", "SUCCESS", "SYSTEM", attendance_id)
    except HttpError as e:
        if e.resp.status in [404, 410]:
            _log_audit(calendar_event_id, "COMPENSATE", "ALREADY_MISSING", "SYSTEM", attendance_id, str(e))
        else:
            _log_audit(calendar_event_id, "COMPENSATE", "FAILED", "SYSTEM", attendance_id, str(e))
            logger.error(f"Failed to compensate Google Calendar event {calendar_event_id}: {e}")
    except Exception as e:
        _log_audit(calendar_event_id, "COMPENSATE", "FAILED", "SYSTEM", attendance_id, str(e))
        logger.error(f"Unexpected error compensating Google Calendar event {calendar_event_id}: {e}")

def reconcile_orphans():
    """
    Placeholder for future automated cleanup of FAILED compensations.
    """
    pass
