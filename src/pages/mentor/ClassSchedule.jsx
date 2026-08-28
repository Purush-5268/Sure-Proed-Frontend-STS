import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./ClassSchedule.module.css";
import { FiCalendar, FiClock, FiPlus, FiX } from "react-icons/fi";

function ClassSchedule() {
  const { globalCohort } = useOutletContext() || {};
  const [schedules, setSchedules] = useState([]);
  const [availableTrainings, setAvailableTrainings] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadSchedules = async () => {
      try {
        const cohortParams = globalCohort ? { cohort: globalCohort } : {};
        
        // 1. Fetch Mentor Cohorts
        const cohortsRes = await apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS);
        let myCohorts = Array.isArray(cohortsRes.data?.results) ? cohortsRes.data.results : (Array.isArray(cohortsRes.data) ? cohortsRes.data : []);
        if (globalCohort) {
          myCohorts = myCohorts.filter(c => String(c.id) === String(globalCohort));
        }
        if (isMounted) setSchedules(myCohorts);

        // 2. Fetch Available Trainings
        const trainingsData = await fetchAllPages(API_ENDPOINTS.TRAININGS.BASE);
        if (isMounted) setAvailableTrainings(trainingsData);

        // 3. Fetch Active Sessions (Domain + Training)
        const [domainRes, trainingRes] = await Promise.allSettled([
          fetchAllPages(API_ENDPOINTS.ATTENDANCE.BASE, { params: { conducted: "true", ...cohortParams } }),
          fetchAllPages(API_ENDPOINTS.TRAININGS.SESSIONS, { params: cohortParams })
        ]);

        let unifiedSessions = [];

        if (domainRes.status === "fulfilled") {
          const domainActive = domainRes.value.filter(s => s.conducted !== false);
          domainActive.forEach(s => {
            unifiedSessions.push({
              id: s.id,
              type: "DOMAIN",
              title: s.title || "Live Class",
              start_time: s.start_time,
              end_time: s.end_time,
              session_date: s.class_date,
              meeting_link: s.meeting_link,
              raw: s
            });
          });
        }

        if (trainingRes.status === "fulfilled") {
          const trainingActive = trainingRes.value.filter(s => s.class_status !== 'COMPLETED' && s.class_status !== 'CANCELLED');
          trainingActive.forEach(s => {
            unifiedSessions.push({
              id: s.id,
              type: "TRAINING",
              title: s.title || "Training Session",
              start_time: s.start_time,
              end_time: s.end_time,
              session_date: s.session_date,
              meeting_link: s.meeting_link,
              raw: s
            });
          });
        }

        // Sort by date/time (most recent first or upcoming)
        unifiedSessions.sort((a, b) => {
          const dateA = new Date(`${a.session_date}T${a.start_time}`);
          const dateB = new Date(`${b.session_date}T${b.start_time}`);
          return dateA - dateB;
        });

        if (isMounted) setActiveSessions(unifiedSessions);

      } catch (err) {
        console.error("Failed to load class schedule:", err);
        if (isMounted) setSchedules([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadSchedules();
    return () => { isMounted = false; };
  }, [globalCohort]);

  const [sessionType, setSessionType] = useState("DOMAIN"); // "DOMAIN" or "TRAINING"
  const [scheduleForm, setScheduleForm] = useState({ 
    title: "", 
    cohortId: "", 
    trainingId: "",
    startTime: "", 
    endTime: "", 
    guestEmails: [] 
  });
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setIsScheduling(true);
    try {
      if (!scheduleForm.cohortId) {
        alert("Please select a cohort.");
        setIsScheduling(false);
        return;
      }

      const startDt = new Date(scheduleForm.startTime);
      const endDt = new Date(scheduleForm.endTime);
      const class_date = startDt.toISOString().split("T")[0];
      const start_time = startDt.toTimeString().split(" ")[0];
      const end_time = endDt.toTimeString().split(" ")[0];
      const selectedCohort = schedules.find(c => String(c.id) === scheduleForm.cohortId);

      if (sessionType === "DOMAIN") {
        const payload = {
          title: scheduleForm.title,
          frontend_cohort_id: scheduleForm.cohortId,
          stream_id: selectedCohort?.course?.id || selectedCohort?.course,
          class_date,
          start_time,
          end_time,
          session_type: "Domain",
          guest_emails: scheduleForm.guestEmails.join(",")
        };
        await apiClient.post(API_ENDPOINTS.ATTENDANCE.BASE, payload);
        alert("✅ Domain Session Scheduled!");
      } else {
        if (!scheduleForm.trainingId) {
          alert("Please select a training topic.");
          setIsScheduling(false);
          return;
        }
        const payload = {
          training: scheduleForm.trainingId,
          cohort: scheduleForm.cohortId,
          title: scheduleForm.title,
          session_date: class_date,
          start_time: start_time,
          end_time: end_time
        };
        await apiClient.post(API_ENDPOINTS.TRAININGS.SESSIONS, payload);
        alert("✅ Training Session Scheduled!");
      }

      setScheduleForm({ title: "", cohortId: "", trainingId: "", startTime: "", endTime: "", guestEmails: [] });
      setShowScheduleForm(false);
      // Reload logic could be added here, but preserving existing behavior which did not reload.
    } catch (err) {
      alert(err?.response?.data?.detail || "❌ Failed to schedule class.");
    } finally {
      setIsScheduling(false);
    }
  };

  const addGuest = (e) => {
    e.preventDefault();
    if (newGuestEmail.includes("@")) {
      setScheduleForm(prev => ({ ...prev, guestEmails: [...prev.guestEmails, newGuestEmail.trim()] }));
      setNewGuestEmail("");
    }
  };

  const removeGuest = (index) => {
    setScheduleForm(prev => ({ 
      ...prev, 
      guestEmails: prev.guestEmails.filter((_, idx) => idx !== index) 
    }));
  };

  const handleEndClass = async (sessionId, type) => {
    if (!window.confirm("Are you sure you want to end this class?")) return;
    try {
      if (type === "DOMAIN") {
        await apiClient.patch(API_ENDPOINTS.ATTENDANCE.BY_ID(sessionId), { conducted: false });
      } else {
        await apiClient.patch(API_ENDPOINTS.TRAININGS.SESSION_BY_ID(sessionId), { class_status: "COMPLETED" });
      }
      setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
      alert("Class ended successfully.");
    } catch (err) {
      alert("Failed to end class.");
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Class Schedule" 
        description="View your cohort timelines and schedule live sessions."
        actions={
          <button 
            type="button" 
            className={styles.primaryBtn}
            onClick={() => setShowScheduleForm(!showScheduleForm)}
          >
            {showScheduleForm ? "Cancel Scheduling" : <><FiPlus /> Schedule Session</>}
          </button>
        }
      />

      <AnimatePresence>
        {showScheduleForm && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3 }}
            className={styles.formWrapper}
          >
            <Card className={styles.formCard}>
              <h2 className={styles.formTitle}>Schedule Session</h2>
              
              <div className={styles.sessionTypeSelector} style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input 
                    type="radio" 
                    name="sessionType" 
                    value="DOMAIN" 
                    checked={sessionType === "DOMAIN"} 
                    onChange={() => setSessionType("DOMAIN")} 
                  />
                  Domain Class
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input 
                    type="radio" 
                    name="sessionType" 
                    value="TRAINING" 
                    checked={sessionType === "TRAINING"} 
                    onChange={() => setSessionType("TRAINING")} 
                  />
                  Training Session
                </label>
              </div>

              <form onSubmit={handleScheduleSubmit} className={styles.formGrid}>
                {sessionType === "TRAINING" && (
                  <div className={styles.fullWidth}>
                    <label className={styles.label}>Select Training Topic <span className={styles.required}>*</span></label>
                    <select
                      required
                      value={scheduleForm.trainingId}
                      onChange={e => setScheduleForm({ ...scheduleForm, trainingId: e.target.value })}
                      className={styles.input}
                    >
                      <option value="">-- Select Training --</option>
                      {availableTrainings.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.duration_hours} hours)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.fullWidth}>
                  <label className={styles.label}>Meet Title / Topic <span className={styles.required}>*</span></label>
                  <input 
                    type="text" 
                    required 
                    value={scheduleForm.title} 
                    onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} 
                    className={styles.input} 
                    placeholder="e.g. Advanced State Management"
                  />
                </div>
                
                <div className={styles.fullWidth}>
                  <label className={styles.label}>Select Cohort <span className={styles.required}>*</span></label>
                  <select
                    required
                    value={scheduleForm.cohortId}
                    onChange={e => setScheduleForm({ ...scheduleForm, cohortId: e.target.value })}
                    className={styles.input}
                  >
                    <option value="">-- Select Assigned Cohort --</option>
                    {schedules.map(cohort => (
                      <option key={cohort.id} value={cohort.id}>
                        {cohort.code} - {cohort.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Start Time <span className={styles.required}>*</span></label>
                  <input 
                    type="datetime-local" 
                    required 
                    value={scheduleForm.startTime} 
                    onChange={e => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} 
                    className={styles.input} 
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label className={styles.label}>End Time <span className={styles.required}>*</span></label>
                  <input 
                    type="datetime-local" 
                    required 
                    value={scheduleForm.endTime} 
                    onChange={e => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} 
                    className={styles.input} 
                  />
                </div>

                {sessionType === "DOMAIN" && (
                  <div className={styles.fullWidth}>
                    <div className={styles.guestSection}>
                      <label className={styles.label}>Whitelist Guest Emails</label>
                      <div className={styles.guestInputRow}>
                        <input 
                          type="email" 
                          placeholder="guest@email.com" 
                          value={newGuestEmail} 
                          onChange={e => setNewGuestEmail(e.target.value)} 
                          className={styles.input}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGuest(e))}
                        />
                        <button type="button" onClick={addGuest} className={styles.secondaryBtn}>Add</button>
                      </div>
                      
                      {scheduleForm.guestEmails.length > 0 && (
                        <div className={styles.guestList}>
                          {scheduleForm.guestEmails.map((em, i) => (
                            <span key={i} className={styles.guestPill}>
                              {em} 
                              <button type="button" onClick={() => removeGuest(i)} className={styles.removeGuestBtn}>
                                <FiX />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className={styles.fullWidth}>
                  <button type="submit" disabled={isScheduling} className={styles.submitBtn}>
                    {isScheduling ? "Scheduling..." : "Confirm Schedule"}
                  </button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {activeSessions.length > 0 && (
        <div className={styles.scheduleList} style={{ marginBottom: '2rem' }}>
          <h2 className={styles.sectionTitle}>Active Sessions</h2>
          <div className={styles.grid}>
            {activeSessions.map(session => (
              <Card key={session.id} hoverable className={styles.scheduleCard} style={{ borderLeft: `4px solid ${session.type === 'TRAINING' ? '#8b5cf6' : '#ef4444'}` }}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cohortName}>{session.title}</h3>
                  <Badge variant={session.type === 'TRAINING' ? 'primary' : 'error'}>
                    {session.type === 'TRAINING' ? 'TRAINING' : 'DOMAIN'}
                  </Badge>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.infoRow}>
                    <FiCalendar className={styles.icon} />
                    <span>{session.session_date}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <FiClock className={styles.icon} />
                    <span>{session.start_time} — {session.end_time || "Ongoing"}</span>
                  </div>
                  {session.meeting_link && (
                    <div className={styles.infoRow} style={{ marginTop: '0.5rem' }}>
                      <a href={session.meeting_link} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '500' }}>
                        Join Meet Link
                      </a>
                    </div>
                  )}
                  <div style={{ marginTop: '1rem' }}>
                    <button 
                      onClick={() => handleEndClass(session.id, session.type)}
                      style={{ background: session.type === 'TRAINING' ? '#8b5cf6' : '#ef4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      End Class
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className={styles.scheduleList}>
        <h2 className={styles.sectionTitle}>Cohort Timelines</h2>
        
        {loading ? (
          <div className={styles.grid}>
            <SkeletonLoader width="100%" height="150px" borderRadius="12px" />
            <SkeletonLoader width="100%" height="150px" borderRadius="12px" />
          </div>
        ) : schedules.length === 0 ? (
          <EmptyState 
            icon={<FiCalendar />}
            title="No Timelines Available"
            description="There are currently no cohort timelines assigned to you."
          />
        ) : (
          <motion.div 
            className={styles.grid}
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {schedules.map((item) => (
              <Card key={item.id} hoverable className={styles.scheduleCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cohortName}>{item.name || item.code || "Unnamed Cohort"}</h3>
                  <Badge variant={item.status === 'ACTIVE' ? 'success' : 'default'}>
                    {item.status || 'PENDING'}
                  </Badge>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.infoRow}>
                    <FiCalendar className={styles.icon} />
                    <span>Course: {item.course_name || item.course?.name || item.course || "General"}</span>
                  </div>
                  <div className={styles.timeline}>
                    <div className={styles.timePoint}>
                      <span className={styles.timeLabel}>Start</span>
                      <span className={styles.timeDate}>{item.start_date || "TBD"}</span>
                    </div>
                    <div className={styles.timeLineBar}></div>
                    <div className={styles.timePoint}>
                      <span className={styles.timeLabel}>End</span>
                      <span className={styles.timeDate}>{item.end_date || "TBD"}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default ClassSchedule;
