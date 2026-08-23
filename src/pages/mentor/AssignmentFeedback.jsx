import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./AssignmentFeedback.module.css";
import { FiFileText, FiCheckCircle, FiClock, FiArrowLeft, FiAlertCircle, FiX, FiExternalLink } from "react-icons/fi";

function AssignmentFeedback() {
  const { id } = useParams(); // Assignment ID
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({ marks_obtained: "", feedback: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [assignRes, subRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BY_ID(id)),
          apiClient.get(API_ENDPOINTS.SUBMISSIONS.BASE, { params: { assignment: id } })
        ]);

        if (isMounted) {
          setAssignment(assignRes.data);
          let subs = Array.isArray(subRes.data?.results) ? subRes.data.results : (Array.isArray(subRes.data) ? subRes.data : []);
          setSubmissions(subs);
        }
      } catch (err) {
        console.error("Failed to load assignment data:", err);
        if (isMounted) setError("Failed to load submissions. You may not have permission to view this assignment.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [id]);

  const handleOpenGrade = (sub) => {
    setSelectedSubmission(sub);
    setFeedbackForm({
      marks_obtained: sub.marks_obtained ?? "",
      feedback: sub.feedback || "",
    });
  };

  const handleCloseGrade = () => {
    setSelectedSubmission(null);
    setFeedbackForm({ marks_obtained: "", feedback: "" });
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    setSubmitting(true);
    try {
      const res = await apiClient.patch(API_ENDPOINTS.SUBMISSIONS.BY_ID(selectedSubmission.id), {
        marks_obtained: feedbackForm.marks_obtained !== "" ? Number(feedbackForm.marks_obtained) : null,
        feedback: feedbackForm.feedback,
        evaluated: true,
      });

      // Update the submission list with the new data
      setSubmissions(prev => prev.map(s => s.id === selectedSubmission.id ? res.data : s));
      handleCloseGrade();
      // Also refetch assignment to update counts could be done here, but local is fine.
    } catch (err) {
      alert("Failed to submit feedback. " + (err.response?.data?.detail || ""));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (sub) => {
    if (sub.evaluated) {
      return sub.passed ? <Badge variant="success">Passed</Badge> : <Badge variant="error">Failed</Badge>;
    }
    return <Badge variant="warning">Needs Grading</Badge>;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Review Submissions" description="Loading assignments..." />
        <SkeletonLoader width="100%" height="400px" borderRadius="12px" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className={styles.container}>
        <PageHeader title="Review Submissions" />
        <EmptyState 
          icon={<FiAlertCircle />} 
          title="Not Found" 
          description={error || "The requested assignment could not be loaded."}
          action={<Link to="/mentor/assignments" className="premium-btn">Return to Assignments</Link>}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div style={{ marginBottom: "24px" }}>
        <Link to="/mentor/assignments" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500" }}>
          <FiArrowLeft /> Back to Assignments
        </Link>
      </div>

      <PageHeader 
        title={`Review: ${assignment.title}`} 
        description={`Max Marks: ${assignment.max_marks || 'N/A'} | Passing: ${assignment.pass_percentage || 'N/A'}%`}
      />

      {submissions.length === 0 ? (
        <EmptyState 
          icon={<FiFileText />}
          title="No Submissions Yet"
          description="No students have submitted this assignment."
        />
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Submitted On</th>
                <th>Status</th>
                <th>Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr key={sub.id}>
                  <td style={{ fontWeight: "500", color: "var(--text-primary)" }}>
                    {sub.student?.user?.first_name} {sub.student?.user?.last_name}
                  </td>
                  <td>{new Date(sub.submitted_at).toLocaleString()} {sub.is_late && <span style={{color: 'var(--error-color)', fontSize: '12px', fontWeight: 'bold'}}>(LATE)</span>}</td>
                  <td>{getStatusBadge(sub)}</td>
                  <td style={{ fontWeight: "bold" }}>
                    {sub.evaluated ? `${sub.marks_obtained} / ${assignment.max_marks}` : "-"}
                  </td>
                  <td>
                    <button 
                      onClick={() => handleOpenGrade(sub)}
                      className="premium-btn premium-btn-small"
                      style={{ background: "var(--primary-color)", color: "white" }}
                    >
                      {sub.evaluated ? "Edit Grade" : "Grade"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {selectedSubmission && (
          <div className={styles.modalOverlay}>
            <motion.div 
              className={styles.modalContent}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <div className={styles.modalHeader}>
                <h2>Grade Submission</h2>
                <button onClick={handleCloseGrade} className={styles.closeBtn}><FiX /></button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ marginBottom: "20px", background: "var(--bg-nested)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "8px", color: "var(--text-primary)" }}>
                    {selectedSubmission.student?.user?.first_name} {selectedSubmission.student?.user?.last_name}
                  </div>
                  {selectedSubmission.submission_url && (
                    <a href={selectedSubmission.submission_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--primary-color)", textDecoration: "none", fontWeight: "500" }}>
                      <FiExternalLink /> View Submission Link
                    </a>
                  )}
                  {selectedSubmission.commit_sha && (
                    <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      Commit: {selectedSubmission.commit_sha}
                    </div>
                  )}
                </div>

                <form onSubmit={handleGradeSubmit}>
                  <div className="premium-form-group">
                    <label className="premium-label">Marks Obtained (Max: {assignment.max_marks})</label>
                    <input 
                      type="number" 
                      className="premium-input" 
                      min="0"
                      max={assignment.max_marks}
                      required
                      value={feedbackForm.marks_obtained}
                      onChange={(e) => setFeedbackForm({...feedbackForm, marks_obtained: e.target.value})}
                    />
                  </div>
                  <div className="premium-form-group">
                    <label className="premium-label">Feedback</label>
                    <textarea 
                      className="premium-input" 
                      rows="4"
                      required
                      value={feedbackForm.feedback}
                      onChange={(e) => setFeedbackForm({...feedbackForm, feedback: e.target.value})}
                      placeholder="Provide constructive feedback..."
                    ></textarea>
                  </div>
                  
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px", justifyContent: "flex-end" }}>
                    <button type="button" onClick={handleCloseGrade} className="premium-btn premium-btn-outline">Cancel</button>
                    <button type="submit" disabled={submitting} className="premium-btn">
                      {submitting ? "Saving..." : "Submit Grade"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default AssignmentFeedback;