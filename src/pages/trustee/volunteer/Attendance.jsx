import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAttendanceHierarchy,
  getRecentSessions,
  joinSession,
  endSession,
  downloadAttendanceCsv,
} from "../../../services/trusteeService";
import styles from "./Attendance.module.css";

function VolunteerAttendance() {
  const [hierarchy, setHierarchy] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDomain, setSelectedDomain] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const loadData = async () => {
    try {
      const [hierarchyData, sessionsData] = await Promise.all([
        getAttendanceHierarchy(),
        getRecentSessions(),
      ]);
      setHierarchy(hierarchyData || []);
      setActiveSessions(
        (sessionsData || []).filter(
          (s) =>
            s.status === "Pending" ||
            s.status === "Scheduled" ||
            s.status === "Active"
        )
      );
    } catch (err) {
      console.warn("Could not load attendance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleJoinClass = async (sessionId) => {
    try {
      const res = await joinSession(sessionId);
      if (res.url) window.open(res.url, "_blank");
    } catch (err) {
      alert("Cannot join right now: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleEndClass = async (sessionId) => {
    if (window.confirm("Are you sure you want to END this session?")) {
      try {
        await endSession(sessionId);
        alert("Session ended successfully!");
        loadData();
      } catch (err) {
        alert("Failed to end session: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  const handleDownloadCsv = async (sessionId, dateString) => {
    try {
      const formattedDate = new Date(dateString).toISOString().split("T")[0];
      const blob = await downloadAttendanceCsv(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Attendance_${formattedDate}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download CSV: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleGoBack = () => {
    if (selectedGroup) {
      setSelectedGroup(null);
    } else if (selectedDomain) {
      setSelectedDomain(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Historical Attendance</h2>
        <Link to="/trustee/volunteer/dashboard" className="btn btnSecondary">
          ← Back to Dashboard
        </Link>
      </div>

      {selectedDomain && (
        <div className={styles.breadcrumb}>
          <button className={styles.btnBack} onClick={handleGoBack}>
            ← Back
          </button>
          <span className={styles.crumbDomain}>{selectedDomain.domainName}</span>
          {selectedGroup && (
            <span className={styles.crumbGroup}>/ {selectedGroup.groupName}</span>
          )}
        </div>
      )}

      <div className={styles.mainCard}>
        {activeSessions.length > 0 && (
          <div className={styles.liveSessionsPanel}>
            <h3 className={styles.liveTitle}>
              🔴 LIVE SESSIONS REQUIRING ACTION
            </h3>
            <div className={styles.liveGrid}>
              {activeSessions.map((session) => (
                <div key={session.id} className={styles.liveCard}>
                  <div>
                    <p className={styles.liveName}>
                      {session.streamName || "Global Event"}
                      {session.groupName && (
                        <span className={styles.liveGroup}>
                          {" "}
                          | {session.groupName}
                        </span>
                      )}
                    </p>
                    <p className={styles.liveTime}>
                      Started: {new Date(session.startTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className={styles.liveActions}>
                    <button
                      className={styles.btnSpectate}
                      onClick={() => handleJoinClass(session.id)}
                    >
                      Spectate
                    </button>
                    <button
                      className={styles.btnEnd}
                      onClick={() => handleEndClass(session.id)}
                    >
                      🛑 End Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonLoader variant="table" rows={5} />
        ) : (
          <>
            {!selectedDomain && (
              <div className={styles.gridContainer}>
                <h3 className={styles.sectionTitle}>Select Domain or Event</h3>
                {hierarchy.length === 0 ? (
                  <div className={styles.emptyState}>
                    No attendance records generated yet.
                  </div>
                ) : (
                  <div className={styles.grid}>
                    {hierarchy.map((domain, idx) => (
                      <div
                        key={idx}
                        className={styles.domainCard}
                        onClick={() => {
                          setSelectedDomain(domain);
                          setSelectedGroup(null);
                        }}
                      >
                        <h4>{domain.domainName}</h4>
                        <p>{domain.groups?.length || 0} Groups / Batches</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedDomain && !selectedGroup && (
              <div className={styles.gridContainer}>
                <h3 className={styles.sectionTitle}>Select Target Group</h3>
                <div className={styles.grid}>
                  {selectedDomain.groups?.map((group, idx) => (
                    <div
                      key={idx}
                      className={styles.groupCard}
                      onClick={() => setSelectedGroup(group)}
                    >
                      <h4>{group.groupName}</h4>
                      <p>{group.sessions?.length || 0} Recorded Sessions</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedDomain && selectedGroup && (
              <div className={styles.gridContainer}>
                <h3 className={styles.sectionTitle}>Available Reports</h3>
                <div className={styles.listContainer}>
                  {selectedGroup.sessions?.map((session) => (
                    <div key={session.id} className={styles.sessionItem}>
                      <div>
                        <p className={styles.sessionDate}>
                          {new Date(session.startTime).toLocaleDateString(
                            undefined,
                            {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            }
                          )}
                        </p>
                        <p className={styles.sessionDetails}>
                          {new Date(session.startTime).toLocaleTimeString()} •
                          Duration: {session.expectedDurationMinutes} mins
                        </p>
                      </div>
                      <button
                        className={styles.btnDownload}
                        onClick={() =>
                          handleDownloadCsv(session.id, session.startTime)
                        }
                      >
                        Download CSV
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default VolunteerAttendance;
