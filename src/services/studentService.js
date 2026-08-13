import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

const PROFILE_STORAGE_KEY_PREFIX = "sure_student_profile_";

const normalizeProfile = (profile = {}) => ({
  id: profile.id || null,
  firstName: profile.firstName || profile.first_name || "",
  lastName: profile.lastName || profile.last_name || "",
  email: profile.email || "",
  phoneNumber: profile.phoneNumber || profile.phone_number || "",
  dob: profile.dob || "",
  gender: profile.gender || "",
  collegeName: profile.collegeName || profile.college || "",
  university: profile.university || "",
  degree: profile.degree || "",
  branch: profile.branch || profile.specialization || "",
  currentYear: profile.currentYear || "",
  cgpa: profile.cgpa || "",
  graduationYear: profile.graduationYear || profile.graduation_year || "",
  address: profile.address || profile.bio || "",
  city: profile.city || "",
  district: profile.district || "",
  state: profile.state || "",
  pincode: profile.pincode || "",
  technicalSkills: profile.technicalSkills || profile.tagline || "",
  // Existing student fields (Single courseBatch like G2-26)
  isExistingStudent: profile.isExistingStudent || "no",
  courseId: profile.course_id || profile.courseId || profile.course || "",
  courseBatch: profile.courseBatch || profile.course_batch || "",
});

export const isProfileComplete = (profile = {}) => {
  const normalized = normalizeProfile(profile);

  return Boolean(
    normalized.firstName &&
    normalized.lastName &&
    normalized.email &&
    normalized.phoneNumber &&
    normalized.collegeName &&
    normalized.degree &&
    normalized.branch &&
    normalized.graduationYear
  );
};

