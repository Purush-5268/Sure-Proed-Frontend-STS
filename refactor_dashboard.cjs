const fs = require('fs');
const path = '/home/purush/DEV/Sure-Proed-V2/Frontend/src/pages/student/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. MENTORS CARD REPLACEMENT (Make it clickable, show current mentor)
const oldMentorsCard = `<div className={styles.infoCard}>
                <div className={\`\${styles.infoIcon} \${styles.infoIconMentors}\`}><FiUser size={24} /></div>
                <div>
                  <p className={styles.infoLabel}>Mentors</p>
                  <h4 className={styles.infoValue}>
                    {(() => {
                      const cohortData = stats?.active_cohort || activeApp?.assigned_cohort || {};
                      let count = 0;
                      if (cohortData.active_mentors) count = cohortData.active_mentors.length;
                      else if (cohortData.mentors) count = cohortData.mentors.length;
                      else if (cohortData.mentor_name && cohortData.mentor_name !== "Not assigned") count = cohortData.mentor_name.split(',').length;
                      return count > 0 ? \`\${count} Assigned\` : "Pending";
                    })()}
                  </h4>
                </div>
              </div>`;

const newMentorsCard = `<div className={styles.infoCard} style={{cursor: 'pointer'}} onClick={() => setShowMentorModal(true)}>
                <div className={\`\${styles.infoIcon} \${styles.infoIconMentors}\`}><FiUser size={24} /></div>
                <div>
                  <p className={styles.infoLabel}>Mentors</p>
                  <h4 className={styles.infoValue}>
                    {(() => {
                      const cohortData = stats?.active_cohort || activeApp?.assigned_cohort || {};
                      const count = cohortData.active_mentors?.length || cohortData.mentors?.length || (cohortData.mentor_name && cohortData.mentor_name !== "Not assigned" ? cohortData.mentor_name.split(',').length : 0);
                      const currentMentor = cohortData.current_mentor_details;
                      return count > 0 ? (
                        <>
                          {count} Assigned {currentMentor ? <><span style={{margin:'0 4px', color:'var(--text-muted)'}}>•</span> <span style={{color:'var(--brand-color)', fontWeight:'bold'}}>{currentMentor.first_name || currentMentor.name || currentMentor.email?.split('@')[0]}</span></> : ''}
                        </>
                      ) : "Pending";
                    })()}
                  </h4>
                </div>
              </div>`;
content = content.replace(oldMentorsCard, newMentorsCard);

// 2. UPCOMING LIVE CLASSES LOGIC
const oldUpcomingClasses = `{(() => {
                    const now = new Date();
                    const visibleClasses = todayClasses.filter(cls => {
                      const classStart = new Date(\`\${cls.class_date}T\${cls.start_time}\`);
                      if (isNaN(classStart)) return false;
                      const hoursSince = (now - classStart) / (1000 * 60 * 60);
                      return hoursSince <= 24;
                    }).slice(0, 4);

                    if (visibleClasses.length === 0) {
                      return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No live classes scheduled currently.</p>;
                    }

                    return visibleClasses.map((cls, idx) => {
                      const classStart = new Date(\`\${cls.class_date}T\${cls.start_time}\`);
                      let classEnd = cls.end_time ? new Date(\`\${cls.class_date}T\${cls.end_time}\`) : new Date(classStart.getTime() + 2 * 60 * 60 * 1000);
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
                          <div className={\`\${styles.classBadge} \${badgeClass}\`}>{badgeText}</div>
                        </div>
                      );
                    });
                  })()}`;

