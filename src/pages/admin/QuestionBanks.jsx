import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import {
  closeQuestionBank,
  deleteQuestionBank,
  generateQuestionBank,
  getQuestionBank,
  getQuestionPaper,
  listQuestionBanks,
  publishQuestionBank,
  regenerateQuestionBank,
} from "../../services/examService";
import styles from "./QuestionBanks.module.css";

const unpack = (response) =>
  Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.results) ? response.data.results : [];

const fetchAllPages = async (url) => {
  let results = [];
  let nextUrl = url;
  while (nextUrl) {
    const response = await apiClient.get(nextUrl);
    results = [...results, ...unpack(response)];
    nextUrl = response.data?.next || null;
    // Safety check for absolute URL returned by DRF (replace base to use apiClient properly if needed, but axios handles absolute if domain matches)
    if (nextUrl && nextUrl.startsWith("http")) {
      nextUrl = new URL(nextUrl).pathname + new URL(nextUrl).search;
    }
  }
  return results;
};

const errorText = (error) => {
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  if (data && typeof data === "object") return Object.values(data).flat().join(" ");
  return error?.message || "The request could not be completed.";
};

const parseOptions = (options) => {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object" && parsed !== null) return Object.values(parsed);
    } catch {
      return [];
    }
  }
  if (typeof options === "object" && options !== null) {
    return Object.values(options);
  }
  return [];
};

