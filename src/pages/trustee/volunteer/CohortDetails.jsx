import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import { API_ENDPOINTS } from "../../../constants/apiEndpoints";
import { courseService } from "../../../services/courseService";
import { cohortChatService } from "../../../services/cohortChatService";
import styles from "../../admin/CohortDetails.module.css";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import { FiMessageCircle, FiArrowLeft, FiUser, FiCalendar, FiUsers, FiVideo } from "react-icons/fi";

function VolunteerCohortDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cohort, setCohort] = useState(null);
  const [courseName, setCourseName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  // Timeline calculation helper
  const calculateTimeline = (startDateStr) => {
    if (!startDateStr) return null;
    const start = new Date(startDateStr);

    const trainingEnd = new Date(start);
    trainingEnd.setMonth(trainingEnd.getMonth() + 4);

    const internshipEnd = new Date(trainingEnd);
    internshipEnd.setMonth(internshipEnd.getMonth() + 2);

    const softSkillsEnd = new Date(internshipEnd);
    softSkillsEnd.setDate(softSkillsEnd.getDate() + 15);

    return {
      start: start.toISOString().split('T')[0],
      trainingEnd: trainingEnd.toISOString().split('T')[0],
      internshipEnd: internshipEnd.toISOString().split('T')[0],
      graduation: softSkillsEnd.toISOString().split('T')[0]
    };
  };

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        // Fetch Cohort Details
        const cohortRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
        const cohortData = cohortRes.data;
        if (!isMounted) return;
        setCohort(cohortData);

        // Fetch Course Name
        if (cohortData.course && typeof cohortData.course === "string") {
          courseService.getCourseById(cohortData.course).then(courseRes => {
            if (isMounted) setCourseName(courseRes?.name || courseRes?.title || cohortData.course);
          });
        } else {
          setCourseName(cohortData.course?.name || "N/A");
        }

        // Fetch Unread Count
        cohortChatService.getUnreadCount(id).then(res => {
          if (isMounted && res.unread_count) setUnreadCount(res.unread_count);
        }).catch(err => console.error("Failed to fetch unread count", err));

      } catch (err) {
        console.error("Failed to load details:", err);
        if (isMounted) setError("Unable to load complete cohort details.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) loadData();
    return () => { isMounted = false; };
  }, [id]);

  if (loading) return <div className={styles.pageContainer}><SkeletonLoader variant="detail" /></div>;
  if (error) return <div className={styles.pageContainer}><h2 style={{ color: "var(--status-inactive-text)" }}>{error}</h2></div>;
  if (!cohort) return <div className={styles.pageContainer}><h2>No cohort found.</h2></div>;

  const getStatusClass = (status) => {
    if (!status) return styles.statusDraft;
    if (["ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS", "COMPLETED"].includes(status)) return styles.statusActive;
    if (["CANCELLED", "SUSPENDED"].includes(status)) return styles.statusSuspended;
    if (["OPEN"].includes(status)) return styles.statusInfo;
    return styles.statusDraft;
  };

  const getTimelineStatus = (currentStatus, targetStages) => {
    const stageOrder = ["DRAFT", "OPEN", "ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS", "COMPLETED", "CANCELLED"];
    const currentIndex = stageOrder.indexOf(currentStatus);
    const targetIndex = Math.min(...targetStages.map(s => stageOrder.indexOf(s)));
    
    if (currentStatus === "CANCELLED") return "upcoming";
    if (targetStages.includes(currentStatus)) return "active";
    if (currentIndex > targetIndex) return "completed";
    return "upcoming";
  };

  const mentorName = cohort.mentor_name || "Pending Assignment";

  return (
    <div className={styles.pageContainer}>
      
      {/* Header Section */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={`${styles.statusIndicator} ${getStatusClass(cohort.status)}`}>
            <div className={styles.statusDot}></div>
            {cohort.status}
          </div>
          <h1 className={styles.cohortTitle}>{cohort.name || cohort.code}</h1>
          <p className={styles.courseSubtitle}>{courseName}</p>
        </div>

        <div className={styles.headerActions}>
          <Link to={`/trustee/volunteer/cohort-chat/${cohort.id}`} className={`${styles.btn} ${styles.btnPrimary}`} aria-label="Open Cohort Chat">
            <FiMessageCircle size={18} aria-hidden="true" />
            Cohort Chat
            {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount}</span>}
          </Link>
          
          <Link to="/trustee/volunteer/cohorts" className={`${styles.btn} ${styles.btnTertiary}`} aria-label="Back to Cohorts">
            <FiArrowLeft size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Dynamic Timeline */}
      {cohort.start_date && (
        <div className={styles.timelineSection}>
          <h3 className={styles.timelineTitle}>Cohort Timeline</h3>
          <div className={styles.timelineTrack}>
            <div className={styles.timelineLine}></div>
            
            {[
              { label: "Start", date: calculateTimeline(cohort.start_date).start, status: getTimelineStatus(cohort.status, ["ACTIVE"]) },
              { label: "Training Ends", date: calculateTimeline(cohort.start_date).trainingEnd, status: getTimelineStatus(cohort.status, ["TRAINING"]) },
              { label: "Internship Ends", date: calculateTimeline(cohort.start_date).internshipEnd, status: getTimelineStatus(cohort.status, ["INTERNSHIP"]) },
              { label: "Graduation", date: calculateTimeline(cohort.start_date).graduation, status: getTimelineStatus(cohort.status, ["SOFT_SKILLS", "COMPLETED"]) }
            ].map((milestone, idx) => (
              <div key={idx} className={styles.timelineNode}>
                <div className={`${styles.timelineDot} ${styles[milestone.status]}`}></div>
                <p className={`${styles.timelineLabel} ${styles[milestone.status]}`}>{milestone.label}</p>
                <p className={styles.timelineDate}>{milestone.date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <FiUser size={16} aria-hidden="true" />
            <span className={styles.metricLabel}>Assigned Mentor</span>
          </div>
          <p className={styles.metricValue}>{cohort.current_mentor_details ? cohort.current_mentor_details.name || cohort.current_mentor_details.first_name : mentorName}</p>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <FiCalendar size={16} aria-hidden="true" />
            <span className={styles.metricLabel}>Duration</span>
          </div>
          <p className={styles.metricValue}>{cohort.start_date || "TBD"} ➔ {cohort.end_date || "TBD"}</p>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <FiUsers size={16} aria-hidden="true" />
            <span className={styles.metricLabel}>Capacity</span>
          </div>
          <p className={styles.metricValue}>{cohort.max_students || "Unlimited"}</p>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <FiVideo size={16} aria-hidden="true" />
            <span className={styles.metricLabel}>Meeting Link</span>
          </div>
          <p className={styles.metricValue}>
            {cohort.meeting_link ? (
              <a href={cohort.meeting_link} target="_blank" rel="noreferrer" title={cohort.meeting_link}>View Meeting</a>
            ) : "Not Configured"}
          </p>
        </div>
      </div>

    </div>
  );
}

export default VolunteerCohortDetails;
