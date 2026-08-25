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

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    async function fetchCoreData() {
      if (!user?.email) return;
      try {
        const [profileRes, statsRes, appRes, coursesRes] = await Promise.all([
          studentService.getStudentProfiles({}, { signal: abortController.signal }).catch(() => null),
          apiClient.get('/students/statistics/').catch(() => ({ data: {} })),
          apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/").catch(() => ({ data: [] })),
          courseService.getCourses().catch(() => [])
        ]);

        const profileData = profileRes?.data || profileRes;
        const profileObj = Array.isArray(profileData?.results) ? profileData.results[0] : (Array.isArray(profileData) ? profileData[0] : profileData);
        if (isMounted) {
          setProfile(profileObj || {});
          setStats(statsRes?.data || {});
        }

        const apps = appRes?.data?.results || appRes?.data || [];
        const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);
        
        // Find active or suspended application
        const enrolled = apps.find(a => ['COHORT_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SUSPENDED'].includes(a.status));
        if (isMounted && enrolled) {
          setActiveApp(enrolled);
          if (enrolled.status === "SUSPENDED") {
            setIsSuspended(true);
          }
        }

        const enrollmentStatus = resolveStudentEnrollment(profileObj, apps, courses);
        if (isMounted) setResolvedEnrollment(enrollmentStatus);

        // Core data loaded, unlock UI immediately!
        if (isMounted) setIsLoading(false);

        // Fetch remaining secondary data non-blockingly
        if (enrollmentStatus.isEnrolled && isMounted) {
          apiClient.get('/attendance-summary/').then(attRes => {
            const attData = attRes.data?.results || attRes.data || [];
            if (attData.length > 0 && isMounted) {
              setAttendanceStats(attData[0]);
              if (attData[0].history) setAttendanceHistory(attData[0].history);
            }
          }).catch((err) => {
            if (err.response?.status === 403) setIsSuspended(true);
          });

          Promise.all([
            assignmentService.getAssignments().catch((err) => {
              if (err.response?.status === 403) setIsSuspended(true);
              return [];
            }),
            assignmentService.getSubmissions().catch((err) => {
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
        }

        // Fetch scheduled LST/SST/Domain sessions via the central attendance logic
        attendanceService.getAttendanceRecords({ status: "ACTIVE" }).then(sessionsRes => {
          if (sessionsRes) {
            const rawData = sessionsRes.data || sessionsRes;
            const sessionsArray = Array.isArray(rawData) ? rawData : (rawData.results || []);
            if (isMounted) setTodayClasses(sessionsArray);
          }
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
      await attendanceService.markJoined(cls.id);
      // Heartbeat tracking removed — attendance is now server-side via Google Meet
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
      await attendanceService.requestPermission(lateJoinClassId, lateJoinReason);
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
  return (
    <div className={styles.dashboardContainer}>

      {/* Push Notification Banner */}
      <PushNotificationBanner />

      {/* Sleek Glass Header */}
      <header className={styles.header}>
        <div>
          <h3 style={{ margin: 0, fontSize: '24px' }}>Welcome back, {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || profile?.first_name || "Student"}!</h3>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>{profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course Assignment"} | {profile?.current_application?.assigned_cohort?.code || stats?.active_cohort?.code || profile?.cohort_code || "Awaiting Cohort Assignment"}</p>
        </div>
      </header>

      {/* Smart Bento Grid Layout */}
      <div className={styles.immersiveHero}>

        {/* Left Side: Domain Stream Info */}
        <div className={styles.heroContent} style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05), transparent)', border: '1px solid var(--border-color)', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
          <p className={styles.streamLabel} style={{ color: 'var(--primary-color)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>Current Enrollment</p>
          <h2 className={styles.streamTitle} style={{ fontSize: '32px', marginTop: '8px', marginBottom: '16px', color: 'var(--text-primary)' }}>{profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course Assignment"}</h2>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--primary-color)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              📦 GROUP: {profile?.current_application?.assigned_cohort?.code || stats?.active_cohort?.code || profile?.cohort_code || "Awaiting Cohort Assignment"}
            </span>
          </div>

          <div style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Mentor</h4>
            {stats?.active_cohort?.mentor_name || activeApp?.assigned_cohort?.mentor?.user ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                  {stats?.active_cohort?.mentor_name?.[0] || activeApp?.assigned_cohort?.mentor?.user?.first_name?.[0] || 'M'}
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {stats?.active_cohort?.mentor_name || `${activeApp?.assigned_cohort?.mentor?.user?.first_name || ''} ${activeApp?.assigned_cohort?.mentor?.user?.last_name || ''}`.trim()}
                  </div>
                  {(activeApp?.assigned_cohort?.mentor?.user?.email || activeApp?.assigned_cohort?.mentor?.user?.phone) && (
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {activeApp.assigned_cohort.mentor.user.email} {activeApp.assigned_cohort.mentor.user.phone ? ` • ${activeApp.assigned_cohort.mentor.user.phone}` : ''}
                    </div>
                  )}
                  {activeApp?.assigned_cohort?.mentor?.linkedin_url && (
                    <a href={activeApp.assigned_cohort.mentor.linkedin_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '8px', fontSize: '13px', color: '#0ea5e9', textDecoration: 'none', fontWeight: '600' }}>
                      🔗 View LinkedIn Profile
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌱</div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>No Mentor Assigned Yet</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>We are matching you with an expert. Check back soon!</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Live Radar Widget */}
        <div className={styles.floatingLiveSection} style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), transparent)', border: '1px solid var(--border-color)', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '20px' }}>
              <span style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span>
              Live Class Radar
            </h3>

            {(() => {
              const now = new Date();
              const visibleClasses = todayClasses.filter(cls => {
                const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
                let classEnd = cls.end_time ? new Date(`${cls.class_date}T${cls.end_time}`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
                if (classEnd < classStart) {
                  classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                }
                const hasEnded = cls.status === 'COMPLETED' || cls.status === 'ENDED' || now > classEnd;
                if (cls.conducted === false) return false;
                return true;
              });

              if (visibleClasses.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Radar is Clear</h4>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>No active or rescheduled sessions detected within your time window.</p>
                  </div>
                );
              }

              return (
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '500px', overflowY: 'auto' }}>
                  {visibleClasses.map((cls, idx) => {
                    const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
                    let classEnd = cls.end_time ? new Date(`${cls.class_date}T${cls.end_time}`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
                    if (classEnd < classStart) classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                    const windowOpenTime = new Date(classStart.getTime() - 10 * 60 * 1000);
                    const windowCloseTime = new Date(classStart.getTime()); // Closes exactly at start time

                    if (now >= windowOpenTime && now <= new Date(windowOpenTime.getTime() + 60000) && Notification.permission === "granted" && !cls.notified) {
                      cls.notified = true;
                      new Notification(`Live Class: ${cls.title}`, { body: "Join window is now open! Please join before class starts." });
                    }

                    const classOpen = cls.conducted !== false && cls.status !== 'COMPLETED' && cls.status !== 'ENDED' && now >= windowOpenTime && now <= windowCloseTime;
                    const isEarly = now < windowOpenTime;
                    const isLate = now > windowCloseTime && now <= classEnd && cls.status !== 'COMPLETED' && cls.status !== 'ENDED';
                    const hasEnded = cls.status === 'COMPLETED' || cls.status === 'ENDED' || now > classEnd;
                    const isNextDay = classEnd < classStart;

                    return (
                      <div key={idx} style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                        {classOpen && <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#ef4444' }}></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--text-primary)' }}>{cls.title || cls.class_type || "Live Session"}</h4>
                            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FiClock /> {classStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {classEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {isNextDay && <span style={{ fontSize: '11px', background: 'var(--bg-nested)', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>(Next Day)</span>}
                            </p>
                          </div>

                          {classOpen ? (
                            <button onClick={() => handleJoinClass(cls)} disabled={isJoining || !cls.meeting_link} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: isJoining || !cls.meeting_link ? 'not-allowed' : 'pointer', opacity: isJoining || !cls.meeting_link ? 0.7 : 1, transition: '0.2s', whiteSpace: 'nowrap' }}>
                              {!isJoining ? 'Join Live' : 'Connecting...'}
                            </button>
                          ) : isEarly ? (
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)', padding: '6px 12px', background: 'var(--bg-nested)', borderRadius: '6px', display: 'inline-block', marginBottom: '4px' }}>🔒 Locked</span>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Join opens at {windowOpenTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                          ) : isLate ? (
                            <div style={{ textAlign: 'right', maxWidth: '200px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)', padding: '6px 12px', background: 'var(--bg-nested)', borderRadius: '6px', display: 'inline-block', marginBottom: '4px' }}>🔒 Window Closed</span>
                              <div style={{ fontSize: '12px', color: '#ef4444' }}>Join time has expired.</div>
                              {cls.warning_state ? (
                                <span style={{ fontSize: '12px', color: cls.warning_state === 'ACCEPTED' ? '#10b981' : cls.warning_state === 'REJECTED' ? '#ef4444' : '#f59e0b', fontWeight: 'bold', display: 'block', marginTop: '6px' }}>
                                  Status: {cls.warning_state === 'APOLOGIZED' ? 'Pending Approval' : cls.warning_state}
                                </span>
                              ) : (
                                <button 
                                  onClick={() => { setLateJoinClassId(cls.id); setShowLateJoinModal(true); }}
                                  style={{ fontSize: '12px', color: '#0ea5e9', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: '6px', fontWeight: 'bold' }}
                                >
                                  Request Late Join Permission
                                </button>
                              )}
                            </div>
                          ) : hasEnded ? (
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)', padding: '6px 12px', background: 'var(--bg-nested)', borderRadius: '6px' }}>Session Ended</span>
                          ) : null}
                        </div>
                        {classOpen && (
                          <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <h5 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>📌 Before Joining</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.4' }}><span style={{ fontSize: '14px' }}>📷</span> <span>Keep your camera ON during the class.</span></div>
                              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.4' }}><span style={{ fontSize: '14px' }}>🎤</span> <span>Keep your microphone available and follow the mentor's instructions.</span></div>
                              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.4' }}><span style={{ fontSize: '14px' }}>👀</span> <span>Stay attentive and remain in the class until it ends.</span></div>
                              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.4' }}><span style={{ fontSize: '14px' }}>🚫</span> <span>Do not leave the Meet before the class ends.</span></div>
                              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.4' }}><span style={{ fontSize: '14px' }}>📶</span> <span>Keep a stable internet connection throughout the session.</span></div>
                              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.4' }}><span style={{ fontSize: '14px' }}>🕒</span> <span>Join on time and remain present for the complete class.</span></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
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
              <span style={{ fontWeight: 'bold' }}>{stats?.module_tests_passed || stats?.exams_taken || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-nested)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiClock color="#f59e0b" /> <span style={{ color: 'var(--text-primary)' }}>Upcoming</span></div>
              <span style={{ fontWeight: 'bold' }}>{stats?.upcoming_exams?.length || 0}</span>
            </div>
          </div>
        </div>

        {/* Feedback Stats */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>Share Your Experience</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Your feedback helps us improve SURE ProEd. Let us know how things are going!</p>
          <FeedbackWidget />
        </div>

        {/* Offer Letters Card */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>Offer Letters</h3>
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
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--brand-color, #2563eb)', color: '#fff', fontWeight: 'bold', fontSize: '15px', cursor: isSubmittingLateJoin || !lateJoinReason.trim() ? 'not-allowed' : 'pointer', opacity: isSubmittingLateJoin || !lateJoinReason.trim() ? 0.7 : 1, transition: '0.2s' }}
            >
              {isSubmittingLateJoin ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;