import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { startModuleTest, getModuleTest } from "../../services/examService";
import styles from "./ModuleTests.module.css";
import {
  FiClock,
  FiCalendar,
  FiVideo,
  FiPlay,
  FiLoader,
  FiLock,
  FiCheckCircle,
  FiAlertCircle,
  FiExternalLink,
} from "react-icons/fi";

const unpack = (response) =>
  Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.results) ? response.data.results : [];

/* ── Derive the visual state of a test from backend fields ── */
const deriveTestState = (test, submission, now) => {
  if (submission?.status === "SUBMITTED") return "SUBMITTED";
  if (submission?.status === "IN_PROGRESS") return "IN_PROGRESS";
  if (submission?.status === "MISSED") return "MISSED";

  const scheduledAt = test.scheduled_at ? new Date(test.scheduled_at) : null;
  const endTime = test.end_time ? new Date(test.end_time) : null;
  const isReleased = test.is_released !== false;

  if (!isReleased) return "NOT_RELEASED";
  if (endTime && now > endTime) return "WINDOW_CLOSED";
  if (scheduledAt && now < scheduledAt) {
    // T-10 check: if within 10 minutes of start AND meeting_link is available
    const tMinus10 = new Date(scheduledAt.getTime() - 10 * 60 * 1000);
    if (now >= tMinus10 && test.meeting_link) return "MEET_AVAILABLE";
    return "SCHEDULED";
  }
  // We are within the window (now >= scheduledAt)
  if (!test.admin_started_at) {
    return "WAITING_FOR_ADMIN";
  }
  // Admin has started
  return "READY_TO_START";
};

