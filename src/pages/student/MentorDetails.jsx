import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const { user } = useAuth();
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadMentor = async () => {
      try {
        const [profileData, appRes, coursesRes, cohortRes] = await Promise.all([
          user?.email ? studentService.getProfile(user.email) : Promise.resolve(null),
          apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/"),
          courseService.getCourses(),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE)
        ]);
        
        const apps = Array.isArray(appRes.data?.results) ? appRes.data.results : appRes.data || [];
        const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);
        
        if (isMounted) {
          const enrollment = resolveStudentEnrollment(profileData, apps, courses);
          
          let resolvedCohort = null;
          const cohortList = Array.isArray(cohortRes.data?.results) ? cohortRes.data.results : (Array.isArray(cohortRes.data) ? cohortRes.data : []);
          if (cohortList.length > 0) {
            resolvedCohort = cohortList[0];
          } else if (enrollment.isEnrolled && enrollment.application?.assigned_cohort) {
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

          if (resolvedCohort) {
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

  if (!mentor) {
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

  return (
    <div className={styles.page}>
      {mentorsList.map((m, idx) => {
        const fullName = `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || "Unknown Mentor";
        const avatarUrl = m.profile_picture || m.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563eb&color=fff&size=180`;

        return (
          <div key={m.id || idx} className="premium-card" style={{ marginBottom: '24px' }}>
            <div className={styles.profile}>
              <img src={avatarUrl} alt="Mentor Avatar" />
              <h1>{fullName}</h1>
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
        );
      })}

      <div className={styles.buttons}>
        <Link
          to="/student/attendance"
          className={styles.button}
        >
          View Attendance
        </Link>
        <Link to="/student" className={styles.buttonOutline}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default MentorDetails;