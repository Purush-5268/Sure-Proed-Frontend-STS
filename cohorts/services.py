import logging
from typing import Any, Dict

from django.conf import settings
from django.utils import timezone

from applications.models import Application, ApplicationStatusAudit
from common.models import Notification
from common.services.github_service import GitHubService
from common.services.notifications import notify_user
from applications.services.state_machine import validate_status_invariants, ApplicationStateInvariantError
from django.db import transaction

logger = logging.getLogger(__name__)


class RepositoryProvisioningNotAllowed(Exception):
    """Raised when the cohort has not completed the training grace period."""


def cohort_trainer_github_usernames(cohort) -> list[str]:
    """Return only active trainers assigned to this cohort, with duplicates removed."""
    usernames = []
    seen = set()
    for relation in (cohort.mentors, cohort.current_mentors):
        assigned = (
            relation.filter(role="MENTOR", is_active=True)
            .exclude(mentor_profile__github_username__isnull=True)
            .exclude(mentor_profile__github_username="")
            .values_list("mentor_profile__github_username", flat=True)
        )
        for username in assigned:
            clean_username = str(username or "").strip().rstrip("/").split("/")[-1]
            normalized = clean_username.casefold()
            if clean_username and normalized not in seen:
                usernames.append(clean_username)
                seen.add(normalized)
    return usernames


def ensure_cohort_repository_access(cohort, repo_url_or_name: str, student_username: str) -> dict:
    """Reapply student-write/trainer-read access for a managed cohort repository."""
    org_name = getattr(settings, "GITHUB_ORG_NAME", "sure-trust")
    repo_name = GitHubService.extract_repo_name(repo_url_or_name)
    access = GitHubService.ensure_repository_access(
        org_name,
        repo_name,
        student_username,
        trainer_usernames=cohort_trainer_github_usernames(cohort),
    )
    if not access["ok"]:
        failures = []
        if not access["student"]["granted"]:
            failures.append(f"student {access['student']['username'] or '(missing username)'} (write)")
        failures.extend(f"trainer {username} (read)" for username in access["failed_trainers"])
        raise ValueError("Required GitHub collaborator access failed: " + ", ".join(failures))
    return access


def _mark_github_queue_failed(item, error: Exception) -> str:
    from cohorts.models import GitHubProvisioningQueue

    item.status = GitHubProvisioningQueue.Status.FAILED
    item.error_message = str(error)
    item.retry_count += 1
    item.save(update_fields=["status", "error_message", "retry_count", "last_attempted_at", "updated_at"])
    return item.status


