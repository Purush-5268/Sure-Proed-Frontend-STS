import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cohortService } from '../../services/cohortService';
import styles from './OpenCohorts.module.css';
import { FaUserFriends, FaGraduationCap } from 'react-icons/fa';
import { formatDisplayDate } from '../../utils/dateUtils';

const OpenCohorts = ({ cohorts: propCohorts, loading: propLoading }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, role } = useAuth();
  const [fetchedCohorts, setFetchedCohorts] = useState([]);
  const [isFetching, setIsFetching] = useState(true);

  // If props are passed, use them. Otherwise, we are on the /open-cohorts standalone route.
  const hasProps = propCohorts !== undefined;
  
  useEffect(() => {
    if (hasProps) return;
    
    const abortController = new AbortController();
    const fetchCohorts = async () => {
      try {
        const data = await cohortService.getCohorts(
          { status: 'OPEN' },
          { signal: abortController.signal }
        );
        const list = Array.isArray(data) ? data : data.results || [];
        const now = new Date();
        const activeCohorts = list.filter(c => !c.application_end_date || new Date(c.application_end_date) > now);
        setFetchedCohorts(activeCohorts);
      } catch (error) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error("Error fetching open cohorts", error);
        }
      } finally {
        setIsFetching(false);
      }
    };
    fetchCohorts();

    return () => {
      abortController.abort();
    };
  }, [hasProps]);

  // strictly only show OPEN cohorts for applications
  const allOpenPropCohorts = useMemo(() => {
    if (!hasProps) return [];
    const open = [...propCohorts].filter(c => c.status === 'OPEN');
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    return open;
  }, [propCohorts, hasProps]);

  const filteredPropCohorts = hasProps ? allOpenPropCohorts.slice(0, 6) : [];
  const hasMoreCohorts = hasProps && allOpenPropCohorts.length > 6;

  const cohorts = hasProps ? filteredPropCohorts : fetchedCohorts;
  const loading = hasProps ? propLoading : isFetching;

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



  const getCourseImage = (cohort) => {
    if (!cohort) return '/assets/web-dev.jpg';
    if (cohort.image) return cohort.image;
    if (cohort.course?.image) return cohort.course.image;

    const name = cohort.course?.name || cohort.name || '';
    if (!name) return '/assets/web-dev.jpg';
    
    const lowerName = name.toLowerCase().trim();

    if (lowerName.includes('generative ai')) return '/assets/generative-ai.jpg';
    if (lowerName.includes('data analytics')) return '/assets/data-analytics.jpg';
    if (lowerName.includes('digital marketing') || lowerName.includes('marketing')) return '/assets/digital-marketing.jpg';
    if (lowerName.includes('civil engineering') || lowerName.includes('civil')) return '/assets/civil-engineering.webp';
    if (lowerName.includes('industrial automation')) return '/assets/industrial-automation.jpg';

    if (lowerName.includes('salesforce')) return '/assets/salesforce.png';
    if (lowerName.includes('abap')) return '/assets/sap-abap.jpg';
    if (lowerName.includes('sap') || lowerName.includes('fico') || lowerName.includes('hana')) return '/assets/sap-hana.png';
    if (lowerName.includes('vlsi')) return '/assets/vlsi.jpg';
    if (lowerName.includes('pcb')) return '/assets/pcb.jpg';
    if (lowerName.includes('embedded') || lowerName.includes('iot')) return '/assets/embedded-iot.jpg';

    if (lowerName.includes('machine learning') || lowerName.includes('artificial intelligence') || lowerName.includes('ai')) return '/assets/ai-ml.jpg';

    if (lowerName.includes('full stack') || lowerName.includes('web development') || lowerName.includes('web dev')) return '/assets/web-dev.jpg';
    if (lowerName.includes('data structures') || lowerName.includes('algorithms') || lowerName.includes('dsa')) return '/assets/dsa-java.jpeg';
    if (lowerName.includes('java applications') || lowerName.includes('java')) return '/assets/java-app.jpg';
    if (lowerName.includes('software testing')) return '/assets/software-testing.jpg';
    if (lowerName.includes('cloud') || lowerName.includes('devops')) return '/assets/cloud-devops.svg';
    if (lowerName.includes('cybersecurity') || lowerName.includes('cyber-security') || lowerName.includes('cyber security') || lowerName.includes('hacking')) return '/assets/cybersecurity.webp';
    if (lowerName.includes('ui') || lowerName.includes('ux')) return '/assets/ui-ux.png';
    if (lowerName.includes('autocad') || lowerName.includes('solidworks') || lowerName.includes('creo')) return '/assets/autocad-creo.png';
    if (lowerName.includes('robotics')) return '/assets/robotics.jpg';
    if (lowerName.includes('financial') || lowerName.includes('valuation') || lowerName.includes('finance')) return '/assets/finance.jpg';
    if (lowerName.includes('medical coding') || lowerName.includes('medical')) return '/assets/medical-coding.jpg';
    if (lowerName.includes('actuarial')) return '/assets/actuarial.webp';

    return '/assets/web-dev.jpg';
  };

  return (
    <section className={styles.section} id="open-cohorts">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 className={styles.title}>
              <span className={styles.iconWrapper}><FaGraduationCap /></span> Open Cohorts
            </h2>
            <p className={styles.subtitle}>Join our active training batches and start your learning journey today.</p>
          </div>
          {location.pathname !== '/open-cohorts' ? (
            <Link to="/open-cohorts" className={styles.viewAllBtn}>
              View All Cohorts →
            </Link>
          ) : (
            <Link to="/" className={styles.viewAllBtn}>
              ← Back to Landing Page
            </Link>
          )}
        </div>

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
          </div>
        ) : cohorts.length > 0 ? (
          <div className={`${styles.grid} ${cohorts.length === 1 ? styles.gridSingle : ''}`}>
            {cohorts.map(cohort => {
              const isTrainingInProgress = cohort.status === 'ACTIVE' || cohort.status === 'IN_PROGRESS';
              return (
              <div key={cohort.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={`${styles.statusBadge} ${isTrainingInProgress ? styles.badgeProgress : styles.badgeOpen}`}>
                    {isTrainingInProgress ? '🚀 Training In Progress' : '🔓 Open for Applications'}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.85rem', color: '#4b5563' }}>
                    {cohort.application_end_date && <span>Deadline: {formatDisplayDate(cohort.application_end_date)}</span>}
                    <span className={styles.startDate}>Starts {formatDisplayDate(cohort.start_date) || 'TBA'}</span>
                  </div>
                </div>
                
                <div className={styles.cardBody}>
                  <div className={styles.cohortImageWrapper}>
                    <img src={getCourseImage(cohort)} alt={cohort.name} width="400" height="250" className={styles.cohortImage} loading="lazy" />
                  </div>
                  <h3>{cohort.name}</h3>
                  <p className={styles.courseDesc}>{cohort.course?.description || 'Learn in-demand skills with expert mentorship and real-world projects.'}</p>
                </div>
                
                <div className={styles.cardStats}>
                  <div className={styles.stat}>
                    <FaUserFriends /> 
                    <span><strong>{cohort.enrolled_count || 0}</strong> enrolled</span>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <button 
                    aria-label={`Apply for ${cohort.name}`}
                    className={isTrainingInProgress ? styles.btnLearnMore : styles.btnApply}
                    onClick={() => isTrainingInProgress ? navigate(`/cohort-info/${cohort.id}`) : handleApplyClick(cohort)}
                  >
                    {isTrainingInProgress ? 'Learn More' : 'Apply Now'}
                  </button>
                  <button 
                    aria-label={`View details for ${cohort.name}`}
                    className={styles.btnDetails}
                    onClick={() => navigate(`/cohort-info/${cohort.id}`)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>No Open Programs Right Now</h3>
            <p>Check back later for new announcements or browse our courses.</p>
            <button className={styles.btnDetails} onClick={() => navigate('/student/courses')}>Explore Courses</button>
          </div>
        )}

        {hasMoreCohorts && (
          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '1.05rem' }}>More open cohorts are available!</p>
            <Link to="/open-cohorts" className={styles.btnApply} style={{ padding: '12px 32px', textDecoration: 'none', display: 'inline-block' }}>
              Click here to view all cohorts
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default OpenCohorts;
