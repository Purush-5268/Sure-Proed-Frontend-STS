import { Link } from "react-router-dom";
import styles from "./EditAssignment.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditAssignment() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Edit Assignment</h1>

          <Link to="/admin/assignments">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Assignment Title</label>
            <input
              type="text"
              defaultValue="React Mini Project"
            />
          </div>

          <div className={styles.group}>
            <label>Course</label>

            <select defaultValue="MERN Stack">
              <option>Java Full Stack</option>
              <option>MERN Stack</option>
              <option>Python Full Stack</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Due Date</label>
            <input
              type="date"
              defaultValue="2026-07-30"
            />
          </div>

          <div className={styles.group}>
            <label>Total Marks</label>
            <input
              type="number"
              defaultValue="100"
            />
          </div>

          <div className={styles.full}>
            <label>Description</label>

            <textarea
              rows="5"
              defaultValue="Students must build a responsive React application using reusable components, React Router and API integration."
            ></textarea>
          </div>

          <button type="submit">
            Update Assignment
          </button>

        </form>

      </div>
    </div>
  );
}

export default EditAssignment;