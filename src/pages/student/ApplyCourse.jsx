import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./ApplyCourse.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ApplyCourse() {
  const location = useLocation();
  const { user } = useAuth();
  const [profileCompleted, setProfileCompleted] = useState(Boolean(location.state?.profileCompleted));
  const [courses, setCourses] = useState([]);
  const [activeApplication, setActiveApplication] = useState(null);
  const [resolvedEnrollment, setResolvedEnrollment] = useState({ isEnrolled: false });
  const [isCurrentlyEnrolled, setIsCurrentlyEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [profileData, coursesData, appRes] = await Promise.all([
          user?.email ? studentService.getProfile(user.email) : Promise.resolve(null),
          courseService.getCourses(),
          user?.email ? apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/") : Promise.resolve({ data: [] })
        ]);
        setProfileCompleted(studentService.isProfileComplete(profileData));
        const apps = appRes.data?.results || appRes.data || [];
        const coursesArray = Array.isArray(coursesData) ? coursesData : coursesData?.results || coursesData?.data || [];
        
        setCourses(coursesArray);
        
        const enrollment = resolveStudentEnrollment(profileData, apps, coursesArray);
        setResolvedEnrollment(enrollment);
        
        if (enrollment.isEnrolled) {
          setIsCurrentlyEnrolled(true);
          setActiveApplication(enrollment.application);
        }
      } catch (err) {
        console.error("Failed to load apply-course data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, location.state?.profileCompleted]);

  return (
    <div className={styles.coursePage}>
      <div className={styles.container}>

        <div className={styles.header}>
          <h1>Available Internship Courses</h1>

          <p>
            Browse the available internship courses. Select a course to view
            complete details before submitting your application.
          </p>
        </div>

        {loading ? (
          <SkeletonLoader variant="card" rows={4} />
          ) : isCurrentlyEnrolled ? (
            <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border-color)', maxWidth: '600px', margin: '40px auto' }}>
              <h2 style={{ color: 'var(--primary-color)', marginBottom: '16px', fontSize: '24px' }}>🎓 Next Application</h2>
              <div style={{ background: 'var(--bg-nested)', padding: '20px', borderRadius: '12px', marginBottom: '24px', textAlign: 'left' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Course</p>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{resolvedEnrollment.courseName}</h3>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Group</p>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{resolvedEnrollment.group}</h3>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Status</p>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{resolvedEnrollment.status}</h3>
              </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '16px' }}>
              You are currently enrolled in this Group. You can apply for another Course or Group when eligible.
            </p>
              <Link to="/student/dashboard" className={styles.detailsBtn} style={{ display: 'inline-block' }}>Go to Dashboard</Link>
            </div>
        ) : (
          <div className={styles.courseGrid}>

            {courses.map((course) => (
              <div
                key={course.id}
                className={styles.courseCard}
              >

                <span className={styles.badge}>
                  Published
                </span>

                <h2>{course.name}</h2>

                <p>{course.description}</p>

                <div className={styles.info}>

                  <div>
                    <strong>Course Code</strong>
                    <span>{course.code}</span>
                  </div>

                  <div>
                    <strong>Duration</strong>
                    <span>{course.duration_weeks ? `${course.duration_weeks} Weeks` : "N/A"}</span>
                  </div>

                  <div>
                    <strong>Difficulty</strong>
                    <span>{course.difficulty}</span>
                  </div>

                </div>

                <div className={styles.buttons}>

                  {profileCompleted ? (
                    <Link
                      to={`/student/course/${course.id}`}
                      className={styles.detailsBtn}
                    >
                      View Details
                    </Link>
                  ) : (
                    <Link
                      to="/student/profile"
                      className={styles.detailsBtn}
                    >
                      Complete Profile First
                    </Link>
                  )}

                </div>

              </div>
            ))}

          </div>
        )}

      </div>
    </div>
  );
}

export default ApplyCourse;