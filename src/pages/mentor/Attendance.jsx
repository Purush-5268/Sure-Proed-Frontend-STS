import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Attendance.module.css";
import {
  FiCheckSquare, FiSave, FiAlertCircle, FiDownload,
  FiChevronDown, FiChevronUp, FiCalendar
} from "react-icons/fi";

const STATUS_OPTIONS = ["Present", "Absent", "Late"];

function Attendance() {
  const [cohorts, setCohorts] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceState, setAttendanceState] = useState({});
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSession, setExpandedSession] = useState(null);

  // Load mentor cohorts on mount
  useEffect(() => {
    let isMounted = true;
    const loadCohorts = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS);
        const data = res.data;
        const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        if (isMounted) {
          setCohorts(arr);
          if (arr.length > 0) setSelectedCohort(arr[0]);
        }
      } catch {
        if (isMounted) setError("Could not load your cohorts.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadCohorts();
    return () => { isMounted = false; };
  }, []);

  // Load students when cohort changes
  useEffect(() => {
    if (!selectedCohort) return;
    let isMounted = true;
    setStudentsLoading(true);
    setStudents([]);
    setAttendanceState({});

    const loadStudents = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.COHORTS.STUDENTS(selectedCohort.id));
        const data = res.data;
        const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        if (isMounted) {
          const sorted = arr.sort((a, b) =>
            `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`)
          );
          setStudents(sorted);
          const initial = {};
          sorted.forEach(s => { initial[s.id] = "Present"; });
          setAttendanceState(initial);
        }
      } catch {
        // Students unavailable
      } finally {
        if (isMounted) setStudentsLoading(false);
      }
    };

    loadStudents();
    return () => { isMounted = false; };
  }, [selectedCohort]);

  // Load attendance history when cohort changes
  useEffect(() => {
    if (!selectedCohort) return;
    let isMounted = true;
    setHistoryLoading(true);
    setAttendanceRecords([]);

    const loadHistory = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, {
          params: { cohort: selectedCohort.id }
        });
        const data = res.data;
        const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        if (isMounted) setAttendanceRecords(arr);
      } catch {
        // History unavailable
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };

    loadHistory();
    return () => { isMounted = false; };
  }, [selectedCohort]);

  const handleStatusChange = (studentId, status) => {
    setAttendanceState(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!selectedCohort) return;
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      // Build attendance payload for the backend
      const today = new Date().toISOString().split("T")[0];
      const records = Object.entries(attendanceState).map(([studentId, status]) => ({
        student: studentId,
        status,
        cohort: selectedCohort.id,
        date: today,
      }));

      // Use existing attendance API to create a session record
      await apiClient.post(API_ENDPOINTS.ATTENDANCE.BASE, {
        cohort: selectedCohort.id,
        title: `Attendance - ${selectedCohort.name}`,
        class_date: today,
        start_time: new Date().toTimeString().slice(0, 8),
        records,
        session_type: "Domain",
        group_name: selectedCohort.code,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Attendance save failed:", err);
      alert("Could not save attendance. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async (sessionId) => {
    try {
      const response = await apiClient.get(
        `${API_ENDPOINTS.ATTENDANCE.BY_ID(sessionId)}download_excel/`,
        { responseType: "blob" }
      );
      if (response.status === 202) {
        alert("Report is being generated. Try again in a few seconds.");
        return;
      }
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance_report_${sessionId}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not download report. It may still be generating.");
    }
  };

  const presentCount = useMemo(() => Object.values(attendanceState).filter(s => s === "Present").length, [attendanceState]);
  const absentCount = useMemo(() => Object.values(attendanceState).filter(s => s === "Absent").length, [attendanceState]);

  const groupedRecords = useMemo(() => {
    const groups = {};
    attendanceRecords.forEach(r => {
      const date = r.class_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => new Date(b) - new Date(a));
  }, [attendanceRecords]);

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="Attendance"
        description="Mark and review attendance for your cohort."
        actions={
          cohorts.length > 1 ? (
            <select
              className={styles.cohortSelect}
              value={selectedCohort?.id || ""}
              onChange={e => setSelectedCohort(cohorts.find(c => c.id === e.target.value))}
            >
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : null
        }
      />

      {loading ? (
        <div className={styles.skeletonWrapper}>
          <SkeletonLoader width="100%" height="400px" borderRadius="12px" />
        </div>
      ) : error ? (
        <EmptyState icon={<FiAlertCircle />} title="Error" description={error} />
      ) : cohorts.length === 0 ? (
        <EmptyState
          icon={<FiCheckSquare />}
          title="No cohort assigned"
          description="You need an active cohort assignment before marking attendance."
        />
      ) : (
        <div className={styles.twoCol}>
          {/* Left: Mark Attendance */}
          <div>
            <Card className={styles.attendanceCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Mark Attendance</h2>
                  <p className={styles.cardSubtitle}>
                    {selectedCohort?.name} ·{" "}
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.presentCount}>✓ {presentCount}</span>
                  <span className={styles.absentCount}>✗ {absentCount}</span>
                </div>
              </div>

              {studentsLoading ? (
                <div className={styles.studentSkeletons}>
                  {[1,2,3,4].map(i => (
                    <div key={i} className={styles.skeletonRow}>
                      <SkeletonLoader width="2rem" height="2rem" borderRadius="50%" />
                      <SkeletonLoader width="40%" height="14px" borderRadius="4px" />
                      <SkeletonLoader width="180px" height="36px" borderRadius="8px" />
                    </div>
                  ))}
                </div>
              ) : students.length === 0 ? (
                <EmptyState
                  icon={<FiCheckSquare />}
                  title="No students in this cohort"
                  description="Students will appear here once enrolled."
                />
              ) : (
                <>
                  <motion.div
                    className={styles.studentList}
                    initial="hidden"
                    animate="show"
                    variants={{ show: { transition: { staggerChildren: 0.04 } } }}
                  >
                    {students.map(student => {
                      const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email || "Unknown";
                      const currentStatus = attendanceState[student.id] || "Present";
                      return (
                        <motion.div key={student.id} variants={item} className={styles.studentRow}>
                          <div className={styles.studentInfo}>
                            <div className={styles.avatar}>{fullName.charAt(0).toUpperCase()}</div>
                            <span className={styles.studentName}>{fullName}</span>
                          </div>
                          <div className={styles.toggleGroup}>
                            {STATUS_OPTIONS.map(status => (
                              <button
                                key={status}
                                onClick={() => handleStatusChange(student.id, status)}
                                className={`${styles.toggleBtn} ${styles[status.toLowerCase()]} ${currentStatus === status ? styles.active : ""}`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  <div className={styles.saveRow}>
                    {savedSuccess && (
                      <motion.span
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={styles.savedBadge}
                      >
                        ✅ Attendance saved!
                      </motion.span>
                    )}
                    <button
                      className={styles.saveBtn}
                      onClick={handleSave}
                      disabled={isSaving || students.length === 0}
                    >
                      <FiSave /> {isSaving ? "Saving…" : "Save Attendance"}
                    </button>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Right: Attendance History */}
          <div>
            <Card className={styles.historyCard}>
              <h2 className={styles.cardTitle} style={{ marginBottom: '1rem' }}>Attendance Reports</h2>

              {historyLoading ? (
                <SkeletonLoader width="100%" height="200px" borderRadius="8px" />
              ) : attendanceRecords.length === 0 ? (
                <EmptyState
                  icon={<FiCalendar />}
                  title="No records yet"
                  description="Past sessions and downloadable reports will appear here."
                />
              ) : (
                <div className={styles.historyList}>
                  {groupedRecords.map(([date, sessions]) => (
                    <div key={date} className={styles.dateGroup}>
                      <div className={styles.dateHeader}>
                        {new Date(date).toLocaleDateString('en-IN', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </div>
                      {sessions.map(session => (
                        <div key={session.id} className={styles.sessionRecord}>
                          <div className={styles.sessionRecordInfo}>
                            <span className={styles.sessionRecordTitle}>{session.title}</span>
                            <span className={styles.sessionRecordTime}>{session.start_time}</span>
                          </div>
                          <button
                            className={styles.downloadBtn}
                            onClick={() => handleDownload(session.id)}
                          >
                            <FiDownload /> Excel
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default Attendance;