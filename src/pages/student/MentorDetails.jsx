import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiMail, FiPhone, FiAward, FiClock, FiBriefcase, FiLinkedin, FiAlertCircle } from "react-icons/fi";
import styles from "./MentorDetails.module.css";

function MentorDetails() {
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
            // Find the active mentor or first mentor
            const m = resolvedCohort.active_mentor || (resolvedCohort.mentors && resolvedCohort.mentors.length > 0 ? resolvedCohort.mentors[0] : null);
            setMentor(m);
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

  const fullName = `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email || "Unknown Mentor";
  const avatarUrl = mentor.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563eb&color=fff&size=180`;

  return (
    <div className={styles.page}>
      <div className="premium-card">

        <div className={styles.profile}>
          <img src={avatarUrl} alt="Mentor Avatar" />
          <h1>{fullName}</h1>
          <p>{mentor.designation || "Internship Mentor"}</p>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.infoBox}>
            <h3><FiMail style={{ marginRight: "8px" }}/> Email</h3>
            <p>{mentor.email || "N/A"}</p>
          </div>

          <div className={styles.infoBox}>
            <h3><FiPhone style={{ marginRight: "8px" }}/> Phone</h3>
            <p>{mentor.phone || mentor.phone_number || "N/A"}</p>
          </div>

          <div className={styles.infoBox}>
            <h3><FiAward style={{ marginRight: "8px" }}/> Experience</h3>
            <p>{mentor.experience ? `${mentor.experience} Years` : "N/A"}</p>
          </div>

          <div className={styles.infoBox}>
            <h3><FiBriefcase style={{ marginRight: "8px" }}/> Specialization</h3>
            <p>{mentor.specialization || mentor.expertise || "General"}</p>
          </div>

          <div className={styles.infoBox}>
            <h3><FiClock style={{ marginRight: "8px" }}/> Office Hours</h3>
            <p>{mentor.office_hours || "Scheduled via classes"}</p>
          </div>

          <div className={styles.infoBox}>
            <h3><FiLinkedin style={{ marginRight: "8px" }}/> LinkedIn</h3>
            {mentor.linkedin ? (
              <a href={mentor.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-color)", fontWeight: "bold" }}>
                View Profile
              </a>
            ) : (
              <p>Not Available</p>
            )}
          </div>
        </div>

        <div className={styles.buttons}>
          <Link
            to="/student/attendance"
            className={styles.button}
          >
            View Attendance
          </Link>
        </div>

      </div>
    </div>
  );
}

export default MentorDetails;