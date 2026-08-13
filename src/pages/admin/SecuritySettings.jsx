import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";

function SecuritySettings() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.current_password || !form.new_password || !form.confirm_password) {
      setError("Please fill out all password fields.");
      return;
    }

    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match.");
      return;
    }

    if (form.new_password.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post(API_ENDPOINTS.USERS.RESET_PASSWORD, {
        current_password: form.current_password,
        new_password: form.new_password
      });
      
      setSuccess("Password updated successfully. Redirecting to login...");
      
      // Clear form for security
      setForm({ current_password: "", new_password: "", confirm_password: "" });

      // Logout and redirect
      setTimeout(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }, 2000);

    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to update password. Please check your current password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Security Settings</h1>
          <p className="premium-subtitle">Update your password and security preferences.</p>
        </div>
        <Link to="/admin/settings" className="premium-btn" style={{ background: "var(--bg-nested)", color: "var(--text-secondary)" }}>
          <FiArrowLeft /> Back to Settings
        </Link>
      </div>

      <div className="premium-card" style={{ maxWidth: "600px" }}>
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="premium-form-group">
            <label className="premium-label">Current Password *</label>
            <input
              type="password"
              name="current_password"
              value={form.current_password}
              onChange={handleChange}
              placeholder="Enter current password"
              className="premium-input"
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">New Password *</label>
            <input
              type="password"
              name="new_password"
              value={form.new_password}
              onChange={handleChange}
              placeholder="Enter new password"
              className="premium-input"
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Confirm New Password *</label>
            <input
              type="password"
              name="confirm_password"
              value={form.confirm_password}
              onChange={handleChange}
              placeholder="Confirm new password"
              className="premium-input"
            />
          </div>

          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} className="premium-btn premium-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Updating Security..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SecuritySettings;