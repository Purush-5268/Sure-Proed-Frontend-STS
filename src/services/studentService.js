import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

const PROFILE_STORAGE_KEY_PREFIX = "sure_student_profile_";

const normalizeProfile = (profile = {}) => {
  const user = profile.user || {};
  
  // Fix mixed-content issues by stripping absolute HTTP backend origins for media URLs
  let photoUrl = profile.profile_photo || "";
  if (photoUrl && photoUrl.startsWith("http")) {
    try {
      photoUrl = new URL(photoUrl).pathname; // Extract only the /media/... part
    } catch (e) {}
  }

  return {
    ...profile,
    profile_photo: photoUrl,
    id: profile.id || null,
    firstName: profile.first_name || profile.firstName || user.first_name || user.firstName || "",
    lastName: profile.last_name || profile.lastName || user.last_name || user.lastName || "",
    email: profile.email || user.email || "",
    phoneNumber: profile.phone_number || profile.phoneNumber || user.phone_number || user.phoneNumber || "",
    dob: profile.date_of_birth || profile.dob || user.date_of_birth || "",
    gender: profile.gender || user.gender || "",
    
    // Core details
    college: profile.college || profile.collegeName || "",
    degree: profile.degree || "",
    specialization: profile.specialization || profile.branch || "",
    education_level: profile.education_level || "",
    graduation_year: profile.graduation_year || profile.graduationYear || "",
    city: profile.city || "",
    state: profile.state || "",
    country: profile.country || "",
    bio: profile.bio || profile.address || "",
    tagline: profile.tagline || profile.technicalSkills || "",
    
    // Extras (Backend sends arrays, Frontend needs comma-separated strings)
    skills: Array.isArray(profile.skills) ? profile.skills.join(", ") : (profile.skills || ""),
    hobbies: Array.isArray(profile.hobbies) ? profile.hobbies.join(", ") : (profile.hobbies || ""),
    languages: Array.isArray(profile.languages) ? profile.languages.join(", ") : (profile.languages || ""),
    portfolio_url: profile.portfolio_url || "",
    resume: profile.resume || "",

    // Integrations
    linkedin_url: profile.linkedin_url || "",
    github_username: profile.github_username || "",
    
    // Legacy mapping (For backwards compatibility with some components)
    collegeName: profile.college || profile.collegeName || "",
    branch: profile.specialization || profile.branch || "",
    graduationYear: profile.graduation_year || profile.graduationYear || "",
    address: profile.bio || profile.address || "",
    technicalSkills: profile.tagline || profile.technicalSkills || "",
    
    // Existing student fields (Single courseBatch like G2-26)
    isExistingStudent: profile.is_existing_student ? "yes" : profile.isExistingStudent || "no",
    courseId: profile.course_id || profile.courseId || profile.course || "",
    courseBatch: profile.course_batch || profile.courseBatch || "",
  };
};

export const isProfileComplete = (profile = {}) => {
  const normalized = normalizeProfile(profile);

  return Boolean(
    normalized.firstName &&
    normalized.lastName &&
    normalized.email &&
    normalized.phoneNumber &&
    normalized.college &&
    normalized.degree &&
    normalized.specialization &&
    normalized.graduation_year
  );
};

export const checkCurrentEnrollment = (profile, activeApplication) => {
  if (profile?.status === "ADMIN_APPROVED") return true;
  if (profile?.authoritative_course_batch) return true;
  const ENROLLED_STATUSES = ['COHORT_ASSIGNED', 'IN_PROGRESS', 'ACTIVE', 'TRAINING', 'INTERNSHIP', 'SOFT_SKILLS', 'PRE_TRAINING', 'COMPLETED'];
  if (activeApplication && ENROLLED_STATUSES.includes(activeApplication.status)) return true;
  return false;
};

