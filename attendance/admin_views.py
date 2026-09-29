from django.contrib import admin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from django.contrib.admin.views.decorators import staff_member_required
from django.utils import timezone
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.contrib import messages

from attendance.models import Attendance, AttendanceRecord
from attendance.services.real_meet_attendance_service import RealMeetAttendanceService
from students.models import StudentIdentityAlias, StudentProfile

@staff_member_required
@csrf_protect
def identity_reconciliation_view(request, object_id):
    session = get_object_or_404(Attendance, pk=object_id)
    
    # 1. Fetch structured attendance
    report = RealMeetAttendanceService.get_structured_attendance(session)
    expected_students = report.get('expected_students', {})
    unmatched_participants = report.get('unmatched_participants', [])
    
    # 2. Re-evaluate if any unmatched participants are actually aliases newly added
    # (Since the Admin might be reviewing this multiple times)
    still_unmatched = []
    newly_matched = []
    
    # We will build a helper mapping from student_id to StudentProfile instance
    student_profiles = {
        sid: StudentProfile.objects.select_related('user').get(id=sid)
        for sid in expected_students.keys()
    }
    
    # Check if they are matched by newly added aliases since last run of get_structured_attendance
    # (get_structured_attendance might cache or not pick up aliases if we don't refresh it)
    
    for p in unmatched_participants:
        still_unmatched.append(p)
        
    if request.method == "POST":
        # Process the form submission
        # We expect fields like mapping_<participant_name_b64> = <student_id>
        import base64
        
        mappings = {}
        for key, value in request.POST.items():
            if key.startswith('mapping_') and value:
                try:
                    p_name = base64.b64decode(key.replace('mapping_', '')).decode('utf-8')
                    mappings[p_name] = value
                except:
                    continue
                    
        # Duplicate detection: prevent 1 student mapped to >1 distinct participant name in this submission
        # (unless they are exactly the same participant name, but they are keys so they are unique anyway)
        used_students = set()
        has_error = False
        
        # Build list of aliases to create
        to_create = []
        for p_name, student_id in mappings.items():
            if not student_id:
                continue
            
            if student_id in used_students:
                messages.error(request, f"Duplicate mapping detected! You assigned multiple different participants to the same student (ID: {student_id}). Strict 1:1 mapping is enforced.")
                has_error = True
                break
            
            used_students.add(student_id)
            
            # Verify student is in the roster
            if student_id not in student_profiles:
                messages.error(request, f"Invalid student selected: {student_id}. Must be from the session roster.")
                has_error = True
                break
                
            student = student_profiles[student_id]
            norm_name = RealMeetAttendanceService._extract_name_tokens(p_name)
            to_create.append((student, norm_name, p_name))
            
        if not has_error and to_create:
            created_count = 0
            for student, norm_name, raw_name in to_create:
                alias, created = StudentIdentityAlias.objects.get_or_create(
                    normalized_alias=norm_name,
                    defaults={
                        'student': student,
                        'verified_by': request.user
                    }
                )
                if not created and alias.student != student:
                    # Update existing alias safely
                    alias.student = student
                    alias.verified_by = request.user
                    alias.save()
                    
                LogEntry.objects.log_action(
                    user_id=request.user.id,
                    content_type_id=ContentType.objects.get_for_model(StudentIdentityAlias).pk,
                    object_id=alias.id,
                    object_repr=str(alias),
                    action_flag=ADDITION if created else CHANGE,
                    change_message=f"Admin mapped '{raw_name}' to {student.student_code} for session {session.id}"
                )
                created_count += 1
                
            messages.success(request, f"Successfully saved {created_count} identity resolutions.")
            return redirect('admin:attendance_attendancerecord_identity_preview', object_id=session.pk)

    # 3. Candidate Suggestion Logic
    # We will compute a suggestion for each participant
    suggested_mappings = []
    
    for p in still_unmatched:
        p_name = p.get('name', '')
        p_email = p.get('email', '')
        norm_p = RealMeetAttendanceService._extract_name_tokens(p_name)
        
        candidates = []
        
        for sid, sdata in expected_students.items():
            s_email = sdata.get('email', '')
            s_req_name = sdata.get('required_meet_display_name_normalized', '')
            
            # Exact email match
            if p_email and s_email and p_email.lower() == s_email.lower():
                candidates.append((sid, 'Exact Email Match', 100))
                continue
                
            # Strong token overlap (suffix stripped)
            # Remove "-g2-26", "vlsi", etc from both strings for comparison
            # just a heuristic to help the admin
            p_tokens = set(norm_p.split())
            s_tokens = set(s_req_name.split())
            
            # Ignore common cohort tokens in comparison
            ignore_tokens = {'g2', '26', 'vlsi', 'g', '2', '26vlsi', 'g226', 'g226vlsi'}
            p_clean = p_tokens - ignore_tokens
            s_clean = s_tokens - ignore_tokens
            
            if p_clean and s_clean:
                overlap = p_clean.intersection(s_clean)
                if len(overlap) == len(p_clean) and len(overlap) > 0:
                    candidates.append((sid, 'Strong Token Overlap', 50))
                elif len(overlap) >= 2:
                    candidates.append((sid, 'Partial Token Overlap (>=2)', 30))

        # Sort candidates by score
        candidates.sort(key=lambda x: x[2], reverse=True)
        best_candidate = candidates[0][0] if candidates else None
        evidence = candidates[0][1] if candidates else ''
        
        import base64
        suggested_mappings.append({
            'participant': p,
            'b64_name': base64.b64encode(p_name.encode('utf-8')).decode('utf-8'),
            'best_candidate': best_candidate,
            'evidence': evidence
        })

    context = {
        'opts': AttendanceRecord._meta,
        'original': session,
        'unresolved': suggested_mappings,
        'roster': student_profiles.items(),
    }
    
    return render(request, 'admin/attendance/attendance/identity_review.html', context)


@staff_member_required
def identity_reconciliation_preview(request, object_id):
    session = get_object_or_404(Attendance, pk=object_id)
    
    # We just run the report and show it, without saving to DB.
    report = RealMeetAttendanceService.get_structured_attendance(session)
    
    # The actual Meet Start/End are inside report['google_meet_data']
    google_data = report.get('google_meet_data', {})
    actual_start = google_data.get('start_time')
    actual_end = google_data.get('end_time')
    actual_duration = google_data.get('duration_seconds')
    
    if request.method == "POST":
        # The admin clicked "Approve & Apply Discipline"
        # We actually run the DB update
        from attendance.tasks import _process_final_attendance
        _process_final_attendance(session, report)
        messages.success(request, "Discipline applied successfully.")
        return redirect('admin:attendance_attendancerecord_change', object_id)

    context = {
        'opts': AttendanceRecord._meta,
        'original': session,
        'report': report,
        'actual_start': actual_start,
        'actual_end': actual_end,
        'actual_duration': actual_duration,
    }
    return render(request, 'admin/attendance/attendance/identity_preview.html', context)
