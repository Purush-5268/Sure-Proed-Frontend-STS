import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AttendanceDetails.module.css";
import SkeletonLoader from "../../../components/common/SkeletonLoader";

function AttendanceDetails() {
  const location = useLocation();
  const sessionId = location.state?.sessionId;

  const [sessionData, setSessionData] = useState(null);
  const [officialData, setOfficialData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 🚨 Whitelist Management State
  const [guestEmailInput, setGuestEmailInput] = useState("");
  const [isWhitelisting, setIsWhitelisting] = useState(false);

  // 🚨 Prior Permission State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionStudentId, setPermissionStudentId] = useState(null);
  const [permissionStudentName, setPermissionStudentName] = useState("");
  const [permissionReason, setPermissionReason] = useState("");
  const [isSubmittingPermission, setIsSubmittingPermission] = useState(false);

  const [syncToastMessage, setSyncToastMessage] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveParticipant, setResolveParticipant] = useState(null);
  const [selectedResolveStudentId, setSelectedResolveStudentId] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    let interval;
    if (isSyncing) {
      interval = setInterval(async () => {
        try {
          const res = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/official-attendance/`);
          if (res.data && res.data.status === "READY") {
            setOfficialData(res.data);
            setIsSyncing(false);
            setSyncToastMessage("Identity sync completed.");
            setTimeout(() => setSyncToastMessage(null), 4000);
          } else if (res.data && res.data.status === "ATTENDANCE_FAILED") {
            setIsSyncing(false);
            setSyncToastMessage("Identity sync failed.");
            setTimeout(() => setSyncToastMessage(null), 4000);
          }
        } catch (e) {
          console.warn("Polling error:", e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isSyncing, sessionId]);


  // 🚨 ADDED SEND WARNING LOGIC
  const handleSendWarning = async (studentId, studentName) => {
    const customNote = window.prompt(`Type a warning message for ${studentName}:`, `Warning: Your attendance is below 95%. Please explain your absence.`);

    if (!customNote) return; // Admin cancelled the prompt

    try {
      // 🚨 Ensure your backend endpoint is ready for this route
      await apiClient.post('/api/attendance/warnings/create/', {
        student_id: studentId,
        session_id: sessionId,
        note: customNote
      });
      alert(`Warning successfully sent to ${studentName}!`);
    } catch (error) {
      console.error("Failed to send warning:", error);
      alert("Warning logic triggered! (Make sure backend endpoint is ready to receive it)");
    }
  };

  const handleOpenPermissionModal = (studentId, studentName) => {
    setPermissionStudentId(studentId);
    setPermissionStudentName(studentName);
    setPermissionReason("");
    setShowPermissionModal(true);
  };

  const handleGrantPermission = async (e) => {
    e.preventDefault();
    if (!permissionReason.trim()) {
      alert("Please provide a reason.");
      return;
    }
    setIsSubmittingPermission(true);
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/grant-prior-permission/`, {
        student_id: permissionStudentId,
        reason: permissionReason
      });
      alert(`Prior permission granted successfully for ${permissionStudentName}.`);
      setShowPermissionModal(false);
      fetchSessionDetails();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to grant prior permission.");
    } finally {
      setIsSubmittingPermission(false);
    }
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedResolveStudentId || !resolveParticipant) return;
    
    setIsResolving(true);
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/resolve-identity/`, {
        student_id: selectedResolveStudentId,
        participant_email: resolveParticipant.email !== "N/A" ? resolveParticipant.email : null,
        participant_name: resolveParticipant.name
      });
      alert(`Identity resolved successfully.`);
      setShowResolveModal(false);
      setResolveParticipant(null);
      setSelectedResolveStudentId("");
      fetchSessionDetails();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to resolve identity.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleRevokePermission = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to revoke prior permission for ${studentName}?`)) return;
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/revoke-prior-permission/`, {
        student_id: studentId
      });
      alert(`Prior permission revoked successfully for ${studentName}.`);
      fetchSessionDetails();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to revoke prior permission.");
    }
  };

  const fetchSessionDetails = async (forceRefresh = false) => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    try {
      const [baseResponse, officialResponse] = await Promise.all([
        apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/`),
        apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/official-attendance/${forceRefresh ? '?force_refresh=true' : ''}`).catch(err => {
          console.warn("Could not fetch official attendance:", err);
          return { data: null };
        })
      ]);
      setSessionData(baseResponse.data);
      if (officialResponse.data && officialResponse.data.status === "READY") {
        setOfficialData(officialResponse.data);
      } else if (officialResponse.data && (officialResponse.data.status === "SYNC_QUEUED" || officialResponse.data.status === "SYNC_IN_PROGRESS")) {
        setSyncToastMessage(officialResponse.data.message || "Identity sync started. You can continue working.");
        setIsSyncing(true);
      }
    } catch (err) {
      console.error("Failed to load session attendance details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionDetails();
  }, [sessionId]);

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!guestEmailInput.trim()) return;

    setIsWhitelisting(true);
    try {
      const emailsArray = guestEmailInput
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));

      if (emailsArray.length === 0) {
        alert("Please enter valid email addresses.");
        setIsWhitelisting(false);
        return;
      }

      // Call the add-attendees endpoint
      const response = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/add-attendees/`, { emails: emailsArray });
      
      alert(response.data.message || "Guests successfully whitelisted!");
      setGuestEmailInput("");
      
      // Reload session to reflect updated whitelist count
      await fetchSessionDetails();
    } catch (error) {
      console.error("Failed to whitelist guests:", error);
      alert(error.response?.data?.detail || error.response?.data?.error || "Failed to whitelist guests.");
    } finally {
      setIsWhitelisting(false);
    }
  };

  if (loading) {
    return <div className={styles.container}><SkeletonLoader variant="detail" /></div>;
  }

  if (!sessionData) {
    return (
      <div className={styles.container}>
        <div className="premium-card">
          <p>No session selected or record not found.</p>
          <Link to="/trustee/volunteer/attendance" className={styles.backBtn}>Back</Link>
        </div>
      </div>
    );
  }

  const expectedCount = sessionData.google_total_students ?? (Array.isArray(sessionData.attendees) ? sessionData.attendees.length : 0);
  const joinedCount = sessionData.google_joined_count ?? (Array.isArray(sessionData.joined_students) ? sessionData.joined_students.length : 0);

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Attendance Details</h1>
          <Link to="/trustee/volunteer/attendance">Back</Link>
        </div>

        <div className={styles.grid}>
          <div>
            <label>Session Title</label>
            <p>{sessionData.title}</p>
          </div>

          <div>
            <label>Date</label>
            <p>{sessionData.class_date}</p>
          </div>

          <div>
            <label>Expected Students</label>
            <p>{sessionData.actual_student_count || 0}</p>
          </div>

          <div>
            <label>Whitelisted Emails</label>
            <p>{sessionData.whitelist_email_count || 0}</p>
          </div>
          
          <div>
            <label>Calendar Invitees (Inc. Staff/Guests)</label>
            <p>{sessionData.total_attendee_count || 0}</p>
          </div>

          <div>
            <label>Total Joined Students</label>
            <p>{joinedCount}</p>
          </div>
          
          <div>
            <label>Meet Start Time</label>
            <p>
              {sessionData.start_time
                ? new Date(`${sessionData.class_date}T${sessionData.start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : "Not available yet"}
            </p>
          </div>

          <div>
            <label>Meet End Time</label>
            <p>
              {sessionData.end_time
                ? new Date(`${sessionData.class_date}T${sessionData.end_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : "Not available yet"}
            </p>
          </div>

          <div>
            <label>Status</label>
            <span className={
              sessionData.effective_status === 'CANCELLED' || sessionData.class_status === 'CANCELLED' || sessionData.status === 'CANCELLED' ? styles.absent :
              sessionData.status === 'ATTENDANCE_PENDING' ? styles.pending :
              sessionData.status === 'ATTENDANCE_FAILED' ? styles.absent :
              sessionData.effective_status === 'COMPLETED' || sessionData.class_status === 'COMPLETED' || sessionData.status === 'COMPLETED' ? styles.absent :
              styles.present
            }>
              {sessionData.effective_status === 'CANCELLED' || sessionData.class_status === 'CANCELLED' || sessionData.status === 'CANCELLED' ? "Class Cancelled" :
               sessionData.status === 'ATTENDANCE_PENDING' ? "Generating Meet Link..." :
               sessionData.status === 'ATTENDANCE_FAILED' ? "Generation Failed" :
               sessionData.effective_status === 'COMPLETED' || sessionData.class_status === 'COMPLETED' || sessionData.status === 'COMPLETED' ? "Completed / Ended" :
               "Active"}
            </span>
          </div>
        </div>

        {/* 🚨 WHITELIST MANAGEMENT UI */}
        <div style={{ marginTop: '30px', padding: '20px', background: 'var(--bg-nested)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '10px', color: 'var(--text-primary)' }}>Whitelist External Guests</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
            Add emails (comma separated) to allow them to bypass the waiting room. Changes will sync to Google Calendar automatically in the background.
          </p>
          <form onSubmit={handleAddGuest} style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              placeholder="e.g. guest1@example.com, guest2@example.com" 
              value={guestEmailInput}
              onChange={(e) => setGuestEmailInput(e.target.value)}
              className="premium-input"
              style={{ flex: 1 }}
            />
            <button 
              type="submit" 
              className="premium-btn premium-btn-secondary" 
              disabled={isWhitelisting || !guestEmailInput.trim()}
            >
              {isWhitelisting ? "Syncing..." : "+ Add Guests"}
            </button>
          </form>
        </div>

        {/* 🚨 OFFICIAL ATTENDANCE ROSTER */}
        <div style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Official Attendance Roster</h2>
            <button 
              onClick={(e) => {
                const btn = e.currentTarget;
                if (isSyncing) return;
                btn.innerText = "Syncing...";
                btn.style.opacity = "0.7";
                fetchSessionDetails(true).then(() => {
                  btn.innerText = "↻ Sync Identities";
                  btn.style.opacity = "1";
                });
              }}
              id="sync-identities-btn"
              disabled={isSyncing}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '4px',
                fontSize: '13px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s'
              }}
            >
              ↻ Sync Identities
            </button>
          </div>
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Attendance</th>
                  <th>Identity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {officialData && officialData.expected_students ? (
                  Object.values(officialData.expected_students).map((student, idx) => {
                    const attPercentage = student.attendance_percentage || 0;
                    const hasPriorPermission = student.prior_permission?.has_permission === true;
                    const isSuspended = student.status === "BELOW_THRESHOLD";
                    const isWarning = student.status === "PRESENT" && attPercentage < 95;
                    const isAbsent = student.status === "ABSENT";
                    const isReviewReq = student.status === "IDENTITY_REVIEW_REQUIRED";

                    // Determine visual state based on permission
                    const rowBg = hasPriorPermission ? "rgba(59, 130, 246, 0.05)" : (isAbsent ? "rgba(239, 68, 68, 0.15)" : (isSuspended ? "rgba(239, 68, 68, 0.05)" : isReviewReq ? "rgba(245, 158, 11, 0.1)" : "transparent"));
                    
                    // Map identity badge names
                    let identityLabel = "—";
                    if (student.match_method) {
                      switch (student.match_method) {
                        case "PORTAL_TIE_BREAK": identityLabel = "Portal Tie-Break"; break;
                        case "EMAIL": identityLabel = "Email"; break;
                        case "DIRECTORY": identityLabel = "Directory"; break;
                        case "NAME": identityLabel = "Name"; break;
                        default: identityLabel = student.match_method;
                      }
                    }

                    return (
                      <tr key={student.student_id || idx} style={{ background: rowBg }}>
                        <td style={{ verticalAlign: "middle" }}>
                          <div style={{ fontWeight: "500", display: "flex", alignItems: "center", gap: "8px" }}>
                            {student.name || `Student ID: ${student.student_id}`}
                            {hasPriorPermission && (
                              <span style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", border: "1px solid #bfdbfe" }}>
                                🛡️ Exempt
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{student.email || "Email Hidden"}</div>
                        </td>
                        <td style={{ verticalAlign: "middle", color: (!hasPriorPermission && (isSuspended || isAbsent)) ? "#ef4444" : "inherit", fontWeight: (!hasPriorPermission && (isSuspended || isAbsent)) ? "bold" : "normal" }}>
                          {attPercentage}%
                        </td>
                        <td style={{ verticalAlign: "middle" }}>
                          {isAbsent ? (
                            "—"
                          ) : isReviewReq ? (
                            <span style={{ color: "#d97706", fontSize: "12px", fontWeight: "bold" }}>⚠ Review Required</span>
                          ) : (
                            <span style={{ color: "#10b981", fontSize: "12px", fontWeight: "bold", background: "rgba(16, 185, 129, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                              ✓ {identityLabel}
                            </span>
                          )}
                        </td>
                        <td style={{ verticalAlign: "middle" }}>
                          {hasPriorPermission ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                               <span style={{ color: "#2563eb", fontSize: "12px", fontWeight: "bold" }}>Prior Permission</span>
                               <button onClick={() => handleRevokePermission(student.student_id, student.name)} style={{ background: "transparent", color: "#ef4444", border: "1px solid #fca5a5", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Revoke</button>
                            </div>
                          ) : isReviewReq ? (
                            <span style={{ color: "#d97706", fontSize: "12px", fontWeight: "bold" }}>Requires Admin Review</span>
                          ) : isSuspended || isAbsent || isWarning ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: isWarning ? "#f59e0b" : "#ef4444", fontSize: "12px", fontWeight: "bold" }}>
                                {isAbsent ? "⚠️ Absent" : isSuspended ? "⚠️ Below Threshold" : "⚠️ Warning"}
                              </span>
                              <button
                                onClick={() => handleSendWarning(student.student_id, student.name)}
                                style={{
                                  background: "#ef4444", color: "white", border: "none",
                                  padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                                  fontWeight: "bold", cursor: "pointer", transition: "all 0.2s ease"
                                }}
                                onMouseOver={(e) => e.target.style.background = "#dc2626"}
                                onMouseOut={(e) => e.target.style.background = "#ef4444"}
                              >
                                Send Warning
                              </button>
                              <button
                                onClick={() => handleOpenPermissionModal(student.student_id, student.name)}
                                style={{
                                  background: "#3b82f6", color: "white", border: "none",
                                  padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                                  fontWeight: "bold", cursor: "pointer", transition: "all 0.2s ease"
                                }}
                              >
                                + Prior Permission
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: "#10b981", fontSize: "12px", fontWeight: "bold" }}>✅ Good</span>
                              <button onClick={() => handleOpenPermissionModal(student.student_id, student.name)} style={{ background: "transparent", color: "#3b82f6", border: "1px solid #bfdbfe", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Grant Exemption</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  // FALLBACK TO LEGACY DATA IF OFFICIAL ATTENDANCE IS NOT READY
                  (sessionData.attendance_summaries || sessionData.attendees || []).map((student, idx) => {
                    const isObject = typeof student === 'object' && student !== null;
                    const studentId = isObject ? (student.student_id || student.id) : student;
                    const studentName = isObject ? (student.firstName || student.name || student.user?.first_name || `Student ID: ${studentId}`) : `Student ID: ${studentId}`;
                    const studentEmail = isObject ? (student.email || student.user?.email || "Email Hidden") : "Email Hidden";

                    const isJoined = Array.isArray(sessionData.joined_students) && sessionData.joined_students.some(js => js === studentId || (typeof js === 'object' && js.id === studentId));
                    const attPercentage = isObject && student.attendance_percentage !== undefined ? student.attendance_percentage : (isJoined ? 100 : 0);
                    const isLowAttendance = attPercentage > 0 && attPercentage < 40;
                    const isAbsent = attPercentage === 0 || (student.status && student.status.toUpperCase() === 'ABSENT');

                    return (
                      <tr key={studentId || idx} style={{ background: isAbsent ? "rgba(239, 68, 68, 0.15)" : isLowAttendance ? "rgba(239, 68, 68, 0.05)" : "transparent" }}>
                        <td style={{ verticalAlign: "middle" }}>
                          <div style={{ fontWeight: "500" }}>{studentName}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{studentEmail}</div>
                        </td>
                        <td style={{ verticalAlign: "middle", color: isLowAttendance || isAbsent ? "#ef4444" : "inherit", fontWeight: isLowAttendance || isAbsent ? "bold" : "normal" }}>
                          {attPercentage}%
                        </td>
                        <td style={{ verticalAlign: "middle" }}>—</td>
                        <td style={{ verticalAlign: "middle" }}>
                          {isLowAttendance ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: "bold" }}>⚠️ Below Threshold</span>
                              <button onClick={() => handleSendWarning(studentId, studentName)} style={{ background: "#ef4444", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Send Warning</button>
                            </div>
                          ) : isAbsent ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: "bold" }}>⚠️ Absent</span>
                              <button onClick={() => handleSendWarning(studentId, studentName)} style={{ background: "#ef4444", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Send Warning</button>
                            </div>
                          ) : (
                            <span style={{ color: "#10b981", fontSize: "12px", fontWeight: "bold" }}>✅ Good</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
                
                {(!officialData && !sessionData.attendance_summaries && !sessionData.attendees?.length) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      No student data available for this session.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🚨 EXCEPTIONS QUEUE (UNRESOLVED) */}
        {officialData && officialData.unmatched_participants && officialData.unmatched_participants.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--text-primary)', display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#f59e0b" }}>⚠</span> Participants Requiring Review ({officialData.unmatched_participants.length})
            </h2>
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Google Name</th>
                    <th>Email</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {officialData.unmatched_participants.map((unmatched, idx) => {
                    const isAmbiguous = unmatched.ambiguity_reason && unmatched.ambiguity_reason.toLowerCase().includes("multiple");
                    
                    const formatTime = (isoString) => {
                      if (!isoString) return "N/A";
                      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    };

                    const timeStr = (unmatched.join_time && unmatched.leave_time) 
                      ? `${formatTime(unmatched.join_time)} – ${formatTime(unmatched.leave_time)}` 
                      : "N/A";

                    return (
                      <tr key={idx} style={{ background: "rgba(245, 158, 11, 0.05)" }}>
                        <td style={{ verticalAlign: "middle" }}>
                          <div style={{ fontWeight: "bold" }}>{unmatched.name || "Unknown"}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                            Reason: {unmatched.ambiguity_reason || "No deterministic identity evidence"}
                          </div>
                        </td>
                        <td style={{ verticalAlign: "middle" }}>
                          {(!unmatched.email || unmatched.email === "N/A") ? (
                            <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>No Email Provided</span>
                          ) : unmatched.email}
                        </td>
                        <td style={{ verticalAlign: "middle" }}>{timeStr}</td>
                        <td style={{ verticalAlign: "middle" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span style={{ color: "#d97706", fontSize: "12px", fontWeight: "bold" }}>
                              {isAmbiguous ? "⚠ Ambiguous" : "⚠ Unresolved"}
                            </span>
                            <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>Requires Admin Review</span>
                            <button 
                              onClick={() => {
                                setResolveParticipant(unmatched);
                                setShowResolveModal(true);
                              }}
                              className="premium-btn" 
                              style={{ background: '#d97706', fontSize: '11px', padding: '4px 8px', marginTop: '4px', width: 'fit-content' }}
                            >
                              {isAmbiguous ? "Resolve Ambiguity" : "Resolve Identity"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={styles.buttons} style={{ marginTop: '24px' }}>
          <Link to="/trustee/volunteer/update-attendance" className="premium-btn premium-btn-primary" style={{ padding: '10px 20px', textDecoration: 'none' }}>
            Manual Attendance Update
          </Link>
        </div>

        {showPermissionModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="premium-card" style={{ width: '400px', maxWidth: '90%', padding: '24px' }}>
              <h3 style={{ marginTop: 0, color: 'var(--text-primary)', marginBottom: '16px' }}>Grant Prior Permission</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                This excuses the student from disciplinary action for this specific class. Their attendance percentage will not be changed.
              </p>
              
              <form onSubmit={handleGrantPermission}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-secondary)' }}>Student Name</label>
                  <input type="text" value={permissionStudentName} readOnly className="premium-input" style={{ width: '100%', background: 'var(--bg-nested)', cursor: 'not-allowed' }} />
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-secondary)' }}>Reason *</label>
                  <select 
                    value={permissionReason} 
                    onChange={(e) => setPermissionReason(e.target.value)} 
                    className="premium-input" 
                    style={{ width: '100%' }}
                    required
                  >
                    <option value="">-- Select Reason --</option>
                    <option value="Placement examination">Placement examination</option>
                    <option value="Medical appointment">Medical appointment</option>
                    <option value="Emergency">Emergency</option>
                    <option value="Interview">Interview</option>
                    <option value="Approved personal reason">Approved personal reason</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowPermissionModal(false)} className="premium-btn premium-btn-secondary">Cancel</button>
                  <button type="submit" disabled={isSubmittingPermission || !permissionReason} className="premium-btn" style={{ background: '#3b82f6' }}>
                    {isSubmittingPermission ? 'Saving...' : 'Grant Permission'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showResolveModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="premium-card" style={{ width: '400px', maxWidth: '90%', padding: '24px', backgroundColor: 'var(--bg-main)' }}>
              <h3 style={{ marginTop: 0, color: 'var(--text-primary)', marginBottom: '16px' }}>Resolve Participant Identity</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Map the unmatched Google Meet participant to an expected student in the roster.
              </p>
              
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Google Participant:</div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{resolveParticipant?.name || "Unknown"}</div>
                {resolveParticipant?.email && resolveParticipant.email !== "N/A" && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{resolveParticipant.email}</div>
                )}
              </div>

              <form onSubmit={handleResolveSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Select Student to Map To:
                  </label>
                  <select 
                    className="premium-input"
                    value={selectedResolveStudentId}
                    onChange={(e) => setSelectedResolveStudentId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px' }}
                  >
                    <option value="">-- Select an Expected Student --</option>
                    {officialData?.expected_students && Object.entries(officialData.expected_students).map(([id, s]) => (
                      <option key={id} value={id}>
                        {s.name} ({s.email}) - {s.status}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setShowResolveModal(false); setResolveParticipant(null); setSelectedResolveStudentId(""); }} className="premium-btn premium-btn-secondary">Cancel</button>
                  <button type="submit" disabled={isResolving || !selectedResolveStudentId} className="premium-btn" style={{ background: '#d97706' }}>
                    {isResolving ? 'Resolving...' : 'Confirm Mapping'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {syncToastMessage && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px",
          backgroundColor: "#1f2937", color: "#f9fafb", padding: "14px 24px",
          borderRadius: "8px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          zIndex: 9999, fontSize: "14px", fontWeight: "500", display: "flex", alignItems: "center", gap: "12px",
          border: "1px solid #374151"
        }}>
          {isSyncing && (
            <svg style={{ animation: "spin 1s linear infinite", width: "18px", height: "18px", color: "#60a5fa" }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {!isSyncing && (
            <svg style={{ width: "18px", height: "18px", color: "#34d399" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          )}
          {syncToastMessage}
        </div>
      )}

      </div>
    </div>
  );
}

export default AttendanceDetails;