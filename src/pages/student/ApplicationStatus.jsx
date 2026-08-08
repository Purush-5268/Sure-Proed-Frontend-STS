import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import styles from "./ApplicationStatus.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
function ApplicationStatus() {
  const location = useLocation();
  const { user } = useAuth();

  const [isExisting, setIsExisting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const application = location.state?.application;
  const navStatus = location.state?.status;

  useEffect(() => {
    async function checkProfile() {
      if (user?.email) {
        const profile = await studentService.getProfile(user.email);
        if (profile?.isExistingStudent === "yes" || profile?.isExistingStudent === true) {
          setIsExisting(true);
        }
      }
      setIsLoading(false);
    }
    checkProfile();
  }, [user]);

  // If navigated directly from profile OR backend confirms they are existing
  const isPendingVerification = isExisting || navStatus === "PENDING_VERIFICATION";

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className={styles.statusPage}>
        <div className={styles.statusCard} style={{ textAlign: "center" }}>
          <SkeletonLoader variant="detail" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.statusPage}>
      <div className={styles.statusCard}>
        <h1>{isPendingVerification ? "Verification Status" : "Application Status"}</h1>

        <p className={styles.subtitle}>
          {isPendingVerification
            ? "Track the status of your existing student verification."
            : "Track the current status of your internship application."}
        </p>

        <div className={styles.details}>
          {isPendingVerification && !application ? (
            <>
              <div className={styles.row}>
                <strong>Request Type</strong>
                <span>Existing Student Profile Verification</span>
              </div>
              <div className={styles.row}>
                <strong>Submission Date</strong>
                <span>{formatDate(new Date())}</span>
              </div>
              <div className={styles.row}>
                <strong>Current Status</strong>
                <span className="premium-badge premium-badge-pending">AWAITING ADMIN REVIEW</span>
              </div>
            </>
          ) : (
            <>
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
                <span className="premium-badge premium-badge-pending">{application?.status || "PENDING"}</span>
              </div>
            </>
          )}
        </div>

        {isPendingVerification ? (
          <div className={styles.timeline}>
            <div className={styles.completed}>✓ Verification Data Submitted</div>
            <div className="premium-badge premium-badge-active">⏳ Admin Verification Pending</div>
            <div>Cohort Assignment</div>
            <div>Internship Begins</div>
          </div>
        ) : (
          <div className={styles.timeline}>
            <div className={styles.completed}>✓ Application Submitted</div>
            <div className="premium-badge premium-badge-active">⏳ Screening Exam Pending</div>
            <div>Qualification Result</div>
            <div>Cohort Assignment</div>
            <div>Internship Begins</div>
          </div>
        )}

        {!isPendingVerification && (
          <Link to="/student/exam-instructions" className={styles.examButton}>
            Start Screening Exam
          </Link>
        )}

        <Link to="/student/cohort" className={styles.button}>
          Continue to My Cohort →
        </Link>

        <Link to="/student/applications" className={styles.button} style={{ marginLeft: "10px", backgroundcolor: "var(--text-muted)" }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default ApplicationStatus;