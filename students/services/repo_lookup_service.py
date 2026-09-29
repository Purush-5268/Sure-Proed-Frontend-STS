import json
import logging
import os
from typing import Dict, List, Optional
from django.conf import settings

logger = logging.getLogger(__name__)

_REPO_CATALOG_CACHE: Optional[Dict[str, dict]] = None


def get_catalog_file_path() -> str:
    return os.path.join(settings.BASE_DIR, "students", "data", "existing_github_repos.json")


def load_repo_catalog(force_reload: bool = False) -> Dict[str, dict]:
    """
    Loads the parsed GitHub repositories catalog into memory.
    Keys are normalized lowercase identifiers (github_username, normalized full_name, repo_name).
    """
    global _REPO_CATALOG_CACHE
    if _REPO_CATALOG_CACHE is not None and not force_reload:
        return _REPO_CATALOG_CACHE

    catalog_file = get_catalog_file_path()
    if not os.path.exists(catalog_file):
        _REPO_CATALOG_CACHE = {
            "by_username": {},
            "by_name": {},
            "records": [],
        }
        return _REPO_CATALOG_CACHE

    try:
        with open(catalog_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            _REPO_CATALOG_CACHE = data
            return _REPO_CATALOG_CACHE
    except Exception as e:
        logger.error(f"Failed to load existing_github_repos.json: {e}")
        return {"by_username": {}, "by_name": {}, "records": []}


def find_existing_repo_for_student(student_profile) -> Optional[dict]:
    """
    Fast in-memory lookup for an existing repository record for a student profile.
    Checks by github_username, then normalized full_name.
    """
    catalog = load_repo_catalog()
    by_username = catalog.get("by_username", {})
    by_name = catalog.get("by_name", {})

    # 1. Match by github_username
    if student_profile.github_username:
        gh_user = student_profile.github_username.strip().lower()
        if gh_user in by_username:
            return by_username[gh_user]

    # 2. Match by student full name
    user = getattr(student_profile, "user", None)
    if user:
        full_name = f"{user.first_name} {user.last_name}".strip().lower()
        if full_name and full_name in by_name:
            return by_name[full_name]

    return None


def auto_link_existing_repo(student_profile, save: bool = True) -> bool:
    """
    Checks the 3,500+ student catalog and populates GitHub ID (username + URL),
    repository URL, invite status, and connection state.
    Returns True if auto-linked or updated, False otherwise.
    """
    record = find_existing_repo_for_student(student_profile)
    if not record:
        return False

    updated_fields = set()
    repo_url = record.get("repo_url")
    gh_user = record.get("github_username", "").strip()

    if repo_url and student_profile.github_repo_url != repo_url:
        student_profile.github_repo_url = repo_url
        updated_fields.add("github_repo_url")

    if gh_user:
        if student_profile.github_username != gh_user:
            student_profile.github_username = gh_user
            updated_fields.add("github_username")

        expected_gh_url = f"https://github.com/{gh_user}"
        if student_profile.github_url != expected_gh_url:
            student_profile.github_url = expected_gh_url
            updated_fields.add("github_url")

    if not student_profile.is_github_connected:
        student_profile.is_github_connected = True
        updated_fields.add("is_github_connected")

    if student_profile.github_org_invite_status != "ACCEPTED":
        student_profile.github_org_invite_status = "ACCEPTED"
        updated_fields.add("github_org_invite_status")

    if not updated_fields:
        return False

    if save and student_profile.pk:
        from django.utils import timezone
        student_profile.updated_at = timezone.now()
        updated_fields.add("updated_at")
        student_profile.save(update_fields=list(updated_fields))

    return True
