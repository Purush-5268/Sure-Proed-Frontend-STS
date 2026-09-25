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
  importPresetQuestionBanks,
  uploadQuestionBankExcel,
  createManualQuestionBank,
} from "../../services/examService";
import * as XLSX from "xlsx";
import {
  FiPlus,
  FiUpload,
  FiDownload,
  FiDatabase,
  FiTrash2,
  FiImage,
  FiFileText,
  FiBookOpen,
  FiSave,
  FiLayers,
  FiTarget,
} from "react-icons/fi";
import { downloadQuestionBankTemplate } from "../../utils/questionBankTemplate";
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
  const [filterCourse, setFilterCourse] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCohort, setFilterCohort] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL"); // "ALL" | "PRESCREENING" | "MODULE_TEST"

  const prescreeningCount = useMemo(
    () => banks.filter((b) => b.bank_type === "PRESCREENING").length,
    [banks]
  );
  const moduleTestCount = useMemo(
    () => banks.filter((b) => b.bank_type === "MODULE_TEST").length,
    [banks]
  );
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadForm, setUploadForm] = useState({
    course_id: "",
    bank_type: "PRESCREENING",
    difficulty: "EASY",
    title: "",
    file: null,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    course_id: "",
    bank_type: "PRESCREENING",
    difficulty: "EASY",
    title: "",
    questions: [
      {
        question: "",
        image: "",
        type: "text",
        options: ["", "", "", ""],
        correctOption: 0,
        explanation: "",
      },
    ],
  });

  const handleAddQuestion = () => {
    setCreateForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          question: "",
          image: "",
          type: "text",
          options: ["", "", "", ""],
          correctOption: 0,
          explanation: "",
        },
      ],
    }));
  };

  const handleRemoveQuestion = (qIndex) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, idx) => idx !== qIndex),
    }));
  };

  const handleQuestionTextChange = (qIndex, text) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) => (idx === qIndex ? { ...q, question: text } : q)),
    }));
  };

  const handleOptionChange = (qIndex, optIndex, value) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) => {
        if (idx !== qIndex) return q;
        const newOpts = [...q.options];
        newOpts[optIndex] = value;
        return { ...q, options: newOpts };
      }),
    }));
  };

  const handleCorrectOptionChange = (qIndex, optIndex) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) => (idx === qIndex ? { ...q, correctOption: optIndex } : q)),
    }));
  };

  const handleExplanationChange = (qIndex, explanation) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) => (idx === qIndex ? { ...q, explanation } : q)),
    }));
  };

  const handleQuestionTypeToggle = (qIndex, newType) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) => (idx === qIndex ? { ...q, type: newType } : q)),
    }));
  };

  const handleImageUpload = (qIndex, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCreateForm((prev) => ({
        ...prev,
        questions: prev.questions.map((q, idx) => (idx === qIndex ? { ...q, image: reader.result } : q)),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleImageUrlChange = (qIndex, url) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) => (idx === qIndex ? { ...q, image: url } : q)),
    }));
  };

  const handleCreateManualBank = async (e) => {
    e.preventDefault();
    if (!createForm.course_id) {
      setCreateError("Please select a target course.");
      return;
    }
    for (let i = 0; i < createForm.questions.length; i++) {
      const q = createForm.questions[i];
      if (!q.question.trim() && !q.image) {
        setCreateError(`Question ${i + 1} must have either question text or an image diagram.`);
        return;
      }
      const filledOptions = q.options.filter((o) => o.trim() !== "");
      if (filledOptions.length < 2) {
        setCreateError(`Question ${i + 1} must have at least 2 options.`);
        return;
      }
      if (!q.options[q.correctOption] || !q.options[q.correctOption].trim()) {
        setCreateError(`Please enter text for the marked correct answer in Question ${i + 1}.`);
        return;
      }
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      const payload = {
        course_id: createForm.course_id,
        bank_type: createForm.bank_type,
        difficulty: createForm.difficulty,
        title: createForm.title.trim() || undefined,
        questions: createForm.questions.map((q) => ({
          question: q.question.trim() || (q.image ? "Refer to the image diagram below." : ""),
          text: q.question.trim(),
          image: q.image || "",
          type: q.type || (q.image ? "image" : "text"),
          options: q.options.filter((o) => o.trim() !== ""),
          correct: q.options[q.correctOption].trim(),
          explanation: q.explanation.trim(),
        })),
      };
      const res = await createManualQuestionBank(payload);
      setShowCreateModal(false);
      setCreateForm({
        course_id: "",
        bank_type: "PRESCREENING",
        difficulty: "EASY",
        title: "",
        questions: [
          {
            question: "",
            options: ["", "", "", ""],
            correctOption: 0,
            explanation: "",
          },
        ],
      });
      setNotice(res.message || "Question bank created successfully!");
      await loadAll();
    } catch (err) {
      setCreateError(errorText(err));
    } finally {
      setCreateLoading(false);
    }
  };
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

  const handleImportPresets = async () => {
    const confirmed = window.confirm(
      "Import / sync all curated question banks from the preset library (Questions/AnswerOfAllQus.json)? Existing questions will be refreshed."
    );
    if (!confirmed) return;
    setBusyId("import_presets");
    setError("");
    setNotice("");
    try {
      const res = await importPresetQuestionBanks();
      setNotice(res.message || "Preset question banks imported successfully!");
      await loadAll();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyId("");
    }
  };

  const handleDownloadSampleExcel = () => {
    downloadQuestionBankTemplate();
  };

  const handleExcelUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      setUploadError("Please choose an Excel (.xlsx) file.");
      return;
    }
    if (!uploadForm.course_id) {
      setUploadError("Please select a target course.");
      return;
    }
    setUploadLoading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", uploadForm.file);
      fd.append("course_id", uploadForm.course_id);
      fd.append("bank_type", uploadForm.bank_type);
      fd.append("difficulty", uploadForm.difficulty);
      if (uploadForm.title.trim()) {
        fd.append("title", uploadForm.title.trim());
      }
      const res = await uploadQuestionBankExcel(fd);
      setShowUploadModal(false);
      setUploadForm({
        course_id: "",
        bank_type: "PRESCREENING",
        difficulty: "EASY",
        title: "",
        file: null,
      });
      setNotice(res.message || "Excel Question Bank uploaded and stored successfully!");
      await loadAll();
    } catch (err) {
      setUploadError(errorText(err));
    } finally {
      setUploadLoading(false);
    }
  };

  const loadAll = useCallback(async () => {
    const [bankRows, allCourses, allCohorts, allTests] = await Promise.all([
      fetchAllPages(`${API_ENDPOINTS.QUESTION_BANKS.BASE}?page_size=200`),
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
          <h1>Question Banks Management</h1>
          <p>Generate with AI, import from preset course library, or upload questions directly from Excel spreadsheets.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", backgroundColor: "#2563eb", color: "#fff", fontWeight: "700", fontSize: "13px", borderRadius: "7px", border: "none", cursor: "pointer", boxShadow: "0 2px 4px rgba(37,99,235,0.2)" }}
          >
            <FiPlus /> Create Question Bank
          </button>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", backgroundColor: "#059669", color: "#fff", fontWeight: "600", fontSize: "13px", borderRadius: "7px", border: "none", cursor: "pointer" }}
          >
            <FiUpload /> Upload Excel (.xlsx)
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={busyId === "import_presets"}
            onClick={handleImportPresets}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontWeight: "600", fontSize: "13px" }}
          >
            <FiDatabase /> {busyId === "import_presets" ? "Importing Presets…" : "Import Preset Library"}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={downloadQuestionBankTemplate}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}
            title="Download standardized Question Bank Excel template (.xlsx) with sample questions"
          >
            <FiDownload /> Download Template (.xlsx)
          </button>
          <span>Manual + AI</span>
        </div>
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
            {courses.slice().sort((a,b) => (a.name || a.title || a.code || "").localeCompare(b.name || b.title || b.code || "")).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
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
              value={filterCourse} 
              onChange={(e) => {
                setFilterCourse(e.target.value);
                setFilterCohort("ALL");
              }}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "14px", outline: "none" }}
            >
              <option value="ALL">All Courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            <select 
              value={filterCohort} 
              onChange={(e) => setFilterCohort(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "14px", outline: "none" }}
            >
              <option value="ALL">All Cohorts & Prerequisites</option>
              <option value="PRESCREENING">Prerequisites Only (No Cohort)</option>
              {cohorts
                .filter((c) => {
                  if (filterCourse === "ALL") return true;
                  const cCourseId = typeof c.course === 'object' ? c.course?.id : c.course;
                  return String(cCourseId) === String(filterCourse);
                })
                .sort((a, b) => (a.name || a.code || a.title || "").localeCompare(b.name || b.code || b.title || ""))
                .map((c) => {
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

        {/* Question Bank Type Segmented Tabs */}
        <div style={{ display: "flex", gap: "10px", margin: "16px 0 20px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setFilterType("ALL")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
              border: filterType === "ALL" ? "2px solid var(--primary-color)" : "1px solid var(--border-color)",
              backgroundColor: filterType === "ALL" ? "rgba(99, 102, 241, 0.12)" : "var(--bg-surface)",
              color: filterType === "ALL" ? "var(--primary-color)" : "var(--text-secondary)",
            }}
          >
            <FiLayers style={{ marginRight: "6px" }} /> All Question Banks ({banks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("PRESCREENING")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
              border: filterType === "PRESCREENING" ? "2px solid #2563eb" : "1px solid var(--border-color)",
              backgroundColor: filterType === "PRESCREENING" ? "rgba(37, 99, 235, 0.12)" : "var(--bg-surface)",
              color: filterType === "PRESCREENING" ? "#2563eb" : "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <FiTarget style={{ marginRight: "6px" }} /> Pre-Screening Exams ({prescreeningCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("MODULE_TEST")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
              border: filterType === "MODULE_TEST" ? "2px solid #7c3aed" : "1px solid var(--border-color)",
              backgroundColor: filterType === "MODULE_TEST" ? "rgba(124, 58, 237, 0.12)" : "var(--bg-surface)",
              color: filterType === "MODULE_TEST" ? "#7c3aed" : "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <FiFileText style={{ marginRight: "6px" }} /> Module Tests ({moduleTestCount})
          </button>
        </div>

        <div className={styles.gridContainer}>
          {banks.filter(b => {
            if (filterType !== "ALL" && b.bank_type !== filterType) return false;
            if (filterStatus !== "ALL" && b.lifecycle_status !== filterStatus) return false;
            if (filterCourse !== "ALL") {
              const bCourseId = typeof b.course === 'object' ? b.course?.id : b.course;
              if (String(bCourseId) !== String(filterCourse)) return false;
            }
            if (filterCohort === "PRESCREENING" && b.bank_type !== "PRESCREENING") return false;
            if (filterCohort !== "ALL" && filterCohort !== "PRESCREENING" && String(b.cohort) !== String(filterCohort)) return false;
            return true;
          }).map((bank) => (
              <div key={bank.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          letterSpacing: "0.5px",
                          padding: "2px 7px",
                          borderRadius: "4px",
                          backgroundColor:
                            bank.bank_type === "PRESCREENING"
                              ? "rgba(37, 99, 235, 0.12)"
                              : "rgba(124, 58, 237, 0.12)",
                          color: bank.bank_type === "PRESCREENING" ? "#2563eb" : "#7c3aed",
                          border: `1px solid ${
                            bank.bank_type === "PRESCREENING"
                              ? "rgba(37, 99, 235, 0.25)"
                              : "rgba(124, 58, 237, 0.25)"
                          }`,
                        }}
                      >
                        {bank.bank_type === "PRESCREENING" ? "PRE-SCREENING" : "MODULE TEST"}
                      </span>
                      {(() => {
                        const courseId = typeof bank.course === 'object' ? bank.course?.id : bank.course;
                        const courseObj = courses.find((c) => String(c.id) === String(courseId));
                        const cName = courseObj?.name || (typeof bank.course === 'object' ? bank.course?.name : bank.course_name);
                        return cName ? (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "600",
                              padding: "2px 7px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(16, 185, 129, 0.12)",
                              color: "#059669",
                              border: "1px solid rgba(16, 185, 129, 0.25)",
                              maxWidth: "200px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={cName}
                          >
                            <FiBookOpen style={{ marginRight: "3px" }} /> {cName}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <h3 className={styles.cardTitle}>{bank.title}</h3>
                    <span className={styles.cardSubtitle}>{bank.difficulty} · {bank.total_questions_per_set} per set</span>
                  </div>
                  <span className={`${styles.status} ${styles[bank.status?.toLowerCase()]}`}>{bank.status}</span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <strong>Course:</strong>
                    <span>
                      {(() => {
                        const courseId = typeof bank.course === 'object' ? bank.course?.id : bank.course;
                        const courseObj = courses.find((c) => String(c.id) === String(courseId));
                        return courseObj?.name || (typeof bank.course === 'object' ? bank.course?.name : bank.course_name) || "—";
                      })()}
                    </span>
                  </div>
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
            if (filterType !== "ALL" && b.bank_type !== filterType) return false;
            if (filterStatus !== "ALL" && b.lifecycle_status !== filterStatus) return false;
            if (filterCohort === "PRESCREENING" && b.bank_type !== "PRESCREENING") return false;
            if (filterCohort !== "ALL" && filterCohort !== "PRESCREENING" && String(b.cohort) !== String(filterCohort)) return false;
            return true;
          }).length && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", gridColumn: "1 / -1", border: "1px dashed var(--border-color)", borderRadius: "12px", background: "var(--bg-nested)" }}>
              <p style={{ margin: 0, fontSize: "15px", fontWeight: "600", color: "var(--text-primary)" }}>No question banks match the selected category or filters.</p>
              <p style={{ margin: "6px 0 0", fontSize: "13px" }}>Try selecting &quot;All Question Banks&quot; or resetting the cohort filter.</p>
            </div>
          )}
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
                    {question.image && (
                      <div style={{ margin: "10px 0", maxWidth: "100%", overflow: "hidden", borderRadius: "8px" }}>
                        <img
                          src={question.image}
                          alt={`Question ${index + 1} diagram`}
                          style={{ maxHeight: "280px", maxWidth: "100%", objectFit: "contain", borderRadius: "6px", border: "1px solid var(--border-color)" }}
                        />
                      </div>
                    )}
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

        {showUploadModal && (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setShowUploadModal(false)}>
            <section
              className={styles.paperModal}
              style={{ maxWidth: "600px" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="upload-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className={styles.paperHeader}>
                <div>
                  <h2 id="upload-modal-title">Upload Question Bank (.xlsx)</h2>
                  <p>Import questions from an Excel spreadsheet directly into a ready-to-use Question Bank.</p>
                </div>
                <button type="button" className={styles.secondary} onClick={() => setShowUploadModal(false)}>
                  Close
                </button>
              </div>

              {uploadError && <div className={styles.error} style={{ marginBottom: "16px" }}>{uploadError}</div>}

              <form onSubmit={handleExcelUpload} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg-surface)", borderRadius: "8px", border: "1px dashed var(--border-color)", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Need standard format template?</span>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={handleDownloadSampleExcel}
                    style={{ fontSize: "12px", padding: "5px 12px", cursor: "pointer" }}
                  >
                    ⬇️ Download Sample Template (.xlsx)
                  </button>
                </div>

                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                  Target Course *
                  <select
                    value={uploadForm.course_id}
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, course_id: e.target.value }))}
                    required
                    style={{ padding: "9px 10px", borderRadius: "7px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                  >
                    <option value="">Select target course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Assessment Source
                    <select
                      value={uploadForm.bank_type}
                      onChange={(e) => setUploadForm((prev) => ({ ...prev, bank_type: e.target.value }))}
                      style={{ padding: "9px 10px", borderRadius: "7px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                    >
                      <option value="PRESCREENING">Pre-screening prerequisites</option>
                      <option value="MODULE_TEST">Module-test syllabus</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Difficulty
                    <select
                      value={uploadForm.difficulty}
                      onChange={(e) => setUploadForm((prev) => ({ ...prev, difficulty: e.target.value }))}
                      style={{ padding: "9px 10px", borderRadius: "7px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                      <option value="MIXED">MIXED</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                  Bank Title (Optional)
                  <input
                    type="text"
                    placeholder="e.g. Python Full Stack Prescreening Questions"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, title: e.target.value }))}
                    style={{ padding: "9px 10px", borderRadius: "7px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                  Choose Excel Spreadsheet (.xlsx) *
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                    required
                    style={{ padding: "9px 10px", borderRadius: "7px", border: "1px solid var(--border-color)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setShowUploadModal(false)}
                    disabled={uploadLoading}
                    style={{ padding: "8px 16px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadLoading || !uploadForm.course_id || !uploadForm.file}
                    style={{ backgroundColor: "#059669", color: "white", padding: "8px 20px", borderRadius: "7px", border: "none", fontWeight: "600", cursor: "pointer" }}
                  >
                    {uploadLoading ? "Uploading & Processing…" : "Upload & Create Bank"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {showCreateModal && (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setShowCreateModal(false)}>
            <section
              className={styles.paperModal}
              style={{ maxWidth: "820px", maxHeight: "92vh", overflowY: "auto" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className={styles.paperHeader}>
                <div>
                  <h2 id="create-modal-title">Create Question Bank (Manual Entry)</h2>
                  <p>Add questions, enter options, and select the correct answer for each question.</p>
                </div>
                <button type="button" className={styles.secondary} onClick={() => setShowCreateModal(false)}>
                  Close
                </button>
              </div>

              {createError && <div className={styles.error} style={{ marginBottom: "16px" }}>{createError}</div>}

              <form onSubmit={handleCreateManualBank} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", padding: "16px", background: "var(--bg-surface)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Target Course *
                    <select
                      value={createForm.course_id}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, course_id: e.target.value }))}
                      required
                      style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-nested)", color: "var(--text-primary)" }}
                    >
                      <option value="">Select target course</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Assessment Source
                    <select
                      value={createForm.bank_type}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, bank_type: e.target.value }))}
                      style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-nested)", color: "var(--text-primary)" }}
                    >
                      <option value="PRESCREENING">Pre-screening prerequisites</option>
                      <option value="MODULE_TEST">Module-test syllabus</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Difficulty
                    <select
                      value={createForm.difficulty}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, difficulty: e.target.value }))}
                      style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-nested)", color: "var(--text-primary)" }}
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                      <option value="MIXED">MIXED</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                    Bank Title (Optional)
                    <input
                      type="text"
                      placeholder="e.g. Python Core Fundamentals"
                      value={createForm.title}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                      style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-nested)", color: "var(--text-primary)" }}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "10px" }}>
                  {createForm.questions.map((q, qIndex) => (
                    <div
                      key={qIndex}
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: "10px",
                        padding: "16px",
                        backgroundColor: "var(--bg-surface)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ fontWeight: "700", fontSize: "14px", color: "var(--primary-color)" }}>
                            Question {qIndex + 1}
                          </span>
                          {/* Question Type Toggle */}
                          <div style={{ display: "inline-flex", background: "var(--bg-nested)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                            <button
                              type="button"
                              onClick={() => handleQuestionTypeToggle(qIndex, "text")}
                              style={{
                                padding: "3px 10px",
                                fontSize: "12px",
                                fontWeight: "600",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                background: (q.type || "text") === "text" ? "#2563eb" : "transparent",
                                color: (q.type || "text") === "text" ? "#ffffff" : "var(--text-secondary)",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <FiFileText style={{ marginRight: "3px" }} /> Text Question
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuestionTypeToggle(qIndex, "image")}
                              style={{
                                padding: "3px 10px",
                                fontSize: "12px",
                                fontWeight: "600",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                background: (q.type || "text") === "image" ? "#2563eb" : "transparent",
                                color: (q.type || "text") === "image" ? "#ffffff" : "var(--text-secondary)",
                                transition: "all 0.15s ease",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                            >
                              <FiImage style={{ marginRight: "3px" }} /> Image / Diagram
                            </button>
                          </div>
                        </div>

                        {createForm.questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(qIndex)}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              color: "#ef4444",
                              borderRadius: "6px",
                              padding: "4px 10px",
                              fontSize: "12px",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <FiTrash2 /> Delete Question
                          </button>
                        )}
                      </div>

                      {/* Image / Diagram Attachment Section */}
                      {(q.type === "image" || q.image) && (
                        <div
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            backgroundColor: "var(--bg-nested)",
                            border: "1px dashed var(--primary-color)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--primary-color)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <FiImage /> Question Diagram / Image Attachment
                            </span>
                            {q.image && (
                              <button
                                type="button"
                                onClick={() => handleImageUrlChange(qIndex, "")}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#ef4444",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  fontWeight: "600",
                                }}
                              >
                                ✕ Remove Image
                              </button>
                            )}
                          </div>

                          {/* Image preview */}
                          {q.image && (
                            <div style={{ textAlign: "center", padding: "8px", background: "var(--bg-surface)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                              <img
                                src={q.image}
                                alt={`Question ${qIndex + 1} Preview`}
                                style={{ maxHeight: "200px", maxWidth: "100%", objectFit: "contain", borderRadius: "4px" }}
                              />
                            </div>
                          )}

                          {/* Image upload and URL inputs */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", alignItems: "center" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "var(--text-secondary)" }}>
                                Upload Diagram File (PNG, JPG, SVG, WebP):
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload(qIndex, file);
                                }}
                                style={{
                                  fontSize: "12px",
                                  color: "var(--text-primary)",
                                  width: "100%",
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "var(--text-secondary)" }}>
                                Or Paste Image URL / Base64:
                              </label>
                              <input
                                type="text"
                                placeholder="https://... or data:image/..."
                                value={q.image?.startsWith("data:") ? "(Uploaded local diagram)" : (q.image || "")}
                                onChange={(e) => handleImageUrlChange(qIndex, e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-color)",
                                  background: "var(--bg-surface)",
                                  color: "var(--text-primary)",
                                  fontSize: "12px",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600" }}>
                        <span>Question Text {q.image ? "(Optional if question is in the diagram)" : "*"}</span>
                        <textarea
                          rows={2}
                          placeholder={q.image ? "Optional prompt (e.g. 'What is the output voltage for the circuit shown above?')..." : `Enter question ${qIndex + 1} here...`}
                          value={q.question}
                          onChange={(e) => handleQuestionTextChange(qIndex, e.target.value)}
                          required={!q.image}
                          style={{
                            padding: "9px 10px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-nested)",
                            color: "var(--text-primary)",
                            fontFamily: "inherit",
                            resize: "vertical",
                          }}
                        />
                      </label>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>
                          Options & Correct Answer (select radio button for correct option):
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          {q.options.map((opt, optIndex) => {
                            const isCorrect = q.correctOption === optIndex;
                            const letter = String.fromCharCode(65 + optIndex);
                            return (
                              <div
                                key={optIndex}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  border: isCorrect ? "2px solid #22c55e" : "1px solid var(--border-color)",
                                  backgroundColor: isCorrect ? "rgba(34, 197, 94, 0.08)" : "var(--bg-nested)",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`correct_${qIndex}`}
                                  id={`q_${qIndex}_opt_${optIndex}`}
                                  checked={isCorrect}
                                  onChange={() => handleCorrectOptionChange(qIndex, optIndex)}
                                  style={{ cursor: "pointer" }}
                                />
                                <label
                                  htmlFor={`q_${qIndex}_opt_${optIndex}`}
                                  style={{
                                    fontWeight: "700",
                                    fontSize: "12px",
                                    color: isCorrect ? "#16a34a" : "var(--text-secondary)",
                                    cursor: "pointer",
                                    minWidth: "16px",
                                  }}
                                >
                                  {letter}
                                </label>
                                <input
                                  type="text"
                                  placeholder={`Option ${letter}`}
                                  value={opt}
                                  onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
                                  required
                                  style={{
                                    flex: 1,
                                    padding: "6px 8px",
                                    borderRadius: "4px",
                                    border: "1px solid var(--border-color)",
                                    background: "var(--bg-surface)",
                                    color: "var(--text-primary)",
                                    fontSize: "13px",
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        Explanation / Notes (Optional)
                        <input
                          type="text"
                          placeholder="Optional explanation for the correct answer..."
                          value={q.explanation}
                          onChange={(e) => handleExplanationChange(qIndex, e.target.value)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-nested)",
                            color: "var(--text-primary)",
                            fontSize: "12px",
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "2px dashed var(--primary-color)",
                      backgroundColor: "rgba(37, 99, 235, 0.05)",
                      color: "var(--primary-color)",
                      fontWeight: "700",
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <FiPlus /> Add Another Question ({createForm.questions.length + 1})
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "12px",
                    paddingTop: "14px",
                    borderTop: "1px solid var(--border-color)",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    Total Questions: <strong>{createForm.questions.length}</strong>
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setShowCreateModal(false)}
                      disabled={createLoading}
                      style={{ padding: "8px 16px" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createLoading || !createForm.course_id}
                      style={{
                        backgroundColor: "#2563eb",
                        color: "#fff",
                        padding: "8px 22px",
                        borderRadius: "7px",
                        border: "none",
                        fontWeight: "700",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {createLoading ? "Saving Bank…" : <><FiSave /> Save & Open Question Bank</>}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
      );
}

      export default QuestionBanks;
