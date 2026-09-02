/**
 * NotificationBell.jsx
 *
 * Reusable notification bell for all roles (Admin, Mentor, Student).
 * Polls /api/notifications/ every 60 seconds when user is authenticated.
 * Cleanup on unmount prevents memory leaks and duplicate polling instances.
 *
 * Supports all backend Notification.Type values:
 *   INFO | SUCCESS | WARNING | ACTION_REQUIRED
 *
 * Extensible for future types without component redesign.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaBell, FaCheckDouble, FaInfoCircle, FaCheckCircle, FaExclamationTriangle, FaBolt } from "react-icons/fa";
import { notificationService } from "../../services/notificationService";
import { pushNotificationService } from "../../services/pushNotificationService";
import { useAuth } from "../../context/AuthContext";
import styles from "./NotificationBell.module.css";

const POLL_INTERVAL_MS = 60_000; // 60 seconds

const TYPE_CONFIG = {
  INFO: { icon: <FaInfoCircle />, className: "typeInfo", label: "Info" },
  SUCCESS: { icon: <FaCheckCircle />, className: "typeSuccess", label: "Success" },
  WARNING: { icon: <FaExclamationTriangle />, className: "typeWarning", label: "Warning" },
  ACTION_REQUIRED: { icon: <FaBolt />, className: "typeAction", label: "Action" },
};

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Maps every known backend action_url slug and notification title to a valid
 * frontend route. Never navigates to /api/ URLs. Always provides a safe fallback.
 *
 * Known backend action_url values (from notify_user() calls across the codebase):
 *   "application_tracker", "assignments", "certificates", "community_activities",
 *   "courses", "grades", "profile", "screening", "support_requests", "timetable",
 *   "training", "/attendance/{id}/", job.apply_url (external HTTP)
 */
const ACTION_URL_SLUG_MAP = {
  // Slug → { student, admin, mentor } route mapping
  "application_tracker": { student: "/student/applications", admin: "/admin/applications", mentor: "/mentor/applications" },
  "assignments":         { student: "/student/assignments", admin: "/admin/assignments", mentor: "/mentor/assignments" },
  "certificates":        { student: "/student/certificates", admin: "/admin/certificates", mentor: "/mentor/dashboard" },
  "community_activities":{ student: "/student/dashboard", admin: "/admin/dashboard", mentor: "/mentor/dashboard" },
  "courses":             { student: "/student/courses", admin: "/admin/courses", mentor: "/mentor/dashboard" },
  "grades":              { student: "/student/dashboard", admin: "/admin/reports", mentor: "/mentor/dashboard" },
  "screening":           { student: "/student/applications", admin: "/admin/applications", mentor: "/mentor/applications" },
  "support_requests":    { student: "/student/permissions", admin: "/admin/requests-support", mentor: "/mentor/dashboard" },
  "timetable":           { student: "/student/class-schedule", admin: "/admin/schedule", mentor: "/mentor/class-schedule" },
  "training":            { student: "/student/cohort", admin: "/admin/cohorts", mentor: "/mentor/cohorts" },
};

