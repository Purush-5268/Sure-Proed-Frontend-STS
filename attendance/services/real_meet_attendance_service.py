import logging
import json
from datetime import datetime
import datetime as dt
from django.conf import settings
from students.models import StudentIdentityAlias
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from students.models import StudentProfile

logger = logging.getLogger(__name__)

import re

def _extract_name_tokens(name_str):
    import re
    name = name_str or ""
    # Split CamelCase and joined initials (e.g. TPradeep -> T Pradeep)
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    name = re.sub(r'([A-Z])([A-Z][a-z])', r'\1 \2', name)
    name = name.lower()
    name = re.sub(r'[^a-z0-9\s]', ' ', name)
    tokens = name.split()
    return frozenset(tokens), " ".join(tokens)

class RealMeetAttendanceService:
    """
    Official Google Meet Attendance Retrieval via Google Workspace Admin SDK Reports API.

    API: admin.googleapis.com
    Scope: https://www.googleapis.com/auth/admin.reports.audit.readonly
    """

    @staticmethod
    def _extract_meeting_code(meeting_link):
        if not meeting_link:
            return None
        # e.g., https://meet.google.com/abc-defg-hij -> abcdefghij
        code = meeting_link.split("/")[-1].split("?")[0]
        return code.lower()

    @staticmethod
    def get_credentials():
        """Retrieve Google OAuth credentials from settings/.env."""
        from google.oauth2.credentials import Credentials
        import os

        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', os.getenv('GOOGLE_CLIENT_ID'))
        client_secret = getattr(settings, 'GOOGLE_CLIENT_SECRET', os.getenv('GOOGLE_CLIENT_SECRET'))
        refresh_token = getattr(settings, 'GOOGLE_REFRESH_TOKEN', os.getenv('GOOGLE_REFRESH_TOKEN'))

        if client_id and client_secret and refresh_token:
            return Credentials(
                token=None,
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
                token_uri="https://oauth2.googleapis.com/token"
            )
        return None

    @classmethod
    def get_expected_roster(cls, session):
        from applications.models import Application
        from cohorts.models import Cohort
        from students.models import StudentProfile
        from attendance.services.attendee_resolver import AttendeeResolver

        apps = Application.objects.filter(
            student__user__email__isnull=False
        ).select_related('student__user', 'course', 'assigned_cohort', 'student__google_identity')
        
        from django.utils import timezone
        from datetime import datetime
        if getattr(session, 'class_date', None) and getattr(session, 'start_time', None):
            session_time = timezone.make_aware(datetime.combine(session.class_date, session.start_time))
        else:
            session_time = getattr(session, 'created_at', timezone.now())

        if session.class_type == "DOMAIN":
            apps = apps.exclude(
                status__in=["DROPPED", "SUSPENDED", "CANCELLED", "REJECTED", "COMPLETED", "TRANSFER_COHORT"]
            ).filter(
                assigned_cohort_id=session.cohort_id
            ).exclude(
                assigned_cohort__status=Cohort.Status.SOFT_SKILLS
            ) if session.cohort_id else apps.none()
        elif session.class_type == "LST":
            apps = apps.exclude(
                status__in=["DROPPED", "SUSPENDED", "CANCELLED", "REJECTED", "COMPLETED", "TRANSFER_COHORT"]
            ).filter(
                assigned_cohort__lst_batch=session.lst_batch,
                assigned_cohort__status__in=[
                    Cohort.Status.ACTIVE,
                    Cohort.Status.TRAINING,
                    Cohort.Status.INTERNSHIP,
                    Cohort.Status.SOFT_SKILLS
                ]
            ) if session.lst_batch else apps.exclude(
                status__in=["DROPPED", "SUSPENDED", "CANCELLED", "REJECTED", "COMPLETED", "TRANSFER_COHORT"]
            ).filter(
                assigned_cohort__lst_batch__isnull=False,
                assigned_cohort__status__in=[
                    Cohort.Status.ACTIVE,
                    Cohort.Status.TRAINING,
                    Cohort.Status.INTERNSHIP,
                    Cohort.Status.SOFT_SKILLS
                ]
            )
        elif session.class_type == "SOFTSKILLS":
            apps = apps.exclude(
                status__in=["DROPPED", "SUSPENDED", "CANCELLED", "REJECTED", "COMPLETED", "TRANSFER_COHORT"]
            ).filter(
                assigned_cohort__status=Cohort.Status.SOFT_SKILLS
            )
        elif session.class_type in ["CELEBRATION", "UNIVERSAL"]:
            apps = apps.exclude(
                status__in=["DROPPED", "SUSPENDED", "CANCELLED", "REJECTED", "COMPLETED", "TRANSFER_COHORT"]
            ).filter(
                assigned_cohort__isnull=False
            )

        expected_roster = {}
        for app in apps:
            email = app.student.user.email.strip().lower()
            expected_roster[email] = app

        if session.guest_emails:
            for guest_email in session.guest_emails:
                g_e = guest_email.strip().lower()
                if g_e not in expected_roster:
                    try:
                        s = StudentProfile.objects.select_related('user').get(user__email__iexact=g_e)
                        class FakeApp:
                            student = s
                            course = None
                            assigned_cohort = None
                            required_meet_display_name = None
                            status = "GUEST"

                            def get_dynamic_required_meet_name(self, prefer_google_profile=True):
                                return None

                        expected_roster[g_e] = FakeApp()
                    except:
                        pass
        return expected_roster

    @staticmethod
    def get_structured_attendance(session, scope='all', scope_id=None):
        """
        Retrieves official structured attendance from Google Workspace Reports API
        and matches participants with authoritative database records.
        """
        if session.historical_attendance_data and not session.meeting_link:
            return {"status": "NOT_APPLICABLE", "message": "This is an imported historical register, not a Google Meet session."}
        creds = RealMeetAttendanceService.get_credentials()
        if not creds:
            return {
                "status": "CONFIG_ERROR",
                "message": "Google Workspace credentials not configured. Required scope: https://www.googleapis.com/auth/admin.reports.audit.readonly"
            }

        meeting_code = RealMeetAttendanceService._extract_meeting_code(session.meeting_link)
        if not meeting_code:
            return {
                "status": "ERROR",
                "message": f"Cannot fetch official attendance without a valid meeting link for session {session.id}."
            }

        try:
            meet_service = build('meet', 'v2', credentials=creds)

            # Optional Directory API if we need email resolution, but do not fail if missing
            try:
                admin_service = build('admin', 'directory_v1', credentials=creds)
            except Exception:
                admin_service = None

            # 1. Locate the correct conference record
            records_response = meet_service.conferenceRecords().list(
                filter=f'space.meeting_code="{meeting_code}"'
            ).execute()

            records = records_response.get('conferenceRecords', [])
            if not records:
                return {
                    "status": "NOT_READY",
                    "message": "Google Meet conference record is not available yet. Please try again later."
                }

            # Match the exact session occurrence by scheduled time window
            from django.utils import timezone
            if session.class_date and session.start_time:
                scheduled_start = timezone.make_aware(datetime.combine(session.class_date, session.start_time))
            else:
                scheduled_start = getattr(session, 'created_at', timezone.now())

            best_record = None
            min_diff = float('inf')

            for record in records:
                start_str = record.get('startTime')
                if start_str:
                    record_start = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                    diff = abs((record_start - scheduled_start).total_seconds())
                    if diff < min_diff:
                        min_diff = diff
                        best_record = record

            if not best_record:
                return {
                    "status": "NOT_READY",
                    "message": "No matching conference record found for this session time."
                }

            conference_record_name = best_record['name']
            meeting_start = best_record.get('startTime')
            meeting_end = best_record.get('endTime')

            # 2. Fetch all participants
            participants = []
            page_token = None
            while True:
                part_resp = meet_service.conferenceRecords().participants().list(
                    parent=conference_record_name,
                    pageToken=page_token
                ).execute()
                participants.extend(part_resp.get('participants', []))
                page_token = part_resp.get('nextPageToken')
                if not page_token:
                    break

            participant_data = {} # key -> {email, join, leave, duration, name}

            # --- 3. Gather Expected Roster & Build O(1) Identity Indexes ---
            expected_roster = RealMeetAttendanceService.get_expected_roster(session)
            email_to_student = {email.strip().lower(): email for email in expected_roster.keys()}
            
            google_email_to_email = {}
            required_name_to_email = {}
            canonical_required_name_to_email = {}
            google_profile_name_to_email_map = {}
            portal_joined_emails = set()
            
            for email, app in expected_roster.items():
                if str(app.student.id) in session.portal_join_logs:
                    portal_joined_emails.add(email)
                    
                # 1. Strongest Signal: Authoritative Google Identity
                if hasattr(app.student, 'google_identity') and app.student.google_identity and app.student.google_identity.is_verified:
                    g_email = app.student.google_identity.google_email.strip().lower()
                    google_email_to_email[g_email] = email
                    
                    # Store Google Profile Name for supporting resolution
                    profile_name = app.student.google_identity.google_profile_name
                    if profile_name:
                        _, p_canonical = _extract_name_tokens(profile_name)
                        if p_canonical:
                            if p_canonical not in google_profile_name_to_email_map:
                                google_profile_name_to_email_map[p_canonical] = []
                            google_profile_name_to_email_map[p_canonical].append(email)

                # 2. Strong Signal: Exact match on required Meet name
                req_name = app.get_dynamic_required_meet_name()
                if req_name:
                    required_name_to_email.setdefault(req_name.strip().lower(), []).append(email)
                    _, r_canonical = _extract_name_tokens(req_name)
                    if r_canonical:
                        canonical_required_name_to_email.setdefault(r_canonical, []).append(email)
                        
                legacy_name = app.required_meet_display_name
                if legacy_name and legacy_name != req_name:
                    required_name_to_email.setdefault(legacy_name.strip().lower(), []).append(email)
                    _, l_canonical = _extract_name_tokens(legacy_name)
                    if l_canonical:
                        canonical_required_name_to_email.setdefault(l_canonical, []).append(email)

            # Load persistent verified aliases (fallback)
            verified_aliases = {}
            if expected_roster:
                aliases = StudentIdentityAlias.objects.filter(student_id__in=[app.student.id for app in expected_roster.values()])
                for alias in aliases:
                    verified_aliases[alias.normalized_alias] = email_to_student.get(alias.student.user.email.strip().lower())

            # --- 4. Process Google Participants & Resolve Identities (O(P)) ---
            participant_raw_data = []
            for p in participants:
                email = None
                display_name = ""
                directory_email = None

                if 'signedinUser' in p:
                    signed_in = p['signedinUser']
                    display_name = signed_in.get('displayName', '')
                    user_resource = signed_in.get('user')
                    if user_resource and admin_service:
                        user_id = user_resource.split('/')[-1]
                        try:
                            user_profile = admin_service.users().get(userKey=user_id).execute()
                            directory_email = user_profile.get('primaryEmail')
                        except Exception:
                            pass
                elif 'anonymousUser' in p:
                    display_name = p['anonymousUser'].get('displayName', '')
                elif 'phoneUser' in p:
                    display_name = p['phoneUser'].get('displayName', '')

                intervals = []
                print("DEBUG: participant name:", p['name'])
                try:
                    s_page_token = None
                    while True:
                        sessions_resp = meet_service.conferenceRecords().participants().participantSessions().list(
                            parent=p['name'], pageToken=s_page_token
                        ).execute()
                        print("DEBUG: sessions_resp:", sessions_resp)
                        for s in sessions_resp.get('participantSessions', []):
                            s_start = s.get('startTime')
                            s_end = s.get('endTime')
                            if s_start:
                                try:
                                    st = datetime.fromisoformat(s_start.replace('Z', '+00:00'))
                                    et = datetime.fromisoformat(s_end.replace('Z', '+00:00')) if s_end else timezone.now()
                                    if et > st:
                                        intervals.append((st, et))
                                except Exception:
                                    pass
                        s_page_token = sessions_resp.get('nextPageToken')
                        if not s_page_token:
                            break
                except Exception as e:
                    logger.warning(f"Failed to fetch sessions for participant {p['name']}: {e}")

                participant_raw_data.append({
                    'participant_id': p['name'],
                    'email': email.strip().lower() if email else None,
                    'directory_email': directory_email.strip().lower() if directory_email else None,
                    'display_name': display_name.strip(),
                    'intervals': intervals
                })

            # --- 5. Resolve Matches & Aggregate Safely ---
            resolved_participants_by_student = {email: {} for email in expected_roster.keys()}
            unmatched_participants = []

            for raw in participant_raw_data:
                if not raw['intervals']:
                    continue

                matched_email = None
                match_method = None
                ambiguity_reason = None
                candidate_students = []

                raw_email_lower = raw['email']
                raw_dir_email_lower = raw['directory_email']
                raw_name = raw['display_name'].strip().lower() if raw['display_name'] else ""
                
                # We need the normalized display name exactly how it was normalized for required_meet_display_name
                # (which used _extract_name_tokens to get the canonical form)
                _, g_canonical = _extract_name_tokens(raw['display_name'])

                # STAGE 1: Authoritative Google Identity Match (Strongest)
                if raw_email_lower and raw_email_lower in google_email_to_email:
                    matched_email = google_email_to_email[raw_email_lower]
                    match_method = "GOOGLE_IDENTITY"
                elif raw_dir_email_lower and raw_dir_email_lower in google_email_to_email:
                    matched_email = google_email_to_email[raw_dir_email_lower]
                    match_method = "GOOGLE_IDENTITY"

                # STAGE 2: Exact Google Profile Name Match (Supporting Strong Signal)
                if not matched_email and g_canonical:
                    if g_canonical in google_profile_name_to_email_map:
                        candidate_emails = google_profile_name_to_email_map[g_canonical]
                        if len(candidate_emails) == 1:
                            matched_email = candidate_emails[0]
                            match_method = "GOOGLE_PROFILE_NAME"
                        else:
                            for c_email in candidate_emails:
                                st = expected_roster[c_email].student
                                candidate_students.append({
                                    "email": c_email,
                                    "student_id": str(st.id),
                                    "name": f"{st.user.first_name} {st.user.last_name}".strip()
                                })
                            ambiguity_reason = f"MULTIPLE_GOOGLE_PROFILE_NAME_MATCHES: {len(candidate_emails)} students matched Google Profile Name '{raw['display_name']}'"

                # STAGE 3: Exact Match on Session's Required Meet Name (Independently Sufficient)
                if not matched_email and raw_name:
                    if len(required_name_to_email.get(raw_name, [])) == 1:
                        matched_email = required_name_to_email[raw_name][0]
                        match_method = "REQUIRED_MEET_NAME"
                    elif g_canonical and len(canonical_required_name_to_email.get(g_canonical, [])) == 1:
                        matched_email = canonical_required_name_to_email[g_canonical][0]
                        match_method = "REQUIRED_MEET_NAME_FLEXIBLE"

                # STAGE 3: Fallback matches (Verified alias, literal email fallback)
                if not matched_email:
                    if raw_email_lower and raw_email_lower in email_to_student:
                        matched_email = email_to_student[raw_email_lower]
                        match_method = "EMAIL"
                    elif raw_dir_email_lower and raw_dir_email_lower in email_to_student:
                        matched_email = email_to_student[raw_dir_email_lower]
                        match_method = "DIRECTORY"
                    elif g_canonical in verified_aliases and verified_aliases[g_canonical]:
                        matched_email = verified_aliases[g_canonical]
                        match_method = "VERIFIED_ALIAS"

                # STAGE 4: Deterministic Substring Match (Auto-Approve if Unique)
                if not matched_email:
                    participant_tokens, p_canonical = _extract_name_tokens(raw['display_name'])
                    p_spaceless = p_canonical.replace(" ", "")
                    
                    candidate_emails = []
                    for email, app in expected_roster.items():
                        student = app.student
                        name_tokens, s_canonical = _extract_name_tokens(student.user.get_full_name())
                        s_spaceless = s_canonical.replace(" ", "")
                        
                        if name_tokens and name_tokens.issubset(participant_tokens):
                            if email not in candidate_emails:
                                candidate_emails.append(email)
                        elif s_spaceless and len(s_spaceless) >= 5 and s_spaceless in p_spaceless:
                            if email not in candidate_emails:
                                candidate_emails.append(email)
                                
                    if len(candidate_emails) == 1:
                        matched_email = candidate_emails[0]
                        match_method = "NAME_SUBSTRING"

                # STAGE 5: Suggest for Review (If ambiguous or no deterministic match)
                if not matched_email:
                    ambiguity_reason = "IDENTITY_REVIEW_REQUIRED: No deterministic match found."
                    participant_tokens, p_canonical = _extract_name_tokens(raw['display_name'])
                    p_spaceless = p_canonical.replace(" ", "")
                    for email, app in expected_roster.items():
                        student = app.student
                        name_tokens, s_canonical = _extract_name_tokens(student.user.get_full_name())
                        s_spaceless = s_canonical.replace(" ", "")
                        if (name_tokens and name_tokens.issubset(participant_tokens)) or (s_spaceless and len(s_spaceless) >= 5 and s_spaceless in p_spaceless):
                            candidate = {"email": email, "student_id": str(student.id), "name": student.user.get_full_name()}
                            if candidate not in candidate_students:
                                candidate_students.append(candidate)

                if matched_email:
                    pid = raw['participant_id']
                    if pid not in resolved_participants_by_student[matched_email]:
                        resolved_participants_by_student[matched_email][pid] = {
                            'intervals': [],
                            'email_evidence': raw['email'] or raw['directory_email'],
                            'match_method': match_method,
                            'raw_data': raw
                        }
                    resolved_participants_by_student[matched_email][pid]['intervals'].extend(raw['intervals'])
                else:
                    raw_intervals = raw['intervals']
                    raw_intervals.sort(key=lambda x: x[0])
                    join_t = raw_intervals[0][0]
                    leave_t = max([i[1] for i in raw_intervals])

                    merged = [raw_intervals[0]]
                    for curr in raw_intervals[1:]:
                        last = merged[-1]
                        if curr[0] <= last[1]:
                            merged[-1] = (last[0], max(last[1], curr[1]))
                        else:
                            merged.append(curr)

                    unmatched_participants.append({
                        "name": raw['display_name'] or "Anonymous",
                        "email": raw['email'] or raw['directory_email'] or "N/A",
                        "join_time": join_t.isoformat(),
                        "leave_time": leave_t.isoformat(),
                        "intervals": merged,
                        "ambiguity_reason": ambiguity_reason,
                        "candidate_students": candidate_students
                    })

            # --- 6. Calculate Actual Class Metrics ---
            from django.utils import timezone

            # The user explicitly wants the overall class time to be calculated from the
            # scheduled start time, ignoring any early joins before the scheduled time.
            actual_class_start = timezone.make_aware(datetime.combine(session.class_date, session.start_time))

            # If the admin clicked "End Class", the class_status is COMPLETED and end_time is the authoritative button press time.
            # If the class is NOT completed, end_time is just the scheduled end, which MUST NOT be used as a cutoff.
            if session.class_status == "COMPLETED" and session.end_time:
                actual_class_end = timezone.make_aware(datetime.combine(session.class_date, session.end_time))
                if actual_class_end < actual_class_start:
                    from datetime import timedelta
                    actual_class_end += timedelta(days=1)
            elif meeting_end:
                # The Google Meet API reports the conference has ended!
                # Even if the admin didn't mark it as COMPLETED, we must cap the duration here,
                # otherwise the denominator grows to infinity (timezone.now()).
                from dateutil.parser import parse as parse_date
                actual_class_end = parse_date(meeting_end).astimezone(timezone.get_current_timezone())
            else:
                # Class is still active (or Google Meet data is being polled live).
                # Do not clamp to the scheduled end time. The class remains ongoing.
                actual_class_end = timezone.now()

            total_session_seconds = max(0, (actual_class_end - actual_class_start).total_seconds())

            # Now clamp unmatched participants
            for unp in unmatched_participants:
                raw_intervals = unp.pop('intervals', [])
                clamped_d = 0
                for start, end in raw_intervals:
                    c_start = max(start, actual_class_start)
                    c_end = min(end, actual_class_end)
                    if c_end > c_start:
                        clamped_d += (c_end - c_start).total_seconds()
                unp['duration_seconds'] = int(clamped_d)

            # --- 7. Finalize Expected Roster Output ---
            from attendance.models import PriorPermission
            prior_permissions = PriorPermission.objects.filter(session=session).select_related('granted_by')
            permissions_by_student_id = {str(p.student_id): p for p in prior_permissions}
            
            expected_students_output = {}
            ambiguous_student_ids = set()
            for unp in unmatched_participants:
                for c in unp.get("candidate_students", []):
                    ambiguous_student_ids.add(c["student_id"])

            candidate_student_ids = set()
            for p in unmatched_participants:
                for c in p.get("candidate_students", []):
                    candidate_student_ids.add(c.get("student_id"))
            for email, participant_dict in resolved_participants_by_student.items():
                app = expected_roster[email]
                student_id = str(app.student.id)
                course_id = str(app.course.id) if app.course else None
                cohort_id = str(app.assigned_cohort.id) if app.assigned_cohort else None
                domain_id = app.course.domain if app.course else None
                
                perm = permissions_by_student_id.get(student_id)
                prior_perm_dict = None
                if perm:
                    prior_perm_dict = {
                        "has_permission": True,
                        "reason": perm.reason,
                        "granted_by_name": f"{perm.granted_by.first_name} {perm.granted_by.last_name}".strip() if perm.granted_by else "Unknown",
                        "created_at": perm.created_at.isoformat()
                    }
                
                # Check for distinct Google participants merging into one student
                # If there are >1 distinct identities (pid), we must treat it as AMBIGUOUS
                # unless Google provided deterministic evidence (e.g., they share an email).
                if len(participant_dict) > 1:
                    # If we have definitive email matches, discard the name-only matches (they might be imposters)
                    email_pids = [pid for pid, p_data in participant_dict.items() if p_data['email_evidence']]
                    if email_pids:
                        # Keep only the ones with email evidence
                        participant_dict = {pid: participant_dict[pid] for pid in email_pids}

                    # Re-evaluate after potentially filtering
                    if len(participant_dict) > 1:
                        # Check if they all share the exact same deterministic email evidence
                        emails = set([p_data['email_evidence'] for p_data in participant_dict.values()])
                        if len(emails) != 1 or list(emails)[0] is None:
                            # They do not share a deterministic email. Move them all to unresolved.
                            for pid, p_data in participant_dict.items():
                                raw = p_data['raw_data']
                                unmatched_participants.append({
                                    "name": raw['display_name'] or "Anonymous",
                                    "email": raw['email'] or raw['directory_email'] or "N/A",
                                    "join_time": raw['intervals'][0][0].isoformat() if raw['intervals'] else "",
                                    "leave_time": max([i[1] for i in raw['intervals']]).isoformat() if raw['intervals'] else "",
                                    "duration_seconds": int(sum((i[1]-i[0]).total_seconds() for i in raw['intervals'])),
                                    "ambiguity_reason": "Multiple distinct Google participants mapped to this student without deterministic email proof.",
                                    "candidate_students": [{
                                        "student_id": student_id,
                                        "name": f"{app.student.user.first_name} {app.student.user.last_name}".strip(),
                                        "email": email
                                    }]
                                })
                            ambiguous_student_ids.add(student_id)
                            participant_dict = {} # Retain for identity review, never fabricate absence.

                intervals = []
                methods_used = set()
                for p_data in participant_dict.values():
                    intervals.extend(p_data['intervals'])
                    methods_used.add(p_data['match_method'])

                # The strongest resolution method wins for display
                final_method = "UNKNOWN"
                for m in ["GOOGLE_IDENTITY", "REQUIRED_MEET_NAME", "GOOGLE_PROFILE_NAME", "EMAIL", "DIRECTORY", "VERIFIED_ALIAS", "NAME", "PORTAL_TIE_BREAK"]:
                    if m in methods_used:
                        final_method = m
                        break

                if intervals:
                    intervals.sort(key=lambda x: x[0])
                    join_t = intervals[0][0]
                    leave_t = max([i[1] for i in intervals])

                    merged = [intervals[0]]
                    for curr in intervals[1:]:
                        last = merged[-1]
                        if curr[0] <= last[1]:
                            merged[-1] = (last[0], max(last[1], curr[1]))
                        else:
                            merged.append(curr)

                    clamped_duration = 0
                    for start, end in merged:
                        c_start = max(start, actual_class_start)
                        c_end = min(end, actual_class_end)
                        if c_end > c_start:
                            clamped_duration += (c_end - c_start).total_seconds()

                    active_duration = int(clamped_duration)

                    attendance_pct = min(100.0, round((active_duration / total_session_seconds) * 100, 1)) if total_session_seconds > 0 else 0.0

                    if student_id in ambiguous_student_ids and final_method not in ("EMAIL", "DIRECTORY"):
                        status = "IDENTITY_REVIEW_REQUIRED"
                    elif attendance_pct == 0.0:
                        status = "PRIOR_PERMISSION" if prior_perm_dict else "ABSENT"
                    else:
                        status = "PRESENT"

                    naming_compliant = True
                    # Check naming compliance if they connected Google OAuth
                    if hasattr(app.student, 'google_identity') and app.student.google_identity:
                        from students.services.naming_compliance import check_naming_compliance
                        student_full_name = f"{app.student.user.first_name} {app.student.user.last_name}".strip()
                        cohort_code = app.assigned_cohort.code if app.assigned_cohort else None
                        course_code = app.course.code if app.course else None
                        comp = check_naming_compliance(
                            app.student.google_identity.google_profile_name,
                            student_full_name,
                            cohort_code,
                            course_code
                        )
                        if comp is not None:
                            naming_compliant = comp

                    expected_students_output[student_id] = {
                        "email": email,
                        "name": f"{app.student.user.first_name} {app.student.user.last_name}".strip(),
                        "join_time": join_t.isoformat(),
                        "leave_time": leave_t.isoformat(),
                        "duration_seconds": active_duration,
                        "attendance_percentage": attendance_pct,
                        "course_id": course_id,
                        "cohort_id": cohort_id,
                        "domain_id": domain_id,
                        "student_id": student_id,
                        "status": status,
                        "account_status": app.status,
                        "match_method": final_method,
                        "naming_compliant": naming_compliant,
                        "confidence": "DETERMINISTIC" if final_method in ["EMAIL", "DIRECTORY", "GOOGLE_IDENTITY"] else "DETERMINISTIC_NAME",
                        "prior_permission": prior_perm_dict
                    }
                else:
                    # ABSENT or IDENTITY_REVIEW_REQUIRED
                    if student_id in ambiguous_student_ids or student_id in candidate_student_ids:
                        status = "IDENTITY_REVIEW_REQUIRED"
                    else:
                        status = "PRIOR_PERMISSION" if prior_perm_dict else "ABSENT"
                    naming_compliant = True
                    if hasattr(app.student, 'google_identity') and app.student.google_identity:
                        from students.services.naming_compliance import check_naming_compliance
                        student_full_name = f"{app.student.user.first_name} {app.student.user.last_name}".strip()
                        cohort_code = app.assigned_cohort.code if app.assigned_cohort else None
                        course_code = app.course.code if app.course else None
                        comp = check_naming_compliance(
                            app.student.google_identity.google_profile_name,
                            student_full_name,
                            cohort_code,
                            course_code
                        )
                        if comp is not None:
                            naming_compliant = comp

                    expected_students_output[student_id] = {
                        "email": email,
                        "name": f"{app.student.user.first_name} {app.student.user.last_name}".strip(),
                        "join_time": None,
                        "leave_time": None,
                        "duration_seconds": 0,
                        "attendance_percentage": 0.0,
                        "course_id": course_id,
                        "cohort_id": cohort_id,
                        "domain_id": domain_id,
                        "student_id": student_id,
                        "status": status,
                        "account_status": app.status,
                        "naming_compliant": naming_compliant,
                        "prior_permission": prior_perm_dict
                    }

            return {
                "status": "READY",
                "session_id": str(session.id),
                "class_metrics": {
                    "start_time": actual_class_start.isoformat() if actual_class_start else None,
                    "end_time": actual_class_end.isoformat() if actual_class_end else None,
                    "duration_seconds": int(total_session_seconds)
                },
                "expected_students": expected_students_output,
                "unmatched_participants": unmatched_participants
            }

        except HttpError as e:
            logger.error(f"Google Reports API Error: {e}")
            if e.resp.status in [401, 403]:
                return {
                    "status": "CONFIG_ERROR",
                    "message": "Authentication failed or missing Google Workspace Reports API scopes."
                }
            return {
                "status": "ERROR",
                "message": f"Google API error: {str(e)}"
            }
        except Exception as e:
            logger.exception(f"Unexpected error fetching official meet attendance: {e}")
            return {
                "status": "ERROR",
                "message": f"Internal server error: {str(e)}"
            }

    @staticmethod
    def get_official_file_download(session):
        """
        If Google provides a downloadable generated report, fetch it.
        Currently returns NOT_AVAILABLE as we use structured API data.
        """
        return {
            "status": "NOT_AVAILABLE",
            "message": "Google-generated file download not configured or not available. Use the structured API data."
        }
