import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { attendanceService } from "../../services/attendanceService";
import styles from "./AttendanceManagement.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AttendanceManagement() {
  const [attendance, setAttendance] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [attendanceResponse, cohortsResponse, coursesResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE),
          apiClient.get(API_ENDPOINTS.COURSES?.BASE || "/api/courses/"),
        ]);

        if (isMounted) {
          const attData = attendanceResponse.data || {};
          const cohData = cohortsResponse.data || {};
          const courseData = coursesResponse.data || {};

          setAttendance(Array.isArray(attData.results) ? attData.results : (Array.isArray(attData) ? attData : []));
          setCohorts(Array.isArray(cohData.results) ? cohData.results : (Array.isArray(cohData) ? cohData : []));
          setCourses(Array.isArray(courseData.results) ? courseData.results : (Array.isArray(courseData) ? courseData : []));
        }
      } catch (err) {
        console.error("Failed to load attendance data:", err);
        if (isMounted) {
          if (err.response?.status === 403) {
            setErrorMsg("Permission Denied: You do not have access to view these attendance records.");
          } else {
            setErrorMsg("Failed to load attendance data. Please try again later.");
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const getCohortName = (cohortId, title) => {
    const cohort = cohorts.find((item) => String(item.id) === String(cohortId));
    if (cohort && cohort.course?.name) return cohort.course.name;
    if (cohort && cohort.name) return cohort.name;
    if (title) {
      if (title.includes("[")) return title.replace(/\[.*?\]/g, "").trim();
      const parts = title.split(" - ");
      return parts.length > 1 ? parts.slice(0, -1).join(" - ").trim() : title.trim();
    }
    return "General Session";
  };

  const getCohortBatch = (cohortId, title) => {
    const cohort = cohorts.find((item) => String(item.id) === String(cohortId));
    if (cohort && cohort.batch_name) return cohort.batch_name;
    if (title) {
      const bracketMatch = title.match(/\[(.*?)\]/);
      if (bracketMatch) return bracketMatch[1].trim();
      const parts = title.split(" - ");
      return parts.length > 1 ? parts[parts.length - 1].trim() : "N/A";
    }
    return "N/A";
  };

  const getDomainName = (cohortId, title) => {
    const cohort = cohorts.find((item) => String(item.id) === String(cohortId));
    if (cohort && cohort.course?.name) return cohort.course.name;
    if (title) {
      if (title.includes("[")) return title.replace(/\[.*?\]/g, "").trim();
      const parts = title.split(" - ");
      return parts.length > 1 ? parts.slice(0, -1).join(" - ").trim() : title.trim();
    }
    return "General Session";
  };

  const getGroupNumber = (cohortId, title) => {
    const cohort = cohorts.find((item) => String(item.id) === String(cohortId));
    if (cohort && cohort.batch_name) return cohort.batch_name;
    if (title) {
      const bracketMatch = title.match(/\[(.*?)\]/);
      if (bracketMatch) return bracketMatch[1].trim();
      const parts = title.split(" - ");
      return parts.length > 1 ? parts[parts.length - 1].trim() : "N/A";
    }
    return "N/A";
  };

  const filteredAttendance = attendance.filter((item) => {
    const domainName = getDomainName(item.cohort, item.title);
    const groupName = getGroupNumber(item.cohort, item.title);

    const matchesCourse = selectedCourse === "" || domainName.toLowerCase().includes(selectedCourse.toLowerCase());
    const matchesGroup = filterGroup === "" || groupName.toLowerCase().includes(filterGroup.toLowerCase());

    return matchesCourse && matchesGroup;
  });

  const handleDownloadExcel = async (sessionId, sessionTitle, sessionDate) => {
    try {
      const response = await attendanceService.downloadExcel(sessionId);

      // Check if status is 202 (Report Generating)
      if (response.status === 202) {
        // Backend returns JSON with a detail message for 202
        let detailMessage = "Report is being generated in the background. Please retry in a few seconds.";
        if (response.data instanceof Blob && response.data.type === 'application/json') {
          const text = await response.data.text();
          const json = JSON.parse(text);
          if (json.detail) detailMessage = json.detail;
        } else if (response.data && response.data.detail) {
          detailMessage = response.data.detail;
        }
        alert(`⏳ ${detailMessage}`);
        return; // Stop the download!
      }

      // Check if the backend sent JSON instead of an Excel file (Error condition)
      if (response.data instanceof Blob && response.data.type === 'application/json') {
        const text = await response.data.text();
        const json = JSON.parse(text);
        alert(json.detail || "Report is not ready or missing.");
        return; 
      }

      // 🚨 FILENAME FIX: Extract the exact collision-proof filename from Django's headers
      let filename = 'Attendance_Report.xlsx';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      } else {
        // Fallback just in case
        const safeTitle = (sessionTitle || "Attendance").replace(/[^a-zA-Z0-9]/g, "_");
        filename = `${safeTitle}_${sessionDate || 'Report'}.xlsx`;
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error("Excel download error:", err);
      // Safely read the error blob if it's JSON
      if (err.response && err.response.data && err.response.data.type === 'application/json') {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        alert(json.detail || "Report is missing or still generating. Please try again.");
      } else {
        alert("Failed to download the report. Make sure the session has ended.");
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Attendance Management</h1>
          <p>Manage daily attendance records</p>
        </div>
        <Link to="/admin/update-attendance" className={styles.addBtn}>
          + Update Attendance
        </Link>
      </div>

      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", backgroundColor: "var(--bg-surface)", padding: "16px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}
        >
          <option value="">-- Select Course / Stream --</option>
          {courses.map((c) => (
            <option key={c.id} value={c.name || c.title}>
              {c.name || c.title}
            </option>
          ))}
        </select>

        <input
          type="text" className="premium-input" placeholder="Filter by Group Number (e.g. G2-26)"
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)" }}
        />

        <button
          onClick={() => { setSelectedCourse(""); setFilterGroup(""); }}
          style={{ padding: "10px 16px", backgroundColor: "var(--bg-nested)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
        >
          Clear
        </button>
      </div>

      {errorMsg ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">🔒</div>
          <h3>Access Restricted</h3>
          <p>{errorMsg}</p>
        </div>
      ) : loading ? (
        <SkeletonLoader variant="table" rows={6} />
      ) : filteredAttendance.length === 0 ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">📅</div>
          <h3>No Attendance Records Found</h3>
          <p>No attendance sessions match your current filters.</p>
          <button onClick={() => { setSelectedCourse(""); setFilterGroup(""); }} className="premium-btn premium-btn-secondary">
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Domain Name</th>
                <th>Group Number</th>
                <th>Total Students</th>
                <th>Whitelisted</th>
                <th>Joined</th>
                <th>Absent</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredAttendance.map((item) => {
                const whitelistCount = item.whitelist_email_count || 0;
                const totalStudents = item.actual_student_count || 0;
                const joinedStudents = Array.isArray(item.joined_students) ? item.joined_students.length : 0;
                const absentStudents = Math.max(0, totalStudents - joinedStudents);

                return (
                  <tr key={item.id}>
                    <td style={{ verticalAlign: "middle" }}>{item.class_date}</td>
                    <td style={{ verticalAlign: "middle" }}>{getCohortName(item.cohort, item.title)}</td>
                    <td style={{ verticalAlign: "middle" }}>{getCohortBatch(item.cohort, item.title)}</td>
                    <td style={{ verticalAlign: "middle" }}>{totalStudents}</td>
                    <td style={{ verticalAlign: "middle", fontWeight: whitelistCount > 0 ? "bold" : "normal", color: whitelistCount > 0 ? "#3b82f6" : "inherit" }}>
                      {whitelistCount}
                    </td>
                    <td style={{ verticalAlign: "middle" }}>{joinedStudents}</td>
                    <td style={{ verticalAlign: "middle" }}>{absentStudents}</td>

                    <td className="actions" style={{ verticalAlign: "middle", padding: "8px 16px" }}>
                      {(!item.conducted || item.conducted === 'false' || item.conducted === false) ? (
                        <div style={{ display: "flex", alignItems: "stretch", gap: "8px", margin: 0, padding: 0, height: "32px" }}>
                          <button
                            onClick={() => handleDownloadExcel(item.id, item.title, item.class_date)}
                            style={{
                              background: "#10b981",
                              color: "white",
                              border: "none",
                              padding: "0 14px",
                              height: "100%", /* 🚨 Fills the flex container */
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: "bold",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxSizing: "border-box",
                              transition: "all 0.2s ease",
                              whiteSpace: "nowrap",
                              margin: 0
                            }}
                          >
                            ⬇️ Excel
                          </button>

                          <Link
                            to="/admin/attendance-details"
                            state={{ sessionId: item.id, sessionTitle: item.title, sessionDate: item.class_date }}
                            style={{
                              background: "var(--primary-color)",
                              color: "white",
                              padding: "0 16px",
                              height: "100%", /* 🚨 Fills the flex container */
                              borderRadius: "6px",
                              textDecoration: "none",
                              fontWeight: "bold",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxSizing: "border-box",
                              whiteSpace: "nowrap",
                              margin: 0
                            }}
                          >
                            View Details
                          </Link>
                        </div>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            background: "var(--bg-nested)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border-color)",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            whiteSpace: "nowrap"
                          }}
                        >
                          ⏳ Ongoing...
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AttendanceManagement;