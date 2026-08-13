import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Notifications.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadNotifications = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE);
        if (isMounted) setNotifications(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to load notifications:", err);
        if (isMounted) setNotifications([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadNotifications();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Notifications</h1>
          <p>Manage announcements and notifications</p>
        </div>

        <Link to="/admin/add-notification" className={styles.addBtn}>
          + Add Notification
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : notifications.length === 0 ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">🔔</div>
          <h3>No Notifications</h3>
          <p>No notifications are available yet.</p>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {notifications.map((item) => (
                <tr key={item.id}>
                  <td>{item.student?.user?.first_name || item.student?.user?.email || "Unknown"}</td>
                  <td>{item.course?.name || item.course || "N/A"}</td>
                  <td className={item.status === "APPROVED" ? styles.published : styles.draft}>{item.status || "PENDING"}</td>
                  <td className="actions" style={{ display: "flex", gap: "8px" }}>
                    <Link to="/admin/notification-details">View</Link>
                    <Link to="/admin/edit-notification">Edit</Link>
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

export default Notifications;