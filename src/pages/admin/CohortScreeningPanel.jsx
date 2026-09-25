import React, { useState, useEffect } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import { examService } from "../../services/examService";
import { cohortService } from "../../services/cohortService";
import { Link, useLocation } from "react-router-dom";
import styles from "./CohortDetails.module.css";
import {
  FiClock,
  FiVideo,
  FiPlayCircle,
  FiSquare,
  FiCheckCircle,
  FiRefreshCw,
  FiDownload,
  FiCopy,
  FiCheck,
  FiAlertCircle,
  FiRotateCcw,
  FiLock,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";

const CohortScreeningPanel = ({ cohortId, cohort, onSync, manageResultsExternal, onResultsSaved }) => {
  const location = useLocation();
  const [questionBanks, setQuestionBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Existing screening state if already scheduled
  const existingScreening = cohort?.pre_screening || cohort?.screening_schedule || cohort?.screening || null;
  const [screening, setScreening] = useState(existingScreening);

  // Sync / fetch screening state whenever cohort or cohortId changes
  useEffect(() => {
    if (cohort?.pre_screening) {
      setScreening(cohort.pre_screening);
      return;
    }
    const fetchExistingScreening = async () => {
      if (!cohortId) return;
      try {
        const res = await apiClient.get(`/api/pre-screenings/?cohort=${cohortId}&page_size=1`);
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        if (list.length > 0) {
          setScreening(list[0]);
        }
      } catch (err) {
        console.warn("Could not fetch cohort pre-screening schedule:", err);
      }
    };
    fetchExistingScreening();
  }, [cohortId, cohort?.pre_screening]);

  const defaultStartTime = new Date();
  defaultStartTime.setDate(defaultStartTime.getDate() + 1);
  const defaultStartTimeISO = defaultStartTime.toISOString().slice(0, 16);
  
  const defaultEndTime = new Date(defaultStartTime);
  defaultEndTime.setHours(defaultEndTime.getHours() + 1);
  const defaultEndTimeISO = defaultEndTime.toISOString().slice(0, 16);

  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editForm, setEditForm] = useState({
    scheduled_at: defaultStartTimeISO,
    end_time: defaultEndTimeISO,
    duration_minutes: 10,
    pass_percentage: 40,
    question_bank_id: "",
    meeting_link: "",
    total_questions: "",
  });

  // Form state
  const [form, setForm] = useState({
    question_bank_id: "",
    scheduled_at: defaultStartTimeISO,
    end_time: defaultEndTimeISO,
    duration_minutes: 10,
    pass_percentage: 40,
    total_questions: "",
    meeting_link: "",
  });

  const [meetLinkAlert, setMeetLinkAlert] = useState("");
  const [editMeetLinkAlert, setEditMeetLinkAlert] = useState("");
  const [editPassPercentage, setEditPassPercentage] = useState(false);
  const [newPassPercentage, setNewPassPercentage] = useState("");
  const [applications, setApplications] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [editMeetingLink, setEditMeetingLink] = useState(false);
  const [meetingLinkInput, setMeetingLinkInput] = useState("");
  const [savingMeetingLink, setSavingMeetingLink] = useState(false);

  // Derive authoritative live status
  const now = new Date();
  const meetingStarted = Boolean(
    screening?.scheduled_at && now >= new Date(screening.scheduled_at)
  );
  const isStarted = Boolean(
    screening?.admin_started_at &&
    (!screening?.scheduled_at || new Date(screening.admin_started_at).getTime() >= new Date(screening.scheduled_at).getTime() - 15 * 60 * 1000)
  );
  const isEnded = screening?.end_time && now >= new Date(screening.end_time);
  const isActive = !isEnded && isStarted;
  const isScheduled = !isEnded && !isActive && !meetingStarted;
  const canStartExam = !isEnded && !isStarted && meetingStarted;

  // Real-time Countdown Timer for Screening Exam (Mentor / Admin)
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  useEffect(() => {
    if (!isActive || !screening?.admin_started_at || !isStarted) {
      setRemainingSeconds(null);
      return;
    }

    const durationMinutes = Number(screening?.duration_minutes || 10);
    const startMs = new Date(screening.admin_started_at).getTime();
    const endMs = startMs + durationMinutes * 60 * 1000;

    const tick = () => {
      const diff = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActive, isStarted, screening?.admin_started_at, screening?.duration_minutes]);

  const formatTimer = (sec) => {
    if (sec === null || sec === undefined) return "--:--";
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Check if cohort training phase has arrived
  const isCohortStarted = Boolean(
    (cohort?.start_date && now >= new Date(cohort.start_date)) ||
    ["TRAINING", "INTERNSHIP", "SOFT_SKILLS", "COMPLETED"].includes(cohort?.status)
  );

  const [updatingAppId, setUpdatingAppId] = useState(null);
  const [resultMarks, setResultMarks] = useState({});
  const [showResults, setShowResults] = useState(false);
  const manageResults = Boolean(manageResultsExternal);

  useEffect(() => {
    if (manageResultsExternal) setShowResults(true);
  }, [manageResultsExternal]);

  const handleSaveMeetingLink = async () => {
    if (!screening?.id) return;
    setSavingMeetingLink(true);
    try {
      await apiClient.patch(`/api/applications/prescreening/${screening.id}/`, {
        meeting_link: meetingLinkInput.trim(),
      });
      setScreening((prev) => ({ ...prev, meeting_link: meetingLinkInput.trim() }));
      setEditMeetingLink(false);
      setSuccessMessage("Meeting link updated successfully.");
      setTimeout(() => setSuccessMessage(""), 3500);
    } catch (err) {
      alert(err.response?.data?.detail || err.response?.data?.error || "Failed to update meeting link.");
    } finally {
      setSavingMeetingLink(false);
    }
  };

  const handleStartEditSchedule = async () => {
    if (isStarted || isEnded) return;
    const toLocalISO = (dStr) => {
      if (!dStr) return "";
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setEditMeetLinkAlert("");

    // Start with local screening state
    let src = screening || {};

    // If the local screening state is missing key fields, fetch fresh data from API
    if (!src.duration_minutes && !src.total_questions && cohortId) {
      try {
        const res = await apiClient.get(`/api/pre-screenings/?cohort=${cohortId}&page_size=1`);
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        if (list.length > 0) {
          src = { ...src, ...list[0] };
          // Also update the screening state for future reference
          setScreening((prev) => prev ? { ...prev, ...list[0] } : list[0]);
        }
      } catch (e) {
        console.warn("Could not fetch fresh screening data for prefill:", e);
      }
    }

    // Look for previous values from screening, existing candidate exams in applications, or cohort
    const firstExam = applications.find((a) => a.screening_exam || a.exam)?.screening_exam ||
                      applications.find((a) => a.screening_exam || a.exam)?.exam || null;

    const prevDuration = src?.duration_minutes ??
                         firstExam?.duration_minutes ??
                         cohort?.pre_screening?.duration_minutes ??
                         form.duration_minutes ?? 10;

    const prevPassPct = src?.pass_percentage ??
                        firstExam?.pass_percentage ??
                        cohort?.pre_screening?.pass_percentage ??
                        form.pass_percentage ?? 40;

    const prevQbId = src?.question_bank_id ||
                     src?.question_bank ||
                     cohort?.pre_screening?.question_bank_id ||
                     cohort?.pre_screening?.question_bank ||
                     form.question_bank_id || "";

    const qbObj = questionBanks.find((b) => String(b.id) === String(prevQbId));

    const prevQuestions = src?.total_questions ??
                          firstExam?.total_questions ??
                          cohort?.pre_screening?.total_questions ??
                          qbObj?.total_questions_per_set ??
                          form.total_questions ?? "";

    const prevMeet = src?.meeting_link ||
                     cohort?.pre_screening?.meeting_link ||
                     cohort?.meeting_link || "";

    setEditForm({
      scheduled_at: toLocalISO(src?.scheduled_at || cohort?.pre_screening?.scheduled_at),
      end_time: toLocalISO(src?.end_time || cohort?.pre_screening?.end_time),
      duration_minutes: prevDuration,
      pass_percentage: prevPassPct,
      question_bank_id: prevQbId,
      meeting_link: prevMeet,
      total_questions: prevQuestions,
    });
    setIsEditingSchedule(true);
  };

  // Auto-open edit schedule mode if navigated from another page with editSchedule flag
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldEdit = params.get("editSchedule") === "true" || location.state?.editSchedule;
    if (shouldEdit && screening && !isStarted && !isEnded) {
      handleStartEditSchedule();
    }
  }, [screening, location.search, location.state, isStarted, isEnded]);

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!editForm.scheduled_at || !editForm.end_time) {
      alert("Start time and meeting end time are required.");
      return;
    }
    const start = new Date(editForm.scheduled_at);
    const end = new Date(editForm.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      alert("Invalid date/time provided.");
      return;
    }
    if (end <= start) {
      alert("Meeting end time must be after the scheduled start time.");
      return;
    }
    if (!editForm.question_bank_id) {
      alert("Please select an approved Question Bank.");
      return;
    }
    const editQuestionBank = questionBanks.find((bank) => String(bank.id) === String(editForm.question_bank_id));
    const editBankTotal = Number(editQuestionBank?.total_questions_per_set || editQuestionBank?.total_questions || editQuestionBank?.questions_count || 0);
    if (editBankTotal && Number(editForm.total_questions) > editBankTotal) {
      alert(`Total questions cannot exceed the selected bank total of ${editBankTotal}.`);
      return;
    }

    setBusy(true);
    setEditMeetLinkAlert("");
    try {
      const payload = {
        question_bank_id: editForm.question_bank_id,
        scheduled_at: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: Number(editForm.duration_minutes) || 10,
        pass_percentage: Number(editForm.pass_percentage) || 40,
        meeting_link: editForm.meeting_link?.trim() || null,
        total_questions: editForm.total_questions ? Number(editForm.total_questions) : null,
      };

      const res = await apiClient.post(
        API_ENDPOINTS.COHORTS.SCHEDULE_SCREENING(cohortId),
        payload
      );

      const qbObj = questionBanks.find((b) => String(b.id) === String(editForm.question_bank_id));
      const updatedScreening = res.data?.screening || {
        ...screening,
        scheduled_at: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: Number(editForm.duration_minutes) || 10,
        pass_percentage: Number(editForm.pass_percentage) || 40,
        total_questions: editForm.total_questions ? Number(editForm.total_questions) : null,
        question_bank_id: editForm.question_bank_id,
        question_bank: editForm.question_bank_id,
        question_bank_title: qbObj?.title || screening?.question_bank_title,
        meeting_link: res.data?.meeting_link || editForm.meeting_link?.trim() || screening?.meeting_link,
      };

      setScreening({
        ...updatedScreening,
        admin_started_at: null,
        status: "SCHEDULED",
        is_released: false,
      });

      setIsEditingSchedule(false);
      setSuccessMessage("Screening schedule updated successfully!");
      setTimeout(() => setSuccessMessage(""), 4000);
      await loadApplications();
      if (typeof onSync === "function") {
        onSync();
      }
    } catch (err) {
      console.error("Failed to update screening schedule:", err);
      const errData = err.response?.data || {};
      const isMeetErr =
        errData.meeting_link_required ||
        errData.code === "MEETING_LINK_REQUIRED" ||
        String(errData.meeting_link || "").toLowerCase().includes("meeting link") ||
        String(errData.error || "").toLowerCase().includes("meeting link") ||
        String(errData.detail || "").toLowerCase().includes("meeting link");

      if (isMeetErr) {
        setEditMeetLinkAlert("Automatic meeting link generation was not successful (Google Calendar API unavailable). Please enter the meeting link manually below.");
        setTimeout(() => {
          document.getElementById("edit-meeting-link-input")?.focus();
        }, 100);
        return;
      }

      alert(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to update screening schedule."
      );
    } finally {
      setBusy(false);
    }
  };

  // Helper to extract candidate name robustly
  const getCandidateName = (app) => {
    if (app.candidate_name && app.candidate_name !== "Candidate") return app.candidate_name;
    if (app.student_name && app.student_name !== "Candidate") return app.student_name;
    if (app.student_details?.name) return app.student_details.name;
    const stu = typeof app.student === "object" ? app.student : null;
    const user = stu?.user || {};
    const fromStu = `${stu?.first_name || ""} ${stu?.last_name || ""}`.trim() || user.username;
    if (fromStu) return fromStu;
    return app.candidate_name || app.student_name || "Candidate";
  };

  // Helper to extract candidate email robustly
  const getCandidateEmail = (app) => {
    if (app.candidate_email && !app.candidate_email.includes("suretrust.org")) return app.candidate_email;
    if (app.student_email && !app.student_email.includes("suretrust.org")) return app.student_email;
    if (app.student_details?.email) return app.student_details.email;
    const stu = typeof app.student === "object" ? app.student : null;
    const user = stu?.user || {};
    return user.email || stu?.email || app.candidate_email || app.student_email || "—";
  };

  const loadApplications = async () => {
    if (!cohortId) return;
    try {
      const data = await applicationService.getApplications({ cohort: cohortId });
      let list = Array.isArray(data) ? data : (data?.results || []);
      // If no cohort-assigned applications found yet, fallback to pre-screenings for this cohort
      if (list.length === 0) {
        try {
          const psRes = await apiClient.get(`/api/pre-screenings/?cohort=${cohortId}&page_size=200`);
          const psList = Array.isArray(psRes.data) ? psRes.data : (psRes.data?.results || []);
          if (psList.length > 0) {
            list = psList.map((ps) => ps.application_details || {
              id: typeof ps.application === "object" ? ps.application.id : ps.application,
              application_number: ps.application_number,
              student_name: ps.student_name || ps.candidate_name,
              student_email: ps.student_email || ps.candidate_email,
              student_code: ps.student_code,
              status: ps.status,
            });
          }
        } catch (e) {
          console.warn("Could not fallback to pre-screenings list:", e);
        }
      }
      setApplications(list);
    } catch (err) {
      console.error("Failed to load applications for cohort:", err);
    }
  };

  useEffect(() => {
    loadApplications();
  }, [cohortId, cohort]);

  const handleSyncData = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      // 1. Reload latest applications and candidate records
      await loadApplications();
      // 2. Re-fetch screening schedule details
      const response = await apiClient.get(API_ENDPOINTS.COHORTS.SCHEDULE_SCREENING(cohortId)).catch(() => null);
      if (response && response.data) {
        setScreening(response.data);
      }
      // 3. Notify parent cohort details if onSync callback provided
      if (typeof onSync === "function") {
        await onSync();
      }
      setSuccessMessage("Screening data and student records refreshed successfully!");
      setSyncMessage("Data refreshed successfully.");
      setTimeout(() => {
        setSuccessMessage("");
        setSyncMessage("");
      }, 4000);
    } catch (err) {
      console.error("Failed to refresh screening data:", err);
      setSyncMessage("Failed to refresh: " + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const saveScreeningResult = async (app, marksValue = resultMarks[app.id]) => {
    const exam = app.screening_exam || app.exam || {};
    if (!exam.id) return;
    const marks = Number(marksValue);
    const totalMarks = Number(exam.total_marks || screening?.total_questions || 10);
    if (!Number.isFinite(marks) || marks < 0 || marks > totalMarks) {
      alert(`Enter marks between 0 and ${totalMarks}.`);
      return;
    }
    const percentage = totalMarks ? Number(((marks / totalMarks) * 100).toFixed(2)) : 0;
    const passPercentage = Number(exam.pass_percentage ?? screening?.pass_percentage ?? 40);
    const expectedQualified = percentage >= passPercentage;
    setUpdatingAppId(app.id);
    try {
      await apiClient.patch(`/api/exams/${exam.id}/`, {
        marks_obtained: marks,
        total_marks: totalMarks,
        percentage,
        qualified: expectedQualified,
        status: "EVALUATED",
        submitted_at: new Date().toISOString(),
      });
      await apiClient.post(API_ENDPOINTS.APPLICATIONS.REPAIR_STATE(app.id), {
        status: expectedQualified ? "QUALIFIED" : "REJECTED",
        reason: "Administrator corrected the screening examination result.",
      });
      await loadApplications();
      setSuccessMessage("Screening result updated successfully.");
    } catch (err) {
      alert(err.response?.data?.detail || err.response?.data?.error || "Failed to update screening result.");
    } finally {
      setUpdatingAppId(null);
    }
  };

  const saveAllScreeningResults = async () => {
    const entries = applications
      .map((app) => ({ app, exam: app.screening_exam || app.exam || {}, marks: resultMarks[app.id] }))
      .filter(({ exam, marks }) => exam.id && marks !== undefined && marks !== "");
    if (!entries.length) {
      alert("Enter marks for at least one candidate before saving.");
      return;
    }
    setUpdatingAppId("all");
    try {
      for (const { app, marks } of entries) {
        await saveScreeningResult(app, marks);
      }
      setSuccessMessage("Screening results saved and qualification statuses updated automatically.");
      onResultsSaved?.();
    } finally {
      setUpdatingAppId(null);
    }
  };

  const [exportFilter, setExportFilter] = useState("ALL");

  const handleExportExcel = async (filterOverride = exportFilter) => {
    let exportApplications = applications;
    if (!exportApplications || exportApplications.length === 0) {
      exportApplications = await applicationService.getApplications({ cohort: cohortId, page_size: 200 }).catch(() => []);
    }
    if (!exportApplications || exportApplications.length === 0) {
      alert("No applicant records found to export.");
      return;
    }

    const filteredApps = exportApplications.filter((app) => {
      const exam = app.screening_exam || app.exam || {};
      const hasSubmitted = Boolean(
        exam.submitted_at ||
        exam.status === "EVALUATED" ||
        exam.status === "SUBMITTED" ||
        app.status === "QUALIFIED" ||
        app.status === "EXAM_COMPLETED" ||
        exam.marks_obtained != null ||
        app.qualification_score != null
      );
      const isAbsentOrUnsubmitted = isEnded && !hasSubmitted;
      const qualifiedStatuses = [
        "QUALIFIED",
        "COHORT_ASSIGNED",
        "IN_PROGRESS",
        "TRAINING",
        "INTERNSHIP_ASSIGNED",
        "SOFT_SKILLS",
        "COMPLETED",
      ];
      const isQual =
        qualifiedStatuses.includes(String(app.status || "")) ||
        exam.qualified === true ||
        app.status === "QUALIFIED";
      const isNotQual =
        app.status === "NOT_QUALIFIED" ||
        app.status === "REJECTED" ||
        exam.qualified === false ||
        isAbsentOrUnsubmitted;

      if (filterOverride === "PASSED") return isQual;
      if (filterOverride === "FAILED") return isNotQual;
      return true;
    });

    if (filteredApps.length === 0) {
      alert(`No applicant records found for filter: ${filterOverride}`);
      return;
    }
    const cohortName = cohort?.name || cohort?.code || cohortId;
    const headers = ["Student Name", "Email", "Application ID", "Course", "Cohort", "Status", "Score", "Percentage"];
    const rows = filteredApps.map((app) => {
      const name = getCandidateName(app);
      const email = getCandidateEmail(app);
      const exam = app.screening_exam || app.exam || {};
      const isEnrolled = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "COMPLETED"].includes(app.status);
      const hasSubmitted = Boolean(
        exam.submitted_at ||
        exam.status === "EVALUATED" ||
        exam.status === "SUBMITTED" ||
        app.status === "QUALIFIED" ||
        app.status === "EXAM_COMPLETED" ||
        exam.marks_obtained != null ||
        app.qualification_score != null
      );
      const isAbsentOrUnsubmitted = isEnded && !hasSubmitted;

      let finalStatus = app.status || "PENDING";
      let score = exam.marks_obtained != null ? exam.marks_obtained : (app.qualification_score != null ? app.qualification_score : "");
      let pct = exam.percentage != null ? `${exam.percentage}%` : (app.qualification_score != null ? `${app.qualification_score}%` : "");

      if (isAbsentOrUnsubmitted) {
        finalStatus = "REJECTED";
        score = 0;
        pct = "0%";
      } else if (isEnrolled) {
        finalStatus = "ENROLLED";
      } else if (app.status === "QUALIFIED" || exam.qualified === true) {
        finalStatus = "QUALIFIED";
      } else if (app.status === "NOT_QUALIFIED" || app.status === "REJECTED" || exam.qualified === false) {
        finalStatus = "REJECTED";
      }

      return [
        `"${name}"`,
        `"${email}"`,
        `"${app.application_number || app.id}"`,
        `"${app.course_name || app.course_title || ""}"`,
        `"${cohortName}"`,
        `"${finalStatus}"`,
        `"${score}"`,
        `"${pct}"`,
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const file = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.setAttribute("href", downloadUrl);
    link.setAttribute("download", `Exam_Results_${String(cohortName).replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  };

  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const courseId =
          typeof cohort?.course === "object" ? cohort?.course?.id : cohort?.course || cohort?.course_id;
        const params = { bank_type: "PRESCREENING", status: "APPROVED", page_size: 200 };
        if (courseId) params.course = courseId;

        const response = await apiClient.get(API_ENDPOINTS.QUESTION_BANKS.BASE, { params });
        let banks = response.data?.results || response.data || [];

        if (courseId) {
          banks = banks.filter((b) => {
            const bankCourseId = typeof b.course === "object" ? b.course?.id : b.course || b.course_id;
            return String(bankCourseId) === String(courseId);
          });
        }

        setQuestionBanks(banks);
      } catch (err) {
        console.error("Failed to load question banks:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBanks();
  }, [cohort]);

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (!form.question_bank_id) return alert("Please select a verified question bank.");
    const selectedBank = questionBanks.find((bank) => String(bank.id) === String(form.question_bank_id));
    const bankTotalQuestions = Number(selectedBank?.total_questions_per_set || selectedBank?.total_questions || selectedBank?.questions_count || 0);
    if (bankTotalQuestions && form.total_questions && Number(form.total_questions) > bankTotalQuestions) {
      return alert(`Total questions cannot exceed the selected bank total of ${bankTotalQuestions}.`);
    }
    
    const start = new Date(form.scheduled_at);
    const end = new Date(form.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return alert("Invalid date/time provided for the schedule.");
    }
    if (end <= start) {
      return alert("Meeting end time must be after the scheduled start time.");
    }

    setBusy(true);
    setError("");
    setMeetLinkAlert("");
    setSuccessMessage("");
    try {
      const payload = {
        question_bank_id: form.question_bank_id,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        duration_minutes: Number(form.duration_minutes) || 10,
        pass_percentage: Number(form.pass_percentage) || 40,
        total_questions: form.total_questions ? Number(form.total_questions) : null,
        meeting_link: form.meeting_link?.trim() || null,
      };
      const res = await cohortService.scheduleScreening(cohortId, payload);
      setScreening(res.screening || res.pre_screening || res);
      setSuccessMessage("Screening exam scheduled successfully! It will remain scheduled until you start it.");
    } catch (err) {
      const errData = err.response?.data || {};
      const isMeetErr =
        errData.meeting_link_required ||
        errData.code === "MEETING_LINK_REQUIRED" ||
        String(errData.meeting_link || "").toLowerCase().includes("meeting link") ||
        String(errData.error || "").toLowerCase().includes("meeting link") ||
        String(errData.detail || "").toLowerCase().includes("meeting link");

      if (isMeetErr) {
        setMeetLinkAlert("Automatic meeting link generation was not successful (Google Calendar API unavailable). Please enter the meeting link manually below.");
        setTimeout(() => {
          document.getElementById("initial-meeting-link-input")?.focus();
        }, 100);
        return;
      }

      setError(
        err.response?.data?.detail ||
          err.response?.data?.error ||
          err.message ||
          "Failed to schedule screening exam."
      );
    } finally {
      setBusy(false);
    }
  };

  // Start exam early (Manual Override)
  const handleStartExamEarly = async () => {
    if (
      !window.confirm(
        "Start this screening exam now? Candidates will be allowed to start attempting their quiz immediately."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await cohortService.startScreening(cohortId);
      const startedAt = res.admin_started_at || new Date().toISOString();
      setScreening((prev) => ({
        ...prev,
        admin_started_at: startedAt,
        is_released: true,
      }));
      setSuccessMessage("Exam is now LIVE! Candidates can begin their attempts immediately.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Failed to start exam.");
    } finally {
      setBusy(false);
    }
  };

  // End exam early (Manual Override)
  const handleEndExamEarly = async () => {
    if (
      !window.confirm(
        "End this exam now? The exam window will close immediately, preventing any new candidate attempts."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await cohortService.endScreening(cohortId);
      const endedAt = res.end_time || new Date().toISOString();
      setScreening((prev) => ({
        ...prev,
        end_time: endedAt,
      }));
      setSuccessMessage(res?.message || "Exam window has been closed successfully. Unattempted candidates have been marked as failed.");
      setTimeout(() => setSuccessMessage(""), 5000);
      await loadApplications();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Failed to end exam.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePassPercentage = async () => {
    if (!screening?.exam || !newPassPercentage) return;
    setBusy(true);
    try {
      await examService.updateExam(screening.exam, { pass_percentage: Number(newPassPercentage) });
      setScreening((prev) => ({ ...prev, pass_percentage: Number(newPassPercentage) }));
      setEditPassPercentage(false);
    } catch (err) {
      alert("Failed to update pass percentage.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.panel}>
        <p>Loading screening context...</p>
      </div>
    );
  }

  if (isCohortStarted) {
    return (
      <div
        style={{
          marginTop: "1.5rem",
          padding: "20px 24px",
          borderRadius: "16px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
            }}
          >
            <FiCheckCircle />
          </div>
          <div>
            <h4
              style={{
                margin: "0 0 4px 0",
                fontSize: "16px",
                fontWeight: "700",
                color: "var(--text-primary)",
              }}
            >
              Cohort Training Phase is Active
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--text-secondary)",
                maxWidth: "600px",
              }}
            >
              The cohort start date has arrived. The pre-screening schedule and candidate results
              table are archived from this cohort view. You can review and download the screening
              results anytime from the Exams section.
            </p>
          </div>
        </div>
        <Link
          to="/admin/exams"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            backgroundColor: "var(--primary-color)",
            color: "#ffffff",
            borderRadius: "8px",
            fontWeight: "600",
            fontSize: "13px",
            textDecoration: "none",
          }}
        >
          <FiDownload /> Download Results in Exams
        </Link>
      </div>
    );
  }

  return (
    <div
      className={styles.panel}
      style={{
        marginTop: "1.5rem",
        border: "1px solid var(--border-color)",
        backgroundColor: "var(--bg-nested)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className={styles.panelHeader}
        style={{
          padding: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <FiClock /> Cohort Screening Exam
          </h2>
          <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
            Schedule and manage the candidate entrance assessment for this cohort.
          </p>
        </div>

        {/* Live Status Badge if already scheduled */}
        {screening && (
          <div>
            {isActive ? (
              <span
                style={{
                  padding: "8px 16px",
                  backgroundColor: "rgba(22, 163, 74, 0.15)",
                  color: "#16a34a",
                  border: "1.5px solid #16a34a",
                  borderRadius: "20px",
                  fontWeight: "700",
                  fontSize: "13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "#16a34a",
                    display: "inline-block",
                  }}
                />
                LIVE · IN PROGRESS
              </span>
            ) : isScheduled ? (
              <span
                style={{
                  padding: "8px 16px",
                  backgroundColor: "rgba(37, 99, 235, 0.1)",
                  color: "#2563eb",
                  border: "1.5px solid #93c5fd",
                  borderRadius: "20px",
                  fontWeight: "700",
                  fontSize: "13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiClock /> Meeting will start at the scheduled time.
              </span>
            ) : (
              <span
                style={{
                  padding: "8px 16px",
                  backgroundColor: "rgba(100, 116, 139, 0.1)",
                  color: "var(--text-secondary)",
                  border: "1.5px solid var(--border-color)",
                  borderRadius: "20px",
                  fontWeight: "700",
                  fontSize: "13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiLock /> EXAM CLOSED
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.panelBody} style={{ padding: "1.5rem" }}>
        {error && (
          <div
            style={{
              color: "#b91c1c",
              backgroundColor: "#fee2e2",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiAlertCircle /> {error}
          </div>
        )}

        {successMessage && (
          <div
            style={{
              color: "#15803d",
              backgroundColor: "#dcfce7",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiCheckCircle /> {successMessage}
          </div>
        )}

        {!screening ? (
          /* ================= SCHEDULING FORM ================= */
          <form
            onSubmit={handleSchedule}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "16px",
              alignItems: "end",
              width: "100%",
            }}
          >
            {/* Question Bank */}
            <label style={{ display: "flex", flexDirection: "column", gridColumn: "span 2" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                  Verified Question Bank
                </strong>
                <Link
                  to="/admin/question-banks"
                  style={{
                    fontSize: "12px",
                    color: "var(--primary-color)",
                    textDecoration: "none",
                    fontWeight: "600",
                  }}
                >
                  + Add / View Banks
                </Link>
              </div>
              <select
                value={form.question_bank_id}
                onChange={(e) => {
                  const val = e.target.value;
                  const selectedBank = questionBanks.find(b => String(b.id) === String(val));
                  setForm({ 
                    ...form, 
                    question_bank_id: val,
                    total_questions: selectedBank ? (selectedBank.total_questions_per_set || selectedBank.total_questions || selectedBank.questions_count || selectedBank.questions?.length || form.total_questions) : form.total_questions
                  });
                }}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                required
              >
                <option value="">-- Select Question Bank --</option>
                {questionBanks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.title || bank.id} ({bank.total_questions_per_set || bank.total_questions || bank.questions_count || bank.questions?.length || "?"} questions)
                  </option>
                ))}
              </select>
            </label>

            {/* Meeting Start Time */}
            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>
                Meeting Start Time
              </strong>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                required
              />
            </label>

            {/* End Time */}
            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>
                Meeting End Time
              </strong>
              <input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                required
              />
            </label>

            {/* Duration (Minutes) */}
            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>
                Duration (Mins)
              </strong>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                min="5"
                max="240"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                required
              />
            </label>

            {/* Pass Percentage */}
            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>
                Passing Benchmark (%)
              </strong>
              <input
                type="number"
                value={form.pass_percentage}
                onChange={(e) => setForm({ ...form, pass_percentage: e.target.value })}
                min="0"
                max="100"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
                required
              />
            </label>

            {/* Total Questions */}
            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>
                Total Questions
              </strong>
              <input
                type="number"
                value={form.total_questions}
                onChange={(e) => setForm({ ...form, total_questions: e.target.value })}
                placeholder="All"
                min="1"
                max={questionBanks.find((bank) => String(bank.id) === String(form.question_bank_id))?.total_questions_per_set || undefined}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </label>

            {/* Meeting Link Banner if auto generation failed */}
            {meetLinkAlert && (
              <div
                style={{
                  gridColumn: "span 2",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #f87171",
                  color: "#b91c1c",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiAlertCircle style={{ flexShrink: 0, fontSize: "16px" }} />
                <span>{meetLinkAlert}</span>
              </div>
            )}

            {/* Meeting Link */}
            <label style={{ display: "flex", flexDirection: "column", gridColumn: "span 2" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>
                Meeting Link (Optional)
              </strong>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                Leave blank to auto-generate a new Google Meet link
              </span>
              <input
                id="initial-meeting-link-input"
                type="url"
                value={form.meeting_link}
                onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
                placeholder="Leave blank for auto-generate, or paste a link"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </label>

            <div style={{ gridColumn: "1 / -1", marginTop: "12px" }}>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: "12px 28px",
                  backgroundColor: "var(--primary-color)",
                  color: "var(--button-primary-text)",
                  borderRadius: "8px",
                  border: "none",
                  fontWeight: "600",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontSize: "15px",
                  transition: "all 0.2s",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiClock /> {busy ? "Scheduling Exam..." : "Schedule Screening Exam"}
              </button>
            </div>
          </form>
        ) : (
          /* ================= SCHEDULED EXAM DETAILS & CONTROLS ================= */
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Header with Title, Question Bank Badge, and Edit Schedule Button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-primary)" }}>
                  Scheduled Pre-Screening Assessment
                </span>
                {screening.question_bank_title && (
                  <span style={{ fontSize: "12px", background: "rgba(37, 99, 235, 0.1)", color: "var(--primary-color)", padding: "3px 10px", borderRadius: "12px", fontWeight: "600" }}>
                    📚 {screening.question_bank_title}
                  </span>
                )}
              </div>
              {!isEditingSchedule && !isStarted && !isEnded && (
                <button
                  type="button"
                  onClick={handleStartEditSchedule}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    padding: "6px 14px",
                    backgroundColor: "var(--bg-nested)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                  title="Modify the scheduled start time, cutoff, question bank, or duration. You can reschedule a closed exam to reopen it."
                >
                  ✏️ Edit / Reschedule
                </button>
              )}
            </div>

            {/* Inline Schedule Editing Form */}
            {isEditingSchedule ? (
              <form
                onSubmit={handleSaveSchedule}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  padding: "20px",
                  borderRadius: "10px",
                  border: "2px solid var(--primary-color)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0, color: "var(--primary-color)" }}>✏️ Edit Screening Examination Schedule</h4>
                  <button
                    type="button"
                    onClick={() => setIsEditingSchedule(false)}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}
                  >
                    ✕
                  </button>
                </div>

                {editMeetLinkAlert && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #f87171",
                      color: "#b91c1c",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <FiAlertCircle style={{ flexShrink: 0, fontSize: "16px" }} />
                    <span>{editMeetLinkAlert}</span>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                  {/* Select Question Bank */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                      Approved Question Bank *
                    </label>
                    <select
                      value={editForm.question_bank_id}
                      onChange={(e) => {
                        const selectedBank = questionBanks.find((bank) => String(bank.id) === String(e.target.value));
                        setEditForm((prev) => ({
                          ...prev,
                          question_bank_id: e.target.value,
                          total_questions: selectedBank?.total_questions_per_set || selectedBank?.total_questions || selectedBank?.questions_count || prev.total_questions,
                        }));
                      }}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    >
                      <option value="">-- Choose question bank --</option>
                      {questionBanks.map((qb) => (
                        <option key={qb.id} value={qb.id}>
                          {qb.title} (Sets: {Array.isArray(qb.set_codes) ? qb.set_codes.join(", ") : "A"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Meeting Start Time */}
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                      Meeting Start Time <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.scheduled_at}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, scheduled_at: e.target.value }))}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* End Time */}
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                      Meeting End Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.end_time}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, end_time: e.target.value }))}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                      Duration (Minutes) *
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="240"
                      value={editForm.duration_minutes}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* Pass Benchmark */}
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                      Passing Benchmark (%) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={editForm.pass_percentage}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, pass_percentage: e.target.value }))}
                      required
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* Total Questions */}
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                      No. of Questions
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="e.g. 10 (Bank default)"
                      value={editForm.total_questions}
                      max={questionBanks.find((bank) => String(bank.id) === String(editForm.question_bank_id))?.total_questions_per_set || undefined}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, total_questions: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* Meeting Link */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                      Google Meet Link (Optional)
                    </label>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                      Leave blank to auto-generate a new Google Meet link, or keep/paste a custom link
                    </span>
                    <input
                      id="edit-meeting-link-input"
                      type="url"
                      placeholder="Leave blank for auto-generate, or paste link"
                      value={editForm.meeting_link}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, meeting_link: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setIsEditingSchedule(false)}
                    disabled={busy}
                    style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    style={{ padding: "8px 20px", borderRadius: "6px", border: "none", backgroundColor: "var(--primary-color)", color: "white", fontWeight: "600", cursor: busy ? "not-allowed" : "pointer" }}
                  >
                    {busy ? "Saving Schedule..." : "Save Updated Schedule"}
                  </button>
                </div>
              </form>
            ) : (
              /* Meta Tiles Grid */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "16px",
                  backgroundColor: "var(--bg-surface)",
                  padding: "18px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "12px", fontWeight: "600" }}>
                    START TIME
                  </p>
                  <h4 style={{ margin: "6px 0 0 0", fontSize: "15px" }}>
                    {new Date(screening.scheduled_at).toLocaleString()}
                  </h4>
                </div>

                <div>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "12px", fontWeight: "600" }}>
                    MEETING END TIME
                  </p>
                  <h4 style={{ margin: "6px 0 0 0", fontSize: "15px" }}>
                    {new Date(screening.end_time).toLocaleString()}
                  </h4>
                </div>

                <div>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "12px", fontWeight: "600" }}>
                    EXAM DURATION
                  </p>
                  <h4 style={{ margin: "6px 0 0 0", fontSize: "15px" }}>
                    {screening.duration_minutes || form.duration_minutes || 10} Minutes
                  </h4>
                </div>

                <div>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "12px", fontWeight: "600" }}>
                    QUESTIONS
                  </p>
                  <h4 style={{ margin: "6px 0 0 0", fontSize: "15px" }}>
                    {screening.total_questions || form.total_questions || "Bank default"}
                  </h4>
                </div>

                <div>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "12px", fontWeight: "600" }}>
                    PASS BENCHMARK
                  </p>
                  {editPassPercentage && !isActive && !isEnded ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newPassPercentage}
                        onChange={(e) => setNewPassPercentage(e.target.value)}
                        style={{
                          width: "65px",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          border: "1px solid var(--border-color)",
                        }}
                      />
                      <button
                        onClick={handleUpdatePassPercentage}
                        disabled={busy}
                        style={{
                          backgroundColor: "var(--primary-color)",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          padding: "5px 10px",
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditPassPercentage(false)}
                        style={{
                          backgroundColor: "var(--text-muted)",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          padding: "5px 10px",
                          cursor: "pointer",
                        }}
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <h4 style={{ margin: "6px 0 0 0", display: "flex", alignItems: "center", gap: "8px", fontSize: "15px" }}>
                      {screening.pass_percentage ?? form.pass_percentage}%
                      {!isActive && !isEnded && (
                        <button
                          onClick={() => {
                            setEditPassPercentage(true);
                            setNewPassPercentage(screening.pass_percentage ?? form.pass_percentage);
                          }}
                          style={{
                            fontSize: "11px",
                            background: "none",
                            border: "1px solid var(--border-color)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            cursor: "pointer",
                            color: "var(--text-primary)",
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </h4>
                  )}
                </div>
              </div>
            )}

            {/* Exam Time Ended Alert when countdown reaches 00:00 */}
            {isActive && isStarted && remainingSeconds === 0 && (
              <div
                style={{
                  width: "100%",
                  padding: "12px 18px",
                  backgroundColor: "#fef2f2",
                  border: "1.5px solid #f87171",
                  borderRadius: "8px",
                  color: "#991b1b",
                  fontWeight: "600",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "12px",
                  boxShadow: "0 2px 8px rgba(239, 68, 68, 0.15)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <FiAlertCircle size={20} color="#dc2626" />
                  <span>Exam time has ended. Please end the examination.</span>
                </div>
                <button
                  type="button"
                  onClick={handleEndExamEarly}
                  disabled={busy}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "bold",
                    cursor: busy ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                  }}
                >
                  <FiSquare size={14} /> End Exam
                </button>
              </div>
            )}

            {/* Prominent Action Controls for Mentor / Admin */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              {/* Early Start Button */}
              {(isScheduled || canStartExam) && (
                <button
                  type="button"
                  onClick={handleStartExamEarly}
                  disabled={busy}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    cursor: busy ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px",
                    boxShadow: "0 2px 4px rgba(22, 163, 74, 0.2)",
                  }}
                  title={canStartExam ? "Meeting has started — authorize the cohort to begin the exam" : "Starts the exam immediately for candidates"}
                >
                  <FiPlayCircle style={{ fontSize: "18px" }} />
                  {busy ? "Starting..." : canStartExam ? "Start Exam (Meeting Started)" : "Start Exam"}
                </button>
              )}


              {/* Countdown Clock for Active Exam */}
              {isActive && remainingSeconds !== null && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    backgroundColor: remainingSeconds === 0 ? "#fee2e2" : "var(--bg-nested)",
                    border: `1.5px solid ${remainingSeconds === 0 ? "#ef4444" : "var(--border-color)"}`,
                    color: remainingSeconds === 0 ? "#dc2626" : "var(--text-primary)",
                    fontWeight: "700",
                    fontFamily: "monospace",
                    fontSize: "15px",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  title="Remaining Screening Exam Time"
                >
                  <FiClock style={{ color: remainingSeconds === 0 ? "#dc2626" : "var(--primary-color)" }} />
                  ⏱ {formatTimer(remainingSeconds)}
                </div>
              )}

              {/* Early End Button */}
              {isActive && (
                <button
                  type="button"
                  onClick={handleEndExamEarly}
                  disabled={busy}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    cursor: busy ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px",
                    boxShadow: "0 2px 4px rgba(220, 38, 38, 0.2)",
                  }}
                  title="End the screening exam for this cohort"
                >
                  <FiSquare style={{ fontSize: "16px" }} />
                  {busy ? "Ending..." : "End Exam"}
                </button>
              )}



              {/* Download Results Excel */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <select
                  value={exportFilter}
                  onChange={(e) => setExportFilter(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-input)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    outline: "none",
                  }}
                >
                  <option value="ALL">All Candidates</option>
                  <option value="PASSED">Passed Only</option>
                  <option value="FAILED">Failed Only</option>
                </select>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 20px",
                    backgroundColor: "#059669",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "600",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  <FiDownload /> Download Results
                </button>
                <button
                  type="button"
                  onClick={() => handleExportExcel("PASSED")}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontWeight: "600", fontSize: "14px", cursor: "pointer" }}
                >
                  <FiDownload /> Qualified Students
                </button>
              </div>

              {/* Sync Button */}
              <button
                type="button"
                onClick={handleSyncData}
                disabled={syncing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  backgroundColor: "var(--bg-nested)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: syncing ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  transition: "all 0.2s ease",
                }}
                title="Refresh latest screening data, student statuses, and counts from backend"
              >
                <FiRefreshCw style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
                {syncing ? "Syncing..." : "Sync"}
              </button>

              {/* Google Meet Link */}
              {screening.meeting_link ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {isEnded ? (
                    <button
                      type="button"
                      disabled
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 18px",
                        backgroundColor: "#9ca3af",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: "600",
                        fontSize: "14px",
                        cursor: "not-allowed",
                        opacity: 0.7,
                      }}
                      title="Screening exam session has ended"
                    >
                      <FiVideo /> Join Meet (Ended)
                    </button>
                  ) : (
                    <a
                      href={screening.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 18px",
                        backgroundColor: "#0b57d0",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: "8px",
                        fontWeight: "600",
                        fontSize: "14px",
                      }}
                    >
                      <FiVideo /> Join Meet
                    </a>
                  )}
                  {!isEnded && (
                    <button
                      type="button"
                      onClick={() => {
                        setMeetingLinkInput(screening.meeting_link);
                        setEditMeetingLink(!editMeetingLink);
                      }}
                      style={{
                        fontSize: "12px",
                        background: "none",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMeetingLinkInput("");
                      setEditMeetingLink(!editMeetingLink);
                    }}
                    style={{
                      padding: "12px 18px",
                      backgroundColor: "#0b57d0",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FiVideo /> + Add Meet Link
                  </button>
                </div>
              )}
            </div>

            {/* Edit Meeting Link Box */}
            {editMeetingLink && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  maxWidth: "650px",
                }}
              >
                <FiVideo style={{ color: "#0b57d0", fontSize: "18px" }} />
                <input
                  type="url"
                  placeholder="Paste Google Meet or Zoom link"
                  value={meetingLinkInput}
                  onChange={(e) => setMeetingLinkInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-input)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveMeetingLink}
                  disabled={savingMeetingLink}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "bold",
                    cursor: savingMeetingLink ? "not-allowed" : "pointer",
                  }}
                >
                  {savingMeetingLink ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditMeetingLink(false)}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {syncMessage && (
              <div
                style={{
                  padding: "10px 15px",
                  backgroundColor: "#eff6ff",
                  color: "#1e40af",
                  borderRadius: "6px",
                  fontSize: "14px",
                  border: "1px solid #bfdbfe",
                }}
              >
                {syncMessage}
              </div>
            )}

            {/* Candidate Results Table */}
            {applications.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowResults((value) => !value)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: 0, background: "none", color: "var(--text-primary)", fontWeight: 700, cursor: "pointer", padding: 0 }}
                  >
                    {showResults ? <FiChevronUp /> : <FiChevronDown />} Candidates ({applications.length})
                  </button>
                </div>
                {showResults && <div
                  style={{
                    overflowX: "auto",
                    WebkitOverflowScrolling: "touch",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    width: "100%",
                  }}
                >
                  {manageResults && <div style={{ padding: "14px 15px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}><strong>Edit Results</strong><button type="button" onClick={saveAllScreeningResults} disabled={updatingAppId === "all"} style={{ background: "var(--primary-color)", color: "#fff", border: 0, borderRadius: "6px", padding: "8px 13px", fontWeight: 700, cursor: "pointer" }}>{updatingAppId === "all" ? "Saving..." : "Save Results"}</button></div>}
                  <table
                    style={{
                      width: "100%",
                      minWidth: "780px",
                      borderCollapse: "collapse",
                      fontSize: "14px",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderBottom: "1px solid var(--border-color)",
                        }}
                      >
                        <th style={{ padding: "10px 15px" }}>Candidate</th>
                        <th style={{ padding: "10px 15px" }}>Email</th>
                        <th style={{ padding: "10px 15px" }}>Application #</th>
                        <th style={{ padding: "10px 15px" }}>Result / Status</th>
                        {manageResults && <th style={{ padding: "10px 15px", textAlign: "right" }}>Marks</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app) => {
                        const name = getCandidateName(app);
                        const email = getCandidateEmail(app);
                        const exam = app.screening_exam || app.exam || {};
                        const isEnrolled = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "COMPLETED"].includes(app.status);
                        const isQual = !isEnrolled && (app.status === "QUALIFIED" || exam.qualified === true);
                        const hasSubmitted = Boolean(
                          exam.submitted_at ||
                          exam.status === "EVALUATED" ||
                          exam.status === "SUBMITTED" ||
                          isQual ||
                          app.status === "NOT_QUALIFIED" ||
                          app.status === "REJECTED" ||
                          exam.qualified === false ||
                          app.qualification_score != null ||
                          exam.marks_obtained != null
                        );
                        const isAbsentOrUnsubmitted = isEnded && !hasSubmitted;
                        const isNotQual =
                          app.status === "NOT_QUALIFIED" ||
                          app.status === "REJECTED" ||
                          exam.qualified === false ||
                          isAbsentOrUnsubmitted;
                        const isExamTaken = hasSubmitted;
                        const scoreDisplay = isAbsentOrUnsubmitted
                          ? `0/${exam.total_marks || screening?.total_questions || 10} (0%)`
                          : exam.marks_obtained != null
                          ? `${exam.marks_obtained}/${exam.total_marks || 10} (${exam.percentage ?? ""}%${exam.percentage ? "" : ""})`
                          : app.qualification_score != null
                          ? `${app.qualification_score}%`
                          : null;

                        return (
                          <tr
                            key={app.id}
                            style={{ borderBottom: "1px solid var(--border-color)" }}
                          >
                            <td style={{ padding: "10px 15px", fontWeight: "600", color: "var(--text-primary)" }}>{name}</td>
                            <td
                              style={{
                                padding: "10px 15px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {email}
                            </td>
                            <td
                              style={{
                                padding: "10px 15px",
                                fontFamily: "monospace",
                              }}
                            >
                              {app.application_number || app.id.slice(0, 8)}
                            </td>
                            <td style={{ padding: "10px 15px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div>
                                  <span
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: "12px",
                                      fontSize: "12px",
                                      fontWeight: "700",
                                      backgroundColor: isQual
                                        ? "#dcfce7"
                                        : isNotQual
                                        ? "#fee2e2"
                                        : isExamTaken
                                        ? "#fef3c7"
                                        : "var(--bg-surface)",
                                      color: isQual
                                        ? "#166534"
                                        : isNotQual
                                        ? "#991b1b"
                                        : isExamTaken
                                        ? "#92400e"
                                        : "var(--text-muted)",
                                      border: `1px solid ${
                                        isQual
                                          ? "#bbf7d0"
                                          : isNotQual
                                          ? "#fecaca"
                                          : isExamTaken
                                          ? "#fde68a"
                                          : "var(--border-color)"
                                      }`,
                                    }}
                                  >
                                    {isEnrolled ? "ENROLLED" : isQual ? "QUALIFIED" : isAbsentOrUnsubmitted || isNotQual ? "REJECTED" : (app.status || "EXAM_PENDING")}
                                  </span>
                                </div>
                                {scoreDisplay && (
                                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                                    Score: <strong style={{ color: "var(--text-primary)" }}>{scoreDisplay}</strong>
                                  </span>
                                )}
                              </div>
                            </td>
                            {manageResults && <td style={{ padding: "10px 15px", textAlign: "right" }}><input type="number" min="0" max={exam.total_marks || screening?.total_questions || 10} value={resultMarks[app.id] ?? exam.marks_obtained ?? ""} onChange={(e) => setResultMarks((current) => ({ ...current, [app.id]: e.target.value }))} aria-label={`Marks for ${name}`} style={{ width: "86px", padding: "7px 8px", border: "1px solid var(--border-color)", borderRadius: "6px" }} /></td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CohortScreeningPanel;