def process_single_github_queue_item(item) -> str:
    """
    Processes a single student from GitHubProvisioningQueue.
    If it succeeds: sends org invite, creates repo, initializes folders, marks SUCCESS.
    If it fails: records error, marks FAILED (saving to Failed Queue), and DOES NOT raise,
    allowing other students in the cohort to proceed smoothly.
    """
    import time
    from cohorts.models import GitHubProvisioningQueue
    from students.services.repo_lookup_service import auto_link_existing_repo

    student = item.student
    user = student.user
    cohort = item.cohort
    org_name = getattr(settings, "GITHUB_ORG_NAME", "sure-trust")

    item.last_attempted_at = timezone.now()
    gh_username = (student.github_username or item.github_username or "").strip()

    # 1. If student profile already has repo_url
    if student.github_repo_url:
        try:
            ensure_cohort_repository_access(cohort, student.github_repo_url, gh_username)
        except Exception as exc:
            logger.error(f"GitHub access sync failed for student {student.student_code}: {exc}")
            return _mark_github_queue_failed(item, exc)
        item.repo_url = student.github_repo_url
        item.status = GitHubProvisioningQueue.Status.SUCCESS
        item.error_message = None
        item.save(update_fields=["repo_url", "status", "error_message", "last_attempted_at", "updated_at"])
        return item.status

    # 2. Check in-memory catalog for existing repo
    auto_link_existing_repo(student, save=True)
    if student.github_repo_url:
        gh_username = (student.github_username or item.github_username or "").strip()
        try:
            ensure_cohort_repository_access(cohort, student.github_repo_url, gh_username)
        except Exception as exc:
            logger.error(f"GitHub access sync failed for student {student.student_code}: {exc}")
            return _mark_github_queue_failed(item, exc)
        item.repo_url = student.github_repo_url
        item.github_username = student.github_username or item.github_username
        item.status = GitHubProvisioningQueue.Status.SUCCESS
        item.error_message = None
        item.save(update_fields=["repo_url", "github_username", "status", "error_message", "last_attempted_at", "updated_at"])
        return item.status

    # 3. Check if student has connected GitHub
    if not (gh_username and student.is_github_connected):
        item.status = GitHubProvisioningQueue.Status.SKIPPED_NO_GITHUB
        item.error_message = "Student has not connected a GitHub account on their profile."
        item.save(update_fields=["status", "error_message", "last_attempted_at", "updated_at"])
        return item.status

    item.status = GitHubProvisioningQueue.Status.IN_PROGRESS
    item.github_username = gh_username
    item.save(update_fields=["status", "github_username", "last_attempted_at", "updated_at"])

    # 4. Filter 2: Direct confirmation via Organization Admin Token on GitHub
    if GitHubService.repo_exists(org_name, item.repo_name):
        try:
            ensure_cohort_repository_access(cohort, item.repo_name, gh_username)
        except Exception as exc:
            logger.error(f"GitHub access sync failed for student {student.student_code}: {exc}")
            return _mark_github_queue_failed(item, exc)
        confirmed_url = f"https://github.com/{org_name}/{item.repo_name}"
        student.github_repo_url = confirmed_url
        student.save(update_fields=["github_repo_url", "updated_at"])
        item.repo_url = confirmed_url
        item.status = GitHubProvisioningQueue.Status.SUCCESS
        item.error_message = None
        item.save(update_fields=["repo_url", "status", "error_message", "last_attempted_at", "updated_at"])
        return item.status

    # 5. Provision: Send Org Invite + Create Repo + Setup Folders
    try:
        student_name = f"{user.first_name} {user.last_name}".strip() or student.student_code
        batch_name = cohort.code or (cohort.course.name if cohort.course else "cohort")

        mentor_usernames = cohort_trainer_github_usernames(cohort)

        # Send Org Invite
        try:
            invite_res = GitHubService.invite_user_to_org(gh_username)
            if invite_res.get("state") in ["pending", "active"]:
                student.github_org_invite_status = "INVITED" if invite_res.get("state") == "pending" else "ACCEPTED"
        except Exception as inv_err:
            logger.warning(f"Org invite warning for {gh_username}: {inv_err}")

        # Create Repo & Collaborator
        repo_res = GitHubService.create_and_initialize_student_repo(
            github_username=gh_username,
            repo_name=item.repo_name,
            student_name=student_name,
            batch_name=batch_name,
            instructor_usernames=mentor_usernames,
        )

        if repo_res.get("error"):
            raise ValueError(repo_res["error"])

        repo_url = repo_res.get("html_url", f"https://github.com/{org_name}/{item.repo_name}")
        student.github_repo_url = repo_url
        if not student.github_url:
            student.github_url = f"https://github.com/{gh_username}"
        student.is_github_connected = True
        student.save(update_fields=["github_repo_url", "github_url", "is_github_connected", "github_org_invite_status", "updated_at"])

        item.repo_url = repo_url
        item.status = GitHubProvisioningQueue.Status.SUCCESS
        item.error_message = None
        item.save(update_fields=["repo_url", "status", "error_message", "last_attempted_at", "updated_at"])

        notify_user(
            user,
            title="GitHub workspace repository created",
            message=f"Your official SURE Trust course workspace repository ({item.repo_name}) has been created.",
            notification_type=Notification.Type.SUCCESS,
            action_url="application_tracker",
            dedupe_key=f"user:{user.id}:github:repo_created:{cohort.id}",
        )
        return item.status

    except Exception as exc:
        logger.error(f"GitHub repo provisioning failed for student {student.student_code}: {exc}")
        return _mark_github_queue_failed(item, exc)


