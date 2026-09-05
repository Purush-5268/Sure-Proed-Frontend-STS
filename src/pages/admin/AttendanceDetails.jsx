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
  
  // 🚨 Whitelist Management State
  const [guestEmailInput, setGuestEmailInput] = useState("");
  const [isWhitelisting, setIsWhitelisting] = useState(false);

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

  useEffect(() => {
    fetchSessionDetails();
  }, [sessionId]);

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!guestEmailInput.trim()) return;

    setIsWhitelisting(true);
    try {
      const emailsArray = guestEmailInput
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));

      if (emailsArray.length === 0) {
        alert("Please enter valid email addresses.");
        setIsWhitelisting(false);
        return;
      }

      // Call the add-attendees endpoint
      const response = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/add-attendees/`, { emails: emailsArray });
      
      alert(response.data.message || "Guests successfully whitelisted!");
      setGuestEmailInput("");
      
      // Reload session to reflect updated whitelist count
      await fetchSessionDetails();
    } catch (error) {
      console.error("Failed to whitelist guests:", error);
      alert(error.response?.data?.detail || error.response?.data?.error || "Failed to whitelist guests.");
    } finally {
      setIsWhitelisting(false);
    }
  };

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

  const expectedCount = sessionData.google_total_students ?? (Array.isArray(sessionData.attendees) ? sessionData.attendees.length : 0);
  const joinedCount = sessionData.google_joined_count ?? (Array.isArray(sessionData.joined_students) ? sessionData.joined_students.length : 0);

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
            <label>Expected Students</label>
            <p>{sessionData.actual_student_count || 0}</p>
          </div>

          <div>
            <label>Whitelisted Emails</label>
            <p>{sessionData.whitelist_email_count || 0}</p>
          </div>
          
          <div>
            <label>Total Combined Attendees</label>
            <p>{sessionData.total_attendee_count || 0}</p>
          </div>

          <div>
            <label>Total Joined Students</label>
            <p>{joinedCount}</p>
          </div>
          
          <div>
            <label>Meet Start Time</label>
            <p>
              {sessionData.start_time
                ? new Date(`${sessionData.class_date}T${sessionData.start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : "Not available yet"}
            </p>
          </div>

          <div>
            <label>Meet End Time</label>
            <p>
              {sessionData.end_time
                ? new Date(`${sessionData.class_date}T${sessionData.end_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : "Not available yet"}
            </p>
          </div>

          <div>
            <label>Status</label>
            <span className={
              sessionData.status === 'ATTENDANCE_PENDING' ? styles.pending :
              sessionData.status === 'ATTENDANCE_FAILED' ? styles.absent :
              (!sessionData.conducted || sessionData.conducted === 'false') ? styles.absent : styles.present
            }>
              {sessionData.status === 'ATTENDANCE_PENDING' ? "Generating Meet Link..." :
               sessionData.status === 'ATTENDANCE_FAILED' ? "Generation Failed" :
               (!sessionData.conducted || sessionData.conducted === 'false') ? "Conducted / Ended" : "Active"}
            </span>
          </div>
        </div>

        {/* 🚨 WHITELIST MANAGEMENT UI */}
        <div style={{ marginTop: '30px', padding: '20px', background: 'var(--bg-nested)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '10px', color: 'var(--text-primary)' }}>Whitelist External Guests</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
            Add emails (comma separated) to allow them to bypass the waiting room. Changes will sync to Google Calendar automatically in the background.
          </p>
          <form onSubmit={handleAddGuest} style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              placeholder="e.g. guest1@example.com, guest2@example.com" 
              value={guestEmailInput}
              onChange={(e) => setGuestEmailInput(e.target.value)}
              className="premium-input"
              style={{ flex: 1 }}
            />
            <button 
              type="submit" 
              className="premium-btn premium-btn-secondary" 
              disabled={isWhitelisting || !guestEmailInput.trim()}
            >
              {isWhitelisting ? "Syncing..." : "+ Add Guests"}
            </button>
          </form>
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

                  const isLowAttendance = attPercentage > 0 && attPercentage < 40;
                  const isAbsent = attPercentage === 0 || (student.status && student.status.toUpperCase() === 'ABSENT');

                  return (
                    <tr key={studentId || idx} style={{ background: isAbsent ? "rgba(239, 68, 68, 0.15)" : isLowAttendance ? "rgba(239, 68, 68, 0.05)" : "transparent" }}>
                      <td style={{ verticalAlign: "middle" }}>{studentName}</td>
                      <td style={{ verticalAlign: "middle" }}>{studentEmail}</td>
                      <td style={{ verticalAlign: "middle", color: isLowAttendance || isAbsent ? "#ef4444" : "inherit", fontWeight: isLowAttendance || isAbsent ? "bold" : "normal" }}>
                        {attPercentage}%
                      </td>
                      <td style={{ verticalAlign: "middle" }}>
                        {isLowAttendance ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: "bold" }}>⚠️ Attendance Below Threshold</span>
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
                            <button
                              onClick={() => alert('Permission Request backend endpoint missing. Missing contract: POST /api/attendance/request_permission/ requires target_student, session_id, reason')}
                              style={{
                                background: "#f59e0b", color: "white", border: "none",
                                padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                                fontWeight: "bold", cursor: "pointer", transition: "all 0.2s ease"
                              }}
                            >
                              Request Permission
                            </button>
                          </div>
                        ) : isAbsent ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: "bold" }}>⚠️ Absent</span>
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
                            <button
                              onClick={() => alert('Permission Request backend endpoint missing. Missing contract: POST /api/attendance/request_permission/ requires target_student, session_id, reason')}
                              style={{
                                background: "#f59e0b", color: "white", border: "none",
                                padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                                fontWeight: "bold", cursor: "pointer", transition: "all 0.2s ease"
                              }}
                            >
                              Request Permission
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