import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

export const applicationService = {
  async getApplications(params = {}) {
    const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE, { params });
    const data = response.data;
    return Array.isArray(data) ? data : (data?.results || []);
  },

  async getApplicationById(id) {
    const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BY_ID(id));
    return response.data;
  },

  async createApplication(data) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.BASE, data);
    return response.data;
  },

  async updateApplication(id, data) {
    const response = await apiClient.put(API_ENDPOINTS.APPLICATIONS.BY_ID(id), data);
    return response.data;
  },

  async patchApplication(id, data) {
    const response = await apiClient.patch(API_ENDPOINTS.APPLICATIONS.BY_ID(id), data);
    return response.data;
  },

  async deleteApplication(id) {
    const response = await apiClient.delete(API_ENDPOINTS.APPLICATIONS.BY_ID(id));
    return response.data;
  },

  async approveApplication(id) {
    const response = await apiClient.patch(API_ENDPOINTS.APPLICATIONS.BY_ID(id), {
      status: "ACCEPTED"
    });
    return response.data;
  },

  async assignCohort(id, cohortId) {
    const response = await apiClient.post(
      API_ENDPOINTS.APPLICATIONS.ASSIGN_COHORT(id),
      { assigned_cohort: cohortId }
    );
    return response.data;
  },

  async checkCompletion(id) {
    const response = await apiClient.post(
      API_ENDPOINTS.APPLICATIONS.CHECK_COMPLETION(id)
    );
    return response.data;
  },

  async generateOfferLetter(id) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.GENERATE_OFFER_LETTER(id));
    return response.data;
  },

  async revokeOfferLetter(id, data) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.REVOKE_OFFER_LETTER(id), data);
    return response.data;
  },

  async restoreOfferLetter(id) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.RESTORE_OFFER_LETTER(id));
    return response.data;
  },

  async resetOfferLetter(id) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.RESET_OFFER_LETTER(id));
    return response.data;
  },

  async bulkGenerateOfferLetters(cohortId) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.BULK_GENERATE_OFFER_LETTERS, { cohort_id: cohortId });
    return response.data;
  },

  async requestOfferLetter(id, reason = "") {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.REQUEST_OFFER_LETTER(id), { reason });
    return response.data;
  },

  async downloadOfferLetter(id) {
    const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.DOWNLOAD_OFFER_LETTER(id));
    return response.data;
  },

  async verifyOfferLetter(hash) {
    // We pass the hash as query param
    const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.VERIFY_OFFER_LETTER, { params: { hash } });
    return response.data;
  },

  async suspendCohort(id) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.SUSPEND(id));
    return response.data;
  },

  async unsuspendCohort(id) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.UNSUSPEND(id));
    return response.data;
  }
};
