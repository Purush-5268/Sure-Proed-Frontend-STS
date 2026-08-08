import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getTodaySessions,
  joinSession,
  endSession,
  whitelistLateGuest,
} from "../../../services/trusteeService";
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
      const sessionsArray = await getTodaySessions();
      // Filter out completed ones, keep pending/active
      setActiveSessions(sessionsArray.filter((s) => s.status !== "Completed"));
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
      const res = await whitelistLateGuest(sessionId, [email.trim()]);
      alert(`✅ ${res.message || "Guest whitelisted"}`);
      setLateGuestEmails((prev) => ({ ...prev, [sessionId]: "" }));
      setShowLateInput((prev) => ({ ...prev, [sessionId]: false }));
    } catch (err) {
      alert("Failed to add guest: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleSpectate = async (sessionId) => {
    try {
      const res = await joinSession(sessionId);
      if (res.url) window.open(res.url, "_blank");
    } catch (err) {
      alert(
        "Cannot spectate right now. Link might still be generating: " +
          (err.response?.data?.detail || err.message)
      );
    }
  };

  const handleEndClass = async (sessionId) => {
    if (
      window.confirm(
        "Are you sure? This will permanently freeze attendance and generate the CSV."
      )
    ) {
      try {
        await endSession(sessionId);
        alert(
          "✅ SUCCESS\n\nSession ended. Attendance mathematically calculated and CSV is ready for download!"
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
                        <h4 className={styles.className}>{session.sessionType}</h4>
                        <p className={styles.classDetails}>
                          {session.streamName || "Global / Life Skills"}
                          {session.groupName && (
                            <span className={styles.groupBadge}>
                              | Group: {session.groupName}
                            </span>
                          )}
                        </p>
                      </td>
                      <td>
                        {new Date(cls.startTime).toLocaleTimeString()} -{" "}
                        {new Date(cls.endTime).toLocaleTimeString()}
                      </td>
                      <td>
                        <span className="badge badgePending">Active</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className={styles.actionColumn}>
                          <div className={styles.actionButtons}>
                            <button
                              className={styles.btnOutlineBlue}
                              onClick={() => handleToggleLateInput(cls.id)}
                            >
                              ➕ Add Guest
                            </button>
                            <button
                              className={styles.btnOutlineTeal}
                              onClick={() => handleSpectate(cls.id)}
                            >
                              👁️ Spectate
                            </button>
                            <button
                              className={styles.btnOutlineRed}
                              onClick={() => handleEndClass(cls.id)}
                            >
                              🛑 End Now
                            </button>
                          </div>
                          {showLateInput[cls.id] && (
                            <div className={styles.lateInputContainer}>
                              <input
                                type="email"
                                placeholder="Late guest email..."
                                value={lateGuestEmails[cls.id] || ""}
                                onChange={(e) =>
                                  handleEmailChange(cls.id, e.target.value)
                                }
                                className="formInput"
                              />
                              <button
                                className="btn btnPrimary"
                                onClick={() => handleAddLateGuest(cls.id)}
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
