const fs = require('fs');
const path = require('path');

const jsxPath = path.join(__dirname, 'src', 'pages', 'student', 'Dashboard.jsx');
const cssPath = path.join(__dirname, 'src', 'pages', 'student', 'Dashboard.module.css');

let jsx = fs.readFileSync(jsxPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

// ==========================================
// 1. REWRITE DASHBOARD.JSX
// ==========================================

// CHUNK 1: Top Section (Hero + Calendar)
const topSectionChunk = `
      {/* SECTION 1: Top Layer (Hero + Calendar) */}
      <div className={styles.topSection}>
        <div className={styles.heroBanner}>
          <div className={styles.heroLeft}>
            <p className={styles.heroGreeting}>Welcome back,</p>
            <h1 className={styles.heroName}>
              {\`\${user?.first_name || ''} \${user?.last_name || ''}\`.trim() || profile?.first_name || "Student"}!
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
`;

// Replace Hero Section (from SECTION 1 to before COMPLETED banner)
const section1Regex = /\{\/\* SECTION 1: Welcome Hero Banner \*\/\}.*?(?=\{resolvedEnrollment\?.status === "COMPLETED" && \()/s;
jsx = jsx.replace(section1Regex, topSectionChunk + '\n      ');

// CHUNK 2: Summary Cards
const summaryCardsChunk = `
      {/* SECTION 2: Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={\`\${styles.summaryIcon} \${styles.summaryIconCourse}\`}><FiCpu size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Current Course</p>
            <h4 className={styles.summaryValue} title={resolvedEnrollment?.courseName || profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"}>
              {resolvedEnrollment?.courseName || profile?.current_application?.course?.name || stats?.application_course_title || profile?.course_name || "Awaiting Course"}
            </h4>
          </div>
        </div>
        
        <div className={styles.summaryCard}>
          <div className={\`\${styles.summaryIcon} \${styles.summaryIconCohort}\`}><FiUsers size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Cohort</p>
            <h4 className={styles.summaryValue}>{resolvedEnrollment?.group || profile?.current_application?.assigned_cohort?.code || stats?.active_cohort?.code || profile?.cohort_code || "Awaiting Cohort"}</h4>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={\`\${styles.summaryIcon} \${styles.summaryIconStatus}\`}><FiBarChart2 size={24} /></div>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <p className={styles.summaryLabel}>Learning Status</p>
            <h4 className={styles.summaryValue}>{resolvedEnrollment?.status ? resolvedEnrollment.status.replace(/_/g, " ") : "ACTIVE"}</h4>
          </div>
        </div>

        <div className={styles.summaryCard} onClick={() => setShowMentorModal(true)} style={{ cursor: 'pointer' }}>
          <div className={\`\${styles.summaryIcon} \${styles.summaryIconMentors}\`}><FiUser size={24} /></div>
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
                  return mentorName ? \`\${count} Assigned · \${mentorName}\` : \`\${count} Assigned\`;
                }
                return "Pending";
              })()}
            </h4>
          </div>
          <FiArrowRight size={18} color="var(--text-muted)" />
        </div>
      </div>
`;

// Replace Info Strip (from SECTION 2 to SECTION 3)
const section2Regex = /\{\/\* SECTION 2: Info Strip \*\/\}.*?(?=\{\/\* SECTION 3: Main Grid \(4 columns\) \*\/\})/s;
jsx = jsx.replace(section2Regex, summaryCardsChunk + '\n      ');

// CHUNK 3: Current Enrollment Card
const currentEnrollmentChunk = `
        {/* Col 2: Current Enrollment */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Current Enrollment</h3>
            <span className={styles.enrollmentBadge}>Active</span>
          </div>
          <div className={styles.enrollmentCard}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                 <FiCpu size={28} />
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
                <span className={styles.enrollmentMetaValue}>{resolvedEnrollment?.courseDomain || "General"}</span>
              </div>
              <div className={styles.enrollmentMetaItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiCalendar size={14} color="var(--text-muted)" />
                  <span className={styles.enrollmentMetaLabel}>Start Date</span>
                </div>
                <span className={styles.enrollmentMetaValue}>{resolvedEnrollment?.startDate ? new Date(resolvedEnrollment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently"}</span>
              </div>
            </div>
            
            <div className={styles.enrollmentProgressContainer}>
              <div className={styles.enrollmentProgressBarBg}>
                <div className={styles.enrollmentProgressFill} style={{ width: \`\${Math.round(attendanceStats?.attendance_percentage || 0)}%\` }}></div>
              </div>
              <span className={styles.enrollmentProgressText}>{Math.round(attendanceStats?.attendance_percentage || 0)}%</span>
            </div>

            <button className={styles.enrollmentViewBtn} onClick={() => navigate('/student/course-details')}>
              View Course Details &rarr;
            </button>
          </div>
        </div>
`;
const section3RegexCol2 = /\{\/\* Col 2: Current Enrollment \*\/\}.*?(?=\{\/\* Col 3: Upcoming Live Classes \*\/\})/s;
jsx = jsx.replace(section3RegexCol2, currentEnrollmentChunk + '\n\n        ');

// CHUNK 4: Upcoming Live Classes
const upcomingClassesChunk = `
        {/* Col 3: Upcoming Live Classes */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Upcoming Live Classes</h3>
            <button className={styles.cardViewAll} onClick={() => navigate('/student/class-schedule')}>View All &rarr;</button>
          </div>
          <div className={styles.classesListContainer}>
            {(() => {
              const now = new Date();
              const visibleClasses = todayClasses.filter(cls => {
                const classStart = new Date(\`\${cls.class_date}T\${cls.start_time}\`);
                if (isNaN(classStart)) return false;
                const hoursSince = (now - classStart) / (1000 * 60 * 60);
                return hoursSince <= 24;
              }).slice(0, 3);

              if (visibleClasses.length === 0) {
                return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No live classes scheduled currently.</p>;
              }

              return visibleClasses.map((cls, idx) => {
                const classStart = new Date(\`\${cls.class_date}T\${cls.start_time}\`);
                let classEnd = cls.end_time ? new Date(\`\${cls.class_date}T\${cls.end_time}\`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
                if (classEnd < classStart) classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                
                const clsStatus = (cls.class_status || cls.status || "").toUpperCase();
                const isCompleted = clsStatus === 'COMPLETED' || clsStatus === 'ENDED' || now >= classEnd;
                const isCancelled = clsStatus === 'CANCELLED';
                const windowOpenTime = new Date(classStart.getTime() - 10 * 60 * 1000);
                const classOpen = !isCompleted && !isCancelled && now >= windowOpenTime && now <= classEnd;
                const startsIn = Math.floor((classStart - now) / 60000);

                let rightElement;
                if (isCompleted) { 
                  rightElement = <span className={styles.badgeCompleted}>Completed</span>;
                } else if (isCancelled) { 
                  rightElement = <span className={styles.badgeCancelled}>Cancelled</span>;
                } else if (classOpen) { 
                  rightElement = <button className={styles.btnJoinClass} onClick={() => handleJoinClass(cls)}>Join Class</button>;
                } else if (startsIn > 0) {
                  const hrs = Math.floor(startsIn / 60);
                  const mins = startsIn % 60;
                  const timeText = hrs > 0 ? \`\${hrs} hr \${mins} min\` : \`\${mins} min\`;
                  rightElement = (
                    <div className={styles.startsInBadge}>
                      <span className={styles.startsInLabel}>Starts in</span>
                      <span className={styles.startsInTime}>{timeText}</span>
                    </div>
                  );
                }

                return (
                  <div key={idx} className={styles.classItemContainer}>
                    <div className={styles.classItemIconBox}>
                      <FiCalendar size={18} />
                    </div>
                    <div className={styles.classItemDetails}>
                      <h4 className={styles.classItemName}>{cls.title || cls.class_type}</h4>
                      <p className={styles.classItemTime}>
                        <FiClock size={12} style={{marginRight: '4px'}}/>
                        {classStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {classEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className={styles.classItemRight}>
                      {rightElement}
                    </div>
                  </div>
                );
              });
            })()}
            
            {todayClasses.length > 0 && (
               <button className={styles.viewAllClassesBtn} onClick={() => navigate('/student/class-schedule')}>
                 View All Classes &rarr;
               </button>
            )}
          </div>
        </div>
`;
const section3RegexCol3 = /\{\/\* Col 3: Upcoming Live Classes \*\/\}.*?(?=\{\/\* Col 4: Recent Announcements \*\/\})/s;
jsx = jsx.replace(section3RegexCol3, upcomingClassesChunk + '\n\n        ');

// CHUNK 5: Quick Actions Row (Remove Join Class, Keep Take Exam conditional)
const quickActionsChunk = `
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
`;
const section4Regex = /\{\/\* SECTION 4: Quick Actions Row \*\/\}.*?(?=\{\/\* SECTION 5: Feedback and Offer Letters \*\/\})/s;
jsx = jsx.replace(section4Regex, quickActionsChunk + '\n      ');

// FIX activeApp bug globally in the file (there might be multiple occurrences)
jsx = jsx.replace(/activeApp\?\.assigned_cohort/g, "profile?.current_application?.assigned_cohort");


// ==========================================
// 2. REWRITE DASHBOARD.MODULE.CSS
// ==========================================
// Add the new CSS classes at the bottom of the file to override previous ones

const cssOverrides = `
/* =========================================================
   PREMIUM UI OVERRIDES (Matches Reference Mockup)
   ========================================================= */

.topSection {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding: 0 40px;
}

.heroBanner {
  flex: 1;
  background: linear-gradient(90deg, rgba(230, 240, 255, 0.95) 0%, rgba(240, 245, 255, 0.7) 40%, transparent 100%),
    url('https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80') center/cover no-repeat;
  padding: 32px;
  border-radius: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0 !important;
  min-height: 180px;
}
:global([data-theme="dark"]) .heroBanner {
  background: linear-gradient(90deg, rgba(10,22,40, 0.95) 0%, rgba(10,22,40, 0.7) 40%, transparent 100%),
    url('https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80') center/cover no-repeat;
}

.heroValues {
  color: #0f172a;
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
  text-align: right;
  text-transform: uppercase;
  letter-spacing: 1px;
}
:global([data-theme="dark"]) .heroValues {
  color: white;
}

.calendarCard {
  width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 24px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
}
.calendarHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.calendarTitle {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.summaryGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  padding: 0 40px 24px 40px;
}
.summaryCard {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  transition: all 0.2s ease;
}
.summaryCard:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.04);
}
.summaryIcon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.summaryIconCourse { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.summaryIconCohort { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.summaryIconStatus { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.summaryIconMentors { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }

.summaryLabel {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.5px;
  margin: 0 0 4px 0;
}
.summaryValue {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.enrollmentMetaWrapper {
  display: flex;
  gap: 24px;
  margin: 16px 0;
}
.enrollmentMetaItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.enrollmentMetaLabel {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
}
.enrollmentMetaValue {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.enrollmentProgressContainer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.enrollmentProgressBarBg {
  flex: 1;
  height: 8px;
  background: var(--bg-nested);
  border-radius: 4px;
  overflow: hidden;
}
.enrollmentProgressFill {
  height: 100%;
  background: var(--primary-color);
  border-radius: 4px;
}
.enrollmentProgressText {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.enrollmentViewBtn {
  width: 100%;
  padding: 12px;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.enrollmentViewBtn:hover {
  background: rgba(16, 185, 129, 0.15);
}

.classItemContainer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}
.classItemContainer:last-child {
  border-bottom: none;
}
.classItemIconBox {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.classItemDetails {
  flex: 1;
  min-width: 0;
}
.classItemName {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.classItemTime {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  display: flex;
  align-items: center;
}
.classItemRight {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 85px;
}

.badgeCompleted {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(107, 114, 128, 0.1);
  color: var(--text-secondary);
  font-weight: 700;
  text-transform: uppercase;
}
.badgeCancelled {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-weight: 700;
  text-transform: uppercase;
}
.btnJoinClass {
  background: #10b981;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
  transition: all 0.2s;
}
.btnJoinClass:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4);
}
.startsInBadge {
  background: rgba(16, 185, 129, 0.1);
  padding: 6px 10px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;
}
.startsInLabel {
  font-size: 10px;
  color: #10b981;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}
.startsInTime {
  font-size: 12px;
  color: #10b981;
  font-weight: 800;
}
.viewAllClassesBtn {
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  background: rgba(59, 130, 246, 0.05);
  color: #3b82f6;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.quickActionsWrapper {
  padding: 0 40px 24px 40px;
}
.quickActionsHeading {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: var(--text-primary);
}
.quickActions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.quickAction {
  flex: 1;
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}
.quickAction:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.04);
}
.quickActionTitle {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.quickActionDesc {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
}

@media (max-width: 1200px) {
  .topSection {
    flex-direction: column;
  }
  .calendarCard {
    width: 100%;
  }
  .summaryGrid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 900px) {
  .topSection, .summaryGrid, .quickActionsWrapper {
    padding-left: 20px;
    padding-right: 20px;
  }
  .summaryGrid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .topSection, .summaryGrid, .quickActionsWrapper {
    padding-left: 16px;
    padding-right: 16px;
  }
}
`;

let newCss = css + '\n' + cssOverrides;

fs.writeFileSync(jsxPath, jsx);
fs.writeFileSync(cssPath, newCss);

console.log("Successfully rebuilt Dashboard UI.");
