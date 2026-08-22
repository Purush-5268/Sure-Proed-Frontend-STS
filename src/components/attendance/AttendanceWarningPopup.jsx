import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";

/**
 * Attendance Warning Popup.
 * Uses CSS design tokens to be theme-aware (light + dark).
 * Does NOT modify PermissionChatConsumer.
 */
function AttendanceWarningPopup() {
  const [warnings, setWarnings] = useState([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchWarnings = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.ATTENDANCE.WARNINGS);
        if (isMounted && res.data?.length > 0) {
          setWarnings(res.data);
        }
      } catch (err) {
        // Silently ignore if not found or unauthorized
      }
    };
    fetchWarnings();
    return () => { isMounted = false; };
  }, []);

  if (!isVisible || warnings.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      right: "24px",
      background: "var(--bg-surface)",
      backdropFilter: "blur(12px)",
      border: "1px solid var(--color-danger, #ef4444)",
      borderLeft: "4px solid var(--color-danger, #ef4444)",
      borderRadius: "16px",
      padding: "20px",
      boxShadow: "var(--shadow-lg, 0 20px 40px rgba(0, 0, 0, 0.15))",
      maxWidth: "350px",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      animation: "attendanceWarnSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
    }}>
      <style>{`
        @keyframes attendanceWarnSlideIn {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--color-danger, #ef4444)" }}>
          <FiAlertTriangle /> Attendance Warning
        </h3>
        <button 
          onClick={() => setIsVisible(false)}
          style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", opacity: 0.8, padding: "4px", display: "flex", alignItems: "center" }}
          aria-label="Close warning"
        >
          <FiX size={18} />
        </button>
      </div>

      <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "var(--text-primary)" }}>
        You have {warnings.length} active attendance warning{warnings.length > 1 ? "s" : ""}. 
        Your attendance has dropped below the 40% threshold.
      </p>

      <Link 
        to="/student/permissions" 
        style={{
          background: "var(--color-danger, #ef4444)",
          color: "white",
          textDecoration: "none",
          padding: "10px",
          borderRadius: "8px",
          textAlign: "center",
          fontWeight: "600",
          fontSize: "14px",
          marginTop: "4px",
          transition: "opacity 0.2s",
          display: "block"
        }}
        onClick={() => setIsVisible(false)}
      >
        Review &amp; Seek Permission
      </Link>
    </div>
  );
}

export default AttendanceWarningPopup;
