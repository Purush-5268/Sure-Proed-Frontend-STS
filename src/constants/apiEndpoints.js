export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    TOKEN: "/api/auth/token/",
    REFRESH: "/api/auth/token/refresh/",
    LINKEDIN_CONNECT: "/api/auth/linkedin/connect/",
    LINKEDIN_CALLBACK: "/api/auth/linkedin/callback/",
    LINKEDIN_DISCONNECT: "/api/auth/linkedin/disconnect/",
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
  },

  // Cohorts
  COHORTS: {
    BASE: "/api/cohorts/",
    BY_ID: (id) => `/api/cohorts/${id}/`,
    // Mentor-scoped: returns ONLY active cohorts assigned to the authenticated mentor
    MY_COHORTS: "/api/cohorts/my-cohorts/",
    // Students enrolled in a specific cohort (via approved applications)
    STUDENTS: (id) => `/api/cohorts/${id}/students/`,
    // Mentor requests cohort assignment from admin
    REQUEST_ASSIGNMENT: "/api/cohorts/request-assignment/",
  },

  // Mentor Profile (authenticated mentor's own profile)
  MENTORS: {
    PROFILE_ME: "/api/mentor-profile/me/",
    PROFILE_BY_ID: (id) => `/api/mentor-profile/${id}/`,
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
  TRUSTEE: {
    // Volunteer operations
    TODAY_SESSIONS: "/api/sessions/today/",
    RECENT_SESSIONS: "/api/sessions/recent/",
    JOIN_SESSION: (id) => `/api/sessions/${id}/join/`,
    END_SESSION: (id) => `/api/sessions/${id}/end/`,
    CREATE_SESSION: "/api/sessions/",
    WHITELIST_GUEST: (id) => `/api/sessions/${id}/whitelist/`,
    LOW_ATTENDANCE_ALERTS: "/api/attendance/alerts/low/",
    ATTENDANCE_HIERARCHY: "/api/attendance/hierarchy/",
    DOWNLOAD_CSV: (id) => `/api/attendance/${id}/csv/`,
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
};
