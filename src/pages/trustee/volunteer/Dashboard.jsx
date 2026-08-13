import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { attendanceService } from "../../../services/attendanceService";
import { useAuth } from "../../../context/AuthContext";
import styles from "./Dashboard.module.css";

function VolunteerDashboard() {
  const { user } = useAuth();
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showLateInput, setShowLateInput] = useState({});
  const [lateGuestEmails, setLateGuestEmails] = useState({});

  const fetchLiveSessions = async () => {
    try {
      const res = await attendanceService.getAttendanceRecords({ status: "ACTIVE" });
      const sessionsArray = res.results || res || [];
      // Filter out completed ones, keep pending/active (backend filters this mostly, but just in case)
      setActiveSessions(sessionsArray.filter((s) => s.conducted !== false));
    } catch (err) {
      console.warn("Could not fetch live sessions", err);
      // Fallback for UI if backend is not running
      setActiveSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveSessions();
  }, []);

  const handleToggleLateInput = (sessionId) => {
    setShowLateInput((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  const handleEmailChange = (sessionId, value) => {
    setLateGuestEmails((prev) => ({ ...prev, [sessionId]: value }));
  };

  const handleAddLateGuest = async (sessionId) => {
    const email = lateGuestEmails[sessionId];
    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }
    try {
      const res = await attendanceService.whitelistGuest(sessionId, [email.trim()]);
      alert(`✅ ${res.message || "Guest whitelisted"}`);
      setLateGuestEmails((prev) => ({ ...prev, [sessionId]: "" }));
      setShowLateInput((prev) => ({ ...prev, [sessionId]: false }));
    } catch (err) {
      alert("Failed to add guest: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleSpectate = (session) => {
    if (session.meeting_link) {
      window.open(
        session.meeting_link.startsWith('http') ? session.meeting_link : `https://${session.meeting_link}`, 
        "_blank"
      );
    } else {
      alert("Cannot spectate right now. Link might still be generating.");
    }
  };

  const handleEndClass = async (sessionId) => {
    if (
      window.confirm(
        "Are you sure? This will permanently freeze attendance and generate the CSV."
      )
    ) {
      try {
        await attendanceService.patchAttendanceRecord(sessionId, { conducted: false });
        alert(
          "✅ SUCCESS\n\nSession ended. Reports are being generated in the background."
        );
        fetchLiveSessions();
      } catch (err) {
        alert("Failed to end session: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  const volunteerName = user?.firstName || user?.first_name || "Volunteer";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Command Center</h1>
        <p>Manage scheduling, track attendance, and moderate users globally.</p>
      </div>

      <div className={styles.statsGrid}>
        <Link to="/trustee/volunteer/alerts" className={styles.statCardAlerts}>
          <div className={styles.iconAlerts}>⚠️</div>
          <h3>System Alerts</h3>
          <p>Monitor students with critically low attendance.</p>
        </Link>

        <Link to="/trustee/volunteer/schedule" className={styles.statCardSchedule}>
          <div className={styles.iconSchedule}>📅</div>
          <h3>Schedule Classes</h3>
          <p>Generate Google Meet links for Global LST sessions or specific batches.</p>
        </Link>

        <Link to="/trustee/volunteer/attendance" className={styles.statCardAttendance}>
          <div className={styles.iconAttendance}>📊</div>
          <h3>Attendance & CSV</h3>
          <p>Navigate the domain hierarchy to download historical attendance reports.</p>
        </Link>

        <Link to="/trustee/volunteer/users" className={styles.statCardUsers}>
          <div className={styles.iconUsers}>🛡️</div>
          <h3>User Moderation</h3>
          <p>View the global student directory and permanently remove users.</p>
        </Link>
      </div>

      <div className={styles.radarSection}>
        <h2 className={styles.radarTitle}>
          <span className={styles.radarPingWrapper}>
            <span className={styles.radarPing}></span>
            <span className={styles.radarDot}></span>
          </span>
          Live Spectator Radar
        </h2>

        <div className={styles.radarCard}>
          {loading ? (
            <div className="skeleton-shimmer" style={{height: "200px", width: "100%", borderRadius: "8px"}}></div>
          ) : activeSessions.length === 0 ? (
            <div className="premium-empty-state">
              <div className="premium-empty-state-icon">📡</div>
              <h3>No active classes</h3>
              <p>The radar is clear. No sessions are currently live.</p>
            </div>
          ) : (
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Class Details</th>
                    <th>Date / Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSessions.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <h4 className={styles.className}>{session.title || session.class_type}</h4>
                        <p className={styles.classDetails}>
                          {session.class_type === "DOMAIN" ? "Domain Session" : session.class_type}
                          {session.lst_batch && (
                            <span className={styles.groupBadge}>
                              | Batch: {session.lst_batch}
                            </span>
                          )}
                        </p>
                      </td>
                      <td>
                        {session.start_time} - {session.end_time}
                      </td>
                      <td>
                        <span className="badge badgePending">Active</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className={styles.actionColumn}>
                          <div className={styles.actionButtons}>
                            <button
                              className={styles.btnOutlineBlue}
                              onClick={() => handleToggleLateInput(session.id)}
                            >
                              ➕ Add Guest
                            </button>
                            <button
                              className={styles.btnOutlineTeal}
                              onClick={() => handleSpectate(session)}
                            >
                              👁️ Spectate
                            </button>
                            <button
                              className={styles.btnOutlineRed}
                              onClick={() => handleEndClass(session.id)}
                            >
                              🛑 End Now
                            </button>
                          </div>
                          {showLateInput[session.id] && (
                            <div className={styles.lateInputContainer}>
                              <input
                                type="email"
                                placeholder="Late guest email..."
                                value={lateGuestEmails[session.id] || ""}
                                onChange={(e) =>
                                  handleEmailChange(session.id, e.target.value)
                                }
                                className="formInput"
                              />
                              <button
                                className="btn btnPrimary"
                                onClick={() => handleAddLateGuest(session.id)}
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VolunteerDashboard;
