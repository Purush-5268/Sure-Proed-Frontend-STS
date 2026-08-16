import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { courseService } from "../../services/courseService";
import { attendanceService } from "../../services/attendanceService";
import { normalizeListResponse } from "../../services/apiClient";
import apiClient from "../../services/apiClient";
import styles from "./ScheduleClass.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ScheduleClass() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("MANUAL");
  const [automationForm, setAutomationForm] = useState({
    firstSunday: "",
    startTime: "",
    endTime: "",
    startingBatch: "BATCH_1"
  });
  const [automationInfo, setAutomationInfo] = useState(null);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 🚨 State for the Live Radar
  const [activeAdminClasses, setActiveAdminClasses] = useState([]);

  const [request, setRequest] = useState({
    sessionType: "Domain",
    streamId: "",
    groupName: "",
    lstBatchNumber: "",
    startTime: "",
    endTime: "",
    guestEmails: [],
    title: "",
  });

  const [showGuestInput, setShowGuestInput] = useState(false);
  const [newGuestEmail, setNewGuestEmail] = useState("");

  // 🚨 State for Manage Attendees (After Generation)
  const [managingClassId, setManagingClassId] = useState(null);
  const [newWhitelistEmail, setNewWhitelistEmail] = useState("");
  const [isAddingWhitelist, setIsAddingWhitelist] = useState(false);

  // 🚨 Function to fetch live radar data
  const loadActiveClasses = async () => {
    try {
      const res = await attendanceService.getAttendanceRecords({ status: "ACTIVE" });
      const rawData = res.data || res;
      // Safely extract Django's paginated results
      const sessionsArray = Array.isArray(rawData.results) ? rawData.results : (Array.isArray(rawData) ? rawData : []);
      setActiveAdminClasses(sessionsArray);
    } catch (err) {
      console.error("Failed to load radar classes:", err);
    }
  };

  useEffect(() => {
    async function loadCourses() {
      try {
        const cached = sessionStorage.getItem("sure_courses_cache");
        if (cached) {
          setCourses(JSON.parse(cached));
        } else {
          const res = await courseService.getCourses();
          const normalized = normalizeListResponse(res);
          setCourses(normalized);
          sessionStorage.setItem("sure_courses_cache", JSON.stringify(normalized));
        }
      } catch (err) {
        console.error("Failed to load courses:", err);
      }
    }
    
    async function fetchAutomation() {
      try {
        const res = await apiClient.get('/api/attendance/get-lst-automation/');
        setAutomationInfo(res.data);
      } catch (err) {
        console.error("Failed to load automation info", err);
      }
    }

    Promise.all([loadCourses(), loadActiveClasses(), fetchAutomation()]);
  }, []);

  const handleSetupAutomation = async (e) => {
    e.preventDefault();
    
    // Sunday Validation
    if (automationForm.firstSunday) {
      const selectedDate = new Date(automationForm.firstSunday);
      if (selectedDate.getDay() !== 0) {
         alert("❌ Please select a Sunday date for automatic LST meetings.");
         return;
      }
    }
    
    setIsLoading(true);
    try {
       const res = await apiClient.post('/api/attendance/setup-lst-automation/', {
          first_sunday: automationForm.firstSunday,
          start_time: automationForm.startTime + ":00",
          end_time: automationForm.endTime + ":00",
          starting_batch: automationForm.startingBatch,
          is_paused: false
       });
       alert("✅ " + res.data.message);
       const getRes = await apiClient.get('/api/attendance/get-lst-automation/');
       setAutomationInfo(getRes.data);
    } catch (err) {
       alert("❌ Failed to setup automation: " + (err.response?.data?.error || err.message));
    } finally {
       setIsLoading(false);
    }
  };

  const handleToggleGlobalAutomation = async (isPaused) => {
    try {
      const res = await apiClient.post('/api/attendance/toggle-lst-automation/', {
        is_paused: isPaused
      });
      alert(`✅ ${res.data.message}`);
      const getRes = await apiClient.get('/api/attendance/get-lst-automation/');
      setAutomationInfo(getRes.data);
    } catch (err) {
      alert(`❌ ${err.response?.data?.error || "Failed to toggle automation."}`);
    }
  };


  const addGuestEmail = (e) => {
    if (e) e.preventDefault();
    if (newGuestEmail && newGuestEmail.includes("@")) {
      setRequest((prev) => ({
        ...prev,
        guestEmails: [...prev.guestEmails, newGuestEmail.trim()],
      }));
      setNewGuestEmail("");
    }
  };

  const removeGuestEmail = (index) => {
    setRequest((prev) => ({
      ...prev,
      guestEmails: prev.guestEmails.filter((_, i) => i !== index),
    }));
  };

  // 🚨 New States for Inline Rescheduling
  const [editingClassId, setEditingClassId] = useState(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");

  const handleStartEdit = (cls) => {
    setEditingClassId(cls.id);
    // Format the date/time correctly for the HTML datetime-local input
    const datePart = cls.class_date || new Date().toISOString().split('T')[0];
    const startPart = cls.start_time ? cls.start_time.substring(0, 5) : "00:00";
    const endPart = cls.end_time ? cls.end_time.substring(0, 5) : "23:59";

    setEditStartTime(`${datePart}T${startPart}`);
    setEditEndTime(`${datePart}T${endPart}`);
  };

  const handleSaveReschedule = async (classId) => {
    try {
      const updatedData = {
        class_date: editStartTime.split("T")[0],
        start_time: editStartTime.split("T")[1] + ":00",
        end_time: editEndTime.split("T")[1] + ":00"
      };

      await attendanceService.patchAttendanceRecord(classId, updatedData);

      // Update local state to reflect changes instantly
      setActiveAdminClasses(prev => prev.map(c =>
        c.id === classId ? { ...c, class_date: updatedData.class_date, start_time: updatedData.start_time, end_time: updatedData.end_time } : c
      ));

      setEditingClassId(null);
    } catch (error) {
      alert("❌ Failed to reschedule. Please check the backend connection.");
    }
  };

  const handleAddWhitelistEmail = async (cls) => {
    if (!newWhitelistEmail || !newWhitelistEmail.includes("@")) {
      alert("Please enter a valid email.");
      return;
    }
    const currentGuestEmails = cls.guest_emails || [];
    if (currentGuestEmails.map(e => e.toLowerCase()).includes(newWhitelistEmail.trim().toLowerCase())) {
      alert("Email already added.");
      return;
    }

    setIsAddingWhitelist(true);
    try {
      const res = await apiClient.post(`/api/attendance/${cls.id}/add-attendees/`, {
        emails: [newWhitelistEmail.trim()]
      });
      
      const updatedGuestEmails = res.data?.guest_emails || [];
      const addedCount = updatedGuestEmails.length - currentGuestEmails.length;
      
      setActiveAdminClasses(prev => prev.map(c => {
         if (c.id === cls.id) {
            return {
               ...c,
               guest_emails: updatedGuestEmails,
               whitelist_email_count: (c.whitelist_email_count || 0) + addedCount,
               total_attendee_count: (c.total_attendee_count || c.actual_student_count || 0) + addedCount
            };
         }
         return c;
      }));
      setNewWhitelistEmail("");
    } catch (err) {
      console.error(err);
      alert("❌ Failed to add email.");
    } finally {
      setIsAddingWhitelist(false);
    }
  };

  // 🚨 FIXED: Force End Class must send 'conducted: false' so backend intercepts it
  const handleForceEndClass = async (classId) => {
    if (!window.confirm("Are you sure you want to end this class and calculate attendance?")) return;
    try {
      // Optimistic instant removal
      setActiveAdminClasses(prev => prev.filter(c => c.id !== classId));

      // 🚨 FIX: MUST send conducted: false so Django triggers the aggregate_completed_session logic!
      await attendanceService.patchAttendanceRecord(classId, { status: "COMPLETED", conducted: false });

      alert("✅ Class ended successfully. Attendance calculated.");
    } catch (err) {
      console.error("Failed to end class:", err);
      loadActiveClasses(); // Revert if failed
      alert("❌ Failed to end class. Check backend endpoints.");
    }
  };

  const handleToggleAutomation = async (isPaused) => {
    if (!automationInfo?.starting_batch) {
      alert("Please select an LST Batch first.");
      return;
    }
    try {
      const res = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}toggle-lst-automation/`, {
        lst_batch: automationInfo?.starting_batch,
        is_paused: isPaused
      });
      alert(`✅ ${res.data.message}`);
    } catch (err) {
      alert(`❌ ${err.response?.data?.error || "Failed to toggle automation. Ensure the schedule exists."}`);
    }
  };

  const scheduleClass = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      // 1. Dynamically search for the strict Cohort UUID using your project's apiClient
      const cohortRes = await apiClient.get('/api/cohorts/');
      const cohortData = cohortRes.data;
      const allCohorts = Array.isArray(cohortData?.results) ? cohortData.results : (Array.isArray(cohortData) ? cohortData : []);

      const typedGroup = request.groupName.trim().toLowerCase();
      const matchedCohort = allCohorts.find(c =>
        (c.name?.toLowerCase() === typedGroup || c.code?.toLowerCase() === typedGroup || c.batch_name?.toLowerCase() === typedGroup)
      );

      // 2. Get the valid User UUID safely
      const currentUser = JSON.parse(localStorage.getItem("user") || '{}');
      let currentUserId = currentUser.id || currentUser.pk || currentUser.user_id;

      if (!currentUserId || currentUserId === 1) {
        const usersRes = await apiClient.get('/api/users/');
        const usersData = usersRes.data;
        const usersList = Array.isArray(usersData?.results) ? usersData.results : (Array.isArray(usersData) ? usersData : []);
        const validUser = usersList.find(u => u.email === currentUser.email) || usersList[0];
        currentUserId = validUser?.id;
      }

      const finalGroupName = request.groupName ? request.groupName.trim().toUpperCase() : "";

      const formattedData = {
        title: `${request.sessionType} Session - ${finalGroupName || automationInfo?.starting_batch || 'General'}`.toUpperCase(),
        class_date: request.startTime.split("T")[0],
        start_time: request.startTime.split("T")[1] + ":00",
        end_time: request.endTime.split("T")[1] + ":00",
        conducted_by: currentUserId,
        cohort: matchedCohort ? matchedCohort.id : null,
        attendees: [],
        notes: request.guestEmails.length > 0 ? `Whitelisted Guests: ${request.guestEmails.join(", ")}` : "",
        session_type: request.sessionType,
        group_name: finalGroupName,
        stream_id: request.streamId,
        lst_batch: automationInfo?.starting_batch,
        guest_emails: request.guestEmails
      };

      let res;
      if (request.sessionType === "LST") {
        res = await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}generate-lst/`, {
          lst_batch: automationInfo?.starting_batch,
          class_date: request.startTime.split("T")[0],
          start_time: request.startTime.split("T")[1] + ":00",
          end_time: request.endTime.split("T")[1] + ":00",
          title: request.title,
          guest_emails: request.guestEmails
        });
      } else {
        res = await attendanceService.scheduleSession(formattedData);
      }

      const expectedCount = res?.data?.expected_attendees_count || res?.expected_attendees_count || 0;
      setSuccessMessage(`Live class scheduled! Expected Attendees: ${expectedCount}`);

      // 🚨 INSTANT UI UPDATE: Push the newly created class directly into the state
      const newSession = res?.data || res;
      const resolvedId = newSession?.id || newSession?.session_id; // Fix for LST returning session_id instead of id
      if (newSession && resolvedId) {
        newSession.id = resolvedId; // Ensure ID is mapped correctly for React keys
        setActiveAdminClasses(prev => [newSession, ...prev]);
      } else {
        loadActiveClasses(); // Fallback if backend doesn't return the object
      }

      setRequest({
        sessionType: "Domain",
        streamId: "",
        groupName: "",
        lstBatchNumber: "",
        startTime: "",
        endTime: "",
        guestEmails: [],
        title: "",
      });
    } catch (err) {
      if (err.customError) {
        setErrorMessage(err.customError);
      } else if (err.response?.status === 403) {
        setErrorMessage("Permission Denied: You are not authorized to schedule this type of class.");
      } else if (err.response?.status === 400) {
        const serverError = err.response.data ? JSON.stringify(err.response.data) : "Bad Request";
        setErrorMessage(`Validation Error: ${serverError}`);
      } else {
        setErrorMessage("An unexpected network error occurred while scheduling.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Schedule Live Class</h1>
          <p className="premium-subtitle">Configure automated Google Meets for Domains, LST, or Celebrations.</p>
        </div>
      </div>

      <div className="premium-glass-card premium-card-large">
        {successMessage && <div className="premium-alert-success">✅ {successMessage}</div>}
        {errorMessage && <div className="premium-alert-error">❌ {errorMessage}</div>}

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <button 
            onClick={() => setActiveTab("MANUAL")} 
            className={`premium-btn ${activeTab === "MANUAL" ? "premium-btn-primary" : "premium-btn-secondary"}`}
          >
            Manual Live Class
          </button>
          <button 
            onClick={() => setActiveTab("AUTO")} 
            className={`premium-btn ${activeTab === "AUTO" ? "premium-btn-primary" : "premium-btn-secondary"}`}
          >
            Automatic LST Schedule
          </button>
        </div>

        {activeTab === "AUTO" && (
          <div className="premium-form">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Automate LST Meetings</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Automatically generate LST meetings every Sunday.
              Batch 1 and Batch 2 will alternate automatically.
            </p>

            {automationInfo?.configured && (
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#047857' }}>✅ Automation is Currently Active</h3>
                <ul style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, paddingLeft: '20px' }}>
                  <li>First Sunday: <strong>{automationInfo.first_sunday}</strong></li>
                  <li>Starting Batch: <strong>{automationInfo.starting_batch === "BATCH_1" ? "Batch 1" : "Batch 2"}</strong></li>
                  <li>Time: <strong>{automationInfo.start_time} - {automationInfo.end_time}</strong></li>
                  <li>Status: <strong>{automationInfo.is_paused ? "⏸️ PAUSED" : "▶️ RUNNING"}</strong></li>
                </ul>
                <div style={{ marginTop: '1rem' }}>
                  {automationInfo.is_paused ? (
                    <button type="button" onClick={() => handleToggleGlobalAutomation(false)} className="premium-btn premium-btn-primary">▶️ Resume Automation</button>
                  ) : (
                    <button type="button" onClick={() => handleToggleGlobalAutomation(true)} className="premium-btn premium-btn-secondary">⏸️ Pause Automation</button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSetupAutomation}>
              <div className="premium-grid-2" style={{ marginBottom: '1rem' }}>
                <div>
                  <label className="premium-label">First Sunday Date *</label>
                  <input type="date" value={automationForm.firstSunday} onChange={e => setAutomationForm({...automationForm, firstSunday: e.target.value})} required className="premium-input" />
                </div>
                <div>
                  <label className="premium-label">Starting Batch *</label>
                  <select value={automationForm.startingBatch} onChange={e => setAutomationForm({...automationForm, startingBatch: e.target.value})} className="premium-input">
                    <option value="BATCH_1">Batch 1</option>
                    <option value="BATCH_2">Batch 2</option>
                  </select>
                </div>
              </div>
              <div className="premium-grid-2" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <label className="premium-label">Start Time *</label>
                  <input type="time" value={automationForm.startTime} onChange={e => setAutomationForm({...automationForm, startTime: e.target.value})} required className="premium-input" />
                </div>
                <div>
                  <label className="premium-label">End Time *</label>
                  <input type="time" value={automationForm.endTime} onChange={e => setAutomationForm({...automationForm, endTime: e.target.value})} required className="premium-input" />
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="premium-btn premium-btn-accent" style={{ width: '100%' }}>
                {isLoading ? "Saving..." : "Enable Automation"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "MANUAL" && (
        <form onSubmit={scheduleClass} className="premium-form">
          <div>
            <label className="premium-label">Target Audience (Session Type) *</label>
            <select
              value={request.sessionType}
              onChange={(e) => setRequest({ ...request, sessionType: e.target.value })}
              required
              className={`premium-input ${styles.formInput}`}
            >
              <option value="Domain">Technical Domain (Specific Group)</option>
              <option value="LST">Life Skills Training (Entire Batch)</option>
              <option value="Celebration">Universal Celebration (Everyone)</option>
            </select>
          </div>

          {request.sessionType === "Domain" && (
            <div className={`premium-section premium-grid-2 ${styles.animatedField}`}>
              <div>
                <label className="premium-label">Select Stream *</label>
                <select value={request.streamId} onChange={(e) => setRequest({ ...request, streamId: e.target.value })} required className={`premium-input ${styles.formInput}`}>
                  <option value="">-- Select Stream --</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name || c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="premium-label">Group Code *</label>
                <input type="text" value={request.groupName} onChange={(e) => setRequest({ ...request, groupName: e.target.value })} placeholder="e.g. G16" required className={`premium-input ${styles.formInput}`} style={{ textTransform: "uppercase" }} />
              </div>
            </div>
          )}

          {request.sessionType === "LST" && (
            <div className={`premium-section ${styles.animatedField}`}>
              <div className="premium-grid-2">
                <div>
                  <label className="premium-label">LST Batch Number *</label>
                  <select value={automationInfo?.starting_batch} onChange={(e) => setRequest({ ...request, lstBatchNumber: e.target.value })} required className={`premium-input ${styles.formInput}`}>
                    <option value="">-- Select Batch --</option>
                    <option value="BATCH_1">Batch 1</option>
                    <option value="BATCH_2">Batch 2</option>
                  </select>
                </div>
                <div>
                  <label className="premium-label">Class / Meet Name *</label>
                  <input type="text" value={request.title} onChange={(e) => setRequest({ ...request, title: e.target.value })} placeholder="e.g. VLSI LST — Digital Electronics" required className={`premium-input ${styles.formInput}`} />
                </div>
              </div>

              {automationInfo?.starting_batch && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px dashed rgba(59, 130, 246, 0.3)' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 'bold' }}>🤖 Sunday Automation Controls</p>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Automated Google Meets are generated every Sunday by the Celery worker for this batch. You can pause or resume this background process.</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => handleToggleAutomation(true)} className="premium-btn premium-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>⏸️ Pause Automation</button>
                    <button type="button" onClick={() => handleToggleAutomation(false)} className="premium-btn premium-btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>▶️ Resume Automation</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="premium-section">
              <div className="premium-flex-between" style={{ marginBottom: showGuestInput ? "1rem" : "0" }}>
                <div>
                  <label className="premium-label" style={{ color: "var(--text-primary)", marginBottom: 0 }}>Whitelist Emails (Optional)</label>
                  <p style={{ fontSize: "12px", color: "var(--text-primary)", margin: 0 }}>Add trainers, trustees, or students to bypass the Meet waiting room.</p>
                </div>
                <button type="button" onClick={() => setShowGuestInput(!showGuestInput)} className="premium-btn premium-btn-primary">
                  {showGuestInput ? "Hide" : "+ Add Emails"}
                </button>
              </div>

              {showGuestInput && (
                <div className={styles.animatedField}>
                  <div className="premium-flex-row">
                    <input type="email" value={newGuestEmail} onChange={(e) => setNewGuestEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGuestEmail(e)} placeholder="e.g. rohansir@gmail.com" className="premium-input" style={{ flex: 1 }} />
                    <button type="button" onClick={addGuestEmail} className="premium-btn premium-btn-secondary">Add</button>
                  </div>

                  {request.guestEmails.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem", padding: "0.75rem", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                      {request.guestEmails.map((email, i) => (
                        <span key={i} className="premium-badge-pill">
                          {email}
                          <button type="button" onClick={() => removeGuestEmail(i)} style={{ color: "#ef4444", border: "none", background: "none", cursor: "pointer", fontSize: "16px", fontWeight: "bold", padding: 0 }}>&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          <div className="premium-grid-2">
            <div>
              <label className="premium-label">Start Time *</label>
              <input type="datetime-local" value={request.startTime} onChange={(e) => setRequest({ ...request, startTime: e.target.value })} required className="premium-input" />
            </div>
            <div>
              <label className="premium-label">End Time *</label>
              <input type="datetime-local" value={request.endTime} onChange={(e) => setRequest({ ...request, endTime: e.target.value })} required className="premium-input" />
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem", marginTop: "0.5rem" }}>
            <button type="submit" disabled={isLoading} className={`premium-btn premium-btn-accent ${styles.submitBtn} ${styles.shinyBtn}`} style={{ width: "100%", opacity: isLoading ? 0.7 : 1 }}>
              {isLoading ? "⏳ Generating Secure Link..." : "✨ Schedule & Generate Meet Link"}
            </button>
          </div>
        </form>
        )}
      </div>

      {/* 🚨 ADMIN LIVE RADAR UI 🚨 */}
      <div className="premium-section" style={{ marginTop: "3rem" }}>
        <h2 className="premium-title" style={{ marginBottom: "1.5rem" }}>📡 Live Class Radar</h2>

        <div className={`premium-form ${styles.radarContainer}`}>
          {activeAdminClasses.map(cls => (
            <div key={cls.id} className={`premium-card ${styles.animatedCard}`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div className="premium-flex-between">
                <div>
                  <h3 style={{ margin: "0 0 5px 0", color: "var(--text-primary)", fontSize: "1.2rem" }}>{cls.title}</h3>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px" }}>
                    Generated by: <strong>{cls.generator_info || "Admin/Mentor"}</strong> |
                    Attendees Expected: <strong>{cls.total_attendee_count || cls.actual_student_count || 0}</strong>
                    <span style={{ fontSize: "12px", marginLeft: "8px", color: "var(--text-muted)" }}>
                      (Students: {cls.actual_student_count || 0}, Whitelisted: {cls.whitelist_email_count || 0})
                    </span>
                  </p>

                  {/* Hide standard time display if currently editing */}
                  {editingClassId !== cls.id && (
                    <p style={{ margin: "5px 0 0 0", color: "var(--primary-color)", fontSize: "13px", fontWeight: "bold" }}>
                      ⏱️ Scheduled: {new Date(cls.class_date + "T" + cls.start_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>

                <div className="premium-flex-row">
                  {editingClassId !== cls.id ? (
                    <>
                      <button onClick={() => { setManagingClassId(managingClassId === cls.id ? null : cls.id); setNewWhitelistEmail(""); }} className="premium-btn premium-btn-secondary" style={{ backgroundColor: managingClassId === cls.id ? "rgba(255,255,255,0.1)" : "" }}>
                        👥 Manage Attendees
                      </button>
                      <button onClick={() => handleStartEdit(cls)} className="premium-btn premium-btn-secondary">
                        ✏️ Reschedule
                      </button>
                      <button onClick={() => window.open(cls.meeting_link?.startsWith('http') ? cls.meeting_link : `https://${cls.meeting_link}`, '_blank')} disabled={!cls.meeting_link} className="premium-btn premium-btn-primary">
                        👁️ Spectate
                      </button>
                      <button onClick={() => handleForceEndClass(cls.id)} className="premium-btn premium-btn-danger">
                        🛑 End Class
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingClassId(null)} className="premium-btn premium-btn-secondary">
                        Cancel
                      </button>
                      <button onClick={() => handleSaveReschedule(cls.id)} className="premium-btn premium-btn-accent">
                        💾 Save Changes
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 🚨 Inline Editor UI */}
              {editingClassId === cls.id && (
                <div className={styles.animatedField} style={{ background: 'var(--bg-nested)', padding: '1rem', borderRadius: '8px', display: 'flex', gap: '1rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ flex: 1 }}>
                    <label className="premium-label" style={{ fontSize: '12px' }}>New Start Time</label>
                    <input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className={`premium-input ${styles.formInput}`} style={{ minHeight: '40px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="premium-label" style={{ fontSize: '12px' }}>New End Time</label>
                    <input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className={`premium-input ${styles.formInput}`} style={{ minHeight: '40px' }} />
                  </div>
                </div>
              )}

              {/* 🚨 Inline Manage Attendees UI */}
              {managingClassId === cls.id && (
                <div className={styles.animatedField} style={{ background: 'var(--bg-nested)', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-color)' }}>
                  <div className="premium-flex-between">
                    <h4 style={{ margin: 0, color: "var(--text-primary)" }}>Whitelist Additional Emails</h4>
                    <span className="premium-badge-pill" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      Total Whitelisted: {cls.whitelist_email_count || 0}
                    </span>
                  </div>
                  
                  <div className="premium-flex-row">
                    <input 
                      type="email" 
                      value={newWhitelistEmail} 
                      onChange={(e) => setNewWhitelistEmail(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleAddWhitelistEmail(cls)} 
                      placeholder="e.g. guest@example.com" 
                      className={`premium-input ${styles.formInput}`} 
                      style={{ flex: 1, minHeight: '40px' }} 
                      disabled={isAddingWhitelist}
                    />
                    <button 
                      onClick={() => handleAddWhitelistEmail(cls)} 
                      disabled={isAddingWhitelist || !newWhitelistEmail} 
                      className="premium-btn premium-btn-accent"
                    >
                      {isAddingWhitelist ? "Adding..." : "+ Add to Calendar"}
                    </button>
                  </div>
                  
                  {cls.guest_emails && cls.guest_emails.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Currently Whitelisted:</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {cls.guest_emails.map((email, i) => (
                          <span key={i} className="premium-badge-pill" style={{ fontSize: '12px', padding: '4px 8px' }}>
                            {email}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          ))}
          {activeAdminClasses.length === 0 && (
            <div className={styles.sleekEmptyState}>
              <div className={styles.sleekEmptyStateIcon}>📡</div>
              <div className={styles.sleekEmptyStateText}>
                <h3>No Active Classes</h3>
                <p>No active classes generated yet.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScheduleClass;