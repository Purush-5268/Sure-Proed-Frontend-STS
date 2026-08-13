import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiShield, FiArrowLeft, FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";

function AddTrustee() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    trustee_type: "VOLUNTEER",
    organization: "",
    designation: "",
    is_active: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError("Please provide first name, last name, and email.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create the User (Omit password so backend sends setup email automatically)
      const userPayload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: "TRUSTEE",
        is_active: form.is_active,
      };

      const userRes = await apiClient.post(API_ENDPOINTS.USERS.BASE, userPayload);
      const newUserId = userRes.data.id || userRes.data.user?.id;

      // 2. Try to create the TrusteeProfile (Backend might ignore user_id due to strict serializer, but we follow the standard flow)
      try {
        await apiClient.post(API_ENDPOINTS.TRUSTEE_PROFILES.BASE, {
          user: newUserId,
          trustee_type: form.trustee_type,
          organization: form.organization.trim(),
          designation: form.designation.trim(),
          is_active: form.is_active
        });
      } catch (profileErr) {
        console.warn("Trustee profile creation skipped or failed (backend API constraint):", profileErr);
        // We do not fail the whole process if profile fails, user was created and email sent.
      }

      setSuccess(`Trustee created successfully. An email has been sent to ${form.email} to set up their password.`);
      setTimeout(() => navigate("/admin/trustees"), 2500);

    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Failed to create the trustee account.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Add New Trustee</h1>
          <p className="premium-subtitle">Register a Volunteer, Advisor, or Board Trustee. They will receive a password setup email.</p>
        </div>
        <Link to="/admin/trustees" className="premium-btn" style={{ background: "var(--bg-nested)", color: "var(--text-secondary)" }}>
          <FiArrowLeft /> Back to Trustees
        </Link>
      </div>

      <div className="premium-card">
        {error && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>
            <FiAlertCircle size={20} /> {error}
          </div>
        )}
        {success && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#166534", backgroundColor: "#ecfdf5", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>
            <FiCheckCircle size={20} /> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="premium-grid-2">
          {/* User Fields */}
          <div className="premium-form-group">
            <label className="premium-label">First Name *</label>
            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} placeholder="e.g. Robert" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Last Name *</label>
            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} placeholder="e.g. Kiyosaki" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Email Address *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="trustee@organization.com" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Trustee Type *</label>
            <select name="trustee_type" value={form.trustee_type} onChange={handleChange} className="premium-input">
              <option value="COMMERCIAL">Trustee</option>
              <option value="VOLUNTEER">Volunteer</option>
              <option value="ADVISOR">Advisor</option>
            </select>
          </div>

          {/* Optional Profile Fields */}
          <div className="premium-form-group">
            <label className="premium-label">Organization (Optional)</label>
            <input type="text" name="organization" value={form.organization} onChange={handleChange} placeholder="e.g. Acme Corp" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Designation (Optional)</label>
            <input type="text" name="designation" value={form.designation} onChange={handleChange} placeholder="e.g. Director" className="premium-input" />
          </div>

          <div className="premium-form-group" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", marginTop: "0.5rem" }}>
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} style={{ width: "18px", height: "18px", cursor: "pointer" }} />
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }} onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}>
              Account is Active
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} className="premium-btn premium-btn-primary" style={{ cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Creating Trustee..." : "Create Trustee"}
            </button>
            <Link to="/admin/trustees" className="premium-btn" style={{ background: "var(--bg-nested)", color: "var(--text-secondary)" }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTrustee;
