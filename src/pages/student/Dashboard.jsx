import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService, checkCurrentEnrollment, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import { attendanceService } from "../../services/attendanceService";
import { assignmentService } from "../../services/assignmentService";
import { examService } from "../../services/examService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import styles from "./Dashboard.module.css";
import { FiCheckCircle, FiClock, FiAlertCircle } from "react-icons/fi";

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
  
  // Dashboard Stats State
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [assignmentStats, setAssignmentStats] = useState({ completed: 0, pending: 0, overdue: 0 });
  const [examStats, setExamStats] = useState({ completed: 0, upcoming: 0 });
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function fetchDashboardData() {
      if (!user?.email) return;
      try {
        // Fetch Profile
        const res = await studentService.getStudentProfiles({}, { signal: abortController.signal });
        const data = res?.data || res;
        const profileObj = Array.isArray(data?.results) ? data.results[0] : (Array.isArray(data) ? data[0] : data);
        if (isMounted) setProfile(profileObj || {});

        // Fetch Applications for Authoritative Enrollment
        let enrolled = null;
        let enrollmentStatus = { isEnrolled: false };
        try {
          const [appRes, coursesRes] = await Promise.all([
            apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/"),
            courseService.getCourses()
          ]);
          const apps = appRes.data?.results || appRes.data || [];
          const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);
          enrolled = apps.find(a => ['COHORT_ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(a.status));
          if (isMounted && enrolled) setActiveApp(enrolled);
          
          enrollmentStatus = resolveStudentEnrollment(profileObj, apps, courses);
          if (isMounted) setResolvedEnrollment(enrollmentStatus);

        } catch (e) { console.warn("Failed to fetch applications or courses"); }

        if (enrollmentStatus.isEnrolled) {
            // Fetch Attendance Summary
          try {
            const attRes = await apiClient.get('/attendance-summary/');
            const attData = attRes.data?.results || attRes.data || [];
            if (attData.length > 0 && isMounted) {
               setAttendanceStats(attData[0]);
               if (attData[0].history) setAttendanceHistory(attData[0].history);
            }
          } catch(e) {}

          // Fetch Assignments & Submissions
          try {
            const [assignRes, subRes] = await Promise.all([
              assignmentService.getAssignments(),
              assignmentService.getSubmissions()
            ]);
            const assignments = assignRes.results || assignRes || [];
            const submissions = subRes.results || subRes || [];
            
            const completed = submissions.length;
            const total = assignments.length;
            const pending = total - completed;
            if (isMounted) setAssignmentStats({ completed, pending: pending > 0 ? pending : 0, overdue: 0 });
          } catch(e) {}

          // Fetch Exams
          try {
             const exRes = await examService.getExams();
             const exams = exRes.results || exRes || [];
             if (isMounted) setExamStats({ completed: exams.filter(e => e.status === 'COMPLETED').length, upcoming: exams.filter(e => e.status !== 'COMPLETED').length });
          } catch(e) {}
        }

        // Fetch Classes (This runs silently every 10s to ensure Light-Speed updates)
        const sessionsRes = await attendanceService.getAttendanceRecords({ status: "ACTIVE" });
        if (sessionsRes) {
          const rawData = sessionsRes.data || sessionsRes;
          const sessionsArray = Array.isArray(rawData) ? rawData : (rawData.results || []);
          if (isMounted) setTodayClasses(sessionsArray);
        }

      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchDashboardData();
    return () => { isMounted = false; abortController.abort(); };
  }, [user]);

  const handleJoinClass = async (cls) => {
    setIsJoining(true);
    try {
      const response = await attendanceService.markJoined(cls.id);
      localStorage.setItem('active_session_id', cls.id);
      if (response && response.tracker_token) {
        localStorage.setItem('attendance_tracker_token', response.tracker_token);
      }
      window.dispatchEvent(new Event('session_started'));
    } catch (err) {
      console.error("Failed to mark joined", err);
    }
    setTimeout(() => {
      setIsJoining(false);
      window.open(cls.meeting_link.startsWith('http') ? cls.meeting_link : `https://${cls.meeting_link}`, '_blank');
    }, 1000);
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
  const isLocked = !hasEnrollment;
  const isRevoked = profile?.status === "ADMIN_REJECTED";
  const isExisting = resolvedEnrollment.isExistingStudent;

  if (isLocked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '24px', textAlign: 'center', border: '1px solid var(--border-color)', maxWidth: '500px' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '24px', marginBottom: '16px' }}>
            {isRevoked ? "Access Revoked" : (isExisting ? "Account Pending Verification" : "Welcome to SURE ProEd")}
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '24px' }}>
            {isRevoked
              ? "Your access has been temporarily revoked by an administrator."
              : (isExisting
                  ? "Please complete your Offer Letter verification in your Profile to restore your cohort access."
                  : "Please complete your Profile and click 'Apply Course' to begin your journey.")}
          </p>
          <div style={{ background: 'var(--bg-nested)', padding: '16px', borderRadius: '12px', color: 'var(--primary-color)' }}>
            <strong>Status:</strong> {activeApp?.status ? activeApp.status.replace("_", " ") : (profile?.status ? profile.status.replace("_", " ") : "Action Required")}
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
  return (
    <div className={styles.dashboardContainer}>

      {/* Sleek Glass Header */}
      <header className={styles.header}>
        <div>
          <h3 style={{ margin: 0, fontSize: '24px' }}>Welcome back, {profile?.first_name || profile?.firstName || user?.first_name || "Student"}!</h3>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>{resolvedEnrollment.courseName} | {resolvedEnrollment.group}</p>
        </div>
        <div className={styles.roleBadge}>Premium Student</div>
      </header>

      {/* Smart Bento Grid Layout */}
      <div className={styles.immersiveHero}>

        {/* Left Side: Domain Stream Info */}
        <div className={styles.heroContent}>
          <p className={styles.streamLabel}>Current Enrollment</p>
          <h2 className={styles.streamTitle}>{resolvedEnrollment.courseName}</h2>
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--primary-color)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              📦 GROUP: {resolvedEnrollment.group}
            </span>
            {activeApp?.assigned_cohort?.mentor?.user?.first_name && (
              <span style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                🧑‍🏫 MENTOR: {`${activeApp.assigned_cohort.mentor.user.first_name} ${activeApp.assigned_cohort.mentor.user.last_name}`}
              </span>
            )}
          </div>

          <p className={styles.streamSubtitle}>Access your exclusive live mentoring sessions, track your progress, and master your concepts.</p>
        </div>

        {/* Right Side: Live Radar Widget */}
        <div className={styles.floatingLiveSection}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.radarIcon}></span> Live Class Radar
          </h3>

          {todayClasses.length === 0 ? (
            <div className={styles.cleanStatus}>
              No active or rescheduled sessions detected.
            </div>
          ) : (
            todayClasses.map((cls, idx) => {
              const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
              const now = new Date();

              const windowOpenTime = new Date(classStart.getTime() - 10 * 60 * 1000);
              const lateCutoffTime = new Date(classStart.getTime() + 7 * 60 * 1000);

              const classOpen = cls.conducted !== false &&
                cls.status !== 'COMPLETED' &&
                cls.status !== 'ENDED' &&
                now >= windowOpenTime &&
                now <= lateCutoffTime;

              const hasEnded = cls.conducted === false ||
                cls.status === 'COMPLETED' ||
                cls.status === 'ENDED' ||
                now > lateCutoffTime;

              if (hasEnded && (now - lateCutoffTime) / 1000 / 60 > 30) return null;
              if (cls.conducted === false) return null;

              return (
                <div key={idx} className={styles.classCardWrapper}>
                  <div className={styles.glassRow}>
                    <div className={styles.glassInfo}>
                      <h4>{cls.title || cls.session_type || "Live Session"}</h4>
                      <p>🕒 {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>

                    {classOpen ? (
                      <button onClick={() => handleJoinClass(cls)} disabled={isJoining || !cls.meeting_link} className={styles.btnExtreme}>
                        {!isJoining ? 'Join Live' : 'Connecting...'}
                      </button>
                    ) : hasEnded ? (
                      <span className={styles.statusEnded}>Session Locked</span>
                    ) : (
                      <span className={styles.statusWaiting}>Opens 10m Prior</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Premium Statistics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginTop: '24px' }}>
        
        {/* Attendance Stats */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>Attendance Overview</h3>
          {attendanceStats ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                {Math.round(attendanceStats.attendance_percentage || 0)}%
              </div>
              <div>
                <p style={{ margin: '0 0 4px 0', color: 'var(--text-secondary)' }}>Total Time: {Math.round((attendanceStats.active_minutes || 0) / 60)} hrs</p>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Sessions: {attendanceStats.total_session_minutes ? "Tracked" : "No Data"}</p>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>No attendance data available yet.</p>
          )}
        </div>

        {/* Assignments Stats */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>Assignments</h3>
          {assignmentStats.completed === 0 && assignmentStats.pending === 0 ? (
            <p style={{ color: 'var(--text-secondary)', flex: 1, display: 'flex', alignItems: 'center' }}>No assignments posted yet.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', height: '100px' }}>
              <div style={{ width: '100px', height: '100px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assignmentData} innerRadius={35} outerRadius={50} paddingAngle={5} dataKey="value" stroke="none">
                      {assignmentData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginLeft: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: COLORS[0] }}></div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Completed: {assignmentStats.completed}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: COLORS[1] }}></div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Pending: {assignmentStats.pending}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Exams Stats */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>Exams & Assessments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-nested)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiCheckCircle color="var(--primary-color)" /> <span style={{ color: 'var(--text-primary)' }}>Completed</span></div>
              <span style={{ fontWeight: 'bold' }}>{examStats.completed}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-nested)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiClock color="#f59e0b" /> <span style={{ color: 'var(--text-primary)' }}>Upcoming</span></div>
              <span style={{ fontWeight: 'bold' }}>{examStats.upcoming}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Dashboard;