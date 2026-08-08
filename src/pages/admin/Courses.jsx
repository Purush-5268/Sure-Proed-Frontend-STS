import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Courses.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Courses() {
  const getCourseImage = (name) => {
    if (!name) return '/sure-logo.jpg';
    const lowerName = name.toLowerCase().trim();

    // 1. SPECIFIC MULTI-WORD PHRASES FIRST (Prevents text hijacking)
    if (lowerName.includes('generative ai')) return '/assets/generative-ai.jpg';
    if (lowerName.includes('data analytics')) return '/assets/data-analytics.jpg';
    if (lowerName.includes('digital marketing') || lowerName.includes('marketing')) return '/assets/digital-marketing.jpg';
    if (lowerName.includes('civil engineering') || lowerName.includes('civil')) return '/assets/civil-engineering.webp';
    if (lowerName.includes('industrial automation')) return '/assets/industrial-automation.jpg';

    // 2. BROAD TECH KEYWORDS
    if (lowerName.includes('salesforce')) return '/assets/salesforce.png';
    if (lowerName.includes('abap')) return '/assets/sap-abap.jpg';
    if (lowerName.includes('sap') || lowerName.includes('fico') || lowerName.includes('hana')) return '/assets/sap-hana.png';
    if (lowerName.includes('vlsi')) return '/assets/vlsi.jpg';
    if (lowerName.includes('pcb')) return '/assets/pcb.jpg';
    if (lowerName.includes('embedded') || lowerName.includes('iot')) return '/assets/embedded-iot.jpg';

    // Generic AI matching (only runs if 'generative ai' wasn't matched first)
    if (lowerName.includes('machine learning') || lowerName.includes('artificial intelligence') || lowerName.includes('ai')) return '/assets/ai-ml.jpg';

    if (lowerName.includes('full stack') || lowerName.includes('web development') || lowerName.includes('web dev')) return '/assets/web-dev.jpg';
    if (lowerName.includes('data structures') || lowerName.includes('algorithms') || lowerName.includes('dsa')) return '/assets/dsa-java.jpeg';
    if (lowerName.includes('java applications') || lowerName.includes('java')) return '/assets/java-app.jpg';
    if (lowerName.includes('software testing')) return '/assets/software-testing.jpg';
    if (lowerName.includes('cloud') || lowerName.includes('devops')) return '/assets/cloud-devops.svg';
    if (lowerName.includes('cybersecurity') || lowerName.includes('hacking')) return '/assets/cybersecurity.webp';
    if (lowerName.includes('ui') || lowerName.includes('ux')) return '/assets/ui-ux.png';
    if (lowerName.includes('autocad') || lowerName.includes('solidworks') || lowerName.includes('creo')) return '/assets/autocad-creo.png';
    if (lowerName.includes('robotics')) return '/assets/robotics.jpg';
    if (lowerName.includes('financial') || lowerName.includes('valuation') || lowerName.includes('finance')) return '/assets/finance.jpg';

    return '/sure-logo.jpg';
  };


  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadCourses = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COURSES.BASE);
        if (isMounted) setCourses(normalizeListResponse(response.data));
      } catch (err) {
        console.error("Failed to load courses:", err);
        if (isMounted) setCourses([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCourses();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Course Management</h1>
          <p className="premium-subtitle">Manage and track available courses.</p>
        </div>
        <Link to="/admin/add-course" className="premium-btn premium-btn-primary">
          + Add Course
        </Link>
      </div>

      {loading ? (
        <div className="premium-card premium-card-large skeleton-shimmer" style={{ height: "300px" }}></div>
      ) : courses.length === 0 ? (
        <div className="premium-empty-state">
          <div className="premium-empty-state-icon">📚</div>
          <h3>No courses found</h3>
          <p>No courses have been created yet. Create one to get started.</p>
          <Link to="/admin/add-course" className="premium-btn premium-btn-primary">Add Course</Link>
        </div>
      ) : (
        <div className={styles.courseGrid}>
          {courses.map((course) => (
            <Link to={`/admin/course-details/${course.id}`} key={course.id} className={styles.courseCard} style={{ textDecoration: 'none' }}>
              <div className={styles.imageWrapper}>
                <img src={getCourseImage(course.name)} alt={course.name} className={styles.courseImage} />
                <div className={styles.statusBadge}>{course.status || "DRAFT"}</div>
              </div>
              <div className={styles.courseContent}>
                <h3>
                  {course.name}
                  <span className={styles.arrow}>&rarr;</span>
                </h3>
                <div className={styles.courseMeta}>
                  <span>Domain: {course.domain || "N/A"}</span>
                  <span>Duration: {course.duration_weeks ? `${course.duration_weeks} Weeks` : "N/A"}</span>
                </div>
                <div className={styles.cardActions}>
                  <Link to={`/admin/edit-course/${course.id}`} className="premium-btn premium-btn-secondary" style={{ width: "100%", padding: "8px" }} onClick={(e) => e.stopPropagation()}>
                    Edit Details
                  </Link>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Courses;