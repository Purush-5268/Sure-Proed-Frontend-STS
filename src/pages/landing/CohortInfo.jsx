import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cohortService } from '../../services/cohortService';
import styles from './CohortInfo.module.css';

const CohortInfo = () => {
  const { cohortId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  
  const [cohort, setCohort] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCohort = async () => {
      try {
        const data = await cohortService.getCohortById(cohortId);
        setCohort(data);
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

  const courseInfo = cohort.course_details;
  
  // Check if applications are open based on status and deadline
  const isPastDeadline = cohort.application_end_date ? new Date(cohort.application_end_date) < new Date() : false;
  const isApplicationsOpen = cohort.status === 'OPEN' && !isPastDeadline;

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <div className={styles.contentWrapper}>
          <div className={styles.card}>
            {/* Header section */}
            <div className={styles.header}>
              <div className={styles.badge} style={{ backgroundColor: isApplicationsOpen ? '#10b981' : '#6b7280' }}>
                {isApplicationsOpen ? '🚀 Applications Open' : '🔒 Applications Closed'}
              </div>
              <h1 className={styles.title}>{cohort.name || cohort.code}</h1>
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

                {cohort.application_end_date && (
                  <div className={styles.infoBox}>
                    <h3>Application Deadline</h3>
                    <p>{new Date(cohort.application_end_date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Show WhatsApp link if authorized by backend */}
              {cohort.whatsapp_group_link && (
                 <div className={styles.courseDescription} style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                   <h2 style={{ color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                     Join WhatsApp Group
                   </h2>
                   <p style={{ color: '#15803d', marginBottom: '1rem' }}>You have access to the official cohort WhatsApp group.</p>
                   <a href={cohort.whatsapp_group_link} target="_blank" rel="noreferrer" style={{ display: 'inline-block', backgroundColor: '#22c55e', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 'bold', textDecoration: 'none' }}>
                     Join Group
                   </a>
                 </div>
              )}

              {cohort.rules_and_regulations && (
                 <div className={styles.courseDescription} style={{ marginTop: '2rem' }}>
                   <h2>Rules & Regulations</h2>
                   <div style={{ whiteSpace: 'pre-wrap', color: '#4b5563', lineHeight: '1.6' }}>
                     {cohort.rules_and_regulations}
                   </div>
                 </div>
              )}

              {courseInfo ? (
                <div className={styles.courseDescription} style={{ marginTop: '2rem' }}>
                  <h2>About {cohort.course_name || "this Course"}</h2>
                  <p>{courseInfo.description || "Detailed information about this course will be provided during the orientation."}</p>
                  
                  <div className={styles.courseDetailsGrid}>
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
                </div>
              ) : (
                <div className={styles.courseDescription} style={{ marginTop: '2rem' }}>
                  <h2>About {cohort.course_name || "this Course"}</h2>
                  <p>Detailed course information will be provided during orientation.</p>
                </div>
              )}
              
              <div className={styles.actions} style={{ marginTop: '2rem' }}>
                <button onClick={handleApplyClick} className={styles.buttonPrimary} disabled={!isApplicationsOpen}>
                  {isApplicationsOpen ? 'Apply Now for this Cohort' : 'Applications Closed'}
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
