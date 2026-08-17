import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { studentService } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Students.module.css";
import { FiUsers, FiClock, FiCheckCircle, FiAlertCircle, FiXCircle, FiShield, FiArrowLeft } from "react-icons/fi";

function Students() {
  const location = useLocation();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);

  const queryParams = new URLSearchParams(location.search);
  const urlCohort = queryParams.get("cohort") || "";
  const urlStatus = queryParams.get("status") || "";
  const urlCourse = queryParams.get("course") || "";

  // Server-side filters
  const [selectedCourseId, setSelectedCourseId] = useState(urlCourse || location.state?.preSelectedCourse || "");
  const [selectedCohort, setSelectedCohort] = useState(urlCohort || location.state?.preSelectedCohort || "");
  const [verificationState, setVerificationState] = useState(urlStatus || "");

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [showSeeded, setShowSeeded] = useState(false);

  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  // Dashboard stats
  const [stats, setStats] = useState({
    total: 0, eligibleForBulk: "-", reviewRequired: "-", approved: "-", rejected: "-"
  });

  const [selectedStudent, setSelectedStudent] = useState(null); // For the Profile Modal
  const [loading, setLoading] = useState(true);
  const [applicationsMap, setApplicationsMap] = useState({});

  // Bulk Verification State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isVerifying, setIsVerifying] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Load static dropdown data once on mount
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [coursesRes, cohortsRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COURSES.BASE, { params: { page_size: 1000 } }),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { page_size: 1000 } })
        ]);
        setCourses(coursesRes.data.results || coursesRes.data || []);
        setCohorts(cohortsRes.data.results || cohortsRes.data || []);
      } catch (err) {
        console.error("Failed to load dropdown data", err);
      }
    }
    loadDropdowns();
  }, []);

  // Sync URL parameters to state when navigation occurs
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlCohort = params.get("cohort");
    const urlStatus = params.get("status");
    const urlCourse = params.get("course");

    if (urlCohort !== null) setSelectedCohort(urlCohort);
    if (urlStatus !== null) setVerificationState(urlStatus);
    if (urlCourse !== null) setSelectedCourseId(urlCourse);
  }, [location.search]);

  // Track previous filter values to safely reset pagination
  const prevFiltersRef = React.useRef({ selectedCourseId, selectedCohort, verificationState, showSeeded });

  // Fetch paginated students AND dynamic stats when filters/page change
  useEffect(() => {
    const abortController = new AbortController();
    const prev = prevFiltersRef.current;

    const filtersChanged = prev.selectedCourseId !== selectedCourseId
      || prev.selectedCohort !== selectedCohort
      || prev.verificationState !== verificationState
      || prev.showSeeded !== showSeeded; // Now properly tracking the Seeded button!

    prevFiltersRef.current = { selectedCourseId, selectedCohort, verificationState, showSeeded };

    if (filtersChanged && page !== 1) {
      setPage(1);
      setSelectedIds(new Set());
      setBulkResult(null);
      return () => abortController.abort();
    }

    if (filtersChanged) {
      setSelectedIds(new Set());
      setBulkResult(null);
    }

    async function fetchData() {
      setLoading(true);
      try {
        const baseParams = { page, page_size: 25 };

        if (selectedCourseId) baseParams.course = selectedCourseId;
        if (selectedCohort) baseParams.cohort = selectedCohort;
        if (verificationState) baseParams.application_status = verificationState;
        if (showSeeded) baseParams.seeded = 'true';

        console.log("🚀 SENDING API REQUEST TO BACKEND WITH PARAMS:", baseParams);

        // Fetch table data
        const tableRes = await studentService.getStudentProfiles(baseParams, { signal: abortController.signal });

        const studentData = tableRes?.data || tableRes || {};
        const fetchedStudents = studentData?.results || (Array.isArray(studentData) ? studentData : []);

        setStudents(fetchedStudents);
        setTotalCount(studentData?.count || fetchedStudents.length);
        setHasNext(Boolean(studentData?.next));
        setHasPrev(Boolean(studentData?.previous) || page > 1);

        // Fetch applications for the loaded students using available application IDs
        const appIdsToFetch = new Set();
        fetchedStudents.forEach(s => {
          if (s.application_id) appIdsToFetch.add(s.application_id);
          if (s.active_cohort?.application_id) appIdsToFetch.add(s.active_cohort.application_id);
          if (s.completed_cohorts?.length > 0) {
            s.completed_cohorts.forEach(cc => {
              if (cc.application_id) appIdsToFetch.add(cc.application_id);
            });
          }
        });

        const newAppMap = {};
        if (appIdsToFetch.size > 0) {
          const appRes = await Promise.all(
            Array.from(appIdsToFetch).map(id =>
              apiClient.get(API_ENDPOINTS.APPLICATIONS.BY_ID(id)).catch(() => null)
            )
          );
          appRes.forEach(res => {
            if (res?.data?.id) {
              newAppMap[res.data.id] = res.data;
            }
          });
        }
        setApplicationsMap(newAppMap);

        // Calculate stats for current page because global backend filtering by qualified is not supported
        let currentCleared = 0;
        let currentNotCleared = 0;
        let currentPending = 0;

        fetchedStudents.forEach(s => {
          let resolvedApp = null;
          if (selectedCourseId) {
            resolvedApp = Object.values(newAppMap).find(app => app.student?.id === s.id && app.course?.id === selectedCourseId);
          } else if (selectedCohort) {
            resolvedApp = Object.values(newAppMap).find(app => app.student?.id === s.id && app.assigned_cohort?.id === selectedCohort);
          } else if (s.application_id) {
            resolvedApp = newAppMap[s.application_id];
          } else if (s.active_cohort?.application_id) {
            resolvedApp = newAppMap[s.active_cohort.application_id];
          } else if (s.completed_cohorts?.length > 0) {
            resolvedApp = newAppMap[s.completed_cohorts[0].application_id];
          }

          if (resolvedApp) {
            if (resolvedApp.qualified === true) currentCleared++;
            else if (resolvedApp.qualified === false) currentNotCleared++;
            else currentPending++;
          }
        });

        let finalCleared = verificationState === "PASSED" ? (studentData?.count || currentCleared) : currentCleared;
        let finalNotCleared = verificationState === "NOT_PASSED" ? (studentData?.count || currentNotCleared) : currentNotCleared;
        let finalPending = verificationState === "PENDING" ? (studentData?.count || currentPending) : currentPending;

        setStats(prev => ({
          ...prev,
          examCleared: finalCleared,
          examNotCleared: finalNotCleared,
          examPending: finalPending
        }));

      } catch (err) {
        if (err.name !== 'AbortError' && err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError') {
          console.error("Failed to fetch data.", err);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => abortController.abort();
  }, [page, selectedCourseId, selectedCohort, verificationState, showSeeded]);

  const handleBulkVerify = async () => { };

  // Helper to render exam status natively
  const renderExamStatusBadge = (student) => {
    let resolvedApp = null;
    if (selectedCourseId) {
      resolvedApp = Object.values(applicationsMap).find(app => app.student?.id === student.id && app.course?.id === selectedCourseId);
    } else if (selectedCohort) {
      resolvedApp = Object.values(applicationsMap).find(app => app.student?.id === student.id && app.assigned_cohort?.id === selectedCohort);
    } else if (student.application_id) {
      resolvedApp = applicationsMap[student.application_id];
    } else if (student.active_cohort?.application_id) {
      resolvedApp = applicationsMap[student.active_cohort.application_id];
    } else if (student.completed_cohorts?.length > 0) {
      resolvedApp = applicationsMap[student.completed_cohorts[0].application_id];
    }

    const formatStatus = (s) => {
      if (!s) return "Unknown";
      return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    if (!resolvedApp) {
      if (student.is_official_student) {
        return <span style={{ color: "#059669", fontWeight: "bold", fontSize: "12px" }}>✅ SEEDED (No App)</span>;
      }
      return <span style={{ color: "#d97706", fontWeight: "bold", fontSize: "12px" }}>⏳ NO APPLICATION VISIBLE</span>;
    }

    const workflowStatus = formatStatus(resolvedApp.status);
    let examResult = <span style={{ color: "#d97706", fontSize: "11px" }}>PENDING</span>;
    if (resolvedApp.qualified === true) examResult = <span style={{ color: "#059669", fontSize: "11px" }}>PASSED</span>;
    else if (resolvedApp.qualified === false) examResult = <span style={{ color: "#dc2626", fontSize: "11px" }}>NOT PASSED</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: "bold", fontSize: "12px", color: "var(--text-primary)" }}>{workflowStatus}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Exam: {examResult}</span>
      </div>
    );
  };

  const renderUserStatusBadge = (status) => {
    if (status === "Active & Password Reset") {
      return <span style={{ color: "#059669", fontWeight: "bold", fontSize: "12px", backgroundColor: "#d1fae5", padding: "4px 8px", borderRadius: "6px", border: "1px solid #10b981" }}>🟢 Active & Password Reset</span>;
    }
    if (status === "Pending Password Reset") {
      return <span style={{ color: "#d97706", fontWeight: "bold", fontSize: "12px", backgroundColor: "#fef3c7", padding: "4px 8px", borderRadius: "6px", border: "1px solid #f59e0b" }}>⏳ Pending Password Reset</span>;
    }
    if (status === "Deactivated") {
      return <span style={{ color: "#dc2626", fontWeight: "bold", fontSize: "12px", backgroundColor: "#fee2e2", padding: "4px 8px", borderRadius: "6px", border: "1px solid #ef4444" }}>🔴 Deactivated</span>;
    }
    return <span style={{ color: "#9ca3af", fontWeight: "bold", fontSize: "12px" }}>{status || "Unknown"}</span>;
  };

  const totalStudentsCount = totalCount;
  // Stats are already calculated above.

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">{showSeeded ? "Seeded Students Dashboard" : "Student Management Dashboard"}</h1>
          <p className="premium-subtitle">{showSeeded ? "Monitor newly imported accounts pending login." : "Filter and review students."}</p>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            onClick={() => { setShowSeeded(!showSeeded); setPage(1); }}
            className={`premium-btn ${showSeeded ? 'premium-btn-secondary' : 'premium-btn-outline'}`}
            style={{
              borderColor: showSeeded ? "transparent" : "#10b981",
              backgroundColor: showSeeded ? "#f3f4f6" : "#ecfdf5",
              color: showSeeded ? "#374151" : "#047857",
              fontWeight: "bold"
            }}
          >
            {showSeeded ? "🔙 Return to All Students" : "🌱 View Seeded Accounts"}
          </button>
          <Link to="/admin/add-student" className="premium-btn premium-btn-primary">+ Add Student</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }} className="hover:shadow-md hover:-translate-y-1">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "14px", fontWeight: "bold" }}>
            <FiUsers /> Total Students
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{totalStudentsCount}</div>
            <span className="text-sm text-gray-500" style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>Showing {students.length} of {totalCount || '...'} total enrolled</span>
          </div>
        </div>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderBottom: "4px solid #10b981", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }} className="hover:shadow-md hover:-translate-y-1">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#047857", fontSize: "14px", fontWeight: "bold" }}>
            <FiCheckCircle /> Exam Cleared
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{stats.examCleared}</div>
            <span className="text-sm text-gray-500" style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>On this current page</span>
          </div>
        </div>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderBottom: "4px solid #ef4444", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }} className="hover:shadow-md hover:-translate-y-1">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b91c1c", fontSize: "14px", fontWeight: "bold" }}>
            <FiXCircle /> Exam Not Cleared
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{stats.examNotCleared}</div>
            <span className="text-sm text-gray-500" style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>On this current page</span>
          </div>
        </div>
        {/* 🚨 PENDING EXAM CARD */}
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderBottom: "4px solid #f59e0b", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }} className="hover:shadow-md hover:-translate-y-1">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b45309", fontSize: "14px", fontWeight: "bold" }}>
            <FiClock /> Exam Pending
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>
              {stats.examPending}
            </div>
            <span className="text-sm text-gray-500" style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>On this current page</span>
          </div>
        </div>
      </div>



      {/* Server-side Filters */}
      <div className="premium-card premium-flex-row" style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <select
          value={selectedCourseId}
          onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedCohort(""); }}
          className="premium-input"
          style={{ flex: 1, minWidth: "200px" }}
        >
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={selectedCohort}
          onChange={(e) => setSelectedCohort(e.target.value)}
          className="premium-input"
          style={{ flex: 1, minWidth: "200px" }}
        >
          <option value="">All Batches</option>
          {cohorts.filter(c => {
            if (!selectedCourseId) return true; // Show all if no course selected
            const cId = c.course?.id || c.course || c.course_id;
            return String(cId) === String(selectedCourseId);
          }).map(coh => (
            <option key={coh.id} value={coh.code || coh.id}>
              {coh.code || coh.name || "Batch"}
            </option>
          ))}
        </select>

        <select
          value={verificationState}
          onChange={(e) => setVerificationState(e.target.value)}
          className="premium-input"
          style={{ flex: 1, minWidth: "200px" }}
        >
          <option value="">All Statuses</option>
          <option value="APPLIED">Applied</option>
          <option value="EXAM_PENDING">Exam Pending</option>
          <option value="QUALIFIED">Qualified</option>
          <option value="COHORT_ASSIGNED">Cohort Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Bulk Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Total Students: <strong>{totalCount}</strong>
        </div>
      </div>

      {/* Table */}
      <div className="premium-table-container">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Student Name & Code</th>
              <th>Course & Batch</th>
              <th>Account Type</th>
              <th>Application & Exam</th>
              {showSeeded && <th>User Status</th>}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ padding: "2rem", textAlign: "center" }}><div className="skeleton-shimmer" style={{ height: "40px", borderRadius: "8px", width: "100%" }}></div></td></tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: 0 }}>
                  <div className="premium-empty-state" style={{ border: "none", padding: "4rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🔍 📭</div>
                    <h3 style={{ color: "var(--text-primary)", fontSize: "1.25rem", margin: "0 0 0.5rem 0" }}>Zero Students Found</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: 0 }}>No students match your current Course, Batch, and Status filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              students.map(student => {
                // Safely parse name for the beautiful table cell layout
                const name = student.user?.first_name || student.first_name || null;
                const displayFullName = student.user?.first_name || student.user?.last_name
                  ? `${student.user.first_name || ''} ${student.user.last_name || ''}`.trim()
                  : (student.first_name || student.last_name ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : null);

                return (
                  <tr key={student.id} style={{ borderBottom: "1px solid var(--border-color)", transition: "background-color 0.2s" }} className="premium-table-row">
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: 'var(--text-primary, #111827)', fontSize: '15px' }}>
                          {name ? displayFullName : "Name Pending / Seeded"}
                        </strong>
                        <span style={{ color: 'var(--text-secondary, #6B7280)', fontSize: '13px', marginTop: '2px' }}>
                          {student.student_code || "No Code"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <span style={{ display: "inline-block", fontWeight: "600", color: "var(--accent-color)", backgroundColor: "var(--bg-nested)", padding: "4px 8px", borderRadius: "6px", fontSize: "13px", marginBottom: "4px" }}>
                        {student.active_cohort?.course_name || student.current_application?.course?.name || student.course_name || "Not Assigned"}
                      </span>
                      <span style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>
                        {student.cohort_code || student.active_cohort?.cohort_code || "Not Assigned"}
                      </span>
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <span style={{ display: "inline-block", fontWeight: "600", color: student.is_official_student ? "#059669" : "var(--accent-color)", backgroundColor: student.is_official_student ? "#d1fae5" : "var(--bg-nested)", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", marginBottom: "4px" }}>
                        {student.is_official_student ? "Seeded / Issued" : "Candidate"}
                      </span>
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      {renderExamStatusBadge(student)}
                    </td>
                    {showSeeded && (
                      <td style={{ padding: "1.25rem 1rem" }}>
                        {renderUserStatusBadge(student.user_status)}
                      </td>
                    )}
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <button
                        onClick={() => setSelectedStudent(student)}
                        className="premium-btn"
                        style={{ backgroundColor: "var(--bg-nested)", border: "1px solid var(--border-color)", color: "var(--text-primary)", padding: "6px 12px", height: "auto", fontSize: "13px" }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
        <button
          disabled={!hasPrev || loading}
          onClick={() => setPage(p => p - 1)}
          className="premium-btn"
          style={{ backgroundColor: hasPrev ? "var(--primary-color)" : "var(--bg-nested)", color: hasPrev ? "#fff" : "var(--text-muted)" }}
        >
          &larr; Previous Page
        </button>
        <span style={{ fontSize: "14px", fontWeight: "bold" }}>Page {page}</span>
        <button
          disabled={!hasNext || loading}
          onClick={() => setPage(p => p + 1)}
          className="premium-btn"
          style={{ backgroundColor: hasNext ? "var(--primary-color)" : "var(--bg-nested)", color: hasNext ? "#fff" : "var(--text-muted)" }}
        >
          Next Page &rarr;
        </button>
      </div>

      {/* 🚨 FULL STUDENT PROFILE MODAL 🚨 */}
      {selectedStudent && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "2rem", borderRadius: "12px", width: "90%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setSelectedStudent(null)} style={{ position: "absolute", top: "1.5rem", right: "1.5rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-muted)" }}>✖</button>
            <div style={{ marginBottom: "1.5rem" }}>
              <button onClick={() => setSelectedStudent(null)} className="premium-btn" style={{ background: "transparent", color: "var(--text-secondary)", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <FiArrowLeft /> Back to Students
              </button>
            </div>
            <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              {`${selectedStudent.user?.first_name || selectedStudent.first_name || selectedStudent.user?.firstName || selectedStudent.firstName || ""} ${selectedStudent.user?.last_name || selectedStudent.last_name || selectedStudent.user?.lastName || selectedStudent.lastName || ""}`.trim() || "Student"}
            </h2>
            <p style={{ color: "var(--text-muted)", margin: "0 0 1.5rem 0" }}>{selectedStudent.user?.email || selectedStudent.email || "No Email"} | {selectedStudent.student_code}</p>

            <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid rgba(0,0,0,0.1)", paddingBottom: "8px" }}>Profile Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
                <div><strong>Phone:</strong> {selectedStudent.user?.phone_number || selectedStudent.phone_number || "N/A"}</div>
                <div><strong>Location:</strong> {selectedStudent.city ? `${selectedStudent.city}, ${selectedStudent.state || ""}` : "N/A"}</div>
                <div style={{ gridColumn: "1 / -1" }}><strong>Skills:</strong> {selectedStudent.skills?.join(", ") || selectedStudent.tagline || "N/A"}</div>
              </div>
            </div>

            <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid rgba(0,0,0,0.1)", paddingBottom: "8px" }}>Academic Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
                <div style={{ gridColumn: "1 / -1" }}><strong>College:</strong> {selectedStudent.college || "N/A"}</div>
                <div><strong>Degree:</strong> {selectedStudent.degree || "N/A"}</div>
                <div><strong>Graduation Year:</strong> {selectedStudent.graduation_year || "N/A"}</div>
                {/* Rely on the new flattened backend data for blazing fast rendering */}
                <div><strong>Course:</strong> {selectedStudent.course_name || "Not Assigned"}</div>
                <div><strong>Batch:</strong> {selectedStudent.cohort_code || "Not Assigned"}</div>
              </div>
            </div>

            {/* Empty for now, but kept structure in case we want to add more things here */}

            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              {selectedStudent.status === "PENDING_ADMIN_REVIEW" && (
                <button onClick={async () => {
                  try {
                    await studentService.verifyStudent(selectedStudent.id, "APPROVE");
                    setStudents(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, status: "ADMIN_APPROVED" } : s));
                    setSelectedStudent({ ...selectedStudent, status: "ADMIN_APPROVED" });
                  } catch (e) { alert("Failed to approve: " + (e.response?.data?.detail || e.message)); }
                }} style={{ flex: 1, padding: "10px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Approve Manually</button>
              )}
              {selectedStudent.status === "PENDING_ADMIN_REVIEW" && (
                <button onClick={async () => {
                  const reason = window.prompt("Enter rejection reason:");
                  if (reason !== null) {
                    try {
                      await studentService.verifyStudent(selectedStudent.id, "REJECT", reason);
                      setStudents(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, status: "ADMIN_REJECTED", rejection_reason: reason } : s));
                      setSelectedStudent({ ...selectedStudent, status: "ADMIN_REJECTED", rejection_reason: reason });
                    } catch (e) { alert("Failed to reject: " + (e.response?.data?.detail || e.message)); }
                  }
                }} style={{ flex: 1, padding: "10px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Reject Manually</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Students;