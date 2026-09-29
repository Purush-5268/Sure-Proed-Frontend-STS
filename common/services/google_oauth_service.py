import json
import logging
import urllib.parse
import urllib.request
from typing import Optional
from django.conf import settings

logger = logging.getLogger(__name__)

class GoogleOAuthService:
    @staticmethod
    def get_authorization_url(state: Optional[str] = None) -> str:
        base_url = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent",
        }
        if state:
            params["state"] = state
        return f"{base_url}?{urllib.parse.urlencode(params)}"

    @staticmethod
    def exchange_code_for_token(code: str) -> dict:
        url = "https://oauth2.googleapis.com/token"
        data = urllib.parse.urlencode({
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if "error" in payload:
                    raise ValueError(payload.get("error_description", payload["error"]))
                return payload
        except Exception as e:
            logger.error(f"Failed to exchange Google code for token: {e}")
            raise ValueError(f"Failed to exchange Google code for token: {str(e)}")

    @staticmethod
    def fetch_user_profile(access_token: str) -> dict:
        url = "https://www.googleapis.com/oauth2/v3/userinfo"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"Failed to fetch user profile from Google: {e}")
            raise ValueError(f"Failed to fetch user profile from Google: {str(e)}")
