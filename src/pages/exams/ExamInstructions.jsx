import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  fetchAuthoritativeExamContext,
  startInternalExam,
} from "../../services/examService";
import { studentService } from "../../services/studentService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { SureProEdLogo } from "../../components/common/SureProEdLogo";
import {
  FiClock,
  FiFileText,
  FiAward,
  FiAlertCircle,
  FiAlertTriangle,
  FiShield,
  FiLock,
  FiCamera,
  FiMic,
  FiMonitor,
  FiEye,
  FiRefreshCw,
  FiCalendar,
  FiLayers,
  FiArrowRight,
  FiCheck,
  FiX,
} from "react-icons/fi";
import styles from "./ExamInstructions.module.css";

function ExamInstructions() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [error, setError] = useState(null);

  const [profileComplete, setProfileComplete] = useState(true);
  const [activeApplication, setActiveApplication] = useState(null);
  const [activeCourseTrack, setActiveCourseTrack] = useState(null);
  const [latestSchedule, setLatestSchedule] = useState(null);
  const [latestExam, setLatestExam] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isNewScheduleActive, setIsNewScheduleActive] = useState(false);

  // Live 1-second interval to update countdown timer in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isQualifiedCandidate, setIsQualifiedCandidate] = useState(false);
  const [isFailedCandidate, setIsFailedCandidate] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [statistics, setStatistics] = useState({});

  // Mandatory Camera & Microphone State
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [checkingMedia, setCheckingMedia] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [audioFreqBands, setAudioFreqBands] = useState([20, 35, 50, 65, 45, 30, 55, 40, 25, 15]);
  const videoPreviewRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const animFrameRef = useRef(null);

  // Backend-driven configuration (loaded authoritative from server)
  const [examConfig, setExamConfig] = useState(null);

  const levelRef = useRef(0);

  // Stop media stream tracks cleanly
  const stopMediaStream = useCallback(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
    setMicAudioLevel(0);
    setAudioFreqBands([8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
  }, [mediaStream]);

  // Clean up media streams on unmount
  useEffect(() => {
    return () => {
      stopMediaStream();
    };
  }, [stopMediaStream]);

  // Connect live stream to video preview element whenever stream or camera state updates
  useEffect(() => {
    if (videoPreviewRef.current && mediaStream && cameraActive) {
      videoPreviewRef.current.srcObject = mediaStream;
      const playResult = videoPreviewRef.current.play();
      playResult?.catch((e) => {
        console.warn("Video preview play note:", e);
      });
    }
  }, [mediaStream, cameraActive]);

  // Real-time High-Sensitivity Audio Visualizer with Connected Audio Pipeline
  useEffect(() => {
    if (!mediaStream || !micActive) {
      return;
    }

    let isCancelled = false;
    let audioCtx = null;
    let animId = null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = audioContextRef.current && audioContextRef.current.state !== "closed"
          ? audioContextRef.current
          : new AudioCtx();
        audioContextRef.current = audioCtx;

        if (audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }

        const aTracks = mediaStream.getAudioTracks();
        if (aTracks.length > 0 && aTracks[0].enabled) {
          const source = audioCtx.createMediaStreamSource(mediaStream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.75; // Smooth out high-frequency flutter
          audioAnalyserRef.current = analyser;

          // Connect through silent gain node to destination to force WebAudio pipeline continuous processing
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 0.0;
          source.connect(analyser);
          analyser.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const timeData = new Uint8Array(analyser.fftSize);

          const updateMeter = () => {
            if (isCancelled) return;

            try {
              analyser.getByteFrequencyData(dataArray);
              analyser.getByteTimeDomainData(timeData);

              // 1. Pure Real-time Time-domain RMS Calculation
              let sumSquares = 0;
              for (let i = 0; i < timeData.length; i++) {
                const norm = (timeData[i] - 128) / 128;
                sumSquares += norm * norm;
              }
              const rms = Math.sqrt(sumSquares / (timeData.length || 1));

              // Real voice percentage (0% at silence, up to 100% on speech)
              const rawVoiceLevel = Math.min(100, Math.round(rms * 320));

              // Smooth low-pass filtering to eliminate rapid number jitter
              levelRef.current = Math.round((levelRef.current * 0.7) + (rawVoiceLevel * 0.3));

              // 2. Real Frequency Band Spectrum (10 distinct bands)
              const numBands = 10;
              const step = Math.floor(Math.min(40, dataArray.length) / numBands) || 1;
              const bands = [];
              for (let b = 0; b < numBands; b++) {
                const rawFreq = dataArray[b * step] || 0;
                // Pure real band height without fake sine oscillation
                const bandHeight = Math.min(100, Math.max(8, Math.round((rawFreq / 180) * 100)));
                bands.push(bandHeight);
              }
              setAudioFreqBands(bands);

              // Set live percentage
              setMicAudioLevel(levelRef.current);
            } catch (err) {
              console.warn("Meter update frame error:", err);
            }

            animId = requestAnimationFrame(updateMeter);
          };

          updateMeter();
        }
      }
    } catch (audioErr) {
      console.warn("Audio meter init notice:", audioErr);
    }

    return () => {
      isCancelled = true;
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => {});
      }
    };
  }, [mediaStream, micActive]);

  // Request Camera & Microphone Permissions
  const requestMediaPermissions = async () => {
    try {
      setCheckingMedia(true);
      setMediaError(null);

      // Stop previous instance if any
      stopMediaStream();

      // Explicitly initialize AudioContext synchronously in user gesture
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          if (audioCtx.state === "suspended") {
            await audioCtx.resume();
          }
        }
      } catch (ctxErr) {
        console.warn("AudioContext synchronous init note:", ctxErr);
      }

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error(
          "Your browser does not support media device capture. Please use a modern browser (Chrome, Firefox, Edge, Safari)."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      // Verify active video and audio tracks
      const vTrack = stream.getVideoTracks()[0];
      const aTrack = stream.getAudioTracks()[0];

      const isVideoActive = Boolean(vTrack && vTrack.readyState === "live" && vTrack.enabled);
      const isAudioActive = Boolean(aTrack && aTrack.readyState === "live" && aTrack.enabled);

      setMediaStream(stream);
      setCameraActive(isVideoActive);
      setMicActive(isAudioActive);

      if (!isVideoActive || !isAudioActive) {
        setMediaError(
          "Camera or Microphone was detected as muted or inactive. Please verify both devices in your browser settings."
        );
      }

      return stream;
    } catch (err) {
      console.error("[Device Readiness Check] Error:", err);
      setCameraActive(false);
      setMicActive(false);
      setMediaStream(null);

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMediaError(
          "Camera / Microphone permission denied. Please click the lock or camera icon in your browser URL bar and allow permissions, then click 'Enable Camera & Microphone' again."
        );
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setMediaError(
          "No webcam or microphone hardware found. Please connect a working camera and microphone to take this proctored examination."
        );
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setMediaError(
          "Camera or Microphone is currently in use by another application (e.g. Google Meet, Zoom, Teams). Please close other video tabs or applications and retry."
        );
      } else {
        setMediaError(err.message || "Failed to access camera and microphone.");
      }
      return null;
    } finally {
      setCheckingMedia(false);
    }
  };

  // 1. Authoritative Backend State Fetcher & Auto-Poll for Admin Start
  useEffect(() => {
    let isMounted = true;

    const loadExamContext = async (silent = false) => {
      try {
        if (!silent) setFetchingData(true);
        if (!silent) setError(null);

        const [authContext, studentProfile, statsRes] = await Promise.all([
          fetchAuthoritativeExamContext(),
          user?.email ? studentService.getProfile(user.email).catch(() => null) : Promise.resolve(null),
          apiClient.get(API_ENDPOINTS.STUDENTS.STATISTICS).catch(() => ({ data: {} })),
        ]);

        if (!isMounted) return;

        if (authContext) {
          setActiveApplication(authContext.activeApp);
          setActiveCourseTrack(authContext.courseObj);
          setLatestSchedule(authContext.latestSchedule);
          setLatestExam(authContext.latestExam);
          setIsNewScheduleActive(authContext.isNewScheduleActive);
          setIsCompleted(authContext.isCompleted);
          setIsQualifiedCandidate(authContext.isQualified);
          setIsFailedCandidate(Boolean(authContext.isFailed));
          setIsEnrolled(Boolean(authContext.isEnrolled));

          if (authContext.examConfig) {
            setExamConfig(authContext.examConfig);
          }

          // Check if candidate reached maximum violations
          const latestExamObj = authContext.latestExam;
          if (
            latestExamObj &&
            latestExamObj.cheat_count >= 5 &&
            latestExamObj.status === "EVALUATED" &&
            !authContext.isNewScheduleActive
          ) {
            setIsDisqualified(true);
          }

          setStatistics(statsRes?.data || {});
          setProfileComplete(studentProfile ? studentService.isProfileComplete(studentProfile) : true);
        }
      } catch (err) {
        console.error("[ExamInstructions] Context loading error:", err);
        if (isMounted && !silent) {
          setError("Failed to load examination context from server. Please refresh or contact support.");
        }
      } finally {
        if (isMounted && !silent) setFetchingData(false);
      }
    };

    // Initial load
    loadExamContext(false);

    // Auto-polling interval: check every 2 seconds so when admin starts exam,
    // the page automatically unlocks without requiring manual reload.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadExamContext(true);
      }
    }, 2000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        loadExamContext(true);
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [user]);

  // Format Date and Time
  const formatDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return String(dateStr);
    }
  };

  // Format Duration helper
  const formatMinutes = (mins) => {
    const m = Number(mins) || 45;
    if (m >= 60) {
      const hrs = Math.floor(m / 60);
      const rem = m % 60;
      return rem > 0 ? `${hrs}h ${rem}m` : `${hrs} Hour${hrs > 1 ? "s" : ""}`;
    }
    return `${m} Minutes`;
  };

  // Schedule Window check
  const cohortFallbackSchedule = activeApplication?.assigned_cohort?.default_screening_at
    ? {
        scheduled_at: activeApplication.assigned_cohort.default_screening_at,
        end_time: activeApplication.assigned_cohort.screening_end_time,
        meeting_link: null,
      }
    : null;
  const effectiveSchedule =
    latestSchedule ||
    (activeApplication?.pre_screening && typeof activeApplication.pre_screening === "object"
      ? activeApplication.pre_screening
      : null) ||
    cohortFallbackSchedule;
  const scheduledTime = effectiveSchedule?.scheduled_at
    ? new Date(effectiveSchedule.scheduled_at).getTime()
    : activeApplication?.scheduled_at
    ? new Date(activeApplication.scheduled_at).getTime()
    : null;
  // Keep the meeting locked until the scheduled start time, even if an admin opens the exam early.
  const isFutureSchedule = scheduledTime && currentTime < scheduledTime;

  // Helper to format meeting URL safely
  const getMeetingUrl = (url) => {
    if (!url) return "#";
    const trimmed = String(url).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  // Format dynamic countdown: XXd YYh ZZm or XXh YYm ZZs or MMm SSs
  const formatCountdown = (targetTime, currTime) => {
    const diff = Math.max(0, targetTime - currTime);
    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hrs = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (days > 0) {
      return `${days}d ${hrs}h ${pad(mins)}m`;
    }
    if (hrs > 0) {
      return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
    }
    return `${pad(mins)}m ${pad(secs)}s`;
  };

  // No exam scheduled state: candidate has a course track but no schedule/exam yet
  const noExamScheduled = !isCompleted && !isQualifiedCandidate && !isFailedCandidate && !isEnrolled && !isDisqualified && !effectiveSchedule && !latestExam && activeCourseTrack;

  // No active application state
  const noActiveApplication = !isCompleted && !isQualifiedCandidate && !isFailedCandidate && !isEnrolled && !activeApplication;

  // Google Meet link ONLY from active screening schedule while the session is live
  const isExamSessionOver = Boolean(
    isCompleted ||
    isQualifiedCandidate ||
    isFailedCandidate ||
    isEnrolled ||
    isDisqualified ||
    (effectiveSchedule?.end_time && currentTime > new Date(effectiveSchedule.end_time).getTime())
  );
  const meetingLink = !isExamSessionOver
    ? (effectiveSchedule?.meeting_link || activeApplication?.pre_screening?.meeting_link || null)
    : null;

  // 2. Start Exam Handler
  const handleStartExam = async () => {
    if (!activeCourseTrack) {
      setError("No active course track registered for this candidate.");
      return;
    }

    if (isCompleted && !isNewScheduleActive) {
      navigate("/student/exam-result");
      return;
    }

    // Clean up any preview media stream before launch
    if (mediaStream) {
      stopMediaStream();
    }

    setLoading(true);
    setError(null);

    // Stop preview stream before launching exam session so Exam.jsx can claim it
    stopMediaStream();

    // Request fullscreen mode for proctored environment
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen request notification:", e);
    }

    try {
      const targetExamId = latestExam?.id;
      if (!targetExamId) {
        throw new Error(
          "No Django exam record has been scheduled for this application. Ask an administrator to create the exam and publish its question bank."
        );
      }

      // Start internal exam session
      const startResult = await startInternalExam(targetExamId, {
        application_id: activeApplication?.id,
        course_id: activeCourseTrack?.id,
        schedule_id: latestSchedule?.id,
        difficulty: examConfig?.difficulty || "MEDIUM",
        total_questions: examConfig?.total_questions || 10,
        duration_minutes: examConfig?.duration_minutes || 45,
      });

      if (!startResult?.success) {
        throw new Error(startResult?.error || "Failed to start internal exam session from backend.");
      }

      const candidateName =
        user?.first_name && user?.last_name
          ? `${user.first_name} ${user.last_name}`
          : user?.name || user?.email?.split("@")[0] || "Candidate";

      const candidateId =
        user?.student_id ||
        user?.id?.substring(0, 8)?.toUpperCase() ||
        "STU-" + (user?.email?.split("@")[0] || "EXAM");

      const examSession = {
        id: startResult.exam_id || targetExamId,
        exam_id: startResult.exam_id || targetExamId,
        assessment_type: "PRESCREENING",
        attempt_id: startResult.attempt_id,
        application_id: activeApplication?.id,
        schedule_id: latestSchedule?.id,
        course_id: activeCourseTrack.id,
        course_name: activeCourseTrack.name,
        domain: activeCourseTrack.name,
        student_name: candidateName,
        student_id: candidateId,
        student_email: user?.email || "",
        total_questions: startResult.questions?.length || examConfig.total_questions,
        duration_minutes: Number(startResult.duration_minutes) || examConfig.duration_minutes,
        pass_percentage: examConfig.pass_percentage,
        difficulty: examConfig.difficulty,
        start_time: startResult.start_time,
        expires_at: startResult.expires_at,
        paper_code: startResult.paper_code || "A",
        paper_label: startResult.paper_label || "Paper A",
        proctoring: startResult.proctoring,
        questions: startResult.questions,
        saved_answers: startResult.saved_answers || {},
      };

      // Store in sessionStorage for resilient reload recovery
      try {
        sessionStorage.setItem("sure_active_exam_session", JSON.stringify(examSession));
      } catch (storageErr) {
        console.warn("SessionStorage write warning:", storageErr);
      }

      navigate("/student/exam", {
        state: {
          examSession,
          selectedCourse: activeCourseTrack.id,
          courseName: activeCourseTrack.name,
          applicationId: activeApplication?.id,
          scheduleId: latestSchedule?.id,
          examConfig,
        },
      });
    } catch (err) {
      console.error("[ExamInstructions] Start error:", err);
      setError(err?.message || "Failed to initialize examination session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (fetchingData) {
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ textAlign: "center", padding: "60px 20px" }}>
          <div className={styles.spinner} />
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: "16px 0 6px 0" }}>
            Loading Standardized Examination Portal...
          </h2>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>
            Verifying candidate credentials and authoritative assessment configuration
          </p>
        </div>
      </div>
    );
  }



  // Canonical status determination
  const examStatusDisplay = isEnrolled
    ? String(activeApplication?.status || "ACTIVE COHORT").replace(/_/g, " ")
    : isCompleted
      ? isQualifiedCandidate
        ? "QUALIFIED / PASSED"
        : "COMPLETED"
      : latestSchedule?.status || (latestExam ? latestExam.status : "NO SCHEDULE");

  const candidateFullName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.name || user?.email?.split("@")[0] || "Registered Candidate";

  const candidateIdDisplay =
    user?.student_id ||
    activeApplication?.student?.student_code ||
    user?.id?.substring(0, 8)?.toUpperCase() ||
    "STU-ONLINE";

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          {/* Institutional Masthead Header */}
          <div className={styles.headerWrap}>
            <div className={styles.brandLogo}>
              <SureProEdLogo size={58} showText={true} />
            </div>
            <div className={styles.portalBadge}>
              <FiShield className={styles.portalBadgeIcon} />
              <span>OFFICIAL PROCTORED ASSESSMENT PORTAL</span>
            </div>
            <h1 className={styles.title}>Candidate Screening Examination</h1>
            <p className={styles.subtitle}>
              Standardized competency evaluation and academic screening for internship cohort admission.
            </p>
          </div>

          {/* Candidate Verification Card */}
          <div className={styles.candidateAuthCard}>
            <div className={styles.candidateAuthHeader}>
              <span className={styles.authLabel}>CANDIDATE VERIFICATION</span>
              <span className={styles.authStatusPill}>
                <FiCheck className={styles.pillIcon} /> VERIFIED IDENTITY
              </span>
            </div>
            <div className={styles.candidateAuthGrid}>
              <div className={styles.authField}>
                <span className={styles.authFieldLabel}>Candidate Name</span>
                <span className={styles.authFieldValue}>{candidateFullName}</span>
              </div>
              <div className={styles.authField}>
                <span className={styles.authFieldLabel}>Candidate ID</span>
                <span className={styles.authFieldValue}>{candidateIdDisplay}</span>
              </div>
              <div className={styles.authField}>
                <span className={styles.authFieldLabel}>Assessment Track</span>
                <span className={styles.authFieldValueHighlight}>
                  {activeCourseTrack?.name || activeApplication?.course_name || activeApplication?.course_details?.name || statistics?.application_course_title || statistics?.assessment_track || statistics?.active_cohort?.course_title || "General Assessment Track"}
                </span>
              </div>
              <div className={styles.authField}>
                <span className={styles.authFieldLabel}>Authorization Status</span>
                <span className={styles.authFieldValue}>{examStatusDisplay}</span>
              </div>
            </div>
          </div>

          {/* Profile Incomplete Banner */}
          {!profileComplete && !isEnrolled && (
            <div className={`${styles.alertBanner} ${styles.dangerBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiAlertCircle className={styles.alertIcon} />
                <strong>Profile Registration Incomplete</strong>
              </div>
              <p className={styles.alertText}>
                Please complete your verified personal and academic details in your student profile before starting this proctored examination.
              </p>
              <div>
                <Link to="/student/profile" className={styles.btnBannerAction}>
                  Complete Profile Details <FiArrowRight />
                </Link>
              </div>
            </div>
          )}

          {isEnrolled && (
            <div className={`${styles.alertBanner} ${styles.successBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiLayers className={styles.alertIconSuccess} />
                <strong>Active Cohort Journey Detected</strong>
              </div>
              <p className={styles.alertText}>
                You are already enrolled in <strong>{activeCourseTrack?.name || activeApplication?.course_name || activeApplication?.course_details?.name || statistics?.application_course_title || statistics?.assessment_track || statistics?.active_cohort?.course_title || "your assigned cohort"}</strong>. An older screening or
                rescheduling record cannot start an examination for another cohort.
              </p>
              <div className={styles.bannerBtnGroup}>
                <button
                  type="button"
                  className={styles.btnPrimaryBanner}
                  onClick={() => navigate("/student/cohort")}
                >
                  Open Active Cohort <FiArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* Qualified Banner */}
          {isQualifiedCandidate && !isEnrolled && (
            <div className={`${styles.alertBanner} ${styles.successBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiAward className={styles.alertIconSuccess} />
                <strong>Examination Successfully Completed & Qualified</strong>
              </div>
              <p className={styles.alertText}>
                You have met the qualifying criteria for <strong>{activeCourseTrack?.name || activeApplication?.course_name || activeApplication?.course_details?.name || statistics?.application_course_title || statistics?.assessment_track || statistics?.active_cohort?.course_title || "your assigned cohort"}</strong>. Your result and admission qualification have been recorded in the central registry.
              </p>
              <div className={styles.bannerBtnGroup}>
                <button
                  type="button"
                  className={styles.btnSecondaryBanner}
                  onClick={() => navigate("/student/exam-result")}
                >
                  <FiFileText /> View Official Scorecard
                </button>
                <button
                  type="button"
                  className={styles.btnPrimaryBanner}
                  onClick={() => navigate("/student/cohort")}
                >
                  Proceed to Cohort <FiArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* Completed Banner */}
          {!isQualifiedCandidate && isCompleted && !isDisqualified && (
            <div className={`${styles.alertBanner} ${styles.noticeBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiFileText className={styles.alertIconNotice} />
                <strong>Examination Submission Recorded</strong>
              </div>
              <p className={styles.alertText}>
                Your examination response for <strong>{activeCourseTrack?.name || activeApplication?.course_name || activeApplication?.course_details?.name || statistics?.application_course_title || statistics?.assessment_track || statistics?.active_cohort?.course_title || "your assigned cohort"}</strong> has been evaluated.
              </p>
              <div>
                <button
                  type="button"
                  className={styles.btnPrimaryBanner}
                  onClick={() => navigate("/student/exam-result")}
                >
                  <FiFileText /> View Verified Scorecard
                </button>
              </div>
            </div>
          )}

          {/* Future Schedule Banner */}
          {/* No Active Application Banner */}
          {noActiveApplication && (
            <div className={`${styles.alertBanner} ${styles.warningBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiAlertCircle className={styles.alertIconWarning} />
                <strong>No Active Application Found</strong>
              </div>
              <p className={styles.alertText}>
                You currently do not have an active course application. Please browse available internship courses and apply first to participate in screening examinations.
              </p>
              <div>
                <Link to="/student/courses" className={styles.btnBannerAction}>
                  Browse Available Courses <FiArrowRight />
                </Link>
              </div>
            </div>
          )}

          {/* Future Schedule Banner with Live Countdown */}
          {isFutureSchedule && !isCompleted && (
            <div className={`${styles.alertBanner} ${styles.warningBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiClock className={styles.alertIconWarning} />
                <strong>Assessment Scheduled — Starts in {formatCountdown(scheduledTime, currentTime)}</strong>
              </div>
              <p className={styles.alertText}>
                Meeting Start Time: <strong>{formatDateTime(scheduledTime)}</strong>. Please join the meeting on time. The Start Examination button will become available once the administrator begins the examination.
              </p>
            </div>
          )}

          {/* Failed / Not Qualified Banner */}
          {isFailedCandidate && !isNewScheduleActive && !isDisqualified && !isQualifiedCandidate && (
            <div className={`${styles.alertBanner} ${styles.dangerBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiAlertTriangle className={styles.alertIcon} />
                <strong>Examination Result: Not Qualified</strong>
              </div>
              <p className={styles.alertText}>
                Your screening examination score did not meet the qualifying threshold for <strong>{activeCourseTrack?.name || activeApplication?.course_name || "your applied track"}</strong>. Please contact the assessment board if you believe this is an error, or wait for a reschedule notification.
              </p>
              <div>
                <button
                  type="button"
                  className={styles.btnBannerAction}
                  onClick={() => navigate("/student/exam-result")}
                >
                  <FiFileText /> View Examination Scorecard
                </button>
              </div>
            </div>
          )}

          {/* No Exam Scheduled Yet Banner */}
          {noExamScheduled && (
            <div className={`${styles.alertBanner} ${styles.noticeBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiCalendar className={styles.alertIconNotice} />
                <strong>Examination Not Scheduled Yet</strong>
              </div>
              <p className={styles.alertText}>
                Your application for <strong>{activeCourseTrack?.name || "your applied track"}</strong> has been received. The screening examination has not been scheduled yet by the assessment board. You will receive a notification when the exam window opens.
              </p>
            </div>
          )}

          {/* Disqualified Banner */}
          {isDisqualified && (
            <div className={`${styles.alertBanner} ${styles.dangerBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiAlertTriangle className={styles.alertIcon} />
                <strong>Disqualified Due to Proctoring Integrity Violations</strong>
              </div>
              <p className={styles.alertText}>
                Your session exceeded the allowable limit of proctoring infractions (tab switching / window unfocus). Re-attempts have been locked by the examination board.
              </p>
              <div>
                <button
                  type="button"
                  className={styles.btnBannerAction}
                  onClick={() => navigate("/student/exam-result")}
                >
                  View Security Audit Log
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className={`${styles.alertBanner} ${styles.dangerBanner}`}>
              <div className={styles.alertBannerHeader}>
                <FiAlertCircle className={styles.alertIcon} />
                <strong>System Notice</strong>
              </div>
              <p className={styles.alertText}>{error}</p>
            </div>
          )}

          {/* 1. ASSESSMENT SPECIFICATIONS MATRIX */}
          <div className={styles.sectionTitleRow}>
            <FiLayers className={styles.sectionIcon} />
            <h2 className={styles.sectionTitle}>Assessment Specifications</h2>
          </div>

          <div className={styles.paramsGrid}>
            <div className={styles.paramCard}>
              <span className={styles.paramLabel}>Assessment Format</span>
              <span className={styles.paramValueSmall}>Multiple Choice (MCQ)</span>
              <span className={styles.paramSubtext}>Single Answer Selection</span>
            </div>

            <div className={styles.paramCard}>
              <span className={styles.paramLabel}>Question Volume</span>
              <span className={styles.paramValue}>
                {examConfig && !noExamScheduled ? `${examConfig.total_questions || examConfig.number_of_questions} Questions` : "TBD"}
              </span>
              <span className={styles.paramSubtext}>Domain Prerequisite Items</span>
            </div>

            <div className={styles.paramCard}>
              <span className={styles.paramLabel}>Allotted Duration</span>
              <span className={styles.paramValue}>
                {examConfig && !noExamScheduled ? formatMinutes(examConfig.duration_minutes) : "TBD"}
              </span>
              <span className={styles.paramSubtext}>Synchronized Server Clock</span>
            </div>

            <div className={styles.paramCard}>
              <span className={styles.paramLabel}>Qualifying Threshold</span>
              <span className={styles.paramValue}>
                {examConfig && !noExamScheduled ? `${examConfig.pass_percentage}%` : "TBD"}
              </span>
              <span className={styles.paramSubtext}>Minimum Required Score</span>
            </div>

            <div className={styles.paramCard}>
              <span className={styles.paramLabel}>Scoring Scheme</span>
              <span className={styles.paramValueSmall}>+1.0 / 0.0</span>
              <span className={styles.paramSubtext}>No Negative Marking</span>
            </div>
          </div>

          {/* 2. PROCTORING SESSION & MEETING CARD */}
          {latestSchedule && (
            <div
              className={`${styles.scheduleCard} ${
                isNewScheduleActive ? styles.scheduleCardActive : ""
              }`}
            >
              <div className={styles.scheduleHeader}>
                <div className={styles.scheduleTitle}>
                  <FiCalendar className={styles.scheduleIcon} />
                  <span>Proctoring Session & Meeting Information</span>
                </div>
                <span
                  className={`${styles.statusBadge} ${
                    isCompleted
                      ? styles.statusCompleted
                      : isNewScheduleActive
                      ? styles.statusActive
                      : styles.statusScheduled
                  }`}
                >
                  {isCompleted ? "COMPLETED" : latestSchedule.status || "SCHEDULED"}
                </span>
              </div>

              <div className={styles.scheduleDetailsGrid}>
                <div>
                  <span className={styles.schedMetaLabel}>Meeting Date:</span>
                  <strong>
                    {latestSchedule.scheduled_at
                      ? new Date(latestSchedule.scheduled_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                      : "Available On-Demand"}
                  </strong>
                </div>
                <div>
                  <span className={styles.schedMetaLabel}>Meeting Time:</span>
                  <strong>
                    {latestSchedule.scheduled_at
                      ? new Date(latestSchedule.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ""}
                  </strong>
                </div>
                <div>
                  <span className={styles.schedMetaLabel}>Appointed Proctor:</span>
                  <strong>{latestSchedule.interviewer || "SURE Trust Assessment Board"}</strong>
                </div>
                {latestSchedule.end_time && (
                  <div>
                    <span className={styles.schedMetaLabel}>Window Closure:</span>
                    <strong>{formatDateTime(latestSchedule.end_time)}</strong>
                  </div>
                )}
                <div>
                  <span className={styles.schedMetaLabel}>Live Proctoring:</span>
                  <strong>{examConfig?.proctoring_enabled === false ? "Not required" : "Embedded Jitsi room"}</strong>
                </div>
              </div>

              {examConfig?.proctoring_enabled !== false && !isCompleted && (
                <div className={styles.meetInstructionBox}>
                  <strong>Proctored Verification Protocol:</strong>
                  <span>
                    Your assigned Jitsi room opens inside the exam page after you click Start Examination.
                    Keep camera and microphone enabled; join, leave, and connection failures are recorded for proctor review.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 3. SYSTEM & DEVICE COMPATIBILITY CHECK - Removed per request */}

          {/* 4. CANDIDATE INSTRUCTIONS & EXAMINATION GUIDELINES */}
          <div className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <FiShield className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Candidate Instructions & Examination Guidelines</h2>
            </div>

            <div className={styles.rulesList}>
              <div className={styles.ruleItem}>
                <div className={styles.ruleIconWrap}>
                  <FiMonitor />
                </div>
                <div className={styles.ruleContent}>
                  <strong>1. Full-Screen Assessment Environment</strong>
                  <p>The examination must be taken in dedicated full-screen mode. Exiting or minimizing the examination window is recorded and monitored by the system.</p>
                </div>
              </div>

              <div className={styles.ruleItem}>
                <div className={styles.ruleIconWrap}>
                  <FiEye />
                </div>
                <div className={styles.ruleContent}>
                  <strong>2. Window Focus & Navigation Policy</strong>
                  <p>Navigating away from the assessment window, opening new tabs, or switching applications is strictly prohibited. Repeated navigation events will result in automated test closure.</p>
                </div>
              </div>

              <div className={styles.ruleItem}>
                <div className={styles.ruleIconWrap}>
                  <FiShield />
                </div>
                <div className={styles.ruleContent}>
                  <strong>3. Session Security & Candidate Identification</strong>
                  <p>Your verified candidate ID and active session token are displayed on screen throughout the assessment to verify identity and maintain testing integrity.</p>
                </div>
              </div>

              <div className={styles.ruleItem}>
                <div className={styles.ruleIconWrap}>
                  <FiLock />
                </div>
                <div className={styles.ruleContent}>
                  <strong>4. Prohibition of External Tools & Copying</strong>
                  <p>Right-click context menus, text copying, pasting, and keyboard shortcuts for developer tools are strictly disabled during the assessment.</p>
                </div>
              </div>

              <div className={styles.ruleItem}>
                <div className={styles.ruleIconWrap}>
                  <FiRefreshCw />
                </div>
                <div className={styles.ruleContent}>
                  <strong>5. Automated Response Saving & Time Management</strong>
                  <p>Your selected answers are saved automatically as you progress. The assessment will submit automatically upon expiration of the allotted time.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 5. ACTION AREA */}
          <div className={styles.actions}>
            {isEnrolled ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate("/student/cohort")}
              >
                Open Active Cohort <FiArrowRight />
              </button>
            ) : isQualifiedCandidate ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => navigate("/student/exam-result")}
                >
                  <FiFileText /> View Official Scorecard
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => navigate("/student/cohort")}
                >
                  Proceed to Cohort <FiArrowRight />
                </button>
              </>
            ) : isFailedCandidate && !isNewScheduleActive ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => navigate("/student/exam-result")}
              >
                <FiFileText /> View Examination Scorecard
              </button>
            ) : isCompleted ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate("/student/exam-result")}
              >
                <FiFileText /> View Examination Results
              </button>
            ) : isDisqualified ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => navigate("/student/exam-result")}
              >
                <FiFileText /> View Security Audit Log
              </button>
            ) : !profileComplete ? (
              <Link to="/student/profile" className={styles.secondaryButton}>
                Complete Profile Before Starting
              </Link>
            ) : (noActiveApplication || !activeCourseTrack || noExamScheduled) ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={true}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-color)",
                  cursor: "not-allowed",
                }}
              >
                <FiCalendar /> Exam Not Scheduled Yet
              </button>
            ) : isFutureSchedule ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={true}
                  style={{
                    cursor: "not-allowed",
                    opacity: 0.6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiCamera /> Join Meeting available at {formatDateTime(scheduledTime)} ({formatCountdown(scheduledTime, currentTime)})
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={true}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border-color)",
                    cursor: "not-allowed",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiClock /> Start Exam available at {formatDateTime(scheduledTime)}
                </button>
              </>
            ) : !effectiveSchedule?.admin_started_at ? (
              <>
                {meetingLink ? (
                  <a
                    href={getMeetingUrl(meetingLink)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.secondaryButton}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      textDecoration: "none",
                      backgroundColor: "#0b57d0",
                      color: "#ffffff",
                      fontWeight: 600,
                    }}
                  >
                    <FiCamera /> Join Google Meet
                  </a>
                ) : (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={true}
                    style={{
                      cursor: "not-allowed",
                      opacity: 0.6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FiCamera /> Join Google Meet (Link Pending Admin)
                  </button>
                )}
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={true}
                  style={{
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    color: "#d97706",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    cursor: "not-allowed",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FiClock /> Waiting for Admin to Start...
                </button>
              </>
            ) : !effectiveSchedule?.is_released ? (
              <>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={true}
                  style={{
                    backgroundColor: "rgba(220, 38, 38, 0.1)",
                    color: "#dc2626",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    cursor: "not-allowed",
                    fontWeight: 600,
                  }}
                >
                  <FiAlertTriangle /> Exam Session Ended
                </button>
              </>
            ) : (
              <>
                {meetingLink ? (
                  <a
                    href={getMeetingUrl(meetingLink)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.secondaryButton}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
                  >
                    <FiCamera /> Join Google Meet
                  </a>
                ) : (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={true}
                    style={{ cursor: "not-allowed", opacity: 0.6 }}
                  >
                    <FiCamera /> Join Google Meet
                  </button>
                )}
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleStartExam}
                  disabled={loading || fetchingData}
                >
                  {loading ? (
                    <>
                      <span className={styles.btnSpinner} /> Initializing Session...
                    </>
                  ) : (
                    <>
                      Start Examination <FiArrowRight />
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExamInstructions;
