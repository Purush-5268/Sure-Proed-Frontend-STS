import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import styles from "./Dashboard.module.css";

function CommercialDashboard() {
  const { user } = useAuth();
  const userName = user?.firstName || user?.first_name || "Partner";

  return (
    <div className={styles.container}>
      <div className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <h1>Welcome, {userName}</h1>
          <p>
            Higher-Level Operations Dashboard. Manage organization-wide
            announcements, showcase achievements, and track organization updates.
          </p>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>12</span>
            <span className={styles.statLabel}>Active Announcements</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>8</span>
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
