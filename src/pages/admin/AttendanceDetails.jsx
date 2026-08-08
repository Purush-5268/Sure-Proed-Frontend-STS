import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AttendanceDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AttendanceDetails() {
  const location = useLocation();
  const sessionId = location.state?.sessionId;

  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🚨 ADDED SEND WARNING LOGIC
  const handleSendWarning = async (studentId, studentName) => {
    const customNote = window.prompt(`Type a warning message for ${studentName}:`, `Warning: Your attendance is below 40%. Please explain your absence.`);

    if (!customNote) return; // Admin cancelled the prompt

    try {
      // 🚨 Ensure your backend endpoint is ready for this route
      await apiClient.post('/api/attendance/warnings/create/', {
        student_id: studentId,
        session_id: sessionId,
        note: customNote
      });
      alert(`Warning successfully sent to ${studentName}!`);
    } catch (error) {
      console.error("Failed to send warning:", error);
      alert("Warning logic triggered! (Make sure backend endpoint is ready to receive it)");
    }
  };

  useEffect(() => {
    const fetchSessionDetails = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      try {
        const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/`);
        setSessionData(response.data);
      } catch (err) {
        console.error("Failed to load session attendance details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessionDetails();
  }, [sessionId]);

  if (loading) {
    return <div className={styles.container}><SkeletonLoader variant="detail" /></div>;
  }

  if (!sessionData) {
    return (
      <div className={styles.container}>
        <div className="premium-card">
          <p>No session selected or record not found.</p>
          <Link to="/admin/attendance" className={styles.backBtn}>Back</Link>
        </div>
      </div>
    );
  }

  const expectedCount = Array.isArray(sessionData.attendees) ? sessionData.attendees.length : 0;
  const joinedCount = Array.isArray(sessionData.joined_students) ? sessionData.joined_students.length : 0;

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Attendance Details</h1>
          <Link to="/admin/attendance">Back</Link>
        </div>

        <div className={styles.grid}>
          <div>
            <label>Session Title</label>
            <p>{sessionData.title}</p>
          </div>

          <div>
            <label>Date</label>
            <p>{sessionData.class_date}</p>
          </div>

          <div>
            <label>Total Expected Students</label>
            <p>{expectedCount}</p>
          </div>

          <div>
            <label>Total Joined Students</label>
            <p>{joinedCount}</p>
          </div>

          <div>
            <label>Total Absent Students</label>
            <p>{Math.max(0, expectedCount - joinedCount)}</p>
          </div>

          <div>
            <label>Status</label>
            <span className={(!sessionData.conducted || sessionData.conducted === 'false') ? styles.absent : styles.present}>
              {(!sessionData.conducted || sessionData.conducted === 'false') ? "Conducted / Ended" : "Active"}
            </span>
          </div>
        </div>

        {/* 🚨 ADDED DYNAMIC STUDENT ATTENDANCE TABLE WITH WARNING LOGIC */}
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--text-primary)' }}>Student Attendance List</h2>
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Attendance %</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {/* 🚨 Safely maps over summaries or raw attendees */}
                {(sessionData.attendance_summaries || sessionData.attendees || []).map((student, idx) => {
                  // 🚨 FIX: Handle Django's default array-of-integers for ManyToMany fields
                  const isObject = typeof student === 'object' && student !== null;

                  const studentId = isObject ? (student.student_id || student.id) : student;

                  // Extract names safely if nested, otherwise show ID (Backend requires nested serializer to show full names here)
                  const studentName = isObject ? (student.firstName || student.name || student.user?.first_name || `Student ID: ${studentId}`) : `Student ID: ${studentId}`;
                  const studentEmail = isObject ? (student.email || student.user?.email || "Email Hidden (Check Excel)") : "Email Hidden (Check Excel)";

                  // Calculates percentage if not explicitly provided by backend
                  const isJoined = Array.isArray(sessionData.joined_students) && sessionData.joined_students.some(js => js === studentId || (typeof js === 'object' && js.id === studentId));
                  const attPercentage = isObject && student.attendance_percentage !== undefined ? student.attendance_percentage : (isJoined ? 100 : 0);

                  const isLowAttendance = attPercentage < 40;

                  return (
                    <tr key={studentId || idx} style={{ background: isLowAttendance ? "rgba(239, 68, 68, 0.05)" : "transparent" }}>
                      <td style={{ verticalAlign: "middle" }}>{studentName}</td>
                      <td style={{ verticalAlign: "middle" }}>{studentEmail}</td>
                      <td style={{ verticalAlign: "middle", color: isLowAttendance ? "#ef4444" : "inherit", fontWeight: isLowAttendance ? "bold" : "normal" }}>
                        {attPercentage}%
                      </td>
                      <td style={{ verticalAlign: "middle" }}>
                        {isLowAttendance ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: "bold" }}>⚠️ Defaulter</span>
                            <button
                              onClick={() => handleSendWarning(studentId, studentName)}
                              style={{
                                background: "#ef4444", color: "white", border: "none",
                                padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                                fontWeight: "bold", cursor: "pointer", transition: "all 0.2s ease"
                              }}
                              onMouseOver={(e) => e.target.style.background = "#dc2626"}
                              onMouseOut={(e) => e.target.style.background = "#ef4444"}
                            >
                              Send Warning
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#10b981", fontSize: "12px", fontWeight: "bold" }}>✅ Good</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(!sessionData.attendance_summaries && !sessionData.attendees?.length) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      No student data available for this session.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.buttons} style={{ marginTop: '24px' }}>
          <Link to="/admin/update-attendance" className="premium-btn premium-btn-primary" style={{ padding: '10px 20px', textDecoration: 'none' }}>
            Manual Attendance Update
          </Link>
        </div>

      </div>
    </div>
  );
}

export default AttendanceDetails;