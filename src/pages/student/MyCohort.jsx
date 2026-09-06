import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./MyCohort.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiMessageSquare, FiCalendar, FiUser, FiChevronRight } from "react-icons/fi";

function MyCohort() {
  const { user, profile: cachedProfile } = useAuth();
  
  // Fast-track state from cachedProfile to render hero/cohort card immediately on Frame 1
  const initialAssigned = cachedProfile?.current_application?.assigned_cohort;
  const initialCohort = initialAssigned && typeof initialAssigned === 'object'
    ? initialAssigned
    : (cachedProfile?.cohort && typeof cachedProfile.cohort === 'object' ? cachedProfile.cohort : null);

  const [cohort, setCohort] = useState(initialCohort);
  const [hasEnrollment, setHasEnrollment] = useState(Boolean(initialCohort || cachedProfile?.current_application || cachedProfile?.course_name));
  const [enrollmentStatus, setEnrollmentStatus] = useState(cachedProfile?.current_application?.status || null);
  const [mentorsMap, setMentorsMap] = useState({});
  const [loading, setLoading] = useState(!initialCohort);

  useEffect(() => {
    let isMounted = true;
    const loadCohort = async () => {
      try {
        const [profileData, appRes, coursesRes, mentorsRes] = await Promise.all([
          cachedProfile
            ? Promise.resolve(cachedProfile)
            : (user?.email ? studentService.getProfile(user.email).catch(() => null) : Promise.resolve(null)),
          apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/").catch(() => ({ data: [] })),
          courseService.getCourses().catch(() => []),
          apiClient.get(API_ENDPOINTS.MENTORS?.BASE || "/api/volunteers/mentor-profiles/").catch(() => ({ data: [] }))
        ]);

        const apps = Array.isArray(appRes?.data?.results) ? appRes.data.results : appRes?.data || [];
        const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);
        
        const allMentors = Array.isArray(mentorsRes?.data?.results) ? mentorsRes.data.results : (Array.isArray(mentorsRes?.data) ? mentorsRes.data : []);
        const mentorMap = {};
        allMentors.forEach(m => {
          if (m.user) mentorMap[m.user] = m;
          if (m.id) mentorMap[m.id] = m;
        });

        let resolvedCohort = null;
        let enrollmentStatusValue = null;

        if (isMounted) {
          const enrollment = resolveStudentEnrollment(profileData, apps, courses);
          setHasEnrollment(enrollment.isEnrolled);
          if (enrollment.status) {
             enrollmentStatusValue = enrollment.status;
             setEnrollmentStatus(enrollment.status);
          }

          if (enrollment.isEnrolled) {
            // Check various places for the precise cohort ID or object
            const ac = enrollment.application?.assigned_cohort ||
                       profileData?.current_application?.assigned_cohort ||
                       profileData?.cohort ||
                       profileData?.course_batch;
                       
            if (ac) {
              if (typeof ac === 'string' || typeof ac === 'number') {
                try {
                  const singleRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(ac)).catch(() => null);
                  if (singleRes && singleRes.data) {
                    resolvedCohort = singleRes.data;
                  } else {
                    throw new Error("Fallback to list search");
                  }
                } catch (e) {
                  try {
                    const listRes = await apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { search: ac } }).catch(() => ({ data: [] }));
                    const results = Array.isArray(listRes?.data?.results) ? listRes.data.results : (Array.isArray(listRes?.data) ? listRes.data : []);
                    const matchedCohort = results.find(c => c.code === ac || c.id === ac || c.name === ac);
                    if (matchedCohort) {
                      resolvedCohort = matchedCohort;
                    }
                  } catch (err2) {
                    console.error("Failed to fetch assigned cohort");
                  }
                }
              } else {
                resolvedCohort = ac;
              }
            }
          }

          if (resolvedCohort && Array.isArray(resolvedCohort.mentors) && resolvedCohort.mentors.length > 0) {
            const missingIds = resolvedCohort.mentors.filter(id => !mentorMap[id]);
            if (missingIds.length > 0) {
              const missingRes = await Promise.all(missingIds.map(id => {
                const url = API_ENDPOINTS.MENTORS?.PROFILE_BY_USER ? API_ENDPOINTS.MENTORS.PROFILE_BY_USER(id) : `/api/volunteers/mentor-profiles/?user=${id}`;
                return apiClient.get(url).catch(() => null);
              }));
              missingRes.forEach(r => {
                if (r && r.data) {
                  const results = Array.isArray(r.data.results) ? r.data.results : (Array.isArray(r.data) ? r.data : [r.data]);
                  results.forEach(m => {
                     if (m && m.user) mentorMap[m.user] = m;
                     if (m && m.id) mentorMap[m.id] = m;
                  });
                }
              });
            }
          }
          
          setMentorsMap(mentorMap);

          if (resolvedCohort) {
            // Attempt to resolve course name if it's just an ID
            if (resolvedCohort.course && typeof resolvedCohort.course === 'string') {
              const matchedCourse = courses.find(c => c.id === resolvedCohort.course);
              if (matchedCourse) {
                resolvedCohort.course_name = matchedCourse.name;
              }
            }
          }
          setCohort(resolvedCohort);
        }
      } catch (err) {
        console.error("Failed to load student cohort:", err);
        if (isMounted) {
          setCohort({ name: "ERROR", error: err.message || err.toString(), stack: err.stack });
          setHasEnrollment(true); // force display
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCohort();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className={styles.page}>
      {enrollmentStatus === "COMPLETED" && (
        <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', padding: '20px 24px', borderRadius: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '32px' }}>🎉</div>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Congratulations! Your Cohort is Completed</h2>
            <p style={{ margin: 0, opacity: 0.9 }}>You have successfully completed this program.</p>
          </div>
        </div>
      )}
      <div className="premium-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '16px' }}>
          <h1 style={{ color: 'var(--primary-color)', margin: 0 }}>My Internship Group</h1>
          {hasEnrollment && (
            <div style={{ padding: '8px 16px', borderRadius: '12px', background: 'var(--bg-nested)', border: '1px solid var(--border-color)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              Status: {enrollmentStatus ? enrollmentStatus.replace(/_/g, " ") : "Active"}
            </div>
          )}
        </div>

        <p className={styles.subtitle}>
          Your group and mentor details.
        </p>

        {loading ? (
          <SkeletonLoader variant="detail" />
        ) : !hasEnrollment ? (
          <p>You do not have an active enrollment yet. Complete your profile and verification to get started.</p>
        ) : !cohort ? (
          <p>No group has been assigned to you yet. An admin or mentor will create one soon.</p>
        ) : (
          <>
            <h2 style={{ fontSize: '1.2rem', margin: '1.5rem 0 1rem 0', color: 'var(--text-primary)' }}>Cohort Information</h2>
            <div className={styles.infoGrid}>
              {cohort.error && (
                <div className={styles.infoBox}>
                  <h3>Error Details</h3>
                  <p style={{ color: 'red', fontWeight: 'bold' }}>{cohort.error}</p>
                  <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: 'red' }}>{cohort.stack}</pre>
                </div>
              )}

              <div className={styles.infoBox}>
                <h3>Mentor(s)</h3>
                <Link to="/student/mentor-details" className="premium-badge premium-badge-active" style={{ textDecoration: 'none', display: 'inline-block' }}>
                  {(() => {
                    if (cohort.active_mentors && cohort.active_mentors.length > 0) {
                      return cohort.active_mentors.map(m => `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.name || m.email || "Mentor").join(", ");
                    }
                    if (cohort.mentors && cohort.mentors.length > 0) {
                      if (typeof cohort.mentors[0] === 'object') {
                        return cohort.mentors.map(m => `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Mentor").join(", ");
                      } else {
                        const names = cohort.mentor_name && cohort.mentor_name !== "Not assigned" 
                          ? cohort.mentor_name.split(',').map(n => n.trim()) 
                          : [];
                        return cohort.mentors.map((id, i) => {
                          const m = mentorsMap[id];
                          if (m) return `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Assigned Mentor";
                          return names[i] || "Assigned Mentor";
                        }).join(", ");
                      }
                    } else if (cohort.mentor_name && cohort.mentor_name !== "Not assigned") {
                      return cohort.mentor_name;
                    }
                    return cohort.active_mentor ? `${cohort.active_mentor.first_name || ""} ${cohort.active_mentor.last_name || ""}`.trim() || "Assigned" : "Unassigned";
                  })()}
                </Link>
              </div>

              <div className={styles.infoBox}>
                <h3>Current Stage</h3>
                <span style={{ backgroundColor: "var(--status-info-bg)", color: "var(--status-info-text)", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                  {cohort.status || "DRAFT"}
                </span>
              </div>

              <div className={styles.infoBox}>
                <h3>Duration</h3>
                <p>{cohort.start_date || "N/A"} &rarr; {cohort.end_date || "N/A"}</p>
              </div>

              <div className={styles.infoBox} style={{ gridColumn: '1 / -1' }}>
                <h3>Course</h3>
                <p>
                  <strong>{cohort.course_name || cohort.course?.name || "Unknown Course"}</strong><br />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    ID: {typeof cohort.course === 'string' ? cohort.course : (cohort.course?.id || "N/A")}
                  </span>
                </p>
              </div>

              <div className={styles.infoBox} style={{ gridColumn: '1 / -1' }}>
                <h3>Meeting</h3>
                <p>
                  {cohort.meeting_link || cohort.google_meet_link ? (
                    <a href={cohort.meeting_link || cohort.google_meet_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-color)", fontWeight: "bold", textDecoration: "underline" }}>
                      Join Class Meeting
                    </a>
                  ) : "Not configured"}
                </p>
              </div>
            </div>

            <h2 style={{ fontSize: '1.2rem', margin: '1.75rem 0 1rem 0', color: 'var(--text-primary)' }}>Quick Actions</h2>
            <div className={styles.actionGrid}>
              {cohort.id && (
                <Link to={`/student/cohort-chat/${cohort.id}`} className={styles.actionCard}>
                  <div className={styles.actionIcon}><FiMessageSquare /></div>
                  <div className={styles.actionContent}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Cohort Chat</h3>
                    <p>Talk with your cohort</p>
                  </div>
                  <div className={styles.actionChevron}><FiChevronRight /></div>
                </Link>
              )}
              
              <Link to="/student/class-schedule" className={styles.actionCard}>
                <div className={styles.actionIcon}><FiCalendar /></div>
                <div className={styles.actionContent}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Class Schedule</h3>
                  <p>View upcoming classes</p>
                </div>
                <div className={styles.actionChevron}><FiChevronRight /></div>
              </Link>
              
              <Link to="/student/mentor-details" className={styles.actionCard}>
                <div className={styles.actionIcon}><FiUser /></div>
                <div className={styles.actionContent}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Mentor Details</h3>
                  <p>View mentor information</p>
                </div>
                <div className={styles.actionChevron}><FiChevronRight /></div>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MyCohort;