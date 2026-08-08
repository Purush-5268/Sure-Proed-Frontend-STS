import { Link } from "react-router-dom";
import styles from "./NotificationDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function NotificationDetails() {
  const notification = {
    title: "Exam Schedule Released",
    audience: "All Students",
    date: "28 July 2026",
    status: "Published",
    createdBy: "Admin",
    description:
      "The screening exam schedule has been published. Students are requested to check their exam date and report on time.",
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Notification Details</h1>

          <Link to="/admin/notifications">
            Back
          </Link>
        </div>

        <div className={styles.grid}>

          <div>
            <label>Title</label>
            <p>{notification.title}</p>
          </div>

          <div>
            <label>Audience</label>
            <p>{notification.audience}</p>
          </div>

          <div>
            <label>Published Date</label>
            <p>{notification.date}</p>
          </div>

          <div>
            <label>Created By</label>
            <p>{notification.createdBy}</p>
          </div>

          <div>
            <label>Status</label>
            <span className={styles.published}>
              {notification.status}
            </span>
          </div>

        </div>

        <div className={styles.description}>
          <label>Description</label>
          <p>{notification.description}</p>
        </div>

        <div className={styles.buttons}>
          <Link to="/admin/edit-notification">
            Edit Notification
          </Link>
        </div>

      </div>
    </div>
  );
}

export default NotificationDetails;