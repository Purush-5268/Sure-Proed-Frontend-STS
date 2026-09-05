import { useState, useEffect } from "react";
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
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import styles from "./Dashboard.module.css";
import { FiCheckCircle, FiClock, FiAlertCircle, FiCpu, FiUsers, FiBarChart2, FiUser, FiVideo, FiFileText, FiEdit, FiBookOpen } from "react-icons/fi";
import { FaLaptopCode, FaRegCalendarAlt } from "react-icons/fa";
import FeedbackWidget from "../../components/common/FeedbackWidget";
import AttendanceWarningPopup from "../../components/attendance/AttendanceWarningPopup";
import { pushNotificationService } from "../../services/pushNotificationService";
import PushNotificationBanner from "../../components/common/PushNotificationBanner";

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
        title: `Late Join Request (Class ID: ${lateJoinClassId})`,
        description: lateJoinReason,
        category: 'PERMISSION'
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
      <div className={styles.skeletonContainer}>
        <div className={`${styles.skeletonBox} ${styles.skeletonHeader}`}></div>
        <div className={styles.skeletonBox} style={{ height: '240px' }}></div>
        <div className={styles.skeletonBox}></div>
      </div>
    );
  }

  // 🚨 LOCK SCREEN LOGIC 🚨
  const hasEnrollment = resolvedEnrollment.isEnrolled;
  const isLocked = !hasEnrollment || isSuspended;
  const isRevoked = profile?.status === "ADMIN_REJECTED";
  const isExisting = resolvedEnrollment.isExistingStudent;

  if (isLocked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '24px', textAlign: 'center', border: '1px solid var(--border-color)', maxWidth: '500px' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '24px', marginBottom: '16px' }}>
            {isSuspended ? "Cohort Access Suspended" : isRevoked ? "Access Revoked" : (isExisting ? "Account Pending Verification" : "Welcome to SURE ProEd")}
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '24px' }}>
            {isSuspended
              ? "Your access to this cohort is currently suspended. Please contact the administration for assistance."
              : isRevoked
                ? "Your access has been temporarily revoked by an administrator."
                : (isExisting
                  ? "Please complete your Offer Letter verification in your Profile to restore your cohort access."
                  : "Please complete your Profile and click 'Apply Course' to begin your journey.")}
          </p>
          <div style={{ background: 'var(--bg-nested)', padding: '16px', borderRadius: '12px', color: 'var(--primary-color)' }}>
            <strong>Status:</strong> {isSuspended ? "SUSPENDED" : activeApp?.status ? activeApp.status.replace("_", " ") : (profile?.status ? profile.status.replace("_", " ") : "Action Required")}
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
      <PushNotificationBanner />

      {/* SECTION 1: Welcome Hero Banner */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLeft}>
          <p className={styles.heroGreeting}>Welcome back,</p>
          <h1 className={styles.heroName}>{`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || profile?.first_name || "Student"}!</h1>
          <p className={styles.heroSubtitle}>Keep learning, keep building. You're one step closer to your goals.</p>
          
          <div className={styles.heroQuote}>
            <p className={styles.heroQuoteText}>"Discipline today builds the career you deserve tomorrow."</p>
            <p className={styles.heroQuoteAuthor}>— SURE ProEd</p>
          </div>
        </div>
        
        <div className={styles.heroRight}>
          <div style={{ textAlign: 'right', marginBottom: '8px' }}>
             <h3 style={{ color: 'white', margin: 0, fontSize: '18px', fontWeight: 800, lineHeight: 1.2 }}>Learn<br/>Build<br/>Grow<br/>Belong</h3>
          </div>
          <div className={styles.calendarWidget}>
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

      {/* SECTION 2: Info Strip */}
      <div className={styles.infoStrip}>
        <div className={styles.infoItem}>
          <div className={`${styles.infoIcon} ${styles.infoIconCourse}`}><FiCpu size={24} /></div>
          <div>
            <p className={styles.infoLabel}>Current Course</p>
            <h4 className={styles.infoValue}>{profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"}</h4>
          </div>
        </div>
        <div className={styles.infoItem}>
          <div className={`${styles.infoIcon} ${styles.infoIconCohort}`}><FiUsers size={24} /></div>
          <div>
            <p className={styles.infoLabel}>Cohort</p>
            <h4 className={styles.infoValue}>{profile?.current_application?.assigned_cohort?.code || stats?.active_cohort?.code || profile?.cohort_code || "Awaiting Cohort"}</h4>
          </div>
        </div>
        <div className={styles.infoItem}>
          <div className={`${styles.infoIcon} ${styles.infoIconStatus}`}><FiBarChart2 size={24} /></div>
          <div>
            <p className={styles.infoLabel}>Learning Status</p>
            <h4 className={styles.infoValue}>{resolvedEnrollment?.status ? resolvedEnrollment.status.replace(/_/g, " ") : "ACTIVE"}</h4>
          </div>
        </div>
        <div className={styles.infoItem}>
          <div className={`${styles.infoIcon} ${styles.infoIconMentors}`}><FiUser size={24} /></div>
          <div>
            <p className={styles.infoLabel}>Mentors</p>
            <h4 className={styles.infoValue}>
              {(() => {
                const cohortData = stats?.active_cohort || activeApp?.assigned_cohort || {};
                let count = 0;
                if (cohortData.active_mentors) count = cohortData.active_mentors.length;
                else if (cohortData.mentors) count = cohortData.mentors.length;
                else if (cohortData.mentor_name && cohortData.mentor_name !== "Not assigned") count = cohortData.mentor_name.split(',').length;
                return count > 0 ? `${count} Assigned` : "Pending";
              })()}
            </h4>
          </div>
        </div>
      </div>

      {/* SECTION 3: Main Grid (4 columns) */}
      <div className={styles.mainGrid}>
        
        {/* Col 1: Learning Progress */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>My Learning Progress</h3>
          </div>
          <div className={styles.progressCenter}>
            <div className={styles.progressDonut}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ name: 'Progress', value: attendanceStats?.attendance_percentage || 0 }, { name: 'Remaining', value: Math.max(0, 100 - (attendanceStats?.attendance_percentage || 0)) }]} 
                       innerRadius={45} outerRadius={60} stroke="none" isAnimationActive={false}>
                    <Cell fill="#10b981" />
                    <Cell fill="var(--bg-nested)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.progressDonutLabel}>
                <div className={styles.progressDonutPct}>{Math.round(attendanceStats?.attendance_percentage || 0)}%</div>
                <div className={styles.progressDonutSub}>Overall Progress</div>
              </div>
            </div>
            
            <div className={styles.progressLegend}>
              <div className={styles.progressLegendItem}>
                <span><span className={styles.progressLegendDot} style={{background: '#10b981'}}></span> Completed</span>
                <span className={styles.progressLegendCount}>{assignmentStats.completed}</span>
              </div>
              <div className={styles.progressLegendItem}>
                <span><span className={styles.progressLegendDot} style={{background: '#3b82f6'}}></span> In Progress</span>
                <span className={styles.progressLegendCount}>{assignmentStats.pending}</span>
              </div>
              <div className={styles.progressLegendItem}>
                <span><span className={styles.progressLegendDot} style={{background: 'var(--text-muted)'}}></span> Not Started</span>
                <span className={styles.progressLegendCount}>{stats?.upcoming_exams?.length || 0}</span>
              </div>
            </div>
            
            <button className={styles.progressViewLink} onClick={() => navigate('/student/attendance')}>
              View Detailed Progress &rarr;
            </button>
          </div>
        </div>

        {/* Col 2: Current Enrollment */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Current Enrollment</h3>
            <span className={styles.enrollmentBadge}>Active</span>
          </div>
          <div className={styles.enrollmentCard}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'url(https://images.unsplash.com/photo-1517694712202-14dd9538aa97?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80) center/cover' }}></div>
              <h4 className={styles.enrollmentTitle}>{profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"} - Concept to Silicon</h4>
            </div>
            
            <div className={styles.enrollmentMeta}>
              <div className={styles.enrollmentMetaItem}>
                <span className={styles.enrollmentMetaLabel}>Domain</span>
                <span className={styles.enrollmentMetaValue}>{resolvedEnrollment?.courseDomain || profile?.current_application?.course?.domain || stats?.application_course_domain || stats?.application_course_title?.split(' ')?.[0] || profile?.course_name?.split(' ')?.[0] || "General"}</span>
              </div>
              <div className={styles.enrollmentMetaItem}>
                <span className={styles.enrollmentMetaLabel}>Start Date</span>
                <span className={styles.enrollmentMetaValue}>{resolvedEnrollment?.startDate ? new Date(resolvedEnrollment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (profile?.current_application?.created_at ? new Date(profile.current_application.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently")}</span>
              </div>
            </div>
            
            <div className={styles.enrollmentProgress}>
              <div className={styles.enrollmentProgressBar}>
                <div className={styles.enrollmentProgressFill} style={{ width: `${Math.round(attendanceStats?.attendance_percentage || 0)}%` }}></div>
              </div>
              <div className={styles.enrollmentProgressPct}>{Math.round(attendanceStats?.attendance_percentage || 0)}%</div>
            </div>
          </div>
        </div>

        {/* Col 3: Upcoming Live Classes */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Upcoming Live Classes</h3>
            <button className={styles.cardViewAll} onClick={() => navigate('/student/class-schedule')}>View All</button>
          </div>
          <div className={styles.classesListContainer}>
            {(() => {
              const now = new Date();
              const visibleClasses = todayClasses.filter(cls => {
                const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
                if (isNaN(classStart)) return false;
                const hoursSince = (now - classStart) / (1000 * 60 * 60);
                return hoursSince <= 24;
              }).slice(0, 4);

              if (visibleClasses.length === 0) {
                return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No live classes scheduled currently.</p>;
              }

              return visibleClasses.map((cls, idx) => {
                const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
                let classEnd = cls.end_time ? new Date(`${cls.class_date}T${cls.end_time}`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
                if (classEnd < classStart) classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                
                const clsStatus = (cls.class_status || cls.status || "").toUpperCase();
                const isCompleted = clsStatus === 'COMPLETED' || clsStatus === 'ENDED';
                const isCancelled = clsStatus === 'CANCELLED';
                const windowOpenTime = new Date(classStart.getTime() - 10 * 60 * 1000);
                const classOpen = !isCompleted && !isCancelled && now >= windowOpenTime;

                let badgeClass = styles.classBadgeUpcoming;
                let badgeText = "Upcoming";
                if (isCompleted) { badgeClass = styles.classBadgeCompleted; badgeText = "Completed"; }
                else if (isCancelled) { badgeClass = styles.classBadgeCancelled; badgeText = "Cancelled"; }
                else if (classOpen) { badgeClass = styles.classBadgeLive; badgeText = "Live"; }

                return (
                  <div key={idx} className={styles.classItem}>
                    <div style={{ flexShrink: 0, width: '32px', height: '32px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      📅
                    </div>
                    <div className={styles.classItemInfo}>
                      <h4 className={styles.classItemTitle}>{cls.title || cls.class_type}</h4>
                      <p className={styles.classItemTime}>
                        {classStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {classEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className={`${styles.classBadge} ${badgeClass}`}>{badgeText}</div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Col 4: Recent Announcements */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Recent Announcements</h3>
            <button className={styles.cardViewAll} onClick={() => navigate('/student/dashboard')}>View All</button>
          </div>
          <div className={styles.classesListContainer}>
            {announcements.length === 0 ? (
              <>
                <div className={styles.announcementItem}>
                  <div className={styles.announcementDot} style={{ background: '#10b981' }}></div>
                  <div>
                    <h4 className={styles.announcementText}>New session schedule updated</h4>
                    <p className={styles.announcementTime}>2 hours ago</p>
                  </div>
                </div>
                <div className={styles.announcementItem}>
                  <div className={styles.announcementDot} style={{ background: '#f59e0b' }}></div>
                  <div>
                    <h4 className={styles.announcementText}>Assignment 3 deadline extended</h4>
                    <p className={styles.announcementTime}>1 day ago</p>
                  </div>
                </div>
              </>
            ) : (
              announcements.map((a, idx) => (
                <div key={idx} className={styles.announcementItem}>
                  <div className={styles.announcementDot}></div>
                  <div>
                    <h4 className={styles.announcementText}>{a.title || a.message}</h4>
                    <p className={styles.announcementTime}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : 'Recently'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
      </div>

      {/* SECTION 4: Quick Actions Row */}
      <div className={styles.quickActions}>
        <div className={styles.quickAction} onClick={() => {
          // Find first open/live class
          const now = new Date();
          const liveCls = todayClasses.find(c => {
             const start = new Date(`${c.class_date}T${c.start_time}`);
             return now >= new Date(start.getTime() - 10*60000) && !(c.status === 'COMPLETED' || c.status === 'ENDED' || c.status === 'CANCELLED');
          });
          if (liveCls && liveCls.meeting_link) handleJoinClass(liveCls);
          else navigate('/student/class-schedule');
        }}>
          <div className={styles.quickActionIcon}><FiVideo size={24} /></div>
          <div>
            <h4 className={styles.quickActionTitle}>Join Live Class</h4>
            <p className={styles.quickActionDesc}>Attend your scheduled class</p>
          </div>
        </div>
        
        <div className={styles.quickAction} onClick={() => navigate('/student/assignments')}>
          <div className={styles.quickActionIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><FiFileText size={24} /></div>
          <div>
            <h4 className={styles.quickActionTitle}>View Assignments</h4>
            <p className={styles.quickActionDesc}>Check and submit your work</p>
          </div>
        </div>

        <div className={styles.quickAction} onClick={() => navigate('/student/exams')}>
          <div className={styles.quickActionIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><FiEdit size={24} /></div>
          <div>
            <h4 className={styles.quickActionTitle}>Take Exam</h4>
            <p className={styles.quickActionDesc}>Attempt assessments</p>
          </div>
        </div>

        <div className={styles.quickAction} onClick={() => navigate('/student/resources')}>
          <div className={styles.quickActionIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}><FiBookOpen size={24} /></div>
          <div>
            <h4 className={styles.quickActionTitle}>View Resources</h4>
            <p className={styles.quickActionDesc}>Notes, recordings & more</p>
          </div>
        </div>
      </div>

      {/* SECTION 5: Feedback and Offer Letters */}
      <div className={styles.quickActions} style={{ marginTop: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {/* Feedback Stats */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3>Share Your Experience</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Your feedback helps us improve SURE ProEd. Let us know how things are going!</p>
          <FeedbackWidget />
        </div>

        {/* Offer Letters Card */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3>Offer Letters</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>View and manage your internship offer letters.</p>
          <button onClick={() => navigate('/student/applications')} style={{ width: '100%', padding: '10px 16px', backgroundColor: 'var(--brand-color, #2563eb)', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
            Go to Applications →
          </button>
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
      {showMentorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMentorModal(false)}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 48px rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowMentorModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><FiX size={24} /></button>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: 'var(--text-primary)' }}>All Assigned Mentors</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
              {(() => {
                const cohortData = stats?.active_cohort || activeApp?.assigned_cohort || {};
                const activeMentors = cohortData.active_mentors || (cohortData.mentors ? cohortData.mentors : []);
                const currentMentor = cohortData.current_mentor_details;
                
                return (
                  <>
                    {currentMentor && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px' }}>
                         <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                           {currentMentor.first_name?.[0] || currentMentor.name?.[0] || "M"}
                         </div>
                         <div style={{ flexGrow: 1 }}>
                           <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>{currentMentor.first_name || currentMentor.name}</h4>
                           <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                             <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div> CURRENT MENTOR
                           </span>
                         </div>
                      </div>
                    )}
                    
                    {activeMentors.map((m, i) => {
                      if (currentMentor && (m.id === currentMentor.id || m.email === currentMentor.email)) return null;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                           <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-nested)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                             {m.first_name?.[0] || m.name?.[0] || m.username?.[0] || "M"}
                           </div>
                           <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>{m.first_name || m.name || m.username}</h4>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
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

    </div>
  );
}

export default Dashboard;
