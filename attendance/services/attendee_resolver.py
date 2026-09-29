import logging
from applications.models import Application
from cohorts.models import Cohort

logger = logging.getLogger(__name__)

class AttendeeResolver:
    """
    Centralized service to resolve and deduplicate expected student emails
    for Google Calendar/Meet generation and attendance reports.
    """


    @classmethod
    def get_effective_apps(cls, base_qs, session_time=None):
        """
        Returns a queryset of Applications annotated with `effective_status` at the given `session_time`.
        If `session_time` is None, uses current `status`.
        """
        from django.db.models import F
        if not session_time:
            return base_qs.annotate(effective_status=F('status'))

        from django.db.models import OuterRef, Subquery
        from django.db.models.functions import Coalesce
        from applications.models import ApplicationStatusAudit

        latest_audit = ApplicationStatusAudit.objects.filter(
            application=OuterRef('pk'),
            created_at__lte=session_time
        ).order_by('-created_at')

        earliest_future_audit = ApplicationStatusAudit.objects.filter(
            application=OuterRef('pk'),
            created_at__gt=session_time
        ).order_by('created_at')

        return base_qs.annotate(
            effective_status=Coalesce(
                Subquery(latest_audit.values('to_status')[:1]),
                Subquery(earliest_future_audit.values('from_status')[:1]),
                F('status')
            )
        )

    @classmethod
    def resolve_emails_by_criteria(cls, class_type, cohort_id=None, lst_batch=None, session_time=None):

        """
        Extract eligible StudentProfile emails for a given criteria.
        Returns a deduplicated list of lowercase email strings.
        """
        emails = set()

        try:
            if class_type == "DOMAIN":
                if not cohort_id:
                    return []

                qs = Application.objects.filter(
                    assigned_cohort_id=cohort_id,
                    student__user__email__isnull=False
                ).exclude(
                    assigned_cohort__status=Cohort.Status.SOFT_SKILLS
                )
                app_emails = cls.get_effective_apps(qs, session_time).filter(
                    effective_status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "TRANSFER_COHORT"]
                ).values_list('student__user__email', flat=True).iterator(chunk_size=2000)

                for email in app_emails:
                    if email and email.strip():
                        emails.add(email.strip().lower())

                mentor_emails_1 = Cohort.objects.filter(
                    id=cohort_id,
                    mentors__is_active=True,
                ).values_list('mentors__mapped_email', 'mentors__email')

                mentor_emails_2 = Cohort.objects.filter(
                    id=cohort_id,
                    current_mentors__is_active=True,
                ).values_list('current_mentors__mapped_email', 'current_mentors__email')

                for mapped_email, primary_email in list(mentor_emails_1) + list(mentor_emails_2):
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())
                        
                volunteer_emails = Cohort.objects.filter(
                    id=cohort_id,
                    volunteers__is_active=True,
                ).values_list('volunteers__mapped_email', 'volunteers__email')
                for mapped_email, primary_email in volunteer_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())
                        
                from django.contrib.auth import get_user_model
                User = get_user_model()
                admin_emails = User.objects.filter(role='ADMIN', is_active=True).values_list('mapped_email', 'email')
                for mapped_email, primary_email in admin_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())

            elif class_type == "LST":
                qs = Application.objects.filter(
                    student__user__email__isnull=False
                )
                qs = cls.get_effective_apps(qs, session_time).filter(
                    effective_status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]
                )

                cohort_qs = Cohort.objects.filter(
                    status__in=[
                        Cohort.Status.ACTIVE,
                        Cohort.Status.TRAINING,
                        Cohort.Status.INTERNSHIP,
                        Cohort.Status.SOFT_SKILLS
                    ]
                )

                if lst_batch == 'COMBINED':
                    qs = qs.filter(assigned_cohort__lst_batch__in=['BATCH_1', 'BATCH_2'])
                    cohort_qs = cohort_qs.filter(lst_batch__in=['BATCH_1', 'BATCH_2'])
                if lst_batch and lst_batch not in ["GENERAL", "", "COMBINED"]:
                    app_emails = qs.filter(
                        assigned_cohort__lst_batch=lst_batch,
                        assigned_cohort__status__in=[
                            Cohort.Status.ACTIVE,
                            Cohort.Status.TRAINING,
                            Cohort.Status.INTERNSHIP,
                            Cohort.Status.SOFT_SKILLS
                        ]
                    ).values_list('student__user__email', flat=True).iterator(chunk_size=2000)

                    cohort_qs = cohort_qs.filter(lst_batch=lst_batch)
                else:
                    app_emails = qs.filter(
                        assigned_cohort__isnull=False,
                        assigned_cohort__status__in=[
                            Cohort.Status.ACTIVE,
                            Cohort.Status.TRAINING,
                            Cohort.Status.INTERNSHIP,
                            Cohort.Status.SOFT_SKILLS
                        ]
                    ).values_list('student__user__email', flat=True).iterator(chunk_size=2000)
                    
                    cohort_qs = cohort_qs.filter(lst_batch__isnull=False)

                    cohort_qs = cohort_qs.filter(lst_batch__isnull=False)

                for email in app_emails:
                    if email and email.strip():
                        emails.add(email.strip().lower())
                        
                volunteer_emails = cohort_qs.filter(
                    volunteers__is_active=True,
                ).values_list('volunteers__mapped_email', 'volunteers__email')
                for mapped_email, primary_email in volunteer_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())
                        
                from django.contrib.auth import get_user_model
                User = get_user_model()
                admin_emails = User.objects.filter(role='ADMIN', is_active=True).values_list('mapped_email', 'email')
                for mapped_email, primary_email in admin_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())


            elif class_type == "SOFTSKILLS":
                qs = Application.objects.filter(
                    assigned_cohort__status=Cohort.Status.SOFT_SKILLS,
                    student__user__email__isnull=False
                )
                qs = cls.get_effective_apps(qs, session_time).filter(
                    effective_status__in=["SOFT_SKILLS"]
                )

                cohort_qs = Cohort.objects.filter(status=Cohort.Status.SOFT_SKILLS)

                if lst_batch == 'COMBINED':
                    qs = qs.filter(assigned_cohort__lst_batch__in=['BATCH_1', 'BATCH_2'])
                    cohort_qs = cohort_qs.filter(lst_batch__in=['BATCH_1', 'BATCH_2'])
                if lst_batch and lst_batch not in ["GENERAL", "", "COMBINED"]:
                    app_emails = qs.filter(
                        assigned_cohort__lst_batch=lst_batch
                    ).values_list('student__user__email', flat=True).iterator(chunk_size=2000)

                    cohort_qs = cohort_qs.filter(lst_batch=lst_batch)
                else:
                    app_emails = qs.filter(
                        assigned_cohort__lst_batch__isnull=False
                    ).values_list('student__user__email', flat=True).iterator(chunk_size=2000)
                    
                    cohort_qs = cohort_qs.filter(lst_batch__isnull=False)

                    cohort_qs = cohort_qs.filter(lst_batch__isnull=False)

                for email in app_emails:
                    if email and email.strip():
                        emails.add(email.strip().lower())
                        
                volunteer_emails = cohort_qs.filter(
                    volunteers__is_active=True,
                ).values_list('volunteers__mapped_email', 'volunteers__email')
                for mapped_email, primary_email in volunteer_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())
                        
                from django.contrib.auth import get_user_model
                User = get_user_model()
                admin_emails = User.objects.filter(role='ADMIN', is_active=True).values_list('mapped_email', 'email')
                for mapped_email, primary_email in admin_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())


            elif class_type in ["CELEBRATION", "UNIVERSAL"]:
                qs = Application.objects.filter(
                    assigned_cohort__isnull=False,
                    student__user__email__isnull=False
                )

                app_emails = cls.get_effective_apps(qs, session_time).filter(
                    effective_status__in=["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "TRANSFER_COHORT"]
                ).values_list('student__user__email', flat=True).iterator(chunk_size=2000)

                for email in app_emails:
                    if email and email.strip():
                        emails.add(email.strip().lower())
                        
                from django.contrib.auth import get_user_model
                User = get_user_model()
                staff_emails = User.objects.filter(role__in=['ADMIN', 'VOLUNTEER', 'TRUSTEE'], is_active=True).values_list('mapped_email', 'email')
                for mapped_email, primary_email in staff_emails:
                    email_to_use = mapped_email if mapped_email else primary_email
                    if email_to_use and email_to_use.strip():
                        emails.add(email_to_use.strip().lower())

        except Exception as e:
            logger.exception(f"Error resolving attendees for {class_type} (cohort={cohort_id}, batch={lst_batch}): {e}")

        return list(emails)

    @classmethod
    def resolve_session_attendees(cls, session):
        """
        Extract eligible student emails directly from an Attendance session instance.
        """
        cohort_id = session.cohort_id if session.cohort else None

        # Base roster emails
        from django.utils import timezone
        from datetime import datetime
        if session.class_date and session.start_time:
            session_time = timezone.make_aware(datetime.combine(session.class_date, session.start_time))
        else:
            session_time = getattr(session, 'created_at', timezone.now())
        emails = set(cls.resolve_emails_by_criteria(
            class_type=session.class_type,
            cohort_id=cohort_id,
            lst_batch=session.lst_batch,
            session_time=session_time
        ))

        # Add any explicitly whitelisted guest emails
        if session.guest_emails:
            for ge in session.guest_emails:
                if isinstance(ge, str) and ge.strip():
                    emails.add(ge.strip().lower())

        return list(emails)
