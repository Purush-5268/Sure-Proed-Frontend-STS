import { Link, useLocation } from "react-router-dom";
import styles from "./CertificateAdminDetails.module.css";

function CertificateAdminDetails() {
  const location = useLocation();
  const cert = location.state?.certificate;

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (!cert) {
    return (
      <div className={styles.container}>
        <div className="premium-card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h2>No Certificate Selected</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            Please select a certificate from the management list to view its full details.
          </p>
          <Link to="/admin/certificates" className="premium-btn premium-btn-primary">
            Back to Certificates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.header}>
          <div>
            <h1>Certificate Details</h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
              Official verification and issuance record
            </p>
          </div>

          <Link to="/admin/certificates">Back</Link>
        </div>

        <div className={styles.grid}>
          <div>
            <label>Recipient</label>
            <p style={{ fontWeight: 600, fontSize: "16px" }}>{cert.recipient_display || cert.recipient_name || "N/A"}</p>
          </div>

          <div>
            <label>Course / Subject</label>
            <p style={{ fontWeight: 600, fontSize: "16px" }}>{cert.subject_display || cert.title || "N/A"}</p>
          </div>

          <div>
            <label>Certificate Number</label>
            <p><code>{cert.certificate_number}</code></p>
          </div>

          <div>
            <label>Verification Code</label>
            <p><code>{cert.verification_code}</code></p>
          </div>

          <div>
            <label>Certificate Type</label>
            <p>{cert.certificate_type_display || cert.certificate_type || "COURSE"}</p>
          </div>

          <div>
            <label>Issue Date</label>
            <p>{formatDate(cert.issued_at)}</p>
          </div>

          <div>
            <label>Status</label>
            <span className={cert.status === "ACTIVE" ? styles.issued : styles.pending}>
              {cert.status || "ACTIVE"}
            </span>
          </div>

          {cert.revocation_reason && (
            <div>
              <label>Revocation Reason</label>
              <p style={{ color: "#dc2626" }}>{cert.revocation_reason}</p>
            </div>
          )}
        </div>

        <div className={styles.buttons} style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          {cert.download_url && (
            <a
              href={cert.download_url}
              target="_blank"
              rel="noreferrer"
              className="premium-btn premium-btn-primary"
              style={{ textDecoration: "none", padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              📥 Download Certificate PDF
            </a>
          )}

          <Link
            to="/admin/edit-certificate"
            state={{ certificate: cert }}
            className="premium-btn premium-btn-secondary"
            style={{ textDecoration: "none", padding: "10px 20px" }}
          >
            Edit Status
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CertificateAdminDetails;