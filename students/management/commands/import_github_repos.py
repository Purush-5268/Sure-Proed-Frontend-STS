import glob
import json
import os
import re
import time
from typing import Dict, List, Optional
from django.core.management.base import BaseCommand
from django.utils import timezone

from students.models import StudentProfile


class Command(BaseCommand):
    help = "Fast bulk import & mapping of existing student GitHub repositories from markdown catalog files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dir",
            type=str,
            default="",
            help="Directory containing cohort markdown files (e.g. Students-Course-Repo-Links-main)",
        )
        parser.add_argument(
            "--no-db-update",
            action="store_true",
            help="Only compile existing_github_repos.json catalog without updating DB StudentProfiles.",
        )

    def handle(self, *args, **options):
        start_time = time.time()
        input_dir = options.get("dir", "").strip()

        # Candidate paths to locate markdown directory automatically
        candidate_paths = [
            input_dir,
            r"C:\Users\tumma\Downloads\Students-Course-Repo-Links-main\Students-Course-Repo-Links-main",
            r"C:\Users\tumma\Downloads\Students-Course-Repo-Links-main",
            os.path.join(os.path.expanduser("~"), "Downloads", "Students-Course-Repo-Links-main", "Students-Course-Repo-Links-main"),
            os.path.join(os.path.expanduser("~"), "Downloads", "Students-Course-Repo-Links-main"),
        ]

        resolved_dir = None
        for path in candidate_paths:
            if path and os.path.exists(path):
                # Verify it contains .md files
                md_count = len(glob.glob(os.path.join(path, "*.md")))
                if md_count > 0:
                    resolved_dir = path
                    break
                # Check nested directory
                nested = glob.glob(os.path.join(path, "*", "*.md"))
                if nested:
                    resolved_dir = os.path.dirname(nested[0])
                    break

        from django.conf import settings
        data_dir = os.path.join(settings.BASE_DIR, "students", "data")
        os.makedirs(data_dir, exist_ok=True)
        catalog_path = os.path.join(data_dir, "existing_github_repos.json")

        records = []
        by_username = {}
        by_name = {}

        if not resolved_dir:
            if os.path.exists(catalog_path):
                self.stdout.write(self.style.WARNING(
                    f"Markdown folder not on this host. Using precompiled catalog ({catalog_path})."
                ))
                try:
                    with open(catalog_path, "r", encoding="utf-8") as f:
                        cached = json.load(f)
                        by_username = cached.get("by_username", {})
                        by_name = cached.get("by_name", {})
                        records = cached.get("records", [])
                    self.stdout.write(self.style.SUCCESS(
                        f"Loaded {len(records)} records ({len(by_username)} unique GitHub users) from precompiled catalog."
                    ))
                except Exception as e:
                    self.stderr.write(self.style.ERROR(f"Failed to load {catalog_path}: {e}"))
                    return
            else:
                self.stderr.write(self.style.ERROR(
                    f"Could not find markdown files or precompiled catalog. Please specify with --dir <path>"
                ))
                return
        else:
            self.stdout.write(self.style.SUCCESS(f"Scanning directory: {resolved_dir}"))
            md_files = glob.glob(os.path.join(resolved_dir, "*.md"))
            self.stdout.write(f"Found {len(md_files)} markdown files.")

            tr_re = re.compile(r"<tr[^>]*>([\s\S]*?)</tr>", re.IGNORECASE)
            td_re = re.compile(r"<td[^>]*>([\s\S]*?)</td>", re.IGNORECASE)
            tag_strip_re = re.compile(r"<[^>]+>")

            for filepath in md_files:
                filename = os.path.basename(filepath)
                if filename.lower() == "readme.md":
                    continue

                cohort_name = os.path.splitext(filename)[0].strip()

                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as fp:
                        content = fp.read()
                except Exception as e:
                    self.stderr.write(f"Could not read {filename}: {e}")
                    continue

                rows = tr_re.findall(content)
                for row_html in rows:
                    tds = td_re.findall(row_html)
                    if len(tds) < 3:
                        continue

                    clean_tds = [tag_strip_re.sub("", t).strip() for t in tds]
                    student_name = clean_tds[0]
                    github_username = clean_tds[1]
                    repo_url = clean_tds[2]

                    # Skip header rows
                    if "student name" in student_name.lower() or "github username" in github_username.lower():
                        continue
                    if not repo_url.startswith("http"):
                        continue

                    rec = {
                        "student_name": student_name,
                        "github_username": github_username,
                        "repo_url": repo_url,
                        "cohort_name": cohort_name,
                    }
                    records.append(rec)

                    gh_key = github_username.lower()
                    name_key = student_name.lower()

                    if gh_key and gh_key not in by_username:
                        by_username[gh_key] = rec
                    if name_key and name_key not in by_name:
                        by_name[name_key] = rec

            catalog_data = {
                "total_records": len(records),
                "unique_usernames": len(by_username),
                "unique_names": len(by_name),
                "generated_at": timezone.now().isoformat(),
                "by_username": by_username,
                "by_name": by_name,
                "records": records,
            }

            with open(catalog_path, "w", encoding="utf-8") as f:
                json.dump(catalog_data, f, indent=2)

            self.stdout.write(self.style.SUCCESS(
                f"Saved catalog with {len(records)} records ({len(by_username)} unique GitHub users) to {catalog_path}"
            ))

        if options.get("no_db_update"):
            self.stdout.write(self.style.WARNING("Skipping database update as --no-db-update was requested."))
            return

        # Fast in-memory matching against DB StudentProfiles
        db_start = time.time()
        profiles = list(StudentProfile.objects.select_related("user").all())
        self.stdout.write(f"Loaded {len(profiles)} StudentProfiles from database in {(time.time() - db_start):.3f}s.")

        to_update = []
        now = timezone.now()

        for profile in profiles:
            user = profile.user
            full_name = f"{user.first_name} {user.last_name}".strip().lower() if user else ""
            gh_user_db = (profile.github_username or "").strip().lower()

            matched_rec = None
            if gh_user_db:
                matched_rec = by_username.get(gh_user_db)
            if not matched_rec and full_name:
                matched_rec = by_name.get(full_name)

            if not matched_rec and profile.github_repo_url:
                clean_repo = profile.github_repo_url.strip().rstrip("/").lower()
                for rec in records:
                    if rec.get("repo_url", "").strip().rstrip("/").lower() == clean_repo:
                        matched_rec = rec
                        break

            is_modified = False

            if matched_rec:
                repo_url = matched_rec.get("repo_url")
                gh_user = matched_rec.get("github_username", "").strip()

                if repo_url and profile.github_repo_url != repo_url:
                    profile.github_repo_url = repo_url
                    is_modified = True

                if gh_user:
                    if profile.github_username != gh_user:
                        profile.github_username = gh_user
                        is_modified = True
                    expected_url = f"https://github.com/{gh_user}"
                    if profile.github_url != expected_url:
                        profile.github_url = expected_url
                        is_modified = True

                if not profile.is_github_connected:
                    profile.is_github_connected = True
                    is_modified = True

                if profile.github_org_invite_status != "ACCEPTED":
                    profile.github_org_invite_status = "ACCEPTED"
                    is_modified = True

            if is_modified:
                profile.updated_at = now
                to_update.append(profile)

        if to_update:
            batch_size = 500
            StudentProfile.objects.bulk_update(
                to_update,
                fields=[
                    "github_username",
                    "github_url",
                    "github_repo_url",
                    "is_github_connected",
                    "github_org_invite_status",
                    "updated_at",
                ],
                batch_size=batch_size,
            )
            self.stdout.write(self.style.SUCCESS(
                f"Successfully updated {len(to_update)} StudentProfiles in database via bulk_update."
            ))
        else:
            self.stdout.write("No unmatched StudentProfiles were found in current database.")

        total_elapsed = time.time() - start_time
        self.stdout.write(self.style.SUCCESS(
            f"\nCompleted in {total_elapsed:.2f}s! (Total records: {len(records)} | DB updated: {len(to_update)})"
        ))
