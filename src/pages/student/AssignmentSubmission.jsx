import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { assignmentService } from "../../services/assignmentService";
import styles from "./AssignmentSubmission.module.css";

function AssignmentSubmission() {
  const navigate = useNavigate();
  const location = useLocation();
  const assignment = location.state?.assignment;
  
  const [repoUrl, setRepoUrl] = useState("");
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successData, setSuccessData] = useState(null);

  const isPastDeadline = assignment?.deadline ? new Date() > new Date(assignment.deadline) : false;
  const allowLate = assignment?.allow_late_submissions;
  const isClosed = isPastDeadline && !allowLate;

  // If no assignment is passed, redirect back
  if (!assignment) {
    navigate("/student/assignments");
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    
    if (isClosed) {
      setErrorMsg("Submissions are closed for this assignment.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await assignmentService.createSubmission({
        assignment: assignment.id,
        submission_url: repoUrl,
        submission_text: comments,
      });

      // The backend will return is_late in the response
      setSuccessData({
        isLate: response.is_late
      });
      
      // Auto redirect after a short delay
      setTimeout(() => {
        navigate("/student/assignments");
      }, 2500);

    } catch (error) {
      console.error("Submission failed:", error);
      if (error?.response?.status === 400 && error?.response?.data?.detail) {
        setErrorMsg(error.response.data.detail);
      } else {
        setErrorMsg(error?.response?.data?.detail || "Failed to submit assignment. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card} style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px' }}>Submit Assignment: {assignment.title}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Please provide your GitHub repository link and any comments before submitting.
        </p>

        {successData ? (
          <div style={{ padding: '24px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#059669', marginBottom: '8px' }}>Assignment submitted successfully</h2>
            {successData.isLate && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', borderRadius: '20px', fontWeight: 600, marginTop: '12px' }}>
                <span>⏰</span> Late Submission: Your assignment was submitted after the deadline.
              </div>
            )}
          </div>
        ) : isClosed ? (
          <div style={{ padding: '32px 24px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <h2 style={{ color: '#ef4444', marginBottom: '8px' }}>Submissions Closed</h2>
            <p style={{ color: 'var(--text-secondary)' }}>The deadline has passed and late submissions are not allowed.</p>
            <button
              type="button"
              className={styles.submitBtn}
              style={{ background: 'var(--bg-nested)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', marginTop: '24px' }}
              onClick={() => navigate(-1)}
            >
              Go Back
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {errorMsg && (
              <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', marginBottom: '24px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>⚠️</span> {errorMsg}
              </div>
            )}
            {isPastDeadline && allowLate && !errorMsg && (
              <div style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', borderRadius: 'var(--radius-md)', marginBottom: '24px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>⏰</span> The deadline has passed, but late submissions are allowed.
              </div>
            )}
            
            {/* Note: The backend models files as a JSON field, so we just collect repo URL and comments for now. */}
            <div className={styles.inputGroup}>
              <label htmlFor="repo-url">GitHub Repository Link <span style={{ color: 'red' }}>*</span></label>
              <input
                id="repo-url"
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/project"
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="submission-comments">Comments (Optional)</label>
              <textarea
                id="submission-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows="5"
                placeholder="Write any notes for your mentor or instructor..."
              ></textarea>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                type="button"
                className={styles.submitBtn}
                style={{ background: 'var(--bg-nested)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                onClick={() => navigate(-1)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={isSubmitting || !repoUrl.trim()}
                style={isPastDeadline && allowLate ? { background: '#f59e0b', color: '#fff' } : {}}
              >
                {isSubmitting ? "Submitting..." : (isPastDeadline && allowLate ? "Submit Late Assignment" : "Submit Assignment")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default AssignmentSubmission;