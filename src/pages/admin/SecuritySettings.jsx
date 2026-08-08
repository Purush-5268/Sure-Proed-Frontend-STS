import { Link } from "react-router-dom";
import styles from "./SecuritySettings.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function SecuritySettings() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Security Settings</h1>

          <Link to="/admin/settings">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Current Password</label>
            <input
              type="password"
              placeholder="Enter current password"
            />
          </div>

          <div className={styles.group}>
            <label>New Password</label>
            <input
              type="password"
              placeholder="Enter new password"
            />
          </div>

          <div className={styles.group}>
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Confirm new password"
            />
          </div>

          <div className={styles.group}>
            <label>Two-Factor Authentication</label>

            <select>
              <option>Disabled</option>
              <option>Enabled</option>
            </select>
          </div>

          <button type="submit">
            Update Security
          </button>

        </form>

      </div>
    </div>
  );
}

export default SecuritySettings;