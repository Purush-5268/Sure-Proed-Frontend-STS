import { Link } from "react-router-dom";
import { FiUser, FiShield, FiSettings } from "react-icons/fi";
import styles from "./Settings.module.css";

function Settings() {
  return (
    <div className={styles.container}>

      <div className={styles.header}>
        <div>
          <h1>Settings</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "4px" }}>Manage your admin account and system preferences.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px", marginTop: "24px" }}>

        <Link to="/admin/profile-settings" className="premium-card" style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", backgroundColor: "rgba(37, 99, 235, 0.1)", color: "var(--primary-color)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
            <FiUser />
          </div>
          <h2 style={{ fontSize: "18px", color: "var(--text-primary)", margin: "0" }}>Profile Settings</h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0" }}>Update admin profile information, email, and personal details.</p>
        </Link>

        <Link to="/admin/security-settings" className="premium-card" style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--success-color)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
            <FiShield />
          </div>
          <h2 style={{ fontSize: "18px", color: "var(--text-primary)", margin: "0" }}>Security Settings</h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0" }}>Change password, setup 2FA, and manage security options.</p>
        </Link>

        <Link to="/admin/system-settings" className="premium-card" style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", backgroundColor: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
            <FiSettings />
          </div>
          <h2 style={{ fontSize: "18px", color: "var(--text-primary)", margin: "0" }}>System Settings</h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0" }}>Configure application globals, themes, and notification preferences.</p>
        </Link>

      </div>
    </div>
  );
}

export default Settings;