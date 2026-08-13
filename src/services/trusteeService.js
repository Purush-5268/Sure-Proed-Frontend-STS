import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

/* ─────────────────────────────────────────────
   VOLUNTEER TRUSTEE APIs
   ───────────────────────────────────────────── */


/** Get students flagged for <50% attendance in the last 7 days */
export const getLowAttendanceAlerts = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.LOW_ATTENDANCE_ALERTS).then((r) => r.data);

/** Get domain→group→session hierarchy for attendance drill-down */
export const getAttendanceHierarchy = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.ATTENDANCE_HIERARCHY).then((r) => r.data);

/** Fetch all available streams/domains for the schedule form */
export const getStreams = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.STREAMS).then((r) => r.data);

/** Create (schedule) a new session */
export const createSession = (payload) =>
  apiClient.post(API_ENDPOINTS.TRUSTEE.CREATE_SESSION, payload).then((r) => r.data);



/** Fetch all students (user moderation) */
export const getStudents = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.STUDENTS).then((r) => r.data);

/** Permanently remove a student */
export const removeStudent = (studentId) =>
  apiClient.delete(API_ENDPOINTS.TRUSTEE.REMOVE_STUDENT(studentId)).then((r) => r.data);

/* ─────────────────────────────────────────────
   HIGHER-LEVEL TRUSTEE APIs
   ───────────────────────────────────────────── */

// ── Announcements ──
export const getAnnouncements = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.ANNOUNCEMENTS).then((r) => r.data);

export const createAnnouncement = (data) =>
  apiClient.post(API_ENDPOINTS.TRUSTEE.ANNOUNCEMENTS, data).then((r) => r.data);

export const updateAnnouncement = (id, data) =>
  apiClient.put(API_ENDPOINTS.TRUSTEE.ANNOUNCEMENT_BY_ID(id), data).then((r) => r.data);

export const deleteAnnouncement = (id) =>
  apiClient.delete(API_ENDPOINTS.TRUSTEE.ANNOUNCEMENT_BY_ID(id)).then((r) => r.data);

// ── Achievements ──
export const getAchievements = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.ACHIEVEMENTS).then((r) => r.data);

export const createAchievement = (data) =>
  apiClient.post(API_ENDPOINTS.TRUSTEE.ACHIEVEMENTS, data).then((r) => r.data);

export const updateAchievement = (id, data) =>
  apiClient.put(API_ENDPOINTS.TRUSTEE.ACHIEVEMENT_BY_ID(id), data).then((r) => r.data);

export const deleteAchievement = (id) =>
  apiClient.delete(API_ENDPOINTS.TRUSTEE.ACHIEVEMENT_BY_ID(id)).then((r) => r.data);

// ── Commercial Updates ──
export const getUpdates = () =>
  apiClient.get(API_ENDPOINTS.TRUSTEE.UPDATES).then((r) => r.data);

export const createUpdate = (data) =>
  apiClient.post(API_ENDPOINTS.TRUSTEE.UPDATES, data).then((r) => r.data);

export const updateUpdate = (id, data) =>
  apiClient.put(API_ENDPOINTS.TRUSTEE.UPDATE_BY_ID(id), data).then((r) => r.data);

export const deleteUpdate = (id) =>
  apiClient.delete(API_ENDPOINTS.TRUSTEE.UPDATE_BY_ID(id)).then((r) => r.data);
