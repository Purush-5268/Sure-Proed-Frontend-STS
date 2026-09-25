import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { examService } from "../../services/examService";
import { FiClock, FiVideo, FiPlayCircle, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import styles from "./ApplicationStatus.module.css";

const ApplicationScreeningWidget = ({ application }) => {
  const navigate = useNavigate();
  const [screening, setScreening] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchScreening = async () => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.PRESCREENING(application.id));
      setScreening(response.data);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error("Failed to load screening:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreening();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [application.id]);

  useEffect(() => {
    if (screening) {
      timerRef.current = setInterval(() => setNow(new Date()), 1000);
      
      const currentStatus = getStatus();
      // Auto-poll every 5s when waiting for admin or when meet is available or close to start time
      const timeToStart = screening.scheduled_at ? new Date(screening.scheduled_at).getTime() - Date.now() : Infinity;
      const shouldPoll = currentStatus === "WAITING_FOR_ADMIN" || 
        currentStatus === "MEET_AVAILABLE" ||
        timeToStart < 15 * 60000;
      
      if (shouldPoll) {
        intervalRef.current = setInterval(fetchScreening, 2000);
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [screening]);

  if (loading) return null; // Don't show anything if still checking

  if (!screening) {
    return (
      <div className={styles.screeningWidget} style={{ marginTop: "20px", padding: "15px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-nested)" }}>
        <h3 style={{ margin: "0 0 10px 0", display: "flex", alignItems: "center", gap: "8px" }}>
          <FiClock /> Screening Exam
        </h3>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>Your screening exam has not been scheduled yet. Please check back later.</p>
      </div>
    );
  }

  const scheduledAt = new Date(screening.scheduled_at);
  const getStatus = () => {
    // If admin explicitly ended it, it is no longer released
    if (!screening.is_released && screening.admin_started_at) {
      return "ENDED";
    }
    if (now < scheduledAt) {
      return "SCHEDULED";
    }
    if (screening.admin_started_at) {
      return "READY_TO_START";
    }
    return "WAITING_FOR_ADMIN";
  };

  const getMeetingHref = (url) => {
    if (!url) return "#";
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const status = getStatus();

  const formatCountdown = (ms) => {
    if (ms <= 0) return "Now";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const isEvaluated = screening.status === "PASSED" || screening.status === "FAILED" || screening.exam?.status === "EVALUATED";
  const isPassed = screening.status === "PASSED" || screening.exam?.is_passed || (screening.exam?.percentage >= (screening.pass_percentage || 40));

  const handleStartExam = async () => {
    setBusy(true);
    setError("");
    try {
      const isExternalUrl = screening.exam_url && !screening.exam_url.includes(window.location.host);
      if (isExternalUrl) {
        window.open(screening.exam_url, "_blank");
        return;
      }
      // If internal exam, start the attempt and redirect straight to the exam runner
      const examId = screening.exam?.id || screening.exam;
      if (!examId) {
        navigate("/student/exam-instructions");
        return;
      }
      const res = await apiClient.post(API_ENDPOINTS.EXAMS.START_INTERNAL(examId));
      const startResult = res.data;
      const examSession = {
        attempt_id: startResult.attempt_id,
        exam_id: examId,
        start_time: startResult.start_time,
        expires_at: startResult.expires_at,
        duration_minutes: startResult.duration_minutes,
        paper_code: startResult.paper_code || "A",
        paper_label: startResult.paper_label || "Paper A",
        proctoring: startResult.proctoring,
        questions: startResult.questions,
        saved_answers: startResult.saved_answers || {},
      };
      try {
        sessionStorage.setItem("sure_active_exam_session", JSON.stringify(examSession));
      } catch (storageErr) {
        console.warn("SessionStorage write warning:", storageErr);
      }
      navigate("/student/exam", {
        state: {
          examSession,
          applicationId: screening.application_id || screening.application,
        },
      });
    } catch (err) {
      const apiCode = err.response?.data?.code;
      if (apiCode === "ADMIN_NOT_STARTED") {
        setError("The administrator has not opened the test yet. Please wait in the Google Meet.");
        fetchScreening();
      } else {
        navigate("/student/exam-instructions");
      }
    } finally {
      setBusy(false);
    }
  };

  if (isEvaluated) {
    return (
      <div className={styles.screeningWidget} style={{ marginTop: "20px", padding: "20px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-nested)", display: "flex", flexDirection: "column", gap: "15px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <FiClock /> Screening Exam
          </h3>
          <span style={{ padding: "5px 12px", backgroundColor: isPassed ? "#dcfce7" : "#fee2e2", color: isPassed ? "#166534" : "#991b1b", borderRadius: "16px", fontSize: "12px", fontWeight: "bold" }}>
            {isPassed ? "QUALIFIED" : "NOT QUALIFIED"}
          </span>
        </div>
        <div style={{ padding: "15px", backgroundColor: isPassed ? "#f0fdf4" : "#fef2f2", borderRadius: "8px", border: `1px solid ${isPassed ? "#bbf7d0" : "#fecaca"}` }}>
          <h4 style={{ margin: "0 0 5px 0", color: isPassed ? "#166534" : "#991b1b" }}>
            {isPassed ? "Congratulations! You have passed the screening exam." : "Screening exam evaluated."}
          </h4>
          <p style={{ margin: 0, fontSize: "14px", color: isPassed ? "#15803d" : "#b91c1c" }}>
            Score: <strong>{screening.exam?.marks_obtained ?? "Completed"}</strong> / {screening.exam?.total_marks ?? 50} 
            {screening.exam?.percentage ? ` (${screening.exam.percentage}%)` : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screeningWidget} style={{ marginTop: "20px", padding: "20px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-nested)", display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
          <FiClock /> Screening Exam Schedule
        </h3>
        <span style={{ padding: "5px 10px", backgroundColor: "var(--bg-surface)", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", border: "1px solid var(--border-color)" }}>
          Pass requirement: {screening.pass_percentage}%
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", backgroundColor: "var(--bg-surface)", padding: "15px", borderRadius: "8px" }}>
        <div>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px" }}>Date & Time</p>
          <h4 style={{ margin: "5px 0 0 0" }}>{scheduledAt.toLocaleString()}</h4>
        </div>
        <div>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px" }}>Duration</p>
          <h4 style={{ margin: "5px 0 0 0" }}>{Math.round((new Date(screening.end_time) - scheduledAt) / 60000)} minutes</h4>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px", backgroundColor: "#fef2f2", color: "#991b1b", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
          <FiAlertCircle /> {error}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "15px", marginTop: "10px" }}>
        {status === "SCHEDULED" && (
          <>
            <button disabled style={{ padding: "12px 20px", backgroundColor: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed" }}>
              <FiVideo /> Join Meet available at {scheduledAt.toLocaleString()} ({formatCountdown(scheduledAt.getTime() - now.getTime())})
            </button>
            <button disabled style={{ padding: "12px 20px", backgroundColor: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed" }}>
              <FiClock /> Start Exam available at {scheduledAt.toLocaleString()}
            </button>
          </>
        )}

        {status === "ENDED" && (
          <span style={{ padding: "12px 20px", backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
            <FiClock /> Exam Window Closed
          </span>
        )}

        {status === "WAITING_FOR_ADMIN" && (
          <>
            {screening.meeting_link ? (
              <a href={getMeetingHref(screening.meeting_link)} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", backgroundColor: "#0b57d0", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                <FiVideo /> Join Google Meet
              </a>
            ) : (
              <button disabled style={{ padding: "12px 20px", backgroundColor: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed" }}>
                <FiVideo /> Join Google Meet (Link Pending Admin)
              </button>
            )}
            <button disabled style={{ padding: "12px 20px", backgroundColor: "#fef9c3", color: "#854d0e", border: "1px solid #fef08a", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed", fontWeight: 600 }}>
              <FiClock /> Waiting for Admin to Start...
            </button>
          </>
        )}

        {status === "READY_TO_START" && (
          <>
            {screening.meeting_link && (
              <a href={getMeetingHref(screening.meeting_link)} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", backgroundColor: "#0b57d0", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                <FiVideo /> Join Google Meet
              </a>
            )}
            <button onClick={handleStartExam} disabled={busy} style={{ padding: "12px 20px", backgroundColor: "#16a34a", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              <FiCheckCircle /> {busy ? "Starting..." : "Start Exam"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ApplicationScreeningWidget;
