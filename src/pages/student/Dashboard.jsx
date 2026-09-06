import React, { useState, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService, checkCurrentEnrollment, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import { attendanceService } from "../../services/attendanceService";
import { assignmentService } from "../../services/assignmentService";
import { examService } from "../../services/examService";
import { requestService } from "../../services/requestService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
const ProgressDonutChart = React.lazy(() => import("./ProgressDonutChart"));
import styles from "./Dashboard.module.css";
import { FiCheckCircle, FiClock, FiAlertCircle, FiCpu, FiUsers, FiBarChart2, FiUser, FiVideo, FiFileText, FiEdit, FiBookOpen, FiArrowRight, FiLock, FiCalendar, FiAward, FiX, FiBell } from "react-icons/fi";
import { FaLaptopCode, FaRegCalendarAlt } from "react-icons/fa";
const FeedbackWidget = React.lazy(() => import("../../components/common/FeedbackWidget"));
const AttendanceWarningPopup = React.lazy(() => import("../../components/attendance/AttendanceWarningPopup"));
import { pushNotificationService } from "../../services/pushNotificationService";
const PushNotificationBanner = React.lazy(() => import("../../components/common/PushNotificationBanner"));

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [activeApp, setActiveApp] = useState(null);
  const [resolvedEnrollment, setResolvedEnrollment] = useState({ isEnrolled: false });
  const [todayClasses, setTodayClasses] = useState([]);
  const [availableResources, setAvailableResources] = useState([]);
  const [isJoining, setIsJoining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({});

  // Dashboard Stats State
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [assignmentStats, setAssignmentStats] = useState({ completed: 0, pending: 0, overdue: 0 });
  const [examStats, setExamStats] = useState({ completed: 0, upcoming: 0 });
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [isSuspended, setIsSuspended] = useState(false);
  const [showLateJoinModal, setShowLateJoinModal] = useState(false);
  const [lateJoinReason, setLateJoinReason] = useState("");
  const [lateJoinClassId, setLateJoinClassId] = useState(null);
  const [isSubmittingLateJoin, setIsSubmittingLateJoin] = useState(false);
  
  // UX Consolidation States
  const [showMentorModal, setShowMentorModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceSessionId, setAbsenceSessionId] = useState(null);
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);
  const [mentorsMap, setMentorsMap] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function fetchCoreData() {
      if (!user?.email) return;
      try {
        const [profileRes, statsRes, appRes, coursesRes, mentorsRes] = await Promise.all([
          studentService.getStudentProfiles({ user__email: user.email }, { signal: abortController.signal }).catch(() => null),
          apiClient.get(API_ENDPOINTS.STUDENTS.STATISTICS).catch(() => ({ data: {} })),
          apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/").catch(() => ({ data: [] })),
          courseService.getCourses().catch(() => []),
          apiClient.get(API_ENDPOINTS.MENTORS?.BASE || "/api/volunteers/mentor-profiles/").catch(() => ({ data: [] }))
        ]);

        const profileData = profileRes?.data || profileRes;
        const profileObj = Array.isArray(profileData?.results) ? profileData.results[0] : (Array.isArray(profileData) ? profileData[0] : profileData);

        // Build mentors map
        const allMentors = Array.isArray(mentorsRes?.data?.results) ? mentorsRes.data.results : (Array.isArray(mentorsRes?.data) ? mentorsRes.data : []);
        const mentorMap = {};
        allMentors.forEach(m => {
          if (m.user) mentorMap[m.user] = m;
          if (m.id) mentorMap[m.id] = m;
        });

        const apps = appRes?.data?.results || appRes?.data || [];
        const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);

        // Find active/enrolled application by status — covers all cohort phases
        const ENROLLED_STATUSES = ['COHORT_ASSIGNED', 'IN_PROGRESS', 'ACTIVE', 'TRAINING', 'INTERNSHIP', 'SOFT_SKILLS', 'PRE_TRAINING', 'COMPLETED', 'SUSPENDED'];
        const enrolled = apps.find(a => ENROLLED_STATUSES.includes(a.status));

        const cohortData = statsRes?.data?.active_cohort || enrolled?.assigned_cohort || profileObj?.current_application?.assigned_cohort || {};


        if (isMounted) {
          setMentorsMap(mentorMap);
          setProfile(profileObj || {});
          setStats(statsRes?.data || {});
        }

        if (isMounted && enrolled) {
          setActiveApp(enrolled);
          if (enrolled.status === "SUSPENDED") {
            setIsSuspended(true);
          }
        } else if (isMounted && profileObj?.current_application?.assigned_cohort) {
          // Fallback: apps list may be stale — use the cohort from the profile's current_application
          setActiveApp(profileObj.current_application);
        }

        const enrollmentStatus = resolveStudentEnrollment(profileObj, apps, courses);

        // Bulletproof Domain Fallback: If activeApp is missing, try matching course by title from stats or profile
        if (!enrollmentStatus.courseDomain) {
          const fallbackTitle = profileObj?.current_application?.course?.name || statsRes?.data?.application_course_title || profileObj?.course_name;
          if (fallbackTitle) {
            const fallbackMatched = courses.find(c => c.name === fallbackTitle);
            if (fallbackMatched) {
              enrollmentStatus.courseDomain = fallbackMatched.domain;
            }
          }
        }

        if (isMounted) setResolvedEnrollment(enrollmentStatus);

        // Core data loaded, unlock UI immediately!
        if (isMounted) setIsLoading(false);

        // Robust cohort and course ID extraction
        // NOTE: Use `enrolled` (local var) NOT `activeApp` (React state) — state is async and stale here!
        const getStrId = (val) => {
          if (!val) return null;
          return typeof val === 'string' ? val : (val.id || null);
        };
        const cohortId = getStrId(enrolled?.assigned_cohort)
          || getStrId(statsRes?.data?.active_cohort)
          || getStrId(profileObj?.current_application?.assigned_cohort)
          || getStrId(profileObj?.cohort)
          || getStrId(profileObj?.course_batch);
        const courseId = getStrId(enrolled?.course) || getStrId(profileObj?.current_application?.course) || getStrId(profileObj?.course) || getStrId(statsRes?.data?.active_course);

        // Fetch remaining secondary data non-blockingly
        if (enrollmentStatus.isEnrolled && isMounted) {
          apiClient.get(API_ENDPOINTS.ATTENDANCE.SUMMARY).then(attRes => {
            const attData = attRes.data?.results || attRes.data || [];
            if (attData.length > 0 && isMounted) {
              const myAtt = attData.find(a => a.student_id === user?.id || a.user?.id === user?.id || a.email === user?.email) || attData[0];
              setAttendanceStats(myAtt);
              if (myAtt.history) setAttendanceHistory(myAtt.history);
            }
          }).catch((err) => {
            if (err.response?.status === 403) setIsSuspended(true);
          });

          Promise.all([
            assignmentService.getAssignments({ cohort: cohortId }).catch((err) => {
              if (err.response?.status === 403) setIsSuspended(true);
              return [];
            }),
            assignmentService.getSubmissions({ student: user?.id }).catch((err) => {
              if (err.response?.status === 403) setIsSuspended(true);
              return [];
            })
          ]).then(([assignRes, subRes]) => {
            const assignments = assignRes.results || assignRes || [];
            const submissions = subRes.results || subRes || [];
            const completed = submissions.length;
            const total = assignments.length;
            const pending = total - completed;
            if (isMounted) setAssignmentStats({ completed, pending: pending > 0 ? pending : 0, overdue: 0 });
          });

          apiClient.get(API_ENDPOINTS.EXAMS.BASE).then(exRes => {
            const rawData = exRes.data || exRes;
            const exams = rawData.results || rawData || [];
            if (isMounted) setExamStats({ completed: exams.filter(e => e.status === 'COMPLETED').length, upcoming: exams.filter(e => e.status !== 'COMPLETED').length });
          }).catch((err) => {
            if (err.response?.status === 403) setIsSuspended(true);
          });

          // Fetch recent announcements/notifications for the dashboard
          apiClient.get(API_ENDPOINTS.NOTIFICATIONS.BASE, { params: { page_size: 5 } }).then(notifRes => {
            const notifs = notifRes.data?.results || notifRes.data || [];
            if (isMounted) setAnnouncements(Array.isArray(notifs) ? notifs.slice(0, 5) : []);
          }).catch(() => {});
        }

        // Fetch all sessions for this cohort — no status filter so upcoming ones are included
        const sessionParams = {};
        if (cohortId) sessionParams.cohort = cohortId;
        if (courseId) sessionParams.course = courseId;

        // Fetch scheduled LST/SST/Domain sessions limited to their cohort
        Promise.allSettled([
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE, { params: sessionParams }),
          apiClient.get(API_ENDPOINTS.TRAININGS.SESSIONS, { params: sessionParams })
        ]).then(([domainRes, trainingRes]) => {
          let combinedSessions = [];

          if (domainRes.status === "fulfilled" && domainRes.value) {
            const data = domainRes.value.data;
            const sessionsArray = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
            combinedSessions = [...combinedSessions, ...sessionsArray.map(s => ({
              ...s,
              id: `domain_${s.id}`,
              realId: s.id,
              type: "DOMAIN"
            }))];
          }

          if (trainingRes.status === "fulfilled" && trainingRes.value) {
            const data = trainingRes.value.data;
            const sessionsArray = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
            combinedSessions = [...combinedSessions, ...sessionsArray.map(s => ({
              ...s,
              id: `training_${s.id}`,
              realId: s.id,
              type: "TRAINING",
              class_date: s.session_date // map session_date to class_date for uniform radar parsing
            }))];
          }

          if (isMounted) setTodayClasses(combinedSessions);
        }).catch((err) => {
          if (err.response?.status === 403) setIsSuspended(true);
        });

      } catch (err) {
        console.error("Error loading core dashboard data:", err);
        if (isMounted) setIsLoading(false);
      }
    }

    fetchCoreData();
    return () => { isMounted = false; abortController.abort(); };
  }, [user?.email]);

  const handleJoinClass = async (cls) => {
    setIsJoining(true);
    try {
      if (cls.type === "DOMAIN") {
        await attendanceService.markJoined(cls.realId);
      }
      // If it's a TRAINING session, there might not be a markJoined API yet, 
      // or it might use the same. We skip it if not DOMAIN to be safe, 
      // since attendance is server-side Google Meet.
    } catch (err) {
      console.error("Failed to mark joined", err);
    }
    setTimeout(() => {
      setIsJoining(false);
      window.open(cls.meeting_link?.startsWith('http') ? cls.meeting_link : `https://${cls.meeting_link}`, '_blank');
    }, 1000);
  };

  const handleRequestPermission = async () => {
    if (!lateJoinReason.trim() || !lateJoinClassId) {
      alert("Please provide a reason for joining late.");
      return;
    }
    setIsSubmittingLateJoin(true);
    try {
      await requestService.createRequest({
        subject: `Late Join Request (Class ID: ${lateJoinClassId})`,
        description: lateJoinReason,
        category: 'ATTENDANCE'
      });
      alert("Permission request submitted successfully.");
      setShowLateJoinModal(false);
      setLateJoinReason("");

      // Update local state to reflect the pending warning
      setTodayClasses(prev => prev.map(cls =>
        cls.id === lateJoinClassId ? { ...cls, warning_state: 'APOLOGIZED' } : cls
      ));
    } catch (error) {
      console.error("Permission request failed", error);
      alert(error.response?.data?.detail || "Failed to submit permission request.");
    } finally {
      setIsSubmittingLateJoin(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.dashboardContainer}>
        <Suspense fallback={null}>
          <PushNotificationBanner />
        </Suspense>
        
        {/* SECTION 1: Top Layer (Hero + Calendar) */}
        <div className={styles.topSection}>
          <div className={styles.heroBanner}>
            <div className={styles.heroLeft}>
              <p className={styles.heroGreeting}>Welcome back,</p>
              <h1 className={styles.heroName}>
                {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || profile?.first_name || "Student"}!
              </h1>
              <p className={styles.heroSubtitle}>Keep learning, keep building. You're one step closer to your goals.</p>
              
              <div className={styles.heroQuote}>
                <p className={styles.heroQuoteText}>"Discipline today builds the career you deserve tomorrow."</p>
                <p className={styles.heroQuoteAuthor}>— SURE ProEd</p>
              </div>
            </div>
            
            <div className={styles.heroRight}>
              <div style={{ textAlign: 'right' }}>
                 <h3 className={styles.heroValues}>Learn<br/>Build<br/>Grow<br/>Belong</h3>
                 <div className={styles.shiningLine}></div>
                 <p className={styles.heroSignature}>SURE ProEd</p>
              </div>
            </div>
          </div>
  
          <div className={styles.skeletonBox} style={{ flex: 1, minWidth: '260px' }}></div>
        </div>
  
        <div className={styles.skeletonContainer} style={{ paddingTop: 0 }}>
          <div className={styles.skeletonBox} style={{ height: '240px' }}></div>
          <div className={styles.skeletonBox}></div>
        </div>
      </div>
    );
  }

  // 🚨 LOCK SCREEN LOGIC 🚨
  const isDropped = stats?.application_status === "DROPPED" || activeApp?.status === "DROPPED";
  const hasEnrollment = resolvedEnrollment.isEnrolled;
  const isLocked = !hasEnrollment || isSuspended || isDropped;
  const isRevoked = profile?.status === "ADMIN_REJECTED";
  const isExisting = resolvedEnrollment.isExistingStudent;

  if (isLocked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '24px', textAlign: 'center', border: '1px solid var(--border-color)', maxWidth: '500px' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '24px', marginBottom: '16px' }}>
            {isDropped ? "Access Revoked" : isSuspended ? "Cohort Access Suspended" : isRevoked ? "Access Revoked" : (isExisting ? "Account Pending Verification" : "Welcome to SURE ProEd")}
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '24px' }}>
            {isDropped
              ? "You have been dropped from this cohort for failing to attend a mandatory Module Test."
              : isSuspended
              ? "Your access to this cohort is currently suspended. Please contact the administration for assistance."
              : isRevoked
                ? "Your access has been temporarily revoked by an administrator."
                : (isExisting
                  ? "Please complete your Offer Letter verification in your Profile to restore your cohort access."
                  : "Please complete your Profile and click 'Apply Course' to begin your journey.")}
          </p>
          <div style={{ background: 'var(--bg-nested)', padding: '16px', borderRadius: '12px', color: 'var(--primary-color)' }}>
            <strong>Status:</strong> {isDropped ? "DROPPED" : isSuspended ? "SUSPENDED" : activeApp?.status ? activeApp.status.replace("_", " ") : (profile?.status ? profile.status.replace("_", " ") : "Action Required")}
          </div>
        </div>
      </div>
    );
  }

  const COLORS = ['var(--primary-color)', 'var(--bg-nested)', '#ef4444'];
  const assignmentData = [
    { name: 'Completed', value: assignmentStats.completed },
    { name: 'Pending', value: assignmentStats.pending },
  ];

  // 🚨 ACTIVE DASHBOARD 🚨
  const renderCalendar = () => {
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    const firstDay = new Date(calMonth.year, calMonth.month, 1).getDay();
    const today = new Date();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className={styles.calendarDayEmpty}>-</div>);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = today.getDate() === i && today.getMonth() === calMonth.month && today.getFullYear() === calMonth.year;
      days.push(
        <div key={`day-${i}`} className={isToday ? styles.calendarDayToday : styles.calendarDay}>
          {i}
        </div>
      );
    }
    return days;
  };

  return (
    <div className={styles.dashboardContainer}>
      <Suspense fallback={null}>
        <PushNotificationBanner />
      </Suspense>

      
      {/* SECTION 1: Top Layer (Hero + Calendar) */}
      <div className={styles.topSection}>
        <div className={styles.heroBanner}>
          <div className={styles.heroLeft}>
            <p className={styles.heroGreeting}>Welcome back,</p>
            <h1 className={styles.heroName}>
              {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || profile?.first_name || "Student"}!
            </h1>
            <p className={styles.heroSubtitle}>Keep learning, keep building. You're one step closer to your goals.</p>
            
            <div className={styles.heroQuote}>
              <p className={styles.heroQuoteText}>"Discipline today builds the career you deserve tomorrow."</p>
              <p className={styles.heroQuoteAuthor}>— SURE ProEd</p>
            </div>
          </div>
          
          <div className={styles.heroRight}>
            <div style={{ textAlign: 'right' }}>
               <h3 className={styles.heroValues}>Learn<br/>Build<br/>Grow<br/>Belong</h3>
               <div className={styles.shiningLine}></div>
               <p className={styles.heroSignature}>SURE ProEd</p>
            </div>
          </div>
        </div>

        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <h4 className={styles.calendarTitle}>
              {new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h4>
            <div className={styles.calendarNav}>
              <button className={styles.calendarNavBtn} onClick={() => setCalMonth(prev => ({ year: prev.month === 0 ? prev.year - 1 : prev.year, month: prev.month === 0 ? 11 : prev.month - 1 }))}>&lt;</button>
              <button className={styles.calendarNavBtn} onClick={() => setCalMonth(prev => ({ year: prev.month === 11 ? prev.year + 1 : prev.year, month: prev.month === 11 ? 0 : prev.month + 1 }))}>&gt;</button>
            </div>
          </div>
          <div className={styles.calendarGrid}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className={styles.calendarDayLabel}>{d}</div>)}
            {renderCalendar()}
          </div>
        </div>
      </div>

      {resolvedEnrollment?.status === "COMPLETED" && (
        <div className={styles.completedBanner}>
          <div style={{ fontSize: '32px' }}>🎉</div>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Congratulations! Your Cohort is Completed</h4>
            <p style={{ margin: 0, opacity: 0.9 }}>You have successfully completed this program. You can now apply for your next cohort and continue your journey.</p>
          </div>
          <button onClick={() => navigate('/student/apply-course')} className={styles.completedBannerBtn}>Apply Now</button>
        </div>
      )}

      
      {/* SECTION 2: Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconCourse}`}><FiCpu size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Current Course</p>
            <h4 className={styles.summaryValue} title={resolvedEnrollment?.courseName || profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"}>
              {resolvedEnrollment?.courseName || profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"}
            </h4>
          </div>
        </div>
        
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconCohort}`}><FiUsers size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Cohort</p>
            <h4 className={styles.summaryValue}>{resolvedEnrollment?.group || profile?.current_application?.assigned_cohort?.code || stats?.active_cohort?.code || profile?.cohort_code || "Awaiting Cohort"}</h4>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconStatus}`}><FiBarChart2 size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Learning Status</p>
            <h4 className={styles.summaryValue}>{resolvedEnrollment?.status ? resolvedEnrollment.status.replace(/_/g, " ") : "ACTIVE"}</h4>
          </div>
        </div>

        <div className={styles.summaryCard} onClick={() => setShowMentorModal(true)} style={{ cursor: 'pointer' }}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconMentors}`}><FiUser size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Mentors</p>
            <h4 className={styles.summaryValue}>
              {(() => {
                const cohortData = stats?.active_cohort || profile?.current_application?.assigned_cohort || {};
                let count = 0;
                let mentorName = null;
                if (cohortData.active_mentors) {
                  count = cohortData.active_mentors.length;
                  if(cohortData.current_mentor_details) {
                    mentorName = cohortData.current_mentor_details.first_name || cohortData.current_mentor_details.name;
                  }
                }
                else if (cohortData.mentors) count = cohortData.mentors.length;
                else if (cohortData.mentor_name && cohortData.mentor_name !== "Not assigned") count = cohortData.mentor_name.split(',').length;
                
                if (count > 0) {
                  return mentorName ? `${count} Assigned · ${mentorName}` : `${count} Assigned`;
                }
                return "Pending";
              })()}
            </h4>
          </div>
          <FiArrowRight size={18} color="var(--text-muted)" />
        </div>
      </div>

      {/* SECTION 3: Main Grid (4 columns) */}
      <div className={styles.mainGrid}>
        
        {/* Col 1: Learning Progress */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>My Learning Progress</h3>
          </div>
          <div className={styles.progressCenter} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <Suspense fallback={<div className={styles.progressDonut} />}>
              <ProgressDonutChart attendanceStats={attendanceStats} stats={stats} />
            </Suspense>
          </div>
        </div>

        
        {/* Col 2: Current Enrollment */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Current Enrollment</h3>
            <span className={styles.enrollmentBadge}>{resolvedEnrollment?.status ? resolvedEnrollment.status.replace(/_/g, " ") : "ACTIVE"}</span>
          </div>
          <div className={styles.enrollmentCard} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                 {(() => {
                   const cName = (resolvedEnrollment?.courseName || profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "").toLowerCase();
                   if (cName.includes("vlsi") || cName.includes("silicon") || cName.includes("circuit")) return <FiCpu size={28} />;
                   if (cName.includes("data") || cName.includes("sql") || cName.includes("analytics")) return <FiBarChart2 size={28} />;
                   if (cName.includes("web") || cName.includes("stack") || cName.includes("developer") || cName.includes("software")) return <FaLaptopCode size={28} />;
                   if (cName.includes("security") || cName.includes("cyber") || cName.includes("hack")) return <FiLock size={28} />;
                   if (cName.includes("ui") || cName.includes("ux") || cName.includes("graphic")) return <FiEdit size={28} />;
                   if (cName.includes("cloud") || cName.includes("aws")) return <FiCpu size={28} />;
                   return <FiBookOpen size={28} />;
                 })()}
              </div>
              <h4 className={styles.enrollmentTitle} style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                 {resolvedEnrollment?.courseName || profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"}
              </h4>
            </div>
            
            <div className={styles.enrollmentMetaWrapper}>
              <div className={styles.enrollmentMetaItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiLock size={14} color="var(--text-muted)" />
                  <span className={styles.enrollmentMetaLabel}>Domain</span>
                </div>
                <span className={styles.enrollmentMetaValue}>
                  {resolvedEnrollment?.courseDomain || profile?.current_application?.course?.domain || stats?.active_cohort?.course_domain || stats?.application_course_domain || (resolvedEnrollment?.courseName || stats?.application_course_title || profile?.course_name || "").split(" ")[0] || "General"}
                </span>
              </div>
              <div className={styles.enrollmentMetaItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiCalendar size={14} color="var(--text-muted)" />
                  <span className={styles.enrollmentMetaLabel}>Start Date</span>
                </div>
                <span className={styles.enrollmentMetaValue}>
                  {(() => {
                    const cohortData = stats?.active_cohort || profile?.current_application?.assigned_cohort || {};
                    const d = stats?.cohort_start_date || resolvedEnrollment?.startDate || cohortData.start_date || cohortData.startDate || profile?.current_application?.applied_at || profile?.current_application?.created_at || profile?.created_at || new Date().toISOString();
                    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  })()}
                </span>
              </div>
            </div>
            
            <div style={{ marginBottom: '24px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Modules Passed Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Modules Passed</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{stats?.module_tests_passed || 0} / {stats?.active_cohort?.modules?.length || 0}</span>
                </div>
                <div className={styles.enrollmentProgressContainer} style={{ marginBottom: 0 }}>
                  <div className={styles.enrollmentProgressBarBg}>
                    <div 
                      className={styles.enrollmentProgressFill} 
                      style={{ 
                        width: `${Math.round(stats?.course_percentage || 0)}%`, 
                        transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)', 
                        background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' 
                      }}
                    ></div>
                  </div>
                  <span className={styles.enrollmentProgressText}>{Math.round(stats?.course_percentage || 0)}%</span>
                </div>
              </div>
              
              {/* Course Progress (Time-based) Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Course Progress</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                    {Math.round(stats?.time_elapsed_percentage || 0)}%
                  </span>
                </div>
                <div className={styles.enrollmentProgressContainer} style={{ marginBottom: 0 }}>
                  <div className={styles.enrollmentProgressBarBg}>
                    <div 
                      className={styles.enrollmentProgressFill} 
                      style={{ 
                        width: `${Math.round(stats?.time_elapsed_percentage || 0)}%`, 
                        transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)', 
                        background: 'linear-gradient(90deg, #10b981, #34d399)' 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
              
            </div>

            <button className={styles.enrollmentViewBtn} onClick={() => navigate('/student/module-tests')}>
              View Detailed Progress &rarr;
            </button>
          </div>
        </div>


        
        {/* Col 3: Upcoming Live Classes */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Upcoming Live Classes</h3>
            <button className={styles.cardViewAll} onClick={() => navigate('/student/class-schedule')}>View All &rarr;</button>
          </div>
          <div className={styles.classesListContainer}>
            {(() => {
              const now = new Date();
              const allVisibleClasses = todayClasses.filter(cls => {
                const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
                if (isNaN(classStart)) return false;
                let classEnd = cls.end_time ? new Date(`${cls.class_date}T${cls.end_time}`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
                if (classEnd < classStart) classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                
                if (now > classEnd) {
                   const hoursSinceEnd = (now - classEnd) / (1000 * 60 * 60);
                   if (hoursSinceEnd > 12) return false;
                }
                return true;
              }).sort((a, b) => {
                const getStatusRank = (cls) => {
                  const start = new Date(`${cls.class_date}T${cls.start_time}`);
                  let end = cls.end_time ? new Date(`${cls.class_date}T${cls.end_time}`) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
                  if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                  
                  const clsStatus = (cls.class_status || cls.status || "").toUpperCase();
                  const effectiveStatus = (cls.effective_status || "").toUpperCase();
                  // Only backend status determines Completed — not time alone
                  // If class_status is SCHEDULED, admin hasn't ended it — rank as Ongoing
                  if ((clsStatus === 'COMPLETED' || clsStatus === 'ENDED') ||
                      (effectiveStatus === 'COMPLETED' && clsStatus !== 'SCHEDULED')) return 2;
                  if (clsStatus === 'CANCELLED') return 3;

                  if (now >= start && now <= end) return 0; // Ongoing (within time window)
                  if (now < start) return 1; // Upcoming
                  return 0; // Past scheduled time but not ended by admin = still ongoing
                };
                
                const rankA = getStatusRank(a);
                const rankB = getStatusRank(b);
                
                if (rankA !== rankB) return rankA - rankB;
                
                const startA = new Date(`${a.class_date}T${a.start_time}`);
                const startB = new Date(`${b.class_date}T${b.start_time}`);
                
                if (rankA === 1) return startA - startB; // Upcoming: closest first
                return startB - startA; // Ongoing or Past: most recent first
              });
              const visibleClasses = allVisibleClasses.slice(0, 3);

              if (visibleClasses.length === 0) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '32px 16px' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-nested)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                      <FiCalendar size={36} color="var(--text-muted)" opacity={0.6} />
                    </div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: 'var(--text-primary)', fontWeight: 'bold' }}>No live classes scheduled currently.</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>You're all caught up! New classes will appear here once they are scheduled.</p>
                  </div>
                );
              }

              const classesList = visibleClasses.map((cls, idx) => {
                const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
                let classEnd = cls.end_time ? new Date(`${cls.class_date}T${cls.end_time}`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
                if (classEnd < classStart) classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                
                const clsStatus = (cls.class_status || cls.status || "").toUpperCase();
                const effectiveStatus = (cls.effective_status || "").toUpperCase();

                // Use effective_status from backend, but NEVER auto-complete based on time:
                // If the raw class_status is SCHEDULED, admin hasn't ended it — keep it Ongoing
                const isCompleted = (clsStatus === 'COMPLETED' || clsStatus === 'ENDED') ||
                                    (effectiveStatus === 'COMPLETED' && clsStatus !== 'SCHEDULED');
                const isCancelled = clsStatus === 'CANCELLED' || effectiveStatus === 'CANCELLED';

                const windowOpenTime = new Date(classStart.getTime() - 10 * 60 * 1000);

                // Join allowed exactly between T-10 and T-0
                const isJoinWindowOpen = !isCompleted && !isCancelled && now >= windowOpenTime && now <= classStart;

                // Ongoing/Late: any time after start when admin hasn't ended it
                const isLate = !isCompleted && !isCancelled && now > classStart;
                
                const startsIn = Math.floor((classStart - now) / 60000);

                let rightElement;
                if (isCompleted) { 
                  rightElement = <span className={styles.badgeCompleted}>Completed</span>;
                } else if (isCancelled) { 
                  rightElement = <span className={styles.badgeCancelled}>Cancelled</span>;
                } else if (isJoinWindowOpen) { 
                  rightElement = <button className={styles.btnJoinClass} onClick={() => handleJoinClass(cls)}>Join Class</button>;
                } else if (isLate) {
                  rightElement = (
                    <div style={{ textAlign: 'right' }}>
                      <span className={styles.badgeOngoing}>Ongoing (Late)</span>
                      <button onClick={() => { setLateJoinClassId(cls.id || cls.realId); setShowLateJoinModal(true); }} className={styles.btnAskAdmin} style={{ marginTop: '4px' }}>Ask Admin</button>
                    </div>
                  );
                } else if (startsIn > 0) {
                  const hrs = Math.floor(startsIn / 60);
                  const mins = startsIn % 60;
                  const timeText = hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
                  rightElement = (
                    <div className={styles.startsInBadge}>
                      <span className={styles.startsInLabel}>Starts in</span>
                      <span className={styles.startsInTime}>{timeText}</span>
                    </div>
                  );
                }

                return (
                  <div key={idx} style={{ marginBottom: '16px' }}>
                    <div className={styles.classItemContainer}>
                      <div className={styles.classItemIconBox}>
                        <FiCalendar size={18} />
                      </div>
                      <div className={styles.classItemDetails}>
                        <h4 className={styles.classItemName}>{cls.title || cls.class_type || "Live Session"}</h4>
                        <p className={styles.classItemTime}>
                          <FiClock size={12} style={{marginRight: '4px'}}/>
                          {classStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className={styles.classItemRight}>
                        {rightElement}
                      </div>
                    </div>
                    {(isJoinWindowOpen || isLate) && (
                      <div className={styles.classInstructions}>
                        <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-primary)' }}>📌 Before Joining</h5>
                        <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.4' }}>
                          <li>Keep your camera ON during the class.</li>
                          <li>Keep your microphone available.</li>
                          <li>Do not leave the Meet before the class ends.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                );
              });
              
              return (
                <>
                  {classesList}
                  {allVisibleClasses.length > 0 && (
                     <button className={styles.viewAllClassesBtn} onClick={() => navigate('/student/class-schedule')}>
                       {allVisibleClasses.length > 3 ? `+ ${allVisibleClasses.length - 3} more classes available. View All Classes →` : "View All Classes →"}
                     </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>


      </div>

      
      {/* SECTION 4: Quick Actions Row */}
      <div className={styles.quickActionsWrapper}>
        <h3 className={styles.quickActionsHeading}>Quick Actions</h3>
        <div className={styles.quickActions}>
          <div className={styles.quickAction} onClick={() => navigate('/student/assignments')}>
            <div className={styles.quickActionIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><FiFileText size={24} /></div>
            <div style={{ flexGrow: 1 }}>
              <h4 className={styles.quickActionTitle}>View Assignments</h4>
              <p className={styles.quickActionDesc}>Check and submit your work</p>
            </div>
            <FiArrowRight size={18} color="var(--text-muted)" />
          </div>

          {(stats?.upcoming_exams?.length > 0 || profile?.current_application?.requires_exam) && (
            <div className={styles.quickAction} onClick={() => navigate('/student/exams')}>
              <div className={styles.quickActionIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}><FiEdit size={24} /></div>
              <div style={{ flexGrow: 1 }}>
                <h4 className={styles.quickActionTitle}>Take Exam</h4>
                <p className={styles.quickActionDesc}>Go to exam instructions</p>
              </div>
              <FiArrowRight size={18} color="var(--text-muted)" />
            </div>
          )}

          <div className={styles.quickAction} onClick={() => navigate('/student/resources')}>
            <div className={styles.quickActionIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}><FiBookOpen size={24} /></div>
            <div style={{ flexGrow: 1 }}>
              <h4 className={styles.quickActionTitle}>View Resources</h4>
              <p className={styles.quickActionDesc}>Notes, recordings & more</p>
            </div>
            <FiArrowRight size={18} color="var(--text-muted)" />
          </div>

          <div className={styles.quickAction} onClick={() => navigate('/student/attendance')}>
            <div className={styles.quickActionIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><FiBarChart2 size={24} /></div>
            <div style={{ flexGrow: 1 }}>
              <h4 className={styles.quickActionTitle}>My Attendance</h4>
              <p className={styles.quickActionDesc}>View your attendance</p>
            </div>
            <FiArrowRight size={18} color="var(--text-muted)" />
          </div>

          <div className={styles.quickAction} onClick={() => navigate('/student/certificates')}>
            <div className={styles.quickActionIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}><FiAward size={24} /></div>
            <div style={{ flexGrow: 1 }}>
              <h4 className={styles.quickActionTitle}>My Certificates</h4>
              <p className={styles.quickActionDesc}>View earned certificates</p>
            </div>
            <FiArrowRight size={18} color="var(--text-muted)" />
          </div>
        </div>
      </div>

      {/* SECTION 5: Feedback, Offer Letters, and Announcements */}
      <div className={styles.quickActions} style={{ marginTop: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Feedback Stats */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3>Share Your Experience</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Your feedback helps us improve SURE ProEd.</p>
          </div>
          <Suspense fallback={null}>
            <FeedbackWidget currentMentor={stats?.active_cohort?.current_mentor_details || profile?.current_application?.assigned_cohort?.current_mentor_details} />
          </Suspense>
        </div>

        {/* Offer Letters Card */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3>Offer Letters</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>View and manage your internship offer letters.</p>
          </div>
          <button onClick={() => navigate('/student/applications')} style={{ width: '100%', padding: '10px 16px', backgroundColor: 'var(--brand-color, #2563eb)', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
            Go to Applications →
          </button>
        </div>

        {/* Announcements Card */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <h3 style={{ margin: 0 }}>Announcements</h3>
              {announcements.length > 0 && (
                <span className={styles.unreadBadge} style={{ position: 'static', marginLeft: 0 }}>{announcements.length}</span>
              )}
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Stay up to date with the latest platform updates.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setIsAnnouncementsOpen(true)} style={{ flex: 1, padding: '10px', backgroundColor: 'var(--bg-nested)', color: 'var(--text-primary)', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', cursor: 'pointer' }}>
              View Recent
            </button>
            <button onClick={() => navigate('/student/announcements')} style={{ flex: 1, padding: '10px', backgroundColor: 'var(--primary-color)', color: '#fff', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
              All History →
            </button>
          </div>
        </div>
      </div>

      <AttendanceWarningPopup />
      {showLateJoinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 48px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', position: 'relative' }}>
            <button onClick={() => setShowLateJoinModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'var(--bg-nested)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: 'var(--text-primary)' }}>Request Late Join</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Please provide a reason for joining late. This will be reviewed by your mentor.</p>
            <textarea
              value={lateJoinReason}
              onChange={(e) => setLateJoinReason(e.target.value)}
              placeholder="E.g., I had an emergency..."
              style={{ width: '100%', minHeight: '100px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-nested)', color: 'var(--text-primary)', fontSize: '14px', resize: 'none', marginBottom: '20px', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleRequestPermission}
              disabled={isSubmittingLateJoin || !lateJoinReason.trim()}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--brand-color, #2563eb)', color: 'var(--text-inverse)', fontWeight: 'bold', fontSize: '15px', cursor: isSubmittingLateJoin || !lateJoinReason.trim() ? 'not-allowed' : 'pointer', opacity: isSubmittingLateJoin || !lateJoinReason.trim() ? 0.7 : 1, transition: '0.2s' }}
            >
              {isSubmittingLateJoin ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {/* Mentor List Modal */}
      {showMentorModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMentorModal(false)}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 48px rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowMentorModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><FiX size={24} /></button>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: 'var(--text-primary)' }}>All Assigned Mentors</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                    {(() => {
                const cohortData = stats?.active_cohort || profile?.current_application?.assigned_cohort || {};
                let activeMentors = cohortData.active_mentors || [];
                
                if (activeMentors.length === 0) {
                  if (cohortData.mentors && cohortData.mentors.length > 0) {
                    if (typeof cohortData.mentors[0] === 'object') {
                      activeMentors = cohortData.mentors;
                    } else {
                      const isNameArray = typeof cohortData.mentors[0] === 'string' && cohortData.mentors[0].includes(' ');
                      if (isNameArray && !mentorsMap[cohortData.mentors[0]]) {
                        activeMentors = cohortData.mentors.map((name, i) => ({ id: `mentor-${i}`, first_name: name }));
                      } else {
                        const names = cohortData.mentor_name && cohortData.mentor_name !== "Not assigned" ? cohortData.mentor_name.split(',').map(n => n.trim()) : [];
                        activeMentors = cohortData.mentors.map((id, i) => {
                          const m = mentorsMap[id];
                          return m ? m : { id, first_name: names[i] || "Assigned Mentor" };
                        });
                      }
                    }
                  } else if (cohortData.mentor_name && cohortData.mentor_name !== "Not assigned") {
                    activeMentors = cohortData.mentor_name.split(',').map((name, i) => ({ id: `mentor-${i}`, first_name: name.trim() }));
                  }
                }
                
                const currentMentor = cohortData.current_mentor_details;
                
                return (
                  <>
                    {/* Render all mentors uniformly. Highlight the current mentor. */}
                    {activeMentors.map((m, i) => {
                      const isCurrentMentor = currentMentor && (m.id === currentMentor.id || m.email === currentMentor.email);
                      const mName = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.name || m.username || "Mentor";
                      const mPhoto = m.profile_photo || m.photo || m.avatar || m.profile_picture;
                      
                      return (
                        <div 
                          key={i} 
                          onClick={() => {
                            if (m.id) {
                              navigate('/student/mentor-details', { state: { mentorId: m.id } });
                            }
                          }}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            padding: '12px', 
                            border: isCurrentMentor ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-color)', 
                            borderRadius: '12px',
                            background: isCurrentMentor ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-nested)',
                            cursor: m.id ? 'pointer' : 'default',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => { if (m.id) e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
                          onMouseLeave={(e) => { if (m.id) e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isCurrentMentor ? '#10b981' : 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', overflow: 'hidden' }}>
                            {mPhoto ? (
                              <img src={mPhoto} alt={mName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              mName[0] || "M"
                            )}
                          </div>
                          <div style={{ flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>{mName}</h4>
                              {isCurrentMentor && (
                                <span style={{ fontSize: '10px', background: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  ★ Current Mentor
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {m.designation ? `${m.designation} at ${m.company_name || 'Company'}` : 'Mentor'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Absence Permission Modal */}
      {showAbsenceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAbsenceModal(false)}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 48px rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowAbsenceModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><FiX size={24} /></button>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
               <FiAlertCircle color="#f59e0b" /> Seek Permission
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>You have missed this class or joined too late. Please provide a reason to seek admin permission for attendance.</p>
            <textarea
              value={absenceReason}
              onChange={(e) => setAbsenceReason(e.target.value)}
              placeholder="State your reason for absence..."
              style={{ width: '100%', minHeight: '100px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-nested)', color: 'var(--text-primary)', fontSize: '14px', resize: 'none', marginBottom: '20px', fontFamily: 'inherit' }}
            />
            <button
              onClick={async () => {
                if (!absenceReason.trim()) return;
                setIsSubmittingAbsence(true);
                try {
                  // Submit to actual attendance permission endpoint
                  await apiClient.post(API_ENDPOINTS.ATTENDANCE?.REQUEST_PERMISSION || '/attendance/request-permission/', {
                    session_id: absenceSessionId,
                    reason: absenceReason
                  });
                  alert("Permission requested successfully.");
                  setShowAbsenceModal(false);
                  
                  // Optimistically update todayClasses
                  setTodayClasses(prev => prev.map(cls => cls.id === absenceSessionId ? { ...cls, permission_state: 'PENDING' } : cls));
                } catch (e) {
                   alert("Failed to submit permission. " + (e.response?.data?.detail || ""));
                } finally {
                   setIsSubmittingAbsence(false);
                }
              }}
              disabled={isSubmittingAbsence || !absenceReason.trim()}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 'bold', fontSize: '15px', cursor: isSubmittingAbsence || !absenceReason.trim() ? 'not-allowed' : 'pointer', opacity: isSubmittingAbsence || !absenceReason.trim() ? 0.7 : 1, transition: '0.2s' }}
            >
              {isSubmittingAbsence ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {/* Floating Announcements Panel */}
      <div className={styles.floatingAnnouncementsWrapper}>
        <div className={`${styles.announcementPanel} ${isAnnouncementsOpen ? styles.panelOpen : ''}`}>
          <div className={styles.panelHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'var(--primary-color)', padding: '6px', borderRadius: '50%', display: 'flex' }}>
                <FiBell size={16} color="#fff" />
              </div>
              <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>Announcements</h3>
            </div>
            <button className={styles.panelCloseBtn} onClick={() => setIsAnnouncementsOpen(false)}>
              <FiX size={18} />
            </button>
          </div>
          <div className={styles.panelBody}>
            {announcements.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <div style={{ marginBottom: '12px', opacity: 0.5 }}>
                  <FiBell size={32} />
                </div>
                No new announcements.
              </div>
            ) : (
              announcements.map((a, idx) => (
                <div key={idx} className={styles.panelItem}>
                  <div className={styles.panelItemDot}></div>
                  <div style={{ flex: 1 }}>
                    <h4 className={styles.panelItemTitle}>{a.title || a.message}</h4>
                    <p className={styles.panelItemTime}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : 'Recently'}</p>
                  </div>
                </div>
              ))
            )}
            <button className={styles.panelViewAllBtn} onClick={() => navigate('/student/announcements')}>
              View All History &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
