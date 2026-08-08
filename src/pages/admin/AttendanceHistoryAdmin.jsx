import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AttendanceHistoryAdmin.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AttendanceHistoryAdmin() {
  const [history, setHistory] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [attendanceResponse, cohortsResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE),
        ]);

        if (isMounted) {
          // 🚨 FIX: Safely extract Django's paginated 'results' array
          const histData = attendanceResponse.data || {};
          const cohData = cohortsResponse.data || {};

          setHistory(Array.isArray(histData.results) ? histData.results : (Array.isArray(histData) ? histData : []));
          setCohorts(Array.isArray(cohData.results) ? cohData.results : (Array.isArray(cohData) ? cohData : []));
        }
      } catch (err) {
        console.error("Failed to load attendance history:", err);
        if (isMounted) {
          setHistory([]);
          setCohorts([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const getCohortName = (cohortId) => {
    const cohort = cohorts.find((item) => item.id === cohortId);
    return cohort?.name || cohort?.code || "Unknown";
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Attendance History</h1>
          <p>Live records from the database</p>
        </div>

        <Link to="/admin/attendance" className={styles.backBtn}>
          Back
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : history.length === 0 ? (
        <p>No attendance history is available yet.</p>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>Cohort</th>
                <th>Attendees</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.class_date)}</td>
                  <td>{item.title || "Attendance Session"}</td>
                  <td>{getCohortName(item.cohort)}</td>
                  <td>{Array.isArray(item.attendees) ? item.attendees.length : 0}</td>
                  <td className={item.conducted ? styles.present : styles.absent}>
                    {item.conducted ? "Conducted" : "Cancelled"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AttendanceHistoryAdmin;