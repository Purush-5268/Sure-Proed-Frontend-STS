import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AttendanceHistory.module.css";

function AttendanceHistory() {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAttendance = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE);
        if (isMounted) setAttendance(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to load attendance history:", err);
        if (isMounted) setAttendance([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAttendance();
    return () => {
      isMounted = false;
    };
  }, []);

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
        <h1>Attendance History</h1>

        <p className={styles.subtitle}>
          View your attendance records for all internship sessions.
        </p>

        {loading ? (
          <SkeletonLoader variant="table" rows={6} />
        ) : attendance.length === 0 ? (
          <p>No attendance records are available yet.</p>
        ) : (
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {attendance.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.class_date)}</td>
                    <td>{item.title || "Class Session"}</td>
                    <td>{item.start_time ? `${item.start_time} - ${item.end_time || ""}`.trim() : "N/A"}</td>
                    <td>
                      <span className={item.conducted ? styles.present : styles.absent}>
                        {item.conducted ? "Present" : "Absent"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions" style={{display: "flex", gap: "8px"}}>
          <Link to="/student/assignments" className={styles.button}>
            Continue to Assignments →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AttendanceHistory;