import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./MyCohort.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function MyCohort() {
  const { user } = useAuth();
  const [cohort, setCohort] = useState(null);
  const [hasEnrollment, setHasEnrollment] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadCohort = async () => {
      try {
        const [profileData, appRes, coursesRes] = await Promise.all([
          user?.email ? studentService.getProfile(user.email) : Promise.resolve(null),
          apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/"),
          courseService.getCourses()
        ]);
        
        const apps = Array.isArray(appRes.data?.results) ? appRes.data.results : appRes.data || [];
        const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);
        
        if (isMounted) {
          const enrollment = resolveStudentEnrollment(profileData, apps, courses);
          setHasEnrollment(enrollment.isEnrolled);
          setCohort(enrollment.isEnrolled ? (enrollment.application?.assigned_cohort || null) : null);
        }
      } catch (err) {
        console.error("Failed to load student cohort:", err);
        if (isMounted) {
          setCohort(null);
          setHasEnrollment(false);
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
      <div className="premium-card">
        <h1 style={{ color: 'var(--primary-color)' }}>My Internship Group</h1>

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
            <div className={styles.infoGrid}>
              <div className={styles.infoBox}>
                <h3>Group Name</h3>
                <p style={{ fontWeight: 'bold' }}>{cohort.name || cohort.code}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>Mentor</h3>
                <span className="premium-badge premium-badge-active">{cohort.active_mentor ? `${cohort.active_mentor.first_name || ""} ${cohort.active_mentor.last_name || ""}` : "Unassigned"}</span>
              </div>

              <div className={styles.infoBox}>
                <h3>Current Stage</h3>
                <span style={{ backgroundColor: "#dbeafe", color: "#1e40af", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                  {cohort.status || "DRAFT"}
                </span>
              </div>

              <div className={styles.infoBox}>
                <h3>Start Date</h3>
                <p>{cohort.start_date || "N/A"}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>End Date</h3>
                <p>{cohort.end_date || "N/A"}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>Course</h3>
                <p>{cohort.course?.name || cohort.course || "N/A"}</p>
              </div>

              <div className={styles.infoBox}>
                <h3>Meeting Link</h3>
                <p>{cohort.meeting_link || "Not available yet"}</p>
              </div>
            </div>

            <div className={styles.buttons}>
              <Link to="/student/class-schedule" className={styles.button}>
                View Class Schedule
              </Link>
              <Link to="/student/mentor-details" className={styles.button}>
                Mentor Details
              </Link>
              {cohort.meeting_link ? (
                <a href={cohort.meeting_link} target="_blank" rel="noreferrer" className={styles.meetButton}>
                  Join Meeting
                </a>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MyCohort;