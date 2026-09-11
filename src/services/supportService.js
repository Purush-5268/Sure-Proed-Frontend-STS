import apiClient from "./apiClient";

export const supportService = {
  // Requests
  async createRequest(payload) {
    const formData = new FormData();
    Object.keys(payload).forEach(key => {
      if (payload[key] !== undefined && payload[key] !== null) {
        formData.append(key, payload[key]);
      }
    });
    const response = await apiClient.post("/api/requests/", formData);
    return response.data;
  },

  async getMyRequests() {
    const response = await apiClient.get("/api/requests/");
    return response.data?.results || response.data || [];
  },

  // Feedback
  async submitFeedback(payload) {
    const response = await apiClient.post("/api/feedback/", payload);
    return response.data;
  }
};
