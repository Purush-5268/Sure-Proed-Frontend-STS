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
          setHasEnrollment(enrollment.isEnrolled);

          let resolvedCohort = null;
          // First check if the API returns a cohort directly for this student
          const cohortList = Array.isArray(cohortRes.data?.results) ? cohortRes.data.results : (Array.isArray(cohortRes.data) ? cohortRes.data : []);
          if (cohortList.length > 0) {
            resolvedCohort = cohortList[0];
          } else if (enrollment.isEnrolled && enrollment.application?.assigned_cohort) {
            // Fallback: assigned_cohort might be an object or a UUID string
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
                <span className="premium-badge premium-badge-active">
                  {cohort.mentors && cohort.mentors.length > 0
                    ? cohort.mentors.map(m => `${m.first_name || ""} ${m.last_name || ""}`).join(", ")
                    : (cohort.active_mentor ? `${cohort.active_mentor.first_name || ""} ${cohort.active_mentor.last_name || ""}` : "Unassigned")}
                </span>
              </div>

              <div className={styles.infoBox}>
                <h3>Current Stage</h3>
                <span style={{ backgroundColor: "#dbeafe", color: "#1e40af", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>
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
                  <strong>{cohort.course_name || cohort.course?.name || "Unknown Course"}</strong><br/>
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

            <div style={{ marginTop: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {cohort.id && (
                <Link to={`/student/cohort-chat/${cohort.id}`} className={styles.button} style={{ flex: 1, textAlign: "center", backgroundColor: "#2563eb", color: "white" }}>
                  💬 Cohort Chat
                </Link>
              )}
              <Link to="/student/class-schedule" className={styles.button}>
                View Class Schedule
              </Link>
              <Link to="/student/mentor-details" className={styles.button}>
                Mentor Details
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MyCohort;