import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { attendanceService } from "../../services/attendanceService";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Attendance.module.css";

function Attendance() {
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadActiveSessions() {
      try {
        const res = await attendanceService.getAttendanceRecords({ status: "ACTIVE" });
        const data = res?.data || res;
        const sessions = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        if (isMounted) setActiveSessions(sessions);
      } catch (error) {
        console.error("Failed to load active sessions", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadActiveSessions();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Today's Attendance</h1>
        <p className={styles.subtitle}>
          Your live sessions for today. Join from your dashboard to track attendance.
        </p>
        
        {loading ? (
           <SkeletonLoader variant="table" rows={2} />
        ) : activeSessions.length === 0 ? (
          <div className={styles.statusCard}>
             <h3 style={{ color: "var(--text-secondary)" }}>No active sessions at the moment</h3>
          </div>
        ) : (
          activeSessions.map((session, idx) => (
            <div key={idx} className={styles.sessionCard} style={{ marginBottom: "16px" }}>
              <div className={styles.item}>
                <h3>Session</h3>
                <p>{session.title || session.session_type}</p>
              </div>
              <div className={styles.item}>
                <h3>Time</h3>
                <p>{session.start_time} - {session.end_time || "TBD"}</p>
              </div>
              <div className={styles.item}>
                <h3>Status</h3>
                <p style={{ color: "#10b981", fontWeight: "bold" }}>LIVE NOW</p>
              </div>
            </div>
          ))
        )}

        <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', padding: '12px 16px', margin: '24px 0', borderRadius: '4px' }}>
          <strong style={{ color: '#ef4444' }}>Note:</strong> Your cumulative attendance percentage is tracked securely by the system during live sessions. Detailed individual statistics are currently being processed.
        </div>

        <div className={styles.policy}>
          <h2>Attendance Policy</h2>
          <ul>
            <li>Attendance is mandatory for every internship session.</li>
            <li>Missing scheduled classes may lead to removal from the internship program.</li>
            <li>If you cannot attend due to a genuine reason, inform your mentor immediately.</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/student/attendance-history" className={styles.button}>
            View Session History
          </Link>
          <Link to="/student/dashboard" className={styles.button} style={{ background: 'var(--primary-color)' }}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Attendance;