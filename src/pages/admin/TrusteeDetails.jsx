import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiShield, FiCheck } from "react-icons/fi";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function TrusteeDetails() {
  const navigate = useNavigate();
  const { id } = useParams(); // This is the user.id from the URL
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cohorts, setCohorts] = useState([]);
  const [selectedCohorts, setSelectedCohorts] = useState(new Set());
  const [savingCohorts, setSavingCohorts] = useState(false);


  useEffect(() => {
    let isMounted = true;

    const fetchTrusteeData = async () => {
      try {
        setLoading(true);

       
        // Fetch User object
        const [userRes, assignRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.USERS.BY_ID(id)),
          apiClient.get(`/api/users/${id}/assign-cohorts/`).catch(() => ({ data: [] }))
        ]);
        const userData = userRes.data;
        const allCohorts = assignRes.data;
        
        const userCohortIds = new Set();
        allCohorts.forEach(c => {
          if (c.assigned_to_current_volunteer) {
            userCohortIds.add(c.id);
          }
        });

        if (isMounted) {
          setUser(userData);
          setProfile(null);
          setCohorts(allCohorts);
          setSelectedCohorts(userCohortIds);
        }

      } catch (err) {
        console.error("Failed to fetch trustee details:", err);
        if (isMounted) {
          setError("Failed to load trustee information.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) {
      fetchTrusteeData();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  
  const handleToggleCohort = (cohortId) => {
    const next = new Set(selectedCohorts);
    if (next.has(cohortId)) next.delete(cohortId);
    else next.add(cohortId);
    setSelectedCohorts(next);
  };

  const handleSaveCohorts = async () => {
    setSavingCohorts(true);
    try {
      await apiClient.post(`/api/users/${id}/assign-cohorts/`, {
        cohort_ids: Array.from(selectedCohorts)
      });
      alert("Cohort assignments updated successfully!");
    } catch (err) {
      alert("Failed to assign cohorts: " + (err.response?.data?.detail || err.message));
    } finally {
      setSavingCohorts(false);
    }
  };

  if (loading) {
    return (
      <div className="premium-page-container">
        <div className="premium-page-header">
          <div>
            <SkeletonLoader variant="text" width="200px" height="32px" />
            <SkeletonLoader variant="text" width="300px" height="20px" />
          </div>
          <Link to="/admin/trustees" className="premium-btn premium-btn-secondary">
            <FiArrowLeft /> Back
          </Link>
        </div>
        <SkeletonLoader variant="card" rows={6} />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="premium-page-container">
        <div className="premium-page-header">
          <div>
            <h1 className="premium-title">Trustee Details</h1>
          </div>
          <Link to="/admin/trustees" className="premium-btn premium-btn-secondary">
            <FiArrowLeft /> Back
          </Link>
        </div>
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">❌</div>
          <h3>Error</h3>
          <p>{error || "Trustee not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Trustee Details</h1>
          <p className="premium-subtitle">View profile and organization information.</p>
        </div>
        <Link to="/admin/trustees" className="premium-btn premium-btn-secondary">
          <FiArrowLeft /> Back to List
        </Link>
      </div>

      <div className="premium-card">
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px", borderBottom: "1px solid var(--border-color)", paddingBottom: "24px" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "var(--primary-color)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: "bold" }}>
            {(user.first_name || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ color: "var(--text-primary)", fontSize: "24px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
              {`${user.first_name || ""} ${user.last_name || ""}`.trim() || "N/A"}
              {profile?.is_active && (
                <span style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>
                  ACTIVE
                </span>
              )}
            </h2>
            <p style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
              <FiShield /> {
                (user?.role === "ADVISOR" || (user?.role === "TRUSTEE" && user?.admin_category === "ADVISORY")) ? "Advisor" :
                user?.role === "VOLUNTEER" ? "Volunteer" :
                user?.role === "TRUSTEE" ? "Trustee" :
                "No Type Assigned"
              }
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div>
            <h3 style={{ fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Contact Info</h3>
            <div style={{ background: "var(--bg-nested)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <p style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}><strong>Email:</strong> {user.email}</p>
              <p style={{ margin: 0, color: "var(--text-primary)" }}><strong>Phone:</strong> {user.phone_number || "N/A"}</p>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Organization Details</h3>
            <div style={{ background: "var(--bg-nested)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <p style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}><strong>Organization:</strong> N/A (Backend update required)</p>
              <p style={{ margin: 0, color: "var(--text-primary)" }}><strong>Designation:</strong> N/A (Backend update required)</p>
            </div>
          </div>
        </div>
        
        <div style={{ marginTop: "32px" }}>
          <h3 style={{ fontSize: "16px", color: "var(--text-primary)", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>Assigned Cohorts</h3>
          {user?.role === "VOLUNTEER" || user?.role === "TRUSTEE" ? (
            <>
              {(() => {
                const grouped = cohorts.reduce((acc, c) => {
                  const cat = (c.category || "OTHER").toUpperCase();
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(c);
                  return acc;
                }, {});

                return Object.entries(grouped).map(([category, catCohorts]) => (
                  <div key={category} style={{ marginBottom: "24px" }}>
                    <h4 style={{ fontSize: "14px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
                      {category} - COHORTS
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
                      {catCohorts.map(c => (
                        <label key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", background: "var(--bg-nested)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                          <input 
                            type="checkbox" 
                            checked={selectedCohorts.has(c.id)}
                            onChange={() => handleToggleCohort(c.id)}
                            style={{ marginTop: "4px" }}
                          />
                          <div>
                            <div style={{ fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                              {c.name || c.code}
                              {selectedCohorts.has(c.id) && (
                                <span style={{ fontSize: "10px", backgroundColor: "#d1fae5", color: "#059669", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
                                  Assigned
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{c.course_name}</div>
                            {c.all_assigned_volunteers && c.all_assigned_volunteers.length > 0 && (
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                                <strong>Assigned to:</strong> {c.all_assigned_volunteers.join(", ")}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ));
              })()}
              <button 
                onClick={handleSaveCohorts}
                disabled={savingCohorts}
                className="premium-btn premium-btn-primary"
              >
                {savingCohorts ? "Saving..." : "Save Cohort Assignments"}
              </button>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>Cohort assignment is only available for Volunteers and Trustees.</p>
          )}
        </div>
        
        {/* Danger Zone */}
        {user?.role === "VOLUNTEER" && (
          <div style={{ marginTop: "40px", padding: "20px", border: "1px solid #ef4444", borderRadius: "12px", background: "rgba(239, 68, 68, 0.05)" }}>
            <h3 style={{ fontSize: "16px", color: "#ef4444", marginBottom: "8px" }}>Volunteer Access</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "16px" }}>
              This account currently has Volunteer permissions.
            </p>
            <button 
              onClick={async () => {
                const confirmed = window.confirm(
                  "Are you sure you want to remove Volunteer access?\n\n" +
                  "The Volunteer access will be revoked, but the person's Student account, profiles, and existing historical data are preserved.\n\n" +
                  "They will return to normal Student access."
                );
                if (confirmed) {
                  try {
                    await apiClient.post(`/api/users/${id}/revoke-volunteer/`);
                    alert("Volunteer access removed successfully.");
                    window.location.reload();
                  } catch (err) {
                    alert("Failed to remove access: " + (err.response?.data?.detail || err.message));
                  }
                }
              }}
              className="premium-btn" 
              style={{ background: "#ef4444", color: "white", border: "none" }}
            >
              Remove Volunteer Access
            </button>
          </div>
        )}

      </div>
    </div>
  );

}

export default TrusteeDetails;

