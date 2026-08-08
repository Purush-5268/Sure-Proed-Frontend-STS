import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { motion } from "framer-motion";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./ClassSchedule.module.css";

function ClassSchedule() {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every 30 seconds to dynamically open/close the -10min/+5min window
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadSchedule = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE);
        if (isMounted) setSchedule(normalizeListResponse(response.data));
      } catch (err) {
        console.error("Failed to load class schedule:", err);
        if (isMounted) setSchedule([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadSchedule();
    return () => {
      isMounted = false;
    };
  }, []);

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // 🚨 Strict -10 min to +5 min Window Checker Logic
  const isWithinJoinWindow = (classDate, startTimeStr, endTimeStr) => {
    if (!classDate || !startTimeStr) return false;
    try {
      const now = new Date();
      const startDateTime = new Date(`${classDate}T${startTimeStr}`);
      let endDateTime;
      if (endTimeStr) {
        endDateTime = new Date(`${classDate}T${endTimeStr}`);
      } else {
        endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
      }
      const windowOpenTime = new Date(startDateTime.getTime() - 10 * 60 * 1000);
      const windowCloseTime = new Date(endDateTime.getTime() + 5 * 60 * 1000);
      return now >= windowOpenTime && now <= windowCloseTime;
    } catch (e) {
      return false;
    }
  };

  return (
    <div className="premium-page-container">
      <PageHeader 
        title="Class Schedule & Live Sessions" 
        description="View your internship schedule and join active secure Google Meet rooms."
      />

      <div className="premium-card" style={{ maxWidth: '900px', margin: '0 auto', padding: '1.75rem' }}>
        {loading ? (
          <SkeletonLoader variant="table" rows={3} />
        ) : schedule.length === 0 ? (
          <EmptyState 
            icon={<span style={{ fontSize: '2rem' }}>📅</span>}
            title="No classes scheduled" 
            description="No class schedule entries are available yet."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {schedule.map((item, idx) => {
              const canJoin = isWithinJoinWindow(item.class_date, item.start_time, item.end_time);
              const meetLink = item.meet_link || item.meeting_link;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  style={{
                    background: canJoin ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.08))' : 'var(--bg-nested)',
                    border: canJoin ? '1px solid #10b981' : '1px solid var(--border-color)',
                    padding: '1rem 1.25rem',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    transition: 'all 0.2s ease'
                  }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                      <span className="premium-badge premium-badge-info">
                        {item.session_type || "Domain"}
                      </span>
                      {canJoin && (
                        <span className="premium-badge premium-badge-active">
                          🟢 LIVE NOW
                        </span>
                      )}
                    </div>
                    <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: '0 0 2px 0' }}>{item.title || "Class Session"}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      📅 {formatDate(item.class_date)} &nbsp;|&nbsp; ⏰ {item.start_time} - {item.end_time || ""}
                    </p>
                  </div>

                  <div>
                    {canJoin && meetLink ? (
                      <a
                        href={meetLink.startsWith('http') ? meetLink : `https://${meetLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="premium-btn premium-btn-primary"
                        style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                      >
                        🔗 Connect
                      </a>
                    ) : (
                      <span className="premium-badge premium-badge-inactive" style={{ background: canJoin ? 'transparent' : 'var(--bg-subtle)' }}>
                        {canJoin ? "Link Pending" : (item.conducted ? "Conducted" : "Locked (10m Prior)")}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className={styles.buttons} style={{ marginTop: '1.5rem', textAlign: 'left' }}>
          <Link to="/student/mentor-details" className="premium-btn premium-btn-secondary">
            ← View Mentor Details
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ClassSchedule;