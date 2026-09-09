import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./EditCertificate.module.css";

function EditCertificate() {
  const location = useLocation();
  const navigate = useNavigate();
  const cert = location.state?.certificate;

  const [form, setForm] = useState({
    title: cert?.title || cert?.subject_display || "",
    status: cert?.status || "ACTIVE",
    revocation_reason: cert?.revocation_reason || "",
    issued_at: cert?.issued_at ? new Date(cert.issued_at).toISOString().slice(0, 16) : "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!cert) {
    return (
      <div className={styles.container}>
        <div className="premium-card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h2>No Certificate Selected</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            Please navigate from the certificate management table to edit a certificate.
          </p>
          <Link to="/admin/certificates" className="premium-btn premium-btn-primary">
            Back to Certificates
          </Link>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        title: form.title.trim() || undefined,
        status: form.status,
        revocation_reason: form.status === "REVOKED" ? form.revocation_reason.trim() : null,
      };
      if (form.issued_at) {
        payload.issued_at = new Date(form.issued_at).toISOString();
      }

      await apiClient.patch(API_ENDPOINTS.CERTIFICATES.BY_ID(cert.id), payload);
      setSuccess("Certificate updated successfully!");
      setTimeout(() => {
        navigate("/admin/certificates");
      }, 1000);
    } catch (err) {
      console.error("Failed to update certificate:", err);
      const detail = err?.response?.data?.detail || err?.response?.data?.message || "Failed to update certificate.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card" style={{ width: "100%", maxWidth: "800px" }}>
        <div className={styles.header}>
          <div>
            <h1>Edit Certificate</h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
              Update status and details for <code>{cert.certificate_number}</code>
            </p>
          </div>

          <Link to="/admin/certificates">Back</Link>
        </div>

        {error ? (
          <div style={{ padding: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", borderRadius: "8px", color: "#b91c1c", marginBottom: "16px" }}>
            ❌ {error}
          </div>
        ) : null}

        {success ? (
          <div style={{ padding: "12px", background: "rgba(34,197,94,0.1)", border: "1px solid #22c55e", borderRadius: "8px", color: "#166534", marginBottom: "16px" }}>
            ✅ {success}
          </div>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.group}>
            <label>Recipient Name</label>
            <input type="text" value={cert.recipient_display || cert.recipient_name || "Student"} disabled style={{ opacity: 0.7, background: "var(--bg-nested)" }} />
          </div>

          <div className={styles.group}>
            <label>Certificate Number</label>
            <input type="text" value={cert.certificate_number} disabled style={{ opacity: 0.7, background: "var(--bg-nested)" }} />
          </div>

          <div className={styles.group}>
            <label>Certificate Title / Course</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. VLSI Design & Verification"
            />
          </div>

          <div className={styles.group}>
            <label>Issue Date & Time</label>
            <input
              type="datetime-local"
              name="issued_at"
              value={form.issued_at}
              onChange={handleChange}
            />
          </div>

          <div className={styles.group}>
            <label>Status</label>
            <select name="status" value={form.status} onChange={handleChange}>
              <option value="ACTIVE">Active (Valid)</option>
              <option value="REVOKED">Revoked (Invalid)</option>
            </select>
          </div>

          {form.status === "REVOKED" && (
            <div className={styles.full}>
              <label>Revocation Reason</label>
              <textarea
                name="revocation_reason"
                rows="3"
                value={form.revocation_reason}
                onChange={handleChange}
                placeholder="Reason for revoking this certificate..."
                required
              ></textarea>
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Certificate"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EditCertificate;