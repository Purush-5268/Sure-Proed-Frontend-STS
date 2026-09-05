import React, { useState, useEffect } from "react";
import apiClient from "../../services/apiClient";
import styles from "./Students.module.css";
import { FiCheck, FiX, FiExternalLink, FiDownload } from "react-icons/fi";

function AdminPlacements() {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPlacements = async () => {
    try {
      const res = await apiClient.get("/api/admin-placements/");
      setPlacements(res.data.results || res.data);
    } catch (err) {
      alert("Failed to fetch placements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlacements();
  }, []);

  const handleVerify = async (id, status) => {
    try {
      await apiClient.patch(`/api/admin-placements/${id}/verify/`, { status });
      alert(`Placement ${status.toLowerCase()} successfully`);
      fetchPlacements();
    } catch (err) {
      alert(`Failed to update placement`);
    }
  };

  if (loading) {
    return <div style={{ padding: "20px", textAlign: "center" }}>Loading placements...</div>;
  }

  return (
    <div style={{ marginTop: "20px", background: "var(--bg-surface)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Company</th>
              <th>Designation</th>
              <th>Type</th>
              <th>Joining Date</th>
              <th>Offer Letter</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {placements.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: "center", padding: "20px" }}>No placements reported yet.</td>
              </tr>
            ) : placements.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: "600" }}>{p.student_name || "Unknown"}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{p.student_email}</div>
                </td>
                <td>{p.company_name}</td>
                <td>{p.designation}</td>
                <td>{p.employment_type}</td>
                <td>{p.joining_date}</td>
                <td>
                  {p.offer_letter ? (
                    <a href={p.offer_letter} target="_blank" rel="noreferrer" style={{ color: "var(--primary-color)", display: "flex", alignItems: "center", gap: "4px" }}>
                      View <FiExternalLink />
                    </a>
                  ) : <span style={{ color: "var(--text-muted)" }}>None</span>}
                </td>
                <td>
                  <span style={{ 
                    padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", display: "inline-block",
                    backgroundColor: p.status === "VERIFIED" ? "rgba(16, 185, 129, 0.1)" : (p.status === "REJECTED" ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)"),
                    color: p.status === "VERIFIED" ? "#10b981" : (p.status === "REJECTED" ? "#ef4444" : "#f59e0b")
                  }}>
                    {p.status}
                  </span>
                </td>
                <td>
                  {p.status === "PENDING_VERIFICATION" && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => handleVerify(p.id, "VERIFIED")} style={{ background: "#10b981", color: "white", border: "none", padding: "6px 10px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center" }} title="Verify">
                        <FiCheck />
                      </button>
                      <button onClick={() => handleVerify(p.id, "REJECTED")} style={{ background: "#ef4444", color: "white", border: "none", padding: "6px 10px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center" }} title="Reject">
                        <FiX />
                      </button>
                    </div>
                  )}
                  {p.status !== "PENDING_VERIFICATION" && (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Processed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminPlacements;
