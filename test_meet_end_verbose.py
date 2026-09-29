import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

import urllib.parse
import requests
from attendance.services.google_meet_service import _extract_meeting_code, get_google_credentials
from google.auth.transport.requests import Request

link = "https://meet.google.com/zyk-aiva-hwe"
meeting_code = _extract_meeting_code(link)

creds = get_google_credentials()
creds.refresh(Request())

space_name = f"spaces/{meeting_code}"
filter_param = f'space.name="{space_name}"'
encoded_filter = urllib.parse.quote(filter_param)

url = f"https://meet.googleapis.com/v2/conferenceRecords?filter={encoded_filter}"
headers = {
    "Authorization": f"Bearer {creds.token}",
    "Accept": "application/json"
}

resp = requests.get(url, headers=headers, timeout=10)
print("Status:", resp.status_code)
try:
    print(resp.json())
except:
    print(resp.text)

