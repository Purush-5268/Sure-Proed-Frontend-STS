import { Link, useLocation } from "react-router-dom";
import { certificateService } from "../../services/certificateService";
import styles from "./CertificateVerify.module.css";

function CertificateView() {
  const location = useLocation();
  const certificate = location.state?.certificate;

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h1 style={{ margin: 0 }}>Certificate Details</h1>
          <Link to="/student/certificates" className="premium-btn premium-btn-secondary" style={{ textDecoration: "none", fontSize: "14px" }}>
            ← Back to List
          </Link>
        </div>

        <p className={styles.subtitle}>
          This certificate is officially issued, authentic, and securely stored in the SureTrust platform.
        </p>

        {!certificate ? (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <p>No certificate was selected.</p>
            <Link to="/student/certificates" className="premium-btn premium-btn-primary">
              Go to My Certificates
            </Link>
          </div>
        ) : (
          <div className={styles.result}>
            <h2 className={styles.verified}>✅ Certificate Verified & Active</h2>

            <div className={styles.details}>
              <div className={styles.row}>
                <strong>Recipient Name</strong>
                <span style={{ fontWeight: 600 }}>{certificate.recipient_display || certificate.recipient_name || "Valued Student"}</span>
              </div>

              <div className={styles.row}>
                <strong>Course / Subject</strong>
                <span style={{ fontWeight: 600 }}>{certificate.subject_display || certificate.title || "Course"}</span>
              </div>

              <div className={styles.row}>
                <strong>Certificate Number</strong>
                <span><code>{certificate.certificate_number || certificate.id}</code></span>
              </div>

              <div className={styles.row}>
                <strong>Verification Code</strong>
                <span><code>{certificate.verification_code}</code></span>
              </div>

              <div className={styles.row}>
                <strong>Certificate Type</strong>
                <span>{certificate.certificate_type_display || certificate.certificate_type || "Course Completion"}</span>
              </div>

              <div className={styles.row}>
                <strong>Issue Date</strong>
                <span>{formatDate(certificate.issued_at)}</span>
              </div>

              <div className={styles.row}>
                <strong>Status</strong>
                <span className="premium-badge premium-badge-active">{certificate.status || "ACTIVE"}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => certificateService.downloadCertificate(certificate)}
                className="premium-btn premium-btn-primary"
                style={{ padding: "10px 20px", cursor: "pointer", border: "none" }}
              >
                📥 Download Official PDF
              </button>

              {certificate.verification_code && (
                <Link
                  to={`/certificate/verify/${certificate.verification_code}`}
                  className="premium-btn premium-btn-secondary"
                  style={{ textDecoration: "none", padding: "10px 20px" }}
                >
                  🔍 Public Verification Page
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CertificateView;