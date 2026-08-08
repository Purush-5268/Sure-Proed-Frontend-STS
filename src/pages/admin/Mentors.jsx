import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
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
  const [cohorts, setCohorts] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMentors, setLoadingMentors] = useState(true);
  const [loadingCohorts, setLoadingCohorts] = useState(false);
  const [assigning, setAssigning] = useState(null); // { cohortId }
  const [assignTarget, setAssignTarget] = useState({}); // { cohortId: mentorId }
  const [assignSuccess, setAssignSuccess] = useState(null);

  // Load courses and all mentors on mount
  useEffect(() => {
    let isMounted = true;

    const loadCourses = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.COURSES.BASE);
        if (isMounted) setCourses(normalizeListResponse(res.data));
      } catch { }
      finally { if (isMounted) setLoadingCourses(false); }
    };

    const loadMentors = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.USERS.BASE, { params: { role: "MENTOR" } });
        const users = normalizeListResponse(res.data);
        if (isMounted) setAllMentors(users.filter(u => u.role === "MENTOR"));
      } catch { }
      finally { if (isMounted) setLoadingMentors(false); }
    };

    loadCourses();
    loadMentors();
    return () => { isMounted = false; };
  }, []);

  // Load active cohorts when course is selected
  useEffect(() => {
    if (!selectedCourse) { setCohorts([]); return; }
    let isMounted = true;
    setLoadingCohorts(true);
    setCohorts([]);

    const loadCohorts = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.COHORTS.BASE, {
          params: { course: selectedCourse.id, status: "ACTIVE" }
        });
        const data = normalizeListResponse(res.data);
        // Extra safety: only show ACTIVE cohorts (never expired/completed)
        if (isMounted) setCohorts(data.filter(c => c.status === "ACTIVE"));
      } catch { }
      finally { if (isMounted) setLoadingCohorts(false); }
    };

    loadCohorts();
    return () => { isMounted = false; };
  }, [selectedCourse]);

  // Mentors filtered by selected course domain
  const filteredMentors = selectedCourse
    ? allMentors.filter(m => {
        // Check if mentor's profile course matches
        return !m.mentor_profile_course || m.mentor_profile_course === selectedCourse.id;
      })
    : allMentors;

  const handleAssign = async (cohortId) => {
    const mentorId = assignTarget[cohortId];
    if (!mentorId) return;
    setAssigning(cohortId);
    try {
      // POST to cohort assignment endpoint
      await apiClient.post(`/api/cohorts/${cohortId}/assign-mentor/`, {
        mentor: mentorId,
        assigned_from: new Date().toISOString().split("T")[0],
      });
      setAssignSuccess(cohortId);
      setTimeout(() => setAssignSuccess(null), 3000);
    } catch (err) {
      alert(err?.response?.data?.detail || "Assignment failed. Check if a mentor is already assigned.");
    } finally {
      setAssigning(null);
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
          <p className="premium-subtitle">Assign mentors to active cohorts by course domain.</p>
        </div>
        <Link to="/admin/add-mentor" className="premium-btn premium-btn-primary">
          <FiUserPlus /> Add Mentor
        </Link>
      </div>

      {/* Step 1: Course Selector */}
      <div className={styles.stepSection}>
        <h2 className={styles.stepTitle}>
          <span className={styles.stepNum}>1</span> Select a Course Domain
        </h2>
        {loadingCourses ? (
          <div className={styles.courseGrid}>
            {[1, 2, 3].map(i => (
              <div key={i} className={styles.skeletonCourse}>
                <SkeletonLoader width="60%" height="16px" borderRadius="4px" />
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <p className={styles.emptyNote}>No courses found in the system.</p>
        ) : (
          <div className={styles.courseGrid}>
            {courses.map(course => (
              <button
                key={course.id}
                className={`${styles.courseChip} ${selectedCourse?.id === course.id ? styles.selected : ""}`}
                onClick={() => setSelectedCourse(selectedCourse?.id === course.id ? null : course)}
              >
                <FiBook className={styles.chipIcon} />
                {course.name || course.title}
                {selectedCourse?.id === course.id && <FiChevronDown className={styles.chipArrow} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCourse && (
        <>
          {/* Step 2: Mentors for this Domain */}
          <div className={styles.stepSection}>
            <h2 className={styles.stepTitle}>
              <span className={styles.stepNum}>2</span> Mentors — {selectedCourse.name || selectedCourse.title}
            </h2>
            {loadingMentors ? (
              <SkeletonLoader width="100%" height="80px" borderRadius="8px" />
            ) : filteredMentors.length === 0 ? (
              <div className={styles.emptyMentors}>
                <FiUsers className={styles.emptyIcon} />
                <p>No mentors found for this domain.</p>
                <Link to="/admin/add-mentor" className="premium-btn premium-btn-secondary">Add Mentor</Link>
              </div>
            ) : (
              <div className="premium-table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMentors.map(mentor => (
                      <tr key={mentor.id}>
                        <td>
                          <div className={styles.mentorCell}>
                            <div className={styles.mentorAvatar}>
                              {`${mentor.first_name || "?"}`.charAt(0).toUpperCase()}
                            </div>
                            {`${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email}
                          </div>
                        </td>
                        <td>{mentor.email}</td>
                        <td>
                          <span className={mentor.is_active ? styles.activeBadge : styles.inactiveBadge}>
                            {mentor.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="premium-flex-row">
                            <Link to={`/admin/mentor-details/${mentor.id}`} className="premium-btn premium-btn-secondary">View</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Step 3: Active Cohorts for this Course */}
          <div className={styles.stepSection}>
            <h2 className={styles.stepTitle}>
              <span className={styles.stepNum}>3</span> Active Cohorts — {selectedCourse.name || selectedCourse.title}
            </h2>
            {loadingCohorts ? (
              <SkeletonLoader width="100%" height="120px" borderRadius="8px" />
            ) : cohorts.length === 0 ? (
              <div className={styles.emptyMentors}>
                <FiBook className={styles.emptyIcon} />
                <p>No active cohorts for this course. Only currently running cohorts appear here.</p>
              </div>
            ) : (
              <motion.div
                className={styles.cohortGrid}
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.07 } } }}
              >
                <AnimatePresence mode="popLayout">
                  {cohorts.map(cohort => (
                    <motion.div key={cohort.id} variants={item} className={styles.cohortAssignCard}>
                      <div className={styles.cohortInfo}>
                        <span className={styles.cohortCode}>{cohort.code}</span>
                        <h4 className={styles.cohortName}>{cohort.name}</h4>
                        <span className={styles.cohortDates}>
                          {cohort.start_date} → {cohort.end_date}
                        </span>
                      </div>

                      {assignSuccess === cohort.id ? (
                        <div className={styles.successBadge}>✅ Mentor Assigned!</div>
                      ) : (
                        <div className={styles.assignRow}>
                          <select
                            className={styles.mentorSelect}
                            value={assignTarget[cohort.id] || ""}
                            onChange={e => setAssignTarget(prev => ({ ...prev, [cohort.id]: e.target.value }))}
                          >
                            <option value="">Select a mentor…</option>
                            {filteredMentors.map(m => (
                              <option key={m.id} value={m.id}>
                                {`${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email}
                              </option>
                            ))}
                          </select>
                          <button
                            className={styles.assignBtn}
                            onClick={() => handleAssign(cohort.id)}
                            disabled={!assignTarget[cohort.id] || assigning === cohort.id}
                          >
                            {assigning === cohort.id ? "Assigning…" : "Assign"}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Mentors;