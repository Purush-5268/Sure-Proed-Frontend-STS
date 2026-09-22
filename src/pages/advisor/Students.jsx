import React, { useState, useEffect } from "react";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { 
  FaUserGraduate, 
  FaSearch, 
  FaFilter 
} from "react-icons/fa";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AdvisorStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    let isMounted = true;

    async function fetchStudents() {
      try {
        const res = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE);
        if (isMounted) {
          const list = normalizeListResponse(res.data);
          setStudents(list);
        }
      } catch (err) {
        console.error("Failed to load assigned students:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchStudents();
    return () => { isMounted = false; };
  }, []);

  const filteredStudents = students.filter((app) => {
    const studentUser = app.student?.user || {};
    const fullName = `${studentUser.first_name || ""} ${studentUser.last_name || ""}`.trim();
    const email = studentUser.email || "";
    const studentCode = app.student?.student_code || "";
    const cohortCode = app.assigned_cohort?.code || app.assigned_cohort_name || "";

    const matchesSearch = 
      fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      studentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cohortCode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Assigned Students</h1>
          <p className="premium-subtitle">Students and enrolled learners within your assigned cohorts and batches.</p>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div style={{ 
        display: "flex", 
        gap: "16px", 
        alignItems: "center", 
        marginBottom: "1.5rem",
        flexWrap: "wrap" 
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
          <FaSearch style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input 
            type="text"
            placeholder="Search by student name, code, email, or cohort..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="premium-input"
            style={{ paddingLeft: "40px" }}
          />
        </div>

        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="premium-input"
          style={{ width: "auto", minWidth: "180px" }}
        >
          <option value="ALL">All Application Statuses</option>
          <option value="COHORT_ASSIGNED">Cohort Assigned</option>
          <option value="TRAINING">Training</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="INTERNSHIP_ASSIGNED">Internship</option>
          <option value="COMPLETED">Completed</option>
          <option value="QUALIFIED">Qualified</option>
        </select>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={6} />
      ) : filteredStudents.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          background: "var(--bg-surface)",
          borderRadius: "16px",
          border: "1px solid var(--border-color)"
        }}>
          <FaUserGraduate style={{ fontSize: "48px", color: "var(--text-muted)", marginBottom: "16px" }} />
          <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>No Students Found</h3>
          <p style={{ color: "var(--text-secondary)" }}>
            {searchTerm || statusFilter !== "ALL" 
              ? "No students match the active search filter." 
              : "There are currently no students enrolled in your assigned cohorts."}
          </p>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Student Code</th>
                <th>Email</th>
                <th>Assigned Cohort</th>
                <th>Course</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((app) => {
                const u = app.student?.user || {};
                const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Student";

                return (
                  <tr key={app.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "var(--primary-color)",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          fontSize: "14px"
                        }}>
                          {(u.first_name || "S").charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                          {name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="premium-badge premium-badge-gray" style={{ fontFamily: "monospace" }}>
                        {app.student?.student_code || "N/A"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {u.email || "N/A"}
                    </td>
                    <td>
                      <span className="premium-badge premium-badge-indigo">
                        {app.assigned_cohort?.code || app.assigned_cohort?.name || "Unassigned"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-primary)", fontWeight: "500" }}>
                      {app.course?.name || app.course?.code || "Course"}
                    </td>
                    <td>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "700",
                        background: app.status === "COMPLETED" 
                          ? "rgba(16, 185, 129, 0.1)" 
                          : app.status === "TRAINING" || app.status === "IN_PROGRESS"
                          ? "rgba(99, 102, 241, 0.1)"
                          : "rgba(100, 116, 139, 0.1)",
                        color: app.status === "COMPLETED" 
                          ? "#10b981" 
                          : app.status === "TRAINING" || app.status === "IN_PROGRESS"
                          ? "#4f46e5"
                          : "#64748b"
                      }}>
                        {app.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdvisorStudents;
