import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { getAnnouncements, getUpdates } from "../../services/trusteeService";
import { 
  FaUsers, 
  FaUserGraduate, 
  FaBullhorn, 
  FaBriefcase, 
  FaShieldAlt, 
  FaArrowRight,
  FaCalendarAlt
} from "react-icons/fa";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Dashboard.module.css";

function AdvisorDashboard() {
  const { user } = useAuth();
  const userName = user?.firstName || user?.first_name || "Advisor";

  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [updatesCount, setUpdatesCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboardData() {
      try {
        const [cohortsRes, appsRes, announcementsRes, updatesRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COHORTS.BASE).catch(() => ({ data: [] })),
          apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE).catch(() => ({ data: [] })),
          getAnnouncements().catch(() => ({ results: [] })),
          getUpdates().catch(() => ({ results: [] })),
        ]);

        if (isMounted) {
          const cohortsList = normalizeListResponse(cohortsRes.data);
          const appsList = normalizeListResponse(appsRes.data);
          const announcementsList = announcementsRes.results || (Array.isArray(announcementsRes) ? announcementsRes : []);
          const updatesList = updatesRes.results || (Array.isArray(updatesRes) ? updatesRes : []);

          setBatches(cohortsList);
          setStudentsCount(appsList.length);
          setAnnouncements(announcementsList);
          setUpdatesCount(updatesList.length);
        }
      } catch (err) {
        console.error("Error fetching advisor dashboard data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDashboardData();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className={styles.container}>
      {/* Hero Welcome Banner */}
      <div className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <FaShieldAlt /> Strategic Advisory Portal
          </div>
          <h1>Welcome, {userName}</h1>
          <p>
            Review academic progression across your assigned cohorts, monitor student milestones, and stay connected with organizational initiatives.
          </p>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>{batches.length}</span>
            <span className={styles.statLabel}>Assigned Batches</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>{studentsCount}</span>
            <span className={styles.statLabel}>Total Students</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statNumber}>{announcements.length}</span>
            <span className={styles.statLabel}>Announcements</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Grid */}
      <div className={styles.grid}>
        <Link to="/trustee/advisor/batches" className="premium-card" style={{ textDecoration: "none" }}>
          <div className={styles.cardIconWrapper} style={{ background: "rgba(99, 102, 241, 0.15)", color: "#4f46e5" }}>
            <FaUsers />
          </div>
          <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>Assigned Batches</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            View and inspect active training programs, schedules, and curriculum details for your cohorts.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1rem", color: "#4f46e5", fontWeight: "600", fontSize: "0.9rem" }}>
            View Batches <FaArrowRight size={12} />
          </div>
        </Link>

        <Link to="/trustee/advisor/students" className="premium-card" style={{ textDecoration: "none" }}>
          <div className={styles.cardIconWrapper} style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
            <FaUserGraduate />
          </div>
          <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>Assigned Students</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            Access enrollment records, academic standings, and learner profiles across your assigned cohorts.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1rem", color: "#10b981", fontWeight: "600", fontSize: "0.9rem" }}>
            View Students <FaArrowRight size={12} />
          </div>
        </Link>

        <Link to="/trustee/advisor/announcements" className="premium-card" style={{ textDecoration: "none" }}>
          <div className={styles.cardIconWrapper} style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
            <FaBullhorn />
          </div>
          <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>Announcements</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            Stay updated with organization-wide communications, notifications, and scheduled events.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1rem", color: "#f59e0b", fontWeight: "600", fontSize: "0.9rem" }}>
            View Broadcasts <FaArrowRight size={12} />
          </div>
        </Link>

        <Link to="/trustee/advisor/profile" className="premium-card" style={{ textDecoration: "none" }}>
          <div className={styles.cardIconWrapper} style={{ background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6" }}>
            <FaBriefcase />
          </div>
          <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>Advisor Profile</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            Review your advisory affiliation, mapped communications, and professional credentials.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1rem", color: "#8b5cf6", fontWeight: "600", fontSize: "0.9rem" }}>
            Manage Profile <FaArrowRight size={12} />
          </div>
        </Link>
      </div>

      {/* Overview Tables / Previews */}
      <div className={styles.recentSection}>
        {/* Batches Preview */}
        <div className="premium-card">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Assigned Batches</h2>
            <Link to="/trustee/advisor/batches" className={styles.viewAllLink}>
              View All ({batches.length})
            </Link>
          </div>

          {loading ? (
            <SkeletonLoader variant="table" rows={3} />
          ) : batches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 16px", color: "var(--text-secondary)" }}>
              <p>No cohorts currently assigned to your advisory account.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {batches.slice(0, 4).map((b) => (
                <div 
                  key={b.id} 
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "var(--bg-nested)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                      {b.name || b.code}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <FaCalendarAlt size={10} /> {b.start_date || "TBD"} &bull; {b.course_name || "Course"}
                    </div>
                  </div>
                  <span 
                    style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "#4f46e5"
                    }}
                  >
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Latest Announcements */}
        <div className="premium-card">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Announcements</h2>
            <Link to="/trustee/advisor/announcements" className={styles.viewAllLink}>
              View All ({announcements.length})
            </Link>
          </div>

          {loading ? (
            <SkeletonLoader variant="table" rows={3} />
          ) : announcements.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 16px", color: "var(--text-secondary)" }}>
              <p>No active announcements at this time.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {announcements.slice(0, 4).map((a) => (
                <div 
                  key={a.id} 
                  style={{
                    padding: "12px 16px",
                    background: "var(--bg-nested)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)"
                  }}
                >
                  <div style={{ fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px" }}>
                    {a.title}
                  </div>
                  <div 
                    style={{ 
                      fontSize: "13px", 
                      color: "var(--text-secondary)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden"
                    }}
                  >
                    {a.content || a.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdvisorDashboard;
