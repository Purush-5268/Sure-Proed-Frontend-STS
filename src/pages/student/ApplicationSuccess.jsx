import { Link } from "react-router-dom";
import styles from "./ApplicationSuccess.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ApplicationSuccess() {
  return (
    <div className={styles.successPage}>
      <div className={styles.successCard}>

        <div className={styles.icon}>✅</div>

        <h1>Application Submitted Successfully</h1>

        <p>
          Your application has been submitted successfully.
          Your screening examination will be scheduled shortly.
        </p>

        <div className={styles.infoBox}>
          <h3>Next Steps</h3>

          <ul>
            <li>Wait for screening exam notification.</li>
            <li>Complete the screening examination.</li>
            <li>If qualified, you will be assigned to a cohort.</li>
          </ul>
        </div>

        <Link
          to="/student/applications"
          className={styles.button}
        >
          Go to My Applications
        </Link>

      </div>
    </div>
  );
}

export default ApplicationSuccess;