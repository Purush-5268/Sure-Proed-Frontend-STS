import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { requestService } from "../../services/requestService";
import { motion } from "framer-motion";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./ClassSchedule.module.css";

function ClassSchedule() {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [showLateJoinModal, setShowLateJoinModal] = useState(false);
  const [lateJoinReason, setLateJoinReason] = useState("");
  const [lateJoinClassId, setLateJoinClassId] = useState(null);
  const [isSubmittingLateJoin, setIsSubmittingLateJoin] = useState(false);

  const handleRequestPermission = async () => {
    if (!lateJoinReason.trim() || !lateJoinClassId) {
      alert("Please provide a reason for joining late.");
      return;
    }
    setIsSubmittingLateJoin(true);
    try {
      await requestService.createRequest({
        subject: `Late Join Request (Class ID: ${lateJoinClassId})`,
        description: lateJoinReason,
        category: 'ATTENDANCE'
      });
      alert("Permission request submitted successfully.");
      setShowLateJoinModal(false);
      setLateJoinReason("");
    } catch (error) {
      console.error("Permission request failed", error);
      alert(error?.response?.data?.detail || "Failed to submit permission request.");
    } finally {
      setIsSubmittingLateJoin(false);
    }
  };

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

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      let hours = parseInt(parts[0], 10);
      let mins = parts[1];
      let ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; 
      return `${hours}:${mins} ${ampm}`;
    }
    return timeStr;
  };

  const getClassStatus = (item) => {
    if (!item.class_date || !item.start_time) return { canJoin: false, label: "Invalid Time" };
    try {
      const now = new Date();
      const startDateTime = new Date(`${item.class_date}T${item.start_time}`);
      let endDateTime;
      if (item.end_time) {
        endDateTime = new Date(`${item.class_date}T${item.end_time}`);
      } else {
        endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours default
      }
      if (endDateTime < startDateTime) endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);

      const itemStatus = (item.class_status || item.status || "").toUpperCase();
      const effectiveStatus = (item.effective_status || "").toUpperCase();

      // Only trust backend status for Completed — NOT time alone.
      // If class_status is still SCHEDULED, admin hasn't ended it — keep it Ongoing.
      const isCompleted = (itemStatus === "COMPLETED" || itemStatus === "ENDED") ||
                          (effectiveStatus === "COMPLETED" && itemStatus !== "SCHEDULED");
      const isCancelled = itemStatus === "CANCELLED" || effectiveStatus === "CANCELLED";

      if (isCompleted) return { canJoin: false, label: "Completed" };
      if (isCancelled) return { canJoin: false, label: "Cancelled" };

      const windowOpenTime = new Date(startDateTime.getTime() - 10 * 60 * 1000);

      // Join allowed exactly between T-10 and T-0
      if (now >= windowOpenTime && now <= startDateTime) {
        return { canJoin: true, label: "Live Now" };
      }

      // Ongoing: any time after start — no upper bound until admin ends the class
      if (now > startDateTime) {
        return { canJoin: false, label: "Ask Admin (Late Join)" };
      }

      if (now < windowOpenTime) {
        const startsIn = Math.floor((startDateTime - now) / 60000);
        if (startsIn < 60) return { canJoin: false, label: `Starts in ${startsIn} min` };
        return { canJoin: false, label: "Upcoming" };
      }

      // Past the scheduled end time but admin hasn't ended it yet
      return { canJoin: false, label: "Ongoing" };
    } catch (e) {
      return { canJoin: false, label: "Error" };
    }
  };

  return (
    <div className="premium-page-container">
      <PageHeader 
        title="Class Schedule & Live Sessions" 
        description="View your internship schedule and join active secure Google Meet rooms."
      />

      <div className="premium-card" style={{ width: '100%', padding: '1.75rem' }}>
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
            <h2 className="sr-only">Scheduled Sessions</h2>
            {schedule.map((item, idx) => {
              const status = getClassStatus(item);
              const canJoin = status.canJoin;
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
                      📅 {formatDate(item.class_date)} &nbsp;|&nbsp; ⏰ {formatTime(item.start_time)} - {formatTime(item.end_time) || "Ongoing"}
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
                    ) : status.label.includes("Ask Admin") ? (
                      <button 
                        onClick={() => { setLateJoinClassId(item.id); setShowLateJoinModal(true); }}
                        className="premium-badge premium-badge-inactive" 
                        style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                      >
                        {status.label}
                      </button>
                    ) : (
                      <span className="premium-badge premium-badge-inactive" style={{ background: canJoin ? 'transparent' : 'var(--bg-subtle)' }}>
                        {status.label}
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
      {showLateJoinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 48px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', position: 'relative' }}>
            <button onClick={() => setShowLateJoinModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'var(--bg-nested)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: 'var(--text-primary)' }}>Request Late Join</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Please provide a reason for joining late. This will be reviewed by your mentor.</p>
            <textarea
              value={lateJoinReason}
              onChange={(e) => setLateJoinReason(e.target.value)}
              placeholder="E.g., I had an emergency..."
              style={{ width: '100%', minHeight: '100px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-nested)', color: 'var(--text-primary)', fontSize: '14px', resize: 'none', marginBottom: '20px', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleRequestPermission}
              disabled={isSubmittingLateJoin || !lateJoinReason.trim()}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--brand-color, #2563eb)', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: isSubmittingLateJoin || !lateJoinReason.trim() ? 'not-allowed' : 'pointer', opacity: isSubmittingLateJoin || !lateJoinReason.trim() ? 0.7 : 1, transition: '0.2s' }}
            >
              {isSubmittingLateJoin ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClassSchedule;