import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { courseService } from '../../services/courseService';
import { FaBookOpen, FaSearch, FaArrowLeft } from 'react-icons/fa';
import styles from './ExplorePrograms.module.css';
import { useAuth } from '../../context/AuthContext';

const ExplorePrograms = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { isAuthenticated, role } = useAuth();

  const getEnrollLink = () => {
    if (!isAuthenticated) return '/login?returnUrl=/student/courses';
    if (role === 'ADMIN') return '/admin/dashboard';
    if (role === 'MENTOR') return '/mentor/dashboard';
    if (role === 'VOLUNTEER') return '/trustee/volunteer/dashboard';
    if (role === 'TRUSTEE') return '/trustee/main/dashboard';
    return '/student/courses';
  };

  useEffect(() => {
    let isMounted = true;
    courseService.getCourses()
      .then(data => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        // Filter out ARCHIVED courses
        const activeCourses = list.filter(c => c.status !== 'ARCHIVED');
        setCourses(activeCourses);
      })
      .catch(err => console.error("Error fetching courses:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const filteredCourses = useMemo(() => {
    return courses.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [courses, searchQuery]);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.header}>
        <div className={styles.container}>
          <Link to="/" className={styles.backBtn}>
            <FaArrowLeft /> Back to Home
          </Link>
          <h1 className={styles.title}>Explore Programs</h1>
          <p className={styles.subtitle}>
            Discover our wide range of training programs designed to help you build in-demand skills and get career-ready.
          </p>
          
          <div className={styles.searchContainer}>
            <div className={styles.searchBox}>
              <FaSearch className={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Search programs by name or keywords..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.container}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Loading programs...</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No programs found</h3>
              <p>Try adjusting your search criteria.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredCourses.slice().sort((a,b) => (a.name || a.title || a.code || "").localeCompare(b.name || b.title || b.code || "")).map((course, index) => {
                const colorClasses = [styles.colorBlue, styles.colorGreen, styles.colorPink, styles.colorTeal, styles.colorPurple];
                const colorClass = colorClasses[index % colorClasses.length];
                return (
                <div key={course.id} className={styles.card}>
                  <div className={`${styles.iconContainer} ${colorClass}`}>
                    <FaBookOpen />
                  </div>

                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>{course.name}</h3>
                    <p className={styles.cardDescription}>
                      {course.description ? (course.description.substring(0, 100) + '...') : 'A comprehensive program to build your career.'}
                    </p>
                    <div className={styles.cardFooter}>
                      <span className={styles.duration}>
                        {course.duration_weeks ? `${course.duration_weeks} Weeks` : 'Self-paced'}
                      </span>
                      <Link to={getEnrollLink()} className={styles.enrollBtn}>
                        Enroll Now
                      </Link>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExplorePrograms;
