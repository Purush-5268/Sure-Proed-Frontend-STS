import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getLowAttendanceAlerts } from "../../../services/trusteeService";
import apiClient from "../../../services/apiClient";
import styles from "./Alerts.module.css";

function VolunteerAlerts() {
  const navigate = useNavigate();
  const [flaggedStudents, setFlaggedStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const alerts = await getLowAttendanceAlerts();
        setFlaggedStudents(alerts || []);
      } catch (err) {
        console.warn("Could not fetch alerts:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  const handleSendWarning = async (student) => {
    // Attempt to resolve IDs from the alert payload
    const studentId = student.student;
    const sessionId = student.session;

    if (!studentId) return alert("Student ID not found in alert data.");

    const customNote = window.prompt(`Type a warning message for ${student.name}:`, `Warning: Your recent attendance has dropped below the minimum threshold. Please explain your absence.`);
    if (!customNote) return;

    try {
      await apiClient.post('/api/attendance/warnings/create/', {
        student_id: studentId,
        session_id: sessionId || null, // Optional depending on backend
        note: customNote
      });
      alert(`Warning successfully sent to ${student.student_name}!`);
    } catch (error) {
      console.error("Failed to send warning:", error);
      alert("Failed to send warning. Please check console for errors.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2>⚠️ Action Required: Low Attendance</h2>
        </div>
        <Link to="/trustee/volunteer/dashboard" className="btn btnSecondary">
          ← Back to Dashboard
        </Link>
      </div>

      <div className={styles.infoBanner}>
        <p>
          This automated list displays students who have dropped below 50%
          attendance in the last 7 days. You can send them a direct Warning from here. 
          If their absence is unexcused, click "Manage User" to Suspend or Delete them in the User Moderation tab.
        </p>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading alerts...</div>
      ) : flaggedStudents.length === 0 ? (
        <div className={styles.successState}>
          <span className={styles.successIcon}>🎉</span>
          <h3>All Clear!</h3>
          <p>No students are currently flagged for low attendance.</p>
        </div>
      ) : (
        <div className={styles.alertList}>
          {flaggedStudents.map((student, idx) => (
            <div key={idx} className={styles.alertCard}>
              <div className={styles.studentInfo}>
                <h3>{student.student_name}</h3>
                <p>
                  <span className={styles.badgeLabel}>
                    {student.session_title}
                  </span>
                  {student.domain_name}
                  {student.group_name !== "General Batch" && (
                    <span className={styles.groupText}>
                      {" "}
                      | Group: {student.group_name}
                    </span>
                  )}
                </p>
                <div className={styles.missedDate}>
                  🗓️ MISSED ON:{" "}
                  {new Date(student.class_date).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div className={styles.attendanceStats}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={styles.statLabel}>Attendance Rate</span>
                    <span className={styles.statValue}>
                      {student.total_duration_percent}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button 
                      className="btn" 
                      style={{ backgroundColor: "#f59e0b", color: "white", padding: "6px 12px", fontSize: "11px", border: "none", cursor: "pointer", borderRadius: "4px" }}
                      onClick={() => handleSendWarning(student)}
                    >
                      Send Warning
                    </button>
                    <button 
                      className="btn" 
                      style={{ backgroundColor: "#3b82f6", color: "white", padding: "6px 12px", fontSize: "11px", border: "none", cursor: "pointer", borderRadius: "4px" }}
                      onClick={() => navigate(`/trustee/volunteer/student-details/${student.student}`)}
                    >
                      Manage User
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VolunteerAlerts;
