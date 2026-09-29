from django.conf import settings
from django.http import HttpResponseNotFound
from django.http.request import split_domain_port
from django.utils.cache import patch_cache_control, patch_vary_headers


class PrivateAPIResponseMiddleware:
    """Account API responses must never enter a shared browser/proxy cache."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path_info.startswith("/api/"):
            patch_cache_control(response, private=True, no_store=True, no_cache=True, max_age=0, must_revalidate=True)
            patch_vary_headers(response, ["Authorization", "Cookie"])
        return response


class AdminHostRestrictionMiddleware:
    """Expose Django admin only on explicitly configured DNS hostnames.

    This is a defense-in-depth control. The production application server must
    still listen on a private interface, and the reverse proxy must reject
    requests whose Host header is an IP address or an unknown hostname.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        admin_path = getattr(settings, "ADMIN_URL_PATH", "/secure-admin/")
        admin_path = f"/{admin_path.strip('/')}/"

        if self._is_admin_request(request.path_info, admin_path):
            raw_host = request.META.get("HTTP_HOST") or request.get_host()
            request_host = self._normalized_host(raw_host)
            allowed_hosts = {
                self._normalized_host(host)
                for host in getattr(settings, "ADMIN_ALLOWED_HOSTS", ())
            }
            allowed_hosts.discard("")

            if request_host not in allowed_hosts:
                return HttpResponseNotFound()

        return self.get_response(request)

    @staticmethod
    def _is_admin_request(path, admin_path):
        return path == admin_path.rstrip("/") or path.startswith(admin_path)

    @staticmethod
    def _normalized_host(raw_host):
        domain, _port = split_domain_port(raw_host.strip().lower())
        return domain.rstrip(".")
