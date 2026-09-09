import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { certificateService } from "../../services/certificateService";
import styles from "./CertificateVerify.module.css";

function CertificateVerify() {
  const { code: urlCode } = useParams();
  const [searchParams] = useSearchParams();
  const queryCode = searchParams.get("code") || searchParams.get("number");

  const [certId, setCertId] = useState(urlCode || queryCode || "");
  const [certResult, setCertResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = useCallback(async (codeToVerify) => {
    const code = (codeToVerify || certId).trim();
    if (!code) {
      setError("Please enter a certificate number or verification code.");
      return;
    }

    setLoading(true);
    setError("");
    setCertResult(null);

    try {
      const data = await certificateService.verifyCertificate(code);
      setCertResult(data);
    } catch (err) {
      console.error("Verification failed:", err);
      const detail = err.response?.data?.message || err.response?.data?.detail || err.response?.data?.error || "Certificate verification failed or the provided code is invalid.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [certId]);

  useEffect(() => {
    const initialCode = urlCode || queryCode;
    if (initialCode) {
      handleVerify(initialCode);
    }
  }, [urlCode, queryCode, handleVerify]);

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
        <h1>Official Certificate Verification</h1>

        <p className={styles.subtitle}>
          Verify the authenticity of credentials and certificates issued by SureTrust & Sure ProEd Platform.
        </p>

        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); handleVerify(); }}>
          <input
            type="text"
            className="premium-input"
            placeholder="Enter Certificate Number (e.g. CERT-2026-001) or Verification Code"
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
          />

          <button type="submit" className={styles.verifyBtn} disabled={loading}>
            {loading ? "Verifying..." : "Verify Certificate"}
          </button>
        </form>

        {error && <div style={{ color: "#dc2626", marginTop: "1rem", fontWeight: "600", padding: "10px", background: "rgba(220, 38, 38, 0.08)", borderRadius: "8px" }}>❌ {error}</div>}

        {certResult && (
          <div className={styles.result}>
            <h2 className={styles.verified}>
              {certResult.verified ? "✅ Valid & Verified Authentic" : "❌ Invalid / Revoked"}
            </h2>

            <div className={styles.details}>
              <div className={styles.row}>
                <strong>Recipient</strong>
                <span style={{ fontWeight: 600 }}>{certResult.recipient_name || certResult.student_name || certResult.student || "N/A"}</span>
              </div>

              <div className={styles.row}>
                <strong>Course / Subject</strong>
                <span style={{ fontWeight: 600 }}>{certResult.title || certResult.course_name || certResult.course_title || "N/A"}</span>
              </div>

              <div className={styles.row}>
                <strong>Certificate Number</strong>
                <span><code>{certResult.certificate_number || certResult.id || certId}</code></span>
              </div>

              <div className={styles.row}>
                <strong>Verification Code</strong>
                <span><code>{certResult.verification_code || "Verified"}</code></span>
              </div>

              {certResult.certificate_type_display && (
                <div className={styles.row}>
                  <strong>Type</strong>
                  <span>{certResult.certificate_type_display}</span>
                </div>
              )}

              {certResult.issued_at && (
                <div className={styles.row}>
                  <strong>Issued On</strong>
                  <span>{formatDate(certResult.issued_at)}</span>
                </div>
              )}

              <div className={styles.row}>
                <strong>Status</strong>
                <span className={`premium-badge ${certResult.verified ? "premium-badge-active" : "premium-badge-revoked"}`}>
                  {certResult.verified ? "ACTIVE / VALID" : "REVOKED / EXPIRED"}
                </span>
              </div>
            </div>

            {certResult.pdf_url && (
              <div style={{ marginTop: "20px", textAlign: "center" }}>
                <a
                  href={certResult.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="premium-btn premium-btn-primary"
                  style={{ textDecoration: "none", padding: "10px 24px", display: "inline-block" }}
                >
                  📥 View Official Certificate PDF
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CertificateVerify;