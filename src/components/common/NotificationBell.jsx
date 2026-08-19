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

function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data);
    } catch {
      // Fail silently — bell should never break the page
    }
  }, [isAuthenticated]);

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

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, fetchNotifications]);

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
    // Mark as read via backend — backend is authoritative
    if (!notification.is_read) {
      try {
        await notificationService.markRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
      } catch {
        // Continue navigation even if mark-read fails
      }
    }
    // Navigate to action_url if provided
    if (notification.action_url) {
      setOpen(false);
      navigate(notification.action_url);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = unreadNotifications.map((n) => n.id);
    if (!unreadIds.length) return;
    // Optimistic UI update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    // Persist to backend using individual mark_read calls (no bulk endpoint exists)
    try {
      await notificationService.markAllRead(unreadIds);
    } catch {
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
              </div>
            ) : (
              notifications.map((notification) => {
                const typeConf = TYPE_CONFIG[notification.notification_type] || TYPE_CONFIG.INFO;
                return (
                  <button
                    key={notification.id}
                    className={`${styles.notificationItem} ${
                      !notification.is_read ? styles.unread : ""
                    } ${notification.action_url ? styles.clickable : ""}`}
                    onClick={() => handleNotificationClick(notification)}
                    disabled={!notification.action_url && notification.is_read}
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
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
