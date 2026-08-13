import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

export const attendanceService = {
  async getAttendanceRecords(params = {}) {
    const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { params });
    return response.data;
  },

  async getAttendanceById(id) {
    const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BY_ID(id));
    return response.data;
  },

  async createAttendanceRecord(data) {
    const response = await apiClient.post(API_ENDPOINTS.ATTENDANCE.BASE, data);
    return response.data;
  },

  async updateAttendanceRecord(id, data) {
    const response = await apiClient.put(API_ENDPOINTS.ATTENDANCE.BY_ID(id), data);
    return response.data;
  },

  async patchAttendanceRecord(id, data) {
    const response = await apiClient.patch(API_ENDPOINTS.ATTENDANCE.BY_ID(id), data);
    return response.data;
  },

  async deleteAttendanceRecord(id) {
    const response = await apiClient.delete(API_ENDPOINTS.ATTENDANCE.BY_ID(id));
    return response.data;
  },

  async scheduleSession(data) {
    // Standard Django REST Framework uses the base endpoint for POST/creation
    const response = await apiClient.post(API_ENDPOINTS.ATTENDANCE.BASE, data);
    return response.data;
  },

  async whitelistGuest(sessionId, emails) {
    // Expects an array of email strings
    const response = await apiClient.post(API_ENDPOINTS.ATTENDANCE.ADD_ATTENDEES(sessionId), { emails });
    return response.data;
  },

  async downloadExcel(sessionId) {
    const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.DOWNLOAD_EXCEL(sessionId), {
      responseType: 'blob' // We set blob, but if it's 202, it will likely return JSON. We need to handle that in the component.
    });
    return response;
  },

  async markJoined(id) {
    const response = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BY_ID(id)}join/`);
    return response.data;
  },

  async getWarnings() {
    const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}warnings/`);
    return response.data;
  },

  async resolveWarning(warningId, apologyText = null) {
    const payload = { warning_id: warningId };
    if (apologyText) {
      payload.apology_text = apologyText;
    }
    const response = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}resolve_warning/`, payload);
    return response.data;
  },

  async getAdminQueries() {
    const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}admin_queries/`);
    return response.data;
  },

  async updateQueryStatus(warningId, action) {
    const response = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}admin_update_query/`, { warning_id: warningId, action });
    return response.data;
  }
};
