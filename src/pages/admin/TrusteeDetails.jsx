import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiShield } from "react-icons/fi";
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

  useEffect(() => {
    let isMounted = true;

    const fetchTrusteeData = async () => {
      try {
        setLoading(true);

        // Fetch User object
        const userRes = await apiClient.get(API_ENDPOINTS.USERS.BY_ID(id));
        const userData = userRes.data;

        // Fetch Profiles collection to match by email
        const profilesRes = await apiClient.get(API_ENDPOINTS.TRUSTEE_PROFILES.BASE);
        const allProfiles = normalizeListResponse(profilesRes.data);
        const matchedProfile = allProfiles.find(p => p.email === userData.email);

        if (isMounted) {
          setUser(userData);
          setProfile(matchedProfile || null);
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
                profile?.trustee_type === "COMMERCIAL" ? "Trustee" :
                profile?.trustee_type === "VOLUNTEER" ? "Volunteer" :
                profile?.trustee_type === "ADVISOR" ? "Advisor" :
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
              <p style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}><strong>Organization:</strong> {profile?.organization || "N/A"}</p>
              <p style={{ margin: 0, color: "var(--text-primary)" }}><strong>Designation:</strong> {profile?.designation || "N/A"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrusteeDetails;
