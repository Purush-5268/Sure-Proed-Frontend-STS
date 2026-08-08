import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { mentorAssignmentService } from "../../services/mentorAssignmentService";
import { courseService } from "../../services/courseService";
import styles from "./MentorAssignments.module.css";
import { FiUsers, FiClock, FiSearch } from "react-icons/fi";

const MentorAssignments = () => {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // In a real scenario we'd fetch cohorts/assignments here too.
      const coursesRes = await courseService.getCourses();
      setCourses(coursesRes.results || coursesRes || []);
      
      // We call our mock service to ensure it doesn't crash
      await mentorAssignmentService.getAssignments();
    } catch (error) {
      console.error("Error fetching assignments data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = courses.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Mentor Assignments" 
        description="Manage teaching mentors and their historical assignments across cohorts."
        actions={
          <div className={styles.searchContainer}>
            <FiSearch className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Search courses..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        }
      />

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loaderGrid}>
            <SkeletonLoader width="100%" height="200px" borderRadius="12px" />
            <SkeletonLoader width="100%" height="200px" borderRadius="12px" />
            <SkeletonLoader width="100%" height="200px" borderRadius="12px" />
          </div>
        ) : filteredCourses.length === 0 ? (
          <EmptyState 
            icon={<FiUsers />}
            title="No Courses Found"
            description="There are currently no courses matching your search criteria, or no courses exist."
          />
        ) : (
          <motion.div 
            className={styles.courseGrid}
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.1 } }
            }}
          >
            <AnimatePresence mode="popLayout">
              {filteredCourses.map((course) => (
                <Card key={course.id || course.code} hoverable className={styles.courseCard}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.courseName}>{course.name}</h3>
                    <span className={styles.courseCode}>{course.code}</span>
                  </div>
                  
                  {/* Timeline UI Placeholder - Backend API pending */}
                  <div className={styles.timelinePlaceholder}>
                    <div className={styles.timelineInfo}>
                      <FiClock className={styles.infoIcon} />
                      <span>Assignments managed via detailed view</span>
                    </div>
                    <button className={styles.manageBtn}>
                      Manage Mentors
                    </button>
                  </div>
                </Card>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MentorAssignments;
