import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AttendanceManagement.module.css";

function AttendanceManagement() {
  const [attendance, setAttendance] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [courses, setCourses] = useState([]); // 🚨 1. Add courses state
  const [loading, setLoading] = useState(true);

  const [selectedCourse, setSelectedCourse] = useState(""); // 🚨 2. Change filterDomain to selectedCourse
  const [filterGroup, setFilterGroup] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [attendanceResponse, cohortsResponse, coursesResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE),
          apiClient.get(API_ENDPOINTS.COURSES?.BASE || "/api/courses/"), // 🚨 Fetch available courses
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
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // 🚨 Fixed String Parsing Logic
  // 🚨 Bulletproof String Parsing Logic (Handles Brackets AND Hyphens)
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

  // 🚨 Filter Logic
  const filteredAttendance = attendance.filter((item) => {
    const domainName = getDomainName(item.cohort, item.title);
    const groupName = getGroupNumber(item.cohort, item.title);

    const matchesCourse = selectedCourse === "" || domainName.toLowerCase().includes(selectedCourse.toLowerCase());
    const matchesGroup = filterGroup === "" || groupName.toLowerCase().includes(filterGroup.toLowerCase());

    return matchesCourse && matchesGroup;
  });

  const handleDownloadExcel = async (itemId, itemTitle, itemDate) => {
    try {
      const response = await apiClient.get(`/api/attendance/${itemId}/download_excel/`, {
        responseType: 'blob',
      });

      // 🚨 Force Excel MIME type
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);

      const safeTitle = (itemTitle || "Attendance").replace(/[\s/]/g, "_");
      // 🚨 Force .xlsx extension
      link.download = `${safeTitle}_${itemDate}.xlsx`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download excel report:", err);
      alert("Failed to download the report. Make sure the session has ended.");
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

      {/* 🚨 Course Dropdown & Group Input UI */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", backgroundColor: "white", padding: "16px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>

        {/* Course Dropdown */}
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "white" }}
        >
          <option value="">-- Select Course / Stream --</option>
          {courses.map((c) => (
            <option key={c.id} value={c.name || c.title}>
              {c.name || c.title}
            </option>
          ))}
        </select>

        {/* Group Number Input */}
        <input
          type="text"
          placeholder="Filter by Group Number (e.g. G2-26)"
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #d1d5db" }}
        />

        <button
          onClick={() => { setSelectedCourse(""); setFilterGroup(""); }}
          style={{ padding: "10px 16px", backgroundColor: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
        >
          Clear
        </button>
      </div>

      {loading ? (
        <p>Loading attendance records from the database...</p>
      ) : filteredAttendance.length === 0 ? (
        <p>No attendance sessions match your filters.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
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
                const getDownloadLink = (item) => {
                  const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001/api/";
                  return `${baseUrl}attendance/${item.id}/download_excel/`;
                };

                return (
                  <tr key={item.id}>
                    <td>{item.class_date}</td>
                    <td>{getCohortName(item.cohort, item.title)}</td>
                    <td>{getCohortBatch(item.cohort, item.title)}</td>
                    <td>{Array.isArray(item.attendees) ? item.attendees.length : 0}</td>
                    <td>{item.guest_emails ? item.guest_emails.length : (item.notes && item.notes.includes('Whitelisted Guests:') ? item.notes.split(',').length - 1 : 0)}</td>
                    <td>{Array.isArray(item.joined_students) ? item.joined_students.length : 0}</td>
                    <td>{Math.max(0, (Array.isArray(item.attendees) ? item.attendees.length : 0) - (Array.isArray(item.joined_students) ? item.joined_students.length : 0))}</td>

                    <td className={styles.actions} style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", margin: 0, padding: 0 }}>
                        {item.conducted === false && (
                          <button
                            onClick={() => handleDownloadExcel(item.id, item.title, item.class_date)}
                            style={{
                              background: "#16a34a",
                              color: "white",
                              padding: "7px 14px",
                              borderRadius: "6px",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: "bold",
                              fontSize: "12px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              margin: 0
                            }}
                          >
                            ⬇️ Excel
                          </button>
                        )}
                        <Link
                          to="/admin/attendance-details"
                          state={{ sessionId: item.id, sessionTitle: item.title, sessionDate: item.class_date }}
                          style={{
                            background: "#3b82f6",
                            color: "white",
                            padding: "7px 16px",
                            borderRadius: "6px",
                            textDecoration: "none",
                            fontWeight: "bold",
                            fontSize: "12px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            margin: 0
                          }}
                        >
                          View
                        </Link>
                      </div>
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