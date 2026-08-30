import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import { API_ENDPOINTS } from "../../../constants/apiEndpoints";
import { attendanceService } from "../../../services/attendanceService";
import styles from "./Attendance.module.css";
import SkeletonLoader from "../../../components/common/SkeletonLoader";

function AttendanceManagement() {
  const [attendance, setAttendance] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(null); // null, '403', '500', 'NETWORK'
  const [selectedCourse, setSelectedCourse] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const loadData = async () => {
      try {
        const [attendanceResponse, cohortsResponse, coursesResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { signal: abortController.signal }),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE, { signal: abortController.signal }),
          apiClient.get(API_ENDPOINTS.COURSES?.BASE || "/api/courses/", { signal: abortController.signal }),
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
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        console.error("Failed to load attendance data:", err);
        if (isMounted) {
          if (!err.response) {
            setErrorState('NETWORK');
          } else if (err.response?.status === 403) {
            setErrorState('403');
          } else {
            setErrorState('500');
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
      abortController.abort();
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

      // Check if status is 202 or 425 (Report Pending / Too Early)
      if (response.status === 202 || response.status === 425) {
        let detailMessage = response.data?.detail || response.data?.message || "Attendance data is pending. Please wait for Google to finalize the conference log.";
        alert(`⏳ ${detailMessage}`);
        return;
      }

      // Handle Blob error responses safely
      let responseData = response.data;
      if (responseData instanceof Blob) {
        if (responseData.type === 'application/json' || responseData.type.includes('text')) {
          const text = await responseData.text();
          try {
            const json = JSON.parse(text);
            alert(`⚠️ ${json.detail || json.message || "Report is not ready yet."}`);
            return;
          } catch (e) {
            // Not JSON, proceed as file
          }
        }
      }

      // 🚨 FILENAME FIX: Extract filename from Django's headers
      let filename = 'Attendance_Report.xlsx';
      const contentDisposition = response.headers?.['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      } else {
        const safeTitle = (sessionTitle || "Attendance").replace(/[^a-zA-Z0-9]/g, "_");
        filename = `${safeTitle}_${sessionDate || 'Report'}.xlsx`;
      }

      const blobType = responseData instanceof Blob ? responseData.type : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = window.URL.createObjectURL(new Blob([responseData], { type: blobType }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error("Excel download error:", err);
      let errorMsg = "Failed to download the report. Make sure the session has ended and Google Meet data is available.";

      try {
        const errResponse = err.response?.data;
        if (errResponse instanceof Blob) {
          const text = await errResponse.text();
          const json = JSON.parse(text);
          errorMsg = json.detail || json.message || errorMsg;
        } else if (errResponse?.detail || errResponse?.message) {
          errorMsg = errResponse.detail || errResponse.message;
        }
      } catch (e) {
        // Fallback to default error message if blob parsing fails
      }

      alert(`Attendance download failed: ${errorMsg}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Attendance Management</h1>
          <p>Manage daily attendance records</p>
        </div>
        <Link to="/trustee/volunteer/update-attendance" className={styles.addBtn}>
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

      {errorState === 'NETWORK' ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon" style={{ color: "#ef4444" }}>🌐</div>
          <h3>Network Error</h3>
          <p>Please check your internet connection.</p>
        </div>
      ) : errorState === '403' ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon" style={{ color: "#ef4444" }}>🔒</div>
          <h3>Access Restricted</h3>
          <p>You do not have permission to view attendance records.</p>
        </div>
      ) : errorState === '500' ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon" style={{ color: "#ef4444" }}>⚠️</div>
          <h3>Unable to load attendance data</h3>
          <p>The server encountered an error. Please try again later.</p>
        </div>
      ) : loading ? (
        <SkeletonLoader variant="table" rows={6} />
      ) : filteredAttendance.length === 0 ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">📅</div>
          <h3>No active classes yet</h3>
          <p>Attendance will appear here when a class is conducted.</p>
          {(selectedCourse || filterGroup) && (
            <button onClick={() => { setSelectedCourse(""); setFilterGroup(""); }} className="premium-btn premium-btn-secondary" style={{ marginTop: "1rem" }}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Domain Name</th>
                <th>Group Number</th>
                <th>Meet Start</th>
                <th>Meet End</th>
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
                const totalStudents = item.google_total_students ?? (item.total_attendee_count || item.actual_student_count || 0);
                const joinedStudents = item.google_joined_count ?? (Array.isArray(item.joined_students) ? item.joined_students.length : 0);
                const absentStudents = item.google_absent_count ?? Math.max(0, totalStudents - joinedStudents);

                return (
                  <tr key={item.id}>
                    <td style={{ verticalAlign: "middle" }}>{item.class_date}</td>
                    <td style={{ verticalAlign: "middle" }}>{getCohortName(item.cohort, item.title)}</td>
                    <td style={{ verticalAlign: "middle" }}>{getCohortBatch(item.cohort, item.title)}</td>
                    <td style={{ verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      {item.start_time
                        ? new Date(`${item.class_date}T${item.start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : "Not available yet"}
                    </td>
                    <td style={{ verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      {item.end_time
                        ? new Date(`${item.class_date}T${item.end_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : "Not available yet"}
                    </td>
                    <td style={{ verticalAlign: "middle" }}>{totalStudents}</td>
                    <td style={{ verticalAlign: "middle", fontWeight: whitelistCount > 0 ? "bold" : "normal", color: whitelistCount > 0 ? "#3b82f6" : "inherit" }}>
                      {whitelistCount}
                    </td>
                    <td style={{ verticalAlign: "middle" }}>{joinedStudents}</td>
                    <td style={{ verticalAlign: "middle" }}>{absentStudents}</td>

                    <td className="actions" style={{ verticalAlign: "middle", padding: "8px 16px", whiteSpace: "nowrap", minWidth: "200px" }}>
                      {item.status === "ATTENDANCE_PENDING" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#f59e0b", fontWeight: "bold", fontSize: "12px", border: "1px solid #f59e0b", padding: "4px 8px", borderRadius: "4px", backgroundColor: "rgba(245, 158, 11, 0.1)" }}>
                            Generating Meet Link...
                          </span>
                        </div>
                      ) : item.status === "ATTENDANCE_FAILED" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#ef4444", fontWeight: "bold", fontSize: "12px", border: "1px solid #ef4444", padding: "4px 8px", borderRadius: "4px", backgroundColor: "rgba(239, 68, 68, 0.1)" }}>
                            Generation Failed
                          </span>
                          <button onClick={() => {/* retry logic here if backend supported */ }} style={{ cursor: "pointer", background: "none", border: "none", color: "#3b82f6", textDecoration: "underline" }}>Retry</button>
                        </div>
                      ) : (!item.conducted || item.conducted === 'false' || item.conducted === false) ? (
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
                            to="/trustee/volunteer/attendance-details"
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