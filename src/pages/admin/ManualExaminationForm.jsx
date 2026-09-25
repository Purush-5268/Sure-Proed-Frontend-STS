import { useEffect, useState } from "react";
import apiClient from "../../services/apiClient";
import styles from "./ManualExaminationForm.module.css";

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const defaultStartTime = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return formatDateTimeLocal(date);
})();

const defaultEndTime = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(11, 0, 0, 0);
  return formatDateTimeLocal(date);
})();

const emptyForm = {
  title: "",
  course: "",
  cohort: "",
  examination_date: new Date().toISOString().slice(0, 10),
  start_time: defaultStartTime,
  end_time: defaultEndTime,
  total_questions: 0,
  maximum_marks: 100,
  pass_percentage: 40,
  duration_minutes: 10,
};

export default function ManualExaminationForm({ onSuccess, onEnrollAllCandidates, initialCohortId = "", initialCourseId = "", autoOpen = false, hideTrigger = false }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [questionBanks, setQuestionBanks] = useState([]);
  const [applications, setApplications] = useState([]);
  const [form, setForm] = useState({ ...emptyForm, cohort: initialCohortId, course: initialCourseId });
  const [examination, setExamination] = useState(null);
  const [selected, setSelected] = useState([]);
  const [results, setResults] = useState({});
  const [manageResults, setManageResults] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiClient.get("/api/courses/?page_size=200"),
      apiClient.get("/api/cohorts/?page_size=200"),
      apiClient.get("/api/question-banks/?bank_type=PRESCREENING&status=APPROVED&page_size=200"),
    ]).then(([coursesRes, cohortsRes, banksRes]) => {
      const list = (value) => Array.isArray(value) ? value : value?.results || [];
      setCourses(list(coursesRes.data));
      setCohorts(list(cohortsRes.data));
      setQuestionBanks(list(banksRes.data));
    }).catch(() => setMessage("Unable to load courses and cohorts."));
  }, [open]);

  useEffect(() => {
    if (!form.cohort || form.title) return;
    const selectedCohort = cohorts.find((cohort) => String(cohort.id) === String(form.cohort));
    if (selectedCohort) {
      setForm((current) => ({ ...current, title: `${selectedCohort.name || selectedCohort.code} Pre-Screening Examination` }));
    }
  }, [cohorts, form.cohort, form.title]);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const loadCandidates = async (cohortId) => {
    if (!cohortId) return;
    try {
      const res = await apiClient.get(`/api/applications/?cohort=${cohortId}&page_size=200`);
      const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
      setApplications(list.filter((app) => !["REJECTED", "CANCELLED", "DROPPED"].includes(app.status)));
    } catch {
      setMessage("Unable to load candidates for this cohort.");
    }
  };

  useEffect(() => {
    if (open && form.cohort) loadCandidates(form.cohort);
  }, [open, form.cohort]);

  const createExamination = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (new Date(form.end_time) <= new Date(form.start_time)) {
        setMessage("End time must be after start time.");
        setBusy(false);
        return;
      }
      if (!form.question_bank) {
        setMessage("Select an approved screening question bank.");
        setBusy(false);
        return;
      }
      if (Number(form.total_questions) < 1) {
        setMessage("The number of questions must be at least 1.");
        setBusy(false);
        return;
      }
      const res = await apiClient.post("/api/manual-examinations/", { ...form, maximum_marks: Number(form.total_questions) });
      setExamination(res.data);
      setManageResults(true);
      await loadCandidates(form.cohort);
      setMessage("Manual examination created with all eligible cohort candidates.");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to create the manual examination.");
    } finally {
      setBusy(false);
    }
  };

  const downloadResults = (qualifiedOnly = false) => {
    const rows = (examination.results || [])
      .filter((result) => !qualifiedOnly || result.qualified === true)
      .map((result) => [
        result.student_name || result.application_number || "Candidate",
        result.student_email || "",
        result.application_number || "",
        result.marks_obtained ?? 0,
        result.qualified === true ? "QUALIFIED" : "REJECTED",
      ]);
    if (!rows.length) {
      setMessage(qualifiedOnly ? "No qualified candidates to download." : "No results to download.");
      return;
    }
    const csv = ["Candidate,Email,Application,Marks,Result", ...rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${examination.title.replace(/[^a-z0-9_-]/gi, "_")}_${qualifiedOnly ? "Qualified" : "Results"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const syncCandidates = async () => {
    setBusy(true);
    try {
      const response = await apiClient.get(`/api/applications/?cohort=${form.cohort}&page_size=200`);
      const applications = Array.isArray(response.data) ? response.data : response.data?.results || [];
      const eligibleIds = applications
        .filter((application) => !["REJECTED", "CANCELLED", "DROPPED"].includes(application.status))
        .map((application) => application.id);
      const examinationResponse = await apiClient.post(`/api/manual-examinations/${examination.id}/add-candidates/`, { application_ids: eligibleIds });
      setExamination(examinationResponse.data);
      setMessage("Candidate list and result rows synced.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Unable to sync cohort candidates.");
    } finally {
      setBusy(false);
    }
  };

  const saveResult = async (result) => {
    const value = results[result.id] || {};
    try {
      const response = await apiClient.patch(`/api/manual-examinations/${examination.id}/results/${result.id}/`, {
        marks_obtained: value.marks_obtained === "" ? null : value.marks_obtained,
      });
      setExamination((current) => ({
        ...current,
        results: (current.results || []).map((item) => item.id === result.id ? { ...item, ...response.data } : item),
      }));
      return true;
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to save this result.");
      return false;
    }
  };

  const saveAllResults = async () => {
    setBusy(true);
    setMessage("");
    try {
      const resultsToSave = examination.results || [];
      const saved = await Promise.all(resultsToSave.map((result) => saveResult(result)));
      if (!saved.every(Boolean)) {
        setMessage("Some candidate results could not be saved.");
        return;
      }
      const response = await apiClient.post(`/api/manual-examinations/${examination.id}/mark-screening-done/`);
      setExamination(response.data);
      setManageResults(false);
      setMessage("Results saved and screening completed.");
      onSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  const enrollCandidatesAndRefresh = async () => {
    await onEnrollAllCandidates?.();
    try {
      const response = await apiClient.get(`/api/manual-examinations/${examination.id}/`);
      setExamination(response.data);
    } catch {
      setMessage("Students were enrolled, but the result table could not be refreshed.");
    }
  };

  const complete = async () => {
    if (!window.confirm("Mark this screening done and save all candidate results?")) return;
    setBusy(true);
    try {
      const res = await apiClient.post(`/api/manual-examinations/${examination.id}/mark-screening-done/`);
      setExamination(res.data);
      setMessage("Screening Completed. Candidate results were saved.");
      onSuccess?.();
    } catch (error) {
      setMessage(error.response?.data?.error || "Unable to complete the screening.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      {!hideTrigger && <button type="button" className={styles.toggleButton} onClick={() => { setOpen((value) => !value); setForm((current) => ({ ...current, cohort: current.cohort || initialCohortId, course: current.course || initialCourseId })); }}>
        Manual Examination
      </button>}
      {open && (
        <div className={`premium-card ${styles.panelCard}`}>
          {!examination ? (
            <form onSubmit={createExamination} className={styles.form}>
              <h3 className={styles.heading}>Record External Examination</h3>
              <p className={styles.subheading}>Enter the details of an examination conducted outside this platform.</p>
              <div className={styles.field}><label htmlFor="manual-title">Examination / Test Name</label><input id="manual-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className={styles.field}><label htmlFor="manual-course">Course</label><select id="manual-course" required value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}><option value="">Select course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></div>
              <div className={styles.field}><label htmlFor="manual-cohort">Cohort</label><select id="manual-cohort" required value={form.cohort} onChange={(e) => { const cohort = cohorts.find((item) => String(item.id) === e.target.value); setForm({ ...form, cohort: e.target.value, title: cohort ? `${cohort.name || cohort.code} Pre-Screening Examination` : form.title }); loadCandidates(e.target.value); }}><option value="">Select cohort</option>{cohorts.filter((cohort) => !form.course || String(cohort.course?.id || cohort.course) === String(form.course)).map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name || cohort.code}</option>)}</select></div>
              <div className={styles.field}><label htmlFor="manual-date">Examination Date</label><input id="manual-date" required type="date" value={form.examination_date} onChange={(e) => setForm({ ...form, examination_date: e.target.value })} /></div>
              <div className={styles.field}><label htmlFor="manual-start">Start Time</label><input id="manual-start" required type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
              <div className={styles.field}><label htmlFor="manual-end">End Time</label><input id="manual-end" required type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
              <div className={styles.field}><label htmlFor="manual-bank">Screening Question Bank</label><select id="manual-bank" required value={form.question_bank || ""} onChange={(e) => { const bank = questionBanks.find((item) => String(item.id) === e.target.value); setForm({ ...form, question_bank: e.target.value, total_questions: bank?.total_questions_per_set || bank?.total_questions || bank?.questions_count || bank?.questions?.length || form.total_questions }); }}><option value="">Select question bank</option>{questionBanks.filter((bank) => !form.course || String(bank.course?.id || bank.course || bank.course_id) === String(form.course)).map((bank) => <option key={bank.id} value={bank.id}>{bank.title} ({bank.total_questions_per_set || bank.total_questions || bank.questions_count || bank.questions?.length || 0} questions)</option>)}</select></div>
              <div className={styles.field}><label htmlFor="manual-questions">Number of Questions</label><input id="manual-questions" required type="number" min="1" value={form.total_questions || ""} onChange={(e) => setForm({ ...form, total_questions: e.target.value })} /></div>
              <div className={styles.field}><label htmlFor="manual-pass">Passing Percentage</label><input id="manual-pass" required type="number" min="40" max="100" value={form.pass_percentage} onChange={(e) => setForm({ ...form, pass_percentage: e.target.value })} /><small>Screening minimum: 40%</small></div>
              <div className={styles.field}><label htmlFor="manual-duration">Duration (minutes)</label><input id="manual-duration" type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
              <div className={styles.fieldWide}><button className={styles.primaryButton} disabled={busy} type="submit">{busy ? "Creating..." : "Create Manual Examination"}</button></div>
            </form>
          ) : (
            <div>
              <h3 className={styles.heading}>{examination.title} <small>({examination.status})</small></h3>
              <div className={styles.examSummary}><span>Scheduled: {new Date(examination.start_time).toLocaleString()}</span><span>Duration: {examination.duration_minutes || 10} minutes</span><span>Passing: {examination.pass_percentage}%</span></div>
              <div className={styles.resultToolbar}><button className={styles.secondaryButton} type="button" onClick={syncCandidates} disabled={busy}>Sync Candidates</button><button className={styles.secondaryButton} type="button" onClick={() => downloadResults(false)}>Download Results</button><button className={styles.secondaryButton} type="button" onClick={() => downloadResults(true)}>Qualified Students</button></div>
              <div className={styles.tableWrap}>
                <table className={styles.resultsTable}><thead><tr><th>Candidate</th><th>Marks Obtained</th><th>Result</th></tr></thead><tbody>
                  {(examination.results || []).map((result) => { const value = results[result.id] || { marks_obtained: result.marks_obtained ?? 0 }; const isEnrolled = ["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "COMPLETED"].includes(result.application_status); const qualified = !isEnrolled && result.qualified === true; const resultLabel = isEnrolled ? "ENROLLED" : qualified ? "QUALIFIED" : "REJECTED"; return <tr key={result.id}><td><div className={styles.candidateResultCard}><strong>{result.student_name || result.application_number}</strong><small>{result.application_number}</small></div></td><td>{manageResults ? <input className={styles.resultInput} aria-label={`Marks for ${result.student_name || result.application_number}`} type="number" min="0" max={examination.maximum_marks} value={value.marks_obtained} onChange={(e) => setResults({ ...results, [result.id]: { marks_obtained: e.target.value } })} /> : <strong>{value.marks_obtained ?? 0} / {examination.maximum_marks}</strong>}</td><td><span className={isEnrolled ? styles.enrolledBadge : qualified ? styles.qualifiedBadge : styles.rejectedBadge}>{resultLabel}</span></td></tr>; })}
                </tbody></table>
              </div>
              <div className={styles.resultActions}>{!manageResults && <button className={styles.primaryButton} type="button" onClick={() => setManageResults(true)}>Manage Results</button>}{manageResults && <button className={styles.primaryButton} type="button" onClick={saveAllResults} disabled={busy}>{busy ? "Saving..." : "Save Results"}</button>}{manageResults && <button className={styles.secondaryButton} type="button" onClick={() => setManageResults(false)} disabled={busy}>Cancel</button>}{onEnrollAllCandidates && <button className={styles.successButton} type="button" onClick={enrollCandidatesAndRefresh} disabled={examination.status !== "COMPLETED"}>Enroll All Eligible Candidates</button>}</div>
            </div>
          )}
          {message && <p className={styles.message} role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
