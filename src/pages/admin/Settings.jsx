import { Link } from "react-router-dom";
import styles from "./Settings.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Settings() {
  return (
    <div className={styles.container}>

      <div className={styles.header}>
        <h1>Settings</h1>
        <p>Manage your admin account and system preferences.</p>
      </div>

      <div className={styles.grid}>

        <Link to="/admin/profile-settings" className="premium-card">
          <h2>Profile Settings</h2>
          <p>Update admin profile information.</p>
        </Link>

        <Link to="/admin/security-settings" className="premium-card">
          <h2>Security Settings</h2>
          <p>Change password and security options.</p>
        </Link>

        <Link to="/admin/system-settings" className="premium-card">
          <h2>System Settings</h2>
          <p>Configure application settings.</p>
        </Link>

      </div>

    </div>
  );
}

export default Settings;