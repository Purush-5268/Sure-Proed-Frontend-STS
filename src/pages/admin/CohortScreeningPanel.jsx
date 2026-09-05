import React, { useState, useEffect } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import { examService } from "../../services/examService";
import { cohortService } from "../../services/cohortService";
import { Link } from "react-router-dom";
import styles from "./CohortDetails.module.css";
import { FiClock, FiVideo, FiPlayCircle, FiCheckCircle } from "react-icons/fi";

const CohortScreeningPanel = ({ cohortId, cohort }) => {
  const [questionBanks, setQuestionBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Existing screening state if already scheduled
  const existingScreening = cohort?.pre_screening || cohort?.screening_schedule || cohort?.screening || null;
  const [screening, setScreening] = useState(existingScreening);

  // Form state
  const [form, setForm] = useState({
    question_bank_id: "",
    scheduled_at: "",
    end_time: "",
    pass_percentage: 40,
  });

  const [editPassPercentage, setEditPassPercentage] = useState(false);
  const [newPassPercentage, setNewPassPercentage] = useState("");

  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const courseId = typeof cohort?.course === 'object' ? cohort?.course?.id : (cohort?.course || cohort?.course_id);
        const params = { bank_type: "PRESCREENING", status: "APPROVED" };
        if (courseId) params.course = courseId;

        const response = await apiClient.get(API_ENDPOINTS.QUESTION_BANKS.BASE, { params });
        let banks = response.data?.results || response.data || [];

        // Also strictly filter on frontend to guarantee correctness
        if (courseId) {
          banks = banks.filter(b => {
             const bankCourseId = typeof b.course === 'object' ? b.course?.id : (b.course || b.course_id);
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
    if (!form.question_bank_id) return alert("Select a question bank.");
    setBusy(true);
    setError("");
    try {
      const payload = {
        question_bank_id: form.question_bank_id,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        pass_percentage: Number(form.pass_percentage) || 40,
      };
      const res = await cohortService.scheduleScreening(cohortId, payload);
      setScreening(res.screening || res.pre_screening || res);
      alert("Screening Scheduled Successfully!");
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message || "Failed to schedule screening.");
    } finally {
      setBusy(false);
    }
  };

  const handleAdminStart = async () => {
    if (!screening?.id) return;
    setBusy(true);
    try {
      const res = await applicationService.adminStartPrescreening(screening.id);
      setScreening((prev) => ({ ...prev, admin_started_at: res.admin_started_at || new Date().toISOString() }));
    } catch (err) {
      alert(err.response?.data?.detail || err.response?.data?.error || "Failed to start exam.");
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

  if (loading) return <div className={styles.panel}><p>Loading screening context...</p></div>;

  return (
    <div className={styles.panel} style={{ marginTop: "1rem", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-nested)" }}>
      <div className={styles.panelHeader} style={{ padding: "1.5rem" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FiClock /> Cohort Screening Exam
        </h2>
        <p>Schedule the pre-screening entrance exam for all applied students.</p>
      </div>

      <div className={styles.panelBody} style={{ padding: "0 1.5rem 1.5rem 1.5rem" }}>
        {error && <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "10px", borderRadius: "8px", marginBottom: "15px" }}>{error}</div>}

        {!screening ? (
          <form onSubmit={handleSchedule} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", alignItems: "end", width: "100%" }}>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>Verified Question Bank</strong>
                <Link to="/admin/question-banks" style={{ fontSize: "13px", color: "var(--primary-color)", textDecoration: "none", fontWeight: "600" }}>+ Generate New</Link>
              </div>
              <select 
                value={form.question_bank_id} 
                onChange={(e) => setForm({ ...form, question_bank_id: e.target.value })}
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)", fontSize: "14px", width: "100%", boxSizing: "border-box", outline: "none" }}
                required
              >
                <option value="">-- Select Question Bank --</option>
                {questionBanks.map((bank) => (
                  <option key={bank.id} value={bank.id}>{bank.title || bank.id}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>Pass Percentage (Threshold)</strong>
              <input 
                type="number" 
                value={form.pass_percentage} 
                onChange={(e) => setForm({ ...form, pass_percentage: e.target.value })}
                min="0" max="100"
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)", fontSize: "14px", width: "100%", boxSizing: "border-box", outline: "none" }}
                required
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>Start Time</strong>
              <input 
                type="datetime-local" 
                value={form.scheduled_at} 
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)", fontSize: "14px", width: "100%", boxSizing: "border-box", outline: "none" }}
                required
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>End Time</strong>
              <input 
                type="datetime-local" 
                value={form.end_time} 
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)", fontSize: "14px", width: "100%", boxSizing: "border-box", outline: "none" }}
                required
              />
            </label>

            <div style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
              <button 
                type="submit" 
                disabled={busy}
                style={{ padding: "12px 24px", backgroundColor: "var(--primary-color)", color: "white", borderRadius: "8px", border: "none", fontWeight: "600", cursor: busy ? "not-allowed" : "pointer", fontSize: "15px", transition: "all 0.2s" }}
              >
                {busy ? "Scheduling..." : "Schedule Screening Exam"}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--bg-surface)", padding: "15px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <div>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>Scheduled Start</p>
                <h3 style={{ margin: "5px 0 0 0" }}>{new Date(screening.scheduled_at).toLocaleString()}</h3>
              </div>
              <div>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>Scheduled End</p>
                <h3 style={{ margin: "5px 0 0 0" }}>{new Date(screening.end_time).toLocaleString()}</h3>
              </div>
              <div>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>Pass Percentage</p>
                {editPassPercentage && !screening.admin_started_at ? (
                  <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "5px" }}>
                    <input type="number" min="0" max="100" value={newPassPercentage} onChange={(e) => setNewPassPercentage(e.target.value)} style={{ width: "60px", padding: "5px" }} />
                    <button onClick={handleUpdatePassPercentage} disabled={busy} style={{ backgroundColor: "var(--primary-color)", color: "white", border: "none", borderRadius: "4px", padding: "5px 10px", cursor: "pointer" }}>Save</button>
                    <button onClick={() => setEditPassPercentage(false)} style={{ backgroundColor: "var(--text-muted)", color: "white", border: "none", borderRadius: "4px", padding: "5px 10px", cursor: "pointer" }}>X</button>
                  </div>
                ) : (
                  <h3 style={{ margin: "5px 0 0 0", display: "flex", alignItems: "center", gap: "10px" }}>
                    {screening.pass_percentage ?? form.pass_percentage}%
                    {!screening.admin_started_at && (
                      <button onClick={() => { setEditPassPercentage(true); setNewPassPercentage(screening.pass_percentage ?? form.pass_percentage); }} style={{ fontSize: "12px", background: "none", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 5px", cursor: "pointer", color: "var(--text-primary)" }}>Edit</button>
                    )}
                  </h3>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
              {screening.meeting_link ? (
                <a href={screening.meeting_link} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", backgroundColor: "#0b57d0", color: "white", textDecoration: "none", borderRadius: "8px", fontWeight: "bold" }}>
                  <FiVideo /> Join Google Meet
                </a>
              ) : (
                <span style={{ padding: "12px 20px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <FiVideo /> Google Meet Generated
                </span>
              )}

              {screening.admin_started_at ? (
                <span style={{ padding: "12px 20px", backgroundColor: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "8px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                  <FiCheckCircle /> EXAM STARTED · {new Date(screening.admin_started_at).toLocaleTimeString()}
                </span>
              ) : (
                <button onClick={handleAdminStart} disabled={busy} style={{ padding: "12px 20px", backgroundColor: "#16a34a", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                  <FiPlayCircle /> {busy ? "Starting..." : "Start Exam (Open Gate)"}
                </button>
              )}
            </div>
            {screening.admin_started_at && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "13px" }}>Pass percentage is now locked and students can begin the exam.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default CohortScreeningPanel;
