import urllib.parse
import urllib.request
import json
from django.conf import settings


class LinkedInAuthService:
    @staticmethod
    def get_authorization_url(state: str = None, redirect_uri: str = None) -> str:
        base_url = "https://www.linkedin.com/oauth/v2/authorization"
        params = {
            "response_type": "code",
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "redirect_uri": redirect_uri or settings.LINKEDIN_REDIRECT_URI,
            "scope": getattr(settings, "LINKEDIN_SCOPE", "openid profile email"),
        }
        if state:
            params["state"] = state
        return f"{base_url}?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote)}"

    @staticmethod
    def exchange_code_for_token(code: str, redirect_uri: str = None) -> dict:
        url = "https://www.linkedin.com/oauth/v2/accessToken"
        data = urllib.parse.urlencode({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri or settings.LINKEDIN_REDIRECT_URI,
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "client_secret": settings.LINKEDIN_CLIENT_SECRET,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            raise ValueError(f"Failed to exchange LinkedIn code for token: {str(e)}")

    @staticmethod
    def fetch_user_profile(access_token: str) -> dict:
        url = "https://api.linkedin.com/v2/userinfo"
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            raise ValueError(f"Failed to fetch user profile from LinkedIn: {str(e)}")
