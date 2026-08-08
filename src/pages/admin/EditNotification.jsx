import { Link } from "react-router-dom";
import styles from "./EditNotification.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditNotification() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Edit Notification</h1>

          <Link to="/admin/notifications">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Notification Title</label>
            <input
              type="text"
              defaultValue="Exam Schedule Released"
            />
          </div>

          <div className={styles.group}>
            <label>Audience</label>

            <select defaultValue="All Students">
              <option>All Users</option>
              <option>All Students</option>
              <option>All Mentors</option>
              <option>All Companies</option>
              <option>Java Batch</option>
              <option>MERN Batch</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Publish Date</label>
            <input
              type="date"
              defaultValue="2026-07-28"
            />
          </div>

          <div className={styles.group}>
            <label>Status</label>

            <select defaultValue="Published">
              <option>Published</option>
              <option>Draft</option>
            </select>
          </div>

          <div className={styles.full}>
            <label>Message</label>

            <textarea
              rows="6"
              defaultValue="The screening exam schedule has been published. Students are requested to check their exam date and report on time."
            ></textarea>
          </div>

          <button type="submit">
            Update Notification
          </button>

        </form>

      </div>
    </div>
  );
}

export default EditNotification;