import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { studentService } from "../../services/studentService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Students.module.css";
import { FiUsers, FiClock, FiCheckCircle, FiXCircle, FiSearch } from "react-icons/fi";

/**
 * All Application.Status values from the backend.
 * Only statuses relevant for the admin filter UI are exposed in the dropdown.
 */
const APPLICATION_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "APPLIED", label: "Applied" },
  { value: "EXAM_PENDING", label: "Exam Pending" },
  { value: "EXAM_COMPLETED", label: "Exam Completed" },
  { value: "PRESCREENING_PENDING", label: "Pre-Screening Pending" },
  { value: "PRESCREENING_COMPLETED", label: "Pre-Screening Completed" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "COHORT_ASSIGNED", label: "Cohort Assigned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DROPPED", label: "Dropped" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "TRANSFER_COHORT", label: "Transfer Cohort" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

function Students() {
  const location = useLocation();
  const navigate = useNavigate();
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState(""); // Controlled input before debounce

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [showSeeded, setShowSeeded] = useState(false);

  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  // Dashboard stats (page-level)
  const [stats, setStats] = useState({
    examCleared: 0, examNotCleared: 0, examPending: 0
  });

  const [loading, setLoading] = useState(true);

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

  // Debounce search input → searchQuery
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Track previous filter values to safely reset pagination
  const prevFiltersRef = React.useRef({ selectedCourseId, selectedCohort, verificationState, showSeeded, searchQuery });

  // Fetch paginated students when filters/page change
  useEffect(() => {
    const abortController = new AbortController();
    const prev = prevFiltersRef.current;

    const filtersChanged = prev.selectedCourseId !== selectedCourseId
      || prev.selectedCohort !== selectedCohort
      || prev.verificationState !== verificationState
      || prev.showSeeded !== showSeeded
      || prev.searchQuery !== searchQuery;

    prevFiltersRef.current = { selectedCourseId, selectedCohort, verificationState, showSeeded, searchQuery };

    if (filtersChanged && page !== 1) {
      setPage(1);
      return () => abortController.abort();
    }

    async function fetchData() {
      setLoading(true);
      try {
        const baseParams = { page, page_size: 25 };

        if (selectedCourseId) baseParams.course = selectedCourseId;
        if (selectedCohort) baseParams.cohort = selectedCohort;
        if (verificationState) baseParams.application_status = verificationState;
        if (showSeeded) baseParams.seeded = 'true';
        if (searchQuery) baseParams.search = searchQuery;

        // Single API call — the student serializer returns all needed data
        const tableRes = await studentService.getStudentProfiles(baseParams, { signal: abortController.signal });

        const studentData = tableRes?.data || tableRes || {};
        const fetchedStudents = studentData?.results || (Array.isArray(studentData) ? studentData : []);

        setStudents(fetchedStudents);
        setTotalCount(studentData?.count || fetchedStudents.length);
        setHasNext(Boolean(studentData?.next));
        setHasPrev(Boolean(studentData?.previous) || page > 1);

        // Calculate page-level exam stats from the serializer data (no extra API calls)
        let currentCleared = 0;
        let currentNotCleared = 0;
        let currentPending = 0;

        fetchedStudents.forEach(s => {
          const qualified = s.qualified;
          if (qualified === true) currentCleared++;
          else if (qualified === false) currentNotCleared++;
          else if (s.application_status) currentPending++; // Has application but no exam result
        });

        setStats({
          examCleared: currentCleared,
          examNotCleared: currentNotCleared,
          examPending: currentPending
        });

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
  }, [page, selectedCourseId, selectedCohort, verificationState, showSeeded, searchQuery]);

  // ─── Helper: Render exam status badge from serializer data directly ──────
  const renderExamStatusBadge = (student) => {
    const formatStatus = (s) => {
      if (!s) return "Unknown";
      return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    // No application at all
    if (!student.application_status) {
      if (student.is_official_student) {
        return <span style={{ color: "#059669", fontWeight: "bold", fontSize: "12px" }}>✅ Official (No App)</span>;
      }
      return <span style={{ color: "#9ca3af", fontWeight: "bold", fontSize: "12px" }}>— No Application</span>;
    }

    const workflowStatus = formatStatus(student.application_status);
    let examResult = <span style={{ color: "#d97706", fontSize: "11px" }}>PENDING</span>;
    if (student.qualified === true) examResult = <span style={{ color: "#059669", fontSize: "11px" }}>PASSED</span>;
    else if (student.qualified === false) examResult = <span style={{ color: "#dc2626", fontSize: "11px" }}>NOT PASSED</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: "bold", fontSize: "12px", color: "var(--text-primary)" }}>{workflowStatus}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Exam: {examResult}</span>
      </div>
    );
  };

  // ─── Helper: Render account type badge ──────────────────────────────────
  const renderAccountTypeBadge = (student) => {
    // Determine if this is a seeded/imported account (never logged in, email not verified)
    const neverLoggedIn = student.last_login === null || student.last_login === undefined;
    const emailNotVerified = student.is_email_verified === false;
    const isSeeded = neverLoggedIn && emailNotVerified && !student.application_status;

    if (student.is_official_student) {
      return (
        <span style={{ display: "inline-block", fontWeight: "600", color: "#059669", backgroundColor: "#d1fae5", padding: "4px 8px", borderRadius: "6px", fontSize: "12px" }}>
          Official Student
        </span>
      );
    }
    if (isSeeded) {
      return (
        <span style={{ display: "inline-block", fontWeight: "600", color: "#6d28d9", backgroundColor: "#ede9fe", padding: "4px 8px", borderRadius: "6px", fontSize: "12px" }}>
          🌱 Seeded Account
        </span>
      );
    }
    return (
      <span style={{ display: "inline-block", fontWeight: "600", color: "var(--accent-color)", backgroundColor: "var(--bg-nested)", padding: "4px 8px", borderRadius: "6px", fontSize: "12px" }}>
        Candidate
      </span>
    );
  };

  // ─── Helper: Derive user status for the seeded view ─────────────────────
  const renderUserStatusBadge = (student) => {
    const isActive = student.user?.is_active !== false;
    const hasLoggedIn = student.last_login !== null && student.last_login !== undefined;
    const emailVerified = student.is_email_verified === true;

    if (isActive && hasLoggedIn) {
      return <span style={{ color: "#059669", fontWeight: "bold", fontSize: "12px", backgroundColor: "#d1fae5", padding: "4px 8px", borderRadius: "6px", border: "1px solid #10b981" }}>🟢 Active & Logged In</span>;
    }
    if (isActive && emailVerified && !hasLoggedIn) {
      return <span style={{ color: "#2563eb", fontWeight: "bold", fontSize: "12px", backgroundColor: "#dbeafe", padding: "4px 8px", borderRadius: "6px", border: "1px solid #3b82f6" }}>🔵 Verified, Pending Login</span>;
    }
    if (isActive && !emailVerified) {
      return <span style={{ color: "#d97706", fontWeight: "bold", fontSize: "12px", backgroundColor: "#fef3c7", padding: "4px 8px", borderRadius: "6px", border: "1px solid #f59e0b" }}>⏳ Pending Password Reset</span>;
    }
    if (!isActive) {
      return <span style={{ color: "#dc2626", fontWeight: "bold", fontSize: "12px", backgroundColor: "#fee2e2", padding: "4px 8px", borderRadius: "6px", border: "1px solid #ef4444" }}>🔴 Deactivated</span>;
    }
    return <span style={{ color: "#9ca3af", fontWeight: "bold", fontSize: "12px" }}>Unknown</span>;
  };

  // ─── Helper: Get course display name from serializer data ───────────────
  const getCourseName = (student) => {
    // Priority chain: active_cohort > current_application > fallback
    if (student.active_cohort?.course_name) return student.active_cohort.course_name;
    if (student.current_application?.course?.name) return student.current_application.course.name;
    return null;
  };

  // ─── Helper: Get cohort/batch display from serializer data ──────────────
  const getCohortCode = (student) => {
    if (student.active_cohort?.cohort_code) return student.active_cohort.cohort_code;
    if (student.current_application?.assigned_cohort?.code) return student.current_application.assigned_cohort.code;
    // Has application but no cohort assigned yet
    if (student.application_status && !student.active_cohort) return null;
    return null;
  };

  const totalStudentsCount = totalCount;

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">{showSeeded ? "Seeded Students Dashboard" : "Student Management Dashboard"}</h1>
          <p className="premium-subtitle">{showSeeded ? "Monitor admin-created accounts pending first login." : "Filter and review all students."}</p>
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

      {/* Stats Cards — page-level statistics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "14px", fontWeight: "bold" }}>
            <FiUsers /> Total Students
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{totalStudentsCount}</div>
            <span style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>
              {showSeeded ? "Seeded accounts matching filters" : `Showing ${students.length} of ${totalCount || '...'} matching filters`}
            </span>
          </div>
        </div>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderBottom: "4px solid #10b981", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#047857", fontSize: "14px", fontWeight: "bold" }}>
            <FiCheckCircle /> Exam Cleared
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{stats.examCleared}</div>
            <span style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>On this page ({students.length} students)</span>
          </div>
        </div>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderBottom: "4px solid #ef4444", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b91c1c", fontSize: "14px", fontWeight: "bold" }}>
            <FiXCircle /> Exam Not Cleared
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{stats.examNotCleared}</div>
            <span style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>On this page ({students.length} students)</span>
          </div>
        </div>
        <div style={{ minHeight: "100px", background: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderBottom: "4px solid #f59e0b", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b45309", fontSize: "14px", fontWeight: "bold" }}>
            <FiClock /> Exam Pending
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>
              {stats.examPending}
            </div>
            <span style={{ color: "#6b7280", fontSize: "13px", marginTop: "2px" }}>On this page ({students.length} students)</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ position: "relative" }}>
          <FiSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "16px" }} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, or student code..."
            className="premium-input"
            style={{ paddingLeft: "38px", width: "100%" }}
          />
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
            if (!selectedCourseId) return true;
            // Cohort serializer returns `course` as a UUID string
            const cId = c.course?.id || c.course || c.course_id;
            return String(cId) === String(selectedCourseId);
          }).map(coh => (
            <option key={coh.id} value={coh.id}>
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
          {APPLICATION_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Bulk Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Total Students: <strong>{totalCount}</strong>
          {searchQuery && <span style={{ marginLeft: "8px", color: "var(--text-muted)" }}>· Search: "{searchQuery}"</span>}
          {showSeeded && <span style={{ marginLeft: "8px", color: "#6d28d9", fontWeight: "600" }}>· 🌱 Seeded Only</span>}
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
              <tr><td colSpan={showSeeded ? 6 : 5} style={{ padding: "2rem", textAlign: "center" }}><div className="skeleton-shimmer" style={{ height: "40px", borderRadius: "8px", width: "100%" }}></div></td></tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={showSeeded ? 6 : 5} style={{ padding: 0 }}>
                  <div className="premium-empty-state" style={{ border: "none", padding: "4rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🔍 📭</div>
                    <h3 style={{ color: "var(--text-primary)", fontSize: "1.25rem", margin: "0 0 0.5rem 0" }}>Zero Students Found</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: 0 }}>
                      {showSeeded
                        ? "No seeded/imported accounts match your current filters."
                        : "No students match your current Course, Batch, and Status filters."
                      }
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              students.map(student => {
                // Name resolution using the serializer's flattened user fields
                const firstName = student.first_name || student.user?.first_name || "";
                const lastName = student.last_name || student.user?.last_name || "";
                const displayFullName = `${firstName} ${lastName}`.trim();
                const hasName = Boolean(firstName || lastName);

                const courseName = getCourseName(student);
                const cohortCode = getCohortCode(student);

                return (
                  <tr key={student.id} style={{ borderBottom: "1px solid var(--border-color)", transition: "background-color 0.2s" }} className="premium-table-row">
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: 'var(--text-primary, #111827)', fontSize: '15px' }}>
                          {hasName ? displayFullName : "Name Pending"}
                        </strong>
                        <span style={{ color: 'var(--text-secondary, #6B7280)', fontSize: '13px', marginTop: '2px' }}>
                          {student.student_code || "No Code"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <span style={{ display: "inline-block", fontWeight: "600", color: "var(--accent-color)", backgroundColor: "var(--bg-nested)", padding: "4px 8px", borderRadius: "6px", fontSize: "13px", marginBottom: "4px" }}>
                        {courseName || "No Course"}
                      </span>
                      <span style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>
                        {cohortCode
                          ? cohortCode
                          : (student.application_status ? "Cohort Pending" : "Not Assigned")
                        }
                      </span>
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      {renderAccountTypeBadge(student)}
                    </td>
                    <td style={{ padding: "1.25rem 1rem" }}>
                      {renderExamStatusBadge(student)}
                    </td>
                    {showSeeded && (
                      <td style={{ padding: "1.25rem 1rem" }}>
                        {renderUserStatusBadge(student)}
                      </td>
                    )}
                    <td style={{ padding: "1.25rem 1rem" }}>
                      <button
                        onClick={() => navigate(`/admin/student-details/${student.id}`)}
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
    </div>
  );
}

export default Students;