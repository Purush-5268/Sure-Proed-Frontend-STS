import logging
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.db.models import F

from celery import shared_task

from applications.models import Application
from cohorts.models import Cohort
from applications.services.offer_letter_generator import issue_offer_letter
from common.services.notifications import notify_user, notify_mentors
from common.models import Notification

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def process_automatic_offer_letters(self):
    """
    Periodic task to automatically generate Offer Letters for eligible students.
    Eligibility: 
    - Application status is active (e.g. IN_PROGRESS, COHORT_ASSIGNED, COMPLETED, INTERNSHIP_ASSIGNED).
    - Cohort start_date + 1 month has elapsed.
    - Offer letter has not already been issued.
    """
    logger.info("Starting automatic offer letter generation process.")
    
    # 1 calendar month threshold
    # Note: Because exact relativedelta(months=1) varies by start_date, 
    # we filter heuristically in DB for >= 28 days, then do strict check in memory
    cutoff_estimate = timezone.now() - timezone.timedelta(days=28)
    
    # Eligible statuses (excluding SUSPENDED, CANCELLED, PRE_SCREENING, etc)
    eligible_statuses = [
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
        Application.Status.COMPLETED,
    ]
    
    # Find candidates
    candidates = Application.objects.filter(
        status__in=eligible_statuses,
        assigned_cohort__isnull=False,
        assigned_cohort__start_date__lte=cutoff_estimate,
        offer_letter_issued=False,
        offer_letter_file=''
    ).select_related('assigned_cohort', 'student__user').iterator(chunk_size=100)
    
    generated_count = 0
    cohort_stats = {}
    
    now = timezone.now().date()
    
    for app in candidates:
        cohort = app.assigned_cohort
        strict_cutoff = cohort.start_date + relativedelta(months=1)
        
        if now >= strict_cutoff:
            try:
                with transaction.atomic():
                    # Claim atomic lock for this single application to prevent concurrent generation
                    locked_app = Application.objects.select_for_update(skip_locked=True).filter(pk=app.pk, offer_letter_issued=False).first()
                    
                    if not locked_app:
                        continue # Already processed or locked by another worker
                        
                    # Re-check status inside lock just in case it was suspended since query
                    if locked_app.status not in eligible_statuses:
                        continue
                        
                    # Generate and save the PDF
                    issue_offer_letter(locked_app)
                    
                    generated_count += 1
                    cohort_id = cohort.id
                    if cohort_id not in cohort_stats:
                        cohort_stats[cohort_id] = {'cohort': cohort, 'count': 0}
                    cohort_stats[cohort_id]['count'] += 1
                    
                    # Notify student
                    action_url = f"/offer-letter"
                    notify_user(
                        user=locked_app.student.user,
                        title="Offer Letter Issued",
                        message=f"Your Offer Letter for the {cohort.course.name} program has been successfully issued.",
                        notification_type=Notification.Type.SUCCESS,
                        action_url=action_url,
                        dedupe_key=f"offer_letter_auto_{locked_app.id}"
                    )
            except Exception as e:
                logger.error(f"Error generating offer letter for application {app.id}: {e}")
                
    # Send aggregate notifications to cohort mentors/admins
    for stat in cohort_stats.values():
        cohort = stat['cohort']
        count = stat['count']
        notify_mentors(
            cohort,
            title="Bulk Offer Letters Generated",
            message=f"Automatic process generated {count} offer letters for {cohort.code} - {cohort.name}.",
            notification_type=Notification.Type.INFO,
            dedupe_key=f"bulk_offer_letters_{cohort.id}_{now}"
        )
        
    logger.info(f"Automatic offer letter process completed. Generated {generated_count} letters.")
    return f"Generated {generated_count} offer letters."


@shared_task(bind=True, max_retries=3)
def bulk_generate_cohort_offer_letters(self, cohort_id, admin_user_id):
    """
    Manually triggered bulk generation for an entire cohort.
    Generates letters for all eligible students in the cohort who don't have one yet.
    """
    from accounts.models import User
    
    logger.info(f"Starting bulk offer letter generation for cohort {cohort_id} triggered by user {admin_user_id}")
    
    try:
        cohort = Cohort.objects.get(pk=cohort_id)
        admin_user = User.objects.get(pk=admin_user_id)
    except (Cohort.DoesNotExist, User.DoesNotExist) as e:
        logger.error(f"Bulk generation failed: {e}")
        return "Invalid cohort or user"
        
    eligible_statuses = [
        Application.Status.COHORT_ASSIGNED,
        Application.Status.IN_PROGRESS,
        Application.Status.TRAINING,
        Application.Status.INTERNSHIP_ASSIGNED,
        Application.Status.COMPLETED,
    ]
    
    candidates = Application.objects.filter(
        assigned_cohort=cohort,
        status__in=eligible_statuses,
        offer_letter_issued=False,
        offer_letter_file=''
    ).select_related('student__user')
    
    total_eligible = candidates.count()
    generated_count = 0
    
    for app in candidates.iterator(chunk_size=50):
        try:
            with transaction.atomic():
                locked_app = Application.objects.select_for_update(skip_locked=True).filter(pk=app.pk, offer_letter_issued=False).first()
                if not locked_app or locked_app.status not in eligible_statuses:
                    continue
                    
                issue_offer_letter(locked_app)
                generated_count += 1
        except Exception as e:
            logger.error(f"Error bulk generating offer letter for app {app.id}: {e}")
            
    # Notify the admin who triggered it
    notify_user(
        user=admin_user,
        title="Bulk Generation Complete",
        message=f"Bulk offer letter generation for {cohort.code} complete. {generated_count} out of {total_eligible} eligible letters generated.",
        notification_type=Notification.Type.SUCCESS,
        dedupe_key=f"bulk_complete_{cohort.id}_{timezone.now().timestamp()}"
    )
    
    return {"cohort": cohort_id, "generated": generated_count, "eligible": total_eligible}


@shared_task
def auto_mark_missed_prescreening_exams():
    """
    Periodic task scanning for pre-screening candidates who missed their scheduled exam window.
    Disqualifies them, sets application.qualified=False, and sends notification with the reason.
    """
    from applications.services.workflow_service import mark_missed_prescreening_exams
    logger.info("Running automatic missed pre-screening exams check.")
    count = mark_missed_prescreening_exams()
    logger.info(f"Auto-marked {count} candidate(s) as missed/not qualified for pre-screening.")
    return {"disqualified_count": count}

