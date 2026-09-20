import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './LearningPrograms.module.css';
import { FaBookOpen } from 'react-icons/fa';
import { courseService } from '../../services/courseService';

const LearningPrograms = ({ courses: propCourses, loading: propLoading }) => {
  const [fetchedPrograms, setFetchedPrograms] = useState([]);
  const [isFetching, setIsFetching] = useState(true);

  const hasProps = propCourses !== undefined;

  useEffect(() => {
    if (hasProps) return;
    
    let isMounted = true;
    courseService.getCourses()
      .then(data => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setFetchedPrograms(list);
      })
      .catch(err => console.error("Error fetching learning programs:", err))
      .finally(() => {
        if (isMounted) setIsFetching(false);
      });
    return () => { isMounted = false; };
  }, [hasProps]);

  const programs = hasProps ? propCourses : fetchedPrograms;
  const loading = hasProps ? propLoading : isFetching;

  return (
    <section id="programs" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 className={styles.title}>Our Learning Programs</h2>
            <p className={styles.subtitle}>Choose your path. Learn in-demand skills. Build a better tomorrow.</p>
          </div>
          <Link to="/student/courses" className={styles.viewAllBtn}>
            View All Programs →
          </Link>
        </div>
        
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
          </div>
        ) : programs.length > 0 ? (
          <div className={styles.grid}>
            {programs.map((program, index) => {
              const colorClasses = [styles.colorBlue, styles.colorGreen, styles.colorPink];
              const colorClass = colorClasses[index % colorClasses.length];
              return (
              <div key={program.id} className={styles.card}>
                <div className={`${styles.iconContainer} ${colorClass}`}>
                   <FaBookOpen />
                </div>
                <div className={styles.cardContent}>
                  <h3>{program.name}</h3>
                  <p className={styles.courseDesc}>
                    {program.description || 'Comprehensive learning program designed for career growth.'}
                  </p>
                  <Link to={`/student/course/${program.id}`} className={styles.exploreLink}>
                    Explore Program →
                  </Link>
                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>No Programs Available</h3>
            <p>Check back soon for new learning tracks.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default LearningPrograms;