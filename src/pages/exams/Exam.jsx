import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Exam.module.css";

function Exam() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // State
  const [examSession, setExamSession] = useState(location.state?.examSession || null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [questionStates, setQuestionStates] = useState({}); // { [qId]: 'ANSWERED' | 'NOT_ANSWERED' | 'MARKED' | 'ANSWERED_MARKED' | 'NOT_VISITED' }
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Security / Proctoring
  const [cheatCount, setCheatCount] = useState(0);
  const [cheatLogs, setCheatLogs] = useState([]);
  const [securityModalText, setSecurityModalText] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(null);

  const syncTimerRef = useRef(null);
  const isSubmittedRef = useRef(false);
  const answersRef = useRef(answers);
  const examSessionRef = useRef(examSession);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { examSessionRef.current = examSession; }, [examSession]);

  // Load Exam Session on Mount
  useEffect(() => {
    let isMounted = true;

    const getDomainFallbackQuestions = (domainStr) => {
      const domain = (domainStr || "").toLowerCase();

      if (domain.includes("ui") || domain.includes("ux") || domain.includes("design") || domain.includes("frontend")) {
        return [
          { id: "uiux_1", domain: "UI/UX Design", subject: "UI Design", question: "What does UI stand for in digital product design?", options: ["User Interface", "User Integration", "Universal Interaction", "Unified Image"], correct_answer: "User Interface", marks: 1.0 },
          { id: "uiux_2", domain: "UI/UX Design", subject: "Wireframing", question: "What is a wireframe in UI/UX design workflow?", options: ["A low-fidelity visual guide representing page layout structure", "A high-resolution 3D animation", "A database relationship diagram", "A CSS stylesheet file"], correct_answer: "A low-fidelity visual guide representing page layout structure", marks: 1.0 },
          { id: "uiux_3", domain: "UI/UX Design", subject: "Design Tools", question: "Which software tool is widely standard for UI/UX prototyping and design systems?", options: ["Figma", "Docker", "Postman", "Jenkins"], correct_answer: "Figma", marks: 1.0 },
          { id: "uiux_4", domain: "UI/UX Design", subject: "UX Design", question: "What is the primary focus of User Experience (UX) design?", options: ["Overall feel, usability, and satisfaction of the user journey", "Writing backend SQL queries", "Configuring web servers", "Compiling C++ binaries"], correct_answer: "Overall feel, usability, and satisfaction of the user journey", marks: 1.0 },
          { id: "uiux_5", domain: "UI/UX Design", subject: "Information Architecture", question: "What does Information Architecture (IA) organize in digital products?", options: ["Structuring and organizing content logically for seamless navigation", "Managing server memory heaps", "Setting up OAuth authentication", "Minifying JavaScript bundles"], correct_answer: "Structuring and organizing content logically for seamless navigation", marks: 1.0 },
        ];
      }

      if (domain.includes("java") || domain.includes("oops") || domain.includes("backend")) {
        return [
          { id: "java_1", domain: "Java Development", subject: "OOP", question: "Which principle of OOP allows a class to inherit properties from another class?", options: ["Inheritance", "Polymorphism", "Encapsulation", "Abstraction"], correct_answer: "Inheritance", marks: 1.0 },
          { id: "java_2", domain: "Java Development", subject: "JVM", question: "What converts Java bytecode into machine-readable code?", options: ["Java Virtual Machine (JVM)", "JDK Compiler", "Eclipse IDE", "Maven"], correct_answer: "Java Virtual Machine (JVM)", marks: 1.0 },
          { id: "java_3", domain: "Java Development", subject: "Keywords", question: "Which keyword is used to prevent method overriding in Java?", options: ["final", "static", "abstract", "private"], correct_answer: "final", marks: 1.0 },
          { id: "java_4", domain: "Java Development", subject: "Multithreading", question: "Which interface must be implemented to create a thread in Java?", options: ["Runnable", "Callable", "Serializable", "Cloneable"], correct_answer: "Runnable", marks: 1.0 },
          { id: "java_5", domain: "Java Development", subject: "Collections", question: "Which collection class allows unique elements only in Java?", options: ["HashSet", "ArrayList", "LinkedList", "Vector"], correct_answer: "HashSet", marks: 1.0 },
        ];
      }

      if (domain.includes("data") || domain.includes("analytic") || domain.includes("sql")) {
        return [
          { id: "da_1", domain: "Data Analytics", subject: "Pandas", question: "Which Python library is primarily used for data manipulation and analysis?", options: ["Pandas", "Matplotlib", "Scikit-Learn", "Flask"], correct_answer: "Pandas", marks: 1.0 },
          { id: "da_2", domain: "Data Analytics", subject: "SQL", question: "Which SQL clause is used to aggregate rows into summary groups?", options: ["GROUP BY", "ORDER BY", "HAVING", "WHERE"], correct_answer: "GROUP BY", marks: 1.0 },
          { id: "da_3", domain: "Data Analytics", subject: "Visualization", question: "Which chart type is best suited for displaying numeric frequency distributions?", options: ["Histogram", "Pie Chart", "Line Plot", "Scatter Plot"], correct_answer: "Histogram", marks: 1.0 },
          { id: "da_4", domain: "Data Analytics", subject: "Data Cleaning", question: "Which function in Pandas fills missing null values in a DataFrame?", options: ["fillna()", "dropna()", "isna()", "isnull()"], correct_answer: "fillna()", marks: 1.0 },
          { id: "da_5", domain: "Data Analytics", subject: "Statistics", question: "Which metric calculates the correlation coefficient ranging from -1 to +1?", options: ["Pearson Correlation", "Spearman RMSE", "R-Squared", "Cosine Distance"], correct_answer: "Pearson Correlation", marks: 1.0 },
        ];
      }

      if (domain.includes("ai") || domain.includes("machine") || domain.includes("learning") || domain.includes("ml")) {
        return [
          { id: "aiml_1", domain: "Artificial Intelligence", subject: "Algorithms", question: "Which algorithm is used for supervised classification using decision trees ensembles?", options: ["Random Forest", "K-Means", "DBSCAN", "PCA"], correct_answer: "Random Forest", marks: 1.0 },
          { id: "aiml_2", domain: "Artificial Intelligence", subject: "Neural Nets", question: "Which activation function outputs values in the range (0, 1)?", options: ["Sigmoid", "ReLU", "Tanh", "Softmax"], correct_answer: "Sigmoid", marks: 1.0 },
          { id: "aiml_3", domain: "Artificial Intelligence", subject: "Model Fitting", question: "What phenomenon occurs when a model performs well on training data but poorly on test data?", options: ["Overfitting", "Underfitting", "Generalization", "Bias Error"], correct_answer: "Overfitting", marks: 1.0 },
          { id: "aiml_4", domain: "Artificial Intelligence", subject: "Metrics", question: "What metric calculates the harmonic mean of Precision and Recall?", options: ["F1-Score", "ROC-AUC", "MAE", "Accuracy"], correct_answer: "F1-Score", marks: 1.0 },
          { id: "aiml_5", domain: "Artificial Intelligence", subject: "Optimization", question: "Which optimization algorithm updates model weights based on loss gradients?", options: ["Gradient Descent", "K-Nearest Neighbors", "PCA", "Naive Bayes"], correct_answer: "Gradient Descent", marks: 1.0 },
        ];
      }

      if (domain.includes("med") || domain.includes("coding")) {
        return [
          { id: "mcq_1", domain: "Medical Coding", subject: "ICD-10", question: "What does ICD stand for in medical coding?", options: ["International Classification of Diseases", "Internal Clinical Diagnosis", "Integrated Coding System", "International Charting Document"], correct_answer: "International Classification of Diseases", marks: 1.0 },
          { id: "mcq_2", domain: "Medical Coding", subject: "CPT", question: "CPT codes are maintained by which organization?", options: ["American Medical Association (AMA)", "World Health Organization (WHO)", "Centers for Medicare & Medicaid Services (CMS)", "FDA"], correct_answer: "American Medical Association (AMA)", marks: 1.0 },
          { id: "mcq_3", domain: "Medical Coding", subject: "HIPAA", question: "Which regulation protects patient health information privacy in healthcare IT?", options: ["HIPAA Privacy Rule", "GDPR", "FERPA", "SOX"], correct_answer: "HIPAA Privacy Rule", marks: 1.0 },
          { id: "mcq_4", domain: "Medical Coding", subject: "Anatomy", question: "What is the primary function of red blood cells (erythrocytes)?", options: ["Transport oxygen", "Fight infections", "Blood clotting", "Produce antibodies"], correct_answer: "Transport oxygen", marks: 1.0 },
          { id: "mcq_5", domain: "Medical Coding", subject: "HCPCS", question: "Level II HCPCS codes primarily cover which of the following?", options: ["Ambulance services & durable medical equipment", "Surgical procedures", "Inpatient hospital stays", "Lab tests"], correct_answer: "Ambulance services & durable medical equipment", marks: 1.0 },
        ];
      }

      if (domain.includes("vlsi") || domain.includes("embedded") || domain.includes("integrated")) {
        return [
          { id: "vlsi_1", domain: "Integrated VLSI", subject: "Digital Logic", question: "Which logic gate outputs 1 only when both inputs are equal?", options: ["XNOR Gate", "XOR Gate", "NAND Gate", "NOR Gate"], correct_answer: "XNOR Gate", marks: 1.0 },
          { id: "vlsi_2", domain: "Integrated VLSI", subject: "Verilog", question: "Which keyword defines a procedural block executed on clock edges in Verilog?", options: ["always", "initial", "assign", "module"], correct_answer: "always", marks: 1.0 },
          { id: "vlsi_3", domain: "Integrated VLSI", subject: "CMOS", question: "In CMOS technology, what pair of transistors is used to construct a static inverter?", options: ["PMOS pull-up and NMOS pull-down", "Two NMOS transistors", "Two PMOS transistors", "BJT NPN and PNP"], correct_answer: "PMOS pull-up and NMOS pull-down", marks: 1.0 },
        ];
      }

      return [
        { id: "fs_1", domain: "Full Stack", subject: "React & JS", question: "What is the virtual DOM in React?", options: ["A lightweight copy of the real DOM in memory", "A physical hardware component", "A CSS styling framework", "A database engine"], correct_answer: "A lightweight copy of the real DOM in memory", marks: 1.0 },
        { id: "fs_2", domain: "Full Stack", subject: "JavaScript", question: "Which keyword declares a block-scoped variable in ES6?", options: ["let", "var", "global", "dim"], correct_answer: "let", marks: 1.0 },
        { id: "fs_3", domain: "Full Stack", subject: "Node.js", question: "What event loop mechanism handles asynchronous I/O operations in Node.js?", options: ["libuv", "V8 Engine", "React Fiber", "Redux Thunk"], correct_answer: "libuv", marks: 1.0 },
        { id: "fs_4", domain: "Full Stack", subject: "Python", question: "Which built-in data type in Python is immutable?", options: ["Tuple", "List", "Dictionary", "Set"], correct_answer: "Tuple", marks: 1.0 },
        { id: "fs_5", domain: "Full Stack", subject: "SQL", question: "Which SQL clause is used to filter aggregated group records?", options: ["HAVING", "WHERE", "ORDER BY", "GROUP BY"], correct_answer: "HAVING", marks: 1.0 },
      ];
    };

    const initExam = async () => {
      try {
        setLoading(true);

        // Always fetch fresh session details with exact assigned questions_detail from backend
        let res = await apiClient.post(API_ENDPOINTS.EXAMS.START).catch((err) => err.response || null);

        if (res?.data?.error) {
          setError(res.data.error);
          return;
        }

        const sessionData = res?.data?.exam || res?.data || location.state?.examSession;

        if (isMounted && sessionData && !sessionData.error) {
          setExamSession(sessionData);

          let qList = sessionData.questions_detail || [];
          if ((!qList || qList.length === 0 || typeof qList[0] === "string") && sessionData.questions) {
            if (Array.isArray(sessionData.questions) && sessionData.questions.length > 0 && typeof sessionData.questions[0] === "object") {
              qList = sessionData.questions;
            }
          }

          setQuestions(qList);

          const savedAnswers = sessionData.answers || {};
          setAnswers(savedAnswers);

          const savedStates = sessionData.question_states || {};
          setQuestionStates(savedStates);

          setCheatCount(sessionData.cheat_count || 0);
          setCheatLogs(sessionData.cheat_logs || []);

          // Dynamic duration & timer calculation directly from Admin live sessionData
          let durationMins = Number(sessionData.duration_minutes) || 5;
          let remainingSecs = durationMins * 60;
          if (sessionData.started_at) {
            const startMs = new Date(sessionData.started_at).getTime();
            const elapsedSecs = Math.floor((Date.now() - startMs) / 1000);
            remainingSecs = Math.max(0, durationMins * 60 - elapsedSecs);
          }
          setTimeLeft(remainingSecs);

          // Mark first question as NOT_ANSWERED if NOT_VISITED
          if (qList.length > 0) {
            const firstId = qList[0].id;
            if (!savedStates[firstId]) {
              setQuestionStates((prev) => ({ ...prev, [firstId]: "NOT_ANSWERED" }));
            }
          }
        }
      } catch (err) {
        console.error("Failed to initialize exam session:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initExam();
    return () => {
      isMounted = false;
    };
  }, [location.state]);

  // Submit Exam API Handler
  const handleFinalSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    isSubmittedRef.current = true;

    try {
      const targetId = examSession?.id || "active_session";
      const res = await apiClient
        .post(API_ENDPOINTS.EXAMS.SUBMIT(targetId), {
          answers,
          question_states: questionStates,
          cheat_logs: cheatLogs,
          cheat_count: cheatCount,
        })
        .catch((err) => {
          console.warn("API submit endpoint error, switching to resilient client evaluation:", err);
          return null;
        });

      let evaluated = res?.data?.exam || res?.data;

      // Resilient Client-Side Evaluation Fallback
      if (!evaluated || typeof evaluated !== "object" || evaluated.percentage === undefined) {
        let totalMarks = 0;
        let obtainedMarks = 0;

        (questions || []).forEach((q) => {
          const qMarks = Number(parseFloat(q.marks)) || 1.0;
          totalMarks += qMarks;
          const userAns = answers[q.id];

          if (userAns !== undefined && userAns !== null) {
            const cleanUser = String(userAns).replace(/^(?:[A-D][.\):]|Option\s+[A-D][:.]?)\s*/i, "").trim().toLowerCase();
            const cleanCorrect = String(q.correct_answer || "").replace(/^(?:[A-D][.\):]|Option\s+[A-D][:.]?)\s*/i, "").trim().toLowerCase();

            if (cleanUser === cleanCorrect || String(userAns).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()) {
              obtainedMarks += qMarks;
            }
          }
        });

        const pct = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
        const isDisqualified = (cheatCount >= 5);
        const passPct = Number(parseFloat(examSession?.pass_percentage)) || 40.0;
        const isQualified = (pct >= passPct) && (!isDisqualified);

        evaluated = {
          id: examSession?.id || `SESSION-${Date.now()}`,
          domain: examSession?.domain || examSession?.course_name || "Screening Track",
          total_marks: Math.round(totalMarks),
          marks_obtained: Math.round(obtainedMarks),
          percentage: pct,
          qualified: isQualified,
          cheat_count: cheatCount,
          cheat_logs: cheatLogs,
          status: "EVALUATED",
          submitted_at: new Date().toISOString(),
        };

        const courseId = location.state?.selectedCourse || examSession?.course_id || "default_med";
        if (isDisqualified) {
          localStorage.setItem(`sure_exam_disqualified_${courseId}`, "true");
        }
      }

      // Always sync local applications storage with final evaluation result
      const isQualified = evaluated?.qualified === true || (evaluated?.percentage != null && Number(evaluated.percentage) >= (examSession?.pass_percentage || 40.0));
      const pctScore = evaluated?.percentage != null ? evaluated.percentage : 0;
      const courseId = location.state?.selectedCourse || examSession?.course_id || "default_med";

      try {
        const localApps = JSON.parse(localStorage.getItem("sure_student_applications") || "[]");
        const targetAppId = examSession?.application_id || examSession?.application?.id || location.state?.applicationId;
        const updatedLocalApps = localApps.map((a) => {
          const matchById = targetAppId && a.id === targetAppId;
          const matchByCourse = courseId && (a.course_id === courseId || a.course?.id === courseId);
          if (matchById || matchByCourse || localApps.length === 1) {
            return {
              ...a,
              status: isQualified ? "QUALIFIED" : "REJECTED",
              qualified: isQualified,
              qualification_score: pctScore,
              score: pctScore,
              exam_status: "EVALUATED",
              exam_taken: true,
            };
          }
          return a;
        });
        localStorage.setItem("sure_student_applications", JSON.stringify(updatedLocalApps));
      } catch (e) {
        console.warn("Failed to update local application state:", e);
      }

      // Exit fullscreen if active
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }

      navigate("/student/exam-result", { state: { examResult: evaluated, questions } });
    } catch (err) {
      console.error("Local evaluation fallback exception:", err);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
      navigate("/student/exam-result", {
        state: {
          examResult: {
            percentage: 0,
            qualified: false,
            cheat_count: cheatCount,
            status: "EVALUATED",
          },
          questions,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }, [submitting, examSession, answers, questionStates, cheatLogs, cheatCount, questions, location.state, navigate]);

  // Countdown Timer Hook
  useEffect(() => {
    if (loading || !examSession || submitting) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit(); // Auto-submit when timer expires
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, examSession, submitting, handleFinalSubmit]);

  // Periodic Background Progress Sync
  useEffect(() => {
    if (loading || !examSession?.id || submitting) return;

    syncTimerRef.current = setInterval(() => {
      apiClient
        .post(API_ENDPOINTS.EXAMS.SYNC(examSession.id), {
          answers,
          question_states: questionStates,
          cheat_logs: cheatLogs,
          cheat_count: cheatCount,
        })
        .catch((err) => console.warn("Background sync warning:", err));
    }, 15000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [loading, examSession, answers, questionStates, cheatLogs, cheatCount, submitting]);

  // Ref to track auto-submission state without infinite re-entrancy loops
  const isAutoSubmittingRef = useRef(false);

  // Anti-Cheating & Security Listeners
  const logSecurityViolation = useCallback((type, message) => {
    if (isAutoSubmittingRef.current) return;

    const violationEvent = {
      type,
      message,
      timestamp: new Date().toISOString(),
    };

    setCheatCount((prev) => {
      const nextCount = prev + 1;
      if (nextCount >= 5 && !isAutoSubmittingRef.current) {
        isAutoSubmittingRef.current = true;
        const courseId = location.state?.selectedCourse || examSession?.course_id || "default_med";
        localStorage.setItem(`sure_exam_disqualified_${courseId}`, "true");

        // Immediately submit without browser alert loop
        setTimeout(() => {
          handleFinalSubmit();
        }, 50);
      }
      return nextCount;
    });

    setCheatLogs((prev) => [...prev, violationEvent]);
    setSecurityModalText(message);
  }, [location.state, examSession, handleFinalSubmit]);

  useEffect(() => {
    if (loading || submitting || isAutoSubmittingRef.current) return;

    // 1. Fullscreen exit detection
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isAutoSubmittingRef.current) {
        logSecurityViolation("FULLSCREEN_EXIT", "Security Alert: Full-screen mode was exited! Please stay in full-screen mode during the exam.");
      }
    };

    // 2. Tab switch / Window focus loss
    const handleVisibilityChange = () => {
      if (document.hidden && !isAutoSubmittingRef.current) {
        logSecurityViolation("TAB_SWITCH", "Security Alert: Tab switch or browser minimize detected! This activity is logged as a cheating violation.");
      }
    };

    const handleWindowBlur = () => {
      if (!isAutoSubmittingRef.current) {
        logSecurityViolation("WINDOW_BLUR", "Security Alert: Browser lost focus. Switching applications is strictly prohibited.");
      }
    };

    // 3. Disable Right Click, Copy, Cut, Paste, Select
    const handleContextMenu = (e) => e.preventDefault();
    const handleCopyCutPaste = (e) => e.preventDefault();

    // 4. Disable inspection keyboard shortcuts
    const handleKeyDown = (e) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && (e.key === "u" || e.key === "c" || e.key === "v" || e.key === "a"))
      ) {
        e.preventDefault();
        logSecurityViolation("KEYBOARD_SHORTCUT", `Keyboard shortcut '${e.key}' blocked.`);
      }
    };

    // 5. Auto-Submit & Reject on tab close, page navigation, or URL edit
    const handleBeforeUnload = (e) => {
      if (isSubmittedRef.current || isAutoSubmittingRef.current) return;

      isAutoSubmittingRef.current = true;
      isSubmittedRef.current = true;

      const session = examSessionRef.current;
      const targetId = session?.id || "active_session";
      const courseId = location.state?.selectedCourse || session?.course_id;

      if (courseId) {
        localStorage.setItem(`sure_exam_disqualified_${courseId}`, "true");
      }

      try {
        const payload = JSON.stringify({
          answers: answersRef.current || {},
          cheat_count: 5,
          cheat_logs: [{ type: "EXAM_ABANDONED", message: "Exam session closed prematurely by navigating away or closing window.", timestamp: new Date().toISOString() }],
        });
        const beaconUrl = `${apiClient.defaults.baseURL || "http://127.0.0.1:8000"}/api/exams/${targetId}/submit/`;
        navigator.sendBeacon(beaconUrl, new Blob([payload], { type: "application/json" }));
      } catch (err) { }

      try {
        const localApps = JSON.parse(localStorage.getItem("sure_student_applications") || "[]");
        const targetAppId = session?.application_id || session?.application?.id || location.state?.applicationId;
        const updatedLocalApps = localApps.map((a) => {
          const matchById = targetAppId && a.id === targetAppId;
          const matchByCourse = courseId && (a.course_id === courseId || a.course?.id === courseId);
          if (matchById || matchByCourse) {
            return {
              ...a,
              status: "REJECTED",
              qualified: false,
              qualification_score: 0,
              score: 0,
              exam_status: "EVALUATED",
            };
          }
          return a;
        });
        localStorage.setItem("sure_student_applications", JSON.stringify(updatedLocalApps));
      } catch (err) { }

      e.preventDefault();
      e.returnValue = "Leaving or closing the exam will result in immediate REJECTION and disqualification.";
      return e.returnValue;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopyCutPaste);
    document.addEventListener("cut", handleCopyCutPaste);
    document.addEventListener("paste", handleCopyCutPaste);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopyCutPaste);
      document.removeEventListener("cut", handleCopyCutPaste);
      document.removeEventListener("paste", handleCopyCutPaste);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [loading, submitting, logSecurityViolation]);

  // Question Navigation & Option Selection
  const activeQuestion = questions[currentIndex];
  const activeQId = activeQuestion?.id;

  const handleSelectOption = (optionValue) => {
    if (!activeQId) return;
    setAnswers((prev) => ({ ...prev, [activeQId]: optionValue }));

    // If marked, set to ANSWERED_MARKED else ANSWERED
    const currentState = questionStates[activeQId];
    if (currentState === "MARKED" || currentState === "ANSWERED_MARKED") {
      setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED_MARKED" }));
    } else {
      setQuestionStates((prev) => ({ ...prev, [activeQId]: "ANSWERED" }));
    }
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
      if (!questionStates[nextId]) {
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
      if (!questionStates[nextId]) {
        setQuestionStates((prev) => ({ ...prev, [nextId]: "NOT_ANSWERED" }));
      }
    }
  };

  const handleClearResponse = () => {
    if (!activeQId) return;
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[activeQId];
      return copy;
    });
    setQuestionStates((prev) => ({ ...prev, [activeQId]: "NOT_ANSWERED" }));
  };

  const handleTileClick = (index) => {
    // Set current active state before jumping
    if (activeQId && !questionStates[activeQId]) {
      setQuestionStates((prev) => ({ ...prev, [activeQId]: "NOT_ANSWERED" }));
    }

    setCurrentIndex(index);
    const targetId = questions[index].id;
    if (!questionStates[targetId]) {
      setQuestionStates((prev) => ({ ...prev, [targetId]: "NOT_ANSWERED" }));
    }
  };

  // Re-enter Fullscreen Helper
  const reEnterFullscreen = async () => {
    setSecurityModalText(null);
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen request error:", e);
    }
  };

  // Palette State Counters
  const getCounts = () => {
    let answered = 0;
    let notAnswered = 0;
    let marked = 0;
    let ansMarked = 0;
    let notVisited = 0;

    questions.forEach((q) => {
      const state = questionStates[q.id] || "NOT_VISITED";
      if (state === "ANSWERED") answered++;
      else if (state === "NOT_ANSWERED") notAnswered++;
      else if (state === "MARKED") marked++;
      else if (state === "ANSWERED_MARKED") ansMarked++;
      else notVisited++;
    });

    return { answered, notAnswered, marked, ansMarked, notVisited };
  };

  const counts = getCounts();

  // Format Timer String MM:SS
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-main)", fontFamily: "sans-serif" }}>
        <div style={{ backgroundColor: "var(--bg-card)", padding: "3rem", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: "450px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</div>
          <h2 style={{ color: "var(--text-primary)", margin: "0 0 0.5rem 0" }}>Initializing Screening Exam Portal</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>Setting up secure anti-cheat environment and loading domain question set...</p>
        </div>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-main)", fontFamily: "sans-serif" }}>
        <div style={{ backgroundColor: "var(--bg-card)", padding: "3rem", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: "450px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
          <h2 style={{ color: "var(--danger-color)", margin: "0 0 0.5rem 0" }}>No Questions Available</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "1.5rem" }}>Questions could not be loaded for your test domain.</p>
          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            style={{ padding: "10px 20px", backgroundColor: "var(--primary-color)", color: "var(--btn-text, #ffffff)", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.ntaExamPortal}>
      {/* Top Header Bar */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.ntaLogo}>SURE TRUST Screening Exam</div>
          <span className={styles.domainBadge}>
            Track: {examSession?.course_name || examSession?.domain || "General"}
          </span>
        </div>

        <div className={styles.headerCenter}>
          <div className={styles.candidateDetails}>
            <span>Candidate Name: <strong>{examSession?.student_name || examSession?.student_email || user?.name || user?.email?.split('@')[0] || "Student Candidate"}</strong></span>
            <span>Subject Domain: <strong>{activeQuestion?.subject || activeQuestion?.domain || examSession?.domain || "Screening Test"}</strong></span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={`${styles.timerBox} ${timeLeft < 300 ? styles.timerWarning : ""}`}>
            <span className={styles.timerLabel}>Time Left:</span>
            <span className={styles.timerClock}>{formatTime(timeLeft)}</span>
          </div>
        </div>
      </header>

      {/* Security Violation Alert Modal */}
      {securityModalText && (
        <div className={styles.modalOverlay}>
          <div className={styles.securityModal}>
            <div className={styles.warningIcon}>⚠️</div>
            <h2>Security Warning</h2>
            <p>{securityModalText}</p>
            <div className={styles.violationCount}>
              Total Cheating Violations Recorded: <strong>{cheatCount}</strong>
            </div>
            <button type="button" className={styles.warningButton} onClick={reEnterFullscreen}>
              Return to Exam (Full-Screen)
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.submitModal}>
            <h2>Confirm Exam Submission</h2>
            <p>Are you sure you want to submit your examination?</p>

            <div className={styles.summaryGrid}>
              <div className={`${styles.summaryItem} ${styles.bgGreen}`}>
                <span>Answered</span>
                <strong>{counts.answered}</strong>
              </div>
              <div className={`${styles.summaryItem} ${styles.bgRed}`}>
                <span>Not Answered</span>
                <strong>{counts.notAnswered}</strong>
              </div>
              <div className={`${styles.summaryItem} ${styles.bgPurple}`}>
                <span>Marked for Review</span>
                <strong>{counts.marked}</strong>
              </div>
              <div className={`${styles.summaryItem} ${styles.bgPurpleStar}`}>
                <span>Answered & Marked</span>
                <strong>{counts.ansMarked}</strong>
              </div>
              <div className={`${styles.summaryItem} ${styles.bgGray}`}>
                <span>Not Visited</span>
                <strong>{counts.notVisited}</strong>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                Resume Examination
              </button>
              <button
                type="button"
                className={styles.confirmSubmitBtn}
                onClick={handleFinalSubmit}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Yes, Submit Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Examination Workspace */}
      <div className={styles.mainLayout}>
        {/* Left Section: Question & Options */}
        <section className={styles.questionPanel}>
          <div className={styles.questionHeader}>
            <span className={styles.qNumLabel}>
              Question No. {currentIndex + 1} of {questions.length}
            </span>
            <span className={styles.marksLabel}>Marks: +1.0 | -0.0</span>
          </div>

          <div className={styles.questionContent}>
            <h3 className={styles.questionText}>{activeQuestion?.question}</h3>

            <div className={styles.optionsList}>
              {((activeQuestion?.options && activeQuestion.options.length > 0) ? activeQuestion.options : ["Option A", "Option B", "Option C", "Option D"]).map((optionStr, optIdx) => {
                const optKey = String.fromCharCode(65 + optIdx); // A, B, C, D
                const rawVal = String(optionStr || "").trim();
                const strippedVal = rawVal.replace(/^(?:[A-D][.\):]|Option\s+[A-D][:.]?)\s+/i, "").trim();
                const cleanText = strippedVal || rawVal || `Choice ${optKey}`;

                const isSelected = answers[activeQId] === optionStr || answers[activeQId] === optKey || answers[activeQId] === cleanText;

                return (
                  <label
                    key={optIdx}
                    className={`${styles.optionCard} ${isSelected ? styles.optionSelected : ""}`}
                  >
                    <input
                      type="radio"
                      name={`question_${activeQId}`}
                      value={optionStr}
                      checked={isSelected}
                      onChange={() => handleSelectOption(optionStr)}
                    />
                    <span className={styles.optionKey}>{optKey}.</span>
                    <span className={styles.optionVal}>{cleanText}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Bottom Toolbar Controls */}
          <footer className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
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
              >
                Clear Response
              </button>
            </div>

            <div className={styles.toolbarRight}>
              <button
                type="button"
                className={styles.btnSaveNext}
                onClick={handleSaveAndNext}
              >
                Save & Next
              </button>
              <button
                type="button"
                className={styles.btnSubmit}
                onClick={() => setShowSubmitModal(true)}
              >
                Submit Exam
              </button>
            </div>
          </footer>
        </section>

        {/* Right Section: Question Palette Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.profileBox}>
            <div className={styles.avatarCircle}>
              {examSession?.student_name ? examSession.student_name.charAt(0).toUpperCase() : "S"}
            </div>
            <div className={styles.profileMeta}>
              <strong>{examSession?.student_name || "Student"}</strong>
              <small>Candidate</small>
            </div>
          </div>

          {/* 1. TOP: Choose Question Panel */}
          <div style={{ background: "var(--bg-card)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)", marginBottom: "16px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-primary)", letterSpacing: "0.5px" }}>
                Choose a Question
              </h4>
              <span style={{ fontSize: "0.78rem", background: "rgba(2, 132, 199, 0.15)", color: "var(--info-color, #0ea5e9)", fontWeight: 700, padding: "2px 8px", borderRadius: "12px" }}>
                {questions.length} Questions
              </span>
            </div>

            {/* 5 Columns Flex Wrap Square Buttons Grid */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                justifyContent: "flex-start",
                alignItems: "flex-start",
                maxHeight: "260px",
                overflowY: "auto",
                padding: "4px 2px",
                boxSizing: "border-box"
              }}
            >
              {questions.map((q, idx) => {
                const state = questionStates[q.id] || "NOT_VISITED";
                const isCurrent = idx === currentIndex;

                // Color mappings
                let bg = "var(--bg-surface)";
                let text = "var(--text-primary)";
                let border = "var(--border-color)";

                if (state === "ANSWERED") {
                  bg = "#16a34a";
                  text = "#ffffff";
                  border = "#15803d";
                } else if (state === "NOT_ANSWERED") {
                  bg = "#dc2626";
                  text = "#ffffff";
                  border = "#b91c1c";
                } else if (state === "MARKED") {
                  bg = "#8b5cf6";
                  text = "#ffffff";
                  border = "#7c3aed";
                } else if (state === "ANSWERED_MARKED") {
                  bg = "#7c3aed";
                  text = "#ffffff";
                  border = "#6d28d9";
                }

                return (
                  <button
                    key={q.id || idx}
                    type="button"
                    onClick={() => handleTileClick(idx)}
                    style={{
                      width: "42px",
                      height: "42px",
                      minWidth: "42px",
                      minHeight: "42px",
                      maxWidth: "42px",
                      maxHeight: "42px",
                      borderRadius: "8px",
                      background: bg,
                      color: text,
                      border: isCurrent ? "3px solid #0284c7" : `1px solid ${border}`,
                      boxShadow: isCurrent ? "0 0 0 2px #38bdf8" : "none",
                      fontWeight: 700,
                      fontSize: "0.92rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: 0,
                      padding: 0,
                      boxSizing: "border-box",
                      flexShrink: 0,
                      position: "relative"
                    }}
                  >
                    {idx + 1}
                    {state === "ANSWERED_MARKED" && (
                      <span style={{ position: "absolute", top: "1px", right: "3px", fontSize: "0.55rem" }}>★</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. LOWER: Question Legend */}
          <div style={{ background: "var(--bg-card)", padding: "14px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
              Question Legend
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "var(--text-primary)" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem" }}>{counts.answered}</span>
                <span>Answered</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "var(--text-primary)" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem" }}>{counts.notAnswered}</span>
                <span>Not Answered</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "var(--text-primary)" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem" }}>{counts.notVisited}</span>
                <span>Not Visited</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "var(--text-primary)" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "#8b5cf6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem" }}>{counts.marked}</span>
                <span>Marked</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "var(--text-primary)", gridColumn: "span 2" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "#7c3aed", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem" }}>{counts.ansMarked}</span>
                <span>Ans & Marked</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Exam;