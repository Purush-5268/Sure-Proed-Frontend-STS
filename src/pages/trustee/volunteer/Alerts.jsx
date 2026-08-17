import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getLowAttendanceAlerts } from "../../../services/trusteeService";
import styles from "./Alerts.module.css";

function VolunteerAlerts() {
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
          attendance in the last 7 days. Please contact these students. If their
          absence is unexcused, proceed to the User Moderation tab to suspend
          them.
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
                <h3>{student.name}</h3>
                <p>
                  <span className={styles.badgeLabel}>
                    {student.sessionType}
                  </span>
                  {student.streamName}
                  {student.groupName !== "General Batch" && (
                    <span className={styles.groupText}>
                      {" "}
                      | Group: {student.groupName}
                    </span>
                  )}
                </p>
                <div className={styles.missedDate}>
                  🗓️ MISSED ON:{" "}
                  {new Date(student.sessionDate).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div className={styles.attendanceStats}>
                <span className={styles.statLabel}>Attendance Rate</span>
                <span className={styles.statValue}>
                  {student.totalDurationPercent}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VolunteerAlerts;
