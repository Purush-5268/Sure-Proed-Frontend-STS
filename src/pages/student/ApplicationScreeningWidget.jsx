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
      
      // Auto-poll every 15s if waiting for admin start
      if (!screening.admin_started_at && getStatus() === "WAITING_FOR_ADMIN") {
        intervalRef.current = setInterval(fetchScreening, 15000);
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
    if (now < scheduledAt) {
      const tMinus10 = new Date(scheduledAt.getTime() - 10 * 60 * 1000);
      if (now >= tMinus10 && screening.meeting_link) return "MEET_AVAILABLE";
      return "SCHEDULED";
    }
    if (!screening.admin_started_at) return "WAITING_FOR_ADMIN";
    return "READY_TO_START";
  };

  const status = getStatus();

  const formatCountdown = (ms) => {
    if (ms <= 0) return "Now";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const handleStartExam = async () => {
    setBusy(true);
    setError("");
    try {
      // The backend returns an error if admin hasn't started it yet.
      const res = await apiClient.post(API_ENDPOINTS.EXAMS.START_INTERNAL(screening.exam));
      navigate("/student/exam-instructions");
    } catch (err) {
      const apiCode = err.response?.data?.code;
      if (apiCode === "ADMIN_NOT_STARTED") {
        setError("The administrator has not opened the test yet. Please wait in the Google Meet.");
        // Refetch to see if maybe we missed the state change
        fetchScreening();
      } else {
        navigate("/student/exam-instructions"); // Navigate anyway so standard logic picks up evaluated/submitted states
      }
    } finally {
      setBusy(false);
    }
  };

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
          <button disabled style={{ padding: "12px 20px", backgroundColor: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed" }}>
            <FiVideo /> Meet visible in {formatCountdown(scheduledAt.getTime() - 10 * 60 * 1000 - now.getTime())}
          </button>
        )}

        {(status === "MEET_AVAILABLE" || status === "WAITING_FOR_ADMIN" || status === "READY_TO_START") && (
          <a href={screening.meeting_link} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", backgroundColor: "#0b57d0", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <FiVideo /> Join Google Meet
          </a>
        )}

        {status === "MEET_AVAILABLE" && (
          <button disabled style={{ padding: "12px 20px", backgroundColor: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed" }}>
            <FiPlayCircle /> Exam starts in {formatCountdown(scheduledAt.getTime() - now.getTime())}
          </button>
        )}

        {status === "WAITING_FOR_ADMIN" && (
          <button disabled style={{ padding: "12px 20px", backgroundColor: "#fef9c3", color: "#854d0e", border: "1px solid #fef08a", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "not-allowed" }}>
            <FiClock /> Waiting for Admin to open gate...
          </button>
        )}

        {status === "READY_TO_START" && (
          <button onClick={handleStartExam} disabled={busy} style={{ padding: "12px 20px", backgroundColor: "#16a34a", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <FiCheckCircle /> {busy ? "Starting..." : "Start Exam"}
          </button>
        )}
      </div>
    </div>
  );
};

export default ApplicationScreeningWidget;
