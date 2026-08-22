export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    TOKEN: "/api/auth/token/",
    REFRESH: "/api/auth/token/refresh/",
    LINKEDIN_CONNECT: "/api/auth/linkedin/connect/",
    LINKEDIN_CALLBACK: "/api/auth/linkedin/callback/",
    LINKEDIN_DISCONNECT: "/api/auth/linkedin/disconnect/",
    GITHUB_CONNECT: "/api/auth/github/connect/",
    GITHUB_CALLBACK: "/api/auth/github/callback/",
    GITHUB_DISCONNECT: "/api/auth/github/disconnect/",
    // OTP-gated email verification registration flow
    SEND_VERIFICATION_OTP: "/api/auth/send-verification-otp/",
    VERIFY_EMAIL_OTP: "/api/auth/verify-email-otp/",
  },

  // Users
  USERS: {
    BASE: "/api/users/",
    BY_ID: (id) => `/api/users/${id}/`,
    ME: "/api/users/me/",
    RESET_PASSWORD: "/api/users/reset-password/",
  },

  // Students / Student Profiles
  STUDENTS: {
    BASE: "/api/students/",
    BY_ID: (id) => `/api/students/${id}/`,
    BULK_VERIFY: "/api/students/bulk_verify/",
    VERIFY: (id) => `/api/students/${id}/verify/`,
    STATISTICS: "/api/students/statistics/",
  },

  // Courses
  COURSES: {
    BASE: "/api/courses/",
    BY_ID: (id) => `/api/courses/${id}/`,
  },

  // Applications
  APPLICATIONS: {
    BASE: "/api/applications/",
    BY_ID: (id) => `/api/applications/${id}/`,
    ASSIGN_COHORT: (id) => `/api/applications/${id}/assign-cohort/`,
    CHECK_COMPLETION: (id) => `/api/applications/${id}/check-completion/`,
    REVOKE_ACCESS: (id) => `/api/applications/${id}/revoke_access/`,
    RESTORE_ACCESS: (id) => `/api/applications/${id}/restore_access/`,
    GENERATE_OFFER_LETTER: (id) => `/api/applications/${id}/generate-offer-letter/`,
    REVOKE_OFFER_LETTER: (id) => `/api/applications/${id}/revoke-offer-letter/`,
    RESTORE_OFFER_LETTER: (id) => `/api/applications/${id}/restore-offer-letter/`,
    RESET_OFFER_LETTER: (id) => `/api/applications/${id}/reset-offer-letter/`,
    BULK_GENERATE_OFFER_LETTERS: "/api/applications/generate-offer-letters-for-cohort/",
    REQUEST_OFFER_LETTER: (id) => `/api/applications/${id}/request-offer-letter/`,
    DOWNLOAD_OFFER_LETTER: (id) => `/api/applications/${id}/download-offer-letter/`,
    // Legacy: GET /api/applications/verify-offer-letter/?hash=<hash>
    VERIFY_OFFER_LETTER: "/api/applications/verify-offer-letter/",
    SUSPEND: (id) => `/api/applications/${id}/suspend/`,
    UNSUSPEND: (id) => `/api/applications/${id}/unsuspend/`,
  },

  // UserRequests (support & requests)
  REQUESTS: {
    BASE: "/api/requests/",
    BY_ID: (id) => `/api/requests/${id}/`,
    UPDATE_STATUS: (id) => `/api/requests/${id}/update-status/`,
    PENDING_COUNT: "/api/requests/pending-count/",
  },

  // Pre-Screening
  PRE_SCREENING: {
    BASE: "/api/pre-screening/",
    BY_ID: (id) => `/api/pre-screening/${id}/`,
    UPDATE_STATUS: (id) => `/api/pre-screening/${id}/update-status/`,
  },
  PRE_SCREENING_INTERVIEW: {
    BASE: "/api/pre-screening-interview/",
    BY_ID: (id) => `/api/pre-screening-interview/${id}/`,
    UPDATE_STATUS: (id) => `/api/pre-screening-interview/${id}/update-status/`,
  },

  // Cohorts
  COHORTS: {
    BASE: "/api/cohorts/",
    BY_ID: (id) => `/api/cohorts/${id}/`,
    MY_COHORTS: "/api/cohorts/",
    STUDENTS: (id) => `/api/students/?cohort=${id}`,
    REQUEST_ASSIGNMENT: "/api/cohorts/request-assignment/",
    ASSIGN_MENTOR: (id) => `/api/cohorts/${id}/assign_mentor/`,
    REVOKE_MENTOR: (id) => `/api/cohorts/${id}/revoke_mentor/`,
    // Chat endpoints
    CHAT_MESSAGES: (id) => `/api/cohorts/${id}/chat/messages/`,
    CHAT_UNREAD: (id) => `/api/cohorts/${id}/chat/unread-count/`,
    CHAT_READ: (id) => `/api/cohorts/${id}/chat/read/`,
    CHAT_DELETE_MESSAGE: (id, msgId) => `/api/cohorts/${id}/chat/messages/${msgId}/`,
  },

  // Mentor Profile (authenticated mentor's own profile or admin fetching by user id)
  MENTORS: {
    BASE: "/api/volunteers/mentor-profiles/",
    PROFILE_BY_ID: (id) => `/api/volunteers/mentor-profiles/${id}/`,
    // Filter profile by user UUID: /api/volunteers/mentor-profiles/?user={user_uuid}
    PROFILE_BY_USER: (userId) => `/api/volunteers/mentor-profiles/?user=${userId}`,
  },

  // Exams & Questions
  EXAMS: {
    BASE: "/api/exams/",
    BY_ID: (id) => `/api/exams/${id}/`,
    SUBMIT: (id) => `/api/exams/${id}/submit/`,
  },
  QUESTIONS: {
    BASE: "/api/questions/",
    BY_ID: (id) => `/api/questions/${id}/`,
  },

  // Assignments & Submissions
  ASSIGNMENTS: {
    BASE: "/api/assignments/",
    BY_ID: (id) => `/api/assignments/${id}/`,
  },
  SUBMISSIONS: {
    BASE: "/api/submissions/",
    BY_ID: (id) => `/api/submissions/${id}/`,
  },

  // Attendance
  ATTENDANCE: {
    BASE: "/api/attendance/",
    BY_ID: (id) => `/api/attendance/${id}/`,
    SUMMARY: "/api/attendance-summary/",
    DOWNLOAD_EXCEL: (id) => `/api/attendance/${id}/official-attendance/download/`,
    ADD_ATTENDEES: (id) => `/api/attendance/${id}/add-attendees/`,
    WARNINGS: "/api/attendance/warnings/",
    RESOLVE_WARNING: "/api/attendance/resolve_warning/",
    ADMIN_QUERIES: "/api/attendance/admin_queries/",
    ADMIN_UPDATE_QUERY: "/api/attendance/admin_update_query/",
    CHAT_HISTORY: "/api/attendance/chat_history/",
  },

  // Certificates
  CERTIFICATES: {
    BASE: "/api/certificates/",
    BY_ID: (id) => `/api/certificates/${id}/`,
    VERIFY: "/api/certificates/verify/",
  },

  // Companies
  COMPANIES: {
    BASE: "/api/companies/",
    BY_ID: (id) => `/api/companies/${id}/`,
  },

  // Trustee
  TRUSTEE_PROFILES: {
    BASE: "/api/trustees/profiles/",
    ME: "/api/trustees/profiles/me/",
    BY_ID: (id) => `/api/trustees/profiles/${id}/`,
  },
  TRUSTEE: {
    // Volunteer operations
    LOW_ATTENDANCE_ALERTS: "/api/attendance/alerts/low/",
    ATTENDANCE_HIERARCHY: "/api/attendance/hierarchy/",
    CREATE_SESSION: "/api/sessions/",
    STREAMS: "/api/streams/",
    STUDENTS: "/api/students/",
    REMOVE_STUDENT: (id) => `/api/students/${id}/`,

    // Commercial operations
    ANNOUNCEMENTS: "/api/trustee/announcements/",
    ANNOUNCEMENT_BY_ID: (id) => `/api/trustee/announcements/${id}/`,
    ACHIEVEMENTS: "/api/trustee/achievements/",
    ACHIEVEMENT_BY_ID: (id) => `/api/trustee/achievements/${id}/`,
    UPDATES: "/api/trustee/updates/",
    UPDATE_BY_ID: (id) => `/api/trustee/updates/${id}/`,
  },
  // Notifications (personal, user-scoped)
  NOTIFICATIONS: {
    BASE: "/api/notifications/",
    BY_ID: (id) => `/api/notifications/${id}/`,
    // Backend exposes: PATCH /api/notifications/{id}/mark_read/
    MARK_READ: (id) => `/api/notifications/${id}/mark_read/`,
    // Web Push Notifications
    PUSH_PUBLIC_KEY: "/api/notifications/push/public-key/",
    PUSH_SUBSCRIBE: "/api/notifications/push/subscribe/",
    PUSH_UNSUBSCRIBE: "/api/notifications/push/unsubscribe/",
  },

  // Feedback
  FEEDBACK: {
    BASE: "/api/feedback/",
  },

  // Announcements
  ANNOUNCEMENTS: {
    BASE: "/api/announcements/",
    BY_ID: (id) => `/api/announcements/${id}/`,
  },

  // Training Sessions (LST/SST)
  TRAINING_SESSIONS: {
    BASE: "/api/training-sessions/",
    BY_ID: (id) => `/api/training-sessions/${id}/`,
  },
};
