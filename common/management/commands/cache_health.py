from django.core.cache import cache, caches
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Verify the configured cache and report the active backend."

    def handle(self, *args, **options):
        configured_cache = caches["default"]
        backend = f"{configured_cache.__class__.__module__}.{configured_cache.__class__.__name__}"
        probe_key = "health:cache"
        probe_value = "ok"
        try:
            cache.set(probe_key, probe_value, timeout=10)
            if cache.get(probe_key) != probe_value:
                raise CommandError(f"Cache round-trip failed ({backend}).")
            cache.delete(probe_key)
        except Exception as exc:
            raise CommandError(f"Cache is unavailable ({backend}): {exc}") from exc
        self.stdout.write(self.style.SUCCESS(f"Cache round-trip OK: {backend}"))
