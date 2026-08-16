import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { courseService } from "../../services/courseService";
import { applicationService } from "../../services/applicationService";
import styles from "./CourseDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CourseDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasApplied, setHasApplied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadCourse = async () => {
      if (!id) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const courseData = await courseService.getCourseById(id);
        if (!isMounted) return;
        setCourse(courseData);
      } catch (err) {
        console.error("Failed to load course details:", err);
        if (isMounted) setCourse(null);
      } finally {
        if (isMounted) setLoading(false);
      }

      // Fetch applications independently so failure doesn't block course rendering
      try {
        const appsData = await applicationService.getApplications();
        if (isMounted) {
          const alreadyApplied = appsData.some(app => String(app.course?.id || app.course_id) === String(id));
          setHasApplied(alreadyApplied);
        }
      } catch (err) {
        console.warn("Failed to check existing applications, application button duplicate protection may be incomplete:", err);
        // Do not crash or block the page
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

  const renderListItem = (item) => {
    if (typeof item === 'object' && item !== null) {
      return item.title || item.module || item.name || JSON.stringify(item);
    }
    return item;
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
                  renderList(course.prerequisites).map((item, index) => <li key={index}>{renderListItem(item)}</li>)
                ) : (
                  <li>No prerequisites listed.</li>
                )}
              </ul>
            </div>

            <div className={styles.section}>
              <h2>Curriculum</h2>
              <ul>
                {renderList(course.curriculum).length > 0 ? (
                  renderList(course.curriculum).map((item, index) => <li key={index}>{renderListItem(item)}</li>)
                ) : (
                  <li>No curriculum listed.</li>
                )}
              </ul>
            </div>
            
            {applyError && (
              <div style={{ color: 'var(--danger-color)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                {applyError}
              </div>
            )}
          </>
        )}

        <button 
          className={styles.applyBtn} 
          onClick={async () => {
            if (isApplying || hasApplied) return;
            setIsApplying(true);
            setApplyError("");
            try {
              await applicationService.createApplication({ course_id: id });
              setHasApplied(true);
              navigate("/student/application-success");
            } catch (err) {
              setApplyError(err.response?.data?.detail || err.response?.data?.error || err.response?.data?.non_field_errors?.[0] || "Failed to submit application. You may have already applied or the course is unavailable.");
            } finally {
              setIsApplying(false);
            }
          }}
          disabled={loading || !course || hasApplied || isApplying}
          style={hasApplied ? { backgroundColor: 'var(--success-color)', cursor: 'not-allowed', opacity: 1 } : {}}
        >
          {isApplying ? "Applying..." : hasApplied ? "✓ Already Applied" : "Apply for this Course"}
        </button>
      </div>
    </div>
  );
}

export default CourseDetails;