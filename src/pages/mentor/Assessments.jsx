import React, { useEffect, useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Assessments.module.css";
import {
  FiList,
  FiCalendar,
  FiClock,
  FiCheckSquare,
  FiAlertCircle,
  FiArrowLeft,
  FiSearch,
  FiX,
  FiDownload,
  FiUsers,
  FiAward,
  FiCheck,
  FiXCircle,
  FiExternalLink,
  FiChevronRight,
  FiBarChart2,
  FiBookOpen,
} from "react-icons/fi";

function MentorAssessments() {
  const { globalCohort, cohorts: layoutCohorts } = useOutletContext() || {};
  const [selectedCohort, setSelectedCohort] = useState(globalCohort || "");
  const [allCohorts, setAllCohorts] = useState([]);
  
  // Tests state
  const [tests, setTests] = useState([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, CONDUCTED, SCHEDULED
  const [searchQuery, setSearchQuery] = useState("");

  // Drilldown test selection
  const [selectedTest, setSelectedTest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [resultsFilter, setResultsFilter] = useState("ALL"); // ALL, PASSED, FAILED, NOT_ATTEMPTED

  // Sync selectedCohort from globalCohort
  useEffect(() => {
    if (globalCohort !== undefined) {
      setSelectedCohort(globalCohort || "");
      setSelectedTest(null); // return to tests list on cohort switch
    }
  }, [globalCohort]);

  // Fetch mentor cohorts
  useEffect(() => {
    apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS)
      .then(res => {
        const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
        setAllCohorts(data);
      })
      .catch(err => console.error("Failed to load mentor cohorts", err));
  }, []);

  // Fetch module tests for mentor's cohorts
  useEffect(() => {
    let isMounted = true;
    const fetchTests = async () => {
      setLoadingTests(true);
      try {
        const params = { page_size: 100 };
        if (selectedCohort) params.cohort = selectedCohort;
        const res = await apiClient.get(API_ENDPOINTS.MODULE_TESTS.BASE, { params });
        if (isMounted) {
          const results = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
          setTests(results);
        }
      } catch (err) {
        console.error("Failed to fetch module tests", err);
      } finally {
        if (isMounted) setLoadingTests(false);
      }
    };
    fetchTests();
    return () => { isMounted = false; };
  }, [selectedCohort]);

  // When a test is clicked, fetch its submissions and cohort enrolled students if conducted
  useEffect(() => {
    if (!selectedTest) {
      setSubmissions([]);
      setEnrolledStudents([]);
      setResultsFilter("ALL");
      return;
    }

    const isConducted = checkIsConducted(selectedTest);
    if (!isConducted) {
      setSubmissions([]);
      setEnrolledStudents([]);
      return;
    }

    let isMounted = true;
    const fetchSubmissionsAndStudents = async () => {
      setLoadingSubmissions(true);
      try {
        const params = { test: selectedTest.id, page_size: 200 };
        if (selectedCohort) params.cohort = selectedCohort;
        
        const cohortId = selectedTest.cohort_id || (typeof selectedTest.cohort === 'object' ? selectedTest.cohort?.id : selectedTest.cohort);

        const promises = [
          apiClient.get(API_ENDPOINTS.MODULE_TESTS.SUBMISSIONS, { params })
        ];

        if (cohortId) {
          promises.push(apiClient.get(API_ENDPOINTS.COHORTS.STUDENTS(cohortId)).catch(() => ({ data: [] })));
        }

        const [res, studentsRes] = await Promise.all(promises);

        if (isMounted) {
          const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
          setSubmissions(data);

          if (studentsRes) {
            const sData = Array.isArray(studentsRes.data?.results) ? studentsRes.data.results : (Array.isArray(studentsRes.data) ? studentsRes.data : []);
            setEnrolledStudents(sData);
          }
        }
      } catch (err) {
        console.error("Failed to fetch test submissions", err);
      } finally {
        if (isMounted) setLoadingSubmissions(false);
      }
    };

    fetchSubmissionsAndStudents();
    return () => { isMounted = false; };
  }, [selectedTest, selectedCohort]);

  // Helper to determine if test is conducted
  function checkIsConducted(test) {
    if (!test) return false;
    if (test.is_conducted) return true;
    if (test.submissions_count && test.submissions_count > 0) return true;
    if (test.end_time && new Date() > new Date(test.end_time)) return true;
    return false;
  }

  // Filter tests based on tab and search
  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      const conducted = checkIsConducted(test);
      if (statusFilter === "CONDUCTED" && !conducted) return false;
      if (statusFilter === "SCHEDULED" && conducted) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (test.title || "").toLowerCase().includes(q);
        const moduleMatch = (test.module_name || "").toLowerCase().includes(q);
        const courseMatch = (test.course_name || test.course_code || "").toLowerCase().includes(q);
        const cohortMatch = (test.cohort_code || test.cohort_name || "").toLowerCase().includes(q);
        if (!titleMatch && !moduleMatch && !courseMatch && !cohortMatch) return false;
      }
      return true;
    });
  }, [tests, statusFilter, searchQuery]);

  // Build unified results combining submissions and unattempted enrolled students
  const allResults = useMemo(() => {
    const passPercentage = Number(selectedTest?.pass_percentage || 60);
    const submittedStudentIds = new Set();
    const list = submissions.map(sub => {
      const sId = sub.student || sub.student_id;
      if (sId) submittedStudentIds.add(String(sId));
      const percentage = Number(sub.percentage || 0);
      const isPassed = sub.qualified || percentage >= passPercentage;
      return {
        ...sub,
        statusType: isPassed ? "PASSED" : "FAILED",
        isPassed,
      };
    });

    // Add unattempted students from enrolled students if any
    enrolledStudents.forEach(st => {
      const matchId = String(st.id);
      const matchUserId = String(st.user?.id || st.user || "");
      if (!submittedStudentIds.has(matchId) && !submittedStudentIds.has(matchUserId)) {
        list.push({
          id: `unattempted_${st.id}`,
          student_name: `${st.first_name || ''} ${st.last_name || ''}`.trim() || st.name || st.user?.username || "Student",
          student_email: st.email || st.user?.email || "—",
          student_code: st.student_code || st.code || "—",
          college: st.college || "—",
          marks_obtained: null,
          total_marks: selectedTest?.total_questions ?? 10,
          percentage: null,
          statusType: "NOT_ATTEMPTED",
          isPassed: false,
          submitted_at: null,
        });
      }
    });

    return list;
  }, [submissions, enrolledStudents, selectedTest]);

  // Filter results by student search and filter tab (ALL, PASSED, FAILED, NOT_ATTEMPTED)
  const filteredResults = useMemo(() => {
    return allResults.filter(item => {
      if (resultsFilter === "PASSED" && item.statusType !== "PASSED") return false;
      if (resultsFilter === "FAILED" && item.statusType !== "FAILED") return false;
      if (resultsFilter === "NOT_ATTEMPTED" && item.statusType !== "NOT_ATTEMPTED") return false;

      if (!submissionSearch.trim()) return true;
      const q = submissionSearch.toLowerCase().trim();
      const name = (item.student_name || "").toLowerCase();
      const email = (item.student_email || "").toLowerCase();
      const code = (item.student_code || "").toLowerCase();
      const college = (item.college || "").toLowerCase();
      return name.includes(q) || email.includes(q) || code.includes(q) || college.includes(q);
    });
  }, [allResults, resultsFilter, submissionSearch]);

  // Computed summary metrics for the selected test
  const testMetrics = useMemo(() => {
    const total = allResults.length;
    if (total === 0) return { total: 0, passed: 0, failed: 0, notAttempted: 0, avgScore: 0, passRate: 0 };
    const passed = allResults.filter(s => s.statusType === "PASSED").length;
    const failed = allResults.filter(s => s.statusType === "FAILED").length;
    const notAttempted = allResults.filter(s => s.statusType === "NOT_ATTEMPTED").length;
    const submittedItems = allResults.filter(s => s.statusType !== "NOT_ATTEMPTED");
    const totalScore = submittedItems.reduce((acc, s) => acc + Number(s.percentage || 0), 0);
    const avgScore = submittedItems.length > 0 ? Math.round(totalScore / submittedItems.length) : 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { total, passed, failed, notAttempted, avgScore, passRate };
  }, [allResults]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredResults || filteredResults.length === 0 || !selectedTest) return;
    const headers = [
      "Student Name",
      "Student Code",
      "Email",
      "College",
      "Marks Obtained",
      "Total Marks",
      "Percentage",
      "Result Status",
      "Submitted At"
    ];

    const rows = filteredResults.map(item => [
      `"${item.student_name || "Candidate"}"`,
      `"${item.student_code || ""}"`,
      `"${item.student_email || ""}"`,
      `"${item.college || ""}"`,
      item.marks_obtained !== null && item.marks_obtained !== undefined ? item.marks_obtained : "N/A",
      item.total_marks ?? selectedTest.total_questions ?? 10,
      item.percentage !== null && item.percentage !== undefined ? `${item.percentage}%` : "N/A",
      `"${item.statusType === 'PASSED' ? 'Passed' : item.statusType === 'FAILED' ? 'Failed' : 'Not Attempted'}"`,
      `"${item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "Not Attempted"}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const safeTitle = (selectedTest.title || "Module_Test").replace(/[^a-zA-Z0-9_-]/g, "_");
    link.setAttribute("download", `${safeTitle}_Student_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="Exams & Module Tests"
        description="Monitor module tests conducted in your cohorts and review complete student marks reports."
      />

      {/* Primary view or Drill-down view */}
      {selectedTest ? (
        /* ================= DRILLDOWN VIEW ================= */
        <div className={styles.drilldownContainer}>
          <button className={styles.backBtn} onClick={() => setSelectedTest(null)}>
            <FiArrowLeft /> Back to All Tests
          </button>

          <div className={styles.drilldownHeaderCard}>
            <div className={styles.headerMain}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span className={styles.moduleBadge}>
                  {selectedTest.module_name || `Module Test`}
                </span>
                {checkIsConducted(selectedTest) ? (
                  <Badge variant="success">Conducted</Badge>
                ) : (
                  <Badge variant="warning">Scheduled</Badge>
                )}
              </div>
              <h1 className={styles.drilldownTitle}>{selectedTest.title}</h1>
              <div className={styles.drilldownMeta}>
                <span><strong>Course:</strong> {selectedTest.course_name || selectedTest.course_code || "Course"}</span>
                <span>•</span>
                <span><strong>Cohort:</strong> {selectedTest.cohort_code || selectedTest.cohort_name || "Assigned Cohort"}</span>
                <span>•</span>
                <span><strong>Pass Criteria:</strong> {selectedTest.pass_percentage}% minimum</span>
                <span>•</span>
                <span><strong>Duration:</strong> {selectedTest.duration_minutes} mins</span>
              </div>
            </div>

            {checkIsConducted(selectedTest) && submissions.length > 0 && (
              <button className={styles.exportBtn} onClick={handleExportCSV}>
                <FiDownload /> Export Marks (CSV)
              </button>
            )}
          </div>

          {/* Conditional Drilldown content: SCHEDULED vs CONDUCTED */}
          {!checkIsConducted(selectedTest) ? (
            /* Scheduled / Not Conducted Yet */
            <div className={styles.scheduledBanner}>
              <div className={styles.scheduledIconCircle}>
                <FiClock />
              </div>
              <h3 className={styles.scheduledHeadline}>
                Assessment Scheduled — Marks will be awarded once test is completed
              </h3>
              <p className={styles.scheduledSubtext}>
                This module test is scheduled and has not been conducted yet. Student scores and marks reports will automatically appear here once students submit their exams.
              </p>

              <div className={styles.scheduledDetailsCard}>
                <div className={styles.detailBox}>
                  <span className={styles.detailLabel}>Scheduled Window</span>
                  <span className={styles.detailValue}>
                    {selectedTest.scheduled_at
                      ? new Date(selectedTest.scheduled_at).toLocaleString()
                      : "Not Scheduled Yet"}
                  </span>
                </div>
                <div className={styles.detailBox}>
                  <span className={styles.detailLabel}>Duration</span>
                  <span className={styles.detailValue}>
                    {selectedTest.duration_minutes ? `${selectedTest.duration_minutes} Minutes` : "—"}
                  </span>
                </div>
                <div className={styles.detailBox}>
                  <span className={styles.detailLabel}>Questions</span>
                  <span className={styles.detailValue}>
                    {selectedTest.total_questions || 10} Questions
                  </span>
                </div>
                <div className={styles.detailBox}>
                  <span className={styles.detailLabel}>Pass Requirement</span>
                  <span className={styles.detailValue}>
                    {selectedTest.pass_percentage}% Score
                  </span>
                </div>
                {selectedTest.meeting_link && (
                  <div className={styles.detailBox} style={{ gridColumn: "1 / -1" }}>
                    <span className={styles.detailLabel}>Meeting Link</span>
                    <a
                      href={selectedTest.meeting_link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--primary-color)", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      Open Google Meet Session <FiExternalLink />
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Conducted: Show Full Marks Report */
            <>
              {/* Summary Metrics */}
              <div className={styles.metricsRow}>
                <div className={styles.metricCard}>
                  <div className={styles.metricIcon} style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
                    <FiUsers />
                  </div>
                  <div className={styles.metricInfo}>
                    <span className={styles.metricValue}>{testMetrics.total}</span>
                    <span className={styles.metricLabel}>Appeared / Submissions</span>
                  </div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricIcon} style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>
                    <FiCheck />
                  </div>
                  <div className={styles.metricInfo}>
                    <span className={styles.metricValue}>{testMetrics.passed}</span>
                    <span className={styles.metricLabel}>Passed Students</span>
                  </div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricIcon} style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444" }}>
                    <FiXCircle />
                  </div>
                  <div className={styles.metricInfo}>
                    <span className={styles.metricValue}>{testMetrics.failed}</span>
                    <span className={styles.metricLabel}>Failed Students</span>
                  </div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricIcon} style={{ background: "rgba(139, 92, 246, 0.12)", color: "#8b5cf6" }}>
                    <FiAward />
                  </div>
                  <div className={styles.metricInfo}>
                    <span className={styles.metricValue}>{testMetrics.passRate}%</span>
                    <span className={styles.metricLabel}>Pass Rate (Avg: {testMetrics.avgScore}%)</span>
                  </div>
                </div>
              </div>

              {/* Student Marks Table Card */}
              <div className={styles.marksCard}>
                <div className={styles.marksHeader}>
                  <div className={styles.marksHeaderLeft}>
                    <h3 className={styles.marksTitle}>Student Results Roster</h3>
                    <span style={{ fontSize: "12px", background: "var(--bg-nested)", padding: "4px 8px", borderRadius: "12px", border: "1px solid var(--border-color)", fontWeight: "600", color: "var(--text-secondary)" }}>
                      {filteredResults.length} of {allResults.length} Students
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className={styles.exportBtn}
                      title="Download results as CSV"
                    >
                      <FiDownload /> Download CSV
                    </button>
                  </div>

                  {/* Results Filter Tabs */}
                  <div className={styles.resultFilterTabs}>
                    <button
                      type="button"
                      className={`${styles.resultTabBtn} ${resultsFilter === "ALL" ? styles.activeResultTab : ""}`}
                      onClick={() => setResultsFilter("ALL")}
                    >
                      All ({allResults.length})
                    </button>
                    <button
                      type="button"
                      className={`${styles.resultTabBtn} ${resultsFilter === "PASSED" ? styles.activeResultTab : ""}`}
                      onClick={() => setResultsFilter("PASSED")}
                    >
                      Passed ({testMetrics.passed})
                    </button>
                    <button
                      type="button"
                      className={`${styles.resultTabBtn} ${resultsFilter === "FAILED" ? styles.activeResultTab : ""}`}
                      onClick={() => setResultsFilter("FAILED")}
                    >
                      Failed ({testMetrics.failed})
                    </button>
                    <button
                      type="button"
                      className={`${styles.resultTabBtn} ${resultsFilter === "NOT_ATTEMPTED" ? styles.activeResultTab : ""}`}
                      onClick={() => setResultsFilter("NOT_ATTEMPTED")}
                    >
                      Not Attempted ({testMetrics.notAttempted})
                    </button>
                  </div>

                  <div className={styles.searchWrapper}>
                    <FiSearch className={styles.searchIcon} />
                    <input
                      type="text"
                      placeholder="Search candidate name, code, email..."
                      value={submissionSearch}
                      onChange={e => setSubmissionSearch(e.target.value)}
                      className={styles.searchInput}
                    />
                    {submissionSearch && (
                      <button className={styles.clearSearch} onClick={() => setSubmissionSearch("")}>
                        <FiX />
                      </button>
                    )}
                  </div>
                </div>

                {loadingSubmissions ? (
                  <div style={{ padding: "2rem" }}>
                    <SkeletonLoader width="100%" height="45px" borderRadius="8px" />
                    <div style={{ height: "10px" }} />
                    <SkeletonLoader width="100%" height="45px" borderRadius="8px" />
                    <div style={{ height: "10px" }} />
                    <SkeletonLoader width="100%" height="45px" borderRadius="8px" />
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div style={{ padding: "3rem 1rem" }}>
                    <EmptyState
                      icon={<FiUsers />}
                      title="No student records match filter"
                      description={
                        submissionSearch
                          ? `No candidates match "${submissionSearch}" in the current filter.`
                          : "No students found in this category."
                      }
                    />
                  </div>
                ) : (
                  <div className={styles.tableResponsive}>
                    <table className={styles.marksTable}>
                      <thead>
                        <tr>
                          <th>Candidate</th>
                          <th>Student Code</th>
                          <th>College</th>
                          <th>Marks Obtained</th>
                          <th>Percentage</th>
                          <th>Result</th>
                          <th>Submitted At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.map(sub => {
                          const candidateName = sub.student_name || "Candidate";
                          const isNotAttempted = sub.statusType === "NOT_ATTEMPTED";
                          const percentage = sub.percentage !== null && sub.percentage !== undefined ? Number(sub.percentage) : null;
                          const isPassed = sub.statusType === "PASSED";

                          return (
                            <tr key={sub.id}>
                              <td>
                                <div className={styles.studentCell}>
                                  <div className={styles.studentAvatar}>
                                    {candidateName.charAt(0).toUpperCase()}
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontWeight: "600" }}>{candidateName}</span>
                                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{sub.student_email || "—"}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={styles.studentCodeBadge}>
                                  {sub.student_code || "—"}
                                </span>
                              </td>
                              <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                                {sub.college || "—"}
                              </td>
                              <td style={{ fontWeight: "600" }}>
                                {isNotAttempted ? (
                                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Not Attempted</span>
                                ) : (
                                  <>
                                    {sub.marks_obtained ?? 0} <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>/ {sub.total_marks ?? selectedTest.total_questions ?? 10}</span>
                                  </>
                                )}
                              </td>
                              <td>
                                {isNotAttempted ? (
                                  <span style={{ color: "var(--text-muted)" }}>—</span>
                                ) : (
                                  <span className={`${styles.scorePill} ${isPassed ? styles.scorePassed : styles.scoreFailed}`}>
                                    {percentage}%
                                  </span>
                                )}
                              </td>
                              <td>
                                {isNotAttempted ? (
                                  <Badge variant="default">Not Attempted</Badge>
                                ) : isPassed ? (
                                  <Badge variant="success">Passed</Badge>
                                ) : (
                                  <Badge variant="error">Failed</Badge>
                                )}
                              </td>
                              <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ================= PRIMARY TESTS LIST VIEW ================= */
        <>
          {/* Controls Filter Bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              {allCohorts.length > 0 && (
                <select
                  className={styles.cohortSelect}
                  value={selectedCohort}
                  onChange={e => setSelectedCohort(e.target.value)}
                >
                  <option value="">All Assigned Cohorts ({allCohorts.length})</option>
                  {allCohorts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.course_name} — {c.code || c.name}
                    </option>
                  ))}
                </select>
              )}

              <div className={styles.statusTabs}>
                <button
                  className={`${styles.tabBtn} ${statusFilter === "ALL" ? styles.activeTab : ""}`}
                  onClick={() => setStatusFilter("ALL")}
                >
                  All Tests ({tests.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${statusFilter === "CONDUCTED" ? styles.activeTab : ""}`}
                  onClick={() => setStatusFilter("CONDUCTED")}
                >
                  Conducted ({tests.filter(checkIsConducted).length})
                </button>
                <button
                  className={`${styles.tabBtn} ${statusFilter === "SCHEDULED" ? styles.activeTab : ""}`}
                  onClick={() => setStatusFilter("SCHEDULED")}
                >
                  Scheduled ({tests.filter(t => !checkIsConducted(t)).length})
                </button>
              </div>
            </div>

            <div className={styles.searchWrapper}>
              <FiSearch className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search tests by title, module, or course..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
              {searchQuery && (
                <button className={styles.clearSearch} onClick={() => setSearchQuery("")}>
                  <FiX />
                </button>
              )}
            </div>
          </div>

          {/* Tests Grid */}
          {loadingTests ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "1.25rem" }}>
              <SkeletonLoader width="100%" height="180px" borderRadius="12px" />
              <SkeletonLoader width="100%" height="180px" borderRadius="12px" />
              <SkeletonLoader width="100%" height="180px" borderRadius="12px" />
            </div>
          ) : filteredTests.length === 0 ? (
            <EmptyState
              icon={<FiCheckSquare />}
              title="No module tests found"
              description={
                searchQuery
                  ? `No assessments match "${searchQuery}".`
                  : "No module tests are currently scheduled or conducted for your assigned cohorts."
              }
            />
          ) : (
            <div className={styles.testsGrid}>
              {filteredTests.map(test => {
                const isConducted = checkIsConducted(test);
                return (
                  <div
                    key={test.id}
                    className={styles.testCard}
                    onClick={() => setSelectedTest(test)}
                  >
                    <div className={styles.testCardTop}>
                      <div className={styles.testCardHeader}>
                        <h3 className={styles.testTitle}>{test.title}</h3>
                        <span className={styles.moduleBadge}>
                          {test.module_name || "Module Test"}
                        </span>
                      </div>

                      <div className={styles.courseCohortRow}>
                        <span>{test.course_name || test.course_code || "Course"}</span>
                        <span>•</span>
                        <span className={styles.cohortTag}>
                          {test.cohort_code || test.cohort_name || "Cohort"}
                        </span>
                      </div>

                      <div className={styles.testMetaGrid}>
                        <div className={styles.metaItem}>
                          <FiCalendar />
                          <span>
                            {test.scheduled_at
                              ? new Date(test.scheduled_at).toLocaleDateString()
                              : "Unscheduled"}
                          </span>
                        </div>
                        <div className={styles.metaItem}>
                          <FiClock />
                          <span>{test.duration_minutes || 30} mins</span>
                        </div>
                        <div className={styles.metaItem}>
                          <FiAward />
                          <span>Pass: <strong>{test.pass_percentage}%</strong></span>
                        </div>
                        <div className={styles.metaItem}>
                          <FiList />
                          <span><strong>{test.total_questions || 10}</strong> Qs</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.testCardFooter}>
                      <div>
                        {isConducted ? (
                          <Badge variant="success">
                            Conducted {test.submissions_count ? `(${test.submissions_count})` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="warning">Scheduled</Badge>
                        )}
                      </div>

                      <button className={styles.viewBtn}>
                        {isConducted ? "View Student Marks" : "View Details"} <FiChevronRight />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MentorAssessments;
