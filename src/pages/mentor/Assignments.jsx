import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Assignments.module.css";
import { FiPlus, FiFileText, FiClock, FiUsers, FiCheckCircle } from "react-icons/fi";

function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadAssignments = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BASE);
        if (isMounted) setAssignments(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to load mentor assignments:", err);
        if (isMounted) setAssignments([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAssignments();
    return () => {
      isMounted = false;
    };
  }, []);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'PUBLISHED': return <Badge variant="success">Published</Badge>;
      case 'DRAFT': return <Badge variant="warning">Draft</Badge>;
      case 'EXPIRED': return <Badge variant="error">Expired</Badge>;
      default: return <Badge variant="default">{status || 'Draft'}</Badge>;
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Assignment Management" 
        description="Create, publish, and review student assignments."
        actions={
          <Link to="/mentor/create-assignment" className={styles.primaryButton}>
            <FiPlus /> New Assignment
          </Link>
        }
      />

      {loading ? (
        <div className={styles.grid}>
          <SkeletonLoader width="100%" height="200px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="200px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="200px" borderRadius="12px" />
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState 
          icon={<FiFileText />}
          title="No Assignments Yet"
          description="You haven't created any assignments for your cohorts."
          action={
            <Link to="/mentor/create-assignment" className={styles.primaryButton}>
              Create your first assignment
            </Link>
          }
        />
      ) : (
        <motion.div 
          className={styles.grid}
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {assignments.map((item) => (
              <Card key={item.id} hoverable className={styles.assignmentCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.titleRow}>
                    <h3 className={styles.title}>{item.title}</h3>
                    {getStatusBadge(item.status)}
                  </div>
                  <span className={styles.cohortTag}>{item.cohort?.name || item.cohort || "All Cohorts"}</span>
                </div>
                
                <div className={styles.cardBody}>
                  <div className={styles.statInfo}>
                    <FiClock className={styles.icon} />
                    <span>Due: {item.deadline ? new Date(item.deadline).toLocaleDateString() : "No deadline"}</span>
                  </div>
                  <div className={styles.statInfo}>
                    <FiUsers className={styles.icon} />
                    <span>45 Submissions</span>
                  </div>
                  <div className={styles.statInfo}>
                    <FiCheckCircle className={styles.icon} />
                    <span>20 Graded</span>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  {/* Routing directly to standard assignment feedback/submissions view */}
                  <Link to={`/mentor/assignment-submissions/${item.id}`} className={styles.actionLink}>
                    Review Submissions
                  </Link>
                  <Link to={`/mentor/edit-assignment/${item.id}`} className={styles.secondaryLink}>
                    Edit
                  </Link>
                </div>
              </Card>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

export default Assignments;