/* ── Countdown helper ── */
const formatCountdown = (ms) => {
  if (ms <= 0) return "Now";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

function ModuleTests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const tickTimerRef = useRef(null);

  // Use refs for polling to avoid resetting the interval
  const latestTests = useRef(tests);
  const latestSubmissions = useRef(submissions);

  useEffect(() => {
    latestTests.current = tests;
    latestSubmissions.current = submissions;
  }, [tests, submissions]);

  /* ── Initial fetch ── */
  useEffect(() => {
    Promise.all([
      apiClient.get(API_ENDPOINTS.MODULE_TESTS.BASE),
      apiClient.get(API_ENDPOINTS.MODULE_TESTS.SUBMISSIONS),
    ])
      .then(([testsResponse, submissionsResponse]) => {
        setTests(unpack(testsResponse));
        setSubmissions(unpack(submissionsResponse));
      })
      .catch(() => setError("Unable to load your available module tests."));
  }, []);

  /* ── 1-second tick for countdown timers ── */
  useEffect(() => {
    tickTimerRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tickTimerRef.current);
  }, []);

  /* ── Smart polling: refresh test data when near schedule or waiting for admin ── */
  useEffect(() => {
    const timer = setInterval(() => {
      const currentTime = new Date();
      const needsPoll = latestTests.current.some((t) => {
        const sub = latestSubmissions.current.find((s) => (s.test?.id || s.test) === t.id);
        const state = deriveTestState(t, sub, currentTime);
        return ["SCHEDULED", "MEET_AVAILABLE", "WAITING_FOR_ADMIN"].includes(state);
      });

      if (needsPoll) {
        apiClient.get(API_ENDPOINTS.MODULE_TESTS.BASE)
          .then((res) => setTests(unpack(res)))
          .catch(() => { /* silent */ });
      }
    }, 15000); // every 15 seconds
    
    return () => clearInterval(timer);
  }, []);

  /* ── Start test handler ── */
  const begin = async (test) => {
    setBusy(test.id);
    setError("");
    const result = await startModuleTest(test.id);
    if (!result.success) {
      // Handle ADMIN_NOT_STARTED gracefully
      if (result.code === "ADMIN_NOT_STARTED" || result.status === 403) {
        // Refetch the test to get latest state
        try {
          const freshTest = await getModuleTest(test.id);
          setTests((prev) => prev.map((t) => (t.id === test.id ? freshTest : t)));
        } catch { /* ignore */ }
        setError(result.error || "Please wait. The administrator has not started the test yet.");
        setBusy("");
        return;
      }
      setError(result.error);
      setBusy("");
      return;
    }
    const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Candidate";
    const session = {
      ...result,
      id: test.id,
      assessment_type: "MODULE_TEST",
      module_test_id: test.id,
      student_name: displayName,
      student_id: user?.student_id || String(user?.id || "STUDENT").slice(0, 8).toUpperCase(),
      course_name: result.course_name || test.course_name || "Module Test",
      questions: result.questions,
    };
    sessionStorage.setItem("sure_active_exam_session", JSON.stringify(session));
    navigate("/student/exam", { state: { examSession: session } });
  };

  const submissionFor = (testId) => submissions.find((s) => (s.test?.id || s.test) === testId);

  return (
    <div className={styles.page}>
      <header>
        <h1>Module Tests</h1>
        <p>Proctored module assessments with randomized question banks &amp; automatic evaluation.</p>
      </header>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.grid}>
        {[...tests]
          .sort((a, b) => {
            // Extract the number from "Module X: Title" to ensure natural numeric sorting
            const numA = parseInt((a.title || "").match(/\d+/)?.[0] || "0", 10);
            const numB = parseInt((b.title || "").match(/\d+/)?.[0] || "0", 10);
            if (numA !== numB) return numA - numB;
            return (a.title || "").localeCompare(b.title || "");
          })
          .map((test) => {
          const submission = submissionFor(test.id);
          const state = deriveTestState(test, submission, now);
          const scheduledAt = test.scheduled_at ? new Date(test.scheduled_at) : null;
          const endTime = test.end_time ? new Date(test.end_time) : null;
          const msUntilStart = scheduledAt ? scheduledAt.getTime() - now.getTime() : 0;
          const tMinus10 = scheduledAt ? new Date(scheduledAt.getTime() - 10 * 60 * 1000) : null;
          const msUntilMeet = tMinus10 ? tMinus10.getTime() - now.getTime() : 0;

          return (
            <article key={test.id} className={styles.testCard}>
              {/* ── Header row: module name + state badge ── */}
              <div className={styles.cardHeader}>
                <span className={styles.module}>{test.module_name || "Course assessment"}</span>
                <TestStateBadge state={state} />
              </div>

              <h2>{test.title}</h2>
              <p className={styles.description}>{test.description || "Questions are generated from the configured module syllabus."}</p>

              {/* ── Stats row ── */}
              <dl>
                <div><dt>Questions</dt><dd>{test.total_questions}</dd></div>
                <div><dt>Duration</dt><dd>{test.duration_minutes} min</dd></div>
                <div><dt>Pass</dt><dd>{test.pass_percentage}%</dd></div>
              </dl>

              {/* ── Schedule info ── */}
              {scheduledAt && (
                <div className={styles.scheduleInfo}>
                  <FiCalendar />
                  <span>
                    {scheduledAt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {endTime && (
                      <> — {endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
                    )}
                  </span>
                </div>
              )}

              {/* ── State-driven UI ── */}
              <div className={styles.cardFooter}>
                {state === "SUBMITTED" && (
                <div className={submission.qualified ? styles.pass : styles.fail}>
                  Submitted · {submission.percentage}% · {submission.qualified ? "Passed" : "Not passed"}
                </div>
              )}

              {state === "NOT_RELEASED" && (
                <div className={styles.lockedBanner}>
                  <FiLock /> Gate Locked by Admin
                </div>
              )}

              {state === "WINDOW_CLOSED" && (
                <div className={styles.lockedBanner}>
                  <FiClock /> Window Closed
                </div>
              )}

              {state === "SCHEDULED" && (
                <div className={styles.waitingSection}>
                  <div className={styles.countdownBlock}>
                    <FiClock className={styles.countdownIcon} />
                    <div>
                      <div className={styles.countdownLabel}>
                        {msUntilMeet > 0
                          ? "Meet link appears in"
                          : "Exam starts in"}
                      </div>
                      <div className={styles.countdownValue}>
                        {formatCountdown(msUntilMeet > 0 ? msUntilMeet : msUntilStart)}
                      </div>
                    </div>
                  </div>
                  <p className={styles.hintText}>
                    Google Meet link will appear 10 minutes before the exam.
                  </p>
                </div>
              )}

              {state === "MEET_AVAILABLE" && (
                <div className={styles.waitingSection}>
                  <p className={styles.hintText}>
                    <FiAlertCircle /> Join the Google Meet before starting the test.
                  </p>
                  {test.meeting_link && (
                    <a
                      href={test.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.meetButton}
                    >
                      <FiVideo /> Join Google Meet <FiExternalLink />
                    </a>
                  )}
                  {msUntilStart > 0 && (
                    <div className={styles.countdownBlock}>
                      <FiClock className={styles.countdownIcon} />
                      <div>
                        <div className={styles.countdownLabel}>Exam opens in</div>
                        <div className={styles.countdownValue}>{formatCountdown(msUntilStart)}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {state === "WAITING_FOR_ADMIN" && (
                <div className={styles.waitingSection}>
                  {test.meeting_link && (
                    <a
                      href={test.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.meetButton}
                    >
                      <FiVideo /> Join Google Meet <FiExternalLink />
                    </a>
                  )}
                  <div className={styles.waitingSteps}>
                    <div className={styles.stepDone}><FiCheckCircle /> Exam scheduled</div>
                    <div className={styles.stepDone}><FiCheckCircle /> Meet available</div>
                    <div className={styles.stepPending}><FiLoader className={styles.spinner} /> Waiting for Admin to start test…</div>
                  </div>
                </div>
              )}

              {(state === "READY_TO_START" || state === "IN_PROGRESS") && (
                <div className={styles.readySection}>
                  {test.meeting_link && (
                    <a
                      href={test.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.meetButtonSmall}
                    >
                      <FiVideo /> Google Meet <FiExternalLink />
                    </a>
                  )}
                  <button
                    onClick={() => begin(test)}
                    disabled={busy === test.id}
                    className={styles.startButton}
                  >
                    {busy === test.id ? (
                      <><FiLoader className={styles.spinner} /> Assigning paper…</>
                    ) : state === "IN_PROGRESS" ? (
                      <><FiPlay /> Resume test</>
                    ) : (
                      <><FiPlay /> Start Exam</>
                    )}
                  </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {!tests.length && <p>No active module tests are assigned to your cohort.</p>}
      </div>
    </div>
  );
}

/* ── State Badge Component ── */
function TestStateBadge({ state }) {
  const badges = {
    NOT_RELEASED: { label: "🔒 Locked", className: "badgeLocked" },
    WINDOW_CLOSED: { label: "⏱ Closed", className: "badgeClosed" },
    SCHEDULED: { label: "📅 Scheduled", className: "badgeScheduled" },
    MEET_AVAILABLE: { label: "📹 Meet Ready", className: "badgeMeet" },
    WAITING_FOR_ADMIN: { label: "⏳ Waiting", className: "badgeWaiting" },
    READY_TO_START: { label: "✅ Ready", className: "badgeReady" },
    IN_PROGRESS: { label: "📝 In Progress", className: "badgeInProgress" },
    SUBMITTED: { label: "✓ Submitted", className: "badgeSubmitted" },
    MISSED: { label: "❌ Missed Test", className: "badgeMissed" },
  };
  const badge = badges[state];
  if (!badge) return null;
  return <span className={`${styles.badge} ${styles[badge.className] || ""}`}>{badge.label}</span>;
}

export default ModuleTests;
