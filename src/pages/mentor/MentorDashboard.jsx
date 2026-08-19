import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useOutletContext } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
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
} from "react-icons/fi";

// Generates "Sir", "Madam" or nothing based on gender
function getSalutation(gender) {
  if (!gender) return "";
  const g = gender.toUpperCase();
  if (g === "MALE") return " Sir";
  if (g === "FEMALE") return " Madam";
  return "";
}

function MentorDashboard() {
  const { user } = useAuth();
  const { globalCohort } = useOutletContext() || {};
  const [cohorts, setCohorts] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [todaySessions, setTodaySessions] = useState([]);
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If there is no globalCohort yet (meaning cohorts haven't loaded in layout or none assigned), wait.
    if (globalCohort === undefined) return;
    
    const abortController = new AbortController();
    let isMounted = true;
    setLoading(true);

    const loadDashboardData = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];

        // Base params for cohort filtering if a specific cohort is selected
        const cohortParams = globalCohort ? { cohort: globalCohort } : {};

        const [cohortsRes, attendanceRes, submissionsRes] = await Promise.allSettled([
          apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS),
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, {
            params: { conducted: "true", class_date: today, ...cohortParams }
          }),
          apiClient.get(API_ENDPOINTS.SUBMISSIONS.BASE, {
            params: { ...cohortParams }
          }),
        ]);

        if (!isMounted) return;

        if (cohortsRes.status === "fulfilled") {
          const data = cohortsRes.value.data;
          // Filter cohorts to only show the global selected one if applicable, or all
          let myCohorts = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          if (globalCohort) {
            myCohorts = myCohorts.filter(c => String(c.id) === String(globalCohort));
          }
          setCohorts(myCohorts);
        }

        if (attendanceRes.status === "fulfilled") {
          const data = attendanceRes.value.data;
          const sessions = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          setTodaySessions(sessions.filter(s => s.conducted !== false && s.meeting_link));
        }

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
            const studentRequests = activeCohorts.map(c =>
              apiClient.get(API_ENDPOINTS.COHORTS.STUDENTS(c.id))
            );
            const studentResults = await Promise.allSettled(studentRequests);
            
            let count = 0;
            const seenIds = new Set();
            studentResults.forEach(result => {
              if (result.status === "fulfilled") {
                const data = result.value.data;
                const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
                arr.forEach(student => {
                  if (!seenIds.has(student.id)) {
                    seenIds.add(student.id);
                    count++;
                  }
                });
              }
            });
            setTotalStudents(count);
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
  const salutation = getSalutation(user?.gender);
  const welcomeName = firstName ? `${firstName}${salutation}` : (user?.email || "Mentor");

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
          {[1,2,3,4].map(i => (
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
            <StatBox icon={<FiUsers />} label="My Students" value={totalStudents} href="/mentor/students" color="#10b981" />
            <StatBox icon={<FiClock />} label="Live Today" value={todaySessions.length} href="/mentor/meeting-links" color="#f59e0b" />
            <StatBox icon={<FiFileText />} label="Submissions" value={recentSubmissions.length} href="/mentor/assignments" color="#8b5cf6" />
          </motion.div>

          <div className={styles.mainContent}>
            {/* Left Column */}
            <div className={styles.leftCol}>
              <motion.div variants={item}>
                <Card className={styles.sectionCard}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Live Classes Today</h2>
                    <Link to="/mentor/meeting-links" className={styles.viewAll}>View all</Link>
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
                            <div className={styles.sessionDot} />
                            <div className={styles.sessionDetails}>
                              <span className={styles.sessionTitle}>{session.title}</span>
                              <span className={styles.sessionTime}>{session.start_time}</span>
                            </div>
                            {session.meeting_link && (
                              <a href={session.meeting_link} target="_blank" rel="noreferrer" className={styles.joinBtn}>
                                Join
                              </a>
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
                    <QuickAction href="/mentor/meeting-links" icon={<FiClock />} label="View Meeting Links" />
                    <QuickAction href="/mentor/assignments" icon={<FiFileText />} label="Manage Assignments" />
                    <QuickAction href="/mentor/students" icon={<FiUsers />} label="View Students" />
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
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
