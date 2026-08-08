import { useState } from "react";
import { certificateService } from "../../services/certificateService";
import styles from "./CertificateVerify.module.css";

function CertificateVerify() {
  const [certId, setCertId] = useState("");
  const [certResult, setCertResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    if (!certId.trim()) {
      setError("Please enter a certificate number or code.");
      return;
    }

    setLoading(true);
    setError("");
    setCertResult(null);

    try {
      const data = await certificateService.verifyCertificate(certId.trim());
      setCertResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Certificate verification failed or the provided ID is invalid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Certificate Verification</h1>

        <p className={styles.subtitle}>
          Enter the certificate number or code to verify it against the backend database.
        </p>

        <div className={styles.form}>
          <input
            type="text" className="premium-input" placeholder="Enter Certificate Number or Code"
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
          />

          <button type="button" className={styles.verifyBtn} onClick={handleVerify} disabled={loading}>
            {loading ? "Verifying..." : "Verify"}
          </button>
        </div>

        {error && <div style={{ color: "red", marginTop: "1rem", fontWeight: "600" }}>❌ {error}</div>}

        {certResult && (
          <div className={styles.result}>
            <h2 className={styles.verified}>✅ Certificate Verified</h2>

            <div className={styles.details}>
              <div className={styles.row}>
                <strong>Student</strong>
                <span>{certResult.student_name || certResult.student || "N/A"}</span>
              </div>

              <div className={styles.row}>
                <strong>Course</strong>
                <span>{certResult.course_name || certResult.course_title || certResult.course || "N/A"}</span>
              </div>

              <div className={styles.row}>
                <strong>Certificate #</strong>
                <span>{certResult.certificate_number || certResult.id || certId}</span>
              </div>

              <div className={styles.row}>
                <strong>Status</strong>
                <span className="premium-badge premium-badge-active">{certResult.verified ? "Valid" : "Invalid"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CertificateVerify;