import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useOutletContext } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
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
          let myCohorts = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
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
            status: s.status
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
                            ) : session.meeting_link ? (
                              <a href={session.meeting_link} target="_blank" rel="noreferrer" className={styles.joinBtn}>
                                Join
                              </a>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>No Link</span>
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