export const resolveStudentEnrollment = (serverProfile, applications = [], courses = []) => {
  const appsArray = Array.isArray(applications) ? applications : (applications?.results || []);
  const coursesArray = Array.isArray(courses) ? courses : (courses?.results || []);

  const ENROLLED_STATUSES = ['COHORT_ASSIGNED', 'IN_PROGRESS', 'ACTIVE', 'TRAINING', 'INTERNSHIP', 'SOFT_SKILLS', 'PRE_TRAINING', 'COMPLETED'];
  const activeApp = appsArray.find(a => ENROLLED_STATUSES.includes(a.status));
  
  // Debug: log what statuses are coming back so we can diagnose issues
  if (appsArray.length > 0) {
    console.log('[Dashboard] Applications found:', appsArray.map(a => ({ id: a.id, status: a.status, cohort: a.assigned_cohort?.code })));
  } else {
    console.log('[Dashboard] No applications returned from API');
  }

  // Fallback: if no cohort-assigned app found, try SUSPENDED ones too
  const suspendedApp = !activeApp ? appsArray.find(a => a.status === 'SUSPENDED') : null;

  const isEnrolled = Boolean(
    ENROLLED_STATUSES.includes(serverProfile?.status) ||
    (serverProfile?.status === "ADMIN_APPROVED") ||
    (serverProfile?.authoritative_course_batch) ||
    activeApp ||
    suspendedApp
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
  let courseDomain = null;

  if (activeApp?.course?.name) {
    courseId = activeApp.course.id || activeApp.course;
    courseName = activeApp.course.name;
    courseDomain = activeApp.course.domain;
  } else if (serverProfile?.course_id) {
    courseId = serverProfile.course_id;
  }

  // Always attempt to enrich with authoritative data from the courses list
  if (courseId || courseName) {
    // Handle case where activeApp.course is an ID or an object
    const resolvedId = typeof courseId === 'object' ? courseId.id : courseId;
    const matched = coursesArray.find(c => 
      (resolvedId && c.id === resolvedId) || 
      (courseName && c.name === courseName)
    );
    if (matched) {
      if (!courseName) courseName = matched.name;
      // The matched course from /api/courses/ always contains the full fields
      courseDomain = matched.domain;
    }
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
    courseDomain,
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
        return normalizeProfile(profile);
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
      dob: profileData.dob || existing.dob || "",
      gender: profileData.gender || existing.gender || "",
    };

    try {
      const formData = new FormData();
      
      // Fields exactly matching backend (strings)
      const stringFieldsToAppend = [
        "college", "degree", "specialization", "education_level", 
        "city", "state", "country", "bio", "tagline",
        "portfolio_url", "linkedin_url", "github_username",
        "skills", "hobbies", "languages"
      ];
      
      stringFieldsToAppend.forEach(field => {
        if (updated[field] !== undefined) {
          formData.append(field, updated[field] || "");
        }
      });
      
      if (updated.graduation_year) formData.append("graduation_year", Number(updated.graduation_year));
      if (updated.dob) formData.append("date_of_birth", updated.dob);
      if (updated.gender) formData.append("gender", updated.gender);
      
      // Handle file uploads
      if (updated.profile_photo instanceof File) {
        formData.append("profile_photo", updated.profile_photo);
      }
      if (updated.resume instanceof File) {
        formData.append("resume", updated.resume);
      }
      if (updated.offerLetter instanceof File) {
        formData.append("uploaded_offer_letter", updated.offerLetter);
      }
      
      // Verification Fields
      formData.append("is_existing_student", updated.isExistingStudent === "yes");
      if (updated.courseId) formData.append("course_id", updated.courseId);
      formData.append("course_batch", updated.courseBatch || "");

      const config = {}; // Let Axios automatically set the Content-Type with boundary for FormData

      if (existing.id) {
        await apiClient.patch(API_ENDPOINTS.STUDENTS.BY_ID(existing.id), formData, config);
      } else {
        await apiClient.post(API_ENDPOINTS.STUDENTS.BASE, formData, config);
      }

      // Sync user profile names
      const meResponse = await apiClient.get(API_ENDPOINTS.USERS.ME);
      const userId = meResponse?.data?.id;
      if (userId) {
        const userUpdatePayload = {
          first_name: updated.firstName || "",
          last_name: updated.lastName || "",
          phone_number: updated.phoneNumber || "",
        };
        if (updated.gender) userUpdatePayload.gender = updated.gender;
        if (updated.dob) userUpdatePayload.date_of_birth = updated.dob;
        
        await apiClient.patch(API_ENDPOINTS.USERS.BY_ID(userId), userUpdatePayload);
      }
    } catch (err) {
      console.error("Backend profile save failed:", err.message || err);
      throw err;
    }

    return updated;
  },
};
