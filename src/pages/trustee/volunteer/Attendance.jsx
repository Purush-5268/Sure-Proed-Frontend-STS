import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { attendanceService } from "../../../services/attendanceService";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import styles from "./Attendance.module.css";

function VolunteerAttendance() {
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDomain, setSelectedDomain] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const loadData = async () => {
    try {
      // We fetch ALL records, or just ACTIVE if desired. For history we need all.
      const res = await attendanceService.getAttendanceRecords();
      const sessionsData = res.results || res || [];
      
      const active = sessionsData.filter((s) => s.conducted !== false);
      const past = sessionsData.filter((s) => s.conducted === false);
      
      // Build hierarchy: Domain/Type -> Group/Batch -> Sessions
      const hierarchyMap = {};
      
      past.forEach((session) => {
        const domainName = session.course?.name || session.class_type || "General";
        const groupName = session.lst_batch ? `Batch ${session.lst_batch}` : (session.title || "Main Group");
        
        if (!hierarchyMap[domainName]) {
          hierarchyMap[domainName] = { domainName, groupsMap: {} };
        }
        
        if (!hierarchyMap[domainName].groupsMap[groupName]) {
          hierarchyMap[domainName].groupsMap[groupName] = { groupName, sessions: [] };
        }
        
        hierarchyMap[domainName].groupsMap[groupName].sessions.push(session);
      });
      
      // Convert map to array
      const builtHierarchy = Object.values(hierarchyMap).map((d) => ({
        domainName: d.domainName,
        groups: Object.values(d.groupsMap)
      }));
      
      setHierarchy(builtHierarchy);
      setActiveSessions(active);
    } catch (err) {
      console.warn("Could not load attendance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleJoinClass = (session) => {
    if (session.meeting_link) {
      window.open(
        session.meeting_link.startsWith('http') ? session.meeting_link : `https://${session.meeting_link}`, 
        "_blank"
      );
    } else {
      alert("Cannot join right now: meeting link not found.");
    }
  };

  const handleEndClass = async (sessionId) => {
    if (window.confirm("Are you sure you want to END this session?")) {
      try {
        await attendanceService.patchAttendanceRecord(sessionId, { conducted: false });
        alert("Session ended successfully. Reports are generating.");
        loadData();
      } catch (err) {
        alert("Failed to end session: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  const handleDownloadExcel = async (sessionId, dateString) => {
    try {
      const response = await attendanceService.downloadExcel(sessionId);

      // Check if status is 202 (Report Generating)
      if (response.status === 202) {
        let detailMessage = "Report is being generated in the background. Please retry in a few seconds.";
        if (response.data instanceof Blob && response.data.type === 'application/json') {
          const text = await response.data.text();
          const json = JSON.parse(text);
          if (json.detail) detailMessage = json.detail;
        } else if (response.data && response.data.detail) {
          detailMessage = response.data.detail;
        }
        alert(`⏳ ${detailMessage}`);
        return; 
      }

      if (response.data instanceof Blob && response.data.type === 'application/json') {
        const text = await response.data.text();
        const json = JSON.parse(text);
        alert(json.detail || "Report is not ready or missing.");
        return; 
      }

      const formattedDate = dateString ? new Date(dateString).toISOString().split("T")[0] : "Report";
      let filename = `Attendance_${formattedDate}.xlsx`;
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel download error:", err);
      let errorMsg = "Failed to download the report. Make sure the session has ended.";
      try {
        const errData = err.response?.data;
        if (errData instanceof Blob) {
          const text = await errData.text();
          const json = JSON.parse(text);
          errorMsg = json.detail || json.message || errorMsg;
        } else if (errData?.detail || errData?.message) {
          errorMsg = errData.detail || errData.message;
        }
      } catch (e) {
        // Fallback if parsing fails
      }
      alert(`Attendance download failed: ${errorMsg}`);
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
                      {session.title || session.class_type || "Global Event"}
                      {session.lst_batch && (
                        <span className={styles.liveGroup}>
                          {" "}
                          | {session.lst_batch}
                        </span>
                      )}
                    </p>
                    <p className={styles.liveTime}>
                      Time: {session.start_time} - {session.end_time}
                    </p>
                  </div>
                  <div className={styles.liveActions}>
                    <button
                      className={styles.btnSpectate}
                      onClick={() => handleJoinClass(session)}
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
                          {new Date(session.class_date || session.startTime).toLocaleDateString(
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
                          {session.start_time} - {session.end_time}
                        </p>
                      </div>
                      <button
                        className={styles.btnDownload}
                        onClick={() =>
                          handleDownloadExcel(session.id, session.class_date)
                        }
                      >
                        Download Excel
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
