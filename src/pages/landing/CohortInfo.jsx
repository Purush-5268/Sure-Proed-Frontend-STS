import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cohortService } from '../../services/cohortService';
import { courseService } from '../../services/courseService';
import styles from './CohortInfo.module.css';

const CohortInfo = () => {
  const { cohortId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  
  const [cohort, setCohort] = useState(null);
  const [courseInfo, setCourseInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCohort = async () => {
      try {
        const data = await cohortService.getCohortById(cohortId);
        setCohort(data);
        
        if (data && data.course) {
          try {
            const courseId = typeof data.course === 'object' ? data.course.id : data.course;
            if (courseId) {
              const courseData = await courseService.getCourseById(courseId);
              setCourseInfo(courseData);
            }
          } catch (courseError) {
            console.error("Error fetching course info:", courseError);
            // Non-critical error, we just won't have the rich description
          }
        }
      } catch (error) {
        console.error("Error fetching cohort info:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCohort();
  }, [cohortId]);

  const handleApplyClick = () => {
    if (isAuthenticated) {
      if (role === 'ADMIN') {
        navigate('/admin/cohorts');
        return;
      }
      const courseId = typeof cohort?.course === 'object' ? cohort.course?.id : (cohort?.course || cohort?.course_id);
      if (courseId) {
        navigate(`/student/course/${courseId}`);
      } else {
        navigate('/student/courses');
      }
    } else {
      const courseId = typeof cohort?.course === 'object' ? cohort.course?.id : (cohort?.course || cohort?.course_id);
      const returnUrl = courseId ? `/student/course/${courseId}` : '/student/courses';
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  if (!cohort) {
    return (
      <div className={styles.errorContainer}>
        <h2>Cohort not found</h2>
        <button onClick={() => navigate('/')} className={styles.buttonSecondary}>
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <div className={styles.contentWrapper}>
          <div className={styles.card}>
            {/* Header section */}
            <div className={styles.header}>
              <div className={styles.badge}>🚀 Applications Open</div>
              <h1 className={styles.title}>{cohort.name}</h1>
              <p className={styles.subtitle}>Cohort Code: {cohort.code}</p>
            </div>
            
            {/* Content section */}
            <div className={styles.body}>
              <div className={styles.grid}>
                <div className={styles.infoBox}>
                  <h3>Start Date</h3>
                  <p>{cohort.start_date ? new Date(cohort.start_date).toLocaleDateString() : 'TBA'}</p>
                </div>
                
                <div className={styles.infoBox}>
                  <h3>End Date</h3>
                  <p>{cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : 'TBA'}</p>
                </div>
              </div>

              {cohort.course && (
                <div className={styles.courseDescription}>
                  <h2>About {courseInfo?.name || cohort.course_name || "this Course"}</h2>
                  <p>{courseInfo?.description || "Detailed information about this course will be provided during the orientation."}</p>
                  
                  {courseInfo && (
                    <>
                      <div className={styles.courseDetailsGrid}>
                        {courseInfo.code && (
                          <div className={styles.courseDetailBox}>
                            <h4>Course Code</h4>
                            <p>{courseInfo.code}</p>
                          </div>
                        )}
                        {courseInfo.difficulty && (
                          <div className={styles.courseDetailBox}>
                            <h4>Difficulty</h4>
                            <p>{courseInfo.difficulty}</p>
                          </div>
                        )}
                        {courseInfo.duration_weeks && (
                          <div className={styles.courseDetailBox}>
                            <h4>Duration</h4>
                            <p>{courseInfo.duration_weeks} Weeks</p>
                          </div>
                        )}
                        {courseInfo.prerequisites && (
                          <div className={styles.courseDetailBox}>
                            <h4>Prerequisites</h4>
                            <p>{courseInfo.prerequisites}</p>
                          </div>
                        )}
                        {courseInfo.eligibility_criteria && (
                          <div className={styles.courseDetailBox}>
                            <h4>Eligibility</h4>
                            <p>{courseInfo.eligibility_criteria}</p>
                          </div>
                        )}
                        {courseInfo.minimum_attendance_percentage && (
                          <div className={styles.courseDetailBox}>
                            <h4>Min. Attendance</h4>
                            <p>{courseInfo.minimum_attendance_percentage}%</p>
                          </div>
                        )}
                      </div>

                      {courseInfo.curriculum && courseInfo.curriculum.length > 0 && (
                        <div className={styles.curriculumSection}>
                          <h3>Curriculum Overview</h3>
                          <div className={styles.curriculumList}>
                            {courseInfo.curriculum.map((mod, idx) => (
                              <div key={idx} className={styles.curriculumModule}>
                                <h4>{mod.title}</h4>
                                <ul>
                                  {mod.topics?.map((t, i) => <li key={i}>{t}</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              
              <div className={styles.actions}>
                <button onClick={handleApplyClick} className={styles.buttonPrimary}>
                  Apply Now for this Cohort
                </button>
                <button onClick={() => navigate('/')} className={styles.buttonSecondary}>
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CohortInfo;
