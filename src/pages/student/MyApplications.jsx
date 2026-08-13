import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applicationService } from "../../services/applicationService";
import styles from "./MyApplications.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadApplications = async () => {
      try {
        const apps = await applicationService.getApplications();
        if (isMounted) setApplications(apps);
      } catch (err) {
        console.error("Failed to load applications:", err);
        if (isMounted) setApplications([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadApplications();
    return () => {
      isMounted = false;
    };
  }, []);

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
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>My Applications</h1>

          <p>Track your internship applications and current application status.</p>
        </div>

        {loading ? (
          <SkeletonLoader variant="table" rows={4} />
        ) : applications.length === 0 ? (
          <p>No applications have been submitted yet.</p>
        ) : (
          applications.map((app) => (
            <div key={app.id} className="premium-card">
              <div className={styles.row}>
                <strong>Application Number</strong>
                <span>{app.application_number || app.id}</span>
              </div>

              <div className={styles.row}>
                <strong>Course</strong>
                <span>{app.course?.name || "N/A"}</span>
              </div>

              <div className={styles.row}>
                <strong>Status</strong>
                <span className={styles.status}>{app.status || "PENDING"}</span>
              </div>

              <div className={styles.row}>
                <strong>Applied On</strong>
                <span>{formatDate(app.applied_at)}</span>
              </div>

              <Link to="/student/application-status" state={{ application: app }} className={styles.button}>
                View Status
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MyApplications;