def provision_cohort_student_repositories(cohort, force: bool = True) -> Dict[str, Any]:
    """
    Manually triggered by Admin or background scheduler.
    Uses the GitHubProvisioningQueue architecture:
    1. Enqueues all enrolled applications.
    2. Sequentially executes with rate-limit pacing (0.3s delay).
    3. If any student fails, they are saved into the Failed Queue and skipped,
       allowing the rest of the cohort to finish without failure.
    """
    import time
    from cohorts.models import GitHubProvisioningQueue

    if not force and not cohort.can_provision_github_repositories:
        eligible_at = cohort.github_repository_eligible_at
        if not cohort.training_started_at:
            reason = "The cohort must enter TRAINING before repositories can be created."
        elif cohort.status != cohort.Status.TRAINING:
            reason = "The cohort must currently be in TRAINING status."
        else:
            reason = f"The 15-day grace period ends at {eligible_at.isoformat()}."
        raise RepositoryProvisioningNotAllowed(reason)

    course_prefix = cohort.course.code.upper() if cohort.course else "COURSE"

    applications = cohort.applications.filter(
        status__in=[
            Application.Status.COHORT_ASSIGNED,
            Application.Status.IN_PROGRESS,
            Application.Status.TRAINING,
            Application.Status.INTERNSHIP_ASSIGNED,
        ]
    ).select_related("student", "student__user")

    results = {
        "cohort_code": cohort.code,
        "total_enrolled": applications.count(),
        "created_count": 0,
        "already_exists_count": 0,
        "skipped_no_github_count": 0,
        "failed_count": 0,
        "errors": [],
        "details": [],
        "permission_policy": {
            "student": "write",
            "assigned_trainers": "read",
        },
    }

    # 1. Enqueue all enrolled students into the queue
    queue_items = []
    for app in applications:
        student = app.student
        repo_name = f"{course_prefix}-{student.student_code}".lower().replace(" ", "-")
        queue_item, _ = GitHubProvisioningQueue.objects.get_or_create(
            cohort=cohort,
            student=student,
            defaults={
                "github_username": student.github_username or "",
                "repo_name": repo_name,
                "status": GitHubProvisioningQueue.Status.PENDING,
            }
        )
        queue_items.append(queue_item)

    # 2. Process with rate-limit pacing and failure isolation
    for item in queue_items:
        try:
            status = process_single_github_queue_item(item)
            if status == GitHubProvisioningQueue.Status.SUCCESS:
                results["created_count"] += 1
                results["details"].append({
                    "student_code": item.student.student_code,
                    "github_username": item.github_username,
                    "repo_url": item.repo_url,
                    "status": "SUCCESS",
                })
            elif status == GitHubProvisioningQueue.Status.FAILED:
                results["failed_count"] += 1
                results["errors"].append(f"{item.student.student_code}: {item.error_message}")
                results["details"].append({
                    "student_code": item.student.student_code,
                    "github_username": item.github_username,
                    "status": "FAILED",
                    "error": item.error_message,
                })
            elif status == GitHubProvisioningQueue.Status.SKIPPED_NO_GITHUB:
                results["skipped_no_github_count"] += 1
                results["details"].append({
                    "student_code": item.student.student_code,
                    "status": "SKIPPED_NO_GITHUB",
                    "message": item.error_message,
                })
        except Exception as unhandled:
            results["failed_count"] += 1
            results["errors"].append(f"{item.student.student_code}: {unhandled}")

        time.sleep(0.3)  # Polite pacing delay

    cohort.github_repositories_last_provisioned_at = timezone.now()
    cohort.save(update_fields=["github_repositories_last_provisioned_at", "updated_at"])
    results["provisioned_at"] = cohort.github_repositories_last_provisioned_at
    return results


