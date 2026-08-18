import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { FiSearch, FiCheckCircle } from "react-icons/fi";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Applications.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Applications() {
  const [activeTab, setActiveTab] = useState("ALL"); // 'ALL', 'ASSIGNED', 'UNASSIGNED'
  
  // Reference data
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  
  const [cohortsCache, setCohortsCache] = useState({}); // { courseId: cohortsArray }
  const [loadingCohorts, setLoadingCohorts] = useState(false);

  // Filter States
  const [filters, setFilters] = useState({
    course: "",
    cohort: "",
    status: "",
    search: "",
  });
  
  const [searchInput, setSearchInput] = useState("");
  const searchTimeoutRef = useRef(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [totalCount, setTotalCount] = useState(0);

  // Application Data State
  const [applications, setApplications] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Request cancellation
  const abortControllerRef = useRef(null);

  // 1. Fetch Courses on Mount
  useEffect(() => {
    let isMounted = true;
    const fetchCourses = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COURSES.BASE);
        if (isMounted) {
          setCourses(normalizeListResponse(response.data));
        }
      } catch (err) {
        console.error("Failed to load courses:", err);
      } finally {
        if (isMounted) setLoadingCourses(false);
      }
    };
    fetchCourses();
    return () => { isMounted = false; };
  }, []);

  // 2. Fetch Cohorts when Course changes (and only if not cached)
  useEffect(() => {
    if (activeTab === "ASSIGNED" && filters.course) {
      if (!cohortsCache[filters.course]) {
        fetchCohorts(filters.course);
      }
    }
  }, [filters.course, activeTab, cohortsCache]);

  const fetchCohorts = async (courseId) => {
    setLoadingCohorts(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { course: courseId } });
      const allCohorts = normalizeListResponse(res.data);
      setCohortsCache(prev => ({ ...prev, [courseId]: allCohorts }));
    } catch (err) {
      console.error("Failed to fetch cohorts:", err);
    } finally {
      setLoadingCohorts(false);
    }
  };

  // 3. Fetch Applications when Filters, Page, or Tab changes
  const fetchApplications = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoadingApps(true);
    setApplications([]); // Clear old data to avoid flicker/stale data

    try {
      const params = {
        page,
        page_size: pageSize,
      };

      if (filters.course) params.course = filters.course;
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;

      if (activeTab === "UNASSIGNED") {
        params.assigned_cohort__isnull = "True";
      } else if (activeTab === "ASSIGNED") {
        if (filters.cohort) {
          params.assigned_cohort = filters.cohort;
        } else {
          // If in assigned tab but no cohort selected, wait for selection
          setLoadingApps(false);
          setTotalCount(0);
          return;
        }
      }

      const res = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE, { 
        params,
        signal: abortControllerRef.current.signal
      });

      const items = normalizeListResponse(res.data);
      setApplications(items);
      setTotalCount(res.data?.count || items.length);

    } catch (err) {
      if (err.name !== 'CanceledError' && err.message !== 'canceled') {
        console.error("Failed to fetch applications:", err);
      }
    } finally {
      // Only set loading false if this isn't an aborted request
      if (!abortControllerRef.current?.signal.aborted) {
         setLoadingApps(false);
      }
    }
  }, [activeTab, filters, page]);

  useEffect(() => {
    fetchApplications();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchApplications]);

  // Debounced Search
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: value }));
      setPage(1); // Reset to page 1 on search
    }, 300);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setSearchInput("");
    setFilters({
      course: "",
      cohort: "",
      status: "",
      search: "",
    });
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => {
      const updated = { ...prev, [field]: value };
      // Reset cohort if course changes
      if (field === 'course') updated.cohort = "";
      return updated;
    });
    setPage(1); // Reset to page 1 on any filter change
  };

  const renderStudentName = (app) => {
    // Rely on new student_details contract if available
    if (app.student_details) {
      return (
        <>
          <div style={{ fontWeight: 600 }}>{app.student_details.name}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{app.student_details.student_code}</div>
        </>
      );
    }
    
    // Fallback to legacy object if present
    if (app.student && typeof app.student === 'object' && app.student.user) {
      const name = app.student.user.first_name ? `${app.student.user.first_name} ${app.student.user.last_name || ""}` : "Unknown";
      return (
        <>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{app.student.student_code || ""}</div>
        </>
      );
    }
    
    // Fallback if backend still returns UUID
    return (
      <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
        Student Profile Linked
      </div>
    );
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <div>
          <h1 className="premium-title">Application Management</h1>
          <p className="premium-subtitle">Manage student applications</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid var(--border-color)", marginBottom: "24px", padding: "0 24px" }}>
        {["ALL", "ASSIGNED", "UNASSIGNED"].map(tab => (
          <div
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              fontWeight: activeTab === tab ? "600" : "400",
              color: activeTab === tab ? "var(--primary-color)" : "var(--text-secondary)",
              borderBottom: activeTab === tab ? "2px solid var(--primary-color)" : "2px solid transparent",
              transition: "all 0.2s"
            }}
          >
            {tab === "ALL" ? "All Applications" : tab === "ASSIGNED" ? "Cohort Assigned" : "Unassigned"}
          </div>
        ))}
      </div>

      <div style={{ padding: "0 24px" }}>
        {/* Filters Row */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
          
          <select 
            className="premium-input" 
            style={{ maxWidth: "250px" }}
            value={filters.course}
            onChange={(e) => handleFilterChange("course", e.target.value)}
          >
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
          </select>

          {activeTab === "ASSIGNED" && (
            <select 
              className="premium-input" 
              style={{ maxWidth: "250px" }}
              value={filters.cohort}
              onChange={(e) => handleFilterChange("cohort", e.target.value)}
              disabled={!filters.course || loadingCohorts}
            >
              <option value="">Select Cohort</option>
              {(cohortsCache[filters.course] || []).map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          )}

          {activeTab !== "ASSIGNED" && (
            <select 
              className="premium-input" 
              style={{ maxWidth: "200px" }}
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="APPLIED">Applied</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="REJECTED">Rejected</option>
              <option value="WAITLISTED">Waitlisted</option>
            </select>
          )}

          <div style={{ position: "relative", flex: 1, minWidth: "200px", maxWidth: "400px" }}>
            <FiSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
            <input 
              type="text" 
              className="premium-input" 
              placeholder="Search applications..." 
              style={{ paddingLeft: "36px", width: "100%" }}
              value={searchInput}
              onChange={handleSearchChange}
            />
          </div>
        </div>

        {/* Info Message for Assigned Tab */}
        {activeTab === "ASSIGNED" && !filters.cohort && (
          <div style={{ padding: "40px", textAlign: "center", backgroundColor: "var(--bg-secondary)", borderRadius: "8px" }}>
            <p style={{ color: "var(--text-secondary)" }}>Please select a course and a cohort to view assigned applications.</p>
          </div>
        )}

        {/* Table Area */}
        {((activeTab !== "ASSIGNED") || (activeTab === "ASSIGNED" && filters.cohort)) && (
          <div className="premium-table-container" style={{ boxShadow: "none", border: "1px solid var(--border-color)" }}>
            {loadingApps ? (
              <div style={{ padding: "16px" }}><SkeletonLoader variant="table" rows={10} /></div>
            ) : applications.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>No applications found.</div>
            ) : (
              <>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Application #</th>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Status</th>
                      <th>Exam Result</th>
                      <th>Applied Date</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr key={app.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{app.application_number || "N/A"}</td>
                        <td>{renderStudentName(app)}</td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {courses.find(c => String(c.id) === String(app.course))?.name || "Unknown Course"}
                        </td>
                        <td>
                          <span className={`premium-badge ${app.status === 'REJECTED' ? 'premium-badge-danger' : app.status === 'COMPLETED' || app.status === 'COHORT_ASSIGNED' ? 'premium-badge-success' : 'premium-badge-warning'}`}>
                            {app.status || "PENDING"}
                          </span>
                        </td>
                        <td>
                          {app.qualified === true ? (
                            <span style={{ color: "var(--success-color)", display: "flex", alignItems: "center", gap: "4px" }}><FiCheckCircle/> Passed</span>
                          ) : app.qualified === false ? (
                            <span style={{ color: "var(--danger-color)" }}>Failed</span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>Pending</span>
                          )}
                        </td>
                        <td>{app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "N/A"}</td>
                        <td style={{ textAlign: "right" }}>
                          <Link to={`/admin/application-details/${app.id}`} className="premium-btn premium-btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }}>Manage</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Pagination */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", borderTop: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button 
                      className="premium-btn premium-btn-secondary" 
                      style={{ padding: "4px 12px", fontSize: "0.85rem" }}
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <button 
                      className="premium-btn premium-btn-secondary" 
                      style={{ padding: "4px 12px", fontSize: "0.85rem" }}
                      disabled={page * pageSize >= totalCount}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Applications;
