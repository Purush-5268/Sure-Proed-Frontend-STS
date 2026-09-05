import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { getAccessToken } from "../utils/tokenStorage";

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

  async getPrescreening(id) {
    const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.PRESCREENING(id));
    return response.data;
  },

  async adminStartPrescreening(id) {
    const response = await apiClient.post(API_ENDPOINTS.APPLICATIONS.PRESCREENING_ADMIN_START(id));
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
    const endpoint = API_ENDPOINTS.APPLICATIONS.DOWNLOAD_OFFER_LETTER(id);
    await this.downloadPrivateFile(endpoint, `Offer_Letter_${id}.pdf`);
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
  },

  async downloadPrivateFile(url, filename = "document.pdf") {
    try {
      // We must handle both full URLs and relative URLs.
      // If it's a relative URL starting with /media/, we shouldn't use apiClient 
      // because apiClient appends /api/ which would cause a 404.
      // Instead, we construct the full URL manually and use a fresh axios request.
      
      let fetchUrl = url;
      if (url.startsWith("/")) {
        // Construct full URL using VITE_API_BASE_URL (removing /api if it exists)
        const baseUrlStr = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api\/?$/, "");
        fetchUrl = `${baseUrlStr}${url}`;
      }

      const token = getAccessToken();
      
      // Open a blank window immediately to bypass popup blockers
      const newWindow = window.open("", "_blank");
      if (newWindow) {
        newWindow.document.write("Loading secure document...");
      }
      
      const response = await fetch(fetchUrl, {
        method: "GET",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
        },
      });

      if (!response.ok) {
        if (newWindow) newWindow.close();
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      if (newWindow) {
        newWindow.location.href = blobUrl;
      } else {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error("Failed to download file:", error);
      alert("Failed to download file. You may need to log in again or you don't have permission.");
    }
  }
};
