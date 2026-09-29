from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from django.conf import settings

def get_google_credentials():
    refresh_token = getattr(settings, "GOOGLE_REFRESH_TOKEN", None)
    client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
    client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", None)
    if not refresh_token or not client_id or not client_secret:
        return None
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token"
    )

def generate_google_meet(session_title, start_datetime, end_datetime, attendee_emails=None):
    if attendee_emails is None:
        attendee_emails = []
        
    creds = get_google_credentials()
    if not creds:
        return None, None

    service = build('calendar', 'v3', credentials=creds)
    
    unique_emails = list(dict.fromkeys(
        str(email).strip()
        for email in attendee_emails
        if email and str(email).strip()
    ))
    attendees_list = [{'email': email, 'responseStatus': 'accepted'} for email in unique_emails]
    
    import hashlib
    # Generate deterministic requestId to ensure Google Calendar API idempotency
    raw_key = f"{session_title}_{start_datetime.isoformat()}_{end_datetime.isoformat()}"
    deterministic_id = hashlib.md5(raw_key.encode('utf-8')).hexdigest()

    event = {
        'summary': session_title,
        'start': {'dateTime': start_datetime.isoformat(), 'timeZone': 'Asia/Kolkata'},
        'end': {'dateTime': end_datetime.isoformat(), 'timeZone': 'Asia/Kolkata'},
        'guestsCanInviteOthers': False,
        'guestsCanModify': False,
        'visibility': 'private',
        'conferenceData': {'createRequest': {'requestId': f"suretrust-{deterministic_id}"}},
        'attendees': attendees_list
    }
    event = service.events().insert(calendarId='primary', body=event, conferenceDataVersion=1, sendUpdates='none').execute()
    return event.get('hangoutLink'), event.get('id')


def update_google_meet(calendar_event_id, session_title, start_datetime, end_datetime, attendee_emails=None):
    """Update an existing Calendar event without creating another Meet room."""
    if attendee_emails is None:
        attendee_emails = []

    creds = get_google_credentials()
    if not creds or not calendar_event_id:
        return None, calendar_event_id

    unique_emails = list(dict.fromkeys(
        str(email).strip()
        for email in attendee_emails
        if email and str(email).strip()
    ))
    event = build('calendar', 'v3', credentials=creds).events().patch(
        calendarId='primary',
        eventId=calendar_event_id,
        body={
            'summary': session_title,
            'start': {'dateTime': start_datetime.isoformat(), 'timeZone': 'Asia/Kolkata'},
            'end': {'dateTime': end_datetime.isoformat(), 'timeZone': 'Asia/Kolkata'},
            'attendees': [
                {'email': email, 'responseStatus': 'accepted'}
                for email in unique_emails
            ],
            'guestsCanInviteOthers': False,
            'guestsCanModify': False,
            'visibility': 'private',
        },
        sendUpdates='none',
    ).execute()
    return event.get('hangoutLink'), event.get('id', calendar_event_id)


def add_attendees_to_google_event(calendar_event_id, attendee_emails):
    if not attendee_emails or not calendar_event_id:
        return False
        
    creds = Credentials(
        token=None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token"
    )
    service = build('calendar', 'v3', credentials=creds)
    
    try:
        event = service.events().get(calendarId='primary', eventId=calendar_event_id).execute()
        
        existing_attendees = event.get('attendees', [])
        existing_emails = {a.get('email', '').strip().lower() for a in existing_attendees if a.get('email')}
        
        updated = False
        for email in attendee_emails:
            e_lower = str(email).strip().lower()
            if e_lower and e_lower not in existing_emails:
                existing_attendees.append({'email': e_lower, 'responseStatus': 'accepted'})
                existing_emails.add(e_lower)
                updated = True
                
        if updated:
            service.events().patch(
                calendarId='primary', 
                eventId=calendar_event_id, 
                body={'attendees': existing_attendees},
                sendUpdates='none'
            ).execute()
            
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to update calendar event attendees: {e}")
        return False


def remove_attendee_from_google_event(calendar_event_id, attendee_email):
    """Remove a candidate email from Google Calendar event attendees to revoke Meet access."""
    if not attendee_email or not calendar_event_id:
        return False

    creds = get_google_credentials()
    if not creds:
        return False

    try:
        service = build('calendar', 'v3', credentials=creds)
        event = service.events().get(calendarId='primary', eventId=calendar_event_id).execute()

        existing_attendees = event.get('attendees', [])
        target_lower = str(attendee_email).strip().lower()

        new_attendees = [
            a for a in existing_attendees
            if a.get('email', '').strip().lower() != target_lower
        ]

        if len(new_attendees) != len(existing_attendees):
            service.events().patch(
                calendarId='primary',
                eventId=calendar_event_id,
                body={'attendees': new_attendees},
                sendUpdates='none'
            ).execute()

        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to remove attendee from calendar event: {e}")
        return False

def delete_google_meet(calendar_event_id):
    """Delete a Google Calendar event when the Django class is deleted/cancelled."""
    if not calendar_event_id:
        return False

    creds = get_google_credentials()
    if not creds:
        return False

    try:
        service = build('calendar', 'v3', credentials=creds)
        service.events().delete(calendarId='primary', eventId=calendar_event_id, sendUpdates='none').execute()
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to delete Google Calendar event: {e}")
        return False

def _extract_meeting_code(meeting_link):
    if not meeting_link:
        return None
    import re
    match = re.search(r'meet\.google\.com/([a-zA-Z0-9-]+)', meeting_link)
    if match:
        return match.group(1)
    return None

def check_meet_conference_ended(meeting_link, creds=None):
    """
    Checks the Google Meet API to determine if a conference has ended.
    Returns the exact conferenceRecord.endTime as a datetime object if it has ended.
    Returns None if the conference is still active, hasn't started, or on error.
    """
    import urllib.parse
    import requests
    from dateutil.parser import parse as parse_date
    import logging
    logger = logging.getLogger(__name__)
    
    meeting_code = _extract_meeting_code(meeting_link)
    if not meeting_code:
        return None
        
    if not creds:
        creds = get_google_credentials()
        
    if not creds:
        return None
        
    try:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
    except Exception as e:
        logger.error(f"[MEET_END] Failed to refresh credentials: {e}")
        return None
        
    space_name = f"spaces/{meeting_code}"
    filter_param = f'space.name="{space_name}"'
    encoded_filter = urllib.parse.quote(filter_param)
    
    url = f"https://meet.googleapis.com/v2/conferenceRecords?filter={encoded_filter}"
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Accept": "application/json"
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        records = data.get("conferenceRecords", [])
        for record in records:
            # We are looking for an endTime on any conference record
            end_time_str = record.get("endTime")
            if end_time_str:
                return parse_date(end_time_str)
                
        return None
    except Exception as e:
        logger.error(f"[MEET_END] Failed to check conferenceRecords for space={space_name}: {e}")
        return None
