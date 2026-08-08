// import { useEffect, useState } from "react";
// import { Link, useParams } from "react-router-dom";
// import apiClient from "../../services/apiClient";
// import { API_ENDPOINTS } from "../../constants/apiEndpoints";
// import styles from "./CohortDetails.module.css";

// function CohortDetails() {
//   const { id } = useParams();
//   const [cohort, setCohort] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");

//   useEffect(() => {
//     const loadCohort = async () => {
//       try {
//         const response = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
//         setCohort(response.data || null);
//       } catch (err) {
//         console.error("Failed to load cohort details:", err);
//         setError("Unable to load cohort details.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     if (id) {
//       loadCohort();
//     }
//   }, [id]);

//   if (loading) return <div className={styles.container}><div className="premium-card"><h1>Cohort Details</h1><p>Loading cohort details...</p></div></div>;
//   if (error) return <div className={styles.container}><div className="premium-card"><h1>Cohort Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
//   if (!cohort) return <div className={styles.container}><div className="premium-card"><h1>Cohort Details</h1><p>No cohort found.</p></div></div>;

//   const mentorNames = (cohort.mentors || [])
//     .map((mentor) => `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email || "Unknown")
//     .filter(Boolean)
//     .join(", ") || "Not assigned";

//   return (
//     <div className={styles.container}>
//       <div className="premium-card">
//         <div className={styles.header}>
//           <h1>Cohort Details</h1>
//           <Link to="/admin/cohorts">Back</Link>
//         </div>

//         <div className={styles.grid}>
//           <div>
//             <label>Cohort Name</label>
//             <p>{cohort.name || cohort.code || "N/A"}</p>
//           </div>

//           <div>
//             <label>Course</label>
//             <p>{cohort.course?.name || cohort.course || "N/A"}</p>
//           </div>

//           <div>
//             <label>Mentors</label>
//             <p>{mentorNames}</p>
//           </div>

//           <div>
//             <label>Max Students</label>
//             <p>{cohort.max_students ?? "N/A"}</p>
//           </div>

//           <div>
//             <label>Start Date</label>
//             <p>{cohort.start_date || "N/A"}</p>
//           </div>

//           <div>
//             <label>End Date</label>
//             <p>{cohort.end_date || "N/A"}</p>
//           </div>

//           <div>
//             <label>Status</label>
//             <span className="premium-badge premium-badge-active">{cohort.status || "DRAFT"}</span>
//           </div>

//           <div>
//             <label>Meeting Link</label>
//             <p>{cohort.meeting_link || "N/A"}</p>
//           </div>
//         </div>

//         <div className={styles.description}>
//           <label>Code</label>
//           <p>{cohort.code || "N/A"}</p>
//         </div>

