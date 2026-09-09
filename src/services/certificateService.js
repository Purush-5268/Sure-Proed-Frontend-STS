import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

export const certificateService = {
  async getCertificates(params = {}) {
    const response = await apiClient.get(API_ENDPOINTS.CERTIFICATES.BASE, { params });
    return response.data;
  },

  async getCertificateById(id) {
    const response = await apiClient.get(API_ENDPOINTS.CERTIFICATES.BY_ID(id));
    return response.data;
  },

  async createCertificate(data) {
    const response = await apiClient.post(API_ENDPOINTS.CERTIFICATES.BASE, data);
    return response.data;
  },

  async updateCertificate(id, data) {
    const response = await apiClient.put(API_ENDPOINTS.CERTIFICATES.BY_ID(id), data);
    return response.data;
  },

  async patchCertificate(id, data) {
    const response = await apiClient.patch(API_ENDPOINTS.CERTIFICATES.BY_ID(id), data);
    return response.data;
  },

  async deleteCertificate(id) {
    const response = await apiClient.delete(API_ENDPOINTS.CERTIFICATES.BY_ID(id));
    return response.data;
  },

  async verifyCertificate(code) {
    const response = await apiClient.get(API_ENDPOINTS.CERTIFICATES.VERIFY, {
      params: { code },
    });
    return response.data;
  },

  async downloadCertificate(certificate) {
    const certId = typeof certificate === "object" ? certificate.id : certificate;
    const certNumber = typeof certificate === "object" ? (certificate.certificate_number || certId) : certId;
    const filename = `Certificate_${certNumber}.pdf`;

    const downloadUrl = (typeof certificate === "object" && certificate.download_url)
      ? certificate.download_url
      : `/api/certificates/${certId}/download/`;

    try {
      const response = await apiClient.get(downloadUrl, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      console.warn("Authenticated blob download failed, opening direct URL:", err);
      window.open(downloadUrl, "_blank");
    }
  },
};
