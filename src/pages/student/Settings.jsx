import React, { useState } from 'react';
import styles from './Settings.module.css';
import ThemeToggle from '../../components/common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

function Settings() {
    const { user } = useAuth();
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (passwordData.new !== passwordData.confirm) {
            setError("New passwords do not match.");
            return;
        }

        if (passwordData.new.length < 8) {
            setError("New password must be at least 8 characters long.");
            return;
        }

        setLoading(true);
        try {
            await apiClient.post(API_ENDPOINTS.USERS.RESET_PASSWORD, {
                current_password: passwordData.current,
                new_password: passwordData.new
            });
            setSuccess("Password updated successfully.");
            setPasswordData({ current: '', new: '', confirm: '' });
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            setError(err?.response?.data?.detail || "Failed to update password. Please check your current password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.settingsPage}>
            <header className={styles.header}>
                <h1>Account Settings</h1>
                <p>Manage your preferences, security, and learning experience.</p>
            </header>

            <div className={styles.settingsGrid}>

                {/* Appearance Card */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.icon}>🎨</span>
                        <h2>Appearance</h2>
                    </div>
                    <p className={styles.description}>Customize how the platform looks on your device.</p>
                    <div className={styles.settingRow}>
                        <div className={styles.settingInfo}>
                            <h3>Theme Preference</h3>
                            <p>Toggle between Light, Dark, or System default themes.</p>
                        </div>
                        <div className={styles.settingAction}>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>

                {/* Profile Info Card */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.icon}>👤</span>
                        <h2>Profile Information</h2>
                    </div>
                    <p className={styles.description}>Your core student account details.</p>
                    <div className={styles.settingRow}>
                        <div className={styles.settingInfo}>
                            <h3>Email Address</h3>
                            <p>{user?.email || "student@example.com"}</p>
                        </div>
                        <span className={styles.badge}>Verified</span>
                    </div>
                    <div className={styles.settingRow}>
                        <div className={styles.settingInfo}>
                            <h3>Account Role</h3>
                            <p style={{ textTransform: 'capitalize' }}>{user?.role?.toLowerCase() || "Student"}</p>
                        </div>
                    </div>
                </div>

                {/* Password Reset Card */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.icon}>🔒</span>
                        <h2>Security & Password</h2>
                    </div>
                    <p className={styles.description}>Update your password to keep your account secure.</p>

                    {error && (
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold", fontSize: "14px" }}>
                            <FiAlertCircle size={18} /> {error}
                        </div>
                    )}
                    {success && (
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#166534", backgroundColor: "#ecfdf5", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold", fontSize: "14px" }}>
                            <FiCheckCircle size={18} /> {success}
                        </div>
                    )}

                    <form onSubmit={handlePasswordChange} className={styles.passwordForm}>
                        <div className={styles.inputGroup}>
                            <label>Current Password</label>
                            <input type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} required placeholder="Enter current password" />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>New Password</label>
                            <input type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} required placeholder="Enter new password" />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Confirm New Password</label>
                            <input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} required placeholder="Confirm new password" />
                        </div>
                        <button type="submit" disabled={loading} className={styles.saveBtn} style={{ cursor: loading ? "not-allowed" : "pointer" }}>
                            {loading ? "Updating..." : "Update Password"}
                        </button>
                    </form>
                </div>

                {/* Notifications Card */}
                <div className={styles.settingsCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.icon}>🔔</span>
                        <h2>Notification Preferences</h2>
                    </div>
                    <p className={styles.description}>Control what alerts you receive.</p>
                    <div className={styles.settingRow}>
                        <div className={styles.settingInfo}>
                            <h3>Live Class Alerts</h3>
                            <p>Receive email reminders 10 minutes before a class starts.</p>
                        </div>
                        <div className={styles.toggleWrapper}>
                            <input type="checkbox" id="classAlerts" defaultChecked className={styles.toggle} />
                            <label htmlFor="classAlerts" className={styles.toggleLabel}></label>
                        </div>
                    </div>
                    <div className={styles.settingRow}>
                        <div className={styles.settingInfo}>
                            <h3>Assignment Deadlines</h3>
                            <p>Get notified when an assignment is due soon.</p>
                        </div>
                        <div className={styles.toggleWrapper}>
                            <input type="checkbox" id="assignmentAlerts" defaultChecked className={styles.toggle} />
                            <label htmlFor="assignmentAlerts" className={styles.toggleLabel}></label>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Settings;