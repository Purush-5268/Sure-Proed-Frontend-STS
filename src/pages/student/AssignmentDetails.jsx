import { Link, useLocation } from "react-router-dom";
import styles from "./AssignmentDetails.module.css";

function AssignmentDetails() {
  const location = useLocation();
  const assignment = location.state?.assignment;

  const isPastDeadline = assignment?.deadline ? new Date() > new Date(assignment.deadline) : false;
  const allowLate = assignment?.allow_late_submissions;

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
      <div className={styles.card} style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px' }}>{assignment?.title || "Assignment Details"}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Review the backend-sourced assignment details before submitting your work.
        </p>

        <div className={styles.meta}>
          <span className="premium-badge premium-badge-info">
            {assignment?.assignment_type || "Assignment"}
          </span>
          <span className={`premium-badge ${assignment?.status === "SUBMITTED" ? "premium-badge-active" : "premium-badge-pending"}`}>
            {assignment?.status || "PENDING"}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            📅 Due: {formatDate(assignment?.deadline)}
          </span>
          {isPastDeadline && !allowLate && (
            <span className="premium-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
              🔒 Closed
            </span>
          )}
          {isPastDeadline && allowLate && (
            <span className="premium-badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}>
              ⏰ Late Allowed
            </span>
          )}
        </div>

        <div className={styles.content}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '12px', color: 'var(--text-primary)' }}>Assignment Description</h2>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
            {assignment?.description || "No description available yet."}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/student/assignments" className={styles.backBtn}>
            ← Back to List
          </Link>

          {assignment?.status === 'SUBMITTED' ? (
             <div style={{ padding: '10px 16px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', borderRadius: 'var(--radius-md)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✓</span> Already Submitted
            </div>
          ) : isPastDeadline && !allowLate ? (
            <div style={{ padding: '10px 16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔒</span> Submissions Closed
            </div>
          ) : isPastDeadline && allowLate ? (
            <Link 
              to="/student/assignment-submission" 
              state={{ assignment }} 
              className={styles.submitBtn}
              style={{ background: '#f59e0b', color: '#fff', borderColor: '#d97706' }}
            >
              Submit Late Assignment →
            </Link>
          ) : (
            <Link 
              to="/student/assignment-submission" 
              state={{ assignment }} 
              className={styles.submitBtn}
            >
              Submit Assignment →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default AssignmentDetails;