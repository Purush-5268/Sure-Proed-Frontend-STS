import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiMail, FiPhone, FiAward, FiClock, FiBriefcase, FiLinkedin, FiAlertCircle } from "react-icons/fi";
import styles from "./MentorDetails.module.css";

function MentorDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile: cachedProfile } = useAuth();
  const [mentor, setMentor] = useState(null);
  const [cohortInfo, setCohortInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMentorId, setSelectedMentorId] = useState(location.state?.mentorId || null);

  useEffect(() => {
    let isMounted = true;
    const loadMentor = async () => {
      try {
        const [profileData, appRes, coursesRes, cohortRes] = await Promise.all([
          cachedProfile ? Promise.resolve(cachedProfile) : (user?.email ? studentService.getProfile(user.email) : Promise.resolve(null)),
          apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/"),
          courseService.getCourses(),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE)
        ]);
        
        const apps = Array.isArray(appRes.data?.results) ? appRes.data.results : appRes.data || [];
        const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);
        
        if (isMounted) {
          const enrollment = resolveStudentEnrollment(profileData, apps, courses);
          
          let resolvedCohort = null;
          
          if (enrollment.isEnrolled && enrollment.application?.assigned_cohort) {
            const ac = enrollment.application.assigned_cohort;
            if (typeof ac === 'string') {
              try {
                const singleRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(ac));
                resolvedCohort = singleRes.data;
              } catch (e) {
                console.error("Failed to fetch assigned cohort by ID");
              }
            } else {
              resolvedCohort = ac;
            }
          }
          
          if (!resolvedCohort) {
            const cohortList = Array.isArray(cohortRes.data?.results) ? cohortRes.data.results : (Array.isArray(cohortRes.data) ? cohortRes.data : []);
            if (cohortList.length > 0) {
              resolvedCohort = cohortList[0];
            }
          }

          if (resolvedCohort) {
            setCohortInfo(resolvedCohort);
            let mList = resolvedCohort.mentors && resolvedCohort.mentors.length > 0 
                ? resolvedCohort.mentors 
                : (resolvedCohort.active_mentor ? [resolvedCohort.active_mentor] : []);
            
            const fetchedMentors = await Promise.all(mList.map(async (mId) => {
               if (typeof mId === 'object') return mId;
               try {
                 const url = API_ENDPOINTS.MENTORS?.PROFILE_BY_USER ? API_ENDPOINTS.MENTORS.PROFILE_BY_USER(mId) : `/api/volunteers/mentor-profiles/?user=${mId}`;
                 const res = await apiClient.get(url);
                 const results = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : [res.data]);
                 const profile = results.find(p => p.user === mId || p.id === mId);
                 if (profile) return profile;
                 
                 // Fallback if profile not found
                 const fallbackNames = resolvedCohort.mentor_name && resolvedCohort.mentor_name !== "Not assigned" ? resolvedCohort.mentor_name.split(',').map(n => n.trim()) : [];
                 const fallbackIndex = mList.indexOf(mId);
                 return { id: mId, first_name: fallbackNames[fallbackIndex] || "Assigned Mentor" };
               } catch (e) {
                 const fallbackNames = resolvedCohort.mentor_name && resolvedCohort.mentor_name !== "Not assigned" ? resolvedCohort.mentor_name.split(',').map(n => n.trim()) : [];
                 const fallbackIndex = mList.indexOf(mId);
                 return { id: mId, first_name: fallbackNames[fallbackIndex] || "Assigned Mentor" };
               }
            }));
            
            setMentor(fetchedMentors);
          }
        }
      } catch (err) {
        console.error("Failed to load mentor:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMentor();
    return () => { isMounted = false; };
  }, [user]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="premium-card">
          <SkeletonLoader variant="detail" rows={5} />
        </div>
      </div>
    );
  }

  if (!mentor || mentor.length === 0) {
    return (
      <div className={styles.page}>
        <div className="premium-card" style={{ textAlign: "center", padding: "40px" }}>
          <FiAlertCircle size={48} color="var(--warning-color)" style={{ marginBottom: "16px" }} />
          <h2>No Mentor Assigned</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            You have not been assigned a mentor yet. Please check back later.
          </p>
          <Link to="/student/dashboard" className="premium-btn premium-btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const mentorsList = Array.isArray(mentor) ? mentor : [mentor];

  if (selectedMentorId) {
    const m = mentorsList.find(x => x.id === selectedMentorId || x.user === selectedMentorId) || mentorsList[0];
    if (!m) return null;
    const fullName = `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || m.name || m.username || "Unknown Mentor";
    const avatarUrl = m.profile_picture || m.photo || m.profile_photo || m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563eb&color=fff&size=180`;
    const isCurrentMentor = cohortInfo?.current_mentor_details && (m.id === cohortInfo.current_mentor_details.id || m.email === cohortInfo.current_mentor_details.email);

    return (
      <div className={styles.page}>
        <div className="premium-card" style={{ marginBottom: '24px', position: 'relative' }}>
          <button 
            onClick={() => setSelectedMentorId(null)} 
            style={{ position: 'absolute', top: '24px', left: '24px', background: 'var(--bg-nested)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontWeight: 'bold' }}
          >
            ← Back to Mentors List
          </button>
          
          <div className={styles.profile} style={{ marginTop: '40px' }}>
            <img src={avatarUrl} alt={`${fullName}'s profile`} width="140" height="140" loading="lazy" decoding="async" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '12px' }}>
              <h2 style={{ margin: 0 }}>{fullName}</h2>
              {isCurrentMentor && (
                <span style={{ fontSize: '12px', background: '#f59e0b', color: 'white', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ★ Current Mentor
                </span>
              )}
            </div>
            <p>{m.designation || "Internship Mentor"}</p>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoBox}>
              <h3><FiMail style={{ marginRight: "8px" }}/> Email</h3>
              <p>{m.email || "N/A"}</p>
            </div>

            <div className={styles.infoBox}>
              <h3><FiPhone style={{ marginRight: "8px" }}/> Phone</h3>
              <p>{m.phone || m.phone_number || "N/A"}</p>
            </div>

            <div className={styles.infoBox}>
              <h3><FiAward style={{ marginRight: "8px" }}/> Experience</h3>
              <p>{m.experience ? `${m.experience} Years` : "N/A"}</p>
            </div>

            <div className={styles.infoBox}>
              <h3><FiBriefcase style={{ marginRight: "8px" }}/> Specialization</h3>
              <p>{m.specialization || m.expertise || "General"}</p>
            </div>

            <div className={styles.infoBox}>
              <h3><FiClock style={{ marginRight: "8px" }}/> Office Hours</h3>
              <p>{m.office_hours || "Scheduled via classes"}</p>
            </div>

            <div className={styles.infoBox}>
              <h3><FiLinkedin style={{ marginRight: "8px" }}/> LinkedIn</h3>
              {m.linkedin || m.linkedin_url ? (
                <a href={m.linkedin || m.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-color)", fontWeight: "bold" }}>
                  View Profile
                </a>
              ) : (
                <p>Not Available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div style={{ textAlign: 'left', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Cohort Mentors</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', margin: 0 }}>Select a mentor to view their detailed professional profile.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px', width: '100%' }}>
        {mentorsList.map((m, idx) => {
          const fullName = `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || m.name || m.username || "Unknown Mentor";
          const avatarUrl = m.profile_picture || m.photo || m.profile_photo || m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563eb&color=fff&size=180`;
          const isCurrentMentor = cohortInfo?.current_mentor_details && (m.id === cohortInfo.current_mentor_details.id || m.email === cohortInfo.current_mentor_details.email);

          return (
            <div 
              key={m.id || idx} 
              onClick={() => setSelectedMentorId(m.id || m.user)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '20px', 
                padding: '20px', 
                background: isCurrentMentor ? 'rgba(245, 158, 11, 0.05)' : 'var(--student-glass-bg, var(--bg-surface))', 
                border: isCurrentMentor ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)', 
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: 'var(--student-card-shadow, 0 4px 12px rgba(0,0,0,0.05))',
                backdropFilter: 'blur(12px)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--student-card-hover-shadow, 0 8px 24px rgba(0,0,0,0.1))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--student-card-shadow, 0 4px 12px rgba(0,0,0,0.05))'; }}
            >
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border-color)', flexShrink: 0 }}>
                <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>{fullName}</h3>
                  {isCurrentMentor && (
                    <span style={{ fontSize: '11px', background: '#f59e0b', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ★ Current Mentor
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{m.designation || "Internship Mentor"}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  {m.specialization && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FiBriefcase /> {m.specialization}</span>}
                  {m.experience && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FiAward /> {m.experience} Years</span>}
                </div>
              </div>
              <div style={{ color: 'var(--primary-color)', fontWeight: 'bold', paddingLeft: '16px', whiteSpace: 'nowrap' }}>
                View Profile &rarr;
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '40px', display: 'flex', gap: '16px', justifyContent: 'flex-start' }}>
        <Link to="/student/cohort" className="premium-btn" style={{ background: 'var(--bg-nested)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', textDecoration: 'none' }}>
          Back to Cohort
        </Link>
        <Link to="/student" className="premium-btn premium-btn-primary" style={{ textDecoration: 'none' }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default MentorDetails;