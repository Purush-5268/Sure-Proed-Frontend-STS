import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./RejectApplication.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function RejectApplication() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadApplication = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BY_ID(id));
        setApplication(response.data || null);
      } catch (err) {
        console.error("Failed to load application:", err);
        setError("Unable to load application details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadApplication();
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await apiClient.patch(API_ENDPOINTS.APPLICATIONS.BY_ID(id), {
        status: "REJECTED",
        remarks: reason.trim() || "Application rejected by admin.",
      });
      navigate("/admin/applications");
    } catch (err) {
      console.error("Rejection failed:", err);
      setError("Unable to reject this application.");
    }
  };

  if (loading) return <div className={styles.container}><div className="premium-card"><h1>Reject Application</h1><SkeletonLoader variant="form" rows={4} /></div></div>;
  if (error) return <div className={styles.container}><div className="premium-card"><h1>Reject Application</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
  if (!application) return <div className={styles.container}><div className="premium-card"><h1>Reject Application</h1><p>No application found.</p></div></div>;

  const user = application.student?.user || {};
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Unknown";

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <h1>Reject Application</h1>

        <form onSubmit={handleSubmit}>
          <div className={styles.info}>
            <p><strong>Student:</strong> {fullName}</p>
            <p><strong>Course:</strong> {application.course?.name || "N/A"}</p>
            <p><strong>Application #:</strong> {application.application_number || "N/A"}</p>
          </div>

          <label>Rejection Reason</label>
          <textarea
            rows="6"
            placeholder="Enter rejection reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />

          <div className={styles.buttons}>
            <button type="submit" disabled={loading}>{loading ? "Saving..." : "Reject Application"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RejectApplication;