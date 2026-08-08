import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./MeetingLinks.module.css";
import { FiVideo, FiCopy, FiExternalLink, FiAlertCircle, FiClock } from "react-icons/fi";

function MeetingLinks() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadActiveSessions = async () => {
      try {
        // Load only sessions that are currently active (conducted not ended)
        // These sessions have real Google Meet links provisioned by backend
        const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, {
          params: { conducted: "true" }
        });
        if (isMounted) {
          const data = response.data;
          const all = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          // Only show sessions that haven't ended (conducted === true) and have a meeting link
          const activeSessions = all.filter(s => s.conducted !== false && !!s.meeting_link);
          setSessions(activeSessions);
        }
      } catch (err) {
        if (isMounted) setError("Unable to load active sessions.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadActiveSessions();
    return () => {
      isMounted = false;
    };
  }, []);

  const copyToClipboard = async (sessionId, link) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const el = document.createElement("textarea");
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="Meeting Links"
        description="Active class sessions with live Google Meet links."
      />

      {loading ? (
        <div className={styles.sessionGrid}>
          {[1, 2].map(i => (
            <div key={i} className={styles.skeletonCard}>
              <SkeletonLoader width="50%" height="20px" borderRadius="4px" />
              <SkeletonLoader width="35%" height="12px" borderRadius="4px" />
              <SkeletonLoader width="100%" height="40px" borderRadius="8px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<FiAlertCircle />} title="Could not load sessions" description={error} />
      ) : sessions.length === 0 ? (
        <div className={styles.emptyWrapper}>
          <EmptyMeetingAnimation />
          <EmptyState
            icon={<FiVideo />}
            title="No active sessions right now"
            description="Your meeting links will appear here when a class session is live. Sessions disappear automatically when the class ends."
          />
        </div>
      ) : (
        <motion.div
          className={styles.sessionGrid}
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {sessions.map(session => (
              <motion.div key={session.id} variants={item} layout exit={{ opacity: 0, scale: 0.95 }}>
                <Card className={styles.sessionCard}>
                  <div className={styles.livePill}>
                    <span className={styles.liveDot} />
                    LIVE
                  </div>

                  <h3 className={styles.sessionTitle}>{session.title}</h3>

                  <div className={styles.sessionMeta}>
                    <div className={styles.metaRow}>
                      <FiClock className={styles.metaIcon} />
                      <span>{session.start_time} — {session.end_time || "Ongoing"}</span>
                    </div>
                    {session.class_date && (
                      <div className={styles.metaRow}>
                        <span className={styles.dateLabel}>
                          {new Date(session.class_date).toLocaleDateString('en-IN', {
                            weekday: 'long', day: 'numeric', month: 'long'
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className={styles.linkBox}>
                    <span className={styles.linkText}>{session.meeting_link}</span>
                  </div>

                  <div className={styles.actions}>
                    <a
                      href={session.meeting_link}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.joinBtn}
                    >
                      <FiExternalLink /> Join Class
                    </a>
                    <button
                      className={`${styles.copyBtn} ${copiedId === session.id ? styles.copied : ""}`}
                      onClick={() => copyToClipboard(session.id, session.meeting_link)}
                    >
                      <FiCopy />
                      {copiedId === session.id ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Premium empty state animation — floating orbs suggesting "waiting for a session"
 * GPU-accelerated using transform and opacity only.
 */
function EmptyMeetingAnimation() {
  return (
    <div className={styles.animationWrapper} aria-hidden="true">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className={styles.orb}
          animate={{
            y: [0, -18, 0],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2.5 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.7,
          }}
          style={{
            width: `${60 + i * 20}px`,
            height: `${60 + i * 20}px`,
          }}
        />
      ))}
    </div>
  );
}

export default MeetingLinks;