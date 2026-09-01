import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchAuthoritativeExamContext } from "../../services/examService";
import { SureProEdLogo } from "../../components/common/SureProEdLogo";
import { normalizeExamScore } from "../../utils/examScore";
import {
  FiShield,
  FiArrowRight,
} from "react-icons/fi";
import styles from "./ExamResult.module.css";

function ExamResult() {
  const navigate = useNavigate();
  const location = useLocation();

  const [result, setResult] = useState(location.state?.examResult || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchLatestBackendResult = async () => {
      try {
        setLoading(true);

        if (location.state?.assessmentType === "MODULE_TEST" && location.state?.examResult) {
          if (isMounted) {
            setResult({
              ...location.state.examResult,
              course_name: location.state.courseName || location.state.examResult.course_name,
              application_status: "MODULE TEST",
            });
          }
          return;
        }

        // Fetch Authoritative Backend Context (Application, Course, Exam, Schedule)
        const authCtx = await fetchAuthoritativeExamContext();

        if (isMounted && authCtx) {
          const app = authCtx.activeApp;
          const course = authCtx.courseObj;
          const exam = authCtx.latestExam;
          const cfg = authCtx.examConfig || {};

          const passThreshold =
            parseFloat(
              cfg.pass_percentage ||
                cfg.exam_pass_percentage ||
                course?.exam_pass_percentage ||
                exam?.pass_percentage ||
                "60.00"
            ) || 60.0;

          const totalQs = Number(
            cfg.total_questions ||
              cfg.exam_total_questions ||
              course?.exam_total_questions ||
              exam?.total_questions ||
              location.state?.questions?.length ||
              12
          );

          // Resolve scores
          const appScore = app?.qualification_score || app?.final_score || null;
          const examScore = exam?.percentage || null;
          const stateScore = location.state?.examResult?.percentage || null;

          const percentage =
            stateScore != null
              ? parseFloat(stateScore)
              : examScore != null
              ? parseFloat(examScore)
              : appScore != null
              ? parseFloat(appScore)
              : 0;

          const marksObtained =
            location.state?.examResult?.marks_obtained != null
              ? Number(location.state?.examResult?.marks_obtained)
              : exam?.marks_obtained != null
              ? Number(exam.marks_obtained)
              : Math.round((percentage / 100) * totalQs);

          const totalMarks =
            location.state?.examResult?.total_marks != null
              ? Number(location.state?.examResult?.total_marks)
              : exam?.total_marks != null
              ? Number(exam.total_marks)
              : totalQs;

          const appStatusUpper = (app?.status || "").toUpperCase();
          const isQualified =
            location.state?.examResult?.qualified != null
              ? Boolean(location.state?.examResult?.qualified)
              : authCtx.isQualified ||
                appStatusUpper === "QUALIFIED" ||
                ["COHORT_ASSIGNED", "ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS", "ACCEPTED"].includes(appStatusUpper) ||
                percentage >= passThreshold;

          const normalizedScore = normalizeExamScore({
            marksObtained,
            totalMarks,
            percentage,
            totalQuestions: totalQs,
          });

          const backendScorecard = {
            id: exam?.id || app?.id,
            application_id: app?.id,
            application_number: app?.application_number,
            course_id: authCtx.courseId,
            course_name: authCtx.courseName || location.state?.courseName || "Screening Track",
            domain: authCtx.courseName || location.state?.courseName || "Screening Track",
            total_questions: totalQs,
            marks_obtained: normalizedScore.marksObtained,
            total_marks: normalizedScore.totalMarks,
            percentage: normalizedScore.percentage,
            pass_percentage: passThreshold,
            qualified: isQualified,
            application_status: app?.status || (isQualified ? "QUALIFIED" : "REJECTED"),
            status: exam?.status || "EVALUATED",
            cheat_count:
              location.state?.examResult?.cheat_count ||
              exam?.cheat_count ||
              app?.cheat_count ||
              0,
            submitted_at:
              exam?.submitted_at ||
              location.state?.examResult?.submitted_at ||
              new Date().toISOString(),
          };

          console.log("[Exam Result Scorecard Loaded]", {
            courseName: backendScorecard.course_name,
            marks: `${normalizedScore.marksObtained} / ${normalizedScore.totalMarks}`,
            percentage: normalizedScore.percentage + "%",
            passThreshold: passThreshold + "%",
            qualified: isQualified,
            applicationStatus: backendScorecard.application_status,
          });

          setResult(backendScorecard);
        }
      } catch (err) {
        console.error("[Exam Result] Failed to load backend scorecard:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLatestBackendResult();

    return () => {
      isMounted = false;
    };
  }, [location.state]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ padding: "60px 20px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid #cbd5e1",
              borderTopColor: "#7c2d92",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
            Fetching Authoritative Backend Result...
          </h2>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brandLogo}>
            <SureProEdLogo size={48} showText={true} />
          </div>
          <h2 style={{ color: "#dc2626", margin: "16px 0 8px 0" }}>No Exam Results Found</h2>
          <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>
            Please complete and submit your screening examination first.
          </p>
          <button className={styles.primaryBtn} onClick={() => navigate("/student/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const totalQuestions = Number(result.total_questions) || 12;
  const marksObtained = Math.round(Number(result.marks_obtained) || 0);
  const totalMarks = Math.round(Number(result.total_marks) || totalQuestions);
  const percentage = Math.round(Number(result.percentage) || 0);
  const passThreshold = Number(result.pass_percentage) || 60;
  const isPass = Boolean(result.qualified);
  const marksNotEarned = Math.max(0, totalMarks - marksObtained);
  const cheatCount = result.cheat_count || 0;
  const submittedAt = result.submitted_at
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(result.submitted_at))
    : new Date().toLocaleDateString();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          {/* Header & Logo */}
          <div className={styles.brandLogo}>
            <SureProEdLogo size={52} showText={true} />
          </div>

          <h1 className={styles.title}>{location.state?.assessmentType === "MODULE_TEST" ? "Module Test Result" : "Screening Examination Result"}</h1>

          <div className={styles.courseBadge}>
            <span>Track:</span>
            <strong>{result.course_name || result.domain || "Technical Track"}</strong>
          </div>

          {/* Prominent Result Banner */}
          <div
            className={`${styles.resultBox} ${
              isPass ? styles.resultBoxPass : styles.resultBoxFail
            }`}
          >
            <span
              className={`${styles.statusPill} ${
                isPass ? styles.statusPillPass : styles.statusPillFail
              }`}
            >
              {isPass ? "PASSED / QUALIFIED" : "FAILED / NOT QUALIFIED"}
            </span>

            <div
              className={`${styles.scorePercentage} ${
                isPass ? styles.scorePercentagePass : styles.scorePercentageFail
              }`}
            >
              {percentage}%
            </div>

            <div className={styles.scoreFraction}>
              Score: {marksObtained} / {totalMarks} Marks
            </div>
          </div>

          {/* Metric Breakdown Grid */}
          <div className={styles.breakdownGrid}>
            <div className={styles.breakdownItem}>
              <span className={styles.itemLabel}>Total Questions</span>
              <span className={styles.itemValue}>{totalQuestions}</span>
            </div>

            <div className={styles.breakdownItem}>
              <span className={styles.itemLabel}>Marks Obtained</span>
              <span className={`${styles.itemValue} ${styles.itemValueSuccess}`}>
                {marksObtained}
              </span>
            </div>

            <div className={styles.breakdownItem}>
              <span className={styles.itemLabel}>Marks Not Earned</span>
              <span className={`${styles.itemValue} ${styles.itemValueDanger}`}>
                {marksNotEarned}
              </span>
            </div>

            <div className={styles.breakdownItem}>
              <span className={styles.itemLabel}>Passing Score</span>
              <span className={styles.itemValue}>{passThreshold}%</span>
            </div>

            <div className={styles.breakdownItem}>
              <span className={styles.itemLabel}>Application Status</span>
              <span
                className={`${styles.itemValue} ${
                  isPass ? styles.itemValueSuccess : styles.itemValueDanger
                }`}
              >
                {result.application_status || (isPass ? "QUALIFIED" : "REJECTED")}
              </span>
            </div>

            <div className={styles.breakdownItem}>
              <span className={styles.itemLabel}>Evaluation Status</span>
              <span className={styles.itemValue}>{result.status || "EVALUATED"}</span>
            </div>

            <div className={styles.breakdownItem} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.itemLabel}>Submitted Timestamp</span>
              <span className={styles.itemValue} style={{ fontSize: "14px", color: "#475569" }}>
                {submittedAt}
              </span>
            </div>
          </div>

          {/* Anti-Cheating Proctoring Audit */}
          <div
            className={`${styles.auditPill} ${
              cheatCount === 0 ? styles.auditPillClean : styles.auditPillWarning
            }`}
          >
            <FiShield style={{ fontSize: "14px" }} />
            {cheatCount === 0 ? (
              <span>Anti-Cheating Audit: Clean Exam Session (0 Violations)</span>
            ) : (
              <span>
                Anti-Cheating Audit: {cheatCount} Security Violations Logged
              </span>
            )}
          </div>

          {/* Context Note */}
          <div className={styles.noteBox}>
            {isPass ? (
              <p style={{ margin: 0, color: "#166534" }}>
                Congratulations! You have achieved the required passing score of{" "}
                <strong>{passThreshold}%</strong> for{" "}
                <strong>{result.course_name || result.domain}</strong> and qualified for cohort admission.
              </p>
            ) : (
              <p style={{ margin: 0, color: "#991b1b" }}>
                Your score of <strong>{percentage}%</strong> was below the required passing threshold of{" "}
                <strong>{passThreshold}%</strong>. Your application status has been recorded in the system.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            {isPass ? (
              <>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => navigate("/student/cohort")}
                >
                  Proceed to Cohort <FiArrowRight />
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => navigate("/student/applications")}
                >
                  View Applications
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => navigate("/student/applications")}
                >
                  View Applications
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => navigate("/student/dashboard")}
                >
                  Back to Dashboard
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExamResult;
