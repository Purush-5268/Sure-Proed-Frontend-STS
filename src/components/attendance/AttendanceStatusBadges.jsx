import React from "react";
import { FiCheck, FiAlertCircle, FiX, FiClock, FiRefreshCw, FiLock, FiEye, FiCheckSquare } from "react-icons/fi";
import styles from "./AttendanceStatusBadges.module.css";

/**
 * Comprehensive status badge component for displaying separated statuses:
 * - Attendance Status
 * - Discipline Status
 * - Suspension Status
 * - Identity Status
 * - Prior Permission Status
 */

const AttendanceStatusBadge = ({ status, label = "Attendance" }) => {
  const statusConfig = {
    // Attendance Status
    PRESENT: { color: "success", icon: <FiCheck />, label: "Present" },
    PARTIAL_ATTENDANCE: { color: "warning", icon: <FiAlertCircle />, label: "Partial" },
    ABSENT: { color: "error", icon: <FiX />, label: "Absent" },
    NOT_READY: { color: "default", icon: <FiClock />, label: "Not Ready" },
    PROCESSING: { color: "default", icon: <FiRefreshCw />, label: "Processing" },
    IDENTITY_REVIEW_REQUIRED: { color: "warning", icon: <FiEye />, label: "Review Required" },
  };

  const config = statusConfig[status] || { color: "default", icon: <FiClock />, label: status || "Unknown" };

  return (
    <div className={`${styles.badge} ${styles[`badge-${config.color}`]}`} title={label}>
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.text}>{config.label}</span>
    </div>
  );
};

const DisciplineStatusBadge = ({ status, label = "Discipline" }) => {
  const statusConfig = {
    NORMAL: { color: "success", icon: <FiCheck />, label: "Normal" },
    DISCIPLINE_REQUIRED: { color: "warning", icon: <FiAlertCircle />, label: "Review Required" },
    SUSPENSION_PENDING: { color: "error", icon: <FiLock />, label: "Suspension Pending" },
  };

  const config = statusConfig[status] || { color: "default", icon: <FiClock />, label: status || "Unknown" };

  return (
    <div className={`${styles.badge} ${styles[`badge-${config.color}`]}`} title={label}>
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.text}>{config.label}</span>
    </div>
  );
};

const SuspensionStatusBadge = ({ status, label = "Suspension" }) => {
  const statusConfig = {
    NOT_SUSPENDED: { color: "success", icon: <FiCheck />, label: "Not Suspended" },
    SUSPENDED: { color: "error", icon: <FiLock />, label: "Suspended" },
    IN_PROGRESS: { color: "warning", icon: <FiRefreshCw />, label: "In Progress" },
    PENDING_APPEAL: { color: "warning", icon: <FiAlertCircle />, label: "Pending Appeal" },
  };

  const config = statusConfig[status] || { color: "default", icon: <FiClock />, label: status || "Unknown" };

  return (
    <div className={`${styles.badge} ${styles[`badge-${config.color}`]}`} title={label}>
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.text}>{config.label}</span>
    </div>
  );
};

const IdentityStatusBadge = ({ status, label = "Identity" }) => {
  const statusConfig = {
    MATCHED: { color: "success", icon: <FiCheck />, label: "Verified" },
    IDENTITY_REVIEW_REQUIRED: { color: "warning", icon: <FiEye />, label: "Review Needed" },
    UNRESOLVED: { color: "error", icon: <FiX />, label: "Unresolved" },
    NAME_CHANGE_REQUIRED: { color: "warning", icon: <FiAlertCircle />, label: "Name Update" },
  };

  const config = statusConfig[status] || { color: "default", icon: <FiClock />, label: status || "Unknown" };

  return (
    <div className={`${styles.badge} ${styles[`badge-${config.color}`]}`} title={label}>
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.text}>{config.label}</span>
    </div>
  );
};

const PriorPermissionStatusBadge = ({ status, label = "Prior Permission" }) => {
  const statusConfig = {
    NONE: { color: "default", icon: <FiClock />, label: "None" },
    APPROVED: { color: "success", icon: <FiCheckSquare />, label: "Approved" },
    PENDING: { color: "warning", icon: <FiAlertCircle />, label: "Pending" },
  };

  const config = statusConfig[status] || { color: "default", icon: <FiClock />, label: status || "Unknown" };

  return (
    <div className={`${styles.badge} ${styles[`badge-${config.color}`]}`} title={label}>
      <span className={styles.icon}>{config.icon}</span>
      <span className={styles.text}>{config.label}</span>
    </div>
  );
};

export {
  AttendanceStatusBadge,
  DisciplineStatusBadge,
  SuspensionStatusBadge,
  IdentityStatusBadge,
  PriorPermissionStatusBadge,
};
