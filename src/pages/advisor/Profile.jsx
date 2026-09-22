import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { 
  FiUser, 
  FiMail, 
  FiBriefcase, 
  FiCalendar, 
  FiShield, 
  FiCheckCircle, 
  FiAlertCircle,
  FiPhone
} from "react-icons/fi";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AdvisorProfile() {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mappedEmail: "",
    gender: "",
    dob: "",
    organization: "",
    designation: "",
    phone: "",
    role: "Advisor",
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchProfileData() {
      try {
        const res = await apiClient.get(API_ENDPOINTS.USERS.ME);
        const u = res.data;

        if (isMounted && u) {
          setFormData({
            firstName: u.first_name || "",
            lastName: u.last_name || "",
            email: u.email || "",
            mappedEmail: u.mapped_email || "",
            gender: u.gender || "",
            dob: u.date_of_birth || "",
            organization: u.organization || "",
            designation: u.designation || "",
            phone: u.phone_number || "",
            role: u.role === "ADVISOR" ? "Advisor" : u.role,
          });
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchProfileData();
    return () => { isMounted = false; };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        phone_number: formData.phone.trim() || null,
        gender: formData.gender || null,
        date_of_birth: formData.dob || null,
      };

      const res = await apiClient.patch(API_ENDPOINTS.USERS.ME, payload);
      if (updateUser) {
        updateUser(res.data);
      }
      setSuccess("Profile updated successfully.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="premium-page-container">
        <SkeletonLoader variant="card" height="400px" />
      </div>
    );
  }

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Advisor Profile</h1>
          <p className="premium-subtitle">Your official SURE Trust Advisory Board identity and profile details.</p>
        </div>
      </div>

      <div className="premium-card" style={{ maxWidth: "800px" }}>
        {/* Header Avatar & Role Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border-color)" }}>
          <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
            fontWeight: "800",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)"
          }}>
            {(formData.firstName || "A").charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--text-primary)", margin: "0 0 6px 0" }}>
              {`${formData.firstName} ${formData.lastName}`.trim() || "Advisor"}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="premium-badge premium-badge-indigo" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <FiShield /> Role: Advisor
              </span>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {formData.designation || "Advisory Board Member"}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "600" }}>
            <FiAlertCircle size={20} /> {error}
          </div>
        )}
        {success && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#166534", backgroundColor: "#ecfdf5", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "600" }}>
            <FiCheckCircle size={20} /> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="responsive-grid">
          {/* Identity & Contact Details */}
          <div className="premium-form-group">
            <label className="premium-label">First Name</label>
            <input 
              type="text" 
              name="firstName" 
              value={formData.firstName} 
              onChange={handleChange} 
              className="premium-input" 
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Last Name</label>
            <input 
              type="text" 
              name="lastName" 
              value={formData.lastName} 
              onChange={handleChange} 
              className="premium-input" 
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Official Email Address</label>
            <input 
              type="email" 
              value={formData.email} 
              disabled 
              className="premium-input" 
              style={{ background: "var(--bg-nested)", cursor: "not-allowed", opacity: 0.8 }}
            />
            <small style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px" }}>
              Primary login identifier assigned by Admin.
            </small>
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Mapped Communications Email</label>
            <input 
              type="email" 
              value={formData.mappedEmail || "Not Configured"} 
              disabled 
              className="premium-input" 
              style={{ background: "var(--bg-nested)", cursor: "not-allowed", opacity: 0.8 }}
            />
            <small style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px" }}>
              Notifications & password resets are dispatched here.
            </small>
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Gender</label>
            <select name="gender" value={formData.gender} onChange={handleChange} className="premium-input">
              <option value="">Select Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Date of Birth</label>
            <input 
              type="date" 
              name="dob" 
              value={formData.dob} 
              onChange={handleChange} 
              className="premium-input" 
            />
          </div>

          {/* Professional Details (Admin Configured) */}
          <div className="premium-form-group">
            <label className="premium-label">Organization / Institution</label>
            <input 
              type="text" 
              value={formData.organization || "N/A"} 
              disabled 
              className="premium-input" 
              style={{ background: "var(--bg-nested)", cursor: "not-allowed", opacity: 0.8 }}
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Designation</label>
            <input 
              type="text" 
              value={formData.designation || "N/A"} 
              disabled 
              className="premium-input" 
              style={{ background: "var(--bg-nested)", cursor: "not-allowed", opacity: 0.8 }}
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Phone Number</label>
            <input 
              type="tel" 
              name="phone" 
              value={formData.phone} 
              onChange={handleChange} 
              placeholder="+91 9876543210" 
              className="premium-input" 
            />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Account Role</label>
            <input 
              type="text" 
              value="Advisor" 
              disabled 
              className="premium-input" 
              style={{ background: "var(--bg-nested)", cursor: "not-allowed", opacity: 0.8 }}
            />
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={saving} className="premium-btn premium-btn-primary" style={{ cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving Changes..." : "Save Profile Details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdvisorProfile;
