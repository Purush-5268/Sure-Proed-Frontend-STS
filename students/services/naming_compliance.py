from attendance.services.real_meet_attendance_service import _extract_name_tokens

def check_naming_compliance(google_profile_name, student_full_name, cohort_code, course_code, application=None):
    """
    Evaluates whether the provided google_profile_name is compliant with
    the contextual academic Meet naming convention:
    
    <recognizable student-name component> - <exact current cohort> <exact authoritative course/domain code>
    
    Returns True if compliant, False if not compliant, and None if required data is missing.
    """
    if not google_profile_name or not student_full_name or not cohort_code or not course_code:
        return None
        
    g_tokens, _ = _extract_name_tokens(google_profile_name)
    s_tokens, _ = _extract_name_tokens(student_full_name)
    cohort_tokens, _ = _extract_name_tokens(cohort_code)
    course_tokens, _ = _extract_name_tokens(course_code)
    
    # Cohort must match exactly
    if not cohort_tokens.issubset(g_tokens):
        return False
        
    # Course short code must match exactly
    if not course_tokens.issubset(g_tokens):
        return False
        
    # Student name portion is flexible. Allow any token from student name or its initials.
    valid_name_tokens = set(s_tokens)
    for t in s_tokens:
        if len(t) > 0:
            valid_name_tokens.add(t[0])
            
    # Remove cohort and course tokens from the google profile tokens to isolate the name part
    g_name_tokens = g_tokens - cohort_tokens - course_tokens
    
    # Check if there's any intersection between the isolated google name tokens and the valid student name tokens
    name_intersection = valid_name_tokens.intersection(g_name_tokens)
    
    if not name_intersection:
        return False
        
    return True
