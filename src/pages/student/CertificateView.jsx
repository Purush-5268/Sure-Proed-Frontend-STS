import { useLocation } from "react-router-dom";
import styles from "./CertificateVerify.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CertificateView() {
  const location = useLocation();
  const certificate = location.state?.certificate;

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
      <div className="premium-card">
        <h1>Certificate Details</h1>

        <p className={styles.subtitle}>
          This certificate is loaded from the backend database.
        </p>

        {!certificate ? (
          <p>No certificate details were provided.</p>
        ) : (
          <div className={styles.result}>
            <h2 className={styles.verified}>✅ Certificate Available</h2>

            <div className={styles.details}>
              <div className={styles.row}>
                <strong>Certificate ID</strong>
                <span>{certificate.certificate_number || certificate.id}</span>
              </div>

              <div className={styles.row}>
                <strong>Type</strong>
                <span>{certificate.certificate_type || "Certificate"}</span>
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
          </div>
        )}
      </div>
    </div>
  );
}

export default CertificateView;