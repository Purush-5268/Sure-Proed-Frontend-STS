import { useState, useEffect, useMemo } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./ScheduleExamModal.module.css";
import { FiCalendar, FiClock, FiVideo, FiShield, FiFileText, FiCheckCircle } from "react-icons/fi";

function formatDateTimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

export default function ScheduleExamModal({ isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState("SCREENING"); // "SCREENING" | "MODULE_TEST"
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Data lists
  const [cohorts, setCohorts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [questionBanks, setQuestionBanks] = useState([]);

  // Default times: Tomorrow 10:00 AM to 11:00 AM
  const defaultStartTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return formatDateTimeLocal(d);
  }, []);

  const defaultEndTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    return formatDateTimeLocal(d);
  }, []);

  // Form State: Screening Exam
  const [screeningForm, setScreeningForm] = useState({
    cohort_id: "",
    question_bank_id: "",
    scheduled_at: defaultStartTime,
    end_time: defaultEndTime,
    pass_percentage: 40,
  });

  // Form State: Module Test
  const [moduleForm, setModuleForm] = useState({
    course_id: "",
    cohort_id: "",
    title: "",
    question_bank_id: "",
    level: "MIXED",
    total_questions: 10,
    duration_minutes: 45,
    pass_percentage: 60,
    scheduled_at: defaultStartTime,
    end_time: defaultEndTime,
    is_released: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoadingInitial(true);
    setError("");

    async function fetchData() {
      try {
        const [cohortsRes, coursesRes, qbRes] = await Promise.all([
          apiClient.get("/api/cohorts/?page_size=200").catch(() => ({ data: [] })),
          apiClient.get("/api/courses/?page_size=200").catch(() => ({ data: [] })),
          apiClient.get("/api/question-banks/?page_size=200").catch(() => ({ data: [] })),
        ]);

        if (isMounted) {
          const rawCohorts = Array.isArray(cohortsRes.data)
            ? cohortsRes.data
            : cohortsRes.data?.results || [];
          const rawCourses = Array.isArray(coursesRes.data)
            ? coursesRes.data
            : coursesRes.data?.results || [];
          const rawQBs = Array.isArray(qbRes.data)
            ? qbRes.data
            : qbRes.data?.results || [];

          setCohorts(rawCohorts);
          setCourses(rawCourses);
          setQuestionBanks(rawQBs);

          // Preselect first cohort if available
          if (rawCohorts.length > 0 && !screeningForm.cohort_id) {
            setScreeningForm((prev) => ({ ...prev, cohort_id: rawCohorts[0].id }));
          }
          if (rawCourses.length > 0 && !moduleForm.course_id) {
            setModuleForm((prev) => ({ ...prev, course_id: rawCourses[0].id }));
          }
        }
      } catch (err) {
        console.error("Failed to load initial scheduling metadata:", err);
        if (isMounted) setError("Failed to load available cohorts and question banks.");
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Selected Cohort for Screening
  const selectedScreeningCohort = useMemo(() => {
    return cohorts.find((c) => String(c.id) === String(screeningForm.cohort_id));
  }, [cohorts, screeningForm.cohort_id]);

  // Filtered Question Banks for Screening
  const screeningQuestionBanks = useMemo(() => {
    const courseId = selectedScreeningCohort?.course_id || (typeof selectedScreeningCohort?.course === 'object' ? selectedScreeningCohort?.course?.id : selectedScreeningCohort?.course);
    return questionBanks.filter((qb) => {
      const isPrescreen = qb.bank_type === "PRESCREENING" || !qb.bank_type;
      const isApproved = qb.status === "APPROVED" || !qb.status;
      if (!courseId) return isPrescreen && isApproved;
      const qbCourseId = typeof qb.course === 'object' ? qb.course?.id : qb.course;
      return isPrescreen && isApproved && (!qbCourseId || String(qbCourseId) === String(courseId));
    });
  }, [questionBanks, selectedScreeningCohort]);

  // Filtered Question Banks for Module Test
  const moduleQuestionBanks = useMemo(() => {
    return questionBanks.filter((qb) => {
      if (!moduleForm.course_id) return true;
      const qbCourseId = typeof qb.course === 'object' ? qb.course?.id : qb.course;
      return !qbCourseId || String(qbCourseId) === String(moduleForm.course_id);
    });
  }, [questionBanks, moduleForm.course_id]);

  // Cohorts filtered for Module Test course
  const moduleFilteredCohorts = useMemo(() => {
    if (!moduleForm.course_id) return cohorts;
    return cohorts.filter((c) => {
      const cCourseId = typeof c.course === 'object' ? c.course?.id : c.course;
      return String(cCourseId) === String(moduleForm.course_id);
    });
  }, [cohorts, moduleForm.course_id]);

  // Handle Screening Submit
  const handleScreeningSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!screeningForm.cohort_id) {
      setError("Please select a cohort to schedule the screening exam.");
      return;
    }
    if (!screeningForm.question_bank_id) {
      setError("Please select an approved Question Bank.");
      return;
    }

    const start = new Date(screeningForm.scheduled_at);
    const end = new Date(screeningForm.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError("Please specify valid start and end dates/times.");
      return;
    }
    if (end <= start) {
      setError("Exam end time must be after the scheduled start time.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        question_bank_id: screeningForm.question_bank_id,
        scheduled_at: start.toISOString(),
        end_time: end.toISOString(),
        pass_percentage: Number(screeningForm.pass_percentage) || 40,
      };

      const res = await apiClient.post(
        API_ENDPOINTS.COHORTS.SCHEDULE_SCREENING(screeningForm.cohort_id),
        payload
      );

      const msg = res.data?.message || "Screening Examination scheduled successfully!";
      alert(`✅ ${msg}${res.data?.meeting_link ? `\nGoogle Meet: ${res.data.meeting_link}` : ""}`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to schedule cohort screening:", err);
      const errDetail =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Failed to schedule screening examination.";
      setError(errDetail);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Module Test Submit
  const handleModuleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!moduleForm.course_id) {
      setError("Please select a course for the module test.");
      return;
    }
    if (!moduleForm.title.trim()) {
      setError("Please enter a title for this module test.");
      return;
    }

    const start = new Date(moduleForm.scheduled_at);
    const end = new Date(moduleForm.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError("Please specify valid start and end dates/times.");
      return;
    }
    if (end <= start) {
      setError("Module test end time must be after the scheduled start time.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: moduleForm.title.trim(),
        course: moduleForm.course_id,
        cohort: moduleForm.cohort_id || null,
        level: moduleForm.level,
        total_questions: Number(moduleForm.total_questions) || 10,
        duration_minutes: Number(moduleForm.duration_minutes) || 45,
        pass_percentage: Number(moduleForm.pass_percentage) || 60,
        scheduled_at: start.toISOString(),
        end_time: end.toISOString(),
        is_released: Boolean(moduleForm.is_released),
      };
      if (moduleForm.question_bank_id) {
        payload.question_bank = moduleForm.question_bank_id;
      }

      await apiClient.post(API_ENDPOINTS.MODULE_TESTS.BASE, payload);
      alert("✅ Module Test scheduled and synchronized successfully!");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to schedule module test:", err);
      const errDetail =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        "Failed to schedule module test.";
      setError(errDetail);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.titleGroup}>
            <h2>
              <FiCalendar style={{ color: "var(--primary-color)" }} />
              Schedule Examination
            </h2>
            <p>Deploy synchronized screening assessments and cohort module tests.</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "SCREENING" ? styles.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("SCREENING");
              setError("");
            }}
          >
            <FiShield /> Cohort Screening Exam
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "MODULE_TEST" ? styles.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("MODULE_TEST");
              setError("");
            }}
          >
            <FiFileText /> Cohort Module Test
          </button>
        </div>

        {/* Form Container */}
        <div className={styles.form}>
          {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

          {/* TAB 1: COHORT SCREENING EXAM */}
          {activeTab === "SCREENING" && (
            <form onSubmit={handleScreeningSubmit}>
              <div className={styles.infoBanner}>
                <FiVideo style={{ fontSize: "1.2rem", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Automated Synchronization:</strong> Scheduling this screening creates
                  official Pre-Screening records for all applied candidates in this cohort, provisions a
                  synchronized Google Meet proctoring session, and automatically dispatches portal alerts.
                </div>
              </div>

              <div className={styles.formGrid}>
                {/* Select Cohort */}
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label htmlFor="screeningCohort">
                    Select Target Cohort <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="screeningCohort"
                    className={styles.select}
                    value={screeningForm.cohort_id}
                    onChange={(e) =>
                      setScreeningForm((prev) => ({
                        ...prev,
                        cohort_id: e.target.value,
                        question_bank_id: "",
                      }))
                    }
                    required
                    disabled={loadingInitial}
                  >
                    <option value="">-- Choose an active cohort --</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code || "Cohort"}) — {c.course?.name || c.course_title || "Course"}
                      </option>
                    ))}
                  </select>
                  <span className={styles.helpText}>
                    Only applicants who applied for this cohort will be included in the test session.
                  </span>
                </div>

                {/* Select Question Bank */}
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label htmlFor="screeningQb">
                    Approved Question Bank <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="screeningQb"
                    className={styles.select}
                    value={screeningForm.question_bank_id}
                    onChange={(e) =>
                      setScreeningForm((prev) => ({ ...prev, question_bank_id: e.target.value }))
                    }
                    required
                    disabled={loadingInitial}
                  >
                    <option value="">-- Choose question bank --</option>
                    {screeningQuestionBanks.map((qb) => (
                      <option key={qb.id} value={qb.id}>
                        {qb.title} (Sets: {Array.isArray(qb.set_codes) ? qb.set_codes.join(", ") : "A"})
                      </option>
                    ))}
                  </select>
                  {screeningQuestionBanks.length === 0 && (
                    <span className={styles.helpText} style={{ color: "#d97706" }}>
                      ⚠️ No approved pre-screening question banks found for this track. Please generate one in Question Banks.
                    </span>
                  )}
                </div>

                {/* Scheduled Start Time */}
                <div className={styles.formGroup}>
                  <label htmlFor="screeningStart">
                    Scheduled Start Time <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="screeningStart"
                    type="datetime-local"
                    className={styles.input}
                    value={screeningForm.scheduled_at}
                    onChange={(e) =>
                      setScreeningForm((prev) => ({ ...prev, scheduled_at: e.target.value }))
                    }
                    required
                  />
                  <span className={styles.helpText}>Date & time window opens for candidates.</span>
                </div>

                {/* Scheduled End Time */}
                <div className={styles.formGroup}>
                  <label htmlFor="screeningEnd">
                    Scheduled End Time <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="screeningEnd"
                    type="datetime-local"
                    className={styles.input}
                    value={screeningForm.end_time}
                    onChange={(e) =>
                      setScreeningForm((prev) => ({ ...prev, end_time: e.target.value }))
                    }
                    required
                  />
                  <span className={styles.helpText}>Window closure and submission cutoff.</span>
                </div>

                {/* Pass Percentage */}
                <div className={styles.formGroup}>
                  <label htmlFor="screeningPassPct">
                    Passing Benchmark (%) <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="screeningPassPct"
                    type="number"
                    min="1"
                    max="100"
                    className={styles.input}
                    value={screeningForm.pass_percentage}
                    onChange={(e) =>
                      setScreeningForm((prev) => ({ ...prev, pass_percentage: e.target.value }))
                    }
                    required
                  />
                  <span className={styles.helpText}>Default threshold is 40%.</span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={submitting || loadingInitial}
                >
                  {submitting ? "Scheduling..." : "🚀 Schedule & Notify Cohort"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: COHORT MODULE TEST */}
          {activeTab === "MODULE_TEST" && (
            <form onSubmit={handleModuleSubmit}>
              <div className={styles.infoBanner}>
                <FiClock style={{ fontSize: "1.2rem", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>Course Progression Assessment:</strong> Schedule a module test for an active
                  cohort or across the course. A Google Meet link is automatically provisioned for
                  live proctoring if start and end times are supplied.
                </div>
              </div>

              <div className={styles.formGrid}>
                {/* Select Course */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleCourse">
                    Target Course <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="moduleCourse"
                    className={styles.select}
                    value={moduleForm.course_id}
                    onChange={(e) =>
                      setModuleForm((prev) => ({
                        ...prev,
                        course_id: e.target.value,
                        cohort_id: "",
                        question_bank_id: "",
                      }))
                    }
                    required
                    disabled={loadingInitial}
                  >
                    <option value="">-- Choose Course --</option>
                    {courses.map((crs) => (
                      <option key={crs.id} value={crs.id}>
                        {crs.name || crs.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Cohort */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleCohort">Cohort (Optional)</label>
                  <select
                    id="moduleCohort"
                    className={styles.select}
                    value={moduleForm.cohort_id}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, cohort_id: e.target.value }))
                    }
                    disabled={loadingInitial}
                  >
                    <option value="">-- All Active Cohorts (Course-wide) --</option>
                    {moduleFilteredCohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code || "Cohort"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label htmlFor="moduleTitle">
                    Assessment Title <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="moduleTitle"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Module 1: Core Fundamentals & Practical Code"
                    value={moduleForm.title}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    required
                  />
                </div>

                {/* Question Bank */}
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label htmlFor="moduleQb">Question Bank (Optional)</label>
                  <select
                    id="moduleQb"
                    className={styles.select}
                    value={moduleForm.question_bank_id}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, question_bank_id: e.target.value }))
                    }
                    disabled={loadingInitial}
                  >
                    <option value="">-- Automated or General Assessment --</option>
                    {moduleQuestionBanks.map((qb) => (
                      <option key={qb.id} value={qb.id}>
                        {qb.title} ({qb.bank_type || "Question Bank"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Level */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleLevel">Difficulty Level</label>
                  <select
                    id="moduleLevel"
                    className={styles.select}
                    value={moduleForm.level}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, level: e.target.value }))
                    }
                  >
                    <option value="MIXED">Mixed</option>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </div>

                {/* Duration */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleDuration">Duration (Minutes)</label>
                  <input
                    id="moduleDuration"
                    type="number"
                    min="5"
                    max="180"
                    className={styles.input}
                    value={moduleForm.duration_minutes}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, duration_minutes: e.target.value }))
                    }
                    required
                  />
                </div>

                {/* Total Questions */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleQuestions">Total Questions</label>
                  <input
                    id="moduleQuestions"
                    type="number"
                    min="1"
                    max="100"
                    className={styles.input}
                    value={moduleForm.total_questions}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, total_questions: e.target.value }))
                    }
                    required
                  />
                </div>

                {/* Pass Percentage */}
                <div className={styles.formGroup}>
                  <label htmlFor="modulePassPct">Passing Benchmark (%)</label>
                  <input
                    id="modulePassPct"
                    type="number"
                    min="1"
                    max="100"
                    className={styles.input}
                    value={moduleForm.pass_percentage}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, pass_percentage: e.target.value }))
                    }
                    required
                  />
                </div>

                {/* Scheduled Start Time */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleStart">Scheduled Start Time</label>
                  <input
                    id="moduleStart"
                    type="datetime-local"
                    className={styles.input}
                    value={moduleForm.scheduled_at}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, scheduled_at: e.target.value }))
                    }
                  />
                </div>

                {/* Scheduled End Time */}
                <div className={styles.formGroup}>
                  <label htmlFor="moduleEnd">Scheduled End Time</label>
                  <input
                    id="moduleEnd"
                    type="datetime-local"
                    className={styles.input}
                    value={moduleForm.end_time}
                    onChange={(e) =>
                      setModuleForm((prev) => ({ ...prev, end_time: e.target.value }))
                    }
                  />
                </div>

                {/* Release Gate */}
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={moduleForm.is_released}
                      onChange={(e) =>
                        setModuleForm((prev) => ({ ...prev, is_released: e.target.checked }))
                      }
                    />
                    Release test gate immediately to candidates upon creation
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={submitting || loadingInitial}
                >
                  {submitting ? "Creating..." : "🚀 Schedule Module Test"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
