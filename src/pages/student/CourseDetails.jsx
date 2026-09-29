import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { courseService } from "../../services/courseService";
import { applicationService } from "../../services/applicationService";
import { studentService } from "../../services/studentService";
import { useAuth } from "../../context/AuthContext";
import styles from "./CourseDetails.module.css";
import apiClient from "../../services/apiClient";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CourseDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [hasAppliedToThis, setHasAppliedToThis] = useState(false);
  const [hasOtherApplication, setHasOtherApplication] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [searchParams] = useSearchParams();
  const preselectedCohort = searchParams.get("cohort");
  
  const [openCohorts, setOpenCohorts] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState(preselectedCohort || "");
  const [cohortsLoading, setCohortsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCourse = async () => {
      if (!id) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        if (user?.email) {
          const profileData = await studentService.getProfile(user.email).catch(() => null);
          if (isMounted) setProfileCompleted(studentService.isProfileComplete(profileData));
        }
      } catch (err) {
        console.warn("Failed to check profile completion");
      }

      try {
        let courseData = null;
        try {
          courseData = await courseService.getCourseById(id);
        } catch (err) {
          // 404 can happen when student is enrolled in an active cohort — the course
          // is excluded from the non-admin queryset. Fall back to the courses list.
          if (err?.response?.status === 404 || err?.response?.status === 403) {
            const allCourses = await courseService.getCourses().catch(() => null);
            const list = Array.isArray(allCourses) ? allCourses : (allCourses?.results || []);
            courseData = list.find(c => c.id === id) || null;
          } else {
            throw err;
          }
        }
        if (!isMounted) return;
        setCourse(courseData);
      } catch (err) {
        console.error("Failed to load course details:", err);
        if (isMounted) setCourse(null);
      } finally {
        if (isMounted) setLoading(false);
      }

      // Fetch open cohorts for this course
      try {
        setCohortsLoading(true);
        const cohortsRes = await apiClient.get('/api/cohorts/', { params: { course: id, status: 'OPEN' } });
        if (isMounted) {
           const cohortsData = Array.isArray(cohortsRes.data) ? cohortsRes.data : (cohortsRes.data?.results || []);
           setOpenCohorts(cohortsData);
           if (cohortsData.length === 1) {
               setSelectedCohort(cohortsData[0].id);
           } else if (preselectedCohort && cohortsData.some(c => String(c.id) === String(preselectedCohort))) {
               setSelectedCohort(preselectedCohort);
           }
        }
      } catch (err) {
        console.error("Failed to load cohorts:", err);
      } finally {
        if (isMounted) setCohortsLoading(false);
      }

      // Fetch applications independently so failure doesn't block course rendering
      try {
        const appsData = await applicationService.getApplications();
        if (isMounted) {
          const appliedToThis = appsData.some(app => String(app.course?.id || app.course_id) === String(id));
          const hasAny = appsData.length > 0;
          setHasAppliedToThis(appliedToThis);
          setHasOtherApplication(hasAny && !appliedToThis);
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

  const displayValue = (value, fallback = "Information unavailable") => {
    if (value === null || value === undefined || value === "" || value === "null" || value === "undefined") return fallback;
    return value;
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

            <h2 className="sr-only">Course Overview</h2>
            <div className={styles.infoGrid}>
              <div>
                <h3>Course Code</h3>
                <p>{course.code || "N/A"}</p>
              </div>

              <div>
                <h3>Duration</h3>
                <p>{course.duration_weeks ? `${course.duration_weeks} Weeks` : displayValue(course.duration, "Duration unavailable")}</p>
              </div>

              <div>
                <h3>Difficulty</h3>
                <p>{course.difficulty || "N/A"}</p>
              </div>
            </div>

            {openCohorts.length > 0 && (
              <div className={styles.infoGrid} style={{ marginTop: "20px" }}>
                <div><h3>Cohort</h3><p>{displayValue(openCohorts.find((c) => String(c.id) === String(selectedCohort))?.name || openCohorts.find((c) => String(c.id) === String(selectedCohort))?.code)}</p></div>
                <div><h3>Starts</h3><p>{displayValue(openCohorts.find((c) => String(c.id) === String(selectedCohort))?.start_date, "Start date unavailable")}</p></div>
                <div><h3>Ends</h3><p>{displayValue(openCohorts.find((c) => String(c.id) === String(selectedCohort))?.end_date, "End date unavailable")}</p></div>
              </div>
            )}

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
            
            {openCohorts.length > 0 && !hasAppliedToThis && !hasOtherApplication && (
              <div className={styles.section} style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: '0 0 12px 0' }}>Select a Cohort</h3>
                {openCohorts.length > 1 ? (
                  <select 
                    value={selectedCohort}
                    onChange={(e) => setSelectedCohort(e.target.value)}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '15px' }}
                  >
                    <option value="">-- Choose a Cohort --</option>
                    {openCohorts.map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.code} (Starts: {c.start_date || 'TBD'})</option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--primary-color)' }}>
                      <input type="radio" checked readOnly />
                      <span><strong>{openCohorts[0].name || openCohorts[0].code}</strong> (Starts: {openCohorts[0].start_date || 'TBD'})</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {applyError && (
              <div style={{ color: 'var(--danger-color)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                {applyError}
              </div>
            )}

            {hasOtherApplication && !applyError && (
              <div style={{ color: 'var(--warning-color)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                You already have an active program or application. Students are limited to one active program at a time.
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
          <button 
            type="button" 
            onClick={() => navigate(-1)} 
            style={{ 
              padding: '16px 24px', 
              borderRadius: 'var(--radius-md)', 
              background: 'var(--bg-nested)', 
              border: '1px solid var(--border-color)', 
              color: 'var(--text-primary)', 
              fontWeight: '600', 
              cursor: 'pointer',
              flex: '1',
              transition: 'all 0.2s',
              boxShadow: 'var(--shadow-sm)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          >
            Go Back
          </button>
          <button 
            className={styles.applyBtn} 
            onClick={async () => {
              if (isApplying || hasAppliedToThis || hasOtherApplication) return;
              setIsApplying(true);
              setApplyError("");
              try {
                if (!selectedCohort) {
                  setApplyError("Please select a cohort before applying.");
                  setIsApplying(false);
                  return;
                }
                const createdApplication = await applicationService.createApplication({ course_id: id, assigned_cohort: selectedCohort });
                setHasAppliedToThis(true);
                navigate("/student/application-success", { state: { application: createdApplication, course, cohort: openCohorts.find((c) => String(c.id) === String(selectedCohort)) } });
              } catch (err) {
                setApplyError(err.response?.data?.detail || err.response?.data?.error || err.response?.data?.non_field_errors?.[0] || "Failed to submit application. You may have already applied or the course is unavailable.");
              } finally {
                setIsApplying(false);
              }
            }}
            disabled={loading || !course || hasAppliedToThis || hasOtherApplication || isApplying || !profileCompleted}
            style={{ flex: '2', ...((hasAppliedToThis || hasOtherApplication) ? { backgroundColor: 'var(--success-color)', cursor: 'not-allowed', opacity: 1 } : (!profileCompleted ? { backgroundColor: 'var(--warning-color)', cursor: 'not-allowed', opacity: 1 } : {})) }}
          >
            {isApplying ? "Applying..." : hasAppliedToThis ? "✓ Already Applied" : hasOtherApplication ? "Enrollment Restricted" : !profileCompleted ? "Complete Profile First" : "Apply for this Course"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CourseDetails;