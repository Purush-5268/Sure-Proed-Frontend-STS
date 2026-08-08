import { Link } from "react-router-dom";
import styles from "./EditCertificate.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditCertificate() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Edit Certificate</h1>

          <Link to="/admin/certificates">
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
            <label>Course</label>

            <select defaultValue="Java Full Stack">
              <option>Java Full Stack</option>
              <option>MERN Stack</option>
              <option>Python Full Stack</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Certificate ID</label>
            <input
              type="text"
              defaultValue="CERT-2026-001"
            />
          </div>

          <div className={styles.group}>
            <label>Issue Date</label>
            <input
              type="date"
              defaultValue="2026-07-25"
            />
          </div>

          <div className={styles.group}>
            <label>Grade</label>

            <select defaultValue="A">
              <option>A+</option>
              <option>A</option>
              <option>B+</option>
              <option>B</option>
              <option>C</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Status</label>

            <select defaultValue="Issued">
              <option>Issued</option>
              <option>Pending</option>
            </select>
          </div>

          <div className={styles.full}>
            <label>Description</label>

            <textarea
              rows="5"
              defaultValue="Certificate issued after successful completion of the Java Full Stack Training Program."
            ></textarea>
          </div>

          <button type="submit">
            Update Certificate
          </button>

        </form>

      </div>
    </div>
  );
}

export default EditCertificate;