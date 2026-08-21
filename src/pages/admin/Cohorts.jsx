import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { cohortService } from "../../services/cohortService";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Cohorts.module.css";

function Cohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Publishing State
  const [publishCohortId, setPublishCohortId] = useState(null);
  const [publishDate, setPublishDate] = useState("");

  const handlePublish = async (id) => {
    if (!publishDate) return alert("Please select an end date for applications.");
    try {
      // Updates status to OPEN and sets the deadline
      await cohortService.patchCohort(id, { status: "OPEN", end_date: publishDate });
      setCohorts(prev => prev.map(c => c.id === id ? { ...c, status: "OPEN", end_date: publishDate } : c));
      setPublishCohortId(null);
      setPublishDate("");
      alert("✅ Cohort published successfully!");
    } catch (err) {
      alert("❌ Failed to publish cohort.");
    }
  };

  const handleStop = async (id) => {
    if (!window.confirm("Are you sure you want to stop applications? This cohort will no longer be visible to students.")) return;
    try {
      await cohortService.patchCohort(id, { status: "CLOSED" }); 
      setCohorts(prev => prev.map(c => c.id === id ? { ...c, status: "CLOSED" } : c));
    } catch (err) {
      alert("❌ Failed to stop applications.");
    }
  };

  const [courses, setCourses] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        // Helper to fetch all pages sequentially
        const fetchAll = async (url) => {
          let results = [];
          let currentUrl = url;
          while (currentUrl) {
            const res = await apiClient.get(currentUrl);
            if (res.data && res.data.results) {
              results = [...results, ...res.data.results];
              currentUrl = res.data.next ? res.data.next.replace(apiClient.defaults.baseURL, '') : null;
            } else if (Array.isArray(res.data)) {
              results = [...results, ...res.data];
              currentUrl = null;
            } else {
              break;
            }
          }
          return results;
        };

        const [allCohorts, allCourses] = await Promise.all([
          fetchAll(API_ENDPOINTS.COHORTS.BASE),
          fetchAll(API_ENDPOINTS.COURSES.BASE)
        ]);

        if (isMounted) {
          setCohorts(allCohorts);
          setCourses(allCourses);
        }
      } catch (err) {
        console.error("Failed to load data:", err);
        if (isMounted) setCohorts([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const getCourseName = (courseId) => {
    if (!courseId) return "N/A";
    const course = courses.find(c => c.id === courseId);
    return course ? (course.name || course.title) : courseId; // Fallback to ID if not found
  };

  const filteredCohorts = cohorts.filter((c) => {
    if (activeFilter === "ALL") return true;
    return c.status?.toUpperCase() === activeFilter.toUpperCase();
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Cohort Management</h1>
          <p>Manage all training batches</p>
        </div>

        <Link to="/admin/add-cohort" className={styles.addBtn}>
          + Create Cohort
        </Link>
      </div>
      
      <div className={styles.filterSection}>
        <label className={styles.filterLabel}>Status: </label>
        <select 
          value={activeFilter} 
          onChange={(e) => setActiveFilter(e.target.value)}
          className={styles.statusDropdown}
        >
          <option value="ALL">All</option>
          <option value="DRAFT">Draft</option>
          <option value="OPEN">Open (Enrollment)</option>
          <option value="ACTIVE">Active (Pre-Training)</option>
          <option value="TRAINING">Training</option>
          <option value="INTERNSHIP">Internship</option>
          <option value="SOFT SKILLS">Soft Skills</option>
          <option value="COMPLETED">Completed (Graduated)</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: "20px 0" }}>
          <SkeletonLoader variant="table" rows={6} />
        </div>
      ) : cohorts.length === 0 ? (
        <p>No cohorts have been created yet. Create one from the button above.</p>
      ) : (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Status</th>
                  <th>Course</th>
                  <th>Students</th>
                  <th>Applications</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredCohorts.map((cohort) => (
                    <motion.tr 
                      key={cohort.id} 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      style={{ borderBottom: "1px solid #e5e7eb" }}
                    >
                      <td style={{ padding: "12px" }}>
                        <strong>{cohort.name || cohort.code || "N/A"}</strong>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span className={`${styles.statusBadge} ${styles[cohort.status?.toLowerCase()] || ""}`}>
                          {cohort.status || "UNKNOWN"}
                        </span>
                      </td>
                      <td style={{ padding: "12px", fontWeight: "500", color: "#4338ca" }}>
                        {cohort.course?.name || getCourseName(cohort.course)}
                      </td>
                      <td style={{ padding: "12px" }}>{cohort.students_count || 0}</td>
                      <td style={{ padding: "12px" }}>{cohort.applications_count || 0}</td>
                      <td style={{ padding: "12px" }}>{cohort.start_date || "N/A"}</td>
                      <td style={{ padding: "12px" }}>{cohort.end_date || "N/A"}</td>
                      <td style={{ padding: "12px" }}>
                        <div className={styles.actions}>
                          <Link to={`/admin/cohort-details/${cohort.id}`} className={styles.viewBtn}>View</Link>
                          <Link to={`/admin/edit-cohort/${cohort.id}`} className={styles.editBtn}>Edit</Link>
                          
                          {cohort.status !== "OPEN" && cohort.status !== "ACTIVE" ? (
                            <div className={styles.statusControls}>
                              {publishCohortId === cohort.id ? (
                                <>
                                  <input 
                                    type="date" 
                                    value={publishDate} 
                                    onChange={(e) => setPublishDate(e.target.value)} 
                                    className={styles.dateInput}
                                  />
                                  <button onClick={() => handlePublish(cohort.id)} className={styles.saveBtn}>Save</button>
                                  <button onClick={() => setPublishCohortId(null)} className={styles.cancelBtn}>Cancel</button>
                                </>
                              ) : (
                                <button onClick={() => setPublishCohortId(cohort.id)} className={styles.publishBtn}>Publish</button>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => handleStop(cohort.id)} className={styles.stopBtn}>Stop Applications</button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Cohorts;