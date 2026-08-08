import { Link } from "react-router-dom";
import styles from "./AddAssignment.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AddAssignment() {
  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Add Assignment</h1>

          <Link to="/admin/assignments">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Assignment Title</label>
            <input
              type="text" className="premium-input" placeholder="Enter assignment title"
            />
          </div>

          <div className={styles.group}>
            <label>Course</label>

            <select>
              <option>Java Full Stack</option>
              <option>MERN Stack</option>
              <option>Python Full Stack</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Due Date</label>
            <input type="date" />
          </div>

          <div className={styles.group}>
            <label>Total Marks</label>
            <input
              type="number"
              placeholder="100"
            />
          </div>

          <div className={styles.full}>
            <label>Description</label>

            <textarea
              rows="5"
              placeholder="Enter assignment description"
            ></textarea>
          </div>

          <button type="submit">
            Create Assignment
          </button>

        </form>

      </div>
    </div>
  );
}

export default AddAssignment;