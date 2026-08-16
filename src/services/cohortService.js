import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

let getCohortsPromise = null;

let getCohortByIdPromises = {};

export const cohortService = {
  async getCohorts(params = {}) {
    if (Object.keys(params).length === 0) {
      if (getCohortsPromise) return getCohortsPromise;
      
      getCohortsPromise = apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params })
        .then(res => res.data)
        .finally(() => { getCohortsPromise = null; });
      return getCohortsPromise;
    }

    const response = await apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params });
    return response.data;
  },

  async getCohortById(id) {
    if (getCohortByIdPromises[id]) return getCohortByIdPromises[id];
    
    getCohortByIdPromises[id] = apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id))
      .then(res => res.data)
      .finally(() => { delete getCohortByIdPromises[id]; });
      
    return getCohortByIdPromises[id];
  },

  async createCohort(cohortData) {
    const response = await apiClient.post(API_ENDPOINTS.COHORTS.BASE, cohortData);
    return response.data;
  },

  async updateCohort(id, cohortData) {
    const response = await apiClient.put(API_ENDPOINTS.COHORTS.BY_ID(id), cohortData);
    return response.data;
  },

  async patchCohort(id, cohortData) {
    const response = await apiClient.patch(API_ENDPOINTS.COHORTS.BY_ID(id), cohortData);
    return response.data;
  },

  async deleteCohort(id) {
    const response = await apiClient.delete(API_ENDPOINTS.COHORTS.BY_ID(id));
    return response.data;
  },
};
