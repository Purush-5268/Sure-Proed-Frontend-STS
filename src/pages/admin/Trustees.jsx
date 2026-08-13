import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiShield, FiUserPlus } from "react-icons/fi";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Trustees() {
  const [trustees, setTrustees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchTrustees = async () => {
      try {
        // Fetch all trustees from users endpoint
        const resUsers = await apiClient.get(API_ENDPOINTS.USERS.BASE, { params: { role: "TRUSTEE" } });
        const users = normalizeListResponse(resUsers.data).filter(u => u.role === "TRUSTEE");
        
        // Fetch trustee profiles
        let profilesMap = {};
        try {
            const resProfiles = await apiClient.get(API_ENDPOINTS.TRUSTEE_PROFILES.BASE);
            const profiles = normalizeListResponse(resProfiles.data);
            profiles.forEach(p => {
                if (p.email) profilesMap[p.email] = p;
            });
        } catch (e) {
            console.error("Failed to fetch trustee profiles", e);
        }

        // Merge
        const enriched = users.map(u => ({
          ...u,
          profile: profilesMap[u.email] || null
        }));

        if (isMounted) setTrustees(enriched);
      } catch (error) {
        console.error("Failed to load trustees:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchTrustees();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Trustees Management</h1>
          <p className="premium-subtitle">Manage Volunteer, Advisor, and Board Trustees for the platform.</p>
        </div>
        <Link to="/admin/add-trustee" className="premium-btn premium-btn-primary">
          <FiUserPlus /> Add Trustee
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : trustees.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--bg-surface)", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
          <FiShield style={{ fontSize: "48px", color: "var(--text-muted)", marginBottom: "16px" }} />
          <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>No Trustees Found</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>There are currently no trustees assigned in the system.</p>
          <Link to="/admin/add-trustee" className="premium-btn premium-btn-primary">Add Your First Trustee</Link>
        </div>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Trustee</th>
                <th>Email</th>
                <th>Type</th>
                <th>Organization</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trustees.map(t => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary-color)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                        {(t.first_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: "500", color: "var(--text-primary)" }}>
                        {`${t.first_name || ""} ${t.last_name || ""}`.trim() || "N/A"}
                      </span>
                    </div>
                  </td>
                  <td>{t.email}</td>
                  <td>
                    {t.profile?.trustee_type === "VOLUNTEER" ? (
                      <span className="premium-badge premium-badge-green">
                        <FiShield style={{ marginRight: "4px" }} /> Volunteer
                      </span>
                    ) : t.profile?.trustee_type === "ADVISOR" ? (
                      <span className="premium-badge premium-badge-indigo">
                        <FiShield style={{ marginRight: "4px" }} /> Advisor
                      </span>
                    ) : t.profile?.trustee_type === "TRUSTEE" ? (
                      <span className="premium-badge premium-badge-primary">
                        <FiShield style={{ marginRight: "4px" }} /> Board Trustee
                      </span>
                    ) : (
                      <span className="premium-badge premium-badge-gray">
                        UNKNOWN
                      </span>
                    )}
                  </td>
                  <td>{t.profile?.organization || <span style={{ color: "var(--text-muted)" }}>-</span>}</td>
                  <td>
                    <span style={{
                      background: t.is_active ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      color: t.is_active ? "#10b981" : "#ef4444",
                      padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold"
                    }}>
                      {t.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link to={`/admin/trustee-details/${t.id}`} className="premium-btn premium-btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }}>
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Trustees;
