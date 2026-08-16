import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Applications.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Applications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadApplications = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE);
        if (isMounted) setApplications(normalizeListResponse(response.data));
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <h1 style={{ fontSize: "1.65rem", fontWeight: 700, color: "var(--text-primary)" }}>Application Management</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Manage all student applications</p>
          </div>
        </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : applications.length === 0 ? (
        <p>No applications have been submitted yet.</p>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Company</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td>{application.student?.user?.first_name || application.student?.user?.email || "Unknown"}</td>
                  <td>{application.course?.name || application.course || "N/A"}</td>
                  <td>{application.company?.name || application.company || "N/A"}</td>
                  <td
                    className={
                      application.status === "APPROVED"
                        ? styles.approved
                        : application.status === "REJECTED"
                          ? styles.rejected
                          : styles.pending
                    }
                  >
                    {application.status || "PENDING"}
                  </td>

                  <td className="actions" style={{ display: "flex", gap: "8px" }}>
                    <Link to={`/admin/application-details/${application.id}`}>View</Link>
                    <Link to={`/admin/approve-application/${application.id}`}>Approve</Link>
                    <Link to={`/admin/reject-application/${application.id}`}>Reject</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

export default Applications;