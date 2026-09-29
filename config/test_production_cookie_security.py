import json
import os
import subprocess
import sys
from pathlib import Path
from unittest import TestCase


class ProductionCookieSecurityTests(TestCase):
    def test_production_cannot_disable_secure_cookies_with_environment_overrides(self):
        env=dict(os.environ, DEBUG='False', SECRET_KEY='release-test-only-unique-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ', ALLOWED_HOSTS='sureproed.com', ADMIN_ALLOWED_HOSTS='sureproed.com', ADMIN_PORTAL_URL='https://sureproed.com/secure-admin/', SESSION_COOKIE_SECURE='False', CSRF_COOKIE_SECURE='False', CACHE_BACKEND='django.core.cache.backends.locmem.LocMemCache', CACHE_LOCATION='cookie-tests', USE_SQLITE='True')
        result=subprocess.run([sys.executable,'-c','import json; from config import settings; print(json.dumps([settings.SESSION_COOKIE_SECURE,settings.CSRF_COOKIE_SECURE]))'],cwd=Path(__file__).resolve().parents[1],env=env,text=True,capture_output=True,check=True)
        self.assertEqual(json.loads(result.stdout.strip()),[True,True])
