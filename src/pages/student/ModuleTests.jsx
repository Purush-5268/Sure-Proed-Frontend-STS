import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { startModuleTest } from "../../services/examService";
import styles from "./ModuleTests.module.css";

const unpack = (response) =>
  Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.results) ? response.data.results : [];

function ModuleTests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

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

  const begin = async (test) => {
    setBusy(test.id);
    setError("");
    const result = await startModuleTest(test.id);
    if (!result.success) {
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

  const submissionFor = (testId) => submissions.find((submission) => (submission.test?.id || submission.test) === testId);

  const now = new Date();

  return (
    <div className={styles.page}>
      <header>
        <h1>Module Tests</h1>
        <p>Proctored module assessments with randomized question banks & automatic evaluation.</p>
      </header>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.grid}>
        {tests.map((test) => {
          const submission = submissionFor(test.id);
          
          const isReleased = test.is_released !== false;
          const scheduledAt = test.scheduled_at ? new Date(test.scheduled_at) : null;
          const endTime = test.end_time ? new Date(test.end_time) : null;
          const isFuture = Boolean(scheduledAt && scheduledAt > now);
          const isExpired = Boolean(endTime && endTime < now);
          const isLocked = Boolean(!isReleased || isFuture || isExpired);

          let lockReason = "";
          if (!isReleased) lockReason = "Gate Locked by Admin";
          else if (isFuture) lockReason = `Opens at ${scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
          else if (isExpired) lockReason = "Window Closed";

          return (
            <article key={test.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span className={styles.module}>{test.module_name || "Course assessment"}</span>
                {isLocked && !submission && (
                  <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "12px", background: "#fee2e2", color: "#991b1b" }}>
                    🔒 {lockReason}
                  </span>
                )}
              </div>
              <h2>{test.title}</h2>
              <p>{test.description || "Questions are generated from the configured module syllabus."}</p>
              <dl><div><dt>Questions</dt><dd>{test.total_questions}</dd></div><div><dt>Duration</dt><dd>{test.duration_minutes} min</dd></div><div><dt>Pass</dt><dd>{test.pass_percentage}%</dd></div></dl>
              {submission?.status === "SUBMITTED" ? (
                <div className={submission.qualified ? styles.pass : styles.fail}>Submitted · {submission.percentage}% · {submission.qualified ? "Passed" : "Not passed"}</div>
              ) : (
                <button
                  onClick={() => begin(test)}
                  disabled={busy === test.id || isLocked}
                  style={{ opacity: isLocked ? 0.6 : 1, cursor: isLocked ? "not-allowed" : "pointer" }}
                >
                  {busy === test.id
                    ? "Assigning paper…"
                    : isLocked
                    ? `Locked (${lockReason})`
                    : submission?.status === "IN_PROGRESS"
                    ? "Resume test"
                    : "Start test"}
                </button>
              )}
            </article>
          );
        })}
        {!tests.length && <p>No active module tests are assigned to your cohort.</p>}
      </div>
    </div>
  );
}

export default ModuleTests;
