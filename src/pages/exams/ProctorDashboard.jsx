import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import {
  assignProctor,
  assignModuleTestProctor,
  configureProctoring,
  configureModuleTestProctoring,
  getProctoringRooms,
  getModuleTestProctoringRooms,
} from "../../services/examService";
import JitsiExamRoom from "../../components/exams/JitsiExamRoom";
import styles from "./ProctorDashboard.module.css";

const apiError = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.detail || error?.response?.data?.message || fallback;

function ProctorDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [assessmentType, setAssessmentType] = useState("PRESCREENING");
  const [exams, setExams] = useState([]);
  const [moduleTests, setModuleTests] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [examId, setExamId] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomCount, setRoomCount] = useState(4);
  const [capacity, setCapacity] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [streamData, setStreamData] = useState({ active_attempts: [], recent_events: [], total_active: 0 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actionBusy, setActionBusy] = useState("");

  const fetchLiveStream = useCallback(async () => {
    try {
      const response = await apiClient.get("/api/exams/live-proctor-stream/");
      setStreamData(response.data || { active_attempts: [], recent_events: [], total_active: 0 });
    } catch (err) {
      console.warn("Live proctor stream poll note:", err);
    }
  }, []);

  useEffect(() => {
    fetchLiveStream();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLiveStream, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLiveStream]);

  const handleDisqualify = async (attemptId, studentName) => {
    if (!window.confirm(`Are you sure you want to DISQUALIFY ${studentName}? This will immediately terminate their exam attempt with 0 marks.`)) {
      return;
    }
    setActionBusy(attemptId);
    try {
      await apiClient.post(`/api/exams/${attemptId}/disqualify-attempt/`);
      await fetchLiveStream();
      alert(`Candidate ${studentName} has been disqualified.`);
    } catch (err) {
      alert(err?.response?.data?.error || "Failed to disqualify candidate.");
    } finally {
      setActionBusy("");
    }
  };

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case "TAB_SWITCH": return { label: "Tab Switch", bg: "#fee2e2", color: "#dc2626" };
      case "WINDOW_BLUR": return { label: "Window Unfocused", bg: "#fef3c7", color: "#d97706" };
      case "FULLSCREEN_EXIT": return { label: "Exited Fullscreen", bg: "#f3e8ff", color: "#9333ea" };
      case "DISQUALIFIED_BY_PROCTOR": return { label: "Disqualified", bg: "#fecaca", color: "#7f1d1d" };
      default: return { label: eventType || "Notice", bg: "#dbeafe", color: "#2563eb" };
    }
  };

  const loadRooms = useCallback(async (assessmentId, type = assessmentType) => {
    if (!assessmentId) return;
    try {
      setError("");
      const data = type === "MODULE_TEST"
        ? await getModuleTestProctoringRooms(assessmentId)
        : await getProctoringRooms(assessmentId);
      setRoomData(data);
      setSelectedRoomId((current) =>
        data.rooms.some((room) => room.id === current) ? current : data.rooms[0]?.id || ""
      );
    } catch (loadError) {
      setRoomData(null);
      setError(apiError(loadError, "Unable to load assigned proctoring rooms."));
    }
  }, [assessmentType]);

  useEffect(() => {
    const loadList = (endpoint) => apiClient
      .get(endpoint, { params: { page_size: 200 } })
      .then((response) => normalizeListResponse(response.data));

    Promise.all([
      loadList(API_ENDPOINTS.EXAMS.BASE),
      loadList(API_ENDPOINTS.MODULE_TESTS.BASE),
      loadList(API_ENDPOINTS.COURSES.BASE),
      loadList(API_ENDPOINTS.COHORTS.BASE),
      isAdmin ? loadList(API_ENDPOINTS.USERS.BASE) : Promise.resolve([]),
    ])
      .then(([rows, moduleRows, courseRows, cohortRows, userRows]) => {
        setExams(rows);
        setModuleTests(moduleRows);
        setCourses(courseRows);
        setCohorts(cohortRows);
        setStaff(userRows.filter((member) => ["ADMIN", "MENTOR", "VOLUNTEER", "TRUSTEE"].includes(member.role)));
        if (rows[0]?.course_id) setCourseId(String(rows[0].course_id));
      })
      .catch((loadError) => setError(apiError(loadError, "Unable to load the proctor dashboard.")));
  }, [isAdmin]);

  const courseOptions = useMemo(() => {
    const rows = assessmentType === "MODULE_TEST" ? moduleTests : exams;
    const courseIds = new Set(rows.map((assessment) => String(assessment.course_id || assessment.course || "")).filter(Boolean));
    return courses.filter((course) => courseIds.has(String(course.id)));
  }, [assessmentType, courses, exams, moduleTests]);

  const cohortOptions = useMemo(() => {
    const source = assessmentType === "MODULE_TEST" ? moduleTests : exams;
    const matchingAssessments = source.filter((assessment) => String(assessment.course_id || assessment.course) === String(courseId));
    const cohortIds = new Set(matchingAssessments.map((assessment) => String(assessment.cohort_id || assessment.cohort || "")).filter(Boolean));
    const rows = cohorts.filter((cohort) => String(cohort.course?.id || cohort.course) === String(courseId) && cohortIds.has(String(cohort.id)));
    if (assessmentType === "PRESCREENING") {
      return [{ id: "unassigned", code: "PRE-SCREENING", name: "Candidates awaiting cohort assignment" }, ...rows];
    }
    return matchingAssessments.some((test) => !test.cohort)
      ? [{ id: "course-wide", code: "COURSE-WIDE", name: "All active cohorts in this course" }, ...rows]
      : rows;
  }, [assessmentType, cohorts, courseId, exams, moduleTests]);

  const examOptions = useMemo(() => {
    const source = assessmentType === "MODULE_TEST" ? moduleTests : exams;
    return source.filter((assessment) => {
      if (String(assessment.course_id || assessment.course) !== String(courseId)) return false;
      const assignedCohort = assessment.cohort_id || assessment.cohort;
      if (cohortId === "unassigned" || cohortId === "course-wide") return !assignedCohort;
      return String(assignedCohort || "") === String(cohortId);
    });
  }, [assessmentType, cohortId, courseId, exams, moduleTests]);

  useEffect(() => {
    const nextCohort = cohortOptions.some((cohort) => String(cohort.id) === String(cohortId)) ? cohortId : String(cohortOptions[0]?.id || "");
    if (nextCohort !== cohortId) setCohortId(nextCohort);
  }, [cohortId, cohortOptions]);

  useEffect(() => {
    const nextExam = examOptions.some((exam) => String(exam.id) === String(examId)) ? examId : String(examOptions[0]?.id || "");
    if (nextExam !== examId) setExamId(nextExam);
  }, [examId, examOptions]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadRooms(examId), 0);
    return () => window.clearTimeout(timer);
  }, [examId, loadRooms]);

  const selectedRoom = useMemo(
    () => roomData?.rooms?.find((room) => room.id === selectedRoomId),
    [roomData, selectedRoomId]
  );
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Proctor";
  const jitsiSession = selectedRoom
    ? {
        enabled: true,
        domain: roomData.domain,
        room_code: selectedRoom.code,
        room_name: selectedRoom.room_name,
        room_password: selectedRoom.room_password,
        display_name: `${displayName} (Proctor)`,
      }
    : null;

  const configure = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const configureAssessment = assessmentType === "MODULE_TEST" ? configureModuleTestProctoring : configureProctoring;
      await configureAssessment(examId, {
        proctoring_enabled: true,
        proctoring_required: true,
        proctoring_room_count: Number(roomCount),
        proctoring_capacity_per_room: Number(capacity),
      });
      await loadRooms(examId);
    } catch (configurationError) {
      setError(apiError(configurationError, "Unable to configure proctoring rooms."));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (roomId, proctorId) => {
    setBusy(true);
    try {
      const assignAssessmentProctor = assessmentType === "MODULE_TEST" ? assignModuleTestProctor : assignProctor;
      await assignAssessmentProctor(examId, { room_id: roomId, proctor_id: proctorId || null });
      await loadRooms(examId);
    } catch (assignmentError) {
      setError(apiError(assignmentError, "Unable to assign this proctor."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <header><h1>Embedded Exam Proctoring</h1><p>Open only the persisted rooms assigned by Django. Candidate connection state updates from exam telemetry.</p></header>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.controls}>
        <label>Assessment Type<select value={assessmentType} onChange={(event) => { setAssessmentType(event.target.value); setCourseId(""); setCohortId(""); setExamId(""); setRoomData(null); }}><option value="PRESCREENING">Pre-Screening Exam</option><option value="MODULE_TEST">Module Test</option></select></label>
        <label>Student Course<select value={courseId} onChange={(event) => { setCourseId(event.target.value); setRoomData(null); }}><option value="">Select course</option>{courseOptions.map((course) => <option key={course.id} value={course.id}>{course.name || course.code}</option>)}</select></label>
        <label>Cohort / Candidate Group<select value={cohortId} onChange={(event) => { setCohortId(event.target.value); setRoomData(null); }} disabled={!courseId}><option value="">Select cohort</option>{cohortOptions.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code}{cohort.name ? ` · ${cohort.name}` : ""}</option>)}</select></label>
        <label>{assessmentType === "MODULE_TEST" ? "Module Test" : "Exam"}<select value={examId} onChange={(event) => setExamId(event.target.value)} disabled={!cohortId}><option value="">Select assessment</option>{examOptions.map((exam) => <option key={exam.id} value={exam.id}>{exam.title || exam.application_number || exam.id} · {exam.module_name || exam.student_name || exam.status || "Ready"}</option>)}</select></label>
        {isAdmin && <form onSubmit={configure}><label>Rooms<input type="number" min="1" max="26" value={roomCount} onChange={(event) => setRoomCount(event.target.value)} /></label><label>Planning limit / room<input type="number" min="1" max="500" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label><button disabled={!examId || busy}>Create/update rooms</button></form>}
      </div>

      {roomData && (
        <div className={styles.workspace}>
          <aside>
            <h2>{roomData.course_name}</h2>
            {roomData.rooms.map((room) => (
              <button key={room.id} className={room.id === selectedRoomId ? styles.activeRoom : ""} onClick={() => setSelectedRoomId(room.id)}>
                <strong>Room {room.code}</strong><span>{room.assigned_candidates?.length || 0} assigned · {room.active_attempts.length} live / {room.capacity} capacity · {room.assigned_proctor_email || "Unassigned"}</span>
              </button>
            ))}
          </aside>
          <main>
            {selectedRoom ? (
              <>
                {isAdmin && <label className={styles.assign}>Assigned proctor<select value={selectedRoom.assigned_proctor || ""} onChange={(event) => assign(selectedRoom.id, event.target.value)} disabled={busy}><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.email} · {member.role}</option>)}</select></label>}
                
                {/* Jitsi Exam Room */}
                <JitsiExamRoom session={jitsiSession} mode="proctor" />
                
                <div className={styles.candidates}>
                  <h3>Candidate connections</h3>
                  {selectedRoom.active_attempts.map((attempt) => (
                    <div key={attempt.attempt_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span><strong>{attempt.student_code}</strong> · {attempt.student_name}</span>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <em>{attempt.proctoring_status} · {attempt.attempt_status}</em>
                        {isAdmin && attempt.attempt_status !== "SUBMITTED" && attempt.attempt_status !== "DISQUALIFIED" && (
                          <button
                            onClick={() => handleDisqualify(attempt.attempt_id, attempt.student_name)}
                            disabled={actionBusy === attempt.attempt_id}
                            style={{ padding: "4px 8px", background: "#fee2e2", color: "#dc2626", border: "1px solid #f87171", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                          >
                            {actionBusy === attempt.attempt_id ? "..." : "Disqualify"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!selectedRoom.active_attempts.length && <p>No candidate has started in this room.</p>}

                  <h3>Assigned candidate roster</h3>
                  {(selectedRoom.assigned_candidates || []).map((candidate) => <div key={candidate.student_id}><span><strong>{candidate.student_code}</strong> · {candidate.student_name}</span><em>{candidate.has_started ? candidate.proctoring_status : "NOT STARTED"}</em></div>)}
                  {!selectedRoom.assigned_candidates?.length && <p>No candidates have been pre-assigned. Use Django admin’s bulk room action.</p>}
                </div>
              </>
            ) : <p>No active room is available.</p>}
          </main>
        </div>
      )}

      {/* Global Telemetry Feed (Only visible if polling active stream) */}
      {streamData?.recent_events?.length > 0 && (
        <div style={{ marginTop: "30px", padding: "20px", background: "var(--bg-surface)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-primary)" }}>Real-Time Cheating & Infraction Incident Stream</h3>
            <label style={{ fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-Refresh (3s)
            </label>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--bg-nested)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                <th style={{ padding: "12px", color: "var(--text-secondary)" }}>Time</th>
                <th style={{ padding: "12px", color: "var(--text-secondary)" }}>Candidate</th>
                <th style={{ padding: "12px", color: "var(--text-secondary)" }}>Infraction Event</th>
              </tr>
            </thead>
            <tbody>
              {streamData.recent_events.map((event, idx) => {
                const badge = getEventBadge(event.event_type);
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{new Date(event.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding: "10px 12px", fontWeight: "600" }}>{event.student_name} <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: "normal" }}>({event.student_code})</span></td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "600", background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ProctorDashboard;
