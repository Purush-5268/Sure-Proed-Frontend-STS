import { Link } from "react-router-dom";
import styles from "./Attendance.module.css";

function Attendance() {
  return (
    <div className={styles.page}>
      <div className="premium-card">

        <h1>Today's Attendance</h1>

        <p className={styles.subtitle}>
          Your attendance status for today's internship session.
        </p>

        <div className={styles.statusCard}>
          <h2>Status</h2>
          <span className={styles.present}>PRESENT</span>
        </div>

        <div className={styles.sessionCard}>
          <div className={styles.item}>
            <h3>Today's Session</h3>
            <p>Java Fundamentals</p>
          </div>

          <div className={styles.item}>
            <h3>Time</h3>
            <p>10:00 AM - 12:00 PM</p>
          </div>

          <div className={styles.item}>
            <h3>Mentor</h3>
            <p>Rajesh Kumar</p>
          </div>
        </div>

        <div className={styles.policy}>
          <h2>Attendance Policy</h2>

          <ul>
            <li>Attendance is mandatory for every internship session.</li>

            <li>
              Missing even one scheduled class may lead to removal from the internship program.
            </li>

            <li>
              If you cannot attend due to a genuine reason, inform your mentor immediately.
            </li>
          </ul>
        </div>

        <Link
          to="/student/attendance-history"
          className={styles.button}
        >
          View Attendance History
        </Link>

        <Link
          to="/student/assignments"
          className={styles.button}
        >
          Continue to Assignments
        </Link>

      </div>
    </div>
  );
}

export default Attendance;