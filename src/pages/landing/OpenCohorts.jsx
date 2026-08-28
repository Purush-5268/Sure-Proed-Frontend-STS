import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cohortService } from '../../services/cohortService';
import styles from './OpenCohorts.module.css';

const OpenCohorts = () => {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const [openCohorts, setOpenCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchCohorts = async () => {
      try {
        const data = await cohortService.getCohorts(
          { status: 'OPEN' },
          { signal: abortController.signal }
        );
        const list = Array.isArray(data) ? data : data.results || [];
        setOpenCohorts(list);
      } catch (error) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error("Error fetching open cohorts", error);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchCohorts();

    return () => {
      abortController.abort();
    };
  }, []);

  const handleApplyClick = (cohort) => {
    if (isAuthenticated) {
      if (role === 'ADMIN') {
        navigate('/admin/cohorts');
        return;
      }
      const courseId = typeof cohort.course === 'object' ? cohort.course?.id : (cohort.course || cohort.course_id);
      if (courseId) {
        navigate(`/student/course/${courseId}`);
      } else {
        navigate('/student/courses');
      }
    } else {
      const courseId = typeof cohort.course === 'object' ? cohort.course?.id : (cohort.course || cohort.course_id);
      const returnUrl = courseId ? `/student/course/${courseId}` : '/student/courses';
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <div className={styles.header}>
          <h1>Open Applications</h1>
          <p>Browse our currently open training programs, and start your learning journey with us today.</p>
        </div>

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
          </div>
        ) : openCohorts.length > 0 ? (
          <div className={styles.allCohortsGrid}>
            {openCohorts.map(cohort => (
              <div key={cohort.id} className={styles.cohortCard}>
                <div className={styles.cohortCardHeader}>
                  <span className={styles.cohortCardBadge}>🚀 Open</span>
                  <h3>{cohort.name}</h3>
                </div>
                <div className={styles.cohortCardBody}>
                  <p><strong>Code:</strong> <span>{cohort.code}</span></p>
                  <p><strong>Start Date:</strong> <span>{cohort.start_date ? new Date(cohort.start_date).toLocaleDateString() : 'TBA'}</span></p>
                  <p><strong>End Date:</strong> <span>{cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : 'TBA'}</span></p>
                  <p><strong>Max Students:</strong> <span>{cohort.max_students || 'N/A'}</span></p>
                </div>
                <div className={styles.cohortCardActions}>
                  <button 
                    className={styles.ctaButtonSignUp}
                    onClick={() => handleApplyClick(cohort)}
                  >
                    Apply Now
                  </button>
                  <button 
                    className={styles.ctaButtonLearnMore}
                    onClick={() => navigate(`/cohort-info/${cohort.id}`)}
                  >
                    Learn More
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>No Open Programs Right Now</h2>
            <p>Check back later for new announcements.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default OpenCohorts;
