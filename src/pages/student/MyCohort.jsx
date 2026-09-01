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
  const { user } = useAuth();
  const [cohort, setCohort] = useState(null);
  const [hasEnrollment, setHasEnrollment] = useState(false);
  const [enrollmentStatus, setEnrollmentStatus] = useState("ACTIVE");
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
          if (enrollment.status) setEnrollmentStatus(enrollment.status);

          let resolvedCohort = null;
          // First check if the API returns a cohort directly for this student
          const cohortList = Array.isArray(cohortRes.data?.results) ? cohortRes.data.results : (Array.isArray(cohortRes.data) ? cohortRes.data : []);
          if (cohortList.length > 0) {
            resolvedCohort = cohortList[0];
          } else if (enrollment.isEnrolled) {
            // Fallback: Check various places for the cohort ID or object
            const ac = enrollment.application?.assigned_cohort || 
                       profileData?.current_application?.assigned_cohort ||
                       profileData?.cohort ||
                       profileData?.course_batch;
                       
            if (ac) {
              if (typeof ac === 'string') {
                try {
                  const singleRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(ac));
                  resolvedCohort = singleRes.data;
                } catch (e) {
                  try {
                    const listRes = await apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { search: ac } });
                    const results = Array.isArray(listRes.data?.results) ? listRes.data.results : (Array.isArray(listRes.data) ? listRes.data : []);
                    if (results.length > 0) {
                      resolvedCohort = results[0];
                    } else {
                      console.error("Failed to fetch assigned cohort by ID or search");
                    }
                  } catch (err2) {
                    console.error("Failed to fetch assigned cohort by ID or search");
                  }
                }
              } else {
                resolvedCohort = ac;
              }
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
      {enrollmentStatus === "COMPLETED" && (
        <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', padding: '20px 24px', borderRadius: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '32px' }}>🎉</div>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Congratulations! Your Cohort is Completed</h4>
            <p style={{ margin: 0, opacity: 0.9 }}>You have successfully completed this program.</p>
          </div>
        </div>
      )}
      <div className="premium-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '16px' }}>
          <h1 style={{ color: 'var(--primary-color)', margin: 0 }}>My Internship Group</h1>
          {hasEnrollment && (
            <div style={{ padding: '8px 16px', borderRadius: '12px', background: 'var(--bg-nested)', border: '1px solid var(--border-color)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              Status: {enrollmentStatus.replace(/_/g, " ")}
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

            <div className={styles.actionGrid}>
              {cohort.id && (
                <Link to={`/student/cohort-chat/${cohort.id}`} className={styles.actionCard}>
                  <div className={styles.actionIcon}><FiMessageSquare /></div>
                  <div className={styles.actionContent}>
                    <h4>Cohort Chat</h4>
                    <p>Talk with your cohort</p>
                  </div>
                  <div className={styles.actionChevron}><FiChevronRight /></div>
                </Link>
              )}
              
              <Link to="/student/class-schedule" className={styles.actionCard}>
                <div className={styles.actionIcon}><FiCalendar /></div>
                <div className={styles.actionContent}>
                  <h4>Class Schedule</h4>
                  <p>View upcoming classes</p>
                </div>
                <div className={styles.actionChevron}><FiChevronRight /></div>
              </Link>
              
              <Link to="/student/mentor-details" className={styles.actionCard}>
                <div className={styles.actionIcon}><FiUser /></div>
                <div className={styles.actionContent}>
                  <h4>Mentor Details</h4>
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