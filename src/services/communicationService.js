import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

/**
 * Role-based Communication Service
 * Handles messaging and document sharing between Admin, Trustees, Advisors, and Volunteers.
 */
export const communicationService = {
  /**
   * GET /api/communications/conversations/
   * Returns list of channels accessible by current user.
   */
  async getConversations() {
    const response = await apiClient.get(API_ENDPOINTS.COMMUNICATIONS.CONVERSATIONS);
    return response.data;
  },

  /**
   * GET /api/communications/conversations/{groupType}/messages/
   * Returns paginated message stream for the channel.
   * ?before=<message_id>&limit=50
   */
  async getMessages(groupType, beforeId = null, limit = 50) {
    const params = { limit };
    if (beforeId) params.before = beforeId;
    const response = await apiClient.get(API_ENDPOINTS.COMMUNICATIONS.MESSAGES(groupType), { params });
    return response.data;
  },

  /**
   * POST /api/communications/conversations/{groupType}/messages/
   * Sends text and/or file attachment via multipart/form-data.
   * payload: { content?: string, file?: File }
   */
  async sendMessage(groupType, { content, file }) {
    const formData = new FormData();
    if (content && content.trim()) {
      formData.append("content", content.trim());
    }
    if (file) {
      formData.append("file", file);
    }
    const response = await apiClient.post(API_ENDPOINTS.COMMUNICATIONS.MESSAGES(groupType), formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  /**
   * POST /api/communications/conversations/{groupType}/read/
   * Marks channel messages read up to current latest message.
   */
  async markRead(groupType) {
    const response = await apiClient.post(API_ENDPOINTS.COMMUNICATIONS.MARK_READ(groupType));
    return response.data;
  },

  /**
   * GET /api/communications/unread-summary/
   * Returns unread badge counters.
   */
  async getUnreadSummary() {
    const response = await apiClient.get(API_ENDPOINTS.COMMUNICATIONS.UNREAD_SUMMARY);
    return response.data;
  },

  /**
   * Helper to format attachment file size.
   */
  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  },
};

export default communicationService;
