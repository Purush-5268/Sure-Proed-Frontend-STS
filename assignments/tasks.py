"""Safe, course-neutral automated source review for assignment submissions.

The reviewer never clones or executes student code. It reads a bounded snapshot of
one immutable GitHub commit and asks the configured Gemini model to score that
snapshot against the mentor-authored rubric. The result is advisory until a mentor
records the official marks.
"""

from __future__ import annotations

import base64
import json
import re
from decimal import Decimal
from urllib.parse import urlparse

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import Submission


ALLOWED_SOURCE_SUFFIXES = {
    ".c", ".cc", ".cpp", ".css", ".go", ".h", ".hpp", ".html", ".java",
    ".js", ".jsx", ".json", ".kt", ".md", ".php", ".py", ".rb", ".rs",
    ".sql", ".sv", ".ts", ".tsx", ".txt", ".v", ".vhd", ".vhdl", ".xml",
    ".yaml", ".yml",
}
MAX_FILES = 30
MAX_FILE_BYTES = 30_000
MAX_TOTAL_BYTES = 180_000


def _repository_coordinates(repository_url: str) -> tuple[str, str]:
    parsed = urlparse(repository_url)
    if parsed.scheme != "https" or parsed.hostname not in {"github.com", "www.github.com"}:
        raise ValueError("Only HTTPS GitHub repository URLs are supported.")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise ValueError("The GitHub repository URL is incomplete.")
    owner, repository = parts[0], parts[1].removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repository):
        raise ValueError("The GitHub repository coordinates are invalid.")
    return owner, repository


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SURE-ProEd-assignment-reviewer",
    }
    token = str(getattr(settings, "GITHUB_ORG_ADMIN_TOKEN", "") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _github_json(url: str) -> dict:
    response = requests.get(url, headers=_github_headers(), timeout=20)
    response.raise_for_status()
    return response.json()


def _read_commit_snapshot(repository_url: str, requested_sha: str) -> tuple[str, list[str]]:
    owner, repository = _repository_coordinates(repository_url)
    api_root = f"https://api.github.com/repos/{owner}/{repository}"
    commit = _github_json(f"{api_root}/commits/{requested_sha}")
    resolved_sha = str(commit.get("sha") or "").lower()
    if resolved_sha != requested_sha.lower():
        raise ValueError("GitHub did not resolve the exact immutable commit requested.")
    tree_sha = commit.get("commit", {}).get("tree", {}).get("sha")
    if not tree_sha:
        raise ValueError("The GitHub commit does not contain a readable tree.")
    tree = _github_json(f"{api_root}/git/trees/{tree_sha}?recursive=1").get("tree", [])

    sections = []
    included_paths = []
    total_bytes = 0
    for entry in tree:
        path = str(entry.get("path") or "")
        suffix = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
        size = int(entry.get("size") or 0)
        if entry.get("type") != "blob" or suffix not in ALLOWED_SOURCE_SUFFIXES:
            continue
        if size > MAX_FILE_BYTES or len(included_paths) >= MAX_FILES or total_bytes >= MAX_TOTAL_BYTES:
            continue
        blob = _github_json(str(entry.get("url")))
        if blob.get("encoding") != "base64":
            continue
        raw = base64.b64decode(blob.get("content", ""), validate=False)
        remaining = MAX_TOTAL_BYTES - total_bytes
        raw = raw[: min(MAX_FILE_BYTES, remaining)]
        content = raw.decode("utf-8", errors="replace")
        sections.append(f"\n--- FILE: {path} ---\n{content}")
        included_paths.append(path)
        total_bytes += len(raw)
    if not sections:
        raise ValueError("No supported text/source files were found in this commit.")
    return "".join(sections), included_paths


def _score_with_gemini(submission: Submission, snapshot: str, included_paths: list[str]) -> dict:
    from question_bank.services.ai.gemini_provider import GeminiProvider

    assignment = submission.assignment
    provider = GeminiProvider(
        api_key=getattr(settings, "AI_GENERATOR_API_KEY", ""),
        model_name=getattr(settings, "AI_GENERATOR_MODEL", "gemini-3.6-flash"),
    )
    prompt = f"""
You are an assistive technical assignment reviewer. Review only the supplied immutable
source snapshot. Never claim that code was compiled or executed. Score it against the
mentor rubric and return strict JSON with keys: score (number from 0 to {assignment.max_marks}),
summary (string), strengths (array of strings), improvements (array of strings),
rubric_breakdown (array of objects with criterion, score, reason), and limitations
(array of strings).

Course: {assignment.cohort.course.name}
Assignment: {assignment.title}
Instructions: {assignment.description}
Mentor rubric: {assignment.autograding_rubric}
Files reviewed: {json.dumps(included_paths)}
Maximum marks: {assignment.max_marks}

IMMUTABLE SOURCE SNAPSHOT:
{snapshot}
""".strip()
    raw = provider._call_gemini_rest(prompt, temperature=0.1)
    report = json.loads(provider._clean_json_text(raw))
    score = Decimal(str(report.get("score", 0)))
    report["score"] = float(max(Decimal("0"), min(score, assignment.max_marks)))
    report["review_mode"] = "static_source_review"
    report["human_approval_required"] = True
    report["commit_sha"] = submission.commit_sha
    return report


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def auto_grade_submission_task(self, submission_id: str):
    updated = Submission.objects.filter(
        id=submission_id,
        autograding_status=Submission.AutoGradingStatus.QUEUED,
    ).update(autograding_status=Submission.AutoGradingStatus.PROCESSING)
    if not updated:
        return
    try:
        submission = Submission.objects.select_related(
            "assignment", "assignment__cohort", "assignment__cohort__course", "student"
        ).get(id=submission_id)
        snapshot, included_paths = _read_commit_snapshot(
            submission.submission_url, submission.commit_sha
        )
        report = _score_with_gemini(submission, snapshot, included_paths)
        feedback = str(report.get("summary") or "Automated static source review completed.")
        Submission.objects.filter(id=submission_id).update(
            autograding_status=Submission.AutoGradingStatus.COMPLETED,
            auto_marks=Decimal(str(report["score"])),
            auto_feedback=feedback,
            auto_report=report,
            auto_graded_at=timezone.now(),
            updated_at=timezone.now(),
        )
    except Exception as exc:
        Submission.objects.filter(id=submission_id).update(
            autograding_status=Submission.AutoGradingStatus.FAILED,
            auto_feedback=(
                "Automated review could not be completed. The mentor can still grade this "
                f"submission manually. Error type: {exc.__class__.__name__}."
            ),
            updated_at=timezone.now(),
        )

