import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cohortService } from '../../services/cohortService';
import styles from './PromotionalBanner.module.css';

const PromotionalBanner = () => {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const [openCohorts, setOpenCohorts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

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
          console.error("Error fetching open cohorts for banner", error);
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

  // Auto-scroll logic
  useEffect(() => {
    if (openCohorts.length <= 1 || isHovered) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % openCohorts.length);
    }, 5000); // 5 seconds per slide
    
    return () => clearInterval(interval);
  }, [openCohorts.length, isHovered]);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % openCohorts.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + openCohorts.length) % openCohorts.length);
  };

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
        // Fallback to the general courses apply page
        navigate('/student/courses');
      }
    } else {
      const courseId = typeof cohort.course === 'object' ? cohort.course?.id : (cohort.course || cohort.course_id);
      const returnUrl = courseId ? `/student/course/${courseId}` : '/student/courses';
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  };

  if (loading) {
    return (
      <section className={styles.bannerSection}>
        <div className={styles.bannerContainer}>
          <div className={styles.skeletonWrapper}>
             <div className={styles.spinner}></div>
          </div>
        </div>
      </section>
    );
  }

  if (openCohorts.length === 0) {
    return null;
  }

  const currentCohort = openCohorts[currentIndex];

  return (
    <section className={styles.bannerSection}>
      <div 
        className={styles.bannerContainer}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Navigation Arrows if multiple items */}
        {openCohorts.length > 1 && (
          <>
            <button className={`${styles.navButton} ${styles.prevButton}`} onClick={handlePrev}>
              &#10094;
            </button>
            <button className={`${styles.navButton} ${styles.nextButton}`} onClick={handleNext}>
              &#10095;
            </button>
          </>
        )}

        <div className={styles.bannerContent} key={currentIndex}>
          <div className={styles.textContent}>
            <div className={styles.badgeWrapper}>
              <span className={styles.badge}>
                🚀 New Cohort Open
              </span>
            </div>
            
            <h2 className={styles.headline}>
              {currentCohort.name}
            </h2>
            
            <div className={styles.ctaWrapper}>
              <button 
                className={styles.ctaButtonSignUp}
                onClick={() => handleApplyClick(currentCohort)}
              >
                Apply Now
              </button>
              <button 
                className={styles.ctaButtonLearnMore}
                onClick={() => navigate(`/cohort-info/${currentCohort.id}`)}
              >
                Learn More
              </button>
            </div>
          </div>
          
          <div className={styles.graphicContent}>
            <div className={styles.announcementImagePlaceholder}>
              <span className={styles.speakerIcon}>📢</span>
              <img src="/sure-logo.jpg" alt="SURE Trust" className={styles.brandLogoSmall} />
            </div>
          </div>
        </div>
      </div>

      {/* View All Announcements Button */}
      <div className={styles.viewAllWrapper}>
        <button 
          className={styles.viewAllButton} 
          onClick={() => navigate('/open-cohorts')}
        >
          View All Announcements
        </button>
      </div>
    </section>
  );
};

export default PromotionalBanner;
