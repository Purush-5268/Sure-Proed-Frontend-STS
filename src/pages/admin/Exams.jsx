import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Exams.module.css";
import ScheduleExamForm from "./ScheduleExamForm";
import * as XLSX from "xlsx";
import { downloadQuestionBankTemplate } from "../../utils/questionBankTemplate";
import {
  FiCalendar,
  FiVideo,
  FiLock,
  FiUnlock,
  FiPlay,
  FiPlayCircle,
  FiCheckCircle,
  FiClock,
  FiExternalLink,
  FiSearch,
  FiRefreshCw,
  FiBarChart2,
  FiDownload,
  FiFilter,
  FiXCircle,
  FiUsers,
  FiSquare,
  FiEdit2,
  FiTrash2,
  FiX,
  FiColumns,
  FiCheck,
  FiAward,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";

const ALL_RESULT_COLUMNS = [
  { key: "name", label: "Candidate Name" },
  { key: "email", label: "Email Address" },
  { key: "application_number", label: "Application #" },
  { key: "course", label: "Course" },
  { key: "cohort", label: "Cohort" },
  { key: "marks_obtained", label: "Student Score" },
  { key: "total_marks", label: "Max Marks" },
  { key: "percentage", label: "Percentage (%)" },
  { key: "status", label: "Result Status" },
  { key: "submitted_at", label: "Submission Time" },
];

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState("");


  // Delete Exam Confirmation Modal State
  const [examDeleteModal, setExamDeleteModal] = useState({
    isOpen: false,
    item: null,
    input: "",
  });
  const [isDeletingExam, setIsDeletingExam] = useState(false);


  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      await Promise.all([loadData(), loadScheduledData()]);
      setSyncToast("Examinations and candidate results synchronized successfully!");
      setTimeout(() => setSyncToast(""), 3500);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Results Modal State
  const [resultsModalItem, setResultsModalItem] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [sessionResults, setSessionResults] = useState([]);
  const [resultFilter, setResultFilter] = useState("PASSED"); // Default is PASSED as requested!
  const [selectedColumns, setSelectedColumns] = useState(ALL_RESULT_COLUMNS.map((c) => c.key));
  const [isColumnFilterOpen, setIsColumnFilterOpen] = useState(false);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const columnFilterRef = useRef(null);

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

  const toggleColumn = (key) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllColumns = () => {
    setSelectedColumns(ALL_RESULT_COLUMNS.map((c) => c.key));
  };

  const deselectAllColumns = () => {
    setSelectedColumns(["name"]);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (columnFilterRef.current && !columnFilterRef.current.contains(event.target)) {
        setIsColumnFilterOpen(false);
      }
    }
    if (isColumnFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isColumnFilterOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const parseList = (resData) => {
        if (!resData) return [];
        if (Array.isArray(resData)) return resData;
        if (resData && Array.isArray(resData.results)) return resData.results;
        return [];
      };

      const examsRes = await apiClient.get("/api/exams/?page_size=200").catch(() => null);
      const rawExams = parseList(examsRes?.data);

      const hydratedExams = rawExams.map((e) => {
        const name = e.student_name || e.candidate_name || "Candidate";
        const email = cleanEmail(e.student_email || e.candidate_email || e.email || "candidate@suretrust.org");
        const courseName = e.course_name || e.course_title || e.assessment_track || "General Track";

        return {
          ...e,
          candidate_name: name,
          candidate_email: email,
          course_title: courseName,
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
        apiClient.get("/api/pre-screenings/?page_size=100").catch(() => ({ data: [] })),
        apiClient.get("/api/module-tests/?page_size=50").catch(() => ({ data: [] })),
        apiClient.get("/api/cohorts/?page_size=100").catch(() => ({ data: [] })),
        apiClient.get("/api/courses/?page_size=100").catch(() => ({ data: [] })),
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

      // Group PreScreening items so each cohort/schedule session appears exactly once
      const psGroups = {};
      rawPS.forEach((ps) => {
        const cId =
          ps.cohort_id ||
          (typeof ps.application?.assigned_cohort === "object"
            ? ps.application?.assigned_cohort?.id
            : ps.application?.assigned_cohort);
        let cohortName = ps.cohort_name;
        if (!cohortName && cId) {
          cohortName = cohortsMap[cId]?.name;
        }

        let courseName = ps.course_title || ps.assessment_track;
        if (!courseName && ps.application?.course) {
          const crsId =
            typeof ps.application.course === "object"
              ? ps.application.course.id
              : ps.application.course;
          courseName = coursesMap[crsId]?.name;
        }

        const cohortMeet = cId ? cohortsMap[cId]?.meeting_link : null;
        const groupKey = cId
          ? `cohort_${cId}_${ps.scheduled_at}`
          : `ps_${courseName || "general"}_${ps.scheduled_at}`;

        const courseId = ps.course_id || (typeof ps.application === "object" ? ps.application.course?.id || ps.application.course : null);

        if (!psGroups[groupKey]) {
          psGroups[groupKey] = {
            id: ps.id,
            allIds: [ps.id],
            type: "SCREENING",
            typeLabel: "Cohort Screening Exam",
            title: courseName ? `${courseName} Screening Assessment` : "Candidate Screening Examination",
            courseName: courseName || "General Track",
            courseId: courseId || null,
            cohortName: cohortName || "Applicant Cohort",
            cohortId: cId || null,
            scheduled_at: ps.scheduled_at,
            end_time: ps.end_time,
            meeting_link: ps.meeting_link || cohortMeet || null,
            is_released: Boolean(ps.is_released),
            admin_started_at: ps.admin_started_at,
            status: ps.end_time && new Date(ps.end_time) <= new Date() ? "COMPLETED" : (ps.status || "SCHEDULED"),
            total_questions: ps.total_questions || 30,
            pass_percentage: ps.pass_percentage || 40,
            candidates: [],
          };
        } else {
          psGroups[groupKey].allIds.push(ps.id);
          if (ps.admin_started_at && !psGroups[groupKey].admin_started_at) {
            psGroups[groupKey].admin_started_at = ps.admin_started_at;
          }
        }

        if (ps.application) {
          const cand = ps.application_details || {
            id: typeof ps.application === "object" ? ps.application.id : ps.application,
            application_number: ps.application_number,
            student_name: ps.student_name || ps.candidate_name,
            student_email: ps.student_email || ps.candidate_email,
            student_code: ps.student_code,
            student_details: {
              name: ps.student_name || ps.candidate_name,
              email: ps.student_email || ps.candidate_email,
              student_code: ps.student_code,
            },
            status: ps.status,
          };
          psGroups[groupKey].candidates.push(cand);
        }
      });

      const mappedPS = Object.values(psGroups).map((item) => {
        const cohortObj = item.cohortId ? cohortsMap[item.cohortId] : null;
        const totalApps =
          cohortObj?.applications_count ??
          cohortObj?.total_applications ??
          cohortObj?.applicant_count ??
          item.candidates.length;

        return {
          ...item,
          candidateCount: totalApps,
        };
      });

      const mappedMT = rawMT.map((mt) => {
        const crsId = typeof mt.course === "object" ? mt.course?.id : mt.course;
        const cId = typeof mt.cohort === "object" ? mt.cohort?.id : mt.cohort;
        const crsName = mt.course?.name || coursesMap[crsId]?.name || "Technical Track";
        const cName = mt.cohort?.name || cohortsMap[cId]?.name || "Course-Wide";

        return {
          id: mt.id,
          allIds: [mt.id],
          type: "MODULE_TEST",
          typeLabel: "Cohort Module Test",
          title: mt.title || "Module Test Assessment",
          courseName: crsName,
          cohortName: cName,
          cohortId: cId || null,
          scheduled_at: mt.scheduled_at,
          end_time: mt.end_time,
          meeting_link: mt.meeting_link,
          is_released: Boolean(mt.is_released),
          admin_started_at: mt.admin_started_at,
          status: mt.is_active ? "ACTIVE" : "INACTIVE",
          total_questions: mt.total_questions || 10,
          pass_percentage: mt.pass_percentage || 60,
          candidateCount: 0,
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

  const { upcomingExams, completedExams } = useMemo(() => {
    const now = new Date();
    const upcoming = [];
    const completed = [];
    filteredScheduled.forEach((s) => {
      if (s.end_time && new Date(s.end_time) <= now) {
        completed.push(s);
      } else {
        upcoming.push(s);
      }
    });
    return { upcomingExams: upcoming, completedExams: completed };
  }, [filteredScheduled]);

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
      alert("Exam session reset successfully. Candidate can now retake the exam.");
    } catch (err) {
      console.error("Failed to reset exam:", err);
      alert("Failed to reset exam session. Please try again.");
    }
  };

  // 1. Open the delete modal
  const promptDeleteScheduled = (item) => {
    setExamDeleteModal({
      isOpen: true,
      item,
      input: "",
    });
  };

  // 2. Execute deletion once the user types DELETE <EXAM_TITLE>
  const confirmExecuteDeleteScheduled = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const { item, input } = examDeleteModal;
    if (!item) return;

    const expectedPhrase = `DELETE ${item.title || item.typeLabel || "EXAM"}`.trim();
    if (input.trim() !== expectedPhrase) {
      alert("You have not entered the correct confirmation phrase.");
      return;
    }

    setIsDeletingExam(true);
    setActionInProgress(item.id);
    try {
      if (item.type === "SCREENING") {
        const ids = item.allIds?.length ? item.allIds : [item.id];
        await Promise.all(ids.map((id) => apiClient.delete(`/api/pre-screenings/${id}/`).catch(() => null)));
      } else {
        await apiClient.delete(`/api/module-tests/${item.id}/`);
      }
      alert("Examination deleted successfully.");
      setExamDeleteModal({ isOpen: false, item: null, input: "" });
      loadScheduledData();
    } catch (err) {
      console.error("Failed to delete exam:", err);
      alert(
        err.response?.data?.error || err.response?.data?.detail || "Failed to delete exam."
      );
    } finally {
      setIsDeletingExam(false);
      setActionInProgress(null);
    }
  };


  const handleAdminStart = async (item) => {
    if (
      !window.confirm(
        `Start exam now for "${item.title}"? Candidates will be authorized to begin their assessment immediately.`
      )
    ) {
      return;
    }
    setActionInProgress(item.id);
    try {
      if (item.type === "SCREENING") {
        const ids = item.allIds?.length ? item.allIds : [item.id];
        await Promise.all(ids.map((id) => apiClient.post(`/api/pre-screenings/${id}/admin-start/`)));
      } else {
        await apiClient.post(`/api/module-tests/${item.id}/admin-start/`);
      }
      alert("Exam started successfully! Candidates can now enter the assessment.");
      loadScheduledData();
    } catch (err) {
      console.error("Failed to start exam:", err);
      alert(err.response?.data?.error || err.response?.data?.detail || "Failed to start exam.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAdminEnd = async (item) => {
    if (
      !window.confirm(
        `End exam early for "${item.title}"? The assessment window will close immediately, preventing further attempts.`
      )
    ) {
      return;
    }
    setActionInProgress(item.id);
    try {
      if (item.type === "SCREENING") {
        const ids = item.allIds?.length ? item.allIds : [item.id];
        await Promise.all(ids.map((id) => apiClient.post(`/api/pre-screenings/${id}/admin-end/`).catch(() => null)));
      } else {
        await apiClient.post(`/api/module-tests/${item.id}/admin-end/`);
      }
      alert("Exam closed successfully. The assessment window is now ended.");
      loadScheduledData();
    } catch (err) {
      console.error("Failed to end exam:", err);
      alert(err.response?.data?.error || err.response?.data?.detail || "Failed to end exam.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenResults = async (item) => {
    if (resultsModalItem?.id === item.id) {
      setResultsModalItem(null);
      return;
    }
    setResultsModalItem(item);
    setResultsLoading(true);
    setResultFilter("PASSED"); // Default is PASSED as requested!
    setSessionResults([]);
    setIsColumnFilterOpen(false);
    setCandidateSearchQuery("");

    try {
      const parse = (res) => {
        const d = res?.data;
        if (Array.isArray(d)) return d;
        if (d && Array.isArray(d.results)) return d.results;
        return [];
      };

      let list = [];

      if (item.type === "SCREENING") {
        const [appsRes, examsRes] = await Promise.all([
          item.cohortId
            ? apiClient.get("/api/applications/", { params: { cohort: item.cohortId, page_size: 500 } }).catch(() => ({ data: [] }))
            : (item.courseId
              ? apiClient.get("/api/applications/", { params: { course: item.courseId, page_size: 500 } }).catch(() => ({ data: [] }))
              : Promise.resolve({ data: [] })),
          apiClient.get("/api/exams/?page_size=1000").catch(() => ({ data: [] })),
        ]);

        const rawApps = parse(appsRes);
        const rawExams = parse(examsRes);

        const examsByAppId = {};
        rawExams.forEach((e) => {
          const aId = typeof e.application === "object" ? e.application?.id : e.application;
          if (aId) examsByAppId[aId] = e;
        });

        const targetApps = rawApps.length > 0 ? rawApps : (item.candidates || []);

        list = targetApps.map((app) => {
          const appId = typeof app === "object" ? app.id : app;
          const ex = examsByAppId[appId] || (typeof app === "object" ? (app.screening_exam || app.exam) : null) || {};

          const stu = typeof app === "object" ? (typeof app.student === "object" ? app.student : null) : null;
          const usr = stu?.user || {};

          const name =
            (typeof app === "object" ? (app.student_name || app.candidate_name || app.student_details?.name) : null) ||
            ex.student_name ||
            (stu ? `${stu.first_name || ""} ${stu.last_name || ""}`.trim() || usr.username : "") ||
            "Candidate";

          const email =
            (typeof app === "object" ? (app.student_email || app.candidate_email || app.student_details?.email) : null) ||
            ex.student_email ||
            (stu ? usr.email || stu.email : "") ||
            "—";

          let marks = ex.marks_obtained != null ? ex.marks_obtained : (typeof app === "object" ? (app.marks_obtained != null ? app.marks_obtained : app.qualification_score) : null);
          const totalMarks = ex.total_marks || item.total_questions || 10;
          let pct = ex.percentage != null ? parseFloat(ex.percentage) : (typeof app === "object" && (app.percentage != null || app.qualification_score != null) ? parseFloat(app.percentage ?? app.qualification_score) : null);
          const passMark = item.pass_percentage || 40;

          const nowT = new Date();
          const isEnded = item.end_time && nowT > new Date(item.end_time);
          let appStatus = typeof app === "object" ? app.status : "PENDING";
          let statusStr = ex.status || (appStatus === "REJECTED" ? "REJECTED" : (appStatus === "SCREENING_PASSED" ? "PASSED" : (appStatus === "SCREENING_FAILED" ? "FAILED" : "PENDING")));

          if (isEnded && (marks == null || statusStr === "PENDING" || statusStr === "SCHEDULED")) {
            marks = 0;
            pct = 0;
            statusStr = "FAILED (Absent)";
          }

          const isPassed = appStatus === "QUALIFIED" || ex.qualified === true || (pct != null && pct >= passMark);
          const isFailed = appStatus === "NOT_QUALIFIED" || ex.qualified === false || (pct != null && pct < passMark) || statusStr === "FAILED (Absent)";

          const appNum = (typeof app === "object" ? (app.application_number || app.app_num) : null) || ex.application_number || String(appId).slice(0, 8);

          return {
            id: appId,
            name,
            email,
            application_number: appNum,
            marks_obtained: marks,
            total_marks: totalMarks,
            percentage: pct,
            isPassed,
            isFailed,
            status: statusStr === "FAILED (Absent)" ? statusStr : (isPassed ? "PASSED" : isFailed ? "FAILED" : statusStr),
            submitted_at: ex.submitted_at || (typeof app === "object" ? app.submitted_at : null) || null,
          };
        });
      } else {
        // Module Tests
        const subsRes = await apiClient.get(`/api/module-test-submissions/?test=${item.id}&page_size=1000`).catch(() => ({ data: [] }));
        const rawSubs = parse(subsRes);

        list = rawSubs.map((sub) => {
          const stu = typeof sub.student === "object" ? sub.student : {};
          const usr = stu?.user || {};
          const name = `${stu.first_name || ""} ${stu.last_name || ""}`.trim() || usr.username || "Student";
          const email = usr.email || stu.email || "—";
          const appNum = stu.student_code || stu.id?.slice(0, 8) || sub.id?.slice(0, 8);

          let marks = sub.score != null ? sub.score : null;
          const totalMarks = item.total_questions || 10;
          let pct = marks != null ? (marks / totalMarks) * 100 : null;
          const passMark = item.pass_percentage || 60;

          const nowT = new Date();
          const isEnded = item.end_time && nowT > new Date(item.end_time);
          let statusStr = sub.status || "PENDING";

          if (isEnded && (marks == null || statusStr === "PENDING" || statusStr === "SCHEDULED")) {
            marks = 0;
            pct = 0;
            statusStr = "MISSED (Absent)";
          }

          const isPassed = sub.passed === true || (pct != null && pct >= passMark);
          const isFailed = sub.passed === false || (pct != null && pct < passMark) || statusStr === "MISSED (Absent)";

          return {
            id: sub.id,
            name,
            email,
            application_number: appNum,
            marks_obtained: marks,
            total_marks: totalMarks,
            percentage: pct,
            isPassed,
            isFailed,
            status: statusStr === "MISSED (Absent)" ? statusStr : (isPassed ? "PASSED" : isFailed ? "FAILED" : statusStr),
            submitted_at: sub.submitted_at || sub.created_at || null,
          };
        });
      }

      setSessionResults(list);
    } catch (err) {
      console.error("Failed to load session results:", err);
      alert("Failed to load candidate results for this session.");
    } finally {
      setResultsLoading(false);
    }
  };

  const handleDownloadSessionResultsExcel = (item, filteredResults) => {
    if (!filteredResults || filteredResults.length === 0) {
      alert("No candidate results to download for the current filter.");
      return;
    }

    const activeCols = ALL_RESULT_COLUMNS.filter((col) => selectedColumns.includes(col.key));
    if (activeCols.length === 0) {
      alert("Please select at least one column to export.");
      return;
    }

    const headers = activeCols.map((c) => c.label);

    const rows = filteredResults.map((r) => {
      const row = [];
      activeCols.forEach((col) => {
        switch (col.key) {
          case "name":
            row.push(r.name || "Candidate");
            break;
          case "email":
            row.push(r.email || "—");
            break;
          case "application_number":
            row.push(r.application_number || "—");
            break;
          case "course":
            row.push(item?.courseName || "—");
            break;
          case "cohort":
            row.push(item?.cohortName || "—");
            break;
          case "marks_obtained":
            row.push(r.marks_obtained != null ? r.marks_obtained : "0");
            break;
          case "total_marks":
            row.push(r.total_marks != null ? r.total_marks : (item?.total_questions || 15));
            break;
          case "percentage":
            row.push(r.percentage != null ? `${r.percentage}%` : "0%");
            break;
          case "status":
            row.push(r.status || "PENDING");
            break;
          case "submitted_at":
            row.push(r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "Not Submitted");
            break;
          default:
            row.push("");
        }
      });
      return row;
    });

    const cleanExam = (item?.title || "Exam").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanCohort = (item?.cohortName || "Cohort").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanCourse = (item?.courseName || "Course").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filterTag = (resultFilter || "RESULTS").toUpperCase();
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `${cleanExam}_${cleanCohort}_${cleanCourse}_${filterTag}_${dateStr}.xlsx`;

    try {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Candidate_Results");
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error("XLSX write failed, falling back to CSV", e);
      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename.replace(".xlsx", ".csv"));
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleSyncResults = async (item) => {
    if (
      !window.confirm(
        `Sync/re-evaluate all submitted exam results for "${item.title}"? This will re-grade all candidate submissions against the question bank answer keys.`
      )
    ) {
      return;
    }
    setActionInProgress(item.id);
    try {
      const res = await apiClient.post("/api/exams/sync-cohort-results/", {
        cohort_id: item.cohortId || null,
      });
      const data = res.data;
      const errCount = data.errors?.length || 0;
      alert(
        `Sync complete: ${data.synced || 0} exam(s) re-evaluated successfully.` +
        (errCount > 0 ? `\n${errCount} error(s) encountered.` : "")
      );
      loadData();
      loadScheduledData();
    } catch (err) {
      console.error("Failed to sync results:", err);
      alert(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to sync results. Please try again."
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

  const renderExpandedResultsPanel = (item) => {
    const filtered = sessionResults.filter((r) => {
      if (resultFilter === "PASSED" && !r.isPassed) return false;
      if (resultFilter === "FAILED" && !r.isFailed) return false;
      if (candidateSearchQuery && candidateSearchQuery.trim()) {
        const q = candidateSearchQuery.toLowerCase().trim();
        const nameMatch = (r.name || "").toLowerCase().includes(q);
        const emailMatch = (r.email || "").toLowerCase().includes(q);
        const appMatch = (r.application_number || "").toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !appMatch) return false;
      }
      return true;
    });

    return (
      <div
        style={{
          margin: "12px 0 16px 0",
          backgroundColor: "var(--bg-surface)",
          borderRadius: "12px",
          border: "1.5px solid var(--border-color)",
          boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "var(--bg-nested)",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(37, 99, 235, 0.12)",
                  color: "#2563eb",
                }}
              >
                {item.typeLabel}
              </span>
              <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)", fontWeight: 700 }}>
                {item.title} — Results & Performance
              </h4>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
              <span style={{ background: "rgba(37, 99, 235, 0.08)", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(37, 99, 235, 0.15)", color: "#1d4ed8" }}>
                Cohort: <strong>{item.cohortName || "General Cohort"}</strong>
              </span>
              <span style={{ background: "rgba(100, 116, 139, 0.08)", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                Course: <strong>{item.courseName || "General"}</strong>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <FiClock style={{ fontSize: "12px" }} /> Window: {formatWindow(item.scheduled_at, item.end_time)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setResultsModalItem(null)}
            style={{
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              padding: "6px 12px",
              borderRadius: "6px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12.5px",
              fontWeight: 600,
            }}
            title="Collapse results panel"
          >
            <FiChevronUp style={{ fontSize: "14px" }} />
            <span>Collapse Results</span>
          </button>
        </div>

        {/* Metrics Summary Bar */}
        {sessionResults.length > 0 && (
          <div
            style={{
              padding: "12px 20px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "12px",
              borderBottom: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-nested)",
            }}
          >
            <div style={{ padding: "8px 12px", background: "var(--bg-surface)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>Total Candidates</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>{sessionResults.length}</div>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(220, 38, 38, 0.08)", borderRadius: "8px", border: "1px solid rgba(220, 38, 38, 0.2)" }}>
              <div style={{ fontSize: "11px", color: "#991b1b", textTransform: "uppercase", fontWeight: 600 }}>Failed / Unqualified</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#dc2626" }}>{sessionResults.filter((r) => r.isFailed).length}</div>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(22, 163, 74, 0.08)", borderRadius: "8px", border: "1px solid rgba(22, 163, 74, 0.2)" }}>
              <div style={{ fontSize: "11px", color: "#166534", textTransform: "uppercase", fontWeight: 600 }}>Passed / Qualified</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#16a34a" }}>{sessionResults.filter((r) => r.isPassed).length}</div>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(37, 99, 235, 0.08)", borderRadius: "8px", border: "1px solid rgba(37, 99, 235, 0.2)" }}>
              <div style={{ fontSize: "11px", color: "#1d4ed8", textTransform: "uppercase", fontWeight: 600 }}>Pass Rate</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#2563eb" }}>
                {sessionResults.length > 0
                  ? Math.round((sessionResults.filter((r) => r.isPassed).length / sessionResults.length) * 100)
                  : 0}%
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls Bar */}
        {sessionResults.length > 0 && (
          <div
            style={{
              padding: "12px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {/* Filter Tabs & Search Bar */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setResultFilter("PASSED")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: resultFilter === "PASSED" ? "2px solid #16a34a" : "1px solid var(--border-color)",
                  backgroundColor: resultFilter === "PASSED" ? "rgba(22, 163, 74, 0.12)" : "var(--bg-surface)",
                  color: resultFilter === "PASSED" ? "#16a34a" : "var(--text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiCheckCircle style={{ fontSize: "13px" }} />
                <span>Passed ({sessionResults.filter((r) => r.isPassed).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setResultFilter("FAILED")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: resultFilter === "FAILED" ? "2px solid #dc2626" : "1px solid var(--border-color)",
                  backgroundColor: resultFilter === "FAILED" ? "rgba(220, 38, 38, 0.12)" : "var(--bg-surface)",
                  color: resultFilter === "FAILED" ? "#dc2626" : "var(--text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiXCircle style={{ fontSize: "13px" }} />
                <span>Failed ({sessionResults.filter((r) => r.isFailed).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setResultFilter("ALL")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: resultFilter === "ALL" ? "2px solid var(--primary-color)" : "1px solid var(--border-color)",
                  backgroundColor: resultFilter === "ALL" ? "rgba(37, 99, 235, 0.12)" : "var(--bg-surface)",
                  color: resultFilter === "ALL" ? "var(--primary-color)" : "var(--text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiUsers style={{ fontSize: "13px" }} />
                <span>All ({sessionResults.length})</span>
              </button>

              {/* Candidate Search Box */}
              <div style={{ position: "relative", minWidth: "220px", marginLeft: "6px" }}>
                <FiSearch style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: "13px" }} />
                <input
                  type="text"
                  placeholder="Search candidate, email, app #..."
                  value={candidateSearchQuery}
                  onChange={(e) => setCandidateSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 10px 6px 30px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "12px",
                  }}
                />
              </div>
            </div>

            {/* Actions: Filter Columns Popover & Export Button */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ position: "relative" }} ref={columnFilterRef}>
                <button
                  type="button"
                  onClick={() => setIsColumnFilterOpen((prev) => !prev)}
                  style={{
                    padding: "7px 12px",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  title="Choose which columns to display and export"
                >
                  <FiColumns style={{ fontSize: "14px", color: "var(--primary-color)" }} />
                  <span>Filter Columns ({selectedColumns.length}/{ALL_RESULT_COLUMNS.length})</span>
                </button>

                {isColumnFilterOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      width: "250px",
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
                      zIndex: 100,
                      padding: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
                      <strong style={{ fontSize: "12px", color: "var(--text-primary)" }}>Export Columns</strong>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={selectAllColumns}
                          style={{ background: "none", border: "none", color: "var(--primary-color)", fontSize: "11px", cursor: "pointer", fontWeight: 600, padding: 0 }}
                        >
                          All
                        </button>
                        <span style={{ color: "var(--border-color)" }}>|</span>
                        <button
                          type="button"
                          onClick={deselectAllColumns}
                          style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "11px", cursor: "pointer", fontWeight: 600, padding: 0 }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {ALL_RESULT_COLUMNS.map((col) => {
                        const isChecked = selectedColumns.includes(col.key);
                        return (
                          <label
                            key={col.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              fontSize: "12px",
                              color: isChecked ? "var(--text-primary)" : "var(--text-secondary)",
                              cursor: "pointer",
                              padding: "3px 4px",
                              borderRadius: "4px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleColumn(col.key)}
                              style={{ cursor: "pointer", accentColor: "var(--primary-color)" }}
                            />
                            <span>{col.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Export Filtered Results to Excel */}
              <button
                type="button"
                onClick={() => handleDownloadSessionResultsExcel(item, filtered)}
                style={{
                  padding: "7px 15px",
                  backgroundColor: "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 4px rgba(22, 163, 74, 0.2)",
                }}
                title="Download currently filtered students to Excel (.xlsx)"
              >
                <FiDownload style={{ fontSize: "14px" }} />
                <span>Export to Excel ({filtered.length})</span>
              </button>

              {/* Sync Results Button */}
              <button
                type="button"
                onClick={() => {
                  handleOpenResults(item);
                  handleSyncAll();
                }}
                disabled={isSyncing}
                style={{
                  padding: "7px 14px",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: isSyncing ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Refresh candidate assessment scores and statuses from server"
              >
                <FiRefreshCw
                  style={{
                    fontSize: "13px",
                    animation: isSyncing ? "spin 1s linear infinite" : "none",
                  }}
                />
                <span>{isSyncing ? "Syncing..." : "Sync"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Table View with Sticky Header */}
        <div style={{ maxHeight: "560px", overflowY: "auto", overflowX: "auto", padding: "0" }}>
          {resultsLoading ? (
            <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 0" }}>
              Loading candidate assessment results...
            </p>
          ) : sessionResults.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 0" }}>
              No candidates found for this examination session.
            </p>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
              <p style={{ fontSize: "14px", fontWeight: 600 }}>No candidates match the current filter/search.</p>
              <p style={{ fontSize: "12.5px", marginTop: "4px" }}>Try selecting "All" or clearing the search query.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border-color)", textAlign: "left", backgroundColor: "var(--bg-nested)", position: "sticky", top: 0, zIndex: 5 }}>
                  {selectedColumns.includes("name") && <th style={{ padding: "12px 14px", background: "inherit" }}>Candidate Name</th>}
                  {selectedColumns.includes("email") && <th style={{ padding: "12px 14px", background: "inherit" }}>Email</th>}
                  {selectedColumns.includes("application_number") && <th style={{ padding: "12px 14px", background: "inherit" }}>Application #</th>}
                  {selectedColumns.includes("course") && <th style={{ padding: "12px 14px", background: "inherit" }}>Course</th>}
                  {selectedColumns.includes("cohort") && <th style={{ padding: "12px 14px", background: "inherit" }}>Cohort</th>}
                  {selectedColumns.includes("marks_obtained") && <th style={{ padding: "12px 14px", background: "inherit" }}>Student Score</th>}
                  {selectedColumns.includes("total_marks") && <th style={{ padding: "12px 14px", background: "inherit" }}>Max Marks</th>}
                  {selectedColumns.includes("percentage") && <th style={{ padding: "12px 14px", background: "inherit" }}>Percentage</th>}
                  {selectedColumns.includes("status") && <th style={{ padding: "12px 14px", background: "inherit" }}>Result Status</th>}
                  {selectedColumns.includes("submitted_at") && <th style={{ padding: "12px 14px", background: "inherit" }}>Submitted At</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((res, idx) => (
                  <tr
                    key={res.id || idx}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(100, 116, 139, 0.03)",
                    }}
                  >
                    {selectedColumns.includes("name") && (
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {res.name}
                      </td>
                    )}
                    {selectedColumns.includes("email") && (
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{res.email}</td>
                    )}
                    {selectedColumns.includes("application_number") && (
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "12px" }}>
                        {res.application_number}
                      </td>
                    )}
                    {selectedColumns.includes("course") && (
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        {item.courseName || "—"}
                      </td>
                    )}
                    {selectedColumns.includes("cohort") && (
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        {item.cohortName || "—"}
                      </td>
                    )}
                    {selectedColumns.includes("marks_obtained") && (
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                        {res.marks_obtained != null ? res.marks_obtained : "—"}
                      </td>
                    )}
                    {selectedColumns.includes("total_marks") && (
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        {res.total_marks != null ? res.total_marks : "—"}
                      </td>
                    )}
                    {selectedColumns.includes("percentage") && (
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                        {res.percentage != null ? `${res.percentage}%` : "—"}
                      </td>
                    )}
                    {selectedColumns.includes("status") && (
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "10px",
                            fontSize: "11px",
                            fontWeight: 700,
                            backgroundColor: res.isPassed
                              ? "rgba(22, 163, 74, 0.12)"
                              : res.isFailed
                                ? "rgba(220, 38, 38, 0.12)"
                                : "var(--bg-nested)",
                            color: res.isPassed
                              ? "#16a34a"
                              : res.isFailed
                                ? "#dc2626"
                                : "var(--text-secondary)",
                            border: `1px solid ${res.isPassed
                              ? "rgba(22, 163, 74, 0.3)"
                              : res.isFailed
                                ? "rgba(220, 38, 38, 0.3)"
                                : "var(--border-color)"
                              }`,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {res.isPassed ? (
                            <>
                              <FiCheckCircle style={{ fontSize: "11px" }} /> PASSED
                            </>
                          ) : res.isFailed ? (
                            <>
                              <FiXCircle style={{ fontSize: "11px" }} /> FAILED
                            </>
                          ) : (
                            "PENDING"
                          )}
                        </span>
                      </td>
                    )}
                    {selectedColumns.includes("submitted_at") && (
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)", fontSize: "12px" }}>
                        {res.submitted_at ? new Date(res.submitted_at).toLocaleString() : "Not Submitted"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "var(--bg-nested)",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
            Showing <strong>{filtered.length}</strong> of {sessionResults.length} candidates
            {candidateSearchQuery.trim() ? ` (matching "${candidateSearchQuery}")` : ""}
          </span>
          <button
            type="button"
            onClick={() => setResultsModalItem(null)}
            style={{
              padding: "6px 16px",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close Results
          </button>
        </div>
      </div>
    );
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
              onClick={downloadQuestionBankTemplate}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                backgroundColor: "var(--bg-nested)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Download standardized Question Bank Excel template (.xlsx) for mentors"
            >
              <FiDownload style={{ color: "var(--primary-color)", fontSize: "1rem" }} />
              <span>Question Bank Template</span>
            </button>
            <Link
              to="/admin/question-banks"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                backgroundColor: "var(--primary-color)",
                color: "#ffffff",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              <FiBarChart2 style={{ fontSize: "1rem" }} />
              <span>Question Banks</span>
            </Link>
          </div>
        </div>

        {/* SCHEDULE EXAM SECTION */}
        <div className="premium-card" style={{ marginBottom: "24px", padding: 0, overflow: "hidden" }}>
          <ScheduleExamForm onSuccess={() => { loadData(); loadScheduledData(); }} />
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
            Assessment Windows
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

        {/* ================= SECTION: SCHEDULED EXAMS ================= */}
        <h3 style={{ margin: "32px 0 16px", fontSize: "1.25rem", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <FiCalendar style={{ color: "var(--primary-color)" }} /> Scheduled & Active Examinations
        </h3>
        {loadingScheduled ? (
          <p style={{ color: "var(--text-secondary)", padding: "20px 0" }}>
            Loading scheduled examinations...
          </p>
        ) : upcomingExams.length === 0 ? (
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
            <p style={{ margin: "0 0 0 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Use the form above to schedule a cohort pre-screening or module test.
            </p>
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
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {upcomingExams.map((item) => {
                  const isExpanded = resultsModalItem?.id === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr style={{ backgroundColor: isExpanded ? "rgba(37, 99, 235, 0.04)" : "transparent" }}>
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
                              {item.candidateCount > 0 && (
                                <span style={{ marginLeft: "8px", background: "rgba(99, 102, 241, 0.12)", color: "#6366f1", padding: "1px 6px", borderRadius: "10px", fontWeight: 700, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <FiUsers style={{ fontSize: "11px" }} /> {item.candidateCount} application{item.candidateCount > 1 ? "s" : ""} received
                                </span>
                              )}
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
                            (() => {
                              const nowTime = new Date();
                              const isEnded = item.end_time && nowTime > new Date(item.end_time);
                              if (isEnded) {
                                return (
                                  <button
                                    type="button"
                                    disabled
                                    className={styles.meetLinkBtn}
                                    style={{
                                      backgroundColor: "#9ca3af",
                                      opacity: 0.6,
                                      cursor: "not-allowed",
                                      pointerEvents: "none",
                                      border: "none",
                                      color: "white",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                    }}
                                    title="Screening examination has concluded"
                                  >
                                    <FiVideo /> Join Meet (Ended)
                                  </button>
                                );
                              }
                              return (
                                <a
                                  href={item.meeting_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.meetLinkBtn}
                                  title="Open synchronized Google Meet session"
                                >
                                  <FiVideo /> Join Meet
                                </a>
                              );
                            })()
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                              Internal Session
                            </span>
                          )}
                        </td>

                        <td>
                          {(() => {
                            const nowTime = new Date();
                            const isItemEnded = item.end_time && nowTime > new Date(item.end_time);
                            const isItemActive =
                              !isItemEnded &&
                              (Boolean(item.admin_started_at) ||
                                (item.scheduled_at && nowTime >= new Date(item.scheduled_at)));
                            const isItemScheduled = !isItemEnded && !isItemActive;

                            if (isItemActive) {
                              return (
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: "12px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    background: "rgba(22, 163, 74, 0.15)",
                                    color: "#16a34a",
                                    border: "1px solid rgba(22, 163, 74, 0.3)",
                                  }}
                                >
                                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#16a34a" }} />
                                  Live / In Progress
                                </span>
                              );
                            }
                            if (isItemScheduled) {
                              return (
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: "12px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    background: "rgba(37, 99, 235, 0.1)",
                                    color: "var(--primary-color)",
                                    border: "1px solid rgba(37, 99, 235, 0.2)",
                                  }}
                                >
                                  <FiClock /> Scheduled
                                </span>
                              );
                            }
                            return (
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
                                  border: "1px solid var(--border-color)",
                                }}
                              >
                                <FiLock /> Closed
                              </span>
                            );
                          })()}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            {(() => {
                              const nowTime = new Date();
                              const isItemEnded = item.end_time && nowTime > new Date(item.end_time);
                              const meetingStarted = Boolean(item.scheduled_at && nowTime >= new Date(item.scheduled_at));
                              const isItemActive = !isItemEnded && Boolean(item.admin_started_at);
                              const isItemScheduled = !isItemEnded && !isItemActive && !meetingStarted;
                              const canStartFromMeeting = !isItemEnded && !isItemActive && meetingStarted;

                              if (isItemScheduled || canStartFromMeeting) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminStart(item)}
                                    disabled={actionInProgress === item.id}
                                    style={{
                                      padding: "6px 12px",
                                      backgroundColor: "#16a34a",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      cursor: actionInProgress === item.id ? "not-allowed" : "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                    title={canStartFromMeeting ? "Meeting has started — authorize the exam to begin" : "Starts the exam immediately for all candidates"}
                                  >
                                    <FiPlayCircle /> {canStartFromMeeting ? "Start Exam (Started)" : "Start Exam"}
                                  </button>
                                );
                              }
                              if (isItemActive) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminEnd(item)}
                                    disabled={actionInProgress === item.id}
                                    style={{
                                      padding: "6px 12px",
                                      backgroundColor: "#dc2626",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      cursor: actionInProgress === item.id ? "not-allowed" : "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                    title="End assessment early and close window"
                                  >
                                    <FiSquare style={{ fontSize: "12px" }} /> End Exam
                                  </button>
                                );
                              }
                              return null;
                            })()}

                            {/* Show Results button */}
                            {(!(() => {
                              const nowT = new Date();
                              const ended = item.end_time && nowT > new Date(item.end_time);
                              const active =
                                !ended &&
                                (Boolean(item.admin_started_at) ||
                                  (item.scheduled_at && nowT >= new Date(item.scheduled_at)));
                              return !ended && !active;
                            })()) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenResults(item)}
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: isExpanded ? "#059669" : "rgba(16, 185, 129, 0.1)",
                                    color: isExpanded ? "#ffffff" : "#059669",
                                    border: "1px solid rgba(16, 185, 129, 0.3)",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                  title={isExpanded ? "Hide candidate results" : "Show candidate results and download Excel"}
                                >
                                  <FiBarChart2 style={{ fontSize: "13px" }} />
                                  <span>{isExpanded ? "Hide Results" : "Show Results"}</span>
                                  {isExpanded ? <FiChevronUp style={{ fontSize: "13px" }} /> : <FiChevronDown style={{ fontSize: "13px" }} />}
                                </button>
                              )}



                            <button
                              type="button"
                              onClick={() => promptDeleteScheduled(item)}
                              disabled={actionInProgress === item.id}
                              style={{
                                padding: "5px 10px",
                                backgroundColor: "rgba(220, 38, 38, 0.1)",
                                color: "var(--danger-color)",
                                border: "1px solid rgba(220, 38, 38, 0.2)",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Delete this scheduled assessment"
                            >
                              <FiTrash2 style={{ fontSize: "12px" }} /> Delete
                            </button>

                            {/* Sync Results button for active or ended exams */}
                            {(() => {
                              const nowT = new Date();
                              const ended = item.end_time && nowT > new Date(item.end_time);
                              const active =
                                !ended &&
                                (Boolean(item.admin_started_at) ||
                                  (item.scheduled_at && nowT >= new Date(item.scheduled_at)));
                              if (active || ended) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleSyncResults(item)}
                                    disabled={actionInProgress === item.id}
                                    style={{
                                      padding: "5px 10px",
                                      backgroundColor: "rgba(37, 99, 235, 0.1)",
                                      color: "var(--primary-color)",
                                      border: "1px solid rgba(37, 99, 235, 0.2)",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      cursor: actionInProgress === item.id ? "not-allowed" : "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                    title="Re-evaluate and sync all exam results for this assessment"
                                  >
                                    <FiRefreshCw /> Sync Results
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${item.id}-results`} className="expanded-results-row">
                          <td colSpan={6} style={{ padding: "0 0 16px 0", background: "transparent" }}>
                            {renderExpandedResultsPanel(item)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= SECTION: COMPLETED EXAMS ================= */}
        <h3 style={{ margin: "36px 0 16px", fontSize: "1.25rem", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <FiCheckCircle style={{ color: "#10b981", fontSize: "1.25rem" }} /> Completed Examinations
        </h3>
        {loadingScheduled ? (
          <p style={{ color: "var(--text-secondary)", padding: "20px 0" }}>
            Loading completed examinations...
          </p>
        ) : completedExams.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--bg-nested)",
              borderRadius: "12px",
              border: "1px dashed var(--border-color)",
            }}
          >
            <FiCheckCircle style={{ fontSize: "2.5rem", color: "var(--text-secondary)", marginBottom: "12px" }} />
            <h3 style={{ margin: "0 0 6px 0", color: "var(--text-primary)" }}>No Completed Exams Yet</h3>
            <p style={{ margin: "0 0 0 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Completed screening exams and module tests will appear here.
            </p>
          </div>
        ) : (
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ minWidth: "220px" }}>Assessment Details</th>
                  <th style={{ minWidth: "220px" }}>Conducted For (Cohort & Course)</th>
                  <th style={{ minWidth: "220px" }}>Conducted Window</th>
                  <th>Proctoring / Meet</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right", minWidth: "150px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedExams.map((item) => {
                  const isExpanded = resultsModalItem?.id === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr style={{ backgroundColor: isExpanded ? "rgba(37, 99, 235, 0.04)" : "transparent" }}>
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
                            <div style={{ marginBottom: "4px" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  background: "rgba(37, 99, 235, 0.12)",
                                  color: "#1d4ed8",
                                  border: "1px solid rgba(37, 99, 235, 0.2)",
                                }}
                              >
                                <FiUsers style={{ fontSize: "11px" }} /> Cohort: {item.cohortName || "General Cohort"}
                              </span>
                            </div>
                            <div style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>
                              {item.courseName || "General Course"}
                            </div>
                            {item.candidateCount > 0 && (
                              <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                {item.candidateCount} application{item.candidateCount > 1 ? "s" : ""} received
                              </div>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontSize: "12.5px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <FiClock style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                            <span>{formatWindow(item.scheduled_at, item.end_time)}</span>
                          </div>
                        </td>

                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                            Concluded
                          </span>
                        </td>

                        <td>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              background: "rgba(100, 116, 139, 0.15)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-color)",
                            }}
                          >
                            <FiLock style={{ fontSize: "11px" }} /> Concluded
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenResults(item)}
                              style={{
                                padding: "7px 14px",
                                backgroundColor: isExpanded ? "#059669" : "rgba(16, 185, 129, 0.12)",
                                color: isExpanded ? "#ffffff" : "#059669",
                                border: "1px solid rgba(16, 185, 129, 0.35)",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                transition: "all 0.15s ease",
                              }}
                              title={isExpanded ? "Hide candidate results" : "Show candidate results, marks breakdown, and export options"}
                            >
                              <FiBarChart2 style={{ fontSize: "14px" }} />
                              <span>{isExpanded ? "Hide Results" : "Show Results"}</span>
                              {isExpanded ? <FiChevronUp style={{ fontSize: "14px" }} /> : <FiChevronDown style={{ fontSize: "14px" }} />}
                            </button>

                            {/* Delete button for completed*/}
                            <button
                              type="button"
                              onClick={() => promptDeleteScheduled(item)}
                              disabled={actionInProgress === item.id}
                              style={{
                                padding: "7px 12px",
                                backgroundColor: "rgba(220, 38, 38, 0.1)",
                                color: "#dc2626",
                                border: "1px solid rgba(220, 38, 38, 0.25)",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 600,
                                cursor: actionInProgress === item.id ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Delete this examination record"
                            >
                              <FiTrash2 style={{ fontSize: "13px" }} />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${item.id}-results`} className="expanded-results-row">
                          <td colSpan={6} style={{ padding: "0 0 16px 0", background: "transparent" }}>
                            {renderExpandedResultsPanel(item)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Delete Exam Confirmation Modal */}
      {examDeleteModal.isOpen && examDeleteModal.item && (() => {
        const item = examDeleteModal.item;
        const expectedPhrase = `DELETE ${item.title || item.typeLabel || "EXAM"}`.trim();
        const isMatch = examDeleteModal.input.trim() === expectedPhrase;

        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 999999,
              padding: "20px",
              boxSizing: "border-box",
            }}
          >
            <div
              className="premium-card"
              style={{
                maxWidth: "480px",
                width: "100%",
                padding: "24px",
                borderRadius: "12px",
                backgroundColor: "var(--bg-surface, #ffffff)",
                border: "1px solid var(--border-color)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  backgroundColor: "#fee2e2",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontWeight: 700,
                  marginBottom: "12px",
                }}
              >
                !
              </div>

              <h3 style={{ margin: "0 0 6px 0", color: "var(--text-primary)", fontSize: "18px" }}>
                Delete Examination
              </h3>

              <p style={{ margin: "0 0 16px 0", color: "var(--text-secondary)", fontSize: "13.5px", lineHeight: "1.5" }}>
                You are about to delete <strong>{item.title}</strong> for cohort <strong>{item.cohortName}</strong>.
                This only removes the exam record; registered candidate applications remain safe.
              </p>

              <form onSubmit={confirmExecuteDeleteScheduled}>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                    To confirm, type <strong style={{ color: "#dc2626" }}>{expectedPhrase}</strong> below:
                  </label>
                  <input
                    type="text"
                    value={examDeleteModal.input}
                    onChange={(e) => setExamDeleteModal((prev) => ({ ...prev, input: e.target.value }))}
                    placeholder={expectedPhrase}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-primary)",
                      fontFamily: "monospace",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                    autoComplete="off"
                    autoFocus
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setExamDeleteModal({ isOpen: false, item: null, input: "" })}
                    disabled={isDeletingExam}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isMatch || isDeletingExam}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: isMatch ? "#dc2626" : "#cbd5e1",
                      color: isMatch ? "#ffffff" : "#64748b",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: isMatch && !isDeletingExam ? "pointer" : "not-allowed",
                    }}
                  >
                    {isDeletingExam ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

export default Exams;