function QuestionBanks() {
  const [banks, setBanks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [moduleTests, setModuleTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rowErrors, setRowErrors] = useState({});
  const [paperViewer, setPaperViewer] = useState(null);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCohort, setFilterCohort] = useState("ALL");
  const [form, setForm] = useState({
    bank_type: "PRESCREENING",
    course_id: "",
    cohort_id: "",
    module_id: "",
    module_test_id: "",
    difficulty: "EASY",
    num_sets: 4,
    questions_per_set: 10,
    title: "",
  });

  const loadAll = useCallback(async () => {
    const [bankRows, allCourses, allCohorts, allTests] = await Promise.all([
      listQuestionBanks(),
      fetchAllPages(API_ENDPOINTS.COURSES.BASE),
      fetchAllPages(API_ENDPOINTS.COHORTS.BASE),
      fetchAllPages(API_ENDPOINTS.MODULE_TESTS.BASE),
    ]);
    setBanks(bankRows);
    setCourses(allCourses);
    setCohorts(allCohorts);
    setModuleTests(allTests);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAll()
        .catch((loadError) => setError(errorText(loadError)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    const pending = banks.filter((bank) => ["GENERATING", "PROCESSING"].includes(bank.status));
    if (!pending.length) return undefined;
    const timer = window.setInterval(async () => {
      const updates = await Promise.all(pending.map((bank) => getQuestionBank(bank.id).catch(() => bank)));
      setBanks((current) =>
        current.map((bank) => updates.find((updated) => updated.id === bank.id) || bank)
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, [banks]);

  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state?.modal !== 'paperView') {
        setPaperViewer(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const selectedCourse = courses.find((course) => course.id === form.course_id);
  const filteredCohorts = useMemo(
    () => cohorts.filter((cohort) => String(cohort.course?.id || cohort.course) === String(form.course_id)),
    [cohorts, form.course_id]
  );
  const filteredTests = useMemo(
    () => moduleTests.filter((test) => String(test.course?.id || test.course) === String(form.course_id)),
    [moduleTests, form.course_id]
  );

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "bank_type") {
        next.difficulty = value === "PRESCREENING" ? "EASY" : "MEDIUM";
        next.cohort_id = "";
        next.module_id = "";
        next.module_test_id = "";
      }
      if (name === "course_id") {
        next.cohort_id = "";
        next.module_id = "";
        next.module_test_id = "";
      }
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusyId("generate");
    try {
      const payload = {
        course_id: form.course_id,
        bank_type: form.bank_type,
        num_sets: Number(form.num_sets),
        questions_per_set: Number(form.questions_per_set),
        difficulty: form.difficulty,
      };
      if (form.title.trim()) payload.title = form.title.trim();
      if (form.bank_type === "MODULE_TEST") {
        payload.cohort_id = form.cohort_id;
        payload.module_id = form.module_id;
        if (form.module_test_id) payload.module_test_id = form.module_test_id;
      }
      const created = await generateQuestionBank(payload);
      setBanks((current) => [created, ...current]);
      setNotice("Generation queued. The bank remains Draft until every question is stored and you click Open.");
    } catch (submitError) {
      setError(errorText(submitError));
    } finally {
      setBusyId("");
    }
  };

  const changeLifecycle = async (bank, action) => {
    setBusyId(bank.id);
    setError("");
    setRowErrors((current) => ({ ...current, [bank.id]: "" }));
    try {
      const updated = action === "open" ? await publishQuestionBank(bank.id) : await closeQuestionBank(bank.id);
      setBanks((current) => current.map((row) => (row.id === bank.id ? updated : row)));
      setNotice(action === "open" ? `${bank.title} is now open for backend assignment.` : `${bank.title} is closed.`);
    } catch (actionError) {
      const message = errorText(actionError);
      setError(message);
      setRowErrors((current) => ({ ...current, [bank.id]: message }));
    } finally {
      setBusyId("");
    }
  };

  const regenerateBank = async (bank) => {
    const confirmed = window.confirm(
      `Regenerate every paper in "${bank.title}" with AI? Existing stored questions will be replaced. The bank remains Draft until generation completes.`
    );
    if (!confirmed) return;

    setBusyId(`regenerate:${bank.id}`);
    setError("");
    setNotice("");
    setRowErrors((current) => ({ ...current, [bank.id]: "" }));
    try {
      const updated = await regenerateQuestionBank(bank.id, {
        num_sets: bank.set_codes?.length || 4,
        questions_per_set: bank.total_questions_per_set,
      });
      setBanks((current) => current.map((row) => (row.id === bank.id ? updated : row)));
      setPaperViewer((current) => current?.bank?.id === bank.id ? null : current);
      setNotice(`${bank.title} is regenerating. Each paper will contain unique questions.`);
    } catch (regenerationError) {
      const message = errorText(regenerationError);
      setError(message);
      setRowErrors((current) => ({ ...current, [bank.id]: message }));
    } finally {
      setBusyId("");
    }
  };

  const viewPaper = async (bank, setCode) => {
    setBusyId(`${bank.id}:${setCode}`);
    setError("");
    try {
      const paper = await getQuestionPaper(bank.id, setCode);
      setPaperViewer((current) => {
        if (!current) {
          window.history.pushState({ modal: 'paperView' }, '');
        }
        return { bank, paper };
      });
    } catch (paperError) {
      setError(errorText(paperError));
    } finally {
      setBusyId("");
    }
  };

  const removeBank = async (bank) => {
    const confirmed = window.confirm(
      `Delete "${bank.title}" permanently? This cannot be undone. Closed banks with no exam history can be deleted.`
    );
    if (!confirmed) return;
    setBusyId(`delete:${bank.id}`);
    setError("");
    setNotice("");
    try {
      await deleteQuestionBank(bank.id);
      setBanks((current) => current.filter((row) => row.id !== bank.id));
      setPaperViewer((current) => current?.bank?.id === bank.id ? null : current);
      setNotice(`${bank.title} was deleted.`);
    } catch (deleteError) {
      setError(errorText(deleteError));
    } finally {
      setBusyId("");
    }
  };

  if (loading) return <div className={styles.page}>Loading question-bank control center…</div>;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>AI Question Banks</h1>
          <p>Generate from course prerequisites or module syllabus, verify, store, then explicitly open A/B/C/D papers.</p>
        </div>
        <span>AI questions</span>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <form className={styles.form} onSubmit={submit}>
        <label>
          Assessment source
          <select name="bank_type" value={form.bank_type} onChange={update}>
            <option value="PRESCREENING">Pre-screening prerequisites</option>
            <option value="MODULE_TEST">Module-test syllabus</option>
          </select>
        </label>
        <label>
          Course
          <select name="course_id" value={form.course_id} onChange={update} required>
            <option value="">Select course</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
          </select>
        </label>

        {form.bank_type === "MODULE_TEST" && (
          <>
            <label>
              Cohort
              <select name="cohort_id" value={form.cohort_id} onChange={update} required>
                <option value="">Select cohort</option>
                {filteredCohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code}</option>)}
              </select>
            </label>
            <label>
              Module syllabus
              <select name="module_id" value={form.module_id} onChange={update} required>
                <option value="">Select module</option>
                {(selectedCourse?.modules || []).map((module) => (
                  <option key={module.id} value={module.id}>Module {module.module_number} · {module.title}</option>
                ))}
              </select>
            </label>
            <label>
              Link module test (optional)
              <select name="module_test_id" value={form.module_test_id} onChange={update}>
                <option value="">Course/module scope only</option>
                {filteredTests.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
              </select>
            </label>
          </>
        )}

        <label>
          Difficulty
          <select name="difficulty" value={form.difficulty} onChange={update}>
            {['EASY', 'MEDIUM', 'HARD', 'MIXED'].map((level) => <option key={level}>{level}</option>)}
          </select>
        </label>
        <label>
          Paper sets
          <input name="num_sets" type="number" min="1" max="10" value={form.num_sets} onChange={update} />
        </label>
        <label>
          Questions per set
          <input name="questions_per_set" type="number" min="5" max="50" value={form.questions_per_set} onChange={update} />
        </label>
        <label className={styles.full}>
          Custom title (optional)
          <input name="title" value={form.title} onChange={update} placeholder="e.g. VLSI prerequisites · August 2026" />
        </label>
        <div className={styles.full}>
          <button disabled={busyId === "generate" || !form.course_id}>
            {busyId === "generate" ? "Queuing generation…" : "Generate and store papers"}
          </button>
        </div>
      </form>
        <section className={styles.tableCard}>
        <div className={styles.sectionTitle}>
          <h2>Stored banks</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <select 
              value={filterCohort} 
              onChange={(e) => setFilterCohort(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "14px", outline: "none" }}
            >
              <option value="ALL">All Cohorts & Prerequisites</option>
              <option value="PRESCREENING">Prerequisites Only (No Cohort)</option>
              {cohorts.map((c) => {
                const courseName = typeof c.course === 'object' ? c.course.name : courses.find(course => course.id === c.course)?.name;
                const label = c.name || `${c.code}${courseName ? ` - ${courseName}` : ''}`;
                return <option key={c.id} value={c.id}>{label}</option>;
              })}
            </select>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "14px", outline: "none" }}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="OPEN">OPEN</option>
              <option value="CLOSED">CLOSED</option>
            </select>
            <button type="button" onClick={() => loadAll().catch((loadError) => setError(errorText(loadError)))}>Refresh</button>
          </div>
        </div>
        <div className={styles.gridContainer}>
          {banks.filter(b => {
            if (filterStatus !== "ALL" && b.lifecycle_status !== filterStatus) return false;
            if (filterCohort === "PRESCREENING" && b.bank_type !== "PRESCREENING") return false;
            if (filterCohort !== "ALL" && filterCohort !== "PRESCREENING" && String(b.cohort) !== String(filterCohort)) return false;
            return true;
          }).map((bank) => (
              <div key={bank.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>{bank.title}</h3>
                    <span className={styles.cardSubtitle}>{bank.difficulty} · {bank.total_questions_per_set} per set</span>
                  </div>
                  <span className={`${styles.status} ${styles[bank.status?.toLowerCase()]}`}>{bank.status}</span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <strong>Scope:</strong>
                    <span>{bank.bank_type === "PRESCREENING" ? "Prerequisites" : `${bank.cohort_code || "—"} · ${bank.module_title || "—"}`}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <strong>Lifecycle:</strong>
                    <span>{bank.lifecycle_status}</span>
                  </div>
                  {bank.error_message && <small className={styles.rowError}>{bank.error_message}</small>}

                  <div className={styles.cardRow} style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", marginTop: "4px" }}>
                    <strong>Paper Sets:</strong>
                    <div className={styles.setButtons}>
                      {(bank.set_codes || []).map((setCode) => (
                        <button
                          key={setCode}
                          type="button"
                          className={styles.setButton}
                          disabled={busyId === `${bank.id}:${setCode}`}
                          onClick={() => viewPaper(bank, setCode)}
                          aria-label={`View paper set ${setCode} for ${bank.title}`}
                        >
                          Set {setCode}
                        </button>
                      ))}
                      {!bank.set_codes?.length && "—"}
                    </div>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  {!!bank.set_codes?.length && (
                    <button
                      type="button"
                      className={styles.viewQuestions}
                      disabled={busyId === `${bank.id}:${bank.set_codes[0]}`}
                      onClick={() => viewPaper(bank, bank.set_codes[0])}
                    >
                      {busyId === `${bank.id}:${bank.set_codes[0]}` ? "Loading…" : "View Questions"}
                    </button>
                  )}
                  {bank.status === "APPROVED" && bank.lifecycle_status !== "OPEN" && (
                    <button type="button" disabled={busyId === bank.id} onClick={() => changeLifecycle(bank, "open")}>Open</button>
                  )}
                  {bank.lifecycle_status === "OPEN" && (
                    <button type="button" className={styles.secondary} disabled={busyId === bank.id} onClick={() => changeLifecycle(bank, "close")}>Close</button>
                  )}
                  {bank.lifecycle_status !== "OPEN" && !["GENERATING", "PROCESSING"].includes(bank.status) && (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busyId === `regenerate:${bank.id}`}
                      onClick={() => regenerateBank(bank)}
                    >
                      {busyId === `regenerate:${bank.id}` ? "Regenerating…" : "Regenerate Unique Papers"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={bank.lifecycle_status === "OPEN" || busyId === `delete:${bank.id}`}
                    onClick={() => removeBank(bank)}
                    title={bank.lifecycle_status === "OPEN" ? "Close this bank before deleting it" : "Delete this question bank"}
                  >
                    {busyId === `delete:${bank.id}` ? "Deleting…" : "Delete"}
                  </button>
                  {rowErrors[bank.id] && <small className={styles.rowError} style={{ width: "100%" }}>{rowErrors[bank.id]}</small>}
                </div>
              </div>
            ))}
          {!banks.filter(b => {
            if (filterStatus !== "ALL" && b.lifecycle_status !== filterStatus) return false;
            if (filterCohort === "PRESCREENING" && b.bank_type !== "PRESCREENING") return false;
            if (filterCohort !== "ALL" && filterCohort !== "PRESCREENING" && String(b.cohort) !== String(filterCohort)) return false;
            return true;
          }).length && <p style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No question banks match this filter.</p>}
        </div>
        </section>

        {paperViewer && (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setPaperViewer(null)}>
            <section
              className={styles.paperModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="paper-viewer-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className={styles.paperHeader}>
                <div>
                  <h2 id="paper-viewer-title">{paperViewer.paper.bank_title} · Set {paperViewer.paper.set_code}</h2>
                  <p>{paperViewer.paper.total_questions} stored questions · {paperViewer.paper.difficulty}</p>
                </div>
                <button type="button" className={styles.secondary} onClick={() => {
                  if (window.history.state?.modal === 'paperView') {
                    window.history.back();
                  } else {
                    setPaperViewer(null);
                  }
                }}>Close preview</button>
              </div>
              <div className={styles.paperTabs} aria-label="Stored paper sets">
                {(paperViewer.bank.set_codes || []).map((setCode) => (
                  <button
                    type="button"
                    key={setCode}
                    className={setCode === paperViewer.paper.set_code ? styles.activeSet : styles.secondary}
                    onClick={() => viewPaper(paperViewer.bank, setCode)}
                  >
                    Set {setCode}
                  </button>
                ))}
              </div>
              <ol className={styles.questionList}>
                {paperViewer.paper.questions.map((question, index) => (
                  <li key={question.id || `${paperViewer.paper.set_code}-${index}`}>
                    <h3>{question.question || question.text}</h3>
                    <ol type="A" className={styles.optionList}>
                      {parseOptions(question.options).map((option, optionIndex) => (
                        <li key={`${index}-${optionIndex}`}>{typeof option === "string" ? option : (option?.text || option?.value || JSON.stringify(option))}</li>
                      ))}
                    </ol>
                    {question.correct && (
                      <div className={styles.answerKey}>
                        Correct answer: <strong>{question.correct}</strong>
                      </div>
                    )}
                    {question.explanation && <p className={styles.explanation}>{question.explanation}</p>}
                    <small>{question.marks || 1} mark{Number(question.marks || 1) === 1 ? "" : "s"}</small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
      );
}

      export default QuestionBanks;
