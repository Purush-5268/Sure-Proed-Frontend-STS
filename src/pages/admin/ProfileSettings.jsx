import { Link } from "react-router-dom";
import styles from "./ProfileSettings.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ProfileSettings() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Profile Settings</h1>

          <Link to="/admin/settings">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Full Name</label>
            <input
              type="text"
              defaultValue="Admin User"
            />
          </div>

          <div className={styles.group}>
            <label>Email</label>
            <input
              type="email"
              defaultValue="admin@example.com"
            />
          </div>

          <div className={styles.group}>
            <label>Phone Number</label>
            <input
              type="tel"
              defaultValue="+91 9876543210"
            />
          </div>

          <div className={styles.group}>
            <label>Designation</label>
            <input
              type="text"
              defaultValue="System Administrator"
            />
          </div>

          <div className={styles.full}>
            <label>Bio</label>

            <textarea
              rows="5"
              defaultValue="Responsible for managing the Student Tracking Application."
            ></textarea>
          </div>

          <button type="submit">
            Save Changes
          </button>

        </form>

      </div>
    </div>
  );
}

export default ProfileSettings;