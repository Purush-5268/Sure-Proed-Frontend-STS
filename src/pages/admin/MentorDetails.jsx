import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./MentorDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiMail, FiPhone, FiAward, FiBriefcase, FiClock, FiLinkedin } from "react-icons/fi";

function MentorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadMentor = async () => {
      try {
        setLoading(true);
        // Fetch both user object and mentor profile
        const [userRes, profileRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.USERS.BY_ID(id)),
          apiClient.get(API_ENDPOINTS.MENTORS?.PROFILE_BY_USER ? API_ENDPOINTS.MENTORS.PROFILE_BY_USER(id) : `/api/volunteers/mentor-profiles/?user=${id}`).catch(() => ({ data: { results: [] } }))
        ]);
        
        const userData = userRes.data || {};
        const profileData = Array.isArray(profileRes.data?.results) && profileRes.data.results.length > 0 ? profileRes.data.results[0] : (Array.isArray(profileRes.data) && profileRes.data.length > 0 ? profileRes.data[0] : {});

        // Merge them for a complete picture
        setMentor({ ...userData, ...profileData, userObj: userData });
      } catch (err) {
        console.error("Failed to load mentor details:", err);
        setError("Unable to load mentor details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadMentor();
    }
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <h1>Mentor Details</h1>
          <SkeletonLoader variant="detail" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <h1>Mentor Details</h1>
          <p style={{ color: "#b91c1c" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <h1>Mentor Details</h1>
          <p>No mentor found.</p>
        </div>
      </div>
    );
  }

  const fullName = mentor.full_name || `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email || mentor.userObj?.email || "Unknown Mentor";
  const avatarUrl = mentor.profile_photo || mentor.profile_picture || mentor.photo || mentor.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563eb&color=fff&size=180`;
  const isCurrentMentor = Array.isArray(mentor.assigned_cohorts) && mentor.assigned_cohorts.some(c => c.current_mentor === mentor.id || c.current_mentor === mentor.userObj?.id); // The Admin view doesn't have an exact cohort focus, so we check if they are the current mentor for ANY of their assigned cohorts.
  // Wait, `assigned_cohorts` from serializer doesn't include `current_mentor` ID. 
  // For the Admin view, they just want to see the rich details. Let's just render the beautiful UI.

  return (
    <div className={styles.page}>
      <div className="premium-card" style={{ position: 'relative' }}>
        <button 
          onClick={() => navigate(-1)} 
          style={{ position: 'absolute', top: '24px', left: '24px', background: 'var(--bg-nested)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontWeight: 'bold' }}
        >
          ← Back to List
        </button>
        
        <div className={styles.profile} style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={avatarUrl} alt={`${fullName}'s profile`} width="140" height="140" loading="lazy" decoding="async" style={{ borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--border-color)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-primary)' }}>{fullName}</h2>
            {mentor.userObj?.is_active && (
               <span style={{ fontSize: '12px', background: '#10b981', color: 'white', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                 Active Account
               </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginTop: '4px' }}>
            {mentor.designation ? `${mentor.designation} ${mentor.company_name ? `at ${mentor.company_name}` : ''}` : (mentor.userObj?.role === "MENTOR" ? "Mentor Account" : mentor.userObj?.role)}
          </p>
        </div>

        <div className={styles.infoGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '32px' }}>
          <div className={styles.item} style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiMail /> Email
            </h3>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>{mentor.email || mentor.userObj?.email || "N/A"}</p>
          </div>

          <div className={styles.item} style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiPhone /> Phone
            </h3>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>{mentor.phone_number || mentor.userObj?.phone_number || "N/A"}</p>
          </div>

          <div className={styles.item} style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiAward /> Experience
            </h3>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>{mentor.years_of_experience || mentor.experience ? `${mentor.years_of_experience || mentor.experience} Years` : "N/A"}</p>
          </div>

          <div className={styles.item} style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiBriefcase /> Specialization
            </h3>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>{mentor.expertise || mentor.specialization || "General"}</p>
          </div>

          <div className={styles.item} style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiLinkedin /> LinkedIn
            </h3>
            {mentor.linkedin || mentor.linkedin_url ? (
              <a href={mentor.linkedin || mentor.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-color)", fontWeight: "bold", textDecoration: 'none', display: 'inline-block', margin: 0, fontSize: '16px' }}>
                View Profile
              </a>
            ) : (
              <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>Not Available</p>
            )}
          </div>
          
          <div className={styles.item} style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiClock /> Assigned Cohorts
            </h3>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>
              {Array.isArray(mentor.assigned_cohorts) ? mentor.assigned_cohorts.length : 0} Cohort(s)
            </p>
          </div>
        </div>

        <div className={styles.buttons} style={{ marginTop: '40px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <Link to={`/admin/edit-mentor/${mentor.userObj?.id || id}`} className="premium-btn premium-btn-primary" style={{ padding: '10px 24px', textDecoration: 'none', fontSize: '16px', fontWeight: 'bold' }}>
            Edit Mentor Details
          </Link>
        </div>
      </div>
    </div>
  );
}

export default MentorDetails;
