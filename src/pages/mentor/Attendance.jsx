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
        const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { 
          params: { cohort: selectedCohort, page } 
        });
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

  const handleViewSession = (session) => {
    setSelectedSessionView(session);
  };

  const renderAttendanceDetails = () => {
    if (!selectedSessionView) return null;
    
    const data = selectedSessionView.google_meet_attendance_data;
    if (!data || data.status !== "READY" || !data.expected_students) {
      return (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
          <FiFileText size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
          <p>Detailed tracking data is not available for this session yet.</p>
          <p style={{ fontSize: "12px", marginTop: "4px" }}>Sessions might take a few minutes after completion to process the roster.</p>
        </div>
      );
    }

    const students = Object.values(data.expected_students);
    const presentStudents = students.filter(s => s.duration_seconds > 0 || s.join_time);
    const absentStudents = students.filter(s => !s.duration_seconds && !s.join_time);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <h3 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--status-active-text)" }}>
            <FiCheck /> Present ({presentStudents.length})
          </h3>
          <div className={styles.studentList}>
            {presentStudents.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "14px" }}>No students present.</div>
            ) : (
              presentStudents.map((s, idx) => (
                <div key={idx} className={styles.studentRow}>
                  <div style={{ fontWeight: "500", color: "var(--text-primary)" }}>{s.name || s.email}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{s.email}</div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div>
          <h3 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--status-inactive-text)" }}>
            <FiXCircle /> Absent ({absentStudents.length})
          </h3>
          <div className={styles.studentList}>
            {absentStudents.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "14px" }}>No absences! Everyone joined.</div>
            ) : (
              absentStudents.map((s, idx) => (
                <div key={idx} className={styles.studentRow}>
                  <div style={{ fontWeight: "500", color: "var(--text-primary)" }}>{s.name || s.email}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{s.email}</div>
                </div>
              ))
            )}
          </div>
        </div>
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
    </div>
  );
}

export default Attendance;