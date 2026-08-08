import { Link } from "react-router-dom";
import styles from "./AssignmentFeedback.module.css";

function AssignmentFeedback() {
  return (
    <div className={styles.page}>
      <div className="premium-card">

        <h1>Assignment Feedback</h1>

        <p className={styles.subtitle}>
          Your assignment has been evaluated by your mentor.
        </p>

        <div className={styles.section}>

          <div className={styles.row}>
            <strong>Assignment</strong>
            <span>Java OOP Assignment</span>
          </div>

          <div className={styles.row}>
            <strong>Submission Status</strong>
            <span className={styles.submitted}>Submitted</span>
          </div>

          <div className={styles.row}>
            <strong>Marks Obtained</strong>
            <span>92 / 100</span>
          </div>

          <div className={styles.row}>
            <strong>Evaluation Date</strong>
            <span>12 Aug 2026</span>
          </div>

        </div>

        <div className={styles.feedbackBox}>

          <h2>Mentor Feedback</h2>

          <p>
            Excellent work! Your implementation of Object-Oriented Programming
            concepts is very good. Improve exception handling and add more
            comments to make the code easier to understand. Overall, a strong
            submission.
          </p>

        </div>

        <Link
          to="/student/certificates"
          className={styles.button}
        >
          Continue to Certificates →
        </Link>

      </div>
    </div>
  );
}

export default AssignmentFeedback;