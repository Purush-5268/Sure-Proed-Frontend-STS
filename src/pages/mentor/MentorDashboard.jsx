import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useOutletContext } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import PushNotificationBanner from "../../components/common/PushNotificationBanner";
import styles from "./MentorDashboard.module.css";
import {
  FiUsers,
  FiFileText,
  FiCheckCircle,
  FiCalendar,
  FiClock,
  FiAlertCircle,
  FiArrowRight,
  FiPlus,
  FiBarChart2,
  FiBookOpen,
  FiSearch,
  FiMail,
  FiX,
  FiSend,
} from "react-icons/fi";

function getSalutation(gender) {
  if (!gender) return "";
  const g = String(gender).toUpperCase().trim();
  if (g === "FEMALE" || g === "F") return " Madam";
  if (g === "MALE" || g === "M") return " Sir";
  return "";
}

function MentorDashboard() {
  const { user } = useAuth();
  const { globalCohort } = useOutletContext() || {};
  const [cohorts, setCohorts] = useState([]);
  const [allCohorts, setAllCohorts] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [todaySessions, setTodaySessions] = useState([]);
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cohort Students section state
  const [selectedCohort, setSelectedCohort] = useState(globalCohort || "");
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [totalStudentCount, setTotalStudentCount] = useState(0);
  const [hasNextStudentPage, setHasNextStudentPage] = useState(false);
  const [hasPrevStudentPage, setHasPrevStudentPage] = useState(false);
  const [messageDialog, setMessageDialog] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  // Sync selectedCohort when globalCohort changes
  useEffect(() => {
    if (globalCohort !== undefined) {
      setSelectedCohort(globalCohort || "");
      setStudentPage(1);
    }
  }, [globalCohort]);

  // Debounce student search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedStudentSearch(studentSearch);
      setStudentPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [studentSearch]);

  // Fetch scoped cohort students
  useEffect(() => {
    let isMounted = true;
    const fetchStudents = async () => {
      setStudentsLoading(true);
      try {
        const params = { page: studentPage };
        if (selectedCohort) params.cohort = selectedCohort;
        if (debouncedStudentSearch) params.search = debouncedStudentSearch;
        const res = await apiClient.get(API_ENDPOINTS.STUDENTS.BASE, { params });
        if (isMounted) {
          const data = res.data;
          setStudents(Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []));
          setTotalStudentCount(data?.count || 0);
          setHasNextStudentPage(!!data?.next);
          setHasPrevStudentPage(!!data?.previous);
        }
      } catch (err) {
        console.error("Failed to load cohort students", err);
      } finally {
        if (isMounted) setStudentsLoading(false);
      }
    };
    fetchStudents();
    return () => { isMounted = false; };
  }, [selectedCohort, debouncedStudentSearch, studentPage]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !messageDialog) return;
    setSendingMessage(true);
    try {
      await apiClient.post("/api/notifications/", {
        user_id: messageDialog.studentId,
        title: "Message from Mentor",
        message: messageText.trim(),
        notification_type: "INFO",
      });
      setMessageSent(true);
      setTimeout(() => {
        setMessageDialog(null);
        setMessageText("");
        setMessageSent(false);
      }, 1500);
    } catch (err) {
      console.error("Failed to send message:", err);
      alert("Failed to send message. Please try again.");
    } finally {
      setSendingMessage(false);
    }
  };

  const getStudentStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'AVAILABLE': return <Badge variant="success">Active</Badge>;
      case 'BUSY': return <Badge variant="warning">Busy</Badge>;
      case 'NOT_AVAILABLE': return <Badge variant="default">Inactive</Badge>;
      default: return <Badge variant="default">{status || 'Enrolled'}</Badge>;
    }
  };

  useEffect(() => {
    // If there is no globalCohort yet (meaning cohorts haven't loaded in layout or none assigned), wait.
    if (globalCohort === undefined) return;

    const abortController = new AbortController();
    let isMounted = true;
    setLoading(true);

    const loadDashboardData = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];

        const cohortParams = globalCohort ? { cohort: globalCohort } : {};

        const [cohortsRes, attendanceRes, trainingsRes, submissionsRes] = await Promise.allSettled([
          apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS),
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, {
            params: { status: "ACTIVE", ...cohortParams }
          }),
          apiClient.get(API_ENDPOINTS.TRAININGS.SESSIONS, {
            params: { status: "ACTIVE", ...cohortParams }
          }),
          apiClient.get(API_ENDPOINTS.SUBMISSIONS.BASE, {
            params: { ...cohortParams }
          }),
        ]);

        if (!isMounted) return;

        if (cohortsRes.status === "fulfilled") {
          const data = cohortsRes.value.data;
          const rawCohorts = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          setAllCohorts(rawCohorts);
          let myCohorts = rawCohorts;
          if (globalCohort) {
            myCohorts = myCohorts.filter(c => String(c.id) === String(globalCohort));
          }
          setCohorts(myCohorts);
        }

        let combinedSessions = [];

        if (attendanceRes.status === "fulfilled") {
          const data = attendanceRes.value.data;
          const sessions = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          combinedSessions = [...combinedSessions, ...sessions.map(s => ({
            id: `domain_${s.id}`,
            realId: s.id,
            title: s.title,
            start_time: s.start_time,
            end_time: s.end_time,
            class_date: s.class_date,
            meeting_link: s.meeting_link,
            type: "DOMAIN",
            status: s.class_status
          }))];
        }

        if (trainingsRes.status === "fulfilled") {
          const data = trainingsRes.value.data;
          const sessions = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          combinedSessions = [...combinedSessions, ...sessions.map(s => ({
            id: `training_${s.id}`,
            realId: s.id,
            title: s.title || s.topic,
            start_time: s.start_time,
            end_time: s.end_time,
            class_date: s.session_date,
            meeting_link: s.meeting_link,
            type: "TRAINING",
            status: s.class_status
          }))];
        }

        // Apply radar logic to refine currently active/upcoming sessions today
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const activeSessions = combinedSessions.filter(cls => {
          const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
          if (isNaN(classStart)) return false;
          
          const hoursSince = (now - classStart) / (1000 * 60 * 60);
          
          // Hide any class that is older than 24 hours
          if (hoursSince > 24) {
            return false;
          }
          
          return true;
        });

        setTodaySessions(activeSessions);

        if (submissionsRes.status === "fulfilled") {
          const data = submissionsRes.value.data;
          const subs = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          setRecentSubmissions(subs.slice(0, 5));
        }

        // Fetch students for the displayed cohorts to match MyStudents page exactly
        if (cohortsRes.status === "fulfilled") {
          const myCohorts = Array.isArray(cohortsRes.value.data?.results)
            ? cohortsRes.value.data.results
            : (Array.isArray(cohortsRes.value.data) ? cohortsRes.value.data : []);

          const activeCohorts = globalCohort
            ? myCohorts.filter(c => String(c.id) === String(globalCohort))
            : myCohorts;

          if (activeCohorts.length > 0) {
            const res = await apiClient.get(API_ENDPOINTS.STUDENTS.BASE, { params: { ...cohortParams, limit: 1 } });
            setTotalStudents(res.data.count || 0);
          } else {
            setTotalStudents(0);
          }
        }

      } catch (err) {
        if (isMounted) setError("Failed to load dashboard data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboardData();
    return () => { isMounted = false; abortController.abort(); };
  }, [globalCohort]);

  const firstName = user?.first_name || user?.firstName || "";
  const lastName = user?.last_name || user?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const salutation = getSalutation(user?.gender);
  const welcomeName = fullName ? `${fullName}${salutation}` : (user?.email || "Mentor");

  const handleEndClass = async (sessionId, type) => {
    if (!window.confirm("Are you sure you want to end this class? This will freeze attendance and generate reports.")) return;
    try {
      if (type === "DOMAIN") {
        await apiClient.patch(API_ENDPOINTS.ATTENDANCE.BY_ID(sessionId), { conducted: false, class_status: "COMPLETED" });
      } else {
        await apiClient.patch(API_ENDPOINTS.TRAININGS.BY_ID(sessionId), { conducted: false, class_status: "COMPLETED" });
      }
      alert("✅ SUCCESS\n\nSession ended. Reports are being generated in the background.");
      // Reload dashboard data
      setLoading(true);
      const cohortParams = globalCohort ? { cohort: globalCohort } : {};
      
      const [attendanceRes, trainingsRes] = await Promise.allSettled([
        apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { params: { status: "ACTIVE", ...cohortParams } }),
        apiClient.get(API_ENDPOINTS.TRAININGS.SESSIONS, { params: { ...cohortParams } })
      ]);
      
      let combinedSessions = [];
      if (attendanceRes.status === "fulfilled") {
        const data = attendanceRes.value.data;
        const sessions = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        combinedSessions = [...combinedSessions, ...sessions.map(s => ({
          id: `domain_${s.id}`,
          realId: s.id,
          title: s.title,
          start_time: s.start_time,
          end_time: s.end_time,
          class_date: s.class_date,
          meeting_link: s.meeting_link,
          type: "DOMAIN",
          status: s.class_status
        }))];
      }
      if (trainingsRes.status === "fulfilled") {
        const data = trainingsRes.value.data;
        const sessions = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        combinedSessions = [...combinedSessions, ...sessions.map(s => ({
          id: `training_${s.id}`,
          realId: s.id,
          title: s.title || s.topic,
          start_time: s.start_time,
          end_time: s.end_time,
          class_date: s.session_date,
          meeting_link: s.meeting_link,
          type: "TRAINING",
          status: s.class_status
        }))];
      }
      
      const now = new Date();
      const activeSessions = combinedSessions.filter(cls => {
        const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
        if (isNaN(classStart)) return false;
        const hoursSince = (now - classStart) / (1000 * 60 * 60);
        return hoursSince <= 24;
      });
      setTodaySessions(activeSessions);
    } catch (err) {
      alert("Failed to end session.");
    } finally {
      setLoading(false);
    }
  };

  const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } }
  };

  return (
    <div className={styles.container}>
      <PushNotificationBanner />
      <PageHeader
        title={`Welcome, ${welcomeName}`}
        description="Here's what's happening in your teaching workspace today."
        actions={
          <Link to="/mentor/attendance" className={styles.primaryButton}>
            <FiCheckCircle /> Mark Attendance
          </Link>
        }
      />

      {loading ? (
        <div className={styles.skeletonGrid}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={styles.skeletonCard}>
              <SkeletonLoader width="60%" height="14px" borderRadius="4px" />
              <SkeletonLoader width="40%" height="32px" borderRadius="4px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<FiAlertCircle />} title="Could not load dashboard" description={error} />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className={styles.dashboardGrid}>

          {/* Stat Cards */}
          <motion.div variants={item} className={styles.statsRow}>
            <StatBox icon={<FiBookOpen />} label="Active Cohorts" value={cohorts.length} href="/mentor/cohorts" color="var(--primary-color)" />
            <StatBox icon={<FiUsers />} label="My Students" value={totalStudentCount || totalStudents} href="/mentor/students" color="#10b981" />
            <StatBox icon={<FiClock />} label="Live Today" value={todaySessions.length} href="/mentor/meeting-links" color="#f59e0b" />
            <StatBox icon={<FiFileText />} label="Submissions" value={recentSubmissions.length} href="/mentor/assignments" color="#8b5cf6" />
          </motion.div>

          <div className={styles.mainContent}>
            {/* Left Column */}
            <div className={styles.leftCol}>
              <motion.div variants={item}>
                <Card className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Recent & Upcoming Classes</h2>
                  </div>
                  <AnimatePresence mode="popLayout">
                    {todaySessions.length === 0 ? (
                      <EmptyState
                        icon={<FiCalendar />}
                        title="No live sessions today"
                        description="You have no scheduled or active sessions right now."
                      />
                    ) : (
                      <div className={styles.sessionList}>
                        {todaySessions.map(session => (
                          <motion.div
                            key={session.id}
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            className={styles.sessionItem}
                          >
                            <div className={styles.sessionDot} style={{ background: session.status === 'CANCELLED' ? '#ef4444' : session.status === 'COMPLETED' ? '#10b981' : (session.type === 'TRAINING' ? '#8b5cf6' : 'var(--primary-color)') }} />
                            <div className={styles.sessionDetails}>
                              <span className={styles.sessionTitle} style={{ textDecoration: session.status === 'CANCELLED' ? 'line-through' : 'none' }}>{session.title}</span>
                              <span className={styles.sessionTime}>{session.start_time}</span>
                            </div>
                            {session.status === 'CANCELLED' ? (
                              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#ef4444', padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>Cancelled</span>
                            ) : session.status === 'COMPLETED' ? (
                              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981', padding: '4px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: '4px' }}>Completed</span>
                            ) : (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {session.meeting_link ? (
                                  <a href={session.meeting_link} target="_blank" rel="noreferrer" className={styles.joinBtn}>
                                    Join
                                  </a>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>No Link</span>
                                )}
                                <button 
                                  onClick={() => handleEndClass(session.realId, session.type)}
                                  className={styles.joinBtn}
                                  style={{ background: '#ef4444', color: 'white' }}
                                >
                                  End Class
                                </button>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Recent Submissions</h2>
                    <Link to="/mentor/assignments" className={styles.viewAll}>View all</Link>
                  </div>
                  {recentSubmissions.length === 0 ? (
                    <EmptyState
                      icon={<FiFileText />}
                      title="All caught up!"
                      description="No pending submissions to review."
                    />
                  ) : (
                    <div className={styles.submissionList}>
                      {recentSubmissions.map(sub => (
                        <div key={sub.id} className={styles.submissionItem}>
                          <div className={styles.submissionAvatar}>
                            {(sub.student_name || sub.student || "S").toString().charAt(0).toUpperCase()}
                          </div>
                          <div className={styles.submissionDetails}>
                            <span className={styles.submissionName}>{sub.student_name || "Student"}</span>
                            <span className={styles.submissionAssignment}>{sub.assignment_title || sub.assignment}</span>
                          </div>
                          <Link to={`/mentor/assignment-submissions/${sub.assignment}`} className={styles.reviewBtn}>
                            Review
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            </div>

            {/* Right Column */}
            <div className={styles.rightCol}>
              <motion.div variants={item}>
                <Card className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>My Cohorts</h2>
                    <Link to="/mentor/cohorts" className={styles.viewAll}>View all</Link>
                  </div>
                  {cohorts.length === 0 ? (
                    <EmptyState
                      icon={<FiBarChart2 />}
                      title="No cohort assigned"
                      description="Request a cohort from administration."
                      action={
                        <Link to="/mentor/cohorts" className={styles.secondaryButton}>
                          Request Assignment
                        </Link>
                      }
                    />
                  ) : (
                    <div className={styles.cohortList}>
                      {cohorts.slice(0, 3).map(cohort => (
                        <Link to="/mentor/cohorts" key={cohort.id} className={styles.cohortItem}>
                          <div className={styles.cohortColor} />
                          <div className={styles.cohortDetails}>
                            <span className={styles.cohortName}>{cohort.name}</span>
                            <span className={styles.cohortMeta}>{cohort.course_name || cohort.code}</span>
                          </div>
                          <FiArrowRight className={styles.cohortArrow} />
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className={styles.sectionCard}>
                  <h2 className={styles.cardTitle} style={{ marginBottom: '1rem' }}>Quick Actions</h2>
                  <div className={styles.quickActions}>
                    <QuickAction href="/mentor/attendance" icon={<FiCheckCircle />} label="Mark Attendance" />

                    <QuickAction href="/mentor/assignments" icon={<FiFileText />} label="Manage Assignments" />
                    <QuickAction href="/mentor/students" icon={<FiUsers />} label="View Students" />
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>

          {/* Scoped Cohort Students Section */}
          <motion.div variants={item} className={styles.studentsSection}>
            <div className={styles.studentsHeader}>
              <div className={styles.studentsHeaderLeft}>
                <h2 className={styles.studentsTitle}>
                  <FiUsers /> Cohort Students
                </h2>
                <p className={styles.studentsSub}>
                  Students enrolled in your assigned cohorts.
                </p>
              </div>

              <div className={styles.studentsControls}>
                {allCohorts.length > 1 && (
                  <select
                    className={styles.cohortFilterSelect}
                    value={selectedCohort}
                    onChange={(e) => {
                      setSelectedCohort(e.target.value);
                      setStudentPage(1);
                    }}
                  >
                    <option value="">All Assigned Cohorts ({allCohorts.length})</option>
                    {allCohorts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.course_name} — {c.code || c.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className={styles.searchWrapper}>
                  <FiSearch className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                  {studentSearch && (
                    <button className={styles.clearSearch} onClick={() => setStudentSearch("")}>
                      <FiX />
                    </button>
                  )}
                </div>

                <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", background: "var(--bg-nested)", padding: "6px 12px", borderRadius: "20px", border: "1px solid var(--border-color)" }}>
                  {totalStudentCount} Student{totalStudentCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className={styles.studentsTableCard}>
              {studentsLoading ? (
                <div style={{ padding: "2rem" }}>
                  <SkeletonLoader width="100%" height="45px" borderRadius="8px" />
                  <div style={{ height: "10px" }} />
                  <SkeletonLoader width="100%" height="45px" borderRadius="8px" />
                  <div style={{ height: "10px" }} />
                  <SkeletonLoader width="100%" height="45px" borderRadius="8px" />
                </div>
              ) : students.length === 0 ? (
                <div style={{ padding: "2.5rem 1rem" }}>
                  <EmptyState
                    icon={<FiUsers />}
                    title="No students found"
                    description={
                      studentSearch
                        ? `No students matching "${studentSearch}".`
                        : "There are no students enrolled in the selected cohort."
                    }
                  />
                </div>
              ) : (
                <>
                  <table className={styles.studentsTable}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Student Code</th>
                        <th>Cohort / Course</th>
                        <th>College</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map(student => {
                        const studentFullName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email;
                        const cohortDisplay = student.active_cohort?.code || student.cohort_code || student.cohort || "Assigned Cohort";
                        return (
                          <tr key={student.id}>
                            <td>
                              <div className={styles.studentInfo}>
                                <div className={styles.studentAvatar}>
                                  {studentFullName.charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.studentDetails}>
                                  <span className={styles.studentName}>{studentFullName}</span>
                                  <span className={styles.studentEmail}>{student.email}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={styles.studentCodeBadge}>
                                {student.student_code || "—"}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: "600", fontSize: "0.85rem" }}>{cohortDisplay}</span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{student.course_name || ""}</span>
                              </div>
                            </td>
                            <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                              {student.college || "—"}
                            </td>
                            <td>{getStudentStatusBadge(student.status)}</td>
                            <td>
                              <button
                                className={styles.messageBtn}
                                onClick={() => setMessageDialog({
                                  studentId: student.id,
                                  studentEmail: student.email,
                                  studentName: studentFullName,
                                })}
                              >
                                <FiMail /> Message
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pagination footer */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--border-color)", background: "var(--bg-nested)" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                      Page {studentPage}
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className={styles.secondaryButton}
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        disabled={!hasPrevStudentPage}
                        onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <button
                        className={styles.secondaryButton}
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        disabled={!hasNextStudentPage}
                        onClick={() => setStudentPage(p => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Message Dialog */}
      <AnimatePresence>
        {messageDialog && (
          <motion.div
            className={styles.dialogOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setMessageDialog(null)}
          >
            <motion.div
              className={styles.dialog}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              <div className={styles.dialogHeader}>
                <div>
                  <h3 className={styles.dialogTitle}>Message Student</h3>
                  <p className={styles.dialogSub}>To: {messageDialog.studentName}</p>
                </div>
                <button className={styles.dialogClose} onClick={() => setMessageDialog(null)}>
                  <FiX />
                </button>
              </div>

              {messageSent ? (
                <div className={styles.messageSentState}>
                  Message sent successfully!
                </div>
              ) : (
                <>
                  <textarea
                    className={styles.messageTextarea}
                    placeholder="Write a message or notification to this student..."
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    rows={4}
                  />
                  <div className={styles.dialogActions}>
                    <button className={styles.cancelBtn} onClick={() => setMessageDialog(null)}>
                      Cancel
                    </button>
                    <button
                      className={styles.sendBtn}
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sendingMessage}
                    >
                      <FiSend /> {sendingMessage ? "Sending..." : "Send Message"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatBox({ icon, label, value, href, color }) {
  return (
    <Link to={href} className={styles.statBox}>
      <div className={styles.statIcon} style={{ color }}>
        {icon}
      </div>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>{value}</span>
      </div>
    </Link>
  );
}

function QuickAction({ href, icon, label }) {
  return (
    <Link to={href} className={styles.quickActionBtn}>
      <span className={styles.qaIcon}>{icon}</span>
      <span>{label}</span>
      <FiArrowRight className={styles.qaArrow} />
    </Link>
  );
}

export default MentorDashboard;
