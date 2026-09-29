import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional
from django.conf import settings

logger = logging.getLogger(__name__)


class GitHubService:
    @staticmethod
    def get_authorization_url(state: Optional[str] = None) -> str:
        base_url = "https://github.com/login/oauth/authorize"
        params = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
            # Account linking only needs the authenticated user's public profile.
            # Organization/repository operations use the separate server admin token.
            "scope": "read:user",
        }
        if state:
            params["state"] = state
        return f"{base_url}?{urllib.parse.urlencode(params)}"

    @staticmethod
    def exchange_code_for_token(code: str) -> dict:
        url = "https://github.com/login/oauth/access_token"
        data = urllib.parse.urlencode({
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
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
            logger.error(f"Failed to exchange GitHub code for token: {e}")
            raise ValueError(f"Failed to exchange GitHub code for token: {str(e)}")

    @staticmethod
    def fetch_user_profile(access_token: str) -> dict:
        url = "https://api.github.com/user"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "Suretrust-Backend",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"Failed to fetch user profile from GitHub: {e}")
            raise ValueError(f"Failed to fetch user profile from GitHub: {str(e)}")

    @classmethod
    def invite_user_to_org(cls, github_username: str, user_access_token: Optional[str] = None) -> dict:
        org_name = getattr(settings, "GITHUB_ORG_NAME", "sure-trust")
        token = getattr(settings, "GITHUB_ORG_ADMIN_TOKEN", "") or user_access_token
        if not token:
            logger.warning(f"No GITHUB_ORG_ADMIN_TOKEN or user token provided for inviting {github_username}")
            return {"state": "pending", "role": "member", "simulated": True}

        url = f"https://api.github.com/orgs/{org_name}/memberships/{github_username}"
        data = json.dumps({"role": "member"}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="PUT",
        )
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            logger.error(f"GitHub Org invite HTTP error {e.code}: {error_body}")
            return {"state": "error", "error": error_body, "code": e.code}
        except Exception as e:
            logger.error(f"GitHub Org invite error for {github_username}: {e}")
            return {"state": "error", "error": str(e)}

    @classmethod
    def extract_repo_name(cls, repo_url_or_name: str) -> str:
        """Extracts clean lowercase repository name from URL or name string."""
        if not repo_url_or_name:
            return ""
        return repo_url_or_name.strip().rstrip("/").split("/")[-1].lower()

    @classmethod
    def repo_exists(cls, org_name: str, repo_name: str, token: Optional[str] = None) -> bool:
        """
        Confirms via the organization admin token whether the repository actually exists on GitHub.
        Returns True if HTTP 200, False if HTTP 404 or other error.
        """
        token = token or getattr(settings, "GITHUB_ORG_ADMIN_TOKEN", "")
        if not token:
            return False

        clean_name = cls.extract_repo_name(repo_name)
        if not clean_name:
            return False

        url = f"https://api.github.com/repos/{org_name}/{clean_name}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Suretrust-Backend",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status == 200
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            logger.warning(f"GitHub API returned HTTP {e.code} checking repo {org_name}/{clean_name}")
            return False
        except Exception as e:
            logger.warning(f"Error checking repo {clean_name}: {e}")
            return False

    @classmethod
    def replace_topics(cls, org_name: str, repo_name: str, topics: list[str], token: str) -> bool:
        """Sets labels/topics on the repository (e.g. ['g16-java', 'sure-trust'])."""
        url = f"https://api.github.com/repos/{org_name}/{repo_name}/topics"
        clean_topics = [t.lower().replace(" ", "-") for t in topics if t.strip()]
        data = json.dumps({"names": clean_topics}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="PUT",
        )
        try:
            with urllib.request.urlopen(req):
                return True
        except Exception as e:
            logger.warning(f"Failed to set topics {clean_topics} on {repo_name}: {e}")
            return False

    @classmethod
    def add_collaborator(cls, org_name: str, repo_name: str, username: str, permission: str = "read", token: str = "") -> bool:
        """Grants access to a student or instructor for a specific repository."""
        if permission not in {"read", "write"}:
            raise ValueError("Repository collaborators may only receive read or write access.")
        clean_user = username.strip().rstrip("/").split("/")[-1]
        if not clean_user:
            return False
        url = f"https://api.github.com/repos/{org_name}/{repo_name}/collaborators/{clean_user}"
        # GitHub's REST API names the read/write base roles ``pull`` and ``push``.
        github_permission = {"read": "pull", "write": "push"}[permission]
        data = json.dumps({"permission": github_permission}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="PUT",
        )
        try:
            with urllib.request.urlopen(req):
                return True
        except Exception as e:
            logger.warning(f"Failed to add collaborator {clean_user} ({permission}) on {repo_name}: {e}")
            return False

    @classmethod
    def ensure_repository_access(
        cls,
        org_name: str,
        repo_name: str,
        student_username: str,
        trainer_usernames: Optional[list[str]] = None,
        token: str = "",
    ) -> dict:
        """Apply the least-privilege access policy for one managed student repository."""
        token = token or getattr(settings, "GITHUB_ORG_ADMIN_TOKEN", "")
        student_username = student_username.strip().rstrip("/").split("/")[-1]

        trainers = []
        seen = {student_username.casefold()} if student_username else set()
        for username in trainer_usernames or []:
            clean_username = str(username or "").strip().rstrip("/").split("/")[-1]
            normalized = clean_username.casefold()
            if clean_username and normalized not in seen:
                trainers.append(clean_username)
                seen.add(normalized)

        student_write = bool(student_username) and cls.add_collaborator(
            org_name,
            repo_name,
            student_username,
            permission="write",
            token=token,
        )
        trainer_read = {
            username: cls.add_collaborator(
                org_name,
                repo_name,
                username,
                permission="read",
                token=token,
            )
            for username in trainers
        }
        failed_trainers = [username for username, granted in trainer_read.items() if not granted]
        return {
            "ok": student_write and not failed_trainers,
            "student": {"username": student_username, "permission": "write", "granted": student_write},
            "trainers": [
                {"username": username, "permission": "read", "granted": granted}
                for username, granted in trainer_read.items()
            ],
            "failed_trainers": failed_trainers,
        }

    @classmethod
    def _create_or_update_file(cls, org_name: str, repo_name: str, file_path: str, content_bytes: bytes, token: str) -> bool:
        get_url = f"https://api.github.com/repos/{org_name}/{repo_name}/contents/{file_path}"
        sha = None
        get_req = urllib.request.Request(
            get_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Suretrust-Backend",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(get_req) as resp:
                existing_file = json.loads(resp.read().decode("utf-8"))
                sha = existing_file.get("sha")
        except Exception:
            sha = None

        if sha:
            # File already exists, preserve student content and do not overwrite!
            logger.info(f"File {file_path} already exists in {repo_name}, preserving existing file.")
            return True

        payload = {
            "message": f"Initial creation of {file_path}",
            "content": base64.b64encode(content_bytes).decode("utf-8"),
        }

        put_req = urllib.request.Request(
            get_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="PUT",
        )
        try:
            with urllib.request.urlopen(put_req):
                return True
        except Exception as e:
            logger.error(f"Failed to write file {file_path} in repo {repo_name}: {e}")
            return False

    @classmethod
    def update_central_repo_index(cls, course_or_batch_name: str, student_name: str, github_username: str, repo_link: str, token: str) -> bool:
        """Appends student repo link to Students-Course-Repo-Links repo table."""
        org_name = getattr(settings, "GITHUB_ORG_NAME", "sure-trust")
        index_repo = "Students-Course-Repo-Links"
        file_name = f"{course_or_batch_name.strip().replace(' ', '-')}.md"
        get_url = f"https://api.github.com/repos/{org_name}/{index_repo}/contents/{file_name}"

        content_str = ""
        sha = None
        get_req = urllib.request.Request(
            get_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Suretrust-Backend",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(get_req) as resp:
                existing_file = json.loads(resp.read().decode("utf-8"))
                sha = existing_file.get("sha")
                raw_content = base64.b64decode(existing_file.get("content", "")).decode("utf-8")
                content_str = raw_content
        except Exception:
            sha = None
            content_str = f"""# {course_or_batch_name}
This is the readme file for student repository details for the instructors.
## Student repositories 
<table style="border: 2px solid green; width:100%;">
<tr>
<th style="border: 2px solid green;">Student Name</th>
<th style="border: 2px solid green;">GitHub Username</th>
<th style="border: 2px solid green;">Repository link</th>
</tr>
"""

        # Check if student is already in the table
        if github_username in content_str:
            return True

        table_row = f"""
<tr style="border: 2px solid green;">
<td style="border: 2px solid green;">{student_name}</td>
<td style="border: 2px solid green;">{github_username}</td>
<td style="border: 2px solid green;">{repo_link}</td>
</tr>
"""
        new_content = content_str.strip() + "\n" + table_row.strip() + "\n"
        return cls._create_or_update_file(org_name, index_repo, file_name, new_content.encode("utf-8"), token)

    @classmethod
    def create_and_initialize_student_repo(
        cls,
        github_username: str,
        repo_name: str,
        student_name: str = "Student",
        batch_name: str = "",
        instructor_usernames: Optional[list[str]] = None,
        user_access_token: Optional[str] = None,
    ) -> dict:
        org_name = getattr(settings, "GITHUB_ORG_NAME", "sure-trust")
        token = getattr(settings, "GITHUB_ORG_ADMIN_TOKEN", "") or user_access_token
        clean_repo_name = repo_name.strip().replace(" ", "-").lower()

        if not token:
            default_url = f"https://github.com/{org_name}/{clean_repo_name}"
            logger.warning(f"No GITHUB_ORG_ADMIN_TOKEN provided; returning simulated repo URL {default_url}")
            return {
                "html_url": default_url,
                "name": clean_repo_name,
                "simulated": True,
                "initialized_folders": [
                    "Assignments",
                    "Mini projects",
                    "Final capstone project",
                    "Course report",
                    "README.md",
                ],
            }

        # 1. Create Organization Private Repository
        create_url = f"https://api.github.com/orgs/{org_name}/repos"
        data = json.dumps({
            "name": clean_repo_name,
            "private": True,
            "description": f"Official course workspace repository for {student_name} ({github_username})",
            "auto_init": True,
        }).encode("utf-8")

        req = urllib.request.Request(
            create_url,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "Suretrust-Backend",
            },
            method="POST",
        )

        repo_info = {}
        try:
            with urllib.request.urlopen(req) as response:
                repo_info = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 422:
                # Repo already exists - prevent duplicate creation and link existing repository
                logger.info(f"Repository {clean_repo_name} already exists in {org_name}. Attaching existing repository without duplication.")
                repo_info = {"html_url": f"https://github.com/{org_name}/{clean_repo_name}", "name": clean_repo_name, "already_existed": True}
            else:
                error_body = e.read().decode("utf-8")
                logger.error(f"Failed to create repo {clean_repo_name}: {error_body}")
                return {"error": error_body, "code": e.code}
        except Exception as e:
            logger.error(f"Unexpected error creating repo {clean_repo_name}: {e}")
            return {"error": str(e)}

        repo_html_url = repo_info.get("html_url", f"https://github.com/{org_name}/{clean_repo_name}")

        # 2. Add Label / Topic
        if batch_name:
            cls.replace_topics(org_name, clean_repo_name, [batch_name, "sure-trust"], token)

        # 3. Enforce least privilege: the student can contribute, assigned trainers can only read.
        access = cls.ensure_repository_access(
            org_name,
            clean_repo_name,
            github_username,
            trainer_usernames=instructor_usernames,
            token=token,
        )
        if not access["ok"]:
            failures = []
            if not access["student"]["granted"]:
                failures.append(f"student {access['student']['username']} (write)")
            failures.extend(f"trainer {username} (read)" for username in access["failed_trainers"])
            return {
                "error": "Repository created, but required collaborator access failed: " + ", ".join(failures),
                "html_url": repo_html_url,
                "name": clean_repo_name,
                "access": access,
            }

        # 4. Initialize Standard Folders & READMEs
        readme_content = f"""# {student_name} - Course Workspace

Welcome to your official **SURE Trust** course repository.

## Repository Structure

- **`Assignments/`**: Submit your module assignments here.
- **`Mini projects/`**: Upload your mini projects and practice tasks.
- **`Final capstone project/`**: Place your capstone project code and documentation.
- **`Course report/`**: Store your progress reports and summaries.
- **`README.md`**: Main course workspace documentation.
""".strip().encode("utf-8")

        initial_files = [
            ("README.md", readme_content),
            ("Assignments/README.md", b"# Assignments Directory\nSubmit your course module assignments here.\n"),
            ("Mini projects/README.md", b"# Mini Projects Directory\nSubmit your mini practice projects here.\n"),
            ("Final capstone project/README.md", b"# Final Capstone Project Directory\nSubmit your capstone code and assets here.\n"),
            ("Course report/README.md", b"# Course Report Directory\nStore your course attendance and progress reports here.\n"),
        ]

        created_files = []
        for file_path, content in initial_files:
            success = cls._create_or_update_file(org_name, clean_repo_name, file_path, content, token)
            if success:
                created_files.append(file_path)

        # 5. Update Master Directory (Students-Course-Repo-Links)
        if batch_name:
            try:
                cls.update_central_repo_index(batch_name, student_name, github_username, repo_html_url, token)
            except Exception as e:
                logger.warning(f"Could not update Students-Course-Repo-Links index: {e}")

        return {
            "html_url": repo_html_url,
            "name": clean_repo_name,
            "created_files": created_files,
            "access": access,
            "status": "SUCCESS",
        }
