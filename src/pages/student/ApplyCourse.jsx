import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import { courseService } from "../../services/courseService";
import styles from "./ApplyCourse.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ApplyCourse() {
  const location = useLocation();
  const { user } = useAuth();
  const [profileCompleted, setProfileCompleted] = useState(Boolean(location.state?.profileCompleted));
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [profileData, coursesData] = await Promise.all([
          user?.email ? studentService.getProfile(user.email) : Promise.resolve(null),
          courseService.getCourses(),
        ]);
        setProfileCompleted(studentService.isProfileComplete(profileData));
        setCourses(Array.isArray(coursesData) ? coursesData : coursesData?.results || coursesData?.data || []);
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
                    <strong>Domain</strong>
                    <span>{course.domain}</span>
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