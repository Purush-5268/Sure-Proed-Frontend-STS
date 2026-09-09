import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../../services/apiClient";
import { API_ENDPOINTS } from "../../../constants/apiEndpoints";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import styles from "../../admin/Cohorts.module.css";

function VolunteerCohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const VOLUNTEER_STATUSES = ["ACTIVE", "TRAINING", "INTERNSHIP", "SOFT SKILLS", "COMPLETED"];

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
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
          // Filter cohorts by allowed statuses for volunteers
          const validCohorts = allCohorts.filter(c => VOLUNTEER_STATUSES.includes(c.status?.toUpperCase()));
          setCohorts(validCohorts);
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
    return course ? (course.name || course.title) : courseId;
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
          <h1>Assigned Cohorts</h1>
          <p>View your assigned training batches</p>
        </div>
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
              {VOLUNTEER_STATUSES.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </option>
              ))}
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
        <p>No cohorts have been assigned yet.</p>
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
                    {cohort.status || "UNKNOWN"}
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
                </div>

                <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px dashed var(--border-color)" }}>
                  <div className={styles.actions} style={{ display: "flex", flexWrap: "wrap", gap: "8px", width: "100%" }}>
                    <Link to={`/trustee/volunteer/cohort-details/${cohort.id}`} className={styles.viewBtn} style={{ flex: 1, textAlign: "center" }}>View Details</Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default VolunteerCohorts;