const getNotificationRoute = (notification, userRole) => {
  const title = (notification.title || "").toLowerCase();
  const rawActionUrl = notification.action_url || "";
  const actionUrl = rawActionUrl.toLowerCase();
  const role = (userRole || "").toLowerCase();
  
  const rolePrefix = `/${role}`;
  const fallback = `${rolePrefix}/dashboard`;

  // ── 1. Title-based routing (highest priority — handles all known notification types) ──

  // Attendance Warnings, Late Joins, Permission Requests, Support Requests
  if (title.includes("attendance warning") || title.includes("late join") || title.includes("permission") || title.includes("attendance query") || title.includes("request")) {
    if (role === "student") return `/student/permissions`;
    if (role === "admin") return `/admin/requests-support`;
    if (role === "mentor") return `/mentor/attendance`;
  }

  // Class Scheduled / LST / SST / Training Sessions / Meets
  if (title.includes("scheduled") || title.includes("lst") || title.includes("sst") || title.includes("class ") || title.includes("meet")) {
    if (role === "student") return `/student/class-schedule`;
    if (role === "admin") return `/admin/schedule`;
    if (role === "mentor") return `/mentor/class-schedule`;
  }

  // Announcements
  if (title.includes("announcement")) {
    if (role === "student") return `/student/dashboard`;
    if (role === "admin") return `/admin/dashboard`;
    if (role === "trustee") return `/trustee/commercial/announcements`;
  }

  // Application status changes (approved, rejected, cohort assigned, qualified, etc.)
  if (title.includes("application") || title.includes("cohort assigned") || title.includes("qualified") || title.includes("waitlisted") || title.includes("offer letter")) {
    if (role === "student") return `/student/applications`;
    // If it's an offer letter request, admin should go to requests support. Otherwise applications.
    if (role === "admin") {
      if (title.includes("request")) return `/admin/requests-support`;
      return `/admin/applications`;
    }
    if (role === "mentor") return `/mentor/applications`;
  }

  // Exam results / screening
  if (title.includes("exam") || title.includes("screening") || title.includes("test result")) {
    if (role === "student") return `/student/applications`;
    if (role === "admin") return `/admin/exams`;
    if (role === "mentor") return `/mentor/assessments`;
  }

  // Certificates
  if (title.includes("certificate")) {
    if (role === "student") return `/student/certificates`;
    if (role === "admin") return `/admin/certificates`;
  }

  // Assignments
  if (title.includes("assignment")) {
    if (role === "student") return `/student/assignments`;
    if (role === "admin") return `/admin/assignments`;
    if (role === "mentor") return `/mentor/assignments`;
  }

  // Cohort suspension / transfer
  if (title.includes("suspend") || title.includes("transfer cohort") || title.includes("revoke")) {
    if (role === "student") return `/student/applications`;
    if (role === "admin") return `/admin/applications`;
  }

  // Profile completion / GitHub linked / LinkedIn
  if (title.includes("profile") || title.includes("github") || title.includes("linkedin")) {
    if (role === "student") return `/student/profile`;
    if (role === "admin") return `/admin/students`;
  }

  // Community activities
  if (title.includes("community") || title.includes("activity")) {
    if (role === "student") return `/student/dashboard`;
    if (role === "admin") return `/admin/dashboard`;
  }

  // ── 2. action_url slug-based routing ──

  // External URLs (job listings, etc.) — pass through directly
  if (rawActionUrl.startsWith("http")) {
    return rawActionUrl;
  }

  // Match against known backend slugs
  const cleanSlug = rawActionUrl.replace(/^\/+|\/+$/g, "").toLowerCase();
  const slugRoutes = ACTION_URL_SLUG_MAP[cleanSlug];
  if (slugRoutes) {
    return slugRoutes[role] || fallback;
  }

  // ── 3. Safety: NEVER navigate to /api/ or backend-only paths ──
  if (rawActionUrl.startsWith("/api/") || rawActionUrl.includes("/attendance/") || rawActionUrl.includes("/students/") || rawActionUrl.includes("/applications/")) {
    return fallback;
  }

  // ── 4. If action_url looks like a valid frontend path (starts with /role/), use it ──
  if (rawActionUrl.startsWith(rolePrefix + "/")) {
    return rawActionUrl;
  }

  // ── 5. Safe fallback — always the role's dashboard ──
  return fallback;
};

