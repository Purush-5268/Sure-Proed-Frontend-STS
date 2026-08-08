import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { courseService } from "../../services/courseService";
import styles from "./CourseDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CourseDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCourse = async () => {
      if (!id) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const data = await courseService.getCourseById(id);
        if (isMounted) setCourse(data);
      } catch (err) {
        console.error("Failed to load course details:", err);
        if (isMounted) setCourse(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCourse();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const renderList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return String(value).split(/\n|,/).filter(Boolean);
  };

  return (
    <div className={styles.courseDetailsPage}>
      <div className={styles.container}>
        {loading ? (
          <SkeletonLoader variant="detail" />
        ) : !course ? (
          <p>No course details are available for this selection.</p>
        ) : (
          <>
            <h1>{course.name}</h1>

            <p className={styles.description}>{course.description || "No description available."}</p>

            <div className={styles.infoGrid}>
              <div>
                <h3>Course Code</h3>
                <p>{course.code || "N/A"}</p>
              </div>

              <div>
                <h3>Domain</h3>
                <p>{course.domain || "N/A"}</p>
              </div>

              <div>
                <h3>Duration</h3>
                <p>{course.duration_weeks ? `${course.duration_weeks} Weeks` : "N/A"}</p>
              </div>

              <div>
                <h3>Difficulty</h3>
                <p>{course.difficulty || "N/A"}</p>
              </div>
            </div>

            <div className={styles.section}>
              <h2>Prerequisites</h2>
              <ul>
                {renderList(course.prerequisites).length > 0 ? (
                  renderList(course.prerequisites).map((item, index) => <li key={index}>{item}</li>)
                ) : (
                  <li>No prerequisites listed.</li>
                )}
              </ul>
            </div>

            <div className={styles.section}>
              <h2>Curriculum</h2>
              <ul>
                {renderList(course.curriculum).length > 0 ? (
                  renderList(course.curriculum).map((item, index) => <li key={index}>{item}</li>)
                ) : (
                  <li>No curriculum listed.</li>
                )}
              </ul>
            </div>
          </>
        )}

        <button className={styles.applyBtn} onClick={() => navigate("/student/application-success")}>
          Apply for this Course
        </button>
      </div>
    </div>
  );
}

export default CourseDetails;