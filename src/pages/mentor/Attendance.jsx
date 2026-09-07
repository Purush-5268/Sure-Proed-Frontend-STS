import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import Pagination from "../../components/common/Pagination";
import styles from "./Attendance.module.css";
import { FiCalendar, FiDownload, FiUsers, FiClock, FiFileText, FiEye, FiX, FiCheck, FiXCircle } from "react-icons/fi";

function Attendance() {
  const [cohorts, setCohorts] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedSessionView, setSelectedSessionView] = useState(null);
  const [selectedSessionOfficialData, setSelectedSessionOfficialData] = useState(null);
  const [selectedSessionLoading, setSelectedSessionLoading] = useState(false);

  // Prior Permission State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionSessionId, setPermissionSessionId] = useState(null);
  const [permissionStudentId, setPermissionStudentId] = useState(null);
  const [permissionStudentName, setPermissionStudentName] = useState("");
  const [permissionReason, setPermissionReason] = useState("");
  const [isSubmittingPermission, setIsSubmittingPermission] = useState(false);


  // Pagination State
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch mentor's cohorts
  useEffect(() => {
    let isMounted = true;
    const fetchCohorts = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COHORTS.BASE);
        const data = Array.isArray(response.data?.results) ? response.data.results : (Array.isArray(response.data) ? response.data : []);
        if (isMounted) {
          setCohorts(data);
          if (data.length > 0) setSelectedCohort(String(data[0].id));
        }
      } catch (err) {
        console.error("Failed to load cohorts:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchCohorts();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedCohort) return;
    let isMounted = true;
    const fetchSessions = async () => {
      try {
        const activeCohort = cohorts.find(c => String(c.id) === String(selectedCohort));
        const params = { cohort: selectedCohort, page };
        if (activeCohort && activeCohort.status && activeCohort.status !== 'COMPLETED' && activeCohort.status !== 'CANCELLED' && activeCohort.status !== 'DRAFT') {
          params.recent_days = 21;
        }

        const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { params });
        const data = response.data;
        if (isMounted) {
          setSessions(Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []));
          setHasNext(!!data.next);
          setHasPrev(!!data.previous);
          setTotalCount(data.count || 0);
        }
      } catch (err) {
        console.error("Failed to load sessions:", err);
      }
    };
    fetchSessions();
    return () => { isMounted = false; };
  }, [selectedCohort, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedCohort]);

  const handleDownloadReport = async () => {
    if (!selectedCohort) return;
    setDownloading(true);
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BASE}export_excel/?cohort=${selectedCohort}`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Attendance_Report_Cohort_${selectedCohort}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download report. Make sure the backend supports this export API.");
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSessionReport = async (sessionId) => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BY_ID(sessionId)}official-attendance/download/`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Session_Attendance_${sessionId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download session report. Ensure you have permission.");
      console.error(err);
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED': return <Badge variant="success">Completed</Badge>;
      case 'SCHEDULED': return <Badge variant="primary">Scheduled</Badge>;
      case 'CANCELLED': return <Badge variant="error">Cancelled</Badge>;
      default: return <Badge variant="default">{status || 'Unknown'}</Badge>;
    }
  };

  const handleViewSession = async (session) => {
    setSelectedSessionView(session);
    setSelectedSessionLoading(true);
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.BY_ID(session.id)}official-attendance/`);
      if (response.data && response.data.status === "READY") {
        setSelectedSessionOfficialData(response.data);
      } else {
        setSelectedSessionOfficialData(null);
      }
    } catch (error) {
      console.warn("Failed to fetch official attendance:", error);
      setSelectedSessionOfficialData(null);
    } finally {
      setSelectedSessionLoading(false);
    }
  };

  const handleSendWarning = async (sessionId, studentId, studentName) => {
    const customNote = window.prompt(`Type a warning message for ${studentName}:`, `Warning: Your attendance is below 95%. Please explain your absence.`);
    if (!customNote) return;
    try {
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

  const handleOpenPermissionModal = (sessionId, studentId, studentName) => {
    setPermissionSessionId(sessionId);
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
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${permissionSessionId}/grant-prior-permission/`, {
        student_id: permissionStudentId,
        reason: permissionReason
      });
      alert(`Prior permission granted successfully for ${permissionStudentName}.`);
      setShowPermissionModal(false);
      if (selectedSessionView && selectedSessionView.id === permissionSessionId) {
        handleViewSession(selectedSessionView);
      }
    } catch (error) {
      alert(error.response?.data?.error || "Failed to grant prior permission.");
    } finally {
      setIsSubmittingPermission(false);
    }
  };

  const handleRevokePermission = async (sessionId, studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to revoke prior permission for ${studentName}?`)) return;
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${sessionId}/revoke-prior-permission/`, {
        student_id: studentId
      });
      alert(`Prior permission revoked successfully for ${studentName}.`);
      if (selectedSessionView && selectedSessionView.id === sessionId) {
        handleViewSession(selectedSessionView);
      }
    } catch (error) {
      alert(error.response?.data?.error || "Failed to revoke prior permission.");
    }
  };


  const renderAttendanceDetails = () => {
    if (!selectedSessionView) return null;
    
    if (selectedSessionLoading) {
      return (
        <div style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
          <span style={{ color: "var(--text-secondary)" }}>Loading deterministic attendance data...</span>
        </div>
      );
    }

    if (!selectedSessionOfficialData || !selectedSessionOfficialData.expected_students) {
      return (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
          <FiFileText size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
          <p>Detailed tracking data is not available for this session yet.</p>
          <p style={{ fontSize: "12px", marginTop: "4px" }}>Sessions might take a few minutes after completion to process the roster.</p>
        </div>
      );
    }

    const officialData = selectedSessionOfficialData;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        
        {/* 🚨 OFFICIAL ATTENDANCE ROSTER */}
        <div>
          <h3 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
            <FiCheck /> Official Attendance Roster
          </h3>
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
                {Object.values(officialData.expected_students).map((student, idx) => {
                  const attPercentage = student.attendance_percentage || 0;
                  const hasPriorPermission = student.prior_permission?.has_permission === true;
                  const isSuspended = student.status === "BELOW_THRESHOLD";
                  const isWarning = student.status === "PRESENT" && attPercentage < 95;
                  const isAbsent = student.status === "ABSENT";
                  const isReviewReq = student.status === "IDENTITY_REVIEW_REQUIRED";

                  const rowBg = hasPriorPermission ? "rgba(59, 130, 246, 0.05)" : (isAbsent ? "rgba(239, 68, 68, 0.15)" : (isSuspended ? "rgba(239, 68, 68, 0.05)" : isReviewReq ? "rgba(245, 158, 11, 0.1)" : "transparent"));

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
                             <button onClick={() => handleRevokePermission(selectedSessionView.id, student.student_id, student.name)} style={{ background: "transparent", color: "#ef4444", border: "1px solid #fca5a5", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Revoke</button>
                          </div>
                        ) : isReviewReq ? (
                          <span style={{ color: "#d97706", fontSize: "12px", fontWeight: "bold" }}>Requires Admin Review</span>
                        ) : isSuspended || isAbsent || isWarning ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: isWarning ? "#f59e0b" : "#ef4444", fontSize: "12px", fontWeight: "bold" }}>
                              {isAbsent ? "⚠️ Absent" : isSuspended ? "⚠️ Below Threshold" : "⚠️ Warning"}
                            </span>
                            <button
                              onClick={() => handleSendWarning(selectedSessionView.id, student.student_id, student.name)}
                              style={{
                                background: "#ef4444", color: "white", border: "none",
                                padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                                fontWeight: "bold", cursor: "pointer", transition: "all 0.2s ease"
                              }}
                            >
                              Send Warning
                            </button>
                            <button
                              onClick={() => handleOpenPermissionModal(selectedSessionView.id, student.student_id, student.name)}
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
                            <button onClick={() => handleOpenPermissionModal(selectedSessionView.id, student.student_id, student.name)} style={{ background: "transparent", color: "#3b82f6", border: "1px solid #bfdbfe", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Grant Exemption</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🚨 EXCEPTIONS QUEUE */}
        {officialData.unmatched_participants && officialData.unmatched_participants.length > 0 && (
          <div>
            <h3 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
              <span style={{ color: "#f59e0b" }}>⚠</span> Participants Requiring Review ({officialData.unmatched_participants.length})
            </h3>
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

      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Attendance Reports" description="Loading attendance data..." />
        <SkeletonLoader width="100%" height="400px" borderRadius="12px" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Attendance Reports" 
        description="View automated Google Meet attendance data and download reports."
        actions={
          <button 
            className="premium-btn" 
            onClick={handleDownloadReport} 
            disabled={downloading || !selectedCohort}
          >
            <FiDownload /> {downloading ? "Downloading..." : "Export Excel Report"}
          </button>
        }
      />

      {cohorts.length === 0 ? (
        <EmptyState 
          icon={<FiUsers />}
          title="No Cohorts Assigned"
          description="You are not assigned to any cohorts, so there are no attendance reports to view."
        />
      ) : (
        <>
          <div className="premium-form-group" style={{ maxWidth: "400px", marginBottom: "24px" }}>
            <label className="premium-label">Select Cohort</label>
            <select 
              className="premium-input" 
              value={selectedCohort} 
              onChange={(e) => setSelectedCohort(e.target.value)}
            >
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          <Card className={styles.tableCard}>
            <h2 style={{ fontSize: "18px", marginBottom: "16px", color: "var(--text-primary)" }}>Session History</h2>
            
            {sessions.length === 0 ? (
              <EmptyState 
                icon={<FiFileText />}
                title="No Sessions Found"
                description="No attendance sessions have been created for this cohort yet."
              />
            ) : (
              <div className="premium-table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Title / Type</th>
                      <th>Date & Time</th>
                      <th>Status</th>
                      <th>Google Joined</th>
                      <th>Expected</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(session => (
                      <tr key={session.id}>
                        <td>
                          <div style={{ fontWeight: "500", color: "var(--text-primary)" }}>{session.title || "Untitled Session"}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{session.class_type || "Session"}</div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><FiCalendar /> {session.class_date}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}><FiClock /> {session.start_time} - {session.end_time || "Ongoing"}</div>
                        </td>
                        <td>{getStatusBadge(session.class_status)}</td>
                        <td style={{ fontWeight: "bold" }}>
                          {session.google_joined_count !== undefined ? session.google_joined_count : (session.joined_students?.length || 0)}
                        </td>
                        <td>
                          {session.google_total_students !== undefined ? session.google_total_students : (session.actual_student_count || 0)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="premium-btn premium-btn-small"
                              onClick={() => handleViewSession(session)}
                              title="View Attendance Details"
                              style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--bg-nested)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                            >
                              <FiEye /> View
                            </button>
                            <button
                              className="premium-btn premium-btn-small"
                              onClick={() => handleDownloadSessionReport(session.id)}
                              title="Download Session Excel"
                              style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <FiDownload /> Excel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination 
              page={page} 
              setPage={setPage} 
              hasNext={hasNext} 
              hasPrev={hasPrev} 
              loading={loading} 
            />
          </Card>
        </>
      )}

      <AnimatePresence>
        {selectedSessionView && (
          <div className={styles.modalOverlay}>
            <motion.div 
              className={styles.modalContent}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <div className={styles.modalHeader}>
                <h2>Attendance Details</h2>
                <button onClick={() => setSelectedSessionView(null)} className={styles.closeBtn}><FiX /></button>
              </div>

              <div className={styles.modalBody}>
                {renderAttendanceDetails()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
    </div>
  );
}

export default Attendance;