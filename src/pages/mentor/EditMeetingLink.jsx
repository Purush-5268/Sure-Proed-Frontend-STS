import { Link } from "react-router-dom";
import styles from "./EditMeetingLink.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditMeetingLink() {
  return (
    <div className={styles.container}>

      <div className="premium-card">

        <div className={styles.header}>
          <h1>Edit Meeting Link</h1>

          <Link to="/mentor/meeting-links">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Course</label>
            <input
              type="text"
              value="Java Full Stack"
              readOnly
            />
          </div>

          <div className={styles.group}>
            <label>Batch</label>
            <input
              type="text"
              value="Batch A"
              readOnly
            />
          </div>

          <div className={styles.group}>
            <label>Class Schedule</label>
            <input
              type="text"
              value="Mon - Fri | 10:00 AM"
              readOnly
            />
          </div>

          <div className={styles.group}>
            <label>Meeting Link</label>

            <input
              type="url"
              defaultValue="https://meet.google.com/java-batch-a"
            />
          </div>

          <button type="submit">
            Update Meeting Link
          </button>

        </form>

      </div>

    </div>
  );
}

export default EditMeetingLink;