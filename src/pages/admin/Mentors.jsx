import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse, fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Mentors.module.css";
import {
  FiUsers,
  FiBook,
  FiUserPlus,
  FiUserMinus,
  FiCheck,
  FiAward,
  FiSearch,
  FiChevronDown,
  FiAlertCircle,
  FiStar,
  FiLayers,
  FiCheckCircle,
  FiExternalLink,
} from "react-icons/fi";

/**
 * Admin Mentor Management & Multi-Course Cohort Assignment
 *
 * Workflow:
 * 1. Select Course -> Select Cohort
 * 2. View Current Mentors assigned to this cohort with "Remove from this cohort" button
 * 3. View Other Mentors for the same course with "Add to Cohort" button (cohort can have multiple mentors)
 * 4. "All Mentors Directory" view with course qualifications, assigned cohorts, and search
 */
function Mentors() {
  const [courses, setCourses] = useState([]);
  const [allMentors, setAllMentors] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [cohorts, setCohorts] = useState([]);

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMentors, setLoadingMentors] = useState(true);
  const [loadingCohorts, setLoadingCohorts] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null); // mentorId
  const [feedbackMsg, setFeedbackMsg] = useState(null); // { type: 'success'|'error', text: '' }

  // Tabs: "assign" (Course & Cohort Assignment Tool) | "directory" (All Mentors Directory)
  const [activeTab, setActiveTab] = useState("assign");
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryCourseFilter, setDirectoryCourseFilter] = useState("ALL");

  // Load initial courses and all mentors
  const loadInitialData = async () => {
    setLoadingCourses(true);
    setLoadingMentors(true);
    try {
      const [coursesRes, mentorsRes] = await Promise.all([
        fetchAllPages(API_ENDPOINTS.COURSES.BASE).catch(() => []),
        fetchAllPages(API_ENDPOINTS.USERS.BASE + "?role=MENTOR").catch(() => []),
      ]);

      setCourses(coursesRes || []);
      setAllMentors(mentorsRes || []);
    } catch (err) {
      console.error("Failed to load initial mentor management data", err);
    } finally {
      setLoadingCourses(false);
      setLoadingMentors(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // When selectedCourse changes, fetch cohorts of that course
  useEffect(() => {
    if (!selectedCourse) {
      setCohorts([]);
      setSelectedCohort(null);
      return;
    }

    let isMounted = true;
    const fetchCohortsForCourse = async () => {
      setLoadingCohorts(true);
      setSelectedCohort(null);
      try {
        const res = await apiClient.get(API_ENDPOINTS.COHORTS.BASE, {
          params: { course: selectedCourse.id, page_size: 100 },
        });
        const data = normalizeListResponse(res.data);
        if (isMounted) {
          setCohorts(data);
          // If there is only 1 cohort or user wants first, let user pick
        }
      } catch (err) {
        console.error("Error loading cohorts for course:", err);
      } finally {
        if (isMounted) setLoadingCohorts(false);
      }
    };

    fetchCohortsForCourse();
    return () => {
      isMounted = false;
    };
  }, [selectedCourse]);

  // Refresh single cohort details
  const refreshCohort = async (cohortId) => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(cohortId));
      setSelectedCohort(res.data);

      // Also refresh cohorts list so other views stay synced
      setCohorts((prev) =>
        prev.map((c) => (String(c.id) === String(cohortId) ? res.data : c))
      );

      // Refresh mentors list to update cohort badges
      const mentorsRes = await fetchAllPages(API_ENDPOINTS.USERS.BASE + "?role=MENTOR").catch(() => []);
      if (mentorsRes && mentorsRes.length > 0) {
        setAllMentors(mentorsRes);
      }
    } catch (err) {
      console.error("Failed to refresh cohort", err);
    }
  };

  // Helper: check if a mentor is currently assigned to the selected cohort
  const isMentorAssignedToCohort = (mentor, cohort) => {
    if (!cohort || !mentor) return false;
    const mentorId = String(mentor.id);

    // 1. Check cohort.mentors array (may be IDs or objects)
    if (Array.isArray(cohort.mentors)) {
      if (
        cohort.mentors.some((m) =>
          typeof m === "object" ? String(m.id) === mentorId : String(m) === mentorId
        )
      ) {
        return true;
      }
    }

    // 2. Check cohort.active_mentors
    if (Array.isArray(cohort.active_mentors)) {
      if (cohort.active_mentors.some((m) => String(m.id) === mentorId)) {
        return true;
      }
    }

    // 3. Check mentor.assigned_cohorts
    if (Array.isArray(mentor.assigned_cohorts)) {
      if (mentor.assigned_cohorts.some((c) => String(c.id) === String(cohort.id))) {
        return true;
      }
    }

    return false;
  };

  // Helper: check if mentor is qualified for the selected course
  const isMentorQualifiedForCourse = (mentor, course) => {
    if (!course || !mentor) return true;
    const courseId = String(course.id);
    const courseName = (course.name || "").toLowerCase();

    // If mentor has courses array
    if (Array.isArray(mentor.courses) && mentor.courses.length > 0) {
      return mentor.courses.some(
        (c) =>
          String(c.id) === courseId ||
          (c.name && c.name.toLowerCase() === courseName)
      );
    }

    // Fallback: check expertise text or allow if unassigned
    if (mentor.expertise && mentor.expertise.toLowerCase().includes(courseName)) {
      return true;
    }

    // If mentor has NO courses assigned at all, they are a general/unassigned mentor who can be assigned
    if (!mentor.courses || mentor.courses.length === 0) {
      return true;
    }

    return false;
  };

  // Derived: Current Mentors for selected cohort
  const currentCohortMentors = useMemo(() => {
    if (!selectedCohort) return [];
    return allMentors.filter((m) => isMentorAssignedToCohort(m, selectedCohort));
  }, [allMentors, selectedCohort]);

  // Derived: Available Mentors for the same course (NOT in this cohort)
  const availableCourseMentors = useMemo(() => {
    if (!selectedCohort || !selectedCourse) return [];
    return allMentors.filter(
      (m) =>
        isMentorQualifiedForCourse(m, selectedCourse) &&
        !isMentorAssignedToCohort(m, selectedCohort)
    );
  }, [allMentors, selectedCohort, selectedCourse]);

  // Handle assigning mentor to cohort
  const handleAssignMentor = async (mentorId) => {
    if (!selectedCohort) return;
    setActionInProgress(mentorId);
    setFeedbackMsg(null);
    try {
      await apiClient.post(API_ENDPOINTS.COHORTS.ASSIGN_MENTOR(selectedCohort.id), {
        mentor_id: mentorId,
      });

      setFeedbackMsg({
        type: "success",
        text: "Mentor successfully added to cohort!",
      });

      await refreshCohort(selectedCohort.id);
    } catch (err) {
      console.error("Assign mentor error:", err);
      setFeedbackMsg({
        type: "error",
        text: err?.response?.data?.error || err?.response?.data?.detail || "Failed to add mentor to cohort.",
      });
    } finally {
      setActionInProgress(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Handle removing mentor from cohort
  const handleRemoveMentor = async (mentorId, mentorName) => {
    if (!selectedCohort) return;
    if (
      !window.confirm(
        `Are you sure you want to remove ${mentorName || "this mentor"} from cohort ${selectedCohort.code}?`
      )
    ) {
      return;
    }

    setActionInProgress(mentorId);
    setFeedbackMsg(null);
    try {
      await apiClient.post(API_ENDPOINTS.COHORTS.REVOKE_MENTOR(selectedCohort.id), {
        mentor_id: mentorId,
      });

      setFeedbackMsg({
        type: "success",
        text: `${mentorName || "Mentor"} removed from cohort ${selectedCohort.code}.`,
      });

      await refreshCohort(selectedCohort.id);
    } catch (err) {
      console.error("Remove mentor error:", err);
      setFeedbackMsg({
        type: "error",
        text: err?.response?.data?.error || err?.response?.data?.detail || "Failed to remove mentor from cohort.",
      });
    } finally {
      setActionInProgress(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Handle toggling Primary/Current mentor status
  const handleToggleCurrentMentor = async (mentorId, isCurrentlyPrimary) => {
    if (!selectedCohort) return;
    setActionInProgress(mentorId);
    setFeedbackMsg(null);
    try {
      if (isCurrentlyPrimary) {
        await apiClient.post(API_ENDPOINTS.COHORTS.REVOKE_CURRENT_MENTOR(selectedCohort.id), {
          mentor_id: mentorId,
        });
        setFeedbackMsg({ type: "success", text: "Primary mentor designation revoked." });
      } else {
        await apiClient.post(API_ENDPOINTS.COHORTS.SET_CURRENT_MENTOR(selectedCohort.id), {
          mentor_id: mentorId,
        });
        setFeedbackMsg({ type: "success", text: "Designated as Primary Current Mentor for this cohort." });
      }
      await refreshCohort(selectedCohort.id);
    } catch (err) {
      console.error("Current mentor toggle error:", err);
      setFeedbackMsg({
        type: "error",
        text: err?.response?.data?.error || "Failed to update current mentor status.",
      });
    } finally {
      setActionInProgress(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Filtered mentors for Directory tab
  const directoryMentorsList = useMemo(() => {
    return allMentors.filter((m) => {
      // Course filter
      if (directoryCourseFilter !== "ALL") {
        if (!m.courses || !m.courses.some((c) => String(c.id) === directoryCourseFilter)) {
          return false;
        }
      }
      // Search query
      if (directorySearch.trim()) {
        const q = directorySearch.toLowerCase().trim();
        const name = `${m.first_name || ""} ${m.last_name || ""}`.toLowerCase();
        const email = (m.email || "").toLowerCase();
        const company = (m.company_name || m.organization || "").toLowerCase();
        const designation = (m.designation || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !company.includes(q) && !designation.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [allMentors, directorySearch, directoryCourseFilter]);

  return (
    <div style={{ padding: "2rem", width: "100%", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Top Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.85rem", fontWeight: 700 }}>
            Mentor & Cohort Assignment Center
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0 0", fontSize: "0.95rem" }}>
            Assign qualified mentors to cohort tracks, manage multi-mentor teaching teams, and view mentor qualifications.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "var(--bg-nested)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
            <button
              type="button"
              onClick={() => setActiveTab("assign")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                backgroundColor: activeTab === "assign" ? "var(--bg-surface)" : "transparent",
                color: activeTab === "assign" ? "var(--primary-color)" : "var(--text-secondary)",
                boxShadow: activeTab === "assign" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FiLayers style={{ fontSize: "14px" }} />
              <span>Cohort Assignment Tool</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                backgroundColor: activeTab === "directory" ? "var(--bg-surface)" : "transparent",
                color: activeTab === "directory" ? "var(--primary-color)" : "var(--text-secondary)",
                boxShadow: activeTab === "directory" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FiUsers style={{ fontSize: "14px" }} />
              <span>All Mentors Directory ({allMentors.length})</span>
            </button>
          </div>

          <Link
            to="/admin/add-mentor"
            style={{
              padding: "10px 18px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "13.5px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
            }}
          >
            <FiUserPlus style={{ fontSize: "16px" }} />
            <span>Add Mentor</span>
          </Link>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: feedbackMsg.type === "success" ? "rgba(22, 163, 74, 0.12)" : "rgba(220, 38, 38, 0.12)",
            color: feedbackMsg.type === "success" ? "#16a34a" : "#dc2626",
            border: `1px solid ${feedbackMsg.type === "success" ? "rgba(22, 163, 74, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
          }}
        >
          {feedbackMsg.type === "success" ? <FiCheckCircle /> : <FiAlertCircle />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* TAB 1: COHORT ASSIGNMENT TOOL */}
      {activeTab === "assign" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Step 1 & 2: Course and Cohort Selectors Bar */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              padding: "20px 24px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
              alignItems: "center",
            }}
          >
            {/* Course Selector */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "var(--text-primary)", fontSize: "14px", marginBottom: "8px" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#2563eb", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
                  1
                </span>
                <span>Select Course Domain</span>
              </label>
              {loadingCourses ? (
                <SkeletonLoader height="42px" borderRadius="8px" />
              ) : (
                <select
                  value={selectedCourse?.id || ""}
                  onChange={(e) => {
                    const c = courses.find((item) => String(item.id) === e.target.value);
                    setSelectedCourse(c || null);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-nested)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <option value="">-- Choose a Course Track --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Cohort Selector */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "var(--text-primary)", fontSize: "14px", marginBottom: "8px" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: selectedCourse ? "#2563eb" : "#94a3b8", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
                  2
                </span>
                <span>Select Cohort</span>
              </label>
              {!selectedCourse ? (
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--bg-nested)", border: "1px dashed var(--border-color)", color: "var(--text-secondary)", fontSize: "13px" }}>
                  Please select a course first.
                </div>
              ) : loadingCohorts ? (
                <SkeletonLoader height="42px" borderRadius="8px" />
              ) : cohorts.length === 0 ? (
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: "var(--bg-nested)", border: "1px solid var(--border-color)", color: "var(--text-secondary)", fontSize: "13px" }}>
                  No cohorts found for this course.
                </div>
              ) : (
                <select
                  value={selectedCohort?.id || ""}
                  onChange={(e) => {
                    const ch = cohorts.find((item) => String(item.id) === e.target.value);
                    setSelectedCohort(ch || null);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--primary-color)",
                    backgroundColor: "var(--bg-nested)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <option value="">-- Select Active Cohort --</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name} ({c.status || "ACTIVE"})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* If Course & Cohort are selected: Render Current Mentors and Available Mentors */}
          {selectedCourse && selectedCohort && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* SECTION: CURRENT MENTORS IN THIS COHORT */}
              <div
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  overflow: "hidden",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    padding: "16px 22px",
                    backgroundColor: "var(--bg-nested)",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                      <FiUsers style={{ color: "#2563eb", fontSize: "18px" }} />
                      <span>Current Mentors for Cohort:</span>
                      <span style={{ color: "#2563eb" }}>{selectedCohort.code}</span>
                    </h3>
                    <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                      A cohort can have multiple mentors. Below are the mentors currently assigned to teach this cohort.
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: 700,
                      backgroundColor: currentCohortMentors.length > 0 ? "rgba(37, 99, 235, 0.12)" : "rgba(100, 116, 139, 0.12)",
                      color: currentCohortMentors.length > 0 ? "#2563eb" : "var(--text-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {currentCohortMentors.length} Mentor{currentCohortMentors.length !== 1 ? "s" : ""} Assigned
                  </span>
                </div>

                {currentCohortMentors.length === 0 ? (
                  <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
                    <FiAlertCircle style={{ fontSize: "2rem", color: "#f59e0b", marginBottom: "8px" }} />
                    <h4 style={{ margin: "0 0 4px 0", color: "var(--text-primary)", fontSize: "15px" }}>No Mentors Assigned Yet</h4>
                    <p style={{ margin: 0, fontSize: "13px" }}>
                      Choose from the available course mentors below to assign teaching staff to this cohort.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {currentCohortMentors.map((mentor, idx) => {
                      const isPrimary = selectedCohort.current_mentors_details?.some(
                        (cm) => String(cm.id) === String(mentor.id)
                      );
                      const name = `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email;

                      return (
                        <div
                          key={mentor.id}
                          style={{
                            padding: "16px 22px",
                            borderBottom: idx < currentCohortMentors.length - 1 ? "1px solid var(--border-color)" : "none",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "16px",
                            backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(100, 116, 139, 0.02)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            <div
                              style={{
                                width: "42px",
                                height: "42px",
                                borderRadius: "50%",
                                backgroundColor: "rgba(37, 99, 235, 0.12)",
                                color: "#2563eb",
                                fontWeight: 700,
                                fontSize: "15px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                border: "1px solid rgba(37, 99, 235, 0.2)",
                              }}
                            >
                              {(mentor.first_name || "M").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <strong style={{ fontSize: "14.5px", color: "var(--text-primary)" }}>{name}</strong>
                                {isPrimary && (
                                  <span style={{ fontSize: "10.5px", background: "rgba(245, 158, 11, 0.12)", color: "#b45309", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "1px 7px", borderRadius: "10px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                    <FiStar style={{ fontSize: "10px" }} /> Primary Mentor
                                  </span>
                                )}
                                <span style={{ fontSize: "11px", background: "rgba(22, 163, 74, 0.1)", color: "#166534", padding: "1px 7px", borderRadius: "10px", fontWeight: 600 }}>
                                  Assigned
                                </span>
                              </div>
                              <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                {mentor.email} {mentor.designation ? `• ${mentor.designation}` : ""} {mentor.company_name || mentor.organization ? `at ${mentor.company_name || mentor.organization}` : ""}
                              </div>
                              {mentor.courses && mentor.courses.length > 0 && (
                                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "6px" }}>
                                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600 }}>Qualified:</span>
                                  {mentor.courses.map((mc) => (
                                    <span key={mc.id} style={{ fontSize: "11px", background: "var(--bg-nested)", padding: "1px 6px", borderRadius: "4px", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                                      {mc.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleToggleCurrentMentor(mentor.id, isPrimary)}
                              disabled={actionInProgress === mentor.id}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: isPrimary ? "1px solid #f59e0b" : "1px solid var(--border-color)",
                                backgroundColor: isPrimary ? "rgba(245, 158, 11, 0.1)" : "var(--bg-surface)",
                                color: isPrimary ? "#b45309" : "var(--text-secondary)",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                              title={isPrimary ? "Revoke primary mentor tag" : "Designate as primary/current mentor"}
                            >
                              {isPrimary ? "Revoke Primary" : "Set as Primary"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveMentor(mentor.id, name)}
                              disabled={actionInProgress === mentor.id}
                              style={{
                                padding: "6px 14px",
                                borderRadius: "6px",
                                border: "1px solid rgba(220, 38, 38, 0.3)",
                                backgroundColor: "rgba(220, 38, 38, 0.08)",
                                color: "#dc2626",
                                fontSize: "12.5px",
                                fontWeight: 600,
                                cursor: actionInProgress === mentor.id ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                              title="Remove this mentor from this cohort"
                            >
                              <FiUserMinus style={{ fontSize: "14px" }} />
                              <span>{actionInProgress === mentor.id ? "Removing..." : "Remove from this cohort"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION: OTHER MENTORS FOR THIS COURSE (AVAILABLE TO ADD) */}
              <div
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  overflow: "hidden",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    padding: "16px 22px",
                    backgroundColor: "var(--bg-nested)",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                      <FiUserPlus style={{ color: "#059669", fontSize: "18px" }} />
                      <span>Available Mentors for Course:</span>
                      <span style={{ color: "var(--primary-color)" }}>{selectedCourse.name}</span>
                    </h3>
                    <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                      These mentors are qualified to teach this course and can be added to cohort <strong>{selectedCohort.code}</strong>.
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: 700,
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      color: "#059669",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                    }}
                  >
                    {availableCourseMentors.length} Available to Add
                  </span>
                </div>

                {availableCourseMentors.length === 0 ? (
                  <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
                    <FiCheckCircle style={{ fontSize: "2rem", color: "#10b981", marginBottom: "8px" }} />
                    <h4 style={{ margin: "0 0 4px 0", color: "var(--text-primary)", fontSize: "15px" }}>All Available Mentors Are Assigned</h4>
                    <p style={{ margin: 0, fontSize: "13px" }}>
                      All mentors qualified for "{selectedCourse.name}" are currently assigned to this cohort. To add new mentors, use "Add Mentor" above.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {availableCourseMentors.map((mentor, idx) => {
                      const name = `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email;

                      return (
                        <div
                          key={mentor.id}
                          style={{
                            padding: "16px 22px",
                            borderBottom: idx < availableCourseMentors.length - 1 ? "1px solid var(--border-color)" : "none",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "16px",
                            backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(100, 116, 139, 0.02)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            <div
                              style={{
                                width: "42px",
                                height: "42px",
                                borderRadius: "50%",
                                backgroundColor: "rgba(16, 185, 129, 0.12)",
                                color: "#059669",
                                fontWeight: 700,
                                fontSize: "15px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                border: "1px solid rgba(16, 185, 129, 0.2)",
                              }}
                            >
                              {(mentor.first_name || "M").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <strong style={{ fontSize: "14.5px", color: "var(--text-primary)" }}>{name}</strong>
                                {mentor.expertise && (
                                  <span style={{ fontSize: "11px", background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed", padding: "1px 7px", borderRadius: "10px", fontWeight: 600 }}>
                                    {mentor.expertise}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                {mentor.email} {mentor.designation ? `• ${mentor.designation}` : ""} {mentor.company_name || mentor.organization ? `at ${mentor.company_name || mentor.organization}` : ""}
                              </div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px", alignItems: "center" }}>
                                {mentor.courses && mentor.courses.length > 0 && (
                                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Courses:</span>
                                    {mentor.courses.map((mc) => (
                                      <span key={mc.id} style={{ fontSize: "11px", background: "var(--bg-nested)", padding: "1px 6px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                                        {mc.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {mentor.assigned_cohorts && mentor.assigned_cohorts.length > 0 && (
                                  <span style={{ fontSize: "11px", color: "#6366f1", background: "rgba(99, 102, 241, 0.08)", padding: "1px 6px", borderRadius: "4px" }}>
                                    In {mentor.assigned_cohorts.length} other cohort{mentor.assigned_cohorts.length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAssignMentor(mentor.id)}
                            disabled={actionInProgress === mentor.id}
                            style={{
                              padding: "7px 16px",
                              borderRadius: "6px",
                              backgroundColor: "#059669",
                              color: "white",
                              border: "none",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: actionInProgress === mentor.id ? "not-allowed" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              boxShadow: "0 2px 4px rgba(5, 150, 105, 0.2)",
                            }}
                            title={`Add ${name} to cohort ${selectedCohort.code}`}
                          >
                            <FiUserPlus style={{ fontSize: "14px" }} />
                            <span>{actionInProgress === mentor.id ? "Adding..." : "Add to Cohort"}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALL MENTORS DIRECTORY */}
      {activeTab === "directory" && (
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          }}
        >
          {/* Directory Filter Bar */}
          <div
            style={{
              padding: "16px 20px",
              backgroundColor: "var(--bg-nested)",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flex: 1, minWidth: "260px" }}>
              <div style={{ position: "relative", minWidth: "260px", flex: 1 }}>
                <FiSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: "14px" }} />
                <input
                  type="text"
                  placeholder="Search mentor by name, email, company..."
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "13px",
                  }}
                />
              </div>

              <select
                value={directoryCourseFilter}
                onChange={(e) => setDirectoryCourseFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  minWidth: "180px",
                }}
              >
                <option value="ALL">All Qualified Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>
              Showing {directoryMentorsList.length} of {allMentors.length} Mentors
            </div>
          </div>

          {/* Directory Table */}
          {loadingMentors ? (
            <div style={{ padding: "30px" }}>
              <SkeletonLoader variant="table" rows={6} />
            </div>
          ) : directoryMentorsList.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
              <p style={{ fontSize: "15px", fontWeight: 600 }}>No mentors found matching your filters.</p>
              <p style={{ fontSize: "13px", marginTop: "4px" }}>Try clearing your search query or course filter.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border-color)", textAlign: "left", backgroundColor: "var(--bg-nested)" }}>
                    <th style={{ padding: "12px 18px" }}>Mentor</th>
                    <th style={{ padding: "12px 18px" }}>Contact</th>
                    <th style={{ padding: "12px 18px" }}>Professional Info</th>
                    <th style={{ padding: "12px 18px" }}>Qualified Courses</th>
                    <th style={{ padding: "12px 18px" }}>Assigned Cohorts</th>
                    <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {directoryMentorsList.map((m, idx) => {
                    const name = `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email;
                    return (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                          backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(100, 116, 139, 0.02)",
                        }}
                      >
                        <td style={{ padding: "12px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                              style={{
                                width: "34px",
                                height: "34px",
                                borderRadius: "50%",
                                backgroundColor: "rgba(37, 99, 235, 0.12)",
                                color: "#2563eb",
                                fontWeight: 700,
                                fontSize: "13px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {(m.first_name || "M").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ color: "var(--text-primary)", display: "block" }}>{name}</strong>
                              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                Active Mentor
                              </span>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "12px 18px", color: "var(--text-secondary)" }}>
                          <div>{m.email}</div>
                          {m.phone_number && <div style={{ fontSize: "11.5px" }}>{m.phone_number}</div>}
                        </td>

                        <td style={{ padding: "12px 18px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {m.designation || "Mentor"}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                            {m.company_name || m.organization || "Independent"}
                          </div>
                        </td>

                        <td style={{ padding: "12px 18px" }}>
                          {m.courses && m.courses.length > 0 ? (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {m.courses.map((c) => (
                                <span
                                  key={c.id}
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 7px",
                                    borderRadius: "4px",
                                    backgroundColor: "rgba(37, 99, 235, 0.08)",
                                    color: "#1d4ed8",
                                    border: "1px solid rgba(37, 99, 235, 0.2)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {c.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                              General / Unassigned
                            </span>
                          )}
                        </td>

                        <td style={{ padding: "12px 18px" }}>
                          {m.assigned_cohorts && m.assigned_cohorts.length > 0 ? (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {m.assigned_cohorts.map((ch) => (
                                <span
                                  key={ch.id}
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 7px",
                                    borderRadius: "4px",
                                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                                    color: "#059669",
                                    border: "1px solid rgba(16, 185, 129, 0.2)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {ch.code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                              0 Cohorts Assigned
                            </span>
                          )}
                        </td>

                        <td style={{ padding: "12px 18px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => {
                              // If mentor has courses, pick their first course to jump into assign tab
                              if (m.courses && m.courses.length > 0) {
                                const targetCourse = courses.find((c) => String(c.id) === String(m.courses[0].id));
                                if (targetCourse) setSelectedCourse(targetCourse);
                              }
                              setActiveTab("assign");
                            }}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "var(--bg-nested)",
                              color: "var(--primary-color)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Assign to Cohort
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Mentors;