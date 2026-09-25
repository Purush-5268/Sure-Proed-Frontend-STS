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

  // Delete Modal State
  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, cohort: null, input: "" });
  const [isDeleting, setIsDeleting] = useState(false);

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
      await cohortService.patchCohort(id, { status: "ACTIVE" });
      setCohorts(prev => prev.map(c => c.id === id ? { ...c, status: "ACTIVE" } : c));
    } catch (err) {
      alert("❌ Failed to stop applications.");
    }
  };

  const handleDeleteClick = (cohort) => {
    setDeleteModalState({ isOpen: true, cohort, input: "" });
  };

  const executeDelete = async (e) => {
    e.preventDefault();
    const { cohort } = deleteModalState;
    if (!cohort) return;
    const expectedPhrase = `DELETE ${cohort.code || ""} ${cohort.course_details?.code || getCourseCode(cohort.course)}`.trim();
    if (deleteModalState.input.trim() !== expectedPhrase) {
      alert("You have not entered the correct confirmation text.");
      return;
    }

    setIsDeleting(true);
    try {
      await apiClient.delete(`${API_ENDPOINTS.COHORTS.BASE}${cohort.id}/`, {
        data: { confirmation: deleteModalState.input }
      });
      setCohorts(prev => prev.filter(c => c.id !== cohort.id));
      alert("✅ Cohort deleted successfully!");
      setDeleteModalState({ isOpen: false, cohort: null, input: "" });
    } catch (err) {
      alert(err.response?.data?.error || "❌ Failed to delete cohort. It might have active dependencies.");
    } finally {
      setIsDeleting(false);
    }
  };

  const [courses, setCourses] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        // Helper to fetch all pages sequentially
        const fetchAll = async (endpoint) => {
          let results = [];
          let page = 1;
          while (true) {
            const res = await apiClient.get(endpoint, { params: { page } });
            const data = res.data;
            if (data && data.results) {
              results = [...results, ...data.results];
              if (!data.next) break;
              page += 1;
            } else if (Array.isArray(data)) {
              results = [...results, ...data];
              break;
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

  const getCourseCode = (courseId) => {
    if (!courseId) return "";
    const course = courses.find(c => c.id === courseId);
    return course ? (course.code || "") : "";
  };

  const filteredCohorts = cohorts.filter((c) => {
    const matchesStatus = activeFilter === "ALL" || c.status?.toUpperCase() === activeFilter.toUpperCase();
    
    const query = searchQuery.toLowerCase();
    const courseName = (c.course?.name || getCourseName(c.course) || "").toLowerCase();
    const cohortName = (c.name || c.code || "").toLowerCase();
    
    const matchesSearch = !query || courseName.includes(query) || cohortName.includes(query);

    return matchesStatus && matchesSearch;
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
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", width: "100%" }}>
          <div>
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
          <div style={{ flex: 1, minWidth: "200px" }}>
            <input 
              type="text" 
              placeholder="Search by course or cohort name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "20px 0" }}>
          <SkeletonLoader variant="table" rows={6} />
        </div>
      ) : cohorts.length === 0 ? (
        <p>No cohorts have been created yet. Create one from the button above.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px", marginTop: "20px" }}>
          <AnimatePresence>
            {filteredCohorts.map((cohort) => (
              <motion.div 
                key={cohort.id} 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                style={{ 
                  backgroundColor: "var(--bg-surface)", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "12px", 
                  padding: "20px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "16px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)"
                }}
              >
                {cohort.pre_screening?.scheduled_at && !["CANCELLED", "FAILED"].includes(String(cohort.pre_screening.status || "").toUpperCase()) && (
                  <span
                    style={{
                      alignSelf: "flex-start",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 10px",
                      borderRadius: "999px",
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      border: "1px solid #86efac",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#16a34a" }} />
                    Screening Scheduled
                  </span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div>
                    <h3 style={{ margin: "0", fontSize: "16px", color: "var(--text-primary)", fontWeight: "700" }}>
                      {cohort.name || cohort.code || "N/A"}
                    </h3>
                    <span style={{ color: "#4338ca", fontSize: "13px", fontWeight: "600", display: "block", marginTop: "4px" }}>
                      {cohort.course?.name || getCourseName(cohort.course)}
                    </span>
                  </div>
                  <span className="premium-badge" style={{ backgroundColor: "var(--bg-nested)", color: "var(--text-primary)", border: "1px solid var(--border-color)", fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "99px" }}>
                    {cohort.status || "DRAFT"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px", color: "var(--text-secondary)" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong style={{ color: "var(--text-primary)" }}>Students</strong>
                    <span>{cohort.students_count || 0} enrolled</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong style={{ color: "var(--text-primary)" }}>Applications</strong>
                    <span>{cohort.applications_count || 0} received</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong style={{ color: "var(--text-primary)" }}>Start Date</strong>
                    <span>{cohort.start_date || "N/A"}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong style={{ color: "var(--text-primary)" }}>End Date</strong>
                    <span>{cohort.end_date || "N/A"}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong style={{ color: "var(--text-primary)" }}>App. Deadline</strong>
                    <span>{cohort.application_end_date ? new Date(cohort.application_end_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : "N/A"}</span>
                  </div>
                </div>

                <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px dashed var(--border-color)" }}>
                  <div className={styles.actions} style={{ display: "flex", flexWrap: "wrap", gap: "8px", width: "100%" }}>
                    <Link to={`/admin/cohort-details/${cohort.id}`} className={styles.viewBtn} style={{ flex: 1, textAlign: "center" }}>View</Link>
                    <Link to={`/admin/edit-cohort/${cohort.id}`} className={styles.editBtn} style={{ flex: 1, textAlign: "center" }}>Edit</Link>
                    <button onClick={() => handleDeleteClick(cohort)} className={styles.deleteBtn} style={{ flex: 1, textAlign: "center" }}>Delete</button>
                    
                    {cohort.status === "DRAFT" && (
                      <div className={styles.statusControls} style={{ display: "flex", flexWrap: "wrap", gap: "8px", width: "100%" }}>
                        {publishCohortId === cohort.id ? (
                          <>
                            <input 
                              type="date" 
                              value={publishDate} 
                              onChange={(e) => setPublishDate(e.target.value)} 
                              className={styles.dateInput}
                              style={{ flex: "1 1 100%" }}
                            />
                            <button onClick={() => handlePublish(cohort.id)} className={styles.saveBtn} style={{ flex: 1 }}>Save</button>
                            <button onClick={() => setPublishCohortId(null)} className={styles.cancelBtn} style={{ flex: 1 }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setPublishCohortId(cohort.id)} className={styles.publishBtn} style={{ flex: "1 1 100%" }}>Publish</button>
                        )}
                      </div>
                    )}
                    {cohort.status === "OPEN" && (
                      <button onClick={() => handleStop(cohort.id)} className={styles.stopBtn} style={{ flex: "1 1 100%" }}>Stop Applications</button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalState.isOpen && deleteModalState.cohort && (() => {
        const cohort = deleteModalState.cohort;
        const courseCode = cohort.course_details?.code || getCourseCode(cohort.course);
        const expectedPhrase = `DELETE ${cohort.code || ""} ${courseCode}`.trim();
        const isMatch = deleteModalState.input.trim() === expectedPhrase;

        return (
          <div className={styles.deleteOverlay} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}>
            <div className={`premium-card ${styles.deleteModal}`}>
              <div className={styles.deleteIcon}>!</div>
              <h2 className={styles.deleteTitle}>Delete Cohort</h2>
              
              <div className={styles.deleteWarning}>
                <p>
                  You are about to permanently delete <strong>{cohort.name || cohort.code}</strong>.
                  This action is destructive and cannot be undone.
                </p>
              </div>

              <form onSubmit={executeDelete}>
                <div className={styles.deleteField}>
                  <label>
                    To confirm, type <strong>{expectedPhrase}</strong> below:
                  </label>
                  <input 
                    type="text" 
                    value={deleteModalState.input}
                    onChange={(e) => setDeleteModalState({ ...deleteModalState, input: e.target.value })}
                    className={styles.deleteInput}
                    placeholder={expectedPhrase}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px' }}
                    autoComplete="off"
                  />
                </div>
                
                <div className={styles.deleteActions}>
                  <button 
                    type="button" 
                    onClick={() => setDeleteModalState({ isOpen: false, cohort: null, input: "" })} 
                    className={styles.deleteCancel}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={!isMatch || isDeleting} 
                    className={styles.deleteConfirm}
                    style={{ 
                      background: isMatch ? '#ef4444' : 'var(--bg-disabled)', 
                      color: isMatch ? '#fff' : 'var(--text-disabled)',
                      cursor: isMatch ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Cohorts;