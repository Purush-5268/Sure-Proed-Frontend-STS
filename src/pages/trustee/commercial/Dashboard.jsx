import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { getAnnouncements, getUpdates } from "../../../services/trusteeService";
import styles from "./Dashboard.module.css";

function CommercialDashboard() {
  const { user } = useAuth();
  const roleName = user?.admin_category === "ADVISORY" ? "Advisor" : "Trustee";
  const userName = user?.firstName || user?.first_name || roleName;

  const [announcementsCount, setAnnouncementsCount] = useState(0);
  const [updatesCount, setUpdatesCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [announcementsRes, updatesRes] = await Promise.all([
          getAnnouncements().catch(() => ({ results: [] })),
          getUpdates().catch(() => ({ results: [] })),
        ]);
        
        const announcementsArray = announcementsRes.results || announcementsRes || [];
        const updatesArray = updatesRes.results || updatesRes || [];
        
        setAnnouncementsCount(announcementsArray.length);
        setUpdatesCount(updatesArray.length);
      } catch (err) {
        console.warn("Error fetching commercial stats:", err);
      }
    };
    fetchData();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <h1>Welcome, {userName}</h1>
          <p>
            {roleName} Operations Dashboard. Manage organization-wide
            announcements, showcase achievements, and track organization updates.
          </p>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>{announcementsCount}</span>
            <span className={styles.statLabel}>Active Announcements</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>{updatesCount}</span>
            <span className={styles.statLabel}>Recent Updates</span>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <Link to="/trustee/commercial/announcements" className="premium-card">
          <div className={styles.cardIconWrapper} style={{ background: '#fef3c7', color: '#d97706' }}>
            <span className={styles.cardIcon}>📢</span>
          </div>
          <h3>Announcements</h3>
          <p>Broadcast high-priority messages to all stakeholders and users across the platform.</p>
        </Link>

        <Link to="/trustee/commercial/achievements" className="premium-card">
          <div className={styles.cardIconWrapper} style={{ background: '#dcfce7', color: '#15803d' }}>
            <span className={styles.cardIcon}>🏆</span>
          </div>
          <h3>Achievements</h3>
          <p>Highlight organizational milestones, awards, and major success stories.</p>
        </Link>

        <Link to="/trustee/commercial/updates" className="premium-card">
          <div className={styles.cardIconWrapper} style={{ background: '#e0e7ff', color: '#4338ca' }}>
            <span className={styles.cardIcon}>📰</span>
          </div>
          <h3>Organization Updates</h3>
          <p>Publish news related to partnerships, funding, and expansion efforts.</p>
        </Link>
      </div>
    </div>
  );
}

export default CommercialDashboard;
