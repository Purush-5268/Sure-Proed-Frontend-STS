import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import ThemeToggle from "../../components/common/ThemeToggle";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Settings.module.css";
import { FiLock, FiMonitor, FiUser, FiArrowRight } from "react-icons/fi";

function Settings() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.current_password || !form.new_password || !form.confirm_password) {
      setError("Please fill in all password fields.");
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (form.new_password.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post(API_ENDPOINTS.USERS.RESET_PASSWORD, {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setMessage(response.data?.detail || "Password updated successfully.");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      const msg = err?.response?.data?.detail || "Unable to update password right now.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Settings" 
        description="Manage your teaching preferences and account security."
      />

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <FiMonitor className={styles.icon} />
              <h2>Appearance</h2>
            </div>
            <p className={styles.description}>Customize how SURE ProEd looks on your device.</p>
            <div className={styles.settingRow}>
              <ThemeToggle />
            </div>
          </Card>

          <Card className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <FiUser className={styles.icon} />
              <h2>Profile Information</h2>
            </div>
            <p className={styles.description}>Update your personal details and public profile.</p>
            <button className={styles.secondaryButton} onClick={() => navigate('/mentor/profile')}>
              Edit Profile <FiArrowRight style={{ marginLeft: '4px' }} />
            </button>
          </Card>
        </div>

        <div className={styles.column}>
          <Card className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <FiLock className={styles.icon} />
              <h2>Security</h2>
            </div>
            <p className={styles.description}>Update your password to keep your account secure.</p>
            
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Current Password</label>
                <input type="password" name="current_password" value={form.current_password} onChange={handleChange} className={styles.input} />
              </div>
              
              <div className={styles.formGroup}>
                <label>New Password</label>
                <input type="password" name="new_password" value={form.new_password} onChange={handleChange} className={styles.input} />
              </div>
              
              <div className={styles.formGroup}>
                <label>Confirm Password</label>
                <input type="password" name="confirm_password" value={form.confirm_password} onChange={handleChange} className={styles.input} />
              </div>

              {message && <div className={styles.successMessage}>{message}</div>}
              {error && <div className={styles.errorMessage}>{error}</div>}

              <button type="submit" disabled={loading} className={styles.primaryButton}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Settings;