def sync_cohort_application_statuses(cohort, user, old_status, new_status):
    """
    Synchronizes the Application.status of eligible enrolled students when a Cohort's status changes.
    Applies forward-progression rules and skips terminal/ineligible states.
    Uses bulk update and bulk create for audits to ensure atomicity and efficiency.
    Returns a dictionary with success and failure counts/logs.
    """
    from django.db import transaction
    from applications.models import Application, ApplicationStatusAudit
    from applications.services.state_machine import validate_status_invariants

    if old_status == new_status:
        return {"updated": 0, "skipped": 0, "logs": ["Skipped sync: Status unchanged."]}

    # Map cohort status to target application status
    target_map = {
        cohort.Status.DRAFT: None,
        cohort.Status.OPEN: None,
        cohort.Status.ACTIVE: Application.Status.IN_PROGRESS,
        cohort.Status.TRAINING: Application.Status.TRAINING,
        cohort.Status.INTERNSHIP: Application.Status.INTERNSHIP_ASSIGNED,
        cohort.Status.SOFT_SKILLS: Application.Status.IN_PROGRESS,
        cohort.Status.COMPLETED: Application.Status.COMPLETED,
        cohort.Status.CANCELLED: Application.Status.CANCELLED,
    }

    target_status = target_map.get(new_status)
    if not target_status:
        return {"updated": 0, "skipped": 0, "logs": [f"No mapped target status for cohort status '{new_status}'."]}

    progression_order = {
        Application.Status.COHORT_ASSIGNED: 1,
        Application.Status.IN_PROGRESS: 2,
        Application.Status.TRAINING: 3,
        Application.Status.INTERNSHIP_ASSIGNED: 4,
        Application.Status.COMPLETED: 5,
    }

    enrolled_statuses = [
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
    ]

    target_level = progression_order.get(target_status, 99) if target_status != Application.Status.CANCELLED else 99

    logs = []
    updated_count = 0
    skipped_count = 0

    with transaction.atomic():
        # Lock eligible applications to prevent concurrent state updates
        apps = list(cohort.applications.select_for_update().filter(status__in=enrolled_statuses))
        
        apps_to_update = []
        audits_to_create = []

        now = timezone.now()

        for app in apps:
            current_status = app.status
            
            # Forward progression check (unless it's a cancellation override)
            if target_status != Application.Status.CANCELLED:
                current_level = progression_order.get(current_status, 0)
                if current_level >= target_level:
                    skipped_count += 1
                    logs.append(f"App {app.application_number}: Skipped. Already at level {current_level} (>= target {target_level}).")
                    continue
                
            # Validate invariants
            try:
                validate_status_invariants(app, target_status)
            except Exception as e:
                skipped_count += 1
                logs.append(f"App {app.application_number}: Skipped due to validation failure: {str(e)}")
                continue

            # Stage updates
            app.status = target_status
            app.updated_at = now
            apps_to_update.append(app)

            audits_to_create.append(
                ApplicationStatusAudit(
                    application=app,
                    from_status=current_status,
                    to_status=target_status,
                    actor=user if user and getattr(user, 'is_authenticated', False) else None,
                    reason=f"Cohort transitioned from {old_status} to {new_status}",
                    is_repair=False
                )
            )

        if apps_to_update:
            Application.objects.bulk_update(apps_to_update, ['status', 'updated_at'])
            ApplicationStatusAudit.objects.bulk_create(audits_to_create)
            updated_count = len(apps_to_update)
            logs.append(f"Successfully updated {updated_count} applications to {target_status}.")

    logger.info(f"Cohort {cohort.code} sync to {new_status}: Updated {updated_count}, Skipped {skipped_count}. Logs: {logs}")
    
    if updated_count > 0:
        from django.core.cache import cache
        cache.delete('platform:analytics:stats')
        
    return {
        "updated": updated_count,
        "skipped": skipped_count,
        "logs": logs
    }

