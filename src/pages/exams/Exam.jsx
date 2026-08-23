import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./Exam.module.css";
import { useAuth } from "../../context/AuthContext";
import {
  startInternalExam,
  autosaveExam,
  submitInternalExam,
  autosaveModuleTest,
  submitModuleTest,
  fetchAuthoritativeExamContext,
} from "../../services/examService";
import { SureProEdLogo } from "../../components/common/SureProEdLogo";
import JitsiExamRoom from "../../components/exams/JitsiExamRoom";
import {
  FiClock,
  FiShield,
  FiAlertTriangle,
  FiAlertCircle,
  FiVideo,
} from "react-icons/fi";

const ACTIVE_SESSION_KEY = "sure_active_exam_session";
const RECOVERY_KEY = "sure_exam_recovery_v1";

const userIdentity = (user) => String(user?.id || user?.email || "");

const readExamRecovery = (user) => {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const recovery = JSON.parse(raw);
    const currentUser = userIdentity(user);
    if (recovery.user_identity && currentUser && recovery.user_identity !== currentUser) return null;
    return recovery;
  } catch {
    return null;
  }
};

const persistExamRecovery = (session, answers, user, options = {}) => {
  if (!session) return;
  const recoveredSession = { ...session, saved_answers: answers };
  try {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(recoveredSession));
    localStorage.setItem(
      RECOVERY_KEY,
      JSON.stringify({
        user_identity: userIdentity(user),
        attempt_id: session.attempt_id || session.id,
        assessment_type: session.assessment_type || "PRESCREENING",
        expires_at: session.expires_at || null,
        answers,
        exam_session: recoveredSession,
        pending_submission: Boolean(options.pendingSubmission),
        saved_at: new Date().toISOString(),
      })
    );
  } catch {
    // Browser storage may be disabled. Django autosave remains authoritative.
  }
};

const clearExamRecovery = () => {
  try {
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    sessionStorage.removeItem("sure_exam_tab_switch_count");
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Storage cleanup is best effort.
  }
};

