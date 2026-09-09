import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { certificateService } from "../../services/certificateService";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./CertificatesAdmin.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CertificatesAdmin() {
  const [certificates, setCertificates] = useState([]);
  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const loadData = async () => {
    try {
      const [certsData, studentsData, applicationsData] = await Promise.all([
        fetchAllPages(API_ENDPOINTS.CERTIFICATES.BASE).catch(() => []),
        fetchAllPages(API_ENDPOINTS.STUDENTS.BASE).catch(() => []),
        fetchAllPages(API_ENDPOINTS.APPLICATIONS.BASE).catch(() => []),
      ]);

      setCertificates(Array.isArray(certsData) ? certsData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setApplications(Array.isArray(applicationsData) ? applicationsData : []);
    } catch (err) {
      console.error("Failed to load certificates:", err);
      setCertificates([]);
      setStudents([]);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStudentName = (certificate) => {
    if (certificate.recipient_display) return certificate.recipient_display;
    const student = students.find((item) => String(item.id) === String(certificate.student));
    if (student) {
      return `${student.user?.first_name || ""} ${student.user?.last_name || ""}`.trim() || student.user?.email || student.student_code;
    }
    return certificate.recipient_name || "Unknown Student";
  };

  const getCourseName = (certificate) => {
    if (certificate.subject_display) return certificate.subject_display;
    const application = applications.find((item) => String(item.id) === String(certificate.application));
    return application?.course_title || application?.course_name || application?.course?.name || certificate.title || "Internship Course";
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleToggleStatus = async (certificate) => {
    const nextStatus = certificate.status === "ACTIVE" ? "REVOKED" : "ACTIVE";
    const confirmMessage = nextStatus === "REVOKED" 
      ? `Are you sure you want to REVOKE certificate ${certificate.certificate_number}?`
      : `Reactivate certificate ${certificate.certificate_number}?`;

    if (!window.confirm(confirmMessage)) return;

    setActionLoading(certificate.id);
    try {
      await apiClient.patch(API_ENDPOINTS.CERTIFICATES.BY_ID(certificate.id), {
        status: nextStatus,
        revocation_reason: nextStatus === "REVOKED" ? "Revoked by Administrator" : null,
      });
      await loadData();
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update certificate status.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Certificate Management</h1>
          <p>Issue, verify, and manage official student certificates</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => { setLoading(true); loadData(); }}
            className="premium-btn premium-btn-secondary"
            style={{ fontSize: "14px", padding: "8px 14px" }}
          >
            🔄 Refresh
          </button>
          <Link to="/admin/add-certificate" className={styles.addBtn}>
            + Issue Certificate
          </Link>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : certificates.length === 0 ? (
        <div className="premium-empty-state" style={{ textAlign: "center", padding: "50px 20px" }}>
          <div className="premium-empty-state-icon" style={{ fontSize: "48px", marginBottom: "16px" }}>🎓</div>
          <h3>No Certificates Issued Yet</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            Click "Issue Certificate" above to issue a verified completion certificate for any student.
          </p>
          <Link to="/admin/add-certificate" className="premium-btn premium-btn-primary">
            + Issue First Certificate
          </Link>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Certificate #</th>
                <th>Recipient</th>
                <th>Course / Subject</th>
                <th>Type</th>
                <th>Issued Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td style={{ fontWeight: 600 }}>
                    <code>{certificate.certificate_number}</code>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Code: {certificate.verification_code}
                    </div>
                  </td>
                  <td>{getStudentName(certificate)}</td>
                  <td>{getCourseName(certificate)}</td>
                  <td>
                    <span style={{ fontSize: "12px", background: "rgba(37, 99, 235, 0.1)", color: "#2563eb", padding: "3px 8px", borderRadius: "6px" }}>
                      {certificate.certificate_type_display || certificate.certificate_type || "COURSE"}
                    </span>
                  </td>
                  <td>{formatDate(certificate.issued_at)}</td>

                  <td>
                    <span className={certificate.status === "ACTIVE" ? styles.issued : styles.pending}>
                      {certificate.status || "ACTIVE"}
                    </span>
                  </td>

                  <td className="actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Link
                      to="/admin/certificate-admin-details"
                      state={{ certificate }}
                      style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                    >
                      View
                    </Link>

                    <button
                      type="button"
                      onClick={() => certificateService.downloadCertificate(certificate)}
                      style={{ background: "none", border: "none", padding: 0, fontSize: "13px", color: "#16a34a", cursor: "pointer", fontWeight: 600 }}
                      title="Download Certificate PDF"
                    >
                      PDF 📥
                    </button>

                    <Link
                      to="/admin/edit-certificate"
                      state={{ certificate }}
                      style={{ fontSize: "13px", color: "var(--text-secondary)", textDecoration: "none" }}
                    >
                      Edit
                    </Link>

                    <button
                      type="button"
                      disabled={actionLoading === certificate.id}
                      onClick={() => handleToggleStatus(certificate)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: "12px",
                        cursor: "pointer",
                        color: certificate.status === "ACTIVE" ? "#dc2626" : "#16a34a",
                        fontWeight: 600,
                      }}
                    >
                      {actionLoading === certificate.id ? "..." : (certificate.status === "ACTIVE" ? "Revoke" : "Activate")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CertificatesAdmin;