import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { cohortService } from "../../services/cohortService";
import styles from "./Cohorts.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

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

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        // Fetch both Cohorts and Courses to map the UUIDs to Names
        const [cohortsRes, coursesRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COHORTS.BASE),
          apiClient.get(API_ENDPOINTS.COURSES.BASE)
        ]);
        if (isMounted) {
          setCohorts(normalizeListResponse(cohortsRes.data));
          setCourses(normalizeListResponse(coursesRes.data));
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Cohort Management</h1>
          <p>Manage all training batches</p>
        </div>

        <Link to="/admin/add-cohort" className={styles.addBtn}>
          + Add Cohort
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : cohorts.length === 0 ? (
        <p>No cohorts have been created yet. Create one from the button above.</p>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Course</th>
                <th>Start Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "12px" }}>{cohort.name || cohort.code || "N/A"}</td>
                  {/* Safely map the UUID to the Course Name */}
                  <td style={{ padding: "12px", fontWeight: "500", color: "#4338ca" }}>
                    {cohort.course?.name || getCourseName(cohort.course)}
                  </td>
                  <td style={{ padding: "12px" }}>{cohort.start_date || "N/A"}</td>
                  <td style={{ padding: "12px" }} className={cohort.status === "ACTIVE" ? styles.active : cohort.status === "OPEN" ? styles.upcoming : styles.completed}>
                    <div style={{ fontWeight: 'bold' }}>{cohort.status || "DRAFT"}</div>
                    {cohort.status === "OPEN" && cohort.end_date && (
                      <div style={{ fontSize: '11px', color: "var(--text-muted)", marginTop: '4px' }}>
                        Closes: {cohort.end_date}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: "12px" }}>
                    {/* Fixed Flexbox alignment for action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <Link to={`/admin/cohort-details/${cohort.id}`} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>View</Link>
                      <Link to={`/admin/edit-cohort/${cohort.id}`} style={{ padding: '6px 12px', backgroundColor: '#fbbf24', color: '#92400e', textDecoration: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>Edit</Link>

                      {/* Status Management Controls */}
                      {cohort.status !== "OPEN" && cohort.status !== "ACTIVE" ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          {publishCohortId === cohort.id ? (
                            <>
                              <input
                                type="date"
                                value={publishDate}
                                onChange={(e) => setPublishDate(e.target.value)}
                                style={{ padding: '4px', fontSize: '12px', borderRadius: '4px', border: "1px solid var(--border-color)" }}
                              />
                              <button onClick={() => handlePublish(cohort.id)} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Save</button>
                              <button onClick={() => setPublishCohortId(null)} style={{ backgroundcolor: "var(--text-muted)", color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setPublishCohortId(cohort.id)} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Publish</button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => handleStop(cohort.id)} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Stop Applications</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Cohorts;