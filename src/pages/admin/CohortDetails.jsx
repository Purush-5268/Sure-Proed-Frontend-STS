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
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import { cohortChatService } from "../../services/cohortChatService";
import styles from "./CohortDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import CohortScreeningPanel from "./CohortScreeningPanel";
import ManualExaminationForm from "./ManualExaminationForm";
import { FiMessageCircle, FiEdit2, FiArrowLeft, FiUser, FiCalendar, FiUsers, FiVideo, FiCheckCircle, FiXCircle, FiTrash2, FiDownload } from "react-icons/fi";

function CohortDetails() {
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const id = paramId || searchParams.get("id");
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
  const [manageScreeningResults, setManageScreeningResults] = useState(false);
  const [screeningMode, setScreeningMode] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingCohort, setDeletingCohort] = useState(false);
  const [enrollingEligible, setEnrollingEligible] = useState(false);
  const [eligibleApplicants, setEligibleApplicants] = useState(null);

  const deleteConfirmationPhrase = [
    "DELETE",
    cohort?.code,
  ].filter(Boolean).join(" ");
  const normalizeDeleteConfirmation = (value) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();

  const handleDeleteCohort = async () => {
    if (normalizeDeleteConfirmation(deleteConfirmation) !== normalizeDeleteConfirmation(deleteConfirmationPhrase)) {
      alert("You have not entered the correct confirmation text.");
      return;
    }
    setDeletingCohort(true);
    try {
      await apiClient.delete(API_ENDPOINTS.COHORTS.BY_ID(cohort.id), { data: { confirmation: deleteConfirmationPhrase } });
      navigate("/admin/cohorts");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete cohort.");
    } finally {
      setDeletingCohort(false);
    }
  };

  const handleEnrollAllEligible = async () => {
    if (!window.confirm("Enroll all qualified eligible students in this cohort?")) return;
    setEnrollingEligible(true);
    try {
      const data = await applicationService.getApplications({ cohort: id, page_size: 200 });
      const applications = Array.isArray(data) ? data : data?.results || [];
      const eligible = applications.filter((app) =>
        (app.qualified === true || ["QUALIFIED", "WAITLISTED"].includes(app.status)) &&
        !["COHORT_ASSIGNED", "IN_PROGRESS", "TRAINING", "INTERNSHIP_ASSIGNED", "SOFT_SKILLS", "COMPLETED"].includes(app.status)
      );
      if (!eligible.length) {
        alert("No qualified eligible students are available to enroll.");
        return;
      }
      const outcomes = await Promise.allSettled(
        eligible.map(async (app) => {
          try {
            return await apiClient.post(`/api/applications/${app.id}/assign-cohort/`, { cohort_id: id });
          } catch (error) {
            const code = error.response?.data?.code;
            if (!["QUALIFICATION_REQUIRED", "INTERVIEW_REQUIRED", "ROLE_VERIFICATION_REQUIRED"].includes(code)) {
              throw error;
            }
            return apiClient.post(`/api/applications/${app.id}/repair-state/`, {
              status: "COHORT_ASSIGNED",
              reason: "Administrator enrolled the student after the qualified screening result.",
            });
          }
        })
      );
      const enrolled = outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value?.status === 200).length;
      const blocked = outcomes.length - enrolled;
      await loadCohortData();
      alert(`${enrolled} student${enrolled === 1 ? "" : "s"} enrolled.${blocked ? ` ${blocked} could not be enrolled because eligibility requirements are incomplete.` : ""}`);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to enroll eligible students.");
    } finally {
      setEnrollingEligible(false);
    }
  };

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

  const loadCohortData = async () => {
    try {
      // Fetch Cohort Details
      const cohortRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
      const cohortData = cohortRes.data;
      setCohort(cohortData);
      const applications = await applicationService.getApplications({ cohort: id, page_size: 200 }).catch(() => []);
      setEligibleApplicants(applications.filter((application) => ["APPLIED", "EXAM_PENDING", "PRESCREENING_PENDING", "PRESCREENING_COMPLETED", "EXAM_COMPLETED"].includes(application.status)).length);

      // Fetch Course Name
      if (cohortData.course && typeof cohortData.course === "string") {
        courseService.getCourseById(cohortData.course).then(courseRes => {
          setCourseName(courseRes?.name || courseRes?.title || cohortData.course);
        });
      } else {
        setCourseName(cohortData.course?.name || "N/A");
      }

      // Fetch Unread Count
      cohortChatService.getUnreadCount(id).then(res => {
        if (res.unread_count) setUnreadCount(res.unread_count);
      }).catch(err => console.error("Failed to fetch unread count", err));

    } catch (err) {
      console.error("Failed to load details:", err);
      setError("Unable to load complete cohort details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadCohortData();
    } else {
      setError("No cohort ID provided.");
      setLoading(false);
    }
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

  const isCohortStarted = Boolean(
    (cohort?.start_date && new Date() >= new Date(cohort.start_date)) ||
    ["TRAINING", "INTERNSHIP", "SOFT_SKILLS", "COMPLETED"].includes(cohort?.status)
  );

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

          <button onClick={() => setDeleteModalOpen(true)} className={styles.btn} aria-label="Delete Cohort" style={{ background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer', padding: '0.6rem 1.2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', fontWeight: '500' }}>
            <FiTrash2 size={16} aria-hidden="true" />
            Delete
          </button>

          <Link to="/admin/cohorts" className={`${styles.btn} ${styles.btnTertiary}`} aria-label="Back to Cohorts">
            <FiArrowLeft size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {deleteModalOpen && (() => {
        const isMatch = normalizeDeleteConfirmation(deleteConfirmation) === normalizeDeleteConfirmation(deleteConfirmationPhrase);
        return (
          <div className={styles.deleteOverlay}>
            <div className={`premium-card ${styles.deleteModal}`}>
              <div className={styles.deleteIcon}>!</div>
              <h2 className={styles.deleteTitle}>Delete Cohort</h2>
              <p className={styles.deleteDescription}>This permanently deletes the cohort and cannot be undone.</p>
              <label className={styles.deleteLabel}>
                Type <strong>{deleteConfirmationPhrase}</strong> to continue.
              </label>
              <input className={styles.deleteInput} value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} placeholder={deleteConfirmationPhrase} autoComplete="off" spellCheck="false" aria-label={`Type ${deleteConfirmationPhrase} to confirm deletion`} />
              <div className={styles.deleteActions}>
                <button className={styles.deleteCancel} type="button" onClick={() => { setDeleteModalOpen(false); setDeleteConfirmation(""); }}>Cancel</button>
                <button className={styles.deleteConfirm} type="button" onClick={handleDeleteCohort} disabled={!isMatch || deletingCohort}>
                  {deletingCohort ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cohort Screening Panel - Hidden once cohort start time has arrived */}
      {isCohortStarted ? (
        <div style={{
          margin: "24px 0",
          padding: "20px 24px",
          borderRadius: "16px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px"
            }}>
              <FiCheckCircle />
            </div>
            <div>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "700", color: "var(--text-primary)" }}>
                Cohort Training Phase is Active
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", maxWidth: "600px" }}>
                The cohort start date has arrived. The pre-screening schedule and candidate results table are archived from this cohort view. You can review and download the screening results anytime from the Exams section.
              </p>
            </div>
          </div>
          <Link
            to="/admin/exams"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              backgroundColor: "var(--primary-color)",
              color: "#ffffff",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            <FiDownload /> Download Screening Results in Exams
          </Link>
        </div>
      ) : cohort.pre_screening ? (
        <CohortScreeningPanel
          cohortId={id}
          cohort={cohort}
          onSync={loadCohortData}
          manageResultsExternal={manageScreeningResults}
          onResultsSaved={() => setManageScreeningResults(false)}
        />
      ) : screeningMode === "AUTOMATED" ? (
        <CohortScreeningPanel cohortId={id} cohort={cohort} onSync={loadCohortData} />
      ) : screeningMode === "MANUAL" ? (
        <ManualExaminationForm
          onSuccess={loadCohortData}
          initialCohortId={id}
          initialCourseId={typeof cohort.course === "object" ? cohort.course?.id : cohort.course}
          onEnrollAllCandidates={handleEnrollAllEligible}
          autoOpen
          hideTrigger
        />
      ) : (
        <div style={{ marginTop: "24px", padding: "24px", border: "1px solid var(--border-color)", borderRadius: "12px", background: "var(--bg-nested)" }}>
          <h3 style={{ margin: "0 0 6px", color: "var(--text-primary)" }}>Screening Examination</h3>
          <p style={{ margin: "0 0 18px", color: "var(--text-secondary)" }}>Choose how this cohort's screening examination will be recorded.</p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button type="button" disabled={eligibleApplicants === 0} onClick={() => setScreeningMode("AUTOMATED")} style={{ padding: "11px 16px", border: 0, borderRadius: "8px", background: eligibleApplicants === 0 ? "#cbd5e1" : "var(--primary-color)", color: eligibleApplicants === 0 ? "#64748b" : "var(--button-primary-text)", fontWeight: 700, cursor: eligibleApplicants === 0 ? "not-allowed" : "pointer" }}>Schedule Automated Screening</button>
            <button type="button" disabled={eligibleApplicants === 0} onClick={() => setScreeningMode("MANUAL")} style={{ padding: "11px 16px", border: "1px solid #16a34a", borderRadius: "8px", background: eligibleApplicants === 0 ? "#e2e8f0" : "#dcfce7", color: eligibleApplicants === 0 ? "#64748b" : "#166534", fontWeight: 700, cursor: eligibleApplicants === 0 ? "not-allowed" : "pointer" }}>Manual Screening</button>
          </div>
          {eligibleApplicants === 0 && <p style={{ margin: "14px 0 0", color: "#b91c1c", fontSize: "13px" }}>Add at least one applied or eligible student to this cohort before scheduling an examination.</p>}
        </div>
      )}

      {cohort.pre_screening && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "16px 0 24px" }}>
          <button
            type="button"
            onClick={() => setManageScreeningResults((value) => !value)}
            style={{ padding: "11px 18px", border: 0, borderRadius: "8px", background: "var(--primary-color)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            {manageScreeningResults ? "Close Edit Results" : "Edit Results"}
          </button>
          <button
            type="button"
            onClick={handleEnrollAllEligible}
            disabled={enrollingEligible}
            style={{ padding: "11px 18px", border: "1px solid #16a34a", borderRadius: "8px", background: "#dcfce7", color: "#166534", fontWeight: 700, cursor: enrollingEligible ? "wait" : "pointer" }}
          >
            {enrollingEligible ? "Enrolling..." : "Enroll All Eligible Students"}
          </button>
        </div>
      )}

      {!cohort.pre_screening && screeningMode === null && false && (
        <ManualExaminationForm
          onSuccess={loadCohortData}
          initialCohortId={id}
          initialCourseId={typeof cohort.course === "object" ? cohort.course?.id : cohort.course}
        />
      )}

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
            <span className={styles.metricLabel}>Enrolled Students</span>
          </div>
          <p className={styles.metricValue}>
            {cohort.students_count ?? 0} {cohort.max_students ? `/ ${cohort.max_students}` : ""}
          </p>
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