import React, { useState, useEffect } from "react";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { 
  FaUsers, 
  FaCalendarAlt, 
  FaGraduationCap, 
  FaSearch, 
  FaExternalLinkAlt 
} from "react-icons/fa";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AdvisorBatches() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    let isMounted = true;

    async function fetchBatches() {
      try {
        const res = await apiClient.get(API_ENDPOINTS.COHORTS.BASE);
        if (isMounted) {
          const list = normalizeListResponse(res.data);
          setBatches(list);
        }
      } catch (err) {
        console.error("Failed to load assigned batches:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchBatches();
    return () => { isMounted = false; };
  }, []);

  const filteredBatches = batches.filter((b) => {
    const matchesSearch = 
      (b.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.course_name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Assigned Batches</h1>
          <p className="premium-subtitle">Cohorts and training programs actively assigned to your advisory portfolio.</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
            placeholder="Search by cohort name, code, or course..."
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
          style={{ width: "auto", minWidth: "160px" }}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="TRAINING">Training</option>
          <option value="INTERNSHIP">Internship</option>
          <option value="COMPLETED">Completed</option>
          <option value="OPEN">Open</option>
        </select>
      </div>

      {loading ? (
        <SkeletonLoader variant="cards" count={3} />
      ) : filteredBatches.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          background: "var(--bg-surface)",
          borderRadius: "16px",
          border: "1px solid var(--border-color)"
        }}>
          <FaUsers style={{ fontSize: "48px", color: "var(--text-muted)", marginBottom: "16px" }} />
          <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>No Batches Found</h3>
          <p style={{ color: "var(--text-secondary)" }}>
            {searchTerm || statusFilter !== "ALL" 
              ? "No batches match your filter criteria." 
              : "There are currently no batches assigned to your advisor account."}
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "1.5rem"
        }}>
          {filteredBatches.map((b) => (
            <div key={b.id} className="premium-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <span className="premium-badge premium-badge-indigo" style={{ fontWeight: "700" }}>
                    {b.code}
                  </span>
                  <span style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: b.status === "ACTIVE" || b.status === "TRAINING" ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)",
                    color: b.status === "ACTIVE" || b.status === "TRAINING" ? "#10b981" : "#4f46e5"
                  }}>
                    {b.status}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                  {b.name || b.code}
                </h3>

                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
                  <FaGraduationCap /> {b.course_name || "Course Program"}
                </p>

                <div style={{ 
                  background: "var(--bg-nested)", 
                  padding: "12px", 
                  borderRadius: "8px", 
                  border: "1px solid var(--border-color)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                  marginBottom: "1rem"
                }}>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Start Date:</span>
                    <strong>{b.start_date || "TBD"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>End Date:</span>
                    <strong>{b.end_date || "TBD"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Max Capacity:</span>
                    <strong>{b.max_students || 30} Students</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Enrolled:</span>
                    <strong>{b.students_count ?? b.applications_count ?? 0} Students</strong>
                  </div>
                </div>
              </div>

              {b.meeting_link && (
                <a 
                  href={b.meeting_link.startsWith("http") ? b.meeting_link : `https://${b.meeting_link}`}
                  target="_blank"
                  rel="noreferrer"
                  className="premium-btn premium-btn-secondary"
                  style={{ width: "100%", justifyContent: "center", fontSize: "13px", padding: "8px" }}
                >
                  <FaExternalLinkAlt size={12} /> Open Class Meeting
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdvisorBatches;
