import hashlib

from django.core.cache import cache


def _version_key(namespace):
    return f"cache-version:{namespace}"


def cache_version(namespace):
    """Return a shared namespace version supported by Redis and LocMemCache."""
    key = _version_key(namespace)
    version = cache.get(key)
    if version is None:
        cache.add(key, 1, timeout=None)
        version = cache.get(key, 1)
    return int(version)


def bump_cache_version(namespace):
    """Invalidate all versioned entries without scanning Redis keys."""
    key = _version_key(namespace)
    if not cache.add(key, 2, timeout=None):
        try:
            cache.incr(key)
        except Exception:
            cache.set(key, cache_version(namespace) + 1, timeout=None)


def versioned_cache_key(namespace, *parts):
    raw = "|".join(str(part) for part in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{namespace}:v{cache_version(namespace)}:{digest}"
