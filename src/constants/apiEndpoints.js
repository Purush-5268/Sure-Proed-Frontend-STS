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

  // Analytics
  ANALYTICS: {
    PLATFORM_STATS: "/api/analytics/platform-stats/",
    PUBLIC_PEOPLE: "/api/analytics/public-people/",
  },

  // Users
  USERS: {
    BASE: "/api/users/",
    BY_ID: (id) => `/api/users/${id}/`,
    ME: "/api/users/me/",
    RESET_PASSWORD: "/api/auth/users/set_password/",
  },

  // Students / Student Profiles
  STUDENTS: {
    BASE: "/api/students/",
    BY_ID: (id) => `/api/students/${id}/`,
    DOWNLOAD_RESUME: (id) => `/api/students/${id}/download-resume/`,
    BULK_VERIFY: "/api/students/bulk_verify/",
    VERIFY: (id) => `/api/students/${id}/verify/`,
    STATISTICS: "/api/students/statistics/",
  },

  // Student Placements
  PLACEMENTS: {
    BASE: "/api/student-placements/",
    BY_ID: (id) => `/api/student-placements/${id}/`,
  },

  // Courses
  COURSES: {
    BASE: "/api/courses/",
    BY_ID: (id) => `/api/courses/${id}/`,
  },

  // Applications
  APPLICATIONS: {
    BASE: "/api/applications/",
    CURRENT_JOURNEY: "/api/applications/current-journey/",
    BY_ID: (id) => `/api/applications/${id}/`,
    PRESCREENING: (id) => `/api/applications/prescreening/${id}/`,
    PRESCREENING_ADMIN_START: (id) => `/api/applications/prescreening/${id}/admin-start/`,
    ASSIGN_COHORT: (id) => `/api/applications/${id}/assign-cohort/`,
    TRANSFER_COHORT: (id) => `/api/applications/${id}/transfer-cohort/`,
    TRANSFER_COURSE_COHORT: (id) => `/api/applications/${id}/transfer-course-cohort/`,
    REPAIR_STATE: (id) => `/api/applications/${id}/repair-state/`,
    ROLE_VERIFICATION: (id) => `/api/applications/${id}/role-verification/`,
    JOURNEY: (id) => `/api/applications/${id}/journey/`,
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
  PRE_SCREENINGS: {
    BASE: "/api/pre-screenings/",
    BY_ID: (id) => `/api/pre-screenings/${id}/`,
    UPDATE_STATUS: (id) => `/api/pre-screenings/${id}/update-status/`,
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
    SCHEDULE_SCREENING: (id) => `/api/cohorts/${id}/schedule-screening/`,
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
  // Assignments & Submissions
  EXAMS: {
    BASE: "/api/exams/",
    BY_ID: (id) => `/api/exams/${id}/`,
    SUBMIT: (id) => `/api/exams/${id}/submit/`,
    START_INTERNAL: (id) => `/api/exams/${id}/start-internal/`,
    AUTOSAVE: (id) => `/api/exams/${id}/autosave/`,
    CONFIGURE_PROCTORING: (id) => `/api/exams/${id}/configure-proctoring/`,
    PROCTORING_ROOMS: (id) => `/api/exams/${id}/proctoring-rooms/`,
    ASSIGN_PROCTOR: (id) => `/api/exams/${id}/assign-proctor/`,
    RESET: (id) => `/api/exams/${id}/reset/`,
  },
  MODULE_TESTS: {
    BASE: "/api/module-tests/",
    BY_ID: (id) => `/api/module-tests/${id}/`,
    SUBMISSIONS: "/api/module-test-submissions/",
    SUBMISSION_BY_ID: (id) => `/api/module-test-submissions/${id}/`,
    START: (id) => `/api/module-tests/${id}/start/`,
    ADMIN_START: (id) => `/api/module-tests/${id}/admin-start/`,
    AUTOSAVE: (id) => `/api/module-tests/${id}/autosave/`,
    SUBMIT: (id) => `/api/module-tests/${id}/submit/`,
    CONFIGURE_PROCTORING: (id) => `/api/module-tests/${id}/configure-proctoring/`,
    PROCTORING_ROOMS: (id) => `/api/module-tests/${id}/proctoring-rooms/`,
    ASSIGN_PROCTOR: (id) => `/api/module-tests/${id}/assign-proctor/`,
  },
  QUESTION_BANKS: {
    BASE: "/api/question-banks/",
    BY_ID: (id) => `/api/question-banks/${id}/`,
    PAPER: (id, setCode = "A") => `/api/question-banks/${id}/paper/${setCode}/`,
    GENERATE: "/api/question-banks/generate/",
    PUBLISH: (id) => `/api/question-banks/${id}/publish/`,
    REGENERATE: (id) => `/api/question-banks/${id}/regenerate/`,
    CLOSE: (id) => `/api/question-banks/${id}/close/`,
  },
  QUESTIONS: {
    BASE: "/api/questions/",
    BY_ID: (id) => `/api/questions/${id}/`,
  },
  ASSIGNMENTS: {
    BASE: "/api/assignments/",
    BY_ID: (id) => `/api/assignments/${id}/`,
    SUBMISSIONS: (id) => `/api/assignments/${id}/submissions/`,
  },
  SUBMISSIONS: {
    BASE: "/api/submissions/",
    BY_ID: (id) => `/api/submissions/${id}/`,
    REQUEST_AUTOGRADE: (id) => `/api/submissions/${id}/request-autograde/`,
  },

  TRAININGS: {
    BASE: "/api/trainings/",
    SESSIONS: "/api/training-sessions/",
    SESSION_BY_ID: (id) => `/api/training-sessions/${id}/`,
  },

  // Attendance
  ATTENDANCE: {
    BASE: "/api/attendance/",
    BY_ID: (id) => `/api/attendance/${id}/`,
    SUMMARY: "/api/attendance/summary/",
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
    DOWNLOAD: (id) => `/api/certificates/${id}/download/`,
    METADATA: "/api/certificates/metadata/",
    VERIFY: "/api/certificates/verify/",
    VERIFICATION_PROFILE: "/api/certificates/verification-profile/",
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
  
  // Volunteer operations
  VOLUNTEER_TASKS: {
    BASE: "/api/volunteers/tasks/",
    BY_ID: (id) => `/api/volunteers/tasks/${id}/`,
    UPDATE_STATUS: (id) => `/api/volunteers/tasks/${id}/update_status/`,
  },
  VOLUNTEER_HELP_REQUESTS: {
    BASE: "/api/volunteers/help-requests/",
    BY_ID: (id) => `/api/volunteers/help-requests/${id}/`,
  },

  TRUSTEE: {
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
