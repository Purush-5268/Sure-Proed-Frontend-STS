import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { courseService } from "../../services/courseService";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Mentors.module.css";
import { FiChevronDown, FiChevronRight, FiUsers, FiBook, FiUserPlus } from "react-icons/fi";

/**
 * Admin Mentor Assignment Page
 *
 * Hierarchical workflow:
 * 1. Select a Course
 * 2. View mentors belonging to that course domain
 * 3. View ONLY ACTIVE cohorts for that course
 * 4. Assign a mentor to a cohort
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
  const [assigning, setAssigning] = useState(null); // mentorId
  const [assignSuccess, setAssignSuccess] = useState(null);

  // New states for "Show Current Mentors"
  const [viewMode, setViewMode] = useState("assign"); // "assign" or "list"
  const [globalMentors, setGlobalMentors] = useState([]);
  const [loadingGlobalMentors, setLoadingGlobalMentors] = useState(false);

  // Load courses on mount
  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    const loadCourses = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.COURSES.BASE, { signal: abortController.signal });
        if (isMounted) setCourses(normalizeListResponse(res.data));
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error(err);
      }
      finally {
        if (isMounted) {
          setLoadingCourses(false);
          setLoadingMentors(false); // Initially false until a course is selected
        }
      }
    };

    loadCourses();
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  // Load active cohorts and relevant mentors when course is selected
  useEffect(() => {
    if (!selectedCourse) {
      setCohorts([]);
      setAllMentors([]);
      return;
    }
    setSelectedCohort(null);
    let isMounted = true;
    const abortController = new AbortController();

    setLoadingCohorts(true);
    setLoadingMentors(true);
    setCohorts([]);
    setAllMentors([]);

    const loadData = async () => {
      try {
        const [cohortsRes, mentorsRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COHORTS.BASE, {
            params: { course: selectedCourse.id },
            signal: abortController.signal
          }),
          apiClient.get(API_ENDPOINTS.MENTORS.BASE, {
            params: { course: selectedCourse.id },
            signal: abortController.signal
          })
        ]);

        const cohortsData = normalizeListResponse(cohortsRes.data);
        const mentorsData = normalizeListResponse(mentorsRes.data);

        if (isMounted) {
          // Only show currently running cohorts
          // Allow all cohort statuses so admin can assign mentors to new/old cohorts
          setCohorts(cohortsData);
          setAllMentors(mentorsData);
        }
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') console.error(err);
      }
      finally {
        if (isMounted) {
          setLoadingCohorts(false);
          setLoadingMentors(false);
        }
      }
    };

    loadData();
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [selectedCourse]);

  const filteredMentors = allMentors;

  // We can derive "Current Mentors" and "Available Mentors" dynamically
  const currentMentors = selectedCohort
    ? filteredMentors.filter(m => selectedCohort.mentors && selectedCohort.mentors.includes(m.user))
    : [];

  const availableMentors = selectedCohort
    ? filteredMentors.filter(m => !selectedCohort.mentors || !selectedCohort.mentors.includes(m.user))
    : [];

  // Helper to get formatted assignments string
  const getAssignmentsString = (mentor) => {
    if (!mentor.assigned_cohorts || mentor.assigned_cohorts.length === 0) return "None";
    return mentor.assigned_cohorts.map(c => `${c.code} ${c.course}`).join(", ");
  };

  const handleAssign = async (mentorId) => {
    if (!selectedCohort) return;
    setAssigning(mentorId);
    try {
      await apiClient.post(API_ENDPOINTS.COHORTS.ASSIGN_MENTOR(selectedCohort.id), {
        mentor_id: mentorId,
      });
      setAssignSuccess(mentorId);
      // Refresh cohorts and mentors to show updated status
      const [cohortsRes, mentorsRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { course: selectedCourse.id } }),
        apiClient.get(API_ENDPOINTS.MENTORS.BASE, { params: { course: selectedCourse.id } })
      ]);
      const data = normalizeListResponse(cohortsRes.data);
      setCohorts(data);
      
      // Update selectedCohort with fresh data so UI rerenders
      const updatedCohort = data.find(c => String(c.id) === String(selectedCohort.id));
      if (updatedCohort) setSelectedCohort(updatedCohort);
      
      setAllMentors(normalizeListResponse(mentorsRes.data));

      setTimeout(() => setAssignSuccess(null), 3000);
    } catch (err) {
      alert(err?.response?.data?.error || "Assignment failed.");
    } finally {
      setAssigning(null);
    }
  };

  const handleRemove = async (mentorId) => {
    if (!selectedCohort) return;
    if (!window.confirm("Are you sure you want to remove this mentor from this cohort?")) return;
    
    setAssigning(mentorId);
    try {
      await apiClient.post(API_ENDPOINTS.COHORTS.REVOKE_MENTOR(selectedCohort.id), {
        mentor_id: mentorId,
      });
      
      // Refresh cohorts and mentors
      const [cohortsRes, mentorsRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { course: selectedCourse.id } }),
        apiClient.get(API_ENDPOINTS.MENTORS.BASE, { params: { course: selectedCourse.id } })
      ]);
      const data = normalizeListResponse(cohortsRes.data);
      setCohorts(data);
      
      const updatedCohort = data.find(c => String(c.id) === String(selectedCohort.id));
      if (updatedCohort) setSelectedCohort(updatedCohort);

      setAllMentors(normalizeListResponse(mentorsRes.data));
    } catch (err) {
      alert(err?.response?.data?.error || "Failed to remove mentor.");
    } finally {
      setAssigning(null);
    }
  };

  const handleFetchAllMentors = async () => {
    setViewMode("list");
    if (globalMentors.length > 0) return; // Already fetched
    setLoadingGlobalMentors(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.MENTORS.BASE);
      setGlobalMentors(normalizeListResponse(res.data));
    } catch (err) {
      console.error("Failed to fetch all mentors", err);
    } finally {
      setLoadingGlobalMentors(false);
    }
  };

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Mentor Management</h1>
          <p className="premium-subtitle">Manage and assign mentors to active cohorts.</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
          <button 
            onClick={() => setViewMode("assign")} 
            className={`premium-btn ${viewMode === "assign" ? "premium-btn-primary" : "premium-btn-secondary"}`}
            style={{ height: "40px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            Assign Mentors
          </button>
          <button 
            onClick={handleFetchAllMentors} 
            className={`premium-btn ${viewMode === "list" ? "premium-btn-primary" : "premium-btn-secondary"}`}
            style={{ height: "40px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <FiUsers /> Show Current Mentors
          </button>
          <Link to="/admin/add-mentor" className="premium-btn premium-btn-primary" style={{ height: "40px", display: "flex", alignItems: "center", gap: "8px" }}>
            <FiUserPlus /> Add Mentor
          </Link>
        </div>
      </div>

      {viewMode === "assign" ? (
        <>
          {/* Step 1: Course Selector */}
          <div className={styles.stepSection}>
            <h2 className={styles.stepTitle}>
              <span className={styles.stepNum}>1</span> Select Course
            </h2>
        {loadingCourses ? (
          <SkeletonLoader width="300px" height="40px" borderRadius="8px" />
        ) : courses.length === 0 ? (
          <p className={styles.emptyNote}>No courses found in the system.</p>
        ) : (
          <select
            className="premium-input"
            style={{ maxWidth: "400px" }}
            value={selectedCourse?.id || ""}
            onChange={e => {
              const c = courses.find(c => String(c.id) === e.target.value);
              setSelectedCourse(c || null);
            }}
          >
            <option value="">Select Course ▼</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name || c.title}</option>)}
          </select>
        )}
      </div>

      {selectedCourse && (
        <div className={styles.stepSection}>
          <h2 className={styles.stepTitle}>
            <span className={styles.stepNum}>2</span> Select Cohort
          </h2>
          {loadingCohorts ? (
            <SkeletonLoader width="300px" height="40px" borderRadius="8px" />
          ) : cohorts.length === 0 ? (
            <p className={styles.emptyNote}>No cohorts for this course.</p>
          ) : (
            <select
              className="premium-input"
              style={{ maxWidth: "400px" }}
              value={selectedCohort?.id || ""}
              onChange={e => {
                const c = cohorts.find(c => String(c.id) === e.target.value);
                setSelectedCohort(c || null);
              }}
            >
              <option value="">Select Active Cohort ▼</option>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          )}
        </div>
      )}

      {selectedCourse && selectedCohort && (
        <div className={styles.stepSection}>
          <h2 className={styles.stepTitle} style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: "12px", marginBottom: "20px" }}>
            <span className={styles.stepNum}>3</span> Manage Mentors for {selectedCohort.code}
          </h2>
          
          {loadingMentors ? (
            <SkeletonLoader width="100%" height="80px" borderRadius="8px" />
          ) : (
            <>
              {/* CURRENT MENTORS TABLE */}
              <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px", color: "var(--text-primary)" }}>
                CURRENT MENTORS
              </h3>
              {currentMentors.length === 0 ? (
                <div style={{ padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px dashed #d1d5db", marginBottom: "32px", color: "#6b7280", fontSize: "14px" }}>
                  No mentors currently assigned to this cohort.
                </div>
              ) : (
                <div className="premium-table-container" style={{ marginBottom: "32px" }}>
                  <table className="premium-table">
                    <tbody>
                      {currentMentors.map(mentor => (
                        <tr key={mentor.id}>
                          <td>
                            <div className={styles.mentorCell}>
                              <div className={styles.mentorAvatar}>
                                {`${mentor.first_name || "?"}`.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{mentor.full_name}</div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                  {mentor.designation ? `${mentor.designation} | ${mentor.company_name}` : "Professional Details Pending"}
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                                  <span style={{ fontWeight: "600" }}>Expertise:</span> {mentor.expertise || "N/A"}
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                                  <span style={{ fontWeight: "600" }}>Assigned Cohorts ({mentor.assigned_cohorts?.length || 0}):</span> {getAssignmentsString(mentor)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ verticalAlign: "middle", textAlign: "right" }}>
                            <div className="premium-flex-row" style={{ gap: "12px", justifyContent: "flex-end" }}>
                              <span style={{ color: "#059669", fontWeight: "bold", display: "flex", alignItems: "center", gap: "4px" }}>
                                ✓ ASSIGNED
                              </span>
                              <button
                                className="premium-btn"
                                style={{ padding: "6px 12px", background: "#fee2e2", color: "#dc2626", border: "none" }}
                                onClick={() => handleRemove(mentor.user)}
                                disabled={assigning === mentor.user}
                              >
                                {assigning === mentor.user ? "..." : "Remove"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* RECOMMENDED / AVAILABLE MENTORS TABLE */}
              <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px", color: "var(--text-primary)" }}>
                RECOMMENDED / AVAILABLE MENTORS
              </h3>
              {availableMentors.length === 0 ? (
                <div style={{ padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px dashed #d1d5db", color: "#6b7280", fontSize: "14px" }}>
                  No other mentors available for this course.
                </div>
              ) : (
                <div className="premium-table-container">
                  <table className="premium-table">
                    <tbody>
                      {availableMentors.map(mentor => {
                        // Very basic UI-only recommendation logic: if their expertise includes the course name
                        const isRecommended = selectedCourse && mentor.expertise && mentor.expertise.toLowerCase().includes(selectedCourse.name.toLowerCase());
                        
                        return (
                          <tr key={mentor.id}>
                            <td>
                              <div className={styles.mentorCell}>
                                <div className={styles.mentorAvatar}>
                                  {`${mentor.first_name || "?"}`.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                                    {mentor.full_name}
                                    {isRecommended && (
                                      <span style={{ fontSize: "10px", background: "#8b5cf6", color: "white", padding: "2px 6px", borderRadius: "12px", fontWeight: "bold" }}>
                                        RECOMMENDED
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                    {mentor.designation ? `${mentor.designation} | ${mentor.company_name}` : "Professional Details Pending"}
                                  </div>
                                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                                    <span style={{ fontWeight: "600" }}>Expertise:</span> {mentor.expertise || "N/A"}
                                  </div>
                                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                                    <span style={{ fontWeight: "600" }}>Assigned Cohorts ({mentor.assigned_cohorts?.length || 0}):</span> {getAssignmentsString(mentor)}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ verticalAlign: "middle", textAlign: "right" }}>
                              <div className="premium-flex-row" style={{ gap: "8px", justifyContent: "flex-end" }}>
                                <Link to={`/admin/mentor-details/${mentor.user}`} className="premium-btn premium-btn-secondary" style={{ padding: "6px 12px" }}>View Profile</Link>
                                
                                {assignSuccess === mentor.user ? (
                                  <button className="premium-btn" disabled style={{ padding: "6px 12px", background: "#ecfdf5", color: "#059669" }}>
                                    Assigned!
                                  </button>
                                ) : (
                                  <button
                                    className="premium-btn premium-btn-primary"
                                    style={{ padding: "6px 12px", background: "#8b5cf6" }}
                                    onClick={() => handleAssign(mentor.user)}
                                    disabled={!selectedCohort || assigning === mentor.user}
                                  >
                                    {assigning === mentor.user ? "Assigning..." : "Assign"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
        </>
      ) : (
        <div className={styles.stepSection} style={{ marginTop: "20px" }}>
          <h2 className={styles.stepTitle}>All Current Mentors</h2>
          {loadingGlobalMentors ? (
            <SkeletonLoader variant="table" rows={6} />
          ) : globalMentors.length === 0 ? (
            <p className={styles.emptyNote}>No mentors registered in the system.</p>
          ) : (
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Mentor Name</th>
                    <th>Email</th>
                    <th>Specialization / Course</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {globalMentors.map(mentor => (
                    <tr key={mentor.id}>
                      <td>
                        <div className={styles.mentorCell}>
                          <div className={styles.mentorAvatar}>
                            {`${mentor.first_name || "?"}`.charAt(0).toUpperCase()}
                          </div>
                          {`${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email || mentor.user_email || "Unknown"}
                        </div>
                      </td>
                      <td>{mentor.email || mentor.user_email || "N/A"}</td>
                      <td>{mentor.specialization || mentor.assigned_course?.name || "Unassigned"}</td>
                      <td>
                        <Link to={`/admin/mentor-details/${mentor.user}`} className="premium-btn premium-btn-secondary" style={{ padding: "6px 12px" }}>
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
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