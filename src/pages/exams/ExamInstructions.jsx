import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./ExamInstructions.module.css";

function ExamInstructions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [error, setError] = useState(null);

  const [profileComplete, setProfileComplete] = useState(true);
  const [activeCourseTrack, setActiveCourseTrack] = useState(null); // { id, name }
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [isQualifiedCandidate, setIsQualifiedCandidate] = useState(false);
  const [examConfig, setExamConfig] = useState({ number_of_questions: 30, duration_minutes: 30, pass_percentage: 40.00 });

  useEffect(() => {
    let isMounted = true;

    const loadExamContext = async () => {
      try {
        setFetchingData(true);

        // 1. Fetch Profile & Check Completion
        if (user?.email) {
          const profile = await studentService.getProfile(user.email);
          const isComplete = profile ? studentService.isProfileComplete(profile) : true;
          if (isMounted) setProfileComplete(isComplete);
        }

        // 2. Fetch Courses Map & Exam Configs
        const [courseRes, configRes] = await Promise.all([
          apiClient.get("/api/courses/").catch(() => null),
          apiClient.get(API_ENDPOINTS.EXAMS.CONFIG).catch(() => null),
        ]);

        const courses = Array.isArray(courseRes?.data) ? courseRes.data : courseRes?.data?.results || [];
        const coursesMap = {};
        courses.forEach((c) => { if (c?.id) coursesMap[c.id] = c; });

        const configs = Array.isArray(configRes?.data) ? configRes.data : configRes?.data?.results || [];

        // 3. Find Active Pending Application (sorted newest first)
        const appRes = await apiClient.get("/api/applications/").catch(() => null);
        const apps = Array.isArray(appRes?.data) ? appRes.data : appRes?.data?.results || [];
        const localApps = JSON.parse(localStorage.getItem("sure_student_applications") || "[]");
        const allApps = [...apps, ...localApps];

        allApps.sort((x, y) => new Date(y.created_at || y.applied_at || 0) - new Date(x.created_at || x.applied_at || 0));

        let activeApp = null;
        let isQualCandidate = false;

        allApps.forEach((a) => {
          const st = (a.status || "").toUpperCase();
          if (["QUALIFIED", "COHORT_ASSIGNED"].includes(st) || a.qualified === true) {
            isQualCandidate = true;
          } else if (["APPLIED", "SUBMITTED", "PRESCREENING_PENDING", "PRESCREENING_COMPLETED", "EXAM_PENDING", "WAITLISTED"].includes(st)) {
            if (!activeApp) activeApp = a;
          }
        });

        if (isMounted) {
          setIsQualifiedCandidate(isQualCandidate);

          if (activeApp) {
            const cId = activeApp.course?.id || (typeof activeApp.course === "string" ? activeApp.course : activeApp.course_id);
            const courseObj = coursesMap[cId];
            const cName = courseObj?.name || courseObj?.title || activeApp.course_name || activeApp.course_display || "Screening Track";

            const activeTrackObj = { id: cId || "active_track", name: cName };
            setActiveCourseTrack(activeTrackObj);

            // Match Config for domain or fallback to DEFAULT / first config
            const matchedCfg = (
              configs.find(c => c.domain && cName.toLowerCase().includes(c.domain.toLowerCase())) ||
              configs.find(c => c.domain && c.domain.toUpperCase() === "DEFAULT") ||
              configs[0]
            );
            if (matchedCfg) {
              setExamConfig({
                number_of_questions: matchedCfg.number_of_questions || 12,
                duration_minutes: matchedCfg.duration_minutes || 5,
                pass_percentage: matchedCfg.pass_percentage || 40.00,
              });
            }

            // Disqualification ONLY applies if active app is explicitly REJECTED/DISQUALIFIED with 5 violations
            const stUpper = (activeApp.status || "").toUpperCase();
            const isAppQualified = activeApp.qualified === true || stUpper === "QUALIFIED";
            const appCheatCount = activeApp.cheat_count || (activeApp.exam?.cheat_count) || 0;

            if (!isAppQualified && (stUpper === "REJECTED" || stUpper === "DISQUALIFIED") && appCheatCount >= 5) {
              setIsDisqualified(true);
            } else {
              setIsDisqualified(false);
              // Clear any stale browser disqualification flags for active pending exam
              if (cId) localStorage.removeItem(`sure_exam_disqualified_${cId}`);
              localStorage.removeItem("sure_exam_disqualified_default_med");
            }
          } else {
            setActiveCourseTrack(null);
            setIsDisqualified(false);
          }
        }
      } catch (err) {
        console.error("Failed to load exam context:", err);
      } finally {
        if (isMounted) setFetchingData(false);
      }
    };

    loadExamContext();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleStartExam = async () => {
    if (!profileComplete) {
      alert("⚠️ Please complete your profile first before attempting the screening exam.");
      navigate("/student/profile");
      return;
    }

    if (isDisqualified) {
      alert("🚨 You have been disqualified for anti-cheating violations on this exam. Re-attempts are disabled.");
      return;
    }

    if (!activeCourseTrack) {
      alert("⚠️ No active course application found. Please apply for a course track first.");
      navigate("/student/apply-course");
      return;
    }

    setLoading(true);
    setError(null);

    // Request fullscreen mode
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen permission denied or not supported:", e);
    }

    try {
      const res = await apiClient.post(API_ENDPOINTS.EXAMS.START, {
        course_id: activeCourseTrack.id,
        course_name: activeCourseTrack.name,
      }).catch(() => null);

      const examSession = res?.data?.exam || res?.data || {
        id: `SESSION-${Date.now()}`,
        course_name: activeCourseTrack.name,
        duration_minutes: 30,
        started_at: new Date().toISOString(),
      };

      navigate("/student/exam", { state: { examSession, selectedCourse: activeCourseTrack.id } });
    } catch (err) {
      console.error("Error starting exam:", err);
      setError(err.response?.data?.error || "Failed to start examination. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Screening Examination Portal</h1>
        <p className={styles.subtitle}>
          Standardized Online Assessment Mode. Please read rules carefully before starting.
        </p>

        {/* 🚨 PROFILE INCOMPLETE ALERT BANNER 🚨 */}
        {!profileComplete && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", padding: "1rem 1.25rem", borderRadius: "10px", marginBottom: "1.5rem", color: "#991b1b", fontWeight: "bold" }}>
            ⚠️ Profile Incomplete: Please complete your profile details (First Name, Email, Phone/College) before attempting the screening test.
            <div style={{ marginTop: "10px" }}>
              <Link to="/student/profile" style={{ padding: "8px 16px", backgroundColor: "#dc2626", color: "white", borderRadius: "6px", textDecoration: "none", fontSize: "14px" }}>
                Complete Profile Now
              </Link>
            </div>
          </div>
        )}

        {/* 🏆 QUALIFIED BANNER 🏆 */}
        {isQualifiedCandidate && (
          <div style={{ backgroundColor: "#f0fdf4", border: "2px solid #22c55e", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🏆</div>
            <h3 style={{ color: "#15803d", margin: "0 0 8px 0" }}>You Have Qualified!</h3>
            <p style={{ color: "#166534", fontSize: "15px", margin: 0 }}>
              Congratulations! You have already passed the screening examination for your course track. No screening test is currently pending.
            </p>
          </div>
        )}

        {/* 🚨 NO ACTIVE APPLICATION WARNING BANNER 🚨 */}
        {!fetchingData && !activeCourseTrack && !isQualifiedCandidate && (
          <div style={{ backgroundColor: "#fffbeb", border: "2px solid #f59e0b", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📋</div>
            <h3 style={{ color: "#92400e", margin: "0 0 8px 0" }}>No Active Exam Pending</h3>
            <p style={{ color: "#b45309", fontSize: "15px", marginBottom: "1rem" }}>
              You currently do not have an active screening exam pending. Please register or apply for an internship course track first.
            </p>
            <Link to="/student/apply-course" style={{ padding: "10px 20px", backgroundColor: "#d97706", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "15px" }}>
              Register / Apply for a Course Track →
            </Link>
          </div>
        )}

        {/* 🚨 DISQUALIFIED ALERT BANNER 🚨 */}
        {isDisqualified && (
          <div style={{ backgroundColor: "#fef2f2", border: "2px solid #ef4444", padding: "1rem 1.25rem", borderRadius: "10px", marginBottom: "1.5rem", color: "#991b1b", fontWeight: "bold" }}>
            🚨 DISQUALIFIED & FLAGGED: You recorded 5 anti-cheating violations (tab switching / window focus loss) during your previous attempt. Re-attempts for this course are strictly prohibited.
          </div>
        )}

        {error && <div className={styles.errorMessage}>{error}</div>}

        {/* 📚 AUTOMATIC ACTIVE COURSE TRACK BADGE (NO DROPDOWN) 📚 */}
        {activeCourseTrack && (
          <div className={styles.section} style={{ backgroundColor: "#f0f9ff", padding: "1.25rem", borderRadius: "12px", border: "1px solid #bae6fd", marginBottom: "1.5rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "#0369a1" }}>1. Active Course Track (Auto-Loaded)</h2>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "#0f172a", marginTop: "6px" }}>
              🎯 {activeCourseTrack.name}
            </div>
            <span style={{ fontSize: "12px", color: "#0284c7", fontWeight: "600" }}>Active Course Application Detected</span>
          </div>
        )}

        <div className={styles.section}>
          <h2>Exam Parameters (Admin Configured)</h2>
          <ul>
            <li>Total Questions: <strong>{examConfig.number_of_questions} Multiple Choice Questions (MCQ)</strong></li>
            <li>Duration: <strong>{examConfig.duration_minutes} Minutes</strong></li>
            <li>Passing Score: <strong>{examConfig.pass_percentage}% Marks (Admin Threshold)</strong></li>
            <li>Target Domain: <strong>{activeCourseTrack?.name || "Pending Application Track"}</strong></li>
          </ul>
        </div>

        <div className={styles.section}>
          <h2>Security & Anti-Cheating Rules</h2>
          <ul>
            <li>🔒 <strong>Full-Screen Mode:</strong> The exam operates in forced full-screen. Exiting full-screen is logged as a violation.</li>
            <li>🚫 <strong>Max 5 Violations Allowed:</strong> Tab switching, minimizing browser, or window blur will log violations. <strong>On 5 violations, the exam auto-submits & flags you as Disqualified!</strong></li>
            <li>❌ <strong>Copy/Paste Disabled:</strong> Context menu, copy/paste, and dev tool shortcuts are strictly blocked.</li>
            <li>⏱️ <strong>Auto-Submit:</strong> When the 30-minute timer expires, your exam automatically submits.</li>
          </ul>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
          {isQualifiedCandidate ? (
            <button
              type="button"
              disabled
              style={{ flex: 1, padding: "14px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", cursor: "not-allowed" }}
            >
              Passed & Qualified ✓ (No Exam Pending)
            </button>
          ) : !profileComplete ? (
            <Link to="/student/profile" style={{ flex: 1, padding: "14px", textAlign: "center", backgroundColor: "#d97706", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "16px" }}>
              Complete Profile First
            </Link>
          ) : !activeCourseTrack ? (
            <Link to="/student/apply-course" style={{ flex: 1, padding: "14px", textAlign: "center", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "16px" }}>
              Register / Apply for a Course →
            </Link>
          ) : (
            <button
              type="button"
              className={styles.startButton}
              onClick={handleStartExam}
              disabled={loading || isDisqualified || fetchingData}
              style={{ flex: 1, opacity: (isDisqualified || fetchingData) ? 0.6 : 1, cursor: (isDisqualified || fetchingData) ? "not-allowed" : "pointer" }}
            >
              {loading ? "Initializing Session..." : isDisqualified ? "Disqualified (Attempt Blocked)" : "Start Examination Now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExamInstructions;