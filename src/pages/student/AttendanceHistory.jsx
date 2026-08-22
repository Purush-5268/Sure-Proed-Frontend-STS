import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { useAuth } from "../../context/AuthContext";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./AttendanceHistory.module.css";
import { FiPieChart, FiClock, FiCalendar } from "react-icons/fi";

function AttendanceHistory() {
  const { profile } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.student_dashboard_data) {
      setSummary(profile.student_dashboard_data);
      setAttendance(profile.student_dashboard_data.sessions || []);
      setLoading(false);
    } else if (profile) {
      // If profile is loaded but no dashboard data, still stop loading
      setLoading(false);
    }
  }, [profile]);

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Attendance Overview</h1>
        <p className={styles.subtitle}>
          Your authoritative attendance percentage and session history.
        </p>

        {loading ? (
          <SkeletonLoader variant="detail" />
        ) : (
          <>
            {summary ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <FiPieChart size={32} color="var(--primary-color)" style={{ marginBottom: '12px' }} />
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Overall Attendance</h3>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: summary.attendance_percentage >= 75 ? '#10b981' : '#ef4444' }}>
                    {summary.attendance_percentage?.toFixed(1)}%
                  </div>
                </div>
                
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <FiClock size={32} color="#3b82f6" style={{ marginBottom: '12px' }} />
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Active Minutes</h3>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {Math.round(summary.total_active_minutes || 0)} min
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <FiCalendar size={32} color="#8b5cf6" style={{ marginBottom: '12px' }} />
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Total Session Time</h3>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {Math.round(summary.total_session_minutes || 0)} min
                  </div>
                </div>
              </div>
            ) : (
               <div style={{ background: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6', padding: '12px 16px', marginBottom: '24px', borderRadius: '4px' }}>
                 <strong style={{ color: '#1d4ed8' }}>Processing:</strong> Your detailed attendance summary is currently being calculated by the system. Check back after your first completed session.
               </div>
            )}

            <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Session History</h2>

            {attendance.length === 0 ? (
              <p>No individual session records are available yet.</p>
            ) : (
              <div className="premium-table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Session</th>
                      <th>Time</th>
                      <th>Session Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((item, index) => (
                      <tr key={item.id || index}>
                        <td>{formatDate(item.date)}</td>
                        <td>{item.title || "Class Session"}</td>
                        <td>{item.duration_minutes ? `${item.duration_minutes} min` : "N/A"}</td>
                        <td>
                          {item.status === "PRESENT" ? (
                            <span style={{ background: '#10b981', color: 'white', padding: '4px 8px', borderRadius: '4px' }}>
                              PRESENT
                            </span>
                          ) : item.status === "ABSENT" ? (
                            <span style={{ background: '#ef4444', color: 'white', padding: '4px 8px', borderRadius: '4px' }}>
                              ABSENT
                            </span>
                          ) : (
                            <span style={{ background: '#f59e0b', color: 'white', padding: '4px 8px', borderRadius: '4px' }}>
                              {item.status || "BELOW THRESHOLD"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="actions" style={{display: "flex", gap: "8px", marginTop: '24px'}}>
          <Link to="/student/assignments" className={styles.button}>
            Continue to Assignments →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AttendanceHistory;