import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./ClassSchedule.module.css";
import { FiCalendar, FiClock, FiPlus, FiX } from "react-icons/fi";

function ClassSchedule() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadSchedules = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COHORTS.BASE);
        if (isMounted) setSchedules(Array.isArray(response.data?.results) ? response.data.results : (Array.isArray(response.data) ? response.data : []));
      } catch (err) {
        console.error("Failed to load class schedule:", err);
        if (isMounted) setSchedules([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadSchedules();
    return () => {
      isMounted = false;
    };
  }, []);

  const [scheduleForm, setScheduleForm] = useState({ title: "", startTime: "", endTime: "", guestEmails: [] });
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setIsScheduling(true);
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}schedule/`, { ...scheduleForm, sessionType: "Domain" });
      alert("✅ Domain Session Scheduled!");
      setScheduleForm({ title: "", startTime: "", endTime: "", guestEmails: [] });
      setShowScheduleForm(false);
    } catch (err) {
      alert("❌ Failed to schedule class.");
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

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Class Schedule" 
        description="View your cohort timelines and schedule live domain sessions."
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
              <h2 className={styles.formTitle}>Schedule Domain Session</h2>
              <form onSubmit={handleScheduleSubmit} className={styles.formGrid}>
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
                    <span>Course: {item.course?.name || item.course || "General"}</span>
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