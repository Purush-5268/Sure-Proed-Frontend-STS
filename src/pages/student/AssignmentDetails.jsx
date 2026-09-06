import { Link, useLocation } from "react-router-dom";
import styles from "./AssignmentDetails.module.css";

function AssignmentDetails() {
  const location = useLocation();
  const assignment = location.state?.assignment;

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>{assignment?.title || "Assignment Details"}</h1>

        <p className={styles.subtitle}>
          Review the backend-sourced assignment details before submitting your work.
        </p>

        <div className={styles.section}>
          <h2>Assignment Description</h2>
          <p>{assignment?.description || "No description available yet."}</p>
        </div>

        <div className={styles.info}>
          <div>
            <strong>Due Date</strong>
            <p>{formatDate(assignment?.deadline)}</p>
          </div>

          <div>
            <strong>Type</strong>
            <p>{assignment?.assignment_type || "Assignment"}</p>
          </div>

          <div>
            <strong>Status</strong>
            <p className={assignment?.status === "SUBMITTED" ? styles.submitted : styles.pending}>
              {assignment?.status || "PENDING"}
            </p>
          </div>
        </div>

        <Link to="/student/assignment-submission" className={styles.button}>
          Submit Assignment →
        </Link>
      </div>
    </div>
  );
}

export default AssignmentDetails;