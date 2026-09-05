// import { useEffect, useState } from "react";
// import { Link, useParams } from "react-router-dom";
// import apiClient from "../../services/apiClient";
// import { API_ENDPOINTS } from "../../constants/apiEndpoints";
// import styles from "./CohortDetails.module.css";

// function CohortDetails() {
//   const { id } = useParams();
//   const [cohort, setCohort] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");

//   useEffect(() => {
//     const loadCohort = async () => {
//       try {
//         const response = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
//         setCohort(response.data || null);
//       } catch (err) {
//         console.error("Failed to load cohort details:", err);
//         setError("Unable to load cohort details.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     if (id) {
//       loadCohort();
//     }
//   }, [id]);

//   if (loading) return <div className={styles.container}><div className="premium-card"><h1>Cohort Details</h1><p>Loading cohort details...</p></div></div>;
//   if (error) return <div className={styles.container}><div className="premium-card"><h1>Cohort Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
//   if (!cohort) return <div className={styles.container}><div className="premium-card"><h1>Cohort Details</h1><p>No cohort found.</p></div></div>;

//   const mentorNames = (cohort.mentors || [])
//     .map((mentor) => `${mentor.first_name || ""} ${mentor.last_name || ""}`.trim() || mentor.email || "Unknown")
//     .filter(Boolean)
//     .join(", ") || "Not assigned";

//   return (
//     <div className={styles.container}>
//       <div className="premium-card">
//         <div className={styles.header}>
//           <h1>Cohort Details</h1>
//           <Link to="/admin/cohorts">Back</Link>
//         </div>

//         <div className={styles.grid}>
//           <div>
//             <label>Cohort Name</label>
//             <p>{cohort.name || cohort.code || "N/A"}</p>
//           </div>

//           <div>
//             <label>Course</label>
//             <p>{cohort.course?.name || cohort.course || "N/A"}</p>
//           </div>

//           <div>
//             <label>Mentors</label>
//             <p>{mentorNames}</p>
//           </div>

//           <div>
//             <label>Max Students</label>
//             <p>{cohort.max_students ?? "N/A"}</p>
//           </div>

//           <div>
//             <label>Start Date</label>
//             <p>{cohort.start_date || "N/A"}</p>
//           </div>

//           <div>
//             <label>End Date</label>
//             <p>{cohort.end_date || "N/A"}</p>
//           </div>

//           <div>
//             <label>Status</label>
//             <span className="premium-badge premium-badge-active">{cohort.status || "DRAFT"}</span>
//           <Link to={`/admin/edit-cohort/${cohort.id}`}>Edit Cohort</Link>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default CohortDetails;
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import { cohortChatService } from "../../services/cohortChatService";
import styles from "./CohortDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import CohortScreeningPanel from "./CohortScreeningPanel";
import { FiMessageCircle, FiEdit2, FiArrowLeft, FiUser, FiCalendar, FiUsers, FiVideo, FiCheckCircle, FiXCircle } from "react-icons/fi";

function CohortDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cohort, setCohort] = useState(null);
  const [courseName, setCourseName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [updatingStage, setUpdatingStage] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [updatingBatch, setUpdatingBatch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bulkGenStatus, setBulkGenStatus] = useState("");

  const handleBulkGenerateOfferLetters = async () => {
    if (!window.confirm("Generate Offer Letters for all eligible students in this cohort?")) return;
    setBulkGenerating(true);
    setBulkGenStatus("");
    try {
      const res = await applicationService.bulkGenerateOfferLetters(cohort.id);
      setBulkGenStatus(res.message || "Generation queued. Eligible letters are being processed in the background.");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to bulk generate offer letters.");
    } finally {
      setBulkGenerating(false);
    }
  };

  const handleBatchChange = async (e) => {
    const newBatch = e.target.value;
    if (newBatch === (cohort.lst_batch || "")) return;

    setUpdatingBatch(true);
    try {
      const response = await cohortService.patchCohort(cohort.id, { lst_batch: newBatch || null });
      setCohort(response);
    } catch (err) {
      alert("Failed to update LST Batch.");
    } finally {
      setUpdatingBatch(false);
    }
  };

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

  const handleStageChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === cohort.status) return;

    setUpdatingStage(true);
    try {
      await apiClient.patch(API_ENDPOINTS.COHORTS.BY_ID(id), { status: newStatus });
      setCohort({ ...cohort, status: newStatus });
    } catch (err) {
      console.error("Failed to update status:", err);
      const detail = err.response?.data?.detail || err.response?.data?.status?.[0] || err.message;
      alert(`Backend Validation Error: ${detail}\n\nPlease ask the backend agent to update validate_status in cohorts/serializers.py to allow transitioning to ${newStatus}.`);
    } finally {
      setUpdatingStage(false);
    }
  };

  const [updatingMentor, setUpdatingMentor] = useState(false);
  const handleSetCurrentMentor = async (mentorId) => {
    setUpdatingMentor(true);
    try {
      await apiClient.post(`/api/cohorts/${id}/set-current-mentor/`, { mentor_id: mentorId });
      // Refresh cohort details to get updated mentor info
      const cohortRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
      setCohort(cohortRes.data);
      alert("Current mentor updated successfully");
    } catch (err) {
      console.error("Failed to update mentor:", err);
      alert("Failed to update mentor: " + (err.response?.data?.detail || err.message));
    } finally {
      setUpdatingMentor(false);
    }
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
          <div className={styles.controlsGroup}>
            <div className={styles.controlField}>
              <label className={styles.controlLabel}>LST Batch</label>
              <select
                value={cohort.lst_batch || ""}
                onChange={handleBatchChange}
                disabled={updatingBatch}
                className={styles.controlSelect}
                aria-label="Set LST Batch"
              >
                <option value="">None</option>
                <option value="BATCH_1">Batch 1</option>
                <option value="BATCH_2">Batch 2</option>
              </select>
            </div>
            
            <div className={styles.controlField}>
              <label className={styles.controlLabel}>Stage</label>
              <select
                value={cohort.status || ""}
                onChange={handleStageChange}
                disabled={updatingStage}
                className={styles.controlSelect}
                aria-label="Set Cohort Stage"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="OPEN">OPEN (Enrollment)</option>
                <option value="ACTIVE">ACTIVE (Pre-Training)</option>
                <option value="TRAINING">TRAINING</option>
                <option value="INTERNSHIP">INTERNSHIP</option>
                <option value="SOFT_SKILLS">SOFT SKILLS</option>
                <option value="COMPLETED">COMPLETED (Graduated)</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>

          <Link to={`/admin/cohort-chat/${cohort.id}`} className={`${styles.btn} ${styles.btnPrimary}`} aria-label="Open Cohort Chat">
            <FiMessageCircle size={18} aria-hidden="true" />
            Cohort Chat
            {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount}</span>}
          </Link>
          
          <Link to={`/admin/edit-cohort/${cohort.id}`} className={`${styles.btn} ${styles.btnSecondary}`} aria-label="Edit Cohort">
            <FiEdit2 size={16} aria-hidden="true" />
            Edit
          </Link>
          
          <Link to="/admin/cohorts" className={`${styles.btn} ${styles.btnTertiary}`} aria-label="Back to Cohorts">
            <FiArrowLeft size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Cohort Screening Panel */}
      <CohortScreeningPanel cohortId={id} cohort={cohort} />

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
          <p className={styles.timelineHelp}>
            * This timeline is calculated based on the start date. Transitioning the cohort stage highlights the current progress.
          </p>
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
          
          {cohort.active_mentors && cohort.active_mentors.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <select 
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-nested)', fontSize: '0.85rem' }}
                value={cohort.current_mentor_details?.id || ""}
                onChange={(e) => handleSetCurrentMentor(e.target.value)}
                disabled={updatingMentor}
              >
                <option value="">-- Set Current Mentor --</option>
                {cohort.active_mentors.map(am => (
                  <option key={am.id} value={am.id}>{am.name || am.first_name || am.email}</option>
                ))}
              </select>
            </div>
          )}
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

      {/* Student Management Panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Student Management</h2>
          <p>View and manage students enrolled in this cohort, filter by completion status.</p>
        </div>
        <div className={styles.panelBody}>
          <button
            onClick={() => navigate(`/admin/students?cohort=${id}`)}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            <FiUsers size={16} aria-hidden="true" />
            View All Students
          </button>
          <button
            onClick={() => navigate(`/admin/students?cohort=${id}&status=QUALIFIED`)}
            className={`${styles.btn} ${styles.btnSuccess}`}
          >
            <FiCheckCircle size={16} aria-hidden="true" />
            Passed
          </button>
          <button
            onClick={() => navigate(`/admin/students?cohort=${id}&status=REJECTED`)}
            className={`${styles.btn} ${styles.btnDanger}`}
          >
            <FiXCircle size={16} aria-hidden="true" />
            Failed
          </button>
        </div>
      </div>

      {/* Offer Letters Panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Offer Letters</h2>
          <p>Eligible letters are issued automatically after one calendar month, or can be dispatched manually below.</p>
        </div>
        <div className={styles.panelBody}>
          <button
            onClick={handleBulkGenerateOfferLetters}
            disabled={bulkGenerating}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {bulkGenerating ? "⏳ Queuing..." : "📄 Generate Eligible Letters"}
          </button>
          {bulkGenStatus && (
            <div style={{ width: "100%", marginTop: "1rem", color: "var(--status-info-text)", fontSize: "0.9rem", padding: "10px", backgroundColor: "var(--status-info-bg)", borderRadius: "8px" }}>
              {bulkGenStatus}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

export default CohortDetails;