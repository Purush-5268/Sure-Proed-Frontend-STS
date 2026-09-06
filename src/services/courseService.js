import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

let getCoursesPromise = null;

let getCourseByIdPromises = {};

export const courseService = {
  async getCourses(params = {}) {
    if (Object.keys(params).length === 0) {
      if (getCoursesPromise) return getCoursesPromise;
      
      getCoursesPromise = apiClient.get(API_ENDPOINTS.COURSES.BASE, { params })
        .then(res => res.data)
        .finally(() => { getCoursesPromise = null; });
      return getCoursesPromise;
    }
    
    const response = await apiClient.get(API_ENDPOINTS.COURSES.BASE, { params });
    return response.data;
  },

  async getCourseById(id) {
    if (getCourseByIdPromises[id]) return getCourseByIdPromises[id];

    getCourseByIdPromises[id] = apiClient.get(API_ENDPOINTS.COURSES.BY_ID(id))
      .then(res => res.data)
      .catch(err => {
        // 404 means the course no longer exists — return null gracefully
        if (err?.response?.status === 404) return null;
        throw err;
      })
      .finally(() => { delete getCourseByIdPromises[id]; });

    return getCourseByIdPromises[id];
  },

  async createCourse(courseData) {
    const response = await apiClient.post(API_ENDPOINTS.COURSES.BASE, courseData);
    return response.data;
  },

  async updateCourse(id, courseData) {
    const response = await apiClient.put(API_ENDPOINTS.COURSES.BY_ID(id), courseData);
    return response.data;
  },

  async patchCourse(id, courseData) {
    const response = await apiClient.patch(API_ENDPOINTS.COURSES.BY_ID(id), courseData);
    return response.data;
  },

  async deleteCourse(id) {
    const response = await apiClient.delete(API_ENDPOINTS.COURSES.BY_ID(id));
    return response.data;
  },
};