function NotificationBell() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState("unsupported");
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const dropdownRef = useRef(null);
  const intervalRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data);
    } catch {
      // Fail silently — bell should never break the page
    }
  }, [isAuthenticated, isSubscribed, user?.role, navigate]);

  // Start polling only when authenticated. Stop and clean up on unmount or logout.
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }

    // Immediate first fetch
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));

    // Recurring poll — prevent duplicates by clearing before setting
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);

    // Initialize push status
    if (pushNotificationService.isSupported()) {
      setPushStatus(Notification.permission);
      if (Notification.permission === "granted") {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) {
            reg.pushManager.getSubscription().then(sub => {
              setIsSubscribed(!!sub);
            });
          }
        });
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, fetchNotifications]);

  // Handle incoming push notification click redirects
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get("notification_action");
    
    if (action) {
      // Remove query param to prevent loops
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const finalUrl = getNotificationRoute({ action_url: action, title: action.replace(/_/g, " ") }, user.role);
      if (finalUrl.startsWith('http')) {
        window.location.href = finalUrl;
      } else {
        navigate(finalUrl);
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleTogglePush = async () => {
    if (!pushNotificationService.isSupported()) return;

    setIsPushLoading(true);
    try {
      if (isSubscribed) {
        await pushNotificationService.unsubscribe();
        setIsSubscribed(false);
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 5000);
      } else {
        const permission = await Notification.requestPermission();
        setPushStatus(permission);
        if (permission === "granted") {
          const success = await pushNotificationService.subscribe();
          if (success) {
            setIsSubscribed(true);
            setShowWarning(false);
          }
        }
      }
    } catch (err) {
      console.error("Failed to toggle push notifications", err);
    } finally {
      setIsPushLoading(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const unreadCount = unreadNotifications.length;

  const handleNotificationClick = async (notification) => {
    // Immediately clear it from the UI list
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));

    // Mark as read via backend if unread
    if (!notification.is_read) {
      try {
        await notificationService.markRead(notification.id);
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        // Continue navigation even if mark-read fails
      }
    }
    // Navigate using the centralized router
    setOpen(false);
    const finalUrl = getNotificationRoute(notification, user?.role);
    
    if (finalUrl.startsWith('http')) {
      window.location.href = finalUrl;
    } else {
      navigate(finalUrl);
    }
  };

  const handleClearNotification = async (e, id) => {
    e.stopPropagation();
    // Immediately clear from UI
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    
    // Delete from backend
    try {
      await notificationService.deleteNotification(id);
    } catch (err) {
      console.error("Failed to delete notification:", err);
      // Fallback: restore it or ignore
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = unreadNotifications.map((n) => n.id);
    if (!unreadIds.length) return;
    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

      // Persist to backend using the bulk endpoint
      await notificationService.markAllRead(unreadIds);
    } catch (err) {
      // Re-fetch to restore accurate state if bulk fails
      fetchNotifications();
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className={styles.bellWrapper} ref={dropdownRef}>
      <button
        className={styles.bellButton}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
      >
        <FaBell className={styles.bellIcon} />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown} role="dialog" aria-label="Notifications">
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button
                className={styles.markAllBtn}
                onClick={handleMarkAllRead}
                title="Mark all as read"
              >
                <FaCheckDouble /> Mark all read
              </button>
            )}
          </div>

          <div className={styles.dropdownList}>
            {loading && notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.skeletonItem} />
                <div className={styles.skeletonItem} />
                <div className={styles.skeletonItem} />
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <FaBell className={styles.emptyIcon} />
                <p>You're all caught up!</p>
                {pushNotificationService.isSupported() && pushStatus === "default" && (
                   <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-nested)', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'left' }}>
                     <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-primary)' }}>Stay Updated 🚀</h4>
                     <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Enable browser notifications to instantly know when a student requests support, misses a class, or when a new cohort session begins.</p>
                     <button onClick={handleTogglePush} disabled={isPushLoading} className="premium-btn premium-btn-primary" style={{ width: '100%', padding: '8px', fontSize: '13px', justifyContent: 'center' }}>
                       {isPushLoading ? "Enabling..." : "Enable Notifications"}
                     </button>
                   </div>
                )}
              </div>
            ) : (
              notifications.map((notification) => {
                const typeConf = TYPE_CONFIG[notification.notification_type] || TYPE_CONFIG.INFO;
                return (
                  <div
                    key={notification.id}
                    style={{ position: 'relative' }}
                    className={styles.notificationWrapper}
                  >
                    <button
                      className={`${styles.notificationItem} ${!notification.is_read ? styles.unread : ""} ${notification.action_url ? styles.clickable : ""}`}
                      onClick={() => handleNotificationClick(notification)}
                      disabled={!notification.action_url && notification.is_read}
                      style={{ paddingRight: '36px', width: '100%', textAlign: 'left', border: 'none', background: 'transparent' }}
                    >
                      <span className={`${styles.typeIcon} ${styles[typeConf.className]}`}>
                        {typeConf.icon}
                      </span>
                      <div className={styles.notifContent}>
                        <div className={styles.notifTitle}>{notification.title}</div>
                        <div className={styles.notifMessage}>{notification.message}</div>
                        <div className={styles.notifMeta}>
                          <span className={`${styles.typeBadge} ${styles[typeConf.className]}`}>
                            {typeConf.label}
                          </span>
                          <span className={styles.timeAgo}>{relativeTime(notification.created_at)}</span>
                        </div>
                      </div>
                      {!notification.is_read && <span className={styles.unreadDot} aria-hidden="true" />}
                    </button>
                    <button
                      onClick={(e) => handleClearNotification(e, notification.id)}
                      title="Clear notification"
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '12px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-nested)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Web Push Notification Settings Footer */}
          {pushNotificationService.isSupported() && (
            <div className={styles.pushFooter} style={{ padding: "10px", borderTop: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem", backgroundColor: "var(--background-alt)" }}>
              {showWarning && (
                <div style={{ color: '#b45309', fontSize: '0.8rem', fontStyle: 'italic', background: '#fef3c7', padding: '6px', borderRadius: '4px', borderLeft: '3px solid #f59e0b' }}>
                  ⚠️ Don't miss out on important live classes and updates! Re-enable to stay informed.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <span>Browser Notifications</span>
                {pushStatus === "granted" && isSubscribed ? (
                  <button
                    onClick={handleTogglePush}
                    disabled={isPushLoading}
                    title="Click to disable notifications"
                    style={{ background: 'transparent', border: '1px solid var(--success-color)', color: 'var(--success-color)', padding: '4px 8px', borderRadius: '4px', cursor: isPushLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                  >
                    {isPushLoading ? "Disabling..." : <><FaCheckCircle /> Enabled</>}
                  </button>
                ) : pushStatus === "denied" ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{ color: "var(--danger-color)", fontWeight: "500" }}>Blocked by Browser</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Click the 🔒 icon in the URL bar to allow</span>
                  </div>
                ) : (
                  <button
                    onClick={handleTogglePush}
                    disabled={isPushLoading}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      background: "var(--primary-color)",
                      color: "white",
                      border: "none",
                      cursor: isPushLoading ? "not-allowed" : "pointer",
                      fontSize: "0.8rem",
                      fontWeight: "500"
                    }}
                  >
                    {isPushLoading ? "Enabling..." : "Enable"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
