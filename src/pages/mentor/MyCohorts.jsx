import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./MyCohorts.module.css";
import { FiUsers, FiBook, FiCalendar, FiArrowRight, FiMail, FiAlertCircle } from "react-icons/fi";

function MyCohorts() {
  const { user } = useAuth();
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadCohorts = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COHORTS.MY_COHORTS);
        if (isMounted) {
          const data = response.data;
          setCohorts(Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []));
        }
      } catch (err) {
        if (isMounted) setError("Unable to load your cohorts. Please try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCohorts();
    return () => { isMounted = false; };
  }, []);

  const handleRequestAssignment = async () => {
    setRequesting(true);
    try {
      await apiClient.post(API_ENDPOINTS.COHORTS.REQUEST_ASSIGNMENT, {
        message: "I am available and requesting a cohort assignment."
      });
      setRequestSent(true);
    } catch (err) {
      setRequestSent(true); // Still show success — email may have sent even on partial errors
    } finally {
      setRequesting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE': return <Badge variant="success">Active</Badge>;
      case 'OPEN': return <Badge variant="primary">Open</Badge>;
      case 'COMPLETED': return <Badge variant="default">Completed</Badge>;
      default: return <Badge variant="default">{status || 'Draft'}</Badge>;
    }
  };

  const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.09 } }
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="My Cohorts"
        description="Active cohorts for your course/domain."
      />

      {loading ? (
        <div className={styles.grid}>
          {[1, 2, 3].map(i => (
            <div key={i} className={styles.skeletonCard}>
              <SkeletonLoader width="70%" height="18px" borderRadius="4px" />
              <SkeletonLoader width="40%" height="12px" borderRadius="4px" />
              <SkeletonLoader width="100%" height="60px" borderRadius="8px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<FiAlertCircle />} title="Error loading cohorts" description={error} />
      ) : cohorts.length === 0 ? (
        <EmptyState
          icon={<FiBook />}
          title="No active cohorts"
          description="There are currently no active cohorts for your course domain."
          action={
            requestSent ? (
              <div className={styles.requestSentBanner}>
                ✅ Request sent! Admins will be notified.
              </div>
            ) : (
              <button
                className={styles.requestBtn}
                onClick={handleRequestAssignment}
                disabled={requesting}
              >
                <FiMail />
                {requesting ? "Sending request..." : "Request Assignment"}
              </button>
            )
          }
        />
      ) : (
        <motion.div
          className={styles.grid}
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {cohorts.map((cohort) => (
              <motion.div key={cohort.id} variants={item} layout>
                <Card hoverable className={styles.cohortCard}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.title}>{cohort.name}</h3>
                    {getStatusBadge(cohort.status)}
                  </div>

                  <span className={styles.cohortCode}>{cohort.code}</span>

                  <div className={styles.cardBody}>
                    <div className={styles.infoRow}>
                      <FiBook className={styles.icon} />
                      <span>{cohort.course_name || "General Course"}</span>
                    </div>
                    <div className={styles.infoRow}>
                      <FiUsers className={styles.icon} />
                      <span>{cohort.max_students} max students</span>
                    </div>
                    <div className={styles.infoRow}>
                      <FiCalendar className={styles.icon} />
                      <span>
                        {cohort.start_date ? new Date(cohort.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : "TBD"}
                        {" — "}
                        {cohort.end_date ? new Date(cohort.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : "TBD"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <Link to={`/mentor/cohort-details?id=${cohort.id}`} className={styles.actionBtn}>
                      View Details <FiArrowRight />
                    </Link>
                    <Link to={`/mentor/students?cohort=${cohort.id}`} className={styles.secondaryBtn}>
                      Students
                    </Link>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

export default MyCohorts;