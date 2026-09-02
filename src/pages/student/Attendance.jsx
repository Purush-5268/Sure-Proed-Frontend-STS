import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { attendanceService } from "../../services/attendanceService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { useAuth } from "../../context/AuthContext";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Attendance.module.css";

function Attendance() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadSessions() {
      try {
        const res = await apiClient.get(API_ENDPOINTS.ATTENDANCE.SUMMARY);
        const data = res?.data?.results || res?.data || [];
        if (data.length > 0) {
          const myAtt = data.find(a => a.student_id === user?.id || a.user?.id === user?.id || a.email === user?.email) || data[0];
          const history = myAtt.history || [];
          if (isMounted) setSessions(history);
        } else {
          if (isMounted) setSessions([]);
        }
      } catch (error) {
        console.error("Failed to load attendance sessions", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSessions();
    return () => { isMounted = false; };
  }, []);

  const totalEvaluated = sessions.filter(s => s.student_dashboard_data?.status === 'READY').length;
  const totalAttended = sessions.filter(s => s.student_dashboard_data?.status === 'READY' && s.student_dashboard_data.attendance_percentage > 0).length;
  const overallPercentage = totalEvaluated > 0 ? ((totalAttended / totalEvaluated) * 100).toFixed(1) : 0;

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>My Attendance</h1>
        <p className={styles.subtitle}>
          Track your cohort session attendance and overall percentage.
        </p>

        {loading ? (
           <SkeletonLoader variant="table" rows={4} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--bg-nested)', padding: '16px', borderRadius: '8px', flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>Overall Attendance</h3>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--primary-color)' }}>{overallPercentage}%</div>
              </div>
              <div style={{ background: 'var(--bg-nested)', padding: '16px', borderRadius: '8px', flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>Sessions Attended</h3>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{totalAttended} / {totalEvaluated}</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '24px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px' }}>Date</th>
                    <th style={{ padding: '12px' }}>Class</th>
                    <th style={{ padding: '12px' }}>Time</th>
                    <th style={{ padding: '12px' }}>Mentor</th>
                    <th style={{ padding: '12px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No session history found.</td></tr>
                  ) : (
                    sessions.map((session, idx) => {
                      const data = session.student_dashboard_data || {};
                      const isReady = data.status === 'READY';
                      const statusColor = data.attendance_status === 'PRESENT' ? '#10b981' : (data.attendance_status === 'ABSENT' ? '#ef4444' : '#f59e0b');
                      const statusText = data.attendance_status === 'PRESENT' ? '🟢 Present' : (data.attendance_status === 'ABSENT' ? '🔴 Absent' : (isReady ? '🟡 Below Threshold' : '⚪ Pending'));

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px' }}>{data.class_date || session.class_date || 'N/A'}</td>
                          <td style={{ padding: '12px' }}>{session.title || session.class_type || 'Session'}</td>
                          <td style={{ padding: '12px' }}>{isReady ? `${data.meet_start || 'N/A'} - ${data.meet_end || 'N/A'}` : 'TBD'}</td>
                          <td style={{ padding: '12px' }}>{session.conducted_by_name || 'Mentor'}</td>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: isReady ? statusColor : 'var(--text-secondary)' }}>
                            {statusText} {isReady && data.attendance_percentage != null ? `(${data.attendance_percentage.toFixed(0)}%)` : ''}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className={styles.policy}>
          <h2>Attendance Policy</h2>
          <ul>
            <li>Attendance is mandatory for every internship session.</li>
            <li>Missing scheduled classes may lead to removal from the internship program.</li>
            <li>If you cannot attend due to a genuine reason, inform your mentor immediately.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Attendance;