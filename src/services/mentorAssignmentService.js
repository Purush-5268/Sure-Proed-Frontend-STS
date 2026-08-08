import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

// Note: Backend currently lacks these endpoints. 
// See ASSIGNMENT_BACKEND_REQUIREMENTS.md for details.
// This service acts as a placeholder to isolate all temporary logic 
// until the backend API is fully implemented, avoiding scattered TODOs.

export const mentorAssignmentService = {
  /**
   * Fetch all cohort mentor assignments.
   * @param {Object} params - Filters like cohort_id, mentor_id
   */
  async getAssignments(params = {}) {
    // TODO: BACKEND REQUIRED
    // This should ideally hit something like GET /api/cohort-mentor-assignments/
    // For now, returning an empty array or mock data to prevent UI crashing.
    console.warn("mentorAssignmentService.getAssignments is hitting a mock endpoint because backend support is missing.");
    return {
      results: [],
      count: 0
    };
  },

  /**
   * Assign a mentor to a cohort.
   * @param {Object} assignmentData - { cohort, mentor, assigned_from, is_primary }
   */
  async assignMentor(assignmentData) {
    // TODO: BACKEND REQUIRED
    console.warn("mentorAssignmentService.assignMentor is mocked.");
    return {
      id: "mock-id-" + Date.now(),
      ...assignmentData,
      assigned_until: null,
    };
  },

  /**
   * Update an existing assignment (e.g. changing assigned_until or is_primary).
   * @param {string} id 
   * @param {Object} updateData 
   */
  async updateAssignment(id, updateData) {
    // TODO: BACKEND REQUIRED
    console.warn("mentorAssignmentService.updateAssignment is mocked.");
    return {
      id,
      ...updateData
    };
  },

  /**
   * Delete an assignment.
   * @param {string} id 
   */
  async deleteAssignment(id) {
    // TODO: BACKEND REQUIRED
    console.warn("mentorAssignmentService.deleteAssignment is mocked.");
    return { success: true };
  }
};
