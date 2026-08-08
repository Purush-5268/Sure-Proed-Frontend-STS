import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./MyCohort.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function MyCohort() {
  const [cohort, setCohort] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadCohort = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COHORTS.BASE);
        const list = Array.isArray(response.data) ? response.data : [];
        if (isMounted) setCohort(list[0] || null);
      } catch (err) {
        console.error("Failed to load student cohort:", err);
        if (isMounted) setCohort(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCohort();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>My Internship Cohort</h1>

        <p className={styles.subtitle}>
          Your cohort details are pulled from the backend database.
        </p>

        {loading ? (
          <SkeletonLoader variant="detail" />
        ) : !cohort ? (
          <p>No cohort has been assigned to you yet. An admin or mentor will create one soon.</p>
        ) : (
          <>
            <div className={styles.infoGrid}>
              <div className={styles.infoBox}>
                <h3>Cohort Name</h3>
                <p>{cohort.name}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>Status</h3>
                <span className="premium-badge premium-badge-active">{cohort.status || "DRAFT"}</span>
              </div>

              <div className={styles.infoBox}>
                <h3>Start Date</h3>
                <p>{cohort.start_date || "N/A"}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>End Date</h3>
                <p>{cohort.end_date || "N/A"}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>Course</h3>
                <p>{cohort.course?.name || cohort.course || "N/A"}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>Meeting Link</h3>
                <p>{cohort.meeting_link || "Not available yet"}</p>
              </div>
            </div>

            <div className={styles.buttons}>
              <Link to="/student/class-schedule" className={styles.button}>
                View Class Schedule
              </Link>
              <Link to="/student/mentor-details" className={styles.button}>
                Mentor Details
              </Link>
              {cohort.meeting_link ? (
                <a href={cohort.meeting_link} target="_blank" rel="noreferrer" className={styles.meetButton}>
                  Join Meeting
                </a>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MyCohort;