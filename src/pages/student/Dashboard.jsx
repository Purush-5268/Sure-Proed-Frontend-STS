import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import { attendanceService } from "../../services/attendanceService";
import styles from "./Dashboard.module.css";

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [todayClasses, setTodayClasses] = useState([]);
  const [availableResources, setAvailableResources] = useState([]);
  const [isJoining, setIsJoining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboardData() {
      if (!user?.email) return;
      try {
        // Fetch Profile
        const res = await studentService.getStudentProfiles();
        const data = res?.data || res;
        const profileObj = Array.isArray(data?.results) ? data.results[0] : (Array.isArray(data) ? data[0] : data);
        if (isMounted) setProfile(profileObj || {});

        // Fetch Classes (This runs silently every 10s to ensure Light-Speed updates)
        const sessionsRes = await attendanceService.getAttendanceRecords({ status: "ACTIVE" });
        if (sessionsRes && (sessionsRes.data || sessionsRes.results)) {
          const rawData = sessionsRes.data || sessionsRes;
          const sessionsArray = Array.isArray(rawData.results) ? rawData.results : (Array.isArray(rawData) ? rawData : []);
          if (isMounted) setTodayClasses(sessionsArray);
        }

        // Fetch Warnings
        const warningsRes = await attendanceService.getWarnings();
        if (Array.isArray(warningsRes) && isMounted) {
          setWarnings(warningsRes);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    // Initial Fetch
    fetchDashboardData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleJoinClass = async (cls) => {
    setIsJoining(true);
    try {
      await attendanceService.markJoined(cls.id);
      localStorage.setItem('active_session_id', cls.id);
      window.dispatchEvent(new Event('session_started'));
    } catch (err) {
      console.error("Failed to mark joined", err);
    }
    setTimeout(() => {
      setIsJoining(false);
      window.open(cls.meeting_link.startsWith('http') ? cls.meeting_link : `https://${cls.meeting_link}`, '_blank');
    }, 1000);
  };

  const handleDownload = (fileName) => {
    alert(`Initiating download for ${fileName}...`);
  };

  if (isLoading) {
    return (
      <div className={styles.skeletonContainer}>
        <div className={`${styles.skeletonBox} ${styles.skeletonHeader}`}></div>
        <div className={styles.skeletonBox} style={{ height: '240px' }}></div>
        <div className={styles.skeletonBox}></div>
      </div>
    );
  }

  // 🚨 LOCK SCREEN LOGIC 🚨
  const isLocked = profile?.status === "NOT_AVAILABLE" || profile?.status === "BUSY";
  const isRevoked = profile?.status === "NOT_AVAILABLE" && profile?.domain;

  if (isLocked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ background: 'rgba(20,20,25,0.9)', padding: '40px', borderRadius: '24px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '500px' }}>
          <h2 style={{ color: '#fff', fontSize: '24px', marginBottom: '16px' }}>{isRevoked ? "Access Revoked" : "Account Pending Verification"}</h2>
          <p style={{ color: '#94a3b8', lineHeight: '1.6', marginBottom: '24px' }}>
            {isRevoked
              ? "Your access has been temporarily revoked by an administrator."
              : "Your account is created. An administrator is currently verifying your profile."}
          </p>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', color: '#a78bfa' }}>
            <strong>Domain:</strong> {profile?.domain || "N/A"}
          </div>
        </div>
      </div>
    );
  }

  // 🚨 ACTIVE DASHBOARD 🚨
  return (
    <div className={styles.dashboardContainer}>

      {/* Sleek Glass Header */}
      <header className={styles.header}>
        <div>
          <h1>
            Welcome, {`${profile?.firstName || user?.first_name || ""} ${profile?.lastName || user?.last_name || ""}`.trim() || "Student"}!
          </h1>
          <p>📍 {profile?.collegeName || "SURE ProEd Dashboard"}</p>
        </div>
        <div className={styles.roleBadge}>Student Portal</div>
      </header>

      {/* Smart Bento Grid Layout */}
      <div className={styles.immersiveHero}>

        {/* Left Side: Domain Stream Info */}
        <div className={styles.heroContent}>
          <p className={styles.streamLabel}>Assigned Stream</p>
          <h2 className={styles.streamTitle}>{profile?.domain || "General Tech Domain"}</h2>
          
          {/* New Dynamic Batch & Mentor Badges */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--primary-color)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              📦 BATCH: {profile?.courseBatch || profile?.course_batch || "PENDING"}
            </span>
            <span style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
              🧑‍🏫 MENTOR: {profile?.mentorName || profile?.assigned_mentor_name || "Unassigned"}
            </span>
          </div>

          <p className={styles.streamSubtitle}>Access your exclusive live mentoring sessions, track your progress, and master your domain concepts.</p>
        </div>

        {/* Right Side: Live Radar Widget */}
        <div className={styles.floatingLiveSection}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.radarIcon}></span> Live Class Radar
          </h3>

          {todayClasses.length === 0 ? (
            <div className={styles.cleanStatus}>
              No active or rescheduled sessions detected.
            </div>
          ) : (
            todayClasses.map((cls, idx) => {
              const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
              const now = new Date();

              // Window opens 10 mins before, Strict lock at 7 mins after start!
              const windowOpenTime = new Date(classStart.getTime() - 10 * 60 * 1000);
              const lateCutoffTime = new Date(classStart.getTime() + 7 * 60 * 1000);

              const classOpen = cls.conducted !== false &&
                cls.status !== 'COMPLETED' &&
                cls.status !== 'ENDED' &&
                now >= windowOpenTime &&
                now <= lateCutoffTime;

              const hasEnded = cls.conducted === false ||
                cls.status === 'COMPLETED' ||
                cls.status === 'ENDED' ||
                now > lateCutoffTime;

              // Hide completely if 30 mins past cutoff or explicitly ended
              if (hasEnded && (now - lateCutoffTime) / 1000 / 60 > 30) return null;
              if (cls.conducted === false) return null; // Instantly disappears if mentor clicks End Class

              return (
                <div key={idx} className={styles.classCardWrapper}>
                  <div className={styles.glassRow}>
                    <div className={styles.glassInfo}>
                      <h4>{cls.title || cls.session_type || "Domain Session"}</h4>
                      <p>🕒 {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>

                    {classOpen ? (
                      <button onClick={() => handleJoinClass(cls)} disabled={isJoining || !cls.meeting_link} className={styles.btnExtreme}>
                        {!isJoining ? 'Join Live' : 'Connecting...'}
                      </button>
                    ) : hasEnded ? (
                      <span className={styles.statusEnded}>Session Locked</span>
                    ) : (
                      <span className={styles.statusWaiting}>Opens 10m Prior</span>
                    )}
                  </div>

                  <div className={styles.classInstructions}>
                    <p>📸 <strong>Rule:</strong> Camera must be ON for attendance.</p>
                    <p>⏱️ <strong>Tracking:</strong> Logged via active meeting presence.</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Resources Section */}
      <div className={styles.minimalResources}>
        <h3 className={styles.sectionTitleDark}>Domain Resources & Materials</h3>
        {availableResources.length === 0 ? (
          <p style={{ color: '#64748b', margin: 0 }}>Your trainer hasn't uploaded materials yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {availableResources.map((file, idx) => (
              <div key={idx} className={styles.cleanResourceRow}>
                <span style={{ fontSize: '20px' }}>📄</span>
                <span className={styles.fileName}>{file.name}</span>
                <button onClick={() => handleDownload(file.name)} className={styles.cleanDownloadBtn}>Download</button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

export default Dashboard;