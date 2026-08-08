import { Link } from "react-router-dom";
import styles from "./SystemSettings.module.css";
import ThemeToggle from "../../components/common/ThemeToggle";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function SystemSettings() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>System Settings</h1>

          <Link to="/admin/settings">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Application Name</label>
            <input
              type="text"
              defaultValue="Student Tracking Application"
            />
          </div>

          <div className={styles.group}>
            <label>Default Language</label>

            <select defaultValue="English">
              <option>English</option>
              <option>Telugu</option>
              <option>Hindi</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Timezone</label>

            <select defaultValue="Asia/Kolkata">
              <option>Asia/Kolkata</option>
              <option>UTC</option>
            </select>
          </div>

          <div className={styles.group}>
            <ThemeToggle />
          </div>

          <div className={styles.group}>
            <label>Maintenance Mode</label>

            <select defaultValue="Disabled">
              <option>Disabled</option>
              <option>Enabled</option>
            </select>
          </div>

          <button type="submit">
            Save Settings
          </button>

        </form>

      </div>
    </div>
  );
}

export default SystemSettings;