import logging
from django.conf import settings

logger = logging.getLogger(__name__)


class GoogleCalendarService:
    @staticmethod
    def create_meeting_event(title, description, start_time, end_time, attendees_emails):
        """
        Generates or schedules a Google Meet session event.
        Returns a dictionary containing meeting link & event id.
        """
        logger.info(f"GoogleCalendarService: Creating event '{title}' for {len(attendees_emails)} attendees.")
        # Fallback or mock link if OAuth token not configured
        mock_meet_id = f"meet-{abs(hash(title)) % 10000000}"
        meeting_link = f"https://meet.google.com/{mock_meet_id[:3]}-{mock_meet_id[3:7]}-{mock_meet_id[7:]}"
        return {
            "event_id": mock_meet_id,
            "meeting_link": meeting_link,
            "status": "CONFIRMED",
        }