//         <div className={styles.buttons}>
//           <Link to={`/admin/edit-cohort/${cohort.id}`}>Edit Cohort</Link>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default CohortDetails;
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import { courseService } from "../../services/courseService";
import styles from "./CohortDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CohortDetails() {
  const { id } = useParams();
  const [cohort, setCohort] = useState(null);
  const [courseName, setCourseName] = useState("Loading...");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch Cohort Details
        const cohortRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
        const cohortData = cohortRes.data;
        setCohort(cohortData);

        // Fetch Course Name if it's a UUID
        if (cohortData.course && typeof cohortData.course === "string") {
          const courseRes = await courseService.getCourseById(cohortData.course);
          setCourseName(courseRes?.name || courseRes?.title || cohortData.course);
        } else {
          setCourseName(cohortData.course?.name || "N/A");
        }

        // Fetch Students/Applications for this Cohort
        const appsRes = await applicationService.getApplications();
        const allApps = normalizeListResponse(appsRes);
        const cohortStudents = allApps.filter(app => app.assigned_cohort === id || app.assigned_cohort?.id === id);
        setStudents(cohortStudents);

      } catch (err) {
        console.error("Failed to load details:", err);
        setError("Unable to load complete cohort details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) loadData();
  }, [id]);

  if (loading) return <div style={{ padding: "2rem" }}><SkeletonLoader variant="detail" /></div>;
  if (error) return <div style={{ padding: "2rem", color: "red" }}><h2>{error}</h2></div>;
  if (!cohort) return <div style={{ padding: "2rem" }}><h2>No cohort found.</h2></div>;

  const mentorNames = (cohort.mentors || []).map(m => `${m.first_name || ""} ${m.last_name || ""}`).join(", ") || "Not assigned";

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Top Header Card */}
      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ backgroundColor: "#dbeafe", color: "var(--text-primary)", padding: "4px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "bold" }}>{cohort.status}</span>
          <h1 style={{ fontSize: "2rem", margin: "10px 0", color: "var(--text-primary)" }}>{cohort.name || cohort.code}</h1>
          <p style={{ fontSize: "1.1rem", color: "#4338ca", fontWeight: "600", margin: 0 }}>{courseName}</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to={`/admin/edit-cohort/${cohort.id}`} style={{ padding: "10px 20px", backgroundColor: "#fbbf24", color: "#92400e", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Edit Cohort</Link>
          <Link to="/admin/cohorts" style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Back</Link>
        </div>
      </div>

      {/* Details Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Mentors</p>
          <p style={{ margin: "5px 0 0 0", fontWeight: "600", color: "var(--text-primary)" }}>{mentorNames}</p>
        </div>
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Start & End Dates</p>
          <p style={{ margin: "5px 0 0 0", fontWeight: "600", color: "var(--text-primary)" }}>{cohort.start_date} ➔ {cohort.end_date || "TBD"}</p>
        </div>
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Capacity</p>
          <p style={{ margin: "5px 0 0 0", fontWeight: "600", color: "var(--text-primary)" }}>{students.length} / {cohort.max_students || "Unlimited"}</p>
        </div>
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Meeting Link</p>
          <a href={cohort.meeting_link} target="_blank" rel="noreferrer" style={{ display: "block", margin: "5px 0 0 0", fontWeight: "600", color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis" }}>{cohort.meeting_link || "Not Set"}</a>
        </div>
      </div>

      {/* Enrolled Students Table */}
      <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--text-primary)" }}>Enrolled Students</h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead style={{ backgroundColor: "var(--bg-nested)" }}>
            <tr>
              <th style={{ padding: "1rem", color: "var(--text-secondary)" }}>Name</th>
              <th style={{ padding: "1rem", color: "var(--text-secondary)" }}>Email</th>
              <th style={{ padding: "1rem", color: "var(--text-secondary)" }}>Status</th>
              <th style={{ padding: "1rem", color: "var(--text-secondary)" }}>Resume</th>
              <th style={{ padding: "1rem", color: "var(--text-secondary)" }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No students enrolled in this cohort yet.</td></tr>
            ) : (
              students.map((app) => (
                <tr key={app.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "1rem", fontWeight: "600", color: "var(--text-primary)" }}>{app.student?.user?.first_name || app.student?.first_name} {app.student?.user?.last_name || app.student?.last_name}</td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>{app.student?.user?.email || app.student?.email}</td>
                  <td style={{ padding: "1rem" }}>
                    <span style={{ padding: "4px 8px", backgroundColor: app.status === "ACCEPTED" ? "#dcfce7" : "#fef3c7", color: app.status === "ACCEPTED" ? "#166534" : "#92400e", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>
                      {app.status}
                    </span>
                  </td>
                  <td style={{ padding: "1rem" }}>
                    {(app.student?.resume || app.resume) ? (
                      <a href={app.student?.resume || app.resume} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: "bold", textDecoration: "none" }}>View Resume</a>
                    ) : <span style={{ color: "var(--text-muted)" }}>N/A</span>}
                  </td>
                  <td style={{ padding: "1rem", fontWeight: "bold", color: "#4f46e5" }}>
                    {app.score || app.exam_score || "Pending"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CohortDetails;