function Exam() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Session & Questions State
  const [examSession, setExamSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [questionStates, setQuestionStates] = useState({}); // NOT_VISITED, NOT_ANSWERED, ANSWERED, MARKED, ANSWERED_MARKED

  // Zoom Controls (80% - 130%)
  const [zoomLevel, setZoomLevel] = useState(100);

  // Authoritative Timers & Statuses
  const [timeLeft, setTimeLeft] = useState(2700);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState("SAVED"); // SAVED, SAVING, OFFLINE
  const [isOnline, setIsOnline] = useState(true);

  // Modals & Banners
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showQuestionPaperModal, setShowQuestionPaperModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);
  const [securityNotification, setSecurityNotification] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [mediaWarning, setMediaWarning] = useState(null);

  // Tab Switch Anti-Cheat Tracking (Exceeding 5 switches triggers auto-submit)
  const [tabSwitchCount, setTabSwitchCount] = useState(() => {
    try {
      return Number(sessionStorage.getItem("sure_exam_tab_switch_count")) || 0;
    } catch {
      return 0;
    }
  });
  const tabSwitchCountRef = useRef(tabSwitchCount);
  const [showTabSwitchWarningModal, setShowTabSwitchWarningModal] = useState(false);

  useEffect(() => {
    tabSwitchCountRef.current = tabSwitchCount;
    try {
      sessionStorage.setItem("sure_exam_tab_switch_count", String(tabSwitchCount));
    } catch {
      // Session storage is optional in privacy-restricted browsers.
    }
  }, [tabSwitchCount]);

  // Proctoring Telemetry
  const isSubmittedRef = useRef(false);
  const handleFinalSubmitRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const latestAnswersRef = useRef({});
  const queuedSecurityEventsRef = useRef([]);
  const activeAttemptIdRef = useRef(null);
  const expiresAtRef = useRef(null);
  const retryAutosaveTimerRef = useRef(null);
  const triggerAutosaveRef = useRef(null);
  const scheduleAutosaveRef = useRef(null);
  const recoverySyncAttemptRef = useRef("");
  const needsRecoverySyncRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    latestAnswersRef.current = answers;
  }, [answers]);

  // Network Online / Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const deadline = expiresAtRef.current ? new Date(expiresAtRef.current).getTime() : null;
      if (deadline && Date.now() >= deadline) {
        handleFinalSubmitRef.current?.({ autoSubmit: true, reason: "RECONNECTED_AFTER_EXPIRY" });
      } else if (activeAttemptIdRef.current) {
        triggerAutosaveRef.current?.(latestAnswersRef.current);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setAutosaveStatus("OFFLINE");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 1. Initialize / Recover Exam Session
  useEffect(() => {
    let isMounted = true;

    const initExam = async () => {
      try {
        setLoading(true);
        setError(null);

        let session = location.state?.examSession;
        const localRecovery = readExamRecovery(user);

        // Attempt recovery from sessionStorage if state is missing (e.g. reload)
        if (!session || !session.questions || session.questions.length === 0) {
          try {
            const cached = sessionStorage.getItem(ACTIVE_SESSION_KEY);
            if (cached) {
              session = JSON.parse(cached);
            }
          } catch (e) {
            console.warn("Could not read sessionStorage:", e);
          }
        }

        if ((!session || !session.questions || session.questions.length === 0) && localRecovery?.exam_session) {
          session = localRecovery.exam_session;
        }

        // If still missing session or questions, call startInternalExam from authoritative backend
        if (!session || !session.questions || session.questions.length === 0) {
          const authContext = await fetchAuthoritativeExamContext();
          const targetExamId =
            authContext?.latestExam?.id || location.state?.examId;

          if (!targetExamId) {
            throw new Error("No active exam configuration found. Please return to instructions.");
          }

          const startRes = await startInternalExam(targetExamId, {
            application_id: authContext?.activeApp?.id,
            course_id: authContext?.courseId,
            schedule_id: authContext?.latestSchedule?.id,
            difficulty: authContext?.examConfig?.difficulty || "MEDIUM",
            total_questions: authContext?.examConfig?.total_questions || 10,
            duration_minutes: authContext?.examConfig?.duration_minutes || 45,
          });

          if (!startRes.success || !startRes.questions || startRes.questions.length === 0) {
            throw new Error(startRes.error || "Unable to start or resume exam from server.");
          }

          const candidateName =
            user?.first_name && user?.last_name
              ? `${user.first_name} ${user.last_name}`
              : user?.name || user?.email?.split("@")[0] || "Candidate";

          const candidateId =
            user?.student_id ||
            user?.id?.substring(0, 8)?.toUpperCase() ||
            "STU-" + (user?.email?.split("@")[0] || "EXAM");

          session = {
            id: targetExamId,
            assessment_type: "PRESCREENING",
            attempt_id: startRes.attempt_id,
            application_id: authContext?.activeApp?.id,
            schedule_id: authContext?.latestSchedule?.id,
            course_id: authContext?.courseId,
            course_name: authContext?.courseName || "Screening Assessment",
            domain: authContext?.courseName || "Screening Assessment",
            student_name: candidateName,
            student_id: candidateId,
            student_email: user?.email || "",
            total_questions: startRes.questions.length,
            duration_minutes: Number(startRes.duration_minutes) || 45,
            pass_percentage: authContext?.examConfig?.pass_percentage || 60.0,
            difficulty: authContext?.examConfig?.difficulty || "MIXED",
            start_time: startRes.start_time,
            expires_at: startRes.expires_at,
            paper_code: startRes.paper_code || "A",
            paper_label: startRes.paper_label || "Paper A",
            proctoring: startRes.proctoring,
            questions: startRes.questions,
            saved_answers: startRes.saved_answers || {},
          };

          try {
            sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
          } catch (storageErr) {
            console.warn("Storage warning:", storageErr);
          }
        }

        if (isMounted && session && session.questions) {
          setExamSession(session);
          setQuestions(session.questions);
          activeAttemptIdRef.current = session.attempt_id || session.id;
          expiresAtRef.current = session.expires_at || null;

          // Restore saved answers returned by backend
          const sameAttempt =
            localRecovery &&
            String(localRecovery.attempt_id || "") === String(session.attempt_id || session.id || "");
          const beforeDeadline = !session.expires_at || Date.now() < new Date(session.expires_at).getTime();
          const initialAnswers =
            sameAttempt && beforeDeadline
              ? localRecovery.answers || {}
              : session.saved_answers || {};
          needsRecoverySyncRef.current = Boolean(sameAttempt && beforeDeadline);
          setAnswers(initialAnswers);
          latestAnswersRef.current = initialAnswers;
          persistExamRecovery(session, initialAnswers, user, {
            pendingSubmission: Boolean(localRecovery?.pending_submission),
          });

          // Compute initial tile states
          const initStates = {};
          session.questions.forEach((q, idx) => {
            const hasAns = initialAnswers[q.id] !== undefined && initialAnswers[q.id] !== null;
            if (hasAns) {
              initStates[q.id] = "ANSWERED";
            } else if (idx === 0) {
              initStates[q.id] = "NOT_ANSWERED";
            } else {
              initStates[q.id] = "NOT_VISITED";
            }
          });
          setQuestionStates(initStates);

          // Calculate authoritative time left based on expires_at
          if (session.expires_at) {
            const remainingSecs = Math.max(
              0,
              Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)
            );
            setTimeLeft(remainingSecs);
          } else {
            const durationSecs = (Number(session.duration_minutes) || 45) * 60;
            setTimeLeft(durationSecs);
          }
        }
      } catch (err) {
        console.error("[Exam Mount] Initialization error:", err);
        if (isMounted) {
          setError(
            err.message ||
            "Failed to load examination questions from server. Please contact your proctor or administrator."
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initExam();

    return () => {
      isMounted = false;
    };
  }, [location.state, user]);

  // 2. Proctoring Deterrents & Telemetry Logger (Telemetry only - does NOT auto-fail)
  const logSecurityTelemetry = useCallback((eventType, detail = "") => {
    if (isSubmittedRef.current) return;

    const event = {
      type: eventType,
      detail: detail,
      timestamp: new Date().toISOString(),
    };

    queuedSecurityEventsRef.current.push(event);

    // Provide soft notification for user awareness
    let label = "Security event recorded";
    if (eventType === "FULLSCREEN_EXIT") label = "Exited full-screen mode";
    if (eventType === "TAB_SWITCH") label = "Tab switch / window focus loss detected";
    if (eventType === "CONTEXT_MENU") label = "Right-click context menu is disabled";
    if (eventType === "COPY_PASTE") label = "Copy and paste is disabled";
    if (eventType === "DEVTOOLS_ATTEMPT") label = "Developer shortcut is disabled";

    setSecurityNotification(`${label}. This interaction is recorded as telemetry for proctor review.`);

    setTimeout(() => {
      setSecurityNotification((curr) => (curr && curr.includes(label) ? null : curr));
    }, 4500);

    // Schedule telemetry flush with autosave
    scheduleAutosaveRef.current?.(latestAnswersRef.current);
  }, []);

  const handleJitsiEvent = useCallback((event) => {
    logSecurityTelemetry(event.type, event.detail);
    if (event.type === "JITSI_ERROR" || event.type === "JITSI_LEFT") {
      setMediaWarning("The live proctoring room disconnected. Reconnect before continuing.");
    } else if (event.type === "JITSI_JOINED") {
      setMediaWarning(null);
    }
  }, [logSecurityTelemetry]);

  // Proctoring Listeners & Anti-Cheat Protection
  useEffect(() => {
    if (loading || submitting) return;

    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmittedRef.current) {
        const newCount = tabSwitchCountRef.current + 1;

        tabSwitchCountRef.current = newCount;
        setTabSwitchCount(newCount);

        logSecurityTelemetry(
          "TAB_SWITCH",
          `Tab switch / window focus loss detected. Violation #${newCount} of 5`
        );

        // 5th tab switch = automatic exam submission
        if (newCount >= 5) {
          console.warn(
            "[Proctoring] Maximum tab switches reached. Auto submitting exam."
          );

          setShowTabSwitchWarningModal(false);

          if (handleFinalSubmitRef.current) {
            handleFinalSubmitRef.current({
              autoSubmit: true,
              reason: "MAX_TAB_SWITCHES_EXCEEDED",
            });
          } else {
            console.error(
              "[Proctoring] handleFinalSubmitRef is not connected to the submit function."
            );
          }
        } else {
          // Warning only for tab switches 1–4
          setShowTabSwitchWarningModal(true);
        }
      }
    };

    const handleWindowBlur = () => {
      logSecurityTelemetry("WINDOW_BLUR", "Browser window focus lost");
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      logSecurityTelemetry("CONTEXT_MENU", "Right click attempted");
    };

    const handleCopy = (e) => {
      e.preventDefault();
      logSecurityTelemetry("COPY_PASTE", "Copy command prevented");
    };

    const handlePaste = (e) => {
      e.preventDefault();
      logSecurityTelemetry("COPY_PASTE", "Paste command prevented");
    };

    const handleCut = (e) => {
      e.preventDefault();
      logSecurityTelemetry("COPY_PASTE", "Cut command prevented");
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullscreenWarning(true);
        logSecurityTelemetry("FULLSCREEN_EXIT", "Candidate exited fullscreen");
      } else {
        setFullscreenWarning(false);
      }
    };

    const handleKeyDown = (e) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) ||
        (e.ctrlKey && ["u", "U", "s", "S", "p", "P"].includes(e.key))
      ) {
        e.preventDefault();
        logSecurityTelemetry("DEVTOOLS_ATTEMPT", `Key prevented: ${e.key}`);
      }
    };

    const handleBeforeUnload = (e) => {
      if (!isSubmittedRef.current) {
        e.preventDefault();
        e.returnValue = "Your exam is currently in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("cut", handleCut);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [loading, submitting, logSecurityTelemetry]);

  // 3. Debounced Autosave Implementation
  const triggerAutosave = useCallback(async (currentAnswers) => {
    const attemptId = activeAttemptIdRef.current || examSession?.attempt_id || examSession?.id;
    if (!attemptId || isSubmittedRef.current) return;
    const isModuleTest = examSession?.assessment_type === "MODULE_TEST";
    const assessmentId = isModuleTest
      ? examSession?.module_test_id || examSession?.id
      : examSession?.exam_id || examSession?.id;

    setAutosaveStatus("SAVING");
    const eventsToSend = [...queuedSecurityEventsRef.current];
    queuedSecurityEventsRef.current = [];

    try {
      const saveFunction = isModuleTest ? autosaveModuleTest : autosaveExam;
      const res = await saveFunction(assessmentId, {
        attempt_id: attemptId,
        answers: currentAnswers,
        security_events: eventsToSend,
      });

      if (res.success) {
        setAutosaveStatus("SAVED");
        setIsOnline(true);
        if (res.expires_at) {
          expiresAtRef.current = res.expires_at;
        }
      } else {
        setAutosaveStatus("OFFLINE");
        setIsOnline(false);
        queuedSecurityEventsRef.current = [...eventsToSend, ...queuedSecurityEventsRef.current];
        if (retryAutosaveTimerRef.current) clearTimeout(retryAutosaveTimerRef.current);
        retryAutosaveTimerRef.current = setTimeout(() => {
          triggerAutosaveRef.current?.(latestAnswersRef.current);
        }, 4000);
      }
    } catch (err) {
      console.warn("[Autosave] Network warning:", err);
      setAutosaveStatus("OFFLINE");
      setIsOnline(false);
      queuedSecurityEventsRef.current = [...eventsToSend, ...queuedSecurityEventsRef.current];
      if (retryAutosaveTimerRef.current) clearTimeout(retryAutosaveTimerRef.current);
      retryAutosaveTimerRef.current = setTimeout(() => {
        triggerAutosaveRef.current?.(latestAnswersRef.current);
      }, 4000);
    }
  }, [examSession]);

  const scheduleAutosave = useCallback(
    (updatedAnswers) => {
      latestAnswersRef.current = updatedAnswers;
      persistExamRecovery(examSession, updatedAnswers, user);
      setAutosaveStatus("SAVING");

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      autosaveTimerRef.current = setTimeout(() => {
        triggerAutosave(updatedAnswers);
      }, 1000); // 1-second debounce
    },
    [examSession, triggerAutosave, user]
  );

  useEffect(() => {
    triggerAutosaveRef.current = triggerAutosave;
    scheduleAutosaveRef.current = scheduleAutosave;
  }, [scheduleAutosave, triggerAutosave]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (retryAutosaveTimerRef.current) clearTimeout(retryAutosaveTimerRef.current);
    };
  }, []);

  // 4. Final Submission Handler
  const handleFinalSubmit = useCallback(
    async (options = {}) => {
      if (isSubmittedRef.current || submitting) return;

      isSubmittedRef.current = true;
      setSubmitting(true);
      setShowSubmitModal(false);
      setSubmitError(null);

      const attemptId = activeAttemptIdRef.current || examSession?.attempt_id || examSession?.id;
      const currentAnswers = latestAnswersRef.current;
      const events = [...queuedSecurityEventsRef.current];
      persistExamRecovery(examSession, currentAnswers, user, {
        pendingSubmission: Boolean(options.autoSubmit),
      });

      try {
        const isModuleTest = examSession?.assessment_type === "MODULE_TEST";
        const assessmentId = isModuleTest
          ? examSession?.module_test_id || examSession?.id
          : examSession?.exam_id || examSession?.id;
        const submitFunction = isModuleTest ? submitModuleTest : submitInternalExam;
        const submitRes = await submitFunction(assessmentId, {
          attempt_id: attemptId,
          application_id: examSession?.application_id,
          schedule_id: examSession?.schedule_id,
          course_id: examSession?.course_id,
          course_name: examSession?.course_name,
          pass_percentage: examSession?.pass_percentage || 60,
          questions,
          answers: currentAnswers,
          duration_taken_seconds: Math.max(
            0,
            (Number(examSession?.duration_minutes) || 45) * 60 - timeLeft
          ),
          security_events: events,
          auto_submitted: Boolean(options.autoSubmit),
          submission_reason: options.reason || "CANDIDATE_SUBMIT",
        });

        // Clean up session storage
        clearExamRecovery();

        navigate("/student/exam-result", {
          state: {
            examResult: submitRes?.exam || {
              status: "EVALUATED",
              total_questions: questions.length,
              submitted_at: new Date().toISOString(),
            },
            questions,
            answers: currentAnswers,
            courseName: examSession?.course_name,
            assessmentType: examSession?.assessment_type || "PRESCREENING",
          },
        });
      } catch (err) {
        console.error("[Exam Submit] Error during final submission:", err);
        setSubmitError(
          err?.message ||
          "Network error while submitting exam. Your answers are saved locally. Click retry below to complete submission."
        );
        isSubmittedRef.current = false;
        setSubmitting(false);
      }
    },
    [examSession, navigate, questions, submitting, timeLeft, user]
  );

  useEffect(() => {
    handleFinalSubmitRef.current = handleFinalSubmit;
  }, [handleFinalSubmit]);

  useEffect(() => {
    const attemptId = examSession?.attempt_id || examSession?.id;
    if (!attemptId || recoverySyncAttemptRef.current === String(attemptId)) return;
    recoverySyncAttemptRef.current = String(attemptId);
    if (expiresAtRef.current && Date.now() >= new Date(expiresAtRef.current).getTime()) {
      handleFinalSubmitRef.current?.({ autoSubmit: true, reason: "RECOVERED_AFTER_EXPIRY" });
    } else if (needsRecoverySyncRef.current && navigator.onLine !== false) {
      needsRecoverySyncRef.current = false;
      triggerAutosaveRef.current?.(latestAnswersRef.current);
    }
  }, [examSession]);

  // 5. Authoritative Countdown Timer Hook
  useEffect(() => {
    if (loading || !examSession || submitting) return;

    const timer = setInterval(() => {
      if (expiresAtRef.current) {
        const remaining = Math.max(
          0,
          Math.floor((new Date(expiresAtRef.current).getTime() - Date.now()) / 1000)
        );
        setTimeLeft(remaining);
        if (remaining <= 0 && !isSubmittedRef.current) {
          clearInterval(timer);
          handleFinalSubmit({ autoSubmit: true, reason: "TIME_EXPIRED" });
        }
      } else {
        setTimeLeft((prev) => {
          if (prev <= 1 && !isSubmittedRef.current) {
            clearInterval(timer);
            handleFinalSubmit({ autoSubmit: true, reason: "TIME_EXPIRED" });
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, examSession, submitting, handleFinalSubmit]);

  // Zoom Handlers
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 10, 130));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 10, 80));
  const handleZoomReset = () => setZoomLevel(100);

  // Question Navigation & Option Selection
  const activeQuestion = questions[currentIndex];
  const activeQId = activeQuestion?.id;

  const handleSelectOption = (optionKey) => {
    if (!activeQId || timeLeft <= 0 || submitting) return;

    const updatedAnswers = { ...answers, [activeQId]: optionKey };
    setAnswers(updatedAnswers);

    const currentState = questionStates[activeQId];
    if (currentState === "MARKED" || currentState === "ANSWERED_MARKED") {
      setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED_MARKED" }));
    } else {
      setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED" }));
    }

    scheduleAutosave(updatedAnswers);
  };

  const handleSaveAndNext = () => {
    if (activeQId) {
      if (answers[activeQId]) {
        const cur = questionStates[activeQId];
        if (cur !== "ANSWERED_MARKED") {
          setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED" }));
        }
      } else {
        setQuestionStates((prev) => ({ ...prev, [activeQId]: "NOT_ANSWERED" }));
      }
    }

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const nextId = questions[nextIdx].id;
      if (!questionStates[nextId] || questionStates[nextId] === "NOT_VISITED") {
        setQuestionStates((prev) => ({ ...prev, [nextId]: "NOT_ANSWERED" }));
      }
    }
  };

  const handleSaveAndMarkForReview = () => {
    if (activeQId) {
      if (answers[activeQId]) {
        setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED_MARKED" }));
      } else {
        setQuestionStates((prev) => ({ ...prev, [activeQId]: "MARKED" }));
      }
    }

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const nextId = questions[nextIdx].id;
      if (!questionStates[nextId] || questionStates[nextId] === "NOT_VISITED") {
        setQuestionStates((prev) => ({ ...prev, [nextId]: "NOT_ANSWERED" }));
      }
    }
  };

  const handleMarkForReviewAndNext = () => {
    if (activeQId) {
      if (answers[activeQId]) {
        setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED_MARKED" }));
      } else {
        setQuestionStates((prev) => ({ ...prev, [activeQId]: "MARKED" }));
      }
    }

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const nextId = questions[nextIdx].id;
      if (!questionStates[nextId] || questionStates[nextId] === "NOT_VISITED") {
        setQuestionStates((prev) => ({ ...prev, [nextId]: "NOT_ANSWERED" }));
      }
    }
  };

  const handleClearResponse = () => {
    if (!activeQId || timeLeft <= 0 || submitting) return;

    const copy = { ...answers };
    delete copy[activeQId];
    setAnswers(copy);

    setQuestionStates((prev) => ({ ...prev, [activeQId]: "NOT_ANSWERED" }));
    scheduleAutosave(copy);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleTileClick = (index) => {
    if (activeQId && (!questionStates[activeQId] || questionStates[activeQId] === "NOT_VISITED")) {
      setQuestionStates((prev) => ({ ...prev, [activeQId]: "NOT_ANSWERED" }));
    }

    setCurrentIndex(index);
    const targetId = questions[index].id;
    if (!questionStates[targetId] || questionStates[targetId] === "NOT_VISITED") {
      setQuestionStates((prev) => ({ ...prev, [targetId]: "NOT_ANSWERED" }));
    }
  };

  const reEnterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setFullscreenWarning(false);
    } catch (e) {
      console.warn("Fullscreen permission error:", e);
    }
  };

  // Counts for Navigator Summary
  const counts = {
    answered: 0,
    notAnswered: 0,
    marked: 0,
    ansMarked: 0,
    notVisited: 0,
  };

  questions.forEach((q) => {
    const state = questionStates[q.id] || "NOT_VISITED";
    if (state === "ANSWERED") counts.answered++;
    else if (state === "NOT_ANSWERED") counts.notAnswered++;
    else if (state === "MARKED") counts.marked++;
    else if (state === "ANSWERED_MARKED") counts.ansMarked++;
    else counts.notVisited++;
  });

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Watermark text composed of candidate ID and attempt ID
  const watermarkCandidate =
    examSession?.student_name ||
    user?.first_name ||
    user?.email?.split("@")[0] ||
    "Candidate";
  const watermarkId = examSession?.student_id || user?.student_id || "STUDENT";
  const watermarkAttempt = examSession?.attempt_id ? String(examSession.attempt_id).substring(0, 8) : "INT-ATTEMPT";
  const watermarkText = `${watermarkCandidate} • ${watermarkId} • ID: ${watermarkAttempt} • PROCTOR AUDIT`;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            border: "4px solid #cbd5e1",
            borderTopColor: "#1e40af",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            marginBottom: "16px",
          }}
        />
        <h3 style={{ color: "#0f172a", margin: 0, fontWeight: 800 }}>
          Initializing Internal Examination Portal...
        </h3>
        <p style={{ color: "#64748b", marginTop: "6px", fontSize: "14px" }}>
          Retrieving authoritative randomized questions & active session from server
        </p>
      </div>
    );
  }

  if (error || !questions || questions.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            padding: "3rem",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            textAlign: "center",
            maxWidth: "480px",
            border: "1.5px solid #cbd5e1",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
            <FiAlertTriangle style={{ fontSize: "2.5rem", color: "#dc2626" }} />
          </div>
          <h2 style={{ color: "#dc2626", margin: "0 0 0.5rem 0", fontSize: "20px" }}>
            Examination Session Unavailable
          </h2>
          <p style={{ color: "#475569", fontSize: "14px", marginBottom: "1.5rem", lineHeight: "1.5" }}>
            {error || "Unable to retrieve examination session from server."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/student/exam-instructions")}
            style={{
              padding: "10px 20px",
              backgroundColor: "#1e40af",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Return to Instructions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.examContainer} onContextMenu={(e) => e.preventDefault()}>
      {/* DYNAMIC VISIBLE WATERMARK LAYER FOR TRACEABILITY & DETERRENCE */}
      <div className={styles.watermarkContainer} aria-hidden="true" data-testid="exam-watermark">
        {[1, 2, 3, 4, 5, 6].map((rowIdx) => (
          <div key={rowIdx} className={styles.watermarkRow}>
            <span className={styles.watermarkItem}>{watermarkText}</span>
            <span className={styles.watermarkItem}>{watermarkText}</span>
            <span className={styles.watermarkItem}>{watermarkText}</span>
          </div>
        ))}
      </div>

      <JitsiExamRoom
        session={examSession?.proctoring}
        mode="candidate"
        onEvent={handleJitsiEvent}
      />

      {/* ================= 1. TOP HEADER ================= */}
      <header className={styles.topNavbar}>
        <div className={styles.navLeft}>
          <SureProEdLogo size={36} showText={false} />
          <div className={styles.courseTitleBadge}>
            {examSession?.course_name || examSession?.domain || "Screening Examination"}
          </div>
        </div>

        <div className={styles.navCenter}>
          {/* Autosave Status Indicator */}
          <div
            className={`${styles.autosaveBadge} ${autosaveStatus === "SAVED"
                ? styles.autosaveSaved
                : autosaveStatus === "SAVING"
                  ? styles.autosaveSaving
                  : styles.autosaveOffline
              }`}
            data-testid="autosave-status"
          >
            <span
              className={`${styles.autosaveDot} ${autosaveStatus === "SAVED"
                  ? styles.dotSaved
                  : autosaveStatus === "SAVING"
                    ? styles.dotSaving
                    : styles.dotOffline
                }`}
            />
            <span>
              {autosaveStatus === "SAVED"
                ? "Answers Saved"
                : autosaveStatus === "SAVING"
                  ? "Saving..."
                  : "Offline - Retrying..."}
            </span>
          </div>

          {/* Network Connection Pill */}
          <div
            className={`${styles.networkPill} ${isOnline ? styles.networkOnline : styles.networkOffline
              }`}
          >
            <span>{isOnline ? "Online" : "Offline"}</span>
          </div>
        </div>

        <div className={styles.navRight}>
          {/* Live Proctoring Webcam Feed */}
          <div className={styles.proctorFeedCard} title="Live Automated Proctoring: Active">
            <FiVideo />
            <div className={styles.proctorMeta}>
              <span className={styles.proctorLiveBadge}>JITSI</span>
              <span className={styles.proctorSubText}>ROOM {examSession?.proctoring?.room_code || "—"}</span>
            </div>
          </div>

          {/* Candidate Profile Details */}
          <div className={styles.candidateCard}>
            <div className={styles.candidateAvatar}>
              {(examSession?.student_name || "S")[0].toUpperCase()}
            </div>
            <div className={styles.candidateMeta}>
              <span className={styles.candidateName}>
                {examSession?.student_name || "Candidate"}
              </span>
              <span className={styles.candidateId}>
                ID: {examSession?.student_id || "STU-EXAM"}
              </span>
            </div>
          </div>

          {/* Countdown Timer (Synchronized with server expires_at) */}
          <div
            className={`${styles.timerBadge} ${timeLeft < 300 ? styles.timerWarning : ""}`}
            data-testid="server-timer"
          >
            <FiClock style={{ fontSize: "15px" }} />
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>
      </header>

      {/* FULLSCREEN ALERT NOTIFICATION BANNER */}
      {fullscreenWarning && (
        <div className={styles.proctorNotice} data-testid="fullscreen-alert">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <FiAlertTriangle /> <strong>Proctored Session Notice:</strong> You have exited full-screen mode. Please return to full-screen immediately to maintain session integrity.
          </span>
          <button type="button" onClick={reEnterFullscreen}>
            Re-enter Full Screen
          </button>
        </div>
      )}

      {/* MEDIA DISCONNECT PROCTORING WARNING BANNER */}
      {mediaWarning && (
        <div className={styles.proctorNotice} style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <FiAlertCircle /> <strong>Proctoring Notice:</strong> {mediaWarning}
          </span>
          <button
            type="button"
            style={{ background: "#dc2626" }}
            onClick={() => setMediaWarning(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* PROCTORING TELEMETRY TOAST NOTIFICATION */}
      {securityNotification && !fullscreenWarning && (
        <div className={styles.proctorNotice} style={{ background: "#fef3c7", borderColor: "#fde68a", color: "#92400e" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <FiShield /> {securityNotification}
          </span>
          <button
            type="button"
            style={{ background: "#d97706" }}
            onClick={() => setSecurityNotification(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SUBMISSION NETWORK ERROR RECOVERY BANNER */}
      {submitError && (
        <div className={styles.proctorNotice} style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <FiAlertTriangle /> {submitError}
          </span>
          <button
            type="button"
            style={{ background: "#dc2626" }}
            onClick={() => handleFinalSubmit()}
            disabled={submitting}
          >
            {submitting ? "Retrying..." : "Retry Submission"}
          </button>
        </div>
      )}

      {/* ================= 2. SECOND INFO BAR ================= */}
      <div className={styles.infoBar}>
        <div className={styles.infoLeft}>
          <span className={styles.infoSectionBadge}>Section: Technical & Aptitude</span>
          <span>Paper: {examSession?.paper_label || "Paper A"}</span>
        </div>

        <div className={styles.infoRight}>
          <span className={styles.marksTag}>
            Marks: +{activeQuestion?.marks || 1.0} | Negative: -{activeQuestion?.negativeMarks || 0.0}
          </span>
        </div>
      </div>

      {/* ================= 3. MAIN TWO-COLUMN LAYOUT ================= */}
      <main className={styles.mainLayout}>
        {/* LEFT COLUMN: QUESTION CONTENT & OPTIONS (76%) */}
        <section className={styles.questionArea}>
          <div className={styles.questionScrollable}>
            <div className={styles.questionTitleRow}>
              <div className={styles.questionHeaderLeft}>
                <span className={styles.questionNumberHeader}>
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className={styles.questionTypeText}>Multiple Choice (Single Answer)</span>
              </div>

              {/* Zoom Controls */}
              <div className={styles.zoomControls}>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 80}
                  title="Decrease text size"
                >
                  A-
                </button>
                <span className={styles.zoomLabel}>{zoomLevel}%</span>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 130}
                  title="Increase text size"
                >
                  A+
                </button>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  onClick={handleZoomReset}
                  title="Reset text size"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Question Body */}
            <div
              className={styles.questionBody}
              style={{
                fontSize: `${(22 * zoomLevel) / 100}px`,
                fontWeight: 500,
                lineHeight: 1.5,
                marginBottom: "20px",
              }}
              data-testid="active-question-text"
            >
              {activeQuestion?.questionText}
            </div>

            {/* MCQ Options (Rendered exactly in backend-provided order) */}
            <div className={styles.optionsContainer}>
              {(activeQuestion?.options || []).map((opt) => {
                const optKey = opt.key || "A";
                const isSelected = answers[activeQId] === optKey;

                return (
                  <div
                    key={optKey}
                    className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}
                    style={{
                      padding: "14px 18px",
                      minHeight: "55px",
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                    }}
                    onClick={() => handleSelectOption(optKey)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleSelectOption(optKey);
                    }}
                    data-testid={`option-${optKey}`}
                  >
                    <div
                      className={`${styles.optionCircle} ${isSelected ? styles.optionCircleActive : ""
                        }`}
                    >
                      {optKey}
                    </div>
                    <div
                      className={styles.optionLabelText}
                      style={{
                        fontSize: `${(18 * zoomLevel) / 100}px`,
                        fontWeight: 500,
                        lineHeight: 1.45,
                        flex: 1,
                      }}
                    >
                      {opt.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <footer className={styles.bottomActionBar}>
            <div className={styles.actionGroupLeft}>
              <button
                type="button"
                className={styles.btnSaveNext}
                onClick={handleSaveAndNext}
              >
                Save & Next
              </button>
              <button
                type="button"
                className={styles.btnSaveReview}
                onClick={handleSaveAndMarkForReview}
              >
                Save & Mark for Review
              </button>
              <button
                type="button"
                className={styles.btnMarkReview}
                onClick={handleMarkForReviewAndNext}
              >
                Mark for Review & Next
              </button>
              <button
                type="button"
                className={styles.btnClear}
                onClick={handleClearResponse}
                disabled={!answers[activeQId]}
              >
                Clear Response
              </button>
            </div>

            <div className={styles.actionGroupRight}>
              <button
                type="button"
                className={styles.btnPrevious}
                onClick={handlePrevious}
                disabled={currentIndex === 0}
              >
                ← Previous
              </button>
            </div>
          </footer>
        </section>

        {/* RIGHT COLUMN: QUESTION NAVIGATOR (24%) */}
        <aside className={styles.sidebarNavigator}>
          <div className={styles.sidebarTitle}>Question Navigator</div>

          {/* Summary Status Legend */}
          <div className={styles.summaryBox}>
            <div className={styles.summaryRow}>
              <div className={styles.summaryItem}>
                <span className={`${styles.summaryBadge} ${styles.badgeAnswered}`}>
                  {counts.answered}
                </span>
                <span>Answered</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={`${styles.summaryBadge} ${styles.badgeNotAnswered}`}>
                  {counts.notAnswered}
                </span>
                <span>Not Answered</span>
              </div>
            </div>

            <div className={styles.summaryRow}>
              <div className={styles.summaryItem}>
                <span className={`${styles.summaryBadge} ${styles.badgeNotVisited}`}>
                  {counts.notVisited}
                </span>
                <span>Not Visited</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={`${styles.summaryBadge} ${styles.badgeMarked}`}>
                  {counts.marked}
                </span>
                <span>Marked for Review</span>
              </div>
            </div>

            <div className={styles.summaryRow}>
              <div className={styles.summaryItem} style={{ gridColumn: "1 / -1" }}>
                <span className={`${styles.summaryBadge} ${styles.badgeAnsMarked}`}>
                  {counts.ansMarked}
                </span>
                <span>Answered & Marked for Review (Evaluated)</span>
              </div>
            </div>
          </div>

          {/* Question Grid Tiles - 8-Column Grid matching NTA/TCS reference */}
          <div className={styles.tilesSection}>
            <div
              className={styles.tilesGrid}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '5px 4px',
                width: '100%',
                boxSizing: 'border-box',
                alignContent: 'start',
                justifyContent: 'flex-start',
              }}
            >
              {questions.map((q, idx) => {
                const state = questionStates[q.id] || "NOT_VISITED";
                const isCurrent = idx === currentIndex;

                let tileClass = styles.tileNotVisited;
                if (state === "ANSWERED") {
                  tileClass = styles.tileAnswered;
                } else if (state === "NOT_ANSWERED") {
                  tileClass = styles.tileNotAnswered;
                } else if (state === "MARKED") {
                  tileClass = styles.tileMarked;
                } else if (state === "ANSWERED_MARKED") {
                  tileClass = styles.tileAnsMarked;
                }

                const numStr = String(idx + 1).padStart(2, "0");

                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`${styles.navTile} ${tileClass} ${
                      isCurrent ? styles.navTileCurrent : ""
                    }`}
                    style={{
                      flex: '0 0 calc((100% - 28px) / 8)',
                      width: 'calc((100% - 28px) / 8)',
                      minWidth: 0,
                      boxSizing: 'border-box',
                    }}
                    onClick={() => handleTileClick(idx)}
                    title={`Question ${idx + 1}: ${state}`}
                    data-testid={`question-tile-${idx + 1}`}
                  >
                    {numStr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sidebar Footer Buttons */}
          <div className={styles.sidebarFooter}>
            <div className={styles.auxRow}>
              <button
                type="button"
                className={styles.btnAux}
                onClick={() => setShowQuestionPaperModal(true)}
              >
                Question Paper
              </button>
              <button
                type="button"
                className={styles.btnAux}
                onClick={() => setShowInstructionsModal(true)}
              >
                Instructions
              </button>
            </div>

            <button
              type="button"
              className={styles.btnFinalSubmit}
              onClick={() => setShowSubmitModal(true)}
              disabled={submitting}
              data-testid="btn-submit-exam"
            >
              {submitting ? "Submitting..." : "Submit Examination"}
            </button>
          </div>
        </aside>
      </main>

      {/* SUBMIT CONFIRMATION MODAL */}
      {showSubmitModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalHeading}>Submit Examination Confirmation</h3>
            <p style={{ fontSize: "14px", color: "#475569", margin: "0 0 12px 0" }}>
              Are you sure you want to finish and submit your screening examination? You will not be
              able to change your answers after submission.
            </p>

            <table className={styles.modalSummaryTable}>
              <tbody>
                <tr>
                  <td><strong>Total Questions:</strong></td>
                  <td>{questions.length}</td>
                </tr>
                <tr>
                  <td><strong>Answered Questions:</strong></td>
                  <td style={{ color: "#16a34a", fontWeight: "bold" }}>
                    {counts.answered + counts.ansMarked}
                  </td>
                </tr>
                <tr>
                  <td><strong>Unanswered / Not Visited:</strong></td>
                  <td style={{ color: "#ea580c", fontWeight: "bold" }}>
                    {counts.notAnswered + counts.notVisited}
                  </td>
                </tr>
                <tr>
                  <td><strong>Marked for Review:</strong></td>
                  <td style={{ color: "#9333ea", fontWeight: "bold" }}>
                    {counts.marked}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className={styles.modalBtnGroup}>
              <button
                type="button"
                className={styles.btnClear}
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                Continue Exam
              </button>
              <button
                type="button"
                className={styles.btnFinalSubmit}
                style={{ width: "auto", padding: "8px 22px" }}
                onClick={() => handleFinalSubmit({ autoSubmit: false, reason: "CANDIDATE_SUBMIT" })}
                disabled={submitting}
                data-testid="btn-confirm-final-submit"
              >
                {submitting ? "Submitting..." : "Yes, Submit Final Exam"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUESTION PAPER PREVIEW MODAL */}
      {showQuestionPaperModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard} style={{ maxWidth: "680px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <h3 className={styles.modalHeading}>Examination Question Paper Summary</h3>
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #e2e8f0",
                    fontSize: "14px",
                  }}
                >
                  <strong style={{ color: "#1e40af" }}>Q{idx + 1}: </strong>
                  <span>{q.questionText}</span>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    Status: <strong>{questionStates[q.id] || "NOT_VISITED"}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.modalBtnGroup} style={{ marginTop: "12px" }}>
              <button
                type="button"
                className={styles.btnFinalSubmit}
                style={{ width: "auto", padding: "8px 20px" }}
                onClick={() => setShowQuestionPaperModal(false)}
              >
                Close Question Paper
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSTRUCTIONS MODAL */}
      {showInstructionsModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard} style={{ maxWidth: "600px" }}>
            <h3 className={styles.modalHeading}>Examination Instructions</h3>
            <ul style={{ fontSize: "13.5px", color: "#334155", lineHeight: "1.6", paddingLeft: "20px" }}>
              <li>Each question carries marks as indicated on the top right bar.</li>
              <li>Your answers are automatically saved to the server as you answer.</li>
              <li>When the timer expires, your answers will submit automatically.</li>
              <li>Full-screen mode and window focus are continuously monitored.</li>
              <li>Do not use right-click or keyboard inspect shortcuts during the exam.</li>
            </ul>
            <div className={styles.modalBtnGroup}>
              <button
                type="button"
                className={styles.btnFinalSubmit}
                style={{ width: "auto", padding: "8px 20px" }}
                onClick={() => setShowInstructionsModal(false)}
              >
                Back to Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB SWITCH ANTI-CHEAT WARNING MODAL */}
      {showTabSwitchWarningModal && !submitting && (
        <div className={styles.modalOverlay} style={{ zIndex: 99999 }}>
          <div
            className={styles.modalCard}
            style={{
              maxWidth: "480px",
              textAlign: "center",
              borderTop: "5px solid #dc2626",
              padding: "28px 24px",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>⚠️</div>
            <h3 style={{ color: "#dc2626", fontSize: "20px", fontWeight: 800, margin: "0 0 8px 0" }}>
              Tab Switch Warning
            </h3>
            <p style={{ fontSize: "14.5px", color: "#334155", lineHeight: 1.5, margin: "0 0 16px 0" }}>
              Switching tabs or navigating away from the examination window is strictly prohibited.
            </p>
            <div
              style={{
                background: "#fef2f2",
                border: "1.5px solid #fecaca",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "20px",
              }}
            >
              <p style={{ margin: 0, fontWeight: 800, color: "#991b1b", fontSize: "15px" }}>
                Violation Count: {tabSwitchCount} / 5
              </p>
              <p style={{ margin: "6px 0 0 0", fontSize: "12.5px", color: "#b91c1c" }}>
                {5 - tabSwitchCount > 0
                  ? `You have ${5 - tabSwitchCount} warning(s) remaining before your exam is automatically submitted.`
                  : "Maximum tab switches exceeded. Submitting examination."}
              </p>
            </div>
            <button
              type="button"
              className={styles.btnFinalSubmit}
              style={{
                background: "#dc2626",
                width: "100%",
                padding: "12px 20px",
                fontSize: "14.5px",
                fontWeight: 700,
              }}
              onClick={() => setShowTabSwitchWarningModal(false)}
            >
              I Understand, Resume Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Exam;
