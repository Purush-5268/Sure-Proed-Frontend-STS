import React, { useState, useEffect, useMemo } from "react";
import { attendanceService } from "../../services/attendanceService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiChevronLeft, FiChevronRight, FiCalendar, FiClock, FiInfo, FiUser, FiX, FiCheckCircle, FiShield, FiAward } from "react-icons/fi";
import styles from "./Attendance.module.css";
import { FaGoogle } from "react-icons/fa";

// Helper for Circular Progress
const CircularProgress = ({ percentage, color, size = 64, strokeWidth = 6 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className={styles.circularProgressContainer} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className={styles.circularBg}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          style={{ stroke: `${color}30` }} // Transparent trail
        />
        <circle
          className={styles.circularFill}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ stroke: color }}
        />
      </svg>
      <div className={styles.circularText} style={{ color: color }}>
        {percentage}%
      </div>
    </div>
  );
};

const formatTime = (timeStr) => {
  if (!timeStr || timeStr === 'N/A') return 'N/A';
  if (timeStr.includes('T')) {
     return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const [h, m] = timeStr.split(':');
  if (h == null || m == null) return timeStr;
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
};

function Attendance() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [profile, setProfile] = useState(null);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSessions() {
      try {
        setLoading(true);
        const [res, statsRes, profileRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.ATTENDANCE.BASE),
          apiClient.get(API_ENDPOINTS.STUDENTS.STATISTICS),
          studentService.getProfile(user?.email).catch(() => null)
        ]);
        const data = res?.data?.results || res?.data || [];
        if (isMounted) setSessions(data);
        if (isMounted && statsRes?.data) setStats(statsRes.data);
        if (isMounted && profileRes) setProfile(profileRes);
      } catch (error) {
        console.error("Failed to load attendance sessions", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSessions();
    return () => { isMounted = false; };
  }, [user?.email]);

  const totalEvaluated = stats?.attendance_total || 0;
  const totalAttended = stats?.attendance_present || 0;
  const presenceRate = stats?.attendance_percentage || 0;
  const cumulativePct = profile?.current_application?.cumulative_attendance_percentage;
  const showCumulative = cumulativePct !== undefined && cumulativePct !== null;

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDateStr(null);
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDateStr(null);
  };
  const goToToday = () => {
    setCurrentDate(new Date());
    const todayStr = new Date().toISOString().split('T')[0];
    setSelectedDateStr(todayStr);
  };

  const sessionsByDate = useMemo(() => {
    const map = {};
    sessions.forEach(session => {
      const data = session.student_dashboard_data || {};
      const dateStr = data.class_date || session.class_date;
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(session);
    });
    return map;
  }, [sessions]);

  const getSessionStatusInfo = (session) => {
    const data = session.student_dashboard_data || {};
    const attStatus = data.attendance_status;
    const discStatus = data.discipline_status;
    const suspStatus = data.suspension_status;
    
    if (attStatus === "NOT_READY") return { label: "Pending", code: "pending", color: "var(--status-pending)" };
    if (session.class_status === "CANCELLED") return { label: "Cancelled", code: "cancelled", color: "var(--status-absent)" };
    if (attStatus === "PRESENT") return { label: "Present", code: "present", color: "var(--status-present)" };
    
    if (attStatus === "ABSENT") {
      if (suspStatus === "SUSPENDED") return { label: "Suspended", code: "suspended", color: "var(--status-suspended)" };
      if (discStatus === "RESOLVED_BY_PRIOR_PERMISSION") return { label: "Excused", code: "excused", color: "var(--status-excused)" };
      return { label: "Absent", code: "absent", color: "var(--status-absent)" };
    }
    return { label: "Pending", code: "pending", color: "var(--status-pending)" };
  };

  const renderCalendarDays = () => {
    const days = [];
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    
    dayNames.forEach(day => {
      days.push(<div key={`header-${day}`} className={styles.calendarHeaderCell}>{day}</div>);
    });

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className={styles.calendarEmptyCell}></div>);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const daySessions = sessionsByDate[dateStr] || [];
      const isSelected = selectedDateStr === dateStr;
      
      const isToday = new Date().toISOString().split('T')[0] === dateStr; 
      
      days.push(
        <div 
          key={dateStr} 
          className={`${styles.calendarCell} ${isSelected ? styles.selectedCell : ''} ${isToday ? styles.todayCell : ''} ${daySessions.length > 0 ? styles.hasSessionCell : ''}`}
          onClick={() => setSelectedDateStr(dateStr)}
        >
          <span className={styles.dayNumber}>{i}</span>
          <div className={styles.sessionDots}>
            {daySessions.map((session, idx) => {
              const statusInfo = getSessionStatusInfo(session);
              return (
                <span key={idx} className={`${styles.statusDot} ${styles['dot-' + statusInfo.code]}`} title={statusInfo.label}>
                  {statusInfo.code === 'cancelled' ? '✕' : ''}
                </span>
              );
            })}
          </div>
        </div>
      );
    }
    return days;
  };

  const selectedSessions = selectedDateStr ? (sessionsByDate[selectedDateStr] || []) : null;

  return (
    <div className={styles.page}>
      
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>ATTENDANCE</span>
          <h1 className={styles.pageTitle}>My Attendance</h1>
          <p className={styles.subtitle}>Track your cohort session attendance and stay consistent on your learning journey.</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.quoteCard}>
            <div className={styles.quoteBgPattern}>
              <svg width="200" height="60" viewBox="0 0 200 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0,60 L40,20 L80,50 L140,10 L180,40 L200,60 Z" fill="url(#mountainGrad)"/>
                <path d="M140,10 L140,-5 L155,0 L140,5" stroke="var(--status-excused)" strokeWidth="2" strokeLinejoin="round" fill="none"/>
                <defs>
                  <linearGradient id="mountainGrad" x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">
                    <stop stopColor="var(--status-excused)" stopOpacity="0.2"/>
                    <stop offset="1" stopColor="var(--status-excused)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className={styles.quoteIcon}>“</span>
            <p>Consistency today, creates opportunities tomorrow.</p>
          </div>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        
        {/* Left Column: Stats & Calendar & Policy */}
        <div className={styles.mainContent}>
          
          {loading ? (
             <SkeletonLoader variant="table" rows={3} />
          ) : (
            <div className={styles.statsContainer}>
              <div className={styles.statCard}>
                <div className={styles.statLeft}>
                  <div className={styles.iconCircleGreen}>
                    <FiCalendar size={28} />
                  </div>
                </div>
                <div className={styles.statRight}>
                  <h3>Sessions Attended</h3>
                  <div className={styles.statValue}>{totalAttended} / {totalEvaluated}</div>
                  <p className={styles.statCaption}>Excellent! Keep it up! ✨</p>
                </div>
              </div>
              
              <div className={styles.statCard}>
                <div className={styles.statLeft}>
                  <CircularProgress percentage={presenceRate} color="var(--status-excused)" />
                </div>
                <div className={styles.statRight}>
                  <h3>Presence Rate <FiInfo className={styles.infoIcon} title={`Present in ${totalAttended} of ${totalEvaluated} evaluated sessions`} /></h3>
                  <p className={styles.statDesc}>Present in {totalAttended} of {totalEvaluated} evaluated sessions</p>
                </div>
              </div>

              {showCumulative && (
                <div className={styles.statCard}>
                  <div className={styles.statLeft}>
                    <CircularProgress percentage={Number(cumulativePct).toFixed(1)} color="#3b82f6" />
                  </div>
                  <div className={styles.statRight}>
                    <h3>Average Attendance <FiInfo className={styles.infoIcon} title="Average of your actual attendance percentage across sessions" /></h3>
                    <p className={styles.statDesc}>Average of your actual attendance percentage across sessions</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.calendarSection}>
            <div className={styles.calendarToolbar}>
              <h2 className={styles.calendarTitle}><FiCalendar style={{color: 'var(--primary-color)'}}/> {monthName} {year}</h2>
              <div className={styles.calendarNav}>
                <button onClick={handlePrevMonth} className={styles.iconBtn} aria-label="Previous Month"><FiChevronLeft size={20} /></button>
                <button onClick={handleNextMonth} className={styles.iconBtn} aria-label="Next Month"><FiChevronRight size={20} /></button>
                <button onClick={goToToday} className={styles.textBtn}>Today</button>
              </div>
            </div>
            
            {loading ? (
              <SkeletonLoader variant="table" rows={6} />
            ) : (
              <>
                <div className={styles.calendarGrid}>
                  {renderCalendarDays()}
                </div>
                <div className={styles.calendarFooter}>
                  <div className={styles.legend}>
                    <div className={styles.legendItem}><span className={`${styles.statusDot} ${styles['dot-present']}`}></span> Present</div>
                    <div className={styles.legendItem}><span className={`${styles.statusDot} ${styles['dot-excused']}`}></span> Excused</div>
                    <div className={styles.legendItem}><span className={`${styles.statusDot} ${styles['dot-absent']}`}></span> Absent</div>
                    <div className={styles.legendItem}><span className={`${styles.statusDot} ${styles['dot-suspended']}`}></span> Suspended</div>
                    <div className={styles.legendItem}><span className={`${styles.statusDot} ${styles['dot-pending']}`}></span> Pending</div>
                    <div className={styles.legendItem}><span className={`${styles.statusDot} ${styles['dot-cancelled']}`}>✕</span> No Session</div>
                  </div>
                  <div className={styles.motivationBadge}>
                    <span>Keep going!</span> You're doing great!
                  </div>
                </div>
              </>
            )}
          </div>
          
          <div className={styles.policyCard}>
            <div className={styles.policyContent}>
              <div className={styles.policyHeader}>
                <FiShield size={24} color="#1d4ed8" />
                <h2>Attendance Policy</h2>
              </div>
              <ul>
                <li>Attendance is mandatory for every internship session.</li>
                <li>Missing scheduled classes may lead to removal from the internship program.</li>
                <li>If you cannot attend due to a genuine reason, inform your mentor immediately.</li>
              </ul>
            </div>
            <div className={styles.policyIllustrationContainer}>
              <div className={styles.policyTextImg}>
                <p>Discipline today.<br/>Success tomorrow.</p>
              </div>
              <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.policyVector}>
                <rect x="20" y="60" width="60" height="20" rx="2" fill="rgba(59, 130, 246, 0.2)"/>
                <path d="M20 60 Q 50 50 80 60" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="2"/>
                <path d="M50 30 C 70 30 70 60 50 60 C 30 60 30 30 50 30 Z" fill="rgba(16, 185, 129, 0.2)"/>
                <path d="M50 40 C 60 40 60 60 50 60 C 40 60 40 40 50 40 Z" fill="rgba(16, 185, 129, 0.3)"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Right Column: Session Details */}
        <div className={styles.detailsColumn}>
          {selectedSessions ? (
            <div className={styles.detailsPanel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitleGroup}>
                  <FiCalendar className={styles.panelHeaderIcon} />
                  <h2>{new Date(selectedDateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                </div>
                <button onClick={() => setSelectedDateStr(null)} className={styles.closeBtn}><FiX size={24} /></button>
              </div>
              
              <div className={styles.panelSubHeader}>
                <span>{selectedSessions.length} Session{selectedSessions.length > 1 ? 's' : ''}</span>
              </div>
              
              <div className={styles.sessionsList}>
                {selectedSessions.length === 0 ? (
                  <div className={styles.noSessionState}>
                    <FiCalendar size={48} color="var(--text-muted)" style={{opacity: 0.5, marginBottom: '16px'}} />
                    <h3 style={{margin: '0 0 8px 0', color: 'var(--text-primary)'}}>No session scheduled today</h3>
                    <p style={{margin: 0, color: 'var(--text-secondary)'}}>Take a break or review your past materials!</p>
                  </div>
                ) : (
                  selectedSessions.map((session, idx) => {
                    const data = session.student_dashboard_data || {};
                  const isReady = data.status === 'READY';
                  const statusInfo = getSessionStatusInfo(session);
                  const isCancelled = session.class_status === 'CANCELLED';
                  
                  return (
                    <div key={idx} className={`${styles.sessionDetailCard} ${styles['card-' + statusInfo.code]}`}>
                      
                      <div className={styles.cardBadges}>
                        <div className={`${styles.pillBadge} ${styles['badge-' + (isCancelled ? 'cancelled' : 'type')]}`}>
                          {isCancelled ? '✕ Cancelled' : (session.class_type || 'Session')}
                        </div>
                        {!isCancelled && (
                          <div className={`${styles.pillBadge} ${styles['badge-' + statusInfo.code]}`}>
                            {statusInfo.code === 'present' ? '✓' : ''} {statusInfo.label}
                          </div>
                        )}
                      </div>

                      <div className={styles.sessionTitleRow}>
                        <h3>{session.title || session.class_type || 'Session'}</h3>
                      </div>
                      <div className={styles.sessionSubtitle}>
                        DOMAIN SESSION • {session.cohort_name || 'Cohort'}
                      </div>
                      
                      <div className={styles.sessionMetaGroup}>
                        <div className={styles.metaMain}>
                          <div className={styles.metaItem}>
                            <FiClock className={styles.metaIcon} /> 
                            {isCancelled ? 'Cancelled' : (isReady ? `${formatTime(data.meet_start)} - ${formatTime(data.meet_end)}` : 'Pending')}
                          </div>
                          <div className={styles.metaItem}>
                            <FiUser className={styles.metaIcon} /> 
                            {session.conducted_by_name || 'Trainer not assigned'}
                          </div>
                          {!isCancelled && (
                            <div className={styles.metaItem}>
                              <FaGoogle className={styles.metaIcon} /> 
                              Google Meet
                            </div>
                          )}
                        </div>

                        {!isCancelled ? (
                          isReady && data.attendance_percentage != null && (
                            <div className={styles.metaProgress}>
                              <CircularProgress 
                                percentage={data.attendance_percentage.toFixed(0)} 
                                color="var(--status-present)" 
                                size={60} 
                                strokeWidth={5} 
                              />
                              <span className={styles.progressLabel}>Attendance</span>
                            </div>
                          )
                        ) : (
                          <div className={styles.metaProgress}>
                            <FiCalendar size={32} color="var(--status-absent)" />
                            <span className={styles.progressLabel} style={{color: "var(--status-absent)"}}>Session Cancelled</span>
                          </div>
                        )}
                      </div>
                      
                      {isCancelled ? (
                         <div className={styles.cardFooterError}>
                           <FiInfo /> This session was cancelled by the training team. It is not counted in your attendance.
                         </div>
                      ) : (
                         <div className={styles.cardFooterSuccess}>
                           “ Great consistency! Keep it up!
                         </div>
                      )}

                      {data.discipline_status === "RESOLVED_BY_PRIOR_PERMISSION" && (
                        <div className={styles.permissionSection}>
                          <h4>Prior Permission Granted</h4>
                          <p>
                            {Array.isArray(session.prior_permissions) && profile?.id ? 
                               (session.prior_permissions.find(p => p.student_id === profile.id)?.reason || "You have been excused from this session.") 
                               : "You have been excused from this session."}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }))}
              </div>

              <div className={styles.bottomTrophyCard}>
                <div className={styles.trophyIconContainer}>
                  <FiAward size={32} color="#f59e0b" />
                </div>
                <div className={styles.trophyText}>
                  <h4>Every session matters!</h4>
                  <p>Your consistency today builds your future tomorrow.</p>
                </div>
                <div className={styles.trophyArrow}>
                  <FiChevronRight size={20} color="#f59e0b" />
                </div>
              </div>

            </div>
          ) : (
            <div className={styles.emptyPanelState}>
              <FiCalendar size={64} className={styles.emptyIcon} />
              <p>Select a highlighted date on the calendar to view session details.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Attendance;