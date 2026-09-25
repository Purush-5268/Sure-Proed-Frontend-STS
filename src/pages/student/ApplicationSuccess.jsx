import { Link, useLocation } from "react-router-dom";
import styles from "./ApplicationSuccess.module.css";

function ApplicationSuccess() {
  const { state } = useLocation();
  const application = state?.application || {};
  const cohort = state?.cohort || application.cohort_details || application.cohort || {};
  const course = state?.course || application.course_details || {};
  const courseName = course.name || application.course_name || application.course_title || "Selected course";
  const cohortName = cohort.name || cohort.code || application.cohort_name || "Selected cohort";
  const status = application.status || "APPLIED";
  const appliedDate = application.applied_at ? new Date(application.applied_at).toLocaleDateString() : "Today";
  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.icon}>✅</div>

        <h1>Application Submitted Successfully</h1>

        <p>Your application has been recorded. We will notify you when the next step is ready.</p>

        <div className={styles.infoBox}>
          <p><strong>Course:</strong> {courseName}</p>
          <p><strong>Cohort:</strong> {cohortName}</p>
          <p><strong>Status:</strong> {status.replace(/_/g, " ")}</p>
          <p><strong>Application date:</strong> {appliedDate}</p>
        </div>

        <div className={styles.infoBox}>
          <h3>Next Steps</h3>

          <ul>
            <li>Wait for screening exam notification.</li>
            <li>Complete the screening examination.</li>
            <li>If qualified, you will be assigned to a cohort.</li>
          </ul>
        </div>

        <Link to="/student/applications" className={styles.primaryBtn}>
          Go to My Applications
        </Link>

      </div>
    </div>
  );
}

export default ApplicationSuccess;