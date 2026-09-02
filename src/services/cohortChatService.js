import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

/**
 * Cohort Group Chat service.
 * Completely separate from Permission Chat / attendanceService.
 *
 * WebSocket URL: ws/cohort-chat/{cohort_id}/?token=<jwt>
 * (Token-based auth — pass JWT access token as query param)
 */
export const cohortChatService = {
  /**
   * GET /api/cohorts/{cohort_id}/chat/messages/
   * Cursor-based pagination: pass ?before=<message_id> for older messages
   * Returns: { cohort_id, conversation_id, count, has_more, results: CohortMessage[] }
   */
  async getMessages(cohortId, beforeId = null) {
    const params = beforeId ? { before: beforeId } : {};
    const response = await apiClient.get(API_ENDPOINTS.COHORTS.CHAT_MESSAGES(cohortId), { params });
    return response.data;
  },

  /**
   * POST /api/cohorts/{cohort_id}/chat/messages/
   * Body: { body: string }
   * Returns: CohortMessage
   */
  async sendMessage(cohortId, body) {
    const response = await apiClient.post(API_ENDPOINTS.COHORTS.CHAT_MESSAGES(cohortId), { body });
    return response.data;
  },

  /**
   * GET /api/cohorts/{cohort_id}/chat/unread-count/
   * Returns: { cohort_id, unread_count }
   */
  async getUnreadCount(cohortId) {
    const response = await apiClient.get(API_ENDPOINTS.COHORTS.CHAT_UNREAD(cohortId));
    return response.data;
  },

  /**
   * POST /api/cohorts/{cohort_id}/chat/read/
   * Marks conversation as fully read.
   * Returns: { status: "marked_read" }
   */
  async markRead(cohortId) {
    const response = await apiClient.post(API_ENDPOINTS.COHORTS.CHAT_READ(cohortId));
    return response.data;
  },

  /**
   * DELETE /api/cohorts/{cohort_id}/chat/messages/{message_id}/
   * Admin or sender only. Soft-deletes the message.
   * Returns: { status: "deleted" }
   */
  async deleteMessage(cohortId, messageId) {
    const response = await apiClient.delete(
      API_ENDPOINTS.COHORTS.CHAT_DELETE_MESSAGE(cohortId, messageId)
    );
    return response.data;
  },

  /**
   * Build the WebSocket URL for a cohort.
   * Requires a JWT access token (from localStorage / AuthContext).
   * URL: ws(s)://host/ws/cohort-chat/{cohort_id}/?token=<jwt>
   */
  buildWebSocketUrl(cohortId) {
    const apiBase = import.meta.env.VITE_API_URL || "";
    
    let wsProtocol = "ws";
    let wsHost = apiBase;
    
    if (apiBase.startsWith("https://")) {
      wsProtocol = "wss";
      wsHost = apiBase.replace("https://", "");
    } else if (apiBase.startsWith("http://")) {
      wsProtocol = "ws";
      wsHost = apiBase.replace("http://", "");
    } else {
      wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      wsHost = window.location.host;
    }
    
    // Remove trailing slash if any
    if (wsHost.endsWith("/")) {
      wsHost = wsHost.slice(0, -1);
    }

    return `${wsProtocol}://${wsHost}/ws/cohort-chat/${cohortId}/`;
  }
};
