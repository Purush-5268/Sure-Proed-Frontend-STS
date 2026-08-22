/**
 * notificationService.js
 *
 * Consumes the existing backend Notification model API at /api/notifications/.
 * Backend contract (from common/serializers.py NotificationSerializer):
 *   fields: id, user, user_email, title, message, notification_type,
 *           is_read, action_url, created_at, updated_at
 *
 * notification_type choices: INFO | SUCCESS | WARNING | ACTION_REQUIRED
 *
 * Extensible by design to support:
 *   - class/session announcements
 *   - attendance warnings
 *   - permission request responses
 *   - mentor messages
 *   - admin announcements
 *   - any new type the backend adds to Notification.Type
 */
import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

export const notificationService = {
  /**
   * Fetch notifications for the currently authenticated user.
   * Backend filters by user automatically (queryset returns request.user's notifications).
   * @param {Object} params - optional query params e.g. { is_read: false }
   */
  async getNotifications(params = {}) {
    const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.BASE, { params });
    // Normalise paginated vs list response
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data?.results) return data.results;
    return [];
  },

  /**
   * Get unread count efficiently.
   * Uses is_read=false filter; backend returns only unread for current user.
   */
  async getUnreadCount() {
    try {
      const unread = await notificationService.getNotifications({ is_read: false });
      return unread.length;
    } catch {
      return 0;
    }
  },

  /**
   * Mark a single notification as read.
   * Backend endpoint: PATCH /api/notifications/{id}/mark_read/
   */
  async markRead(id) {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
    return response.data;
  },

  /**
   * Mark all unread notifications as read.
   * No dedicated backend endpoint exists — uses individual mark_read calls.
   * If a backend mark-all endpoint is added later, replace this implementation.
   * @param {string[]} ids - array of notification IDs to mark read
   */
  async markAllRead(ids = []) {
    const response = await apiClient.post("/api/notifications/mark_all_read/");
    return response.data;
  },
};
