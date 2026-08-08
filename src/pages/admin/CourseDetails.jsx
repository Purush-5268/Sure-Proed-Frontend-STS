import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./CourseDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CourseDetails() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COURSES.BY_ID(id));
        setCourse(response.data || null);
      } catch (err) {
        console.error("Failed to load course details:", err);
        setError("Unable to load course details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadCourse();
    }
  }, [id]);

  if (loading) return <div className={styles.page}><div className="premium-card"><h1>Course Details</h1><SkeletonLoader variant="detail" /></div></div>;
  if (error) return <div className={styles.page}><div className="premium-card"><h1>Course Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
  if (!course) return <div className={styles.page}><div className="premium-card"><h1>Course Details</h1><p>No course found.</p></div></div>;

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <div className={styles.header}>
          <h1>Course Details</h1>
          <Link to="/admin/courses" className={styles.backBtn}>← Back</Link>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.item}>
            <h3>Course Name</h3>
            <p>{course.name || "N/A"}</p>
          </div>

          <div className={styles.item}>
            <h3>Code</h3>
            <p>{course.code || "N/A"}</p>
          </div>

          <div className={styles.item}>
            <h3>Domain</h3>
            <p>{course.domain || "N/A"}</p>
          </div>

          <div className={styles.item}>
            <h3>Duration</h3>
            <p>{course.duration_weeks ? `${course.duration_weeks} Weeks` : "N/A"}</p>
          </div>

          <div className={styles.item}>
            <h3>Difficulty</h3>
            <p>{course.difficulty || "N/A"}</p>
          </div>

          <div className={styles.item}>
            <h3>Status</h3>
            <p className="premium-badge premium-badge-active">{course.status || "DRAFT"}</p>
          </div>
        </div>

        <div className={styles.section}>
          <h2>Description</h2>
          <p>{course.description || "No description provided."}</p>
        </div>

        <div className={styles.section}>
          <h2>Prerequisites</h2>
          <p>{course.prerequisites || "None specified."}</p>
        </div>

        <div className={styles.buttons}>
          <Link to={`/admin/edit-course/${course.id}`} className={styles.editBtn}>Edit Course</Link>
          <Link to="/admin/courses" className={styles.cancelBtn}>Back to Courses</Link>
        </div>
      </div>
    </div>
  );
}

export default CourseDetails;