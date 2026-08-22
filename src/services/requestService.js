import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

export const requestService = {
  async getRequests(params = {}) {
    const response = await apiClient.get(API_ENDPOINTS.REQUESTS.BASE, { params });
    const data = response.data;
    return Array.isArray(data) ? data : (data?.results || []);
  },

  async getRequestById(id) {
    const response = await apiClient.get(API_ENDPOINTS.REQUESTS.BY_ID(id));
    return response.data;
  },

  async createRequest(data) {
    const response = await apiClient.post(API_ENDPOINTS.REQUESTS.BASE, data);
    return response.data;
  },

  /**
   * Admin only: Transition request status.
   * Valid transitions:
   *   PENDING → IN_PROGRESS, RESOLVED, REJECTED
   *   IN_PROGRESS → RESOLVED, REJECTED
   *   RESOLVED/REJECTED → CLOSED
   */
  async updateRequestStatus(requestId, newStatus, adminRemarks = "") {
    const payload = { new_status: newStatus };
    if (adminRemarks && adminRemarks.trim()) {
      payload.admin_remarks = adminRemarks;
    }
    const response = await apiClient.post(
      API_ENDPOINTS.REQUESTS.UPDATE_STATUS(requestId),
      payload
    );
    return response.data;
  },

  async getPendingCount(category = null) {
    const params = category ? { category } : {};
    const response = await apiClient.get(API_ENDPOINTS.REQUESTS.PENDING_COUNT, { params });
    return response.data;
  }
};
