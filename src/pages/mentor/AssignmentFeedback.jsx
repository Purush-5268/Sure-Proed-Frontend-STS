import { Link } from "react-router-dom";
import styles from "./AssignmentFeedback.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AssignmentFeedback() {
  return (
    <div className={styles.container}>

      <div className="premium-card">

        <div className={styles.header}>
          <h1>Assignment Review</h1>

          <Link to="/mentor/assignments">
            Back
          </Link>
        </div>

        <form className={styles.form}>

          <div className={styles.group}>
            <label>Student Name</label>
            <input
              type="text"
              value="Rahul Kumar"
              readOnly
            />
          </div>

          <div className={styles.group}>
            <label>Assignment</label>
            <input
              type="text"
              value="React Dashboard"
              readOnly
            />
          </div>

          <div className={styles.group}>
            <label>GitHub Repository</label>

            <a
              href="https://github.com/example/react-dashboard"
              target="_blank"
              rel="noreferrer"
            >
              View Submission
            </a>
          </div>

          <div className={styles.group}>
            <label>Marks</label>

            <input
              type="number"
              placeholder="Enter Marks"
            />
          </div>

          <div className={styles.fullWidth}>
            <label>Feedback</label>

            <textarea
              rows="6"
              placeholder="Enter feedback..."
            />
          </div>

          <button type="submit">
            Submit Review
          </button>

        </form>

      </div>

    </div>
  );
}

export default AssignmentFeedback;