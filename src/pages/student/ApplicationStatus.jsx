import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import styles from "./ApplicationStatus.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
function ApplicationStatus() {
  const location = useLocation();
  const { user } = useAuth();

  const application = location.state?.application;
  
  // We no longer mix offer-letter verification logic here. 
  // It is parked as a FINAL TODO in the backend.

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };



  return (
    <div className={styles.statusPage}>
      <div className={styles.statusCard}>
        <h1>Application Status</h1>

        <p className={styles.subtitle}>
          Track the current status of your internship application.
        </p>

        <div className={styles.details}>
          <div className={styles.row}>
            <strong>Application Number</strong>
            <span>{application?.application_number || application?.id || "N/A"}</span>
          </div>
          <div className={styles.row}>
            <strong>Course</strong>
            <span>{application?.course?.name || "N/A"}</span>
          </div>
          <div className={styles.row}>
            <strong>Applied Date</strong>
            <span>{formatDate(application?.applied_at)}</span>
          </div>
          <div className={styles.row}>
            <strong>Current Status</strong>
            <span className="premium-badge premium-badge-pending">{application?.status || "Status unavailable"}</span>
          </div>
        </div>

          <div className={styles.timeline}>
            <div className={styles.completed}>✓ Application Submitted</div>
            
            {["EXAM_PENDING", "APPLIED"].includes(application?.status) ? (
              <div className="premium-badge premium-badge-active">⏳ Screening Exam Pending</div>
            ) : (
              <div className={styles.completed}>✓ Screening Exam Completed</div>
            )}
            
            {["QUALIFIED", "COHORT_ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(application?.status) ? (
              <div className={styles.completed}>✓ Qualification Passed</div>
            ) : application?.status === "REJECTED" ? (
              <div className="premium-badge" style={{ backgroundColor: 'var(--danger-color)' }}>✗ Application Rejected</div>
            ) : application?.status === "WAITLISTED" ? (
              <div className="premium-badge premium-badge-pending">⏳ Waitlisted</div>
            ) : (
              <div>Qualification Result</div>
            )}
            
            {["COHORT_ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(application?.status) ? (
              <div className={styles.completed}>✓ Cohort Assigned</div>
            ) : (
              <div>Cohort Assignment</div>
            )}
            
            {["IN_PROGRESS", "COMPLETED"].includes(application?.status) ? (
              <div className={styles.completed}>✓ Internship Began</div>
            ) : (
              <div>Internship Begins</div>
            )}
          </div>

        {["EXAM_PENDING", "APPLIED"].includes(application?.status) && (
          <Link to="/student/exam-instructions" className={styles.examButton}>
            Start Screening Exam
          </Link>
        )}

        {["COHORT_ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(application?.status) && (
          <Link to="/student/cohort" className={styles.button}>
            Continue to My Cohort →
          </Link>
        )}

        <Link to="/student/applications" className={styles.button} style={{ marginLeft: "10px", backgroundcolor: "var(--text-muted)" }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default ApplicationStatus;