import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./ApplicationDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ApplicationDetails() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadApplication = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BY_ID(id));
        setApplication(response.data || null);
      } catch (err) {
        console.error("Failed to load application details:", err);
        setError("Unable to load application details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadApplication();
    }
  }, [id]);

  if (loading) return <div className={styles.container}><div className="premium-card"><h1>Application Details</h1><SkeletonLoader variant="detail" /></div></div>;
  if (error) return <div className={styles.container}><div className="premium-card"><h1>Application Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
  if (!application) return <div className={styles.container}><div className="premium-card"><h1>Application Details</h1><p>No application found.</p></div></div>;

  const user = application.student?.user || {};
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Unknown";

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.header}>
          <h1>Application Details</h1>
          <Link to="/admin/applications">Back</Link>
        </div>

        <div className={styles.grid}>
          <div>
            <label>Student Name</label>
            <p>{fullName}</p>
          </div>

          <div>
            <label>Email</label>
            <p>{user.email || "N/A"}</p>
          </div>

          <div>
            <label>Phone</label>
            <p>{user.phone_number || "N/A"}</p>
          </div>

          <div>
            <label>Course</label>
            <p>{application.course?.name || "N/A"}</p>
          </div>

          <div>
            <label>Application Number</label>
            <p>{application.application_number || "N/A"}</p>
          </div>

          <div>
            <label>Applied On</label>
            <p>{application.applied_at ? new Date(application.applied_at).toLocaleDateString() : "N/A"}</p>
          </div>

          <div>
            <label>Status</label>
            <span className={application.status === "REJECTED" ? styles.rejected : application.status === "QUALIFIED" || application.status === "COHORT_ASSIGNED" ? styles.approved : styles.pending}>
              {application.status || "PENDING"}
            </span>
          </div>

          <div>
            <label>Remarks</label>
            <p>{application.remarks || "No remarks provided."}</p>
          </div>
        </div>

        <div className={styles.buttons}>
          <Link to={`/admin/approve-application/${application.id}`}>Approve</Link>
          <Link to={`/admin/reject-application/${application.id}`}>Reject</Link>
        </div>
      </div>
    </div>
  );
}

export default ApplicationDetails;