export const checkCurrentEnrollment = (profile, activeApplication) => {
  if (profile?.status === "ADMIN_APPROVED") return true;
  if (profile?.authoritative_course_batch) return true;
  if (activeApplication && ['COHORT_ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(activeApplication.status)) return true;
  return false;
};

export const resolveStudentEnrollment = (serverProfile, applications = [], courses = []) => {
  const appsArray = Array.isArray(applications) ? applications : (applications?.results || []);
  const coursesArray = Array.isArray(courses) ? courses : (courses?.results || []);

  const activeApp = appsArray.find(a => ['COHORT_ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(a.status));

  const isEnrolled = Boolean(
    (serverProfile?.status === "ADMIN_APPROVED") ||
    (serverProfile?.authoritative_course_batch) ||
    activeApp
  );

  const isExistingStudent = serverProfile?.is_existing_student || serverProfile?.isExistingStudent === "yes";

  if (!isEnrolled) {
    return { 
      isEnrolled: false, 
      isExistingStudent,
      showVerificationTab: true 
    };
  }

  // Resolve Course
  let courseId = null;
  let courseName = null;

  if (activeApp?.course?.name) {
    courseId = activeApp.course.id;
    courseName = activeApp.course.name;
  } else if (serverProfile?.course_id) {
    courseId = serverProfile.course_id;
    const matched = coursesArray.find(c => c.id === courseId);
    if (matched) courseName = matched.name;
  }

  // Resolve Group
  let group = null;
  if (activeApp?.assigned_cohort?.code || activeApp?.assigned_cohort?.name) {
    group = activeApp.assigned_cohort.code || activeApp.assigned_cohort.name;
  } else if (serverProfile?.authoritative_course_batch) {
    group = serverProfile.authoritative_course_batch;
  } else if (serverProfile?.course_batch) {
    group = serverProfile.course_batch;
  }

  return {
    isEnrolled: true,
    courseId,
    courseName,
    group,
    status: activeApp ? activeApp.status : (serverProfile?.status || "UNKNOWN"),
    application: activeApp || null,
    source: activeApp ? "application" : "profile",
    isExistingStudent,
    showVerificationTab: false
  };
};

// ─── Centralized Classification & Extraction ─────────────────────

export const isStudentEligibleForBulk = (student) => {
  return (
    student.status === "PENDING_ADMIN_REVIEW" &&
    student.review_required === false &&
    (student.automated_verification_result || "").startsWith("Passed:")
  );
};

export const isStudentReviewRequired = (student) => {
  return (
    student.status === "PENDING_ADMIN_REVIEW" &&
    (student.review_required === true || !(student.automated_verification_result || "").startsWith("Passed:"))
  );
};

export const getStudentCourseId = (student) => {
  // Course identity must come exactly from the backend's course reference (either UUID string or ID)
  return student.course?.id || student.course || student.course_id || null;
};

export const studentService = {
  // ─── Utility Methods ──────────────────────────────────────────
  isProfileComplete,
  checkCurrentEnrollment,
  resolveStudentEnrollment,
  isStudentEligibleForBulk,
  isStudentReviewRequired,
  getStudentCourseId,

  // ─── Backend API Methods ──────────────────────────────────────
  async getStudentProfiles(params = {}, config = {}) {
    const response = await apiClient.get(API_ENDPOINTS.STUDENTS.BASE, { params, ...config });
    return response.data;
  },



  async getStudentById(id) {
    const response = await apiClient.get(API_ENDPOINTS.STUDENTS.BY_ID(id));
    return response.data;
  },

  async createStudentProfile(data) {
    const response = await apiClient.post(API_ENDPOINTS.STUDENTS.BASE, data);
    return response.data;
  },

  async updateStudentProfile(id, data) {
    const response = await apiClient.put(API_ENDPOINTS.STUDENTS.BY_ID(id), data);
    return response.data;
  },

  async patchStudentProfile(id, data) {
    const response = await apiClient.patch(API_ENDPOINTS.STUDENTS.BY_ID(id), data);
    return response.data;
  },

  async deleteStudentProfile(id) {
    const response = await apiClient.delete(API_ENDPOINTS.STUDENTS.BY_ID(id));
    return response.data;
  },

  async bulkVerifyStudents(profileIds) {
    const response = await apiClient.post(API_ENDPOINTS.STUDENTS.BULK_VERIFY, {
      profile_ids: profileIds,
    });
    return response.data;
  },

  async verifyStudent(id, action, reason = "") {
    const payload = { action };
    if (reason) payload.reason = reason;
    const response = await apiClient.post(API_ENDPOINTS.STUDENTS.VERIFY(id), payload);
    return response.data;
  },


  // ─── Profile Methods (Backend-First with localStorage Fallback) ──

  /**
   * Register a new student profile.
   * Tries the backend API first; falls back to localStorage if backend is unreachable.
   */
  async registerStudentProfile(signupData) {
    const { firstName, lastName, email, phoneNumber } = signupData;
    const cleanEmail = (email || "").trim().toLowerCase();

    try {
      const userData = {
        email: cleanEmail,
        first_name: firstName ? firstName.trim() : "",
        last_name: lastName ? lastName.trim() : "",
        phone_number: phoneNumber ? phoneNumber.trim() : "",
        password: signupData.password || "Temp@12345",
        role: "STUDENT",
      };
      const response = await apiClient.post(API_ENDPOINTS.USERS.BASE, userData);
      return {
        id: response.data.id,
        firstName: response.data.first_name || "",
        lastName: response.data.last_name || "",
        email: response.data.email,
        phoneNumber: response.data.phone_number || "",
      };
    } catch (err) {
      console.warn("Registration request failed:", err.message || err);
      return {
        firstName: firstName ? firstName.trim() : "",
        lastName: lastName ? lastName.trim() : "",
        email: cleanEmail,
        phoneNumber: phoneNumber ? phoneNumber.trim() : "",
      };
    }
  },

  /**
   * Get a student profile from the authoritative backend.
   */
  async getProfile(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    try {
      // Explicitly query for the user's email as a safety net against fetching all students
      const response = await apiClient.get(API_ENDPOINTS.STUDENTS.BASE, {
        params: { user__email: cleanEmail }
      });

      const data = response.data;
      const students = Array.isArray(data) ? data : (data?.results || []);

      const profile = students.find((item) => {
        const user = item.user || {};
        return (user.email || "").toLowerCase() === cleanEmail || (item.email || "").toLowerCase() === cleanEmail;
      }) || students[0];

      if (profile) {
        const user = profile.user || {};
        const mapped = normalizeProfile({
          ...profile,
          firstName: profile.first_name || profile.firstName || user.first_name || user.firstName || "",
          lastName: profile.last_name || profile.lastName || user.last_name || user.lastName || "",
          email: profile.email || user.email || cleanEmail,
          phoneNumber: profile.phone_number || profile.phoneNumber || user.phone_number || user.phoneNumber || "",
          collegeName: profile.college || profile.collegeName || "",
          branch: profile.specialization || profile.branch || "",
          graduationYear: profile.graduation_year || profile.graduationYear || "",
          address: profile.bio || profile.address || "",
          technicalSkills: profile.tagline || profile.technicalSkills || "",
          isExistingStudent: profile.is_existing_student ? "yes" : profile.isExistingStudent || "no",
          courseId: profile.course_id || profile.courseId || profile.course || "",
          courseBatch: profile.course_batch || profile.courseBatch || "",
        });
        return { ...profile, ...mapped };
      }
    } catch (err) {
      console.error("Backend profile fetch failed:", err.message || err);
    }

    return null;
  },

  /**
   * Save/update a student profile authoritatively to backend API.
   */
  async saveProfile(email, profileData) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    const existing = (await this.getProfile(cleanEmail)) || {};
    const updated = {
      ...existing,
      ...profileData,
      email: cleanEmail,
      firstName: profileData.firstName || existing.firstName || "",
      lastName: profileData.lastName || existing.lastName || "",
      phoneNumber: profileData.phoneNumber || existing.phoneNumber || "",
    };

    try {
      const formData = new FormData();
      formData.append("college", updated.collegeName || "");
      formData.append("degree", updated.degree || "");
      formData.append("specialization", updated.branch || "");
      if (updated.graduationYear) {
        formData.append("graduation_year", Number(updated.graduationYear));
      }
      formData.append("city", updated.city || "");
      formData.append("state", updated.state || "");
      formData.append("bio", updated.address || "");
      formData.append("tagline", updated.technicalSkills || "");

      // Verification Fields
      formData.append("is_existing_student", updated.isExistingStudent === "yes");
      if (updated.courseId) {
        formData.append("course_id", updated.courseId);
      }
      formData.append("course_batch", updated.courseBatch || "");

      // Append file if exists
      if (profileData.offerLetter) {
        formData.append("uploaded_offer_letter", profileData.offerLetter);
      }

      const config = { headers: { "Content-Type": "multipart/form-data" } };

      if (existing.id) {
        await apiClient.patch(API_ENDPOINTS.STUDENTS.BY_ID(existing.id), formData, config);
      } else {
        await apiClient.post(API_ENDPOINTS.STUDENTS.BASE, formData, config);
      }

      // Sync user profile names
      const meResponse = await apiClient.get(API_ENDPOINTS.USERS.ME);
      const userId = meResponse?.data?.id;
      if (userId) {
        await apiClient.patch(API_ENDPOINTS.USERS.BY_ID(userId), {
          first_name: updated.firstName || "",
          last_name: updated.lastName || "",
          phone_number: updated.phoneNumber || "",
        });
      }
    } catch (err) {
      console.error("Backend profile save failed:", err.message || err);
      throw err;
    }

    return updated;
  },
};
