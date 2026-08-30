import { Link } from "react-router-dom";
import styles from "./UpdateAttendance.module.css";
import SkeletonLoader from "../../../components/common/SkeletonLoader";

function UpdateAttendance() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Update Attendance</h1>

          <Link to="/trustee/volunteer/attendance">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Student Name</label>
            <input
              type="text"
              defaultValue="Rahul Sharma"
            />
          </div>

          <div className={styles.group}>
            <label>Cohort</label>
            <input
              type="text"
              defaultValue="Java Full Stack"
            />
          </div>

          <div className={styles.group}>
            <label>Date</label>
            <input
              type="date"
              defaultValue="2026-07-28"
            />
          </div>

          <div className={styles.group}>
            <label>Status</label>

            <select defaultValue="Present">
              <option>Present</option>
              <option>Absent</option>
              <option>Leave</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Check In</label>
            <input
              type="time"
              defaultValue="09:00"
            />
          </div>

          <div className={styles.group}>
            <label>Check Out</label>
            <input
              type="time"
              defaultValue="17:00"
            />
          </div>

          <button type="submit">
            Update Attendance
          </button>

        </form>

      </div>
    </div>
  );
}

export default UpdateAttendance;