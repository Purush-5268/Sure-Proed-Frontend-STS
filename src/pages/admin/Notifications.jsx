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
        const response = await apiClient.get(API_ENDPOINTS.ANNOUNCEMENTS.BASE);
        if (isMounted) setNotifications(Array.isArray(response.data?.results) ? response.data.results : (Array.isArray(response.data) ? response.data : []));
      } catch (err) {
        console.error("Failed to load announcements:", err);
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
          <h1>Announcements</h1>
          <p>Manage global broadcasts and batch announcements</p>
        </div>

        <Link to="/admin/add-notification" className={styles.addBtn}>
          + New Announcement
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
                <th>Title</th>
                <th>Target Audience</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {notifications.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>
                    {item.target_audience === "COHORT" ? `Batch: ${item.cohort?.name || item.cohort?.code || 'Unknown'}` : item.target_audience}
                  </td>
                  <td className={item.is_active ? styles.published : styles.draft}>{item.is_active ? "Published" : "Draft"}</td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/admin/edit-notification/${item.id}`} className="premium-btn premium-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      Edit
                    </Link>
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