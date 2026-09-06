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

  // If no assignment is passed, redirect back
  if (!assignment) {
    navigate("/student/assignments");
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await assignmentService.createSubmission({
        assignment: assignment.id,
        submission_url: repoUrl,
        submission_text: comments,
        // Optional file handling could be added here if the backend supports file endpoints
      });

      alert("Assignment Submitted Successfully ✅");
      navigate("/student/assignments");
    } catch (error) {
      console.error("Submission failed:", error);
      alert(error?.response?.data?.detail || "Failed to submit assignment. Please try again.");
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

        <form className={styles.form} onSubmit={handleSubmit}>
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
            >
              {isSubmitting ? "Submitting..." : "Submit Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AssignmentSubmission;