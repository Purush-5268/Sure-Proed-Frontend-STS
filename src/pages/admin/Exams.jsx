import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Exams.module.css";
import ScheduleExamModal from "./ScheduleExamModal";
import {
  FiCalendar,
  FiVideo,
  FiLock,
  FiUnlock,
  FiPlay,
  FiCheckCircle,
  FiClock,
  FiExternalLink,
  FiSearch,
} from "react-icons/fi";

function Exams() {
  const [exams, setExams] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Tab View Switcher: SESSIONS (student records) | SCHEDULED (active scheduled exams)
  const [activeViewTab, setActiveViewTab] = useState("SESSIONS");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduledList, setScheduledList] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);

  // Form state to update exam configuration
  const [editingDomain, setEditingDomain] = useState("DEFAULT");
  const [durationMins, setDurationMins] = useState(30);
  const [numQuestions, setNumQuestions] = useState(30);
  const [passPct, setPassPct] = useState(60);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(null);

  // Helper to extract candidate initials for avatar
  const getInitials = (nameStr) => {
    if (!nameStr || nameStr === "N/A" || nameStr === "Candidate") return "ST";
    const parts = nameStr.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Helper to clean up raw email addresses
  const cleanEmail = (rawEmail) => {
    if (!rawEmail || rawEmail === "N/A") return "";
    const str = String(rawEmail).trim();
    if (str.includes("@")) return str.toLowerCase();
    if (str.includes("example.com")) {
      const prefix = str.replace("example.com", "").replace(/_[A-Za-z0-9]{3,8}$/, "");
      return `${prefix}@example.com`.toLowerCase();
    }
    return str.toLowerCase();
  };

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const parseList = (resData) => {
        if (!resData) return [];
        if (Array.isArray(resData)) return resData;
        if (resData && Array.isArray(resData.results)) return resData.results;
        return [];
      };

      const [examsRes, repRes, stuRes, crsRes, usersRes, appsRes] = await Promise.all([
        apiClient.get("/api/exams/?page_size=1000").catch(() => null),
        apiClient.get(API_ENDPOINTS.EXAMS.REPORTS).catch(() => null),
        apiClient.get("/api/students/?page_size=1000").catch(() => null),
        apiClient.get("/api/courses/?page_size=1000").catch(() => null),
        apiClient.get("/api/users/?page_size=1000").catch(() => null),
        apiClient.get("/api/applications/?page_size=1000").catch(() => null),
      ]);

      const rawExams = parseList(examsRes?.data);
      const rawReports = parseList(repRes?.data);
      const rawStudents = parseList(stuRes?.data);
      const rawCourses = parseList(crsRes?.data);
      const rawUsers = parseList(usersRes?.data);
      const rawApps = parseList(appsRes?.data);

      const usersMap = {};
      rawUsers.forEach((u) => {
        if (u?.id) usersMap[u.id] = u;
      });

      const studentsMap = {};
      rawStudents.forEach((s) => {
        let uObj = s.user;
        if (typeof uObj === "string" && usersMap[uObj]) uObj = usersMap[uObj];
        if (s?.id) studentsMap[s.id] = { ...s, user: uObj };
      });

      const coursesMap = {};
      rawCourses.forEach((c) => {
        if (c?.id) coursesMap[c.id] = c.name || c.title;
      });

      const appsMap = {};
      rawApps.forEach((a) => {
        let sName = a.student_name;
        let sEmail = cleanEmail(a.student_email);

        if (a.student) {
          const stu = typeof a.student === "object" ? a.student : studentsMap[a.student];
          if (stu && stu.user) {
            const u = typeof stu.user === "object" ? stu.user : usersMap[stu.user];
            if (u) {
              const fn = (u.first_name || "").trim();
              const ln = (u.last_name || "").trim();
              if (fn || ln) sName = `${fn} ${ln}`.trim();
              if (u.email) sEmail = cleanEmail(u.email);
            }
          }
        }

        let cName = a.course_name;
        if (!cName && a.course) {
          cName = typeof a.course === "object" ? a.course.name || a.course.title : coursesMap[a.course];
        }

        if (a?.id) {
          appsMap[a.id] = {
            ...a,
            student_name: sName,
            student_email: sEmail,
            course_name: cName,
          };
        }
      });

      // Master union of exam records
      const masterExamsMap = {};
      rawExams.forEach((e) => {
        if (e?.id) masterExamsMap[e.id] = e;
      });
      rawReports.forEach((e) => {
        if (e?.id) {
          const existing = masterExamsMap[e.id] || {};
          masterExamsMap[e.id] = {
            ...existing,
            ...e,
            student_name: e.student_name || existing.student_name,
            student_email: e.student_email || existing.student_email,
            course_name: e.course_name || existing.course_name,
          };
        }
      });

      const allExamRecords = Object.values(masterExamsMap);

      const hydratedExams = allExamRecords.map((e) => {
        let name = e.student_name;
        let email = cleanEmail(e.student_email);
        let courseName = e.course_name || e.domain;

        if (e.application && appsMap[e.application]) {
          const app = appsMap[e.application];
          if (app.student_name) name = app.student_name;
          if (app.student_email) email = app.student_email;
          if (app.course_name) courseName = app.course_name;
        }

        return {
          ...e,
          candidate_name: name || "Candidate",
          candidate_email: email || "candidate@suretrust.org",
          course_title: courseName || "General Track",
        };
      });

      setExams(hydratedExams);
    } catch (err) {
      console.error("Failed to load exams list:", err);
      setExams([]);
    }

    // Fetch Exam Config List
    try {
      const cfgRes = await apiClient.get(API_ENDPOINTS.EXAMS.CONFIG);
      const cfgData = cfgRes.data;
      const cfgList = Array.isArray(cfgData) ? cfgData : cfgData?.results || [];
      setConfigs(cfgList);

      const defaultConfig = cfgList.find((c) => c.domain === "DEFAULT") || cfgList[0];
      if (defaultConfig) {
        setEditingDomain(defaultConfig.domain || "DEFAULT");
        setDurationMins(defaultConfig.duration_minutes || 30);
        setNumQuestions(defaultConfig.number_of_questions || 30);
        setPassPct(defaultConfig.pass_percentage || 40.0);
      }
    } catch (err) {
      console.warn("Failed to load exam config list:", err);
    }

    setLoading(false);
  }, []);

  const loadScheduledData = useCallback(async () => {
    setLoadingScheduled(true);
    try {
      const [preScreeningsRes, moduleTestsRes, cohortsRes, coursesRes] = await Promise.all([
        apiClient.get("/api/pre-screenings/?page_size=200").catch(() => ({ data: [] })),
        apiClient.get("/api/module-tests/?page_size=200").catch(() => ({ data: [] })),
        apiClient.get("/api/cohorts/?page_size=200").catch(() => ({ data: [] })),
        apiClient.get("/api/courses/?page_size=200").catch(() => ({ data: [] })),
      ]);

      const parse = (res) => {
        const d = res?.data;
        if (Array.isArray(d)) return d;
        if (d && Array.isArray(d.results)) return d.results;
        return [];
      };

      const rawPS = parse(preScreeningsRes);
      const rawMT = parse(moduleTestsRes);
      const rawCohorts = parse(cohortsRes);
      const rawCourses = parse(coursesRes);

      const cohortsMap = {};
      rawCohorts.forEach((c) => {
        if (c?.id) cohortsMap[c.id] = c;
      });

      const coursesMap = {};
      rawCourses.forEach((c) => {
        if (c?.id) coursesMap[c.id] = c;
      });

      const mappedPS = rawPS.map((ps) => {
        let cohortName = ps.cohort_name;
        if (!cohortName && ps.application?.assigned_cohort) {
          const cId =
            typeof ps.application.assigned_cohort === "object"
              ? ps.application.assigned_cohort.id
              : ps.application.assigned_cohort;
          cohortName = cohortsMap[cId]?.name || ps.application.assigned_cohort.name;
        }
        let courseName = ps.course_title || ps.assessment_track;
        if (!courseName && ps.application?.course) {
          const crsId =
            typeof ps.application.course === "object"
              ? ps.application.course.id
              : ps.application.course;
          courseName = coursesMap[crsId]?.name || ps.application.course.name;
        }

        return {
          id: ps.id,
          type: "SCREENING",
          typeLabel: "Cohort Screening Exam",
          title: courseName ? `${courseName} Screening Assessment` : "Candidate Screening Examination",
          courseName: courseName || "General Track",
          cohortName: cohortName || "Applicant Cohort",
          scheduled_at: ps.scheduled_at,
          end_time: ps.end_time,
          meeting_link: ps.meeting_link,
          is_released: Boolean(ps.is_released),
          admin_started_at: ps.admin_started_at,
          status: ps.status || "SCHEDULED",
          total_questions: ps.total_questions || 30,
          pass_percentage: ps.pass_percentage || 40,
        };
      });

      const mappedMT = rawMT.map((mt) => {
        const crsId = typeof mt.course === "object" ? mt.course?.id : mt.course;
        const cId = typeof mt.cohort === "object" ? mt.cohort?.id : mt.cohort;
        const crsName = mt.course?.name || coursesMap[crsId]?.name || "Technical Track";
        const cName = mt.cohort?.name || cohortsMap[cId]?.name || "Course-Wide";

        return {
          id: mt.id,
          type: "MODULE_TEST",
          typeLabel: "Cohort Module Test",
          title: mt.title || "Module Test Assessment",
          courseName: crsName,
          cohortName: cName,
          scheduled_at: mt.scheduled_at,
          end_time: mt.end_time,
          meeting_link: mt.meeting_link,
          is_released: Boolean(mt.is_released),
          admin_started_at: mt.admin_started_at,
          status: mt.is_active ? "ACTIVE" : "INACTIVE",
          total_questions: mt.total_questions || 10,
          pass_percentage: mt.pass_percentage || 60,
        };
      });

      const combined = [...mappedPS, ...mappedMT].sort((a, b) => {
        const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return timeB - timeA;
      });

      setScheduledList(combined);
    } catch (err) {
      console.error("Failed to load scheduled exams list:", err);
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadScheduledData();
  }, [loadData, loadScheduledData]);

  const filteredExams = useMemo(() => {
    if (!searchTerm.trim()) return exams;
    const term = searchTerm.toLowerCase();
    return exams.filter(
      (e) =>
        (e.candidate_name && e.candidate_name.toLowerCase().includes(term)) ||
        (e.candidate_email && e.candidate_email.toLowerCase().includes(term)) ||
        (e.course_title && e.course_title.toLowerCase().includes(term)) ||
        (e.status && e.status.toLowerCase().includes(term))
    );
  }, [exams, searchTerm]);

  const filteredScheduled = useMemo(() => {
    if (!searchTerm.trim()) return scheduledList;
    const term = searchTerm.toLowerCase();
    return scheduledList.filter(
      (s) =>
        (s.title && s.title.toLowerCase().includes(term)) ||
        (s.courseName && s.courseName.toLowerCase().includes(term)) ||
        (s.cohortName && s.cohortName.toLowerCase().includes(term)) ||
        (s.typeLabel && s.typeLabel.toLowerCase().includes(term))
    );
  }, [scheduledList, searchTerm]);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(null);

    try {
      await apiClient.post(API_ENDPOINTS.EXAMS.CONFIG, {
        domain: editingDomain,
        duration_minutes: parseInt(durationMins, 10),
        number_of_questions: parseInt(numQuestions, 10),
        pass_percentage: parseFloat(passPct),
      });

      setConfigSuccess(`Exam configuration for '${editingDomain}' updated successfully!`);

      const res = await apiClient.get(API_ENDPOINTS.EXAMS.CONFIG);
      const resData = res.data;
      setConfigs(Array.isArray(resData) ? resData : resData?.results || []);
    } catch (err) {
      console.error("Failed to save config:", err);
      alert("Failed to update exam settings.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetExam = async (examId, candidateName) => {
    if (
      !window.confirm(
        `Reset exam attempt for ${candidateName}? This will reset marks and cheat count to 0 so the student can give the exam again.`
      )
    ) {
      return;
    }
    try {
      await apiClient.post(`/api/exams/${examId}/reset/`);
      setExams((prev) =>
        prev.map((e) =>
          e.id === examId
            ? {
                ...e,
                status: "IN_PROGRESS",
                cheat_count: 0,
                percentage: null,
                marks_obtained: null,
                qualified: null,
              }
            : e
        )
      );
      alert("✅ Exam session reset successfully. Candidate can now retake the exam!");
    } catch (err) {
      console.error("Failed to reset exam:", err);
      alert("Failed to reset exam session. Please try again.");
    }
  };

  const handleDeleteExam = async (examId, appId, candidateName) => {
    if (
      !window.confirm(
        `Delete exam & application record for ${candidateName}? Candidate will be able to apply and give the exam fresh.`
      )
    ) {
      return;
    }
    try {
      if (appId) {
        await apiClient.delete(`/api/applications/${appId}/`);
      } else {
        await apiClient.delete(`/api/exams/${examId}/`);
      }
      setExams((prev) => prev.filter((e) => e.id !== examId));
      alert("✅ Exam record deleted successfully! Student can now re-apply.");
    } catch (err) {
      console.error("Failed to delete exam record:", err);
      alert("Failed to delete exam record. Please try again.");
    }
  };

  const handleAdminStart = async (item) => {
    if (
      !window.confirm(
        `Open exam gate for "${item.title}"? Candidates will be authorized to begin their assessment immediately.`
      )
    ) {
      return;
    }
    setActionInProgress(item.id);
    try {
      if (item.type === "SCREENING") {
        await apiClient.post(`/api/pre-screenings/${item.id}/admin-start/`);
      } else {
        await apiClient.post(`/api/module-tests/${item.id}/admin-start/`);
      }
      alert("🚀 Exam gate opened successfully! Candidates can now enter the assessment.");
      loadScheduledData();
    } catch (err) {
      console.error("Failed to open exam gate:", err);
      alert(err.response?.data?.error || err.response?.data?.detail || "Failed to open exam gate.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleRelease = async (item) => {
    const nextState = !item.is_released;
    setActionInProgress(item.id);
    try {
      if (item.type === "SCREENING") {
        await apiClient.post(`/api/pre-screenings/${item.id}/release-exam/`, {
          is_released: nextState,
        });
      } else {
        await apiClient.patch(`/api/module-tests/${item.id}/`, { is_released: nextState });
      }
      alert(`✅ Exam ${nextState ? "released" : "locked"} successfully!`);
      loadScheduledData();
    } catch (err) {
      console.error("Failed to toggle exam release:", err);
      alert(
        err.response?.data?.error || err.response?.data?.detail || "Failed to update release status."
      );
    } finally {
      setActionInProgress(null);
    }
  };

  const formatWindow = (startStr, endStr) => {
    if (!startStr && !endStr) return "Flexible Window";
    const options = {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    const s = startStr ? new Date(startStr).toLocaleString(undefined, options) : "Immediate";
    const e = endStr ? new Date(endStr).toLocaleString(undefined, options) : "Open";
    return `${s} → ${e}`;
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        {/* Header with Prominent Action Buttons */}
        <div className={styles.header}>
          <div>
            <h1 style={{ fontSize: "1.65rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Exam & Screening Control Center
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Schedule cohort screening examinations, deploy module tests, monitor candidate sessions, and configure passing thresholds.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
              className={styles.scheduleBtn}
            >
              <FiCalendar /> Schedule Exam
            </button>
            <Link to="/admin/reports" className="premium-btn">
              📊 View Full Reports & Analytics
            </Link>
          </div>
        </div>

        {/* Admin Configuration Settings Panel */}
        <div className="premium-card" style={{ marginBottom: "24px" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--text-primary)", fontWeight: 600 }}>
            ⚙️ Exam Parameter Configuration
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px", marginBottom: "16px" }}>
            Adjust maximum duration (mins), total question pool size, and passing benchmark score for candidates.
          </p>

          {configSuccess && (
            <div
              style={{
                background: "rgba(22, 101, 52, 0.15)",
                color: "var(--success-color)",
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "16px",
                fontSize: "0.9rem",
              }}
            >
              {configSuccess}
            </div>
          )}

          <form
            onSubmit={handleSaveConfig}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              alignItems: "end",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Target Track Domain
              </label>
              <select
                value={editingDomain}
                onChange={(e) => {
                  const dom = e.target.value;
                  setEditingDomain(dom);
                  const cfg =
                    configs.find((c) => c.domain === dom) ||
                    configs.find(
                      (c) =>
                        c.domain &&
                        (dom.toLowerCase().includes(c.domain.toLowerCase()) ||
                          c.domain.toLowerCase().includes(dom.toLowerCase()))
                    ) ||
                    configs.find((c) => c.domain === "DEFAULT");
                  if (cfg) {
                    setDurationMins(cfg.duration_minutes || 30);
                    setNumQuestions(cfg.number_of_questions || 30);
                    setPassPct(cfg.pass_percentage || 40.0);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                }}
              >
                <option value="DEFAULT">DEFAULT (Global)</option>
                <option value="Full Stack Development">Full Stack Development</option>
                <option value="Java Development">Java Development</option>
                <option value="Artificial Intelligence & Machine Learning">AI & ML</option>
                <option value="Cloud Computing">Cloud Computing</option>
                <option value="Cyber Security">Cyber Security</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="180"
                value={durationMins}
                onChange={(e) => setDurationMins(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                }}
                required
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Question Count
              </label>
              <input
                type="number"
                min="5"
                max="100"
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                }}
                required
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Passing Benchmark (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={passPct}
                onChange={(e) => setPassPct(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                }}
                required
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={savingConfig}
                className="premium-btn"
                style={{ width: "100%" }}
              >
                {savingConfig ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Primary View Switcher: Sessions vs Scheduled */}
        <div className={styles.viewTabs}>
          <button
            type="button"
            className={`${styles.viewTabBtn} ${
              activeViewTab === "SESSIONS" ? styles.viewTabBtnActive : ""
            }`}
            onClick={() => setActiveViewTab("SESSIONS")}
          >
            📋 Student Exam Sessions ({filteredExams.length})
          </button>
          <button
            type="button"
            className={`${styles.viewTabBtn} ${
              activeViewTab === "SCHEDULED" ? styles.viewTabBtnActive : ""
            }`}
            onClick={() => setActiveViewTab("SCHEDULED")}
          >
            🗓️ Scheduled Exams & Screenings ({scheduledList.length})
          </button>
        </div>

        {/* Search Bar & Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "var(--text-primary)" }}>
            {activeViewTab === "SESSIONS"
              ? `Student Exam Sessions (${filteredExams.length})`
              : `Scheduled Assessment Windows (${filteredScheduled.length})`}
          </h2>

          <div style={{ width: "280px", position: "relative" }}>
            <input
              type="text"
              placeholder={
                activeViewTab === "SESSIONS"
                  ? "Search candidate, email or course..."
                  : "Search title, course, or cohort..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* ================= VIEW 1: STUDENT SESSIONS TABLE ================= */}
        {activeViewTab === "SESSIONS" && (
          <>
            {loading ? (
              <p style={{ color: "var(--text-secondary)", padding: "20px 0" }}>
                Loading candidate exam sessions...
              </p>
            ) : filteredExams.length === 0 ? (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center",
                  background: "var(--bg-nested)",
                  borderRadius: "8px",
                  border: "1px dashed var(--border-color)",
                }}
              >
                <p style={{ margin: 0, color: "var(--text-secondary)", fontWeight: 500 }}>
                  No matching student exam sessions found.
                </p>
              </div>
            ) : (
              <div className="premium-table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "240px" }}>Candidate Profile</th>
                      <th style={{ minWidth: "220px" }}>Applied Track / Course</th>
                      <th>Duration</th>
                      <th>Score Obtained</th>
                      <th>Evaluation Status</th>
                      <th>Security Log</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredExams.map((exam) => (
                      <tr key={exam.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                background: "rgba(37, 99, 235, 0.15)",
                                color: "var(--primary-color)",
                                fontWeight: 700,
                                fontSize: "13px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(exam.candidate_name)}
                            </div>

                            <div>
                              <strong
                                style={{
                                  color: "var(--text-primary)",
                                  fontSize: "14px",
                                  display: "block",
                                  lineHeight: "1.2",
                                }}
                              >
                                {exam.candidate_name}
                              </strong>
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "var(--primary-color)",
                                  fontWeight: 500,
                                  display: "block",
                                  marginTop: "2px",
                                }}
                              >
                                {exam.candidate_email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            style={{
                              background: "rgba(29, 78, 216, 0.15)",
                              color: "var(--primary-color)",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              display: "inline-block",
                            }}
                          >
                            {exam.course_title}
                          </span>
                        </td>

                        <td style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                          {exam.duration_minutes ? `${exam.duration_minutes} mins` : "30 mins"}
                        </td>

                        <td>
                          {exam.status === "EVALUATED" ? (
                            <div>
                              <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>
                                {exam.marks_obtained || 0} / {exam.total_marks || 0}
                              </strong>
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--success-color)",
                                  fontWeight: 600,
                                  marginLeft: "6px",
                                }}
                              >
                                ({exam.percentage || 0}%)
                              </span>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: "13px",
                                color: "var(--text-muted)",
                                fontStyle: "italic",
                              }}
                            >
                              Pending
                            </span>
                          )}
                        </td>

                        <td>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              display: "inline-block",
                              background:
                                exam.status === "EVALUATED"
                                  ? "rgba(21, 128, 61, 0.15)"
                                  : exam.status === "PENDING"
                                  ? "rgba(180, 83, 9, 0.15)"
                                  : "rgba(3, 105, 161, 0.15)",
                              color:
                                exam.status === "EVALUATED"
                                  ? "var(--success-color)"
                                  : exam.status === "PENDING"
                                  ? "var(--warning-color)"
                                  : "var(--info-color)",
                            }}
                          >
                            {exam.status || "PENDING"}
                          </span>
                        </td>

                        <td>
                          {exam.cheat_count > 0 ? (
                            <span
                              style={{
                                color: "var(--danger-color)",
                                fontWeight: 600,
                                fontSize: "12px",
                              }}
                            >
                              ⚠️ {exam.cheat_count} Violations
                            </span>
                          ) : (
                            <span
                              style={{
                                color: "var(--success-color)",
                                fontWeight: 500,
                                fontSize: "12px",
                              }}
                            >
                              🛡️ Clean
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              gap: "6px",
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleResetExam(exam.id, exam.candidate_name)}
                              style={{
                                padding: "5px 10px",
                                backgroundColor: "rgba(180, 83, 9, 0.1)",
                                color: "var(--warning-color)",
                                border: "1px solid rgba(180, 83, 9, 0.2)",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              🔄 Reset
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteExam(exam.id, exam.application, exam.candidate_name)
                              }
                              style={{
                                padding: "5px 10px",
                                backgroundColor: "rgba(220, 38, 38, 0.1)",
                                color: "var(--danger-color)",
                                border: "1px solid rgba(220, 38, 38, 0.2)",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ================= VIEW 2: SCHEDULED EXAMS & SCREENINGS TABLE ================= */}
        {activeViewTab === "SCHEDULED" && (
          <>
            {loadingScheduled ? (
              <p style={{ color: "var(--text-secondary)", padding: "20px 0" }}>
                Loading scheduled examinations...
              </p>
            ) : filteredScheduled.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  background: "var(--bg-nested)",
                  borderRadius: "12px",
                  border: "1px dashed var(--border-color)",
                }}
              >
                <FiCalendar style={{ fontSize: "2.5rem", color: "var(--text-secondary)", marginBottom: "12px" }} />
                <h3 style={{ margin: "0 0 6px 0", color: "var(--text-primary)" }}>No Scheduled Exams Yet</h3>
                <p style={{ margin: "0 0 16px 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  Schedule a cohort pre-screening examination or module test to synchronize assessments.
                </p>
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(true)}
                  className={styles.scheduleBtn}
                >
                  <FiCalendar /> Schedule New Exam
                </button>
              </div>
            ) : (
              <div className="premium-table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "220px" }}>Assessment Details</th>
                      <th style={{ minWidth: "180px" }}>Track & Cohort</th>
                      <th style={{ minWidth: "240px" }}>Scheduled Window</th>
                      <th>Proctoring / Meet</th>
                      <th>Gate Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredScheduled.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div>
                            <strong style={{ color: "var(--text-primary)", fontSize: "14px", display: "block" }}>
                              {item.title}
                            </strong>
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: item.type === "SCREENING" ? "#2563eb" : "#7c3aed",
                                background:
                                  item.type === "SCREENING"
                                    ? "rgba(37, 99, 235, 0.1)"
                                    : "rgba(124, 58, 237, 0.1)",
                                padding: "2px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {item.typeLabel}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div>
                            <strong style={{ color: "var(--text-primary)", fontSize: "13px", display: "block" }}>
                              {item.courseName}
                            </strong>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                              Cohort: {item.cohortName}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div style={{ fontSize: "13px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <FiClock style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                            <span>{formatWindow(item.scheduled_at, item.end_time)}</span>
                          </div>
                        </td>

                        <td>
                          {item.meeting_link ? (
                            <a
                              href={item.meeting_link}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.meetLinkBtn}
                              title="Open synchronized Google Meet session"
                            >
                              <FiVideo /> Join Meet
                            </a>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                              Internal Session
                            </span>
                          )}
                        </td>

                        <td>
                          {item.admin_started_at ? (
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "rgba(22, 101, 52, 0.15)",
                                color: "var(--success-color)",
                              }}
                            >
                              <FiCheckCircle /> Gate Opened
                            </span>
                          ) : item.is_released ? (
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "rgba(37, 99, 235, 0.15)",
                                color: "var(--primary-color)",
                              }}
                            >
                              <FiUnlock /> Released
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "rgba(100, 116, 139, 0.15)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              <FiLock /> Gate Locked
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            {!item.admin_started_at && (
                              <button
                                type="button"
                                onClick={() => handleAdminStart(item)}
                                disabled={actionInProgress === item.id}
                                style={{
                                  padding: "5px 10px",
                                  backgroundColor: "rgba(22, 101, 52, 0.15)",
                                  color: "var(--success-color)",
                                  border: "1px solid rgba(22, 101, 52, 0.3)",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                                title="Authorize candidates to start assessment immediately"
                              >
                                🚀 Open Gate
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleToggleRelease(item)}
                              disabled={actionInProgress === item.id}
                              style={{
                                padding: "5px 10px",
                                backgroundColor: item.is_released
                                  ? "rgba(180, 83, 9, 0.1)"
                                  : "rgba(37, 99, 235, 0.1)",
                                color: item.is_released ? "var(--warning-color)" : "var(--primary-color)",
                                border: "1px solid rgba(0, 0, 0, 0.1)",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {item.is_released ? "🔒 Lock" : "🔓 Release"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Schedule Exam Modal */}
        <ScheduleExamModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          onSuccess={() => {
            loadData();
            loadScheduledData();
          }}
        />
      </div>
    </div>
  );
}

export default Exams;