const newUpcomingClasses = `{(() => {
                    const now = new Date();
                    // Do not artificially restrict to today, just show what the backend provided.
                    const visibleClasses = todayClasses.slice(0, 4);

                    if (visibleClasses.length === 0) {
                      return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No live classes scheduled currently.</p>;
                    }

                    return visibleClasses.map((cls, idx) => {
                      const classStart = new Date(\`\${cls.class_date}T\${cls.start_time}\`);
                      let classEnd = cls.end_time ? new Date(\`\${cls.class_date}T\${cls.end_time}\`) : new Date(classStart.getTime() + 1.5 * 60 * 60 * 1000);
                      if (classEnd < classStart) classEnd = new Date(classEnd.getTime() + 24 * 60 * 60 * 1000);
                      
                      const clsStatus = (cls.class_status || cls.status || "").toUpperCase();
                      const isCompleted = clsStatus === 'COMPLETED' || clsStatus === 'ENDED' || now > classEnd;
                      const isCancelled = clsStatus === 'CANCELLED';
                      
                      const tMinus10 = new Date(classStart.getTime() - 10 * 60 * 1000);
                      const isJoinWindowOpen = !isCompleted && !isCancelled && now >= tMinus10 && now <= classEnd;
                      const isFuture = !isCompleted && !isCancelled && now < tMinus10;

                      let actionElement = null;
                      
                      if (isJoinWindowOpen) {
                         actionElement = (
                           <button 
                             onClick={() => handleJoinClass(cls)}
                             style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                           >
                             JOIN CLASS
                           </button>
                         );
                      } else if (isFuture) {
                         const diffMs = classStart - now;
                         const diffMins = Math.floor(diffMs / 60000);
                         const diffHours = Math.floor(diffMins / 60);
                         let startsIn = "";
                         if (diffHours > 24) startsIn = "Upcoming";
                         else if (diffHours > 0) startsIn = \`Starts in \${diffHours} hr\`;
                         else startsIn = \`Starts in \${diffMins} min\`;
                         
                         actionElement = <span className={\`\${styles.classBadge} \${styles.classBadgeUpcoming}\`}>{startsIn}</span>;
                      } else if (isCompleted) {
                         actionElement = <span className={\`\${styles.classBadge} \${styles.classBadgeCompleted}\`}>Completed</span>;
                      } else if (isCancelled) {
                         actionElement = <span className={\`\${styles.classBadge} \${styles.classBadgeCancelled}\`}>Cancelled</span>;
                      }

                      // Absence Permission Logic (Only if backend explicitly returns a warning/permission state)
                      const isAbsenceWarning = cls.attendance_warning || cls.permission_eligible;
                      const permissionState = cls.permission_state; // e.g. PENDING, APPROVED, REJECTED
                      
                      return (
                        <div key={idx} className={styles.classItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ flexShrink: 0, width: '32px', height: '32px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              📅
                            </div>
                            <div className={styles.classItemInfo} style={{ flexGrow: 1 }}>
                              <h4 className={styles.classItemTitle}>{cls.title || cls.class_type} — {resolvedEnrollment?.group}</h4>
                              <p className={styles.classItemTime}>
                                {classStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {classStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {classEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <div>
                               {actionElement}
                            </div>
                          </div>
                          
                          {isAbsenceWarning && (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{ fontSize: '13px', color: '#b45309' }}>
                                 <FiAlertCircle style={{ marginBottom: '-2px', marginRight: '4px' }}/> Absence Warning
                               </span>
                               {permissionState === 'PENDING' ? (
                                 <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f59e0b' }}>Pending Admin Approval</span>
                               ) : permissionState === 'APPROVED' ? (
                                 <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981' }}>Permission Approved</span>
                               ) : permissionState === 'REJECTED' ? (
                                 <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444' }}>Permission Rejected</span>
                               ) : (
                                 <button 
                                   onClick={() => { setAbsenceSessionId(cls.id); setShowAbsenceModal(true); }}
                                   style={{ padding: '6px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                                   Seek Permission
                                 </button>
                               )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}`;
content = content.replace(oldUpcomingClasses, newUpcomingClasses);


// 3. QUICK ACTIONS & FEEDBACK/OFFER CARDS
const oldQuickActions = `{/* SECTION 4: Quick Actions Row */}
      <div className={styles.quickActions}>
        <div className={styles.quickAction} onClick={() => {
          // Find first open/live class
          const now = new Date();
          const liveCls = todayClasses.find(c => {
             const start = new Date(\`\${c.class_date}T\${c.start_time}\`);
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

      {/* SECTION 5: Motivational Quotes */}
      <div className={styles.quickActions} style={{ marginTop: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className={styles.quickAction} style={{ background: 'var(--bg-nested)', border: '1px solid var(--border-color)' }}>
          <div className={styles.quickActionIcon} style={{ background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e' }}>📊</div>
          <div>
            <p className={styles.quickActionDesc} style={{ marginBottom: '4px' }}>Small consistent progress</p>
            <h4 className={styles.quickActionTitle}>leads to big results.</h4>
          </div>
        </div>
        
        <div className={styles.quickAction} style={{ background: 'var(--bg-nested)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => navigate('/student/dashboard')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className={styles.quickActionIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>🎓</div>
            <div>
              <p className={styles.quickActionDesc} style={{ marginBottom: '4px' }}>Learn Today.</p>
              <h4 className={styles.quickActionTitle} style={{ color: '#3b82f6' }}>Build Tomorrow.</h4>
            </div>
          </div>
          <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>&gt;</span>
        </div>
      </div>`;

const newQuickActions = `{/* SECTION 4: Quick Actions & Bottom Cards */}
      <div className={styles.quickActions} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        
        <div className={styles.quickAction} onClick={() => navigate('/student/assignments')}>
          <div className={styles.quickActionIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><FiFileText size={24} /></div>
          <div>
            <h4 className={styles.quickActionTitle}>View Assignments</h4>
            <p className={styles.quickActionDesc}>Check and submit your work</p>
          </div>
        </div>

        {/* Conditional Exam Action */}
        {(!resolvedEnrollment.isEnrolled || (stats?.upcoming_exams && stats.upcoming_exams.length > 0)) && (
          <div className={styles.quickAction} onClick={() => navigate('/student/exam-instructions')}>
            <div className={styles.quickActionIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><FiEdit size={24} /></div>
            <div>
              <h4 className={styles.quickActionTitle}>Take Exam</h4>
              <p className={styles.quickActionDesc}>Attempt pending assessments</p>
            </div>
          </div>
        )}

        <div className={styles.quickAction} onClick={() => navigate('/student/resources')}>
          <div className={styles.quickActionIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}><FiBookOpen size={24} /></div>
          <div>
            <h4 className={styles.quickActionTitle}>View Resources</h4>
            <p className={styles.quickActionDesc}>Notes, recordings & more</p>
          </div>
        </div>
      </div>

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
      </div>`;
content = content.replace(oldQuickActions, newQuickActions);


// 4. ADD MODALS BEFORE THE CLOSING DIV
const newModals = `
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
`;

content = content.replace("    </div>\n  );\n}\n\nexport default Dashboard;", newModals + "\n    </div>\n  );\n}\n\nexport default Dashboard;");

// FiX icon import
if(!content.includes("FiX")) {
  content = content.replace("FiAlertCircle", "FiAlertCircle, FiX");
}

fs.writeFileSync(path, content);
console.log("Dashboard refactored successfully for Mentor, Classes, Actions, and Modals.");