def sync_cohort_applications_status(cohort, new_status, user=None):
    """
    Synchronizes the statuses of all active applications in a cohort to match the cohort's new status.
    Executes a transaction-safe bulk update while strictly preserving invariants and avoiding regressions.

    Lifecycle Progression Architecture:
    -----------------------------------
    1. Granular Dual-Gate Pre-Screening:
       - APPLIED: Student submits application.
       - EXAM_PENDING -> EXAM_COMPLETED: Exam scheduled and completed (if course requires_exam=True).
       - PRESCREENING_PENDING -> PRESCREENING_COMPLETED: Interview scheduled and conducted (if requires_interview=True).
       - REJECTED / DROPPED: Terminal state if candidate fails or is disqualified at any screening stage.
       - QUALIFIED: Base qualified state awaiting cohort allocation.
    2. Cohort Allocation & Progression:
       - COHORT_ASSIGNED (Rank 0): Cohort allocated to the fully qualified student.
       - ACTIVE -> IN_PROGRESS (Rank 1): Cohort is active, but core training sessions have not begun.
       - TRAINING -> TRAINING (Rank 2): Core technical training modules executed in sequence.
       - Capstone Bridge & Allocation: When the last ordered technical module completes and the Capstone
         Project is assigned, application status transitions to INTERNSHIP_ASSIGNED (Rank 3).
       - INTERNSHIP -> INTERNSHIP_ASSIGNED (Rank 3): Student executes capstone project work while
         undertaking the distinct, independent Soft Skills training and evaluation phase.
       - COMPLETED -> COMPLETED (Rank 4): Final graduation triggered after successful capstone
         project submission/evaluation and verification of soft skills completion.
    """
    from cohorts.models import Cohort
    COHORT_TO_APP_STATUS = {
        Cohort.Status.ACTIVE: Application.Status.IN_PROGRESS,
        Cohort.Status.TRAINING: Application.Status.TRAINING,
        Cohort.Status.INTERNSHIP: Application.Status.INTERNSHIP_ASSIGNED,
        Cohort.Status.COMPLETED: Application.Status.COMPLETED,
        Cohort.Status.CANCELLED: Application.Status.CANCELLED,
    }

    APPLICATION_STATUS_RANKING = {
        Application.Status.COHORT_ASSIGNED: 0,
        Application.Status.IN_PROGRESS: 1,
        Application.Status.TRAINING: 2,
        Application.Status.INTERNSHIP_ASSIGNED: 3,
        Application.Status.COMPLETED: 4,
        Application.Status.CANCELLED: 99,
    }

    target_status = COHORT_TO_APP_STATUS.get(new_status)
    if not target_status:
        return

    target_rank = APPLICATION_STATUS_RANKING.get(target_status, -1)
    if target_rank == -1:
        return

    # Strictly enrolled statuses (no DROPPED, SUSPENDED, CANCELLED, REJECTED, TRANSFER_COHORT)
    eligible_statuses = [
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
    ]

    with transaction.atomic():
        # Lock the cohort row just in case
        Cohort.objects.select_for_update().filter(pk=cohort.pk).first()

        # Query eligible applications
        applications = list(
            Application.objects.select_for_update().filter(
                assigned_cohort=cohort,
                status__in=eligible_statuses
            )
        )

        apps_to_update = []
        audits_to_create = []
        now = timezone.now()

        for app in applications:
            current_rank = APPLICATION_STATUS_RANKING.get(app.status, -1)
            
            # 1. Prevent Status Regression
            if target_status != Application.Status.CANCELLED and current_rank >= target_rank:
                continue
                
            # 2. Validate Invariants
            try:
                validate_status_invariants(app, target_status)
            except ApplicationStateInvariantError as e:
                logger.warning(
                    f"Skipping sync to {target_status} for Application {app.application_number} due to invariant failure: {e}"
                )
                continue
            except Exception as e:
                logger.error(
                    f"Unexpected error validating invariants for Application {app.application_number}: {e}"
                )
                continue

            # 3. Prepare for Bulk Update
            old_status = app.status
            app.status = target_status
            app.updated_at = now
            apps_to_update.append(app)
            
            # Prepare audit record
            audits_to_create.append(
                ApplicationStatusAudit(
                    application=app,
                    from_status=old_status,
                    to_status=target_status,
                    actor=user if user and getattr(user, 'is_authenticated', False) else None,
                    reason=f"Auto-sync from cohort status transition to {new_status}",
                    is_repair=False,
                )
            )

        if apps_to_update:
            Application.objects.bulk_update(apps_to_update, fields=["status", "updated_at"])
            ApplicationStatusAudit.objects.bulk_create(audits_to_create)
            
            # Clear analytics cache since statuses changed
            from django.core.cache import cache
            cache.delete('platform:analytics:stats')
            
            logger.info(f"Successfully bulk updated {len(apps_to_update)} applications to {target_status} for Cohort {cohort.code}.")
