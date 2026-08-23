import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiChevronDown, FiChevronUp, FiCheckCircle, FiXCircle, FiClock, FiFileText, FiVideo, FiShield, FiUsers, FiAward, FiFile } from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import styles from "./ApplicationDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ApplicationDetails() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  // Available Cohorts for Assignment
  const [cohorts, setCohorts] = useState([]);
  const [courses, setCourses] = useState([]);

  // Panel toggles
  const [expanded, setExpanded] = useState({
    overview: true,
    screening: false,
    interview: false,
    cohort: false,
    completion: false,
    update: false,
    offerLetter: false
  });

  const togglePanel = (panel) => {
    setExpanded(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const loadApplication = async () => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BY_ID(id));
      setApplication(response.data || null);
      if (response.data?.course) {
        // Fetch cohorts and courses
        const [cohortsRes, coursesRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COHORTS.BASE, { params: { course: response.data.course } }).catch(() => ({ data: [] })),
          apiClient.get(API_ENDPOINTS.COURSES.BASE).catch(() => ({ data: [] }))
        ]);
        setCohorts(cohortsRes.data?.results || cohortsRes.data || []);
        setCourses(coursesRes.data?.results || coursesRes.data || []);
      }
    } catch (err) {
      console.error("Failed to load application details:", err);
      setError("Unable to load application details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadApplication();
  }, [id]);

  // Actions
  const handleUpdateScreening = async (e) => {
    e.preventDefault();
    if (!application?.pre_screening?.id) return alert("No screening record exists for this application.");
    const formData = new FormData(e.target);
    const payload = {
      status: formData.get("status"),
      remarks: formData.get("remarks")
    };
    
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.PRE_SCREENING.UPDATE_STATUS(application.pre_screening.id), payload);
      alert("Screening updated successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update screening.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateInterview = async (e) => {
    e.preventDefault();
    if (!application?.pre_screening_interview?.id) return alert("No interview record exists for this application.");
    const formData = new FormData(e.target);
    const payload = {
      status: formData.get("status"),
      feedback: formData.get("feedback"),
      score: formData.get("score")
    };
    
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.PRE_SCREENING_INTERVIEW.UPDATE_STATUS(application.pre_screening_interview.id), payload);
      alert("Interview updated successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update interview.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignCohort = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const cohortId = formData.get("cohort");
    if (!cohortId) return alert("Please select a cohort.");

    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.APPLICATIONS.ASSIGN_COHORT(id), { cohort_id: cohortId });
      alert("Cohort assigned successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to assign cohort.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckCompletion = async () => {
    setSubmitting(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.APPLICATIONS.CHECK_COMPLETION(id));
      alert(res.data?.message || "Course completion processed.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to process completion. Ensure requirements are met.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneralUpdate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      status: formData.get("status"),
      remarks: formData.get("remarks")
    };
    
    setSubmitting(true);
    try {
      await apiClient.patch(API_ENDPOINTS.APPLICATIONS.BY_ID(id), payload);
      alert("Application updated successfully.");
      loadApplication();
    } catch (err) {
      alert("Failed to update application.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateOfferLetter = async () => {
    setSubmitting(true);
    try {
      await applicationService.generateOfferLetter(id);
      alert("Offer letter generated successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to generate offer letter.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadOfferLetter = async () => {
    try {
      await applicationService.downloadOfferLetter(id);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to fetch offer letter.");
    }
  };

  const handleRevokeOfferLetter = async () => {
    const reason = window.prompt("Enter a reason for revoking the offer letter (optional):");
    if (reason === null) return; // User cancelled
    
    setSubmitting(true);
    try {
      await applicationService.revokeOfferLetter(id, { reason });
      alert("Offer letter revoked successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to revoke offer letter.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestoreOfferLetter = async () => {
    if (!window.confirm("Restore this Offer Letter? This will return it to ISSUED state and allow the student to download it again.")) return;
    
    setSubmitting(true);
    try {
      await applicationService.restoreOfferLetter(id);
      alert("Offer letter restored successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to restore offer letter.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetOfferLetter = async () => {
    if (!window.confirm("This will permanently remove the current Offer Letter file, reset the Offer Letter status to NOT_GENERATED, remove existing Offer Letter requests for this application, and allow a fresh Offer Letter request. Continue?")) return;
    
    setSubmitting(true);
    try {
      await applicationService.resetOfferLetter(id);
      alert("Offer letter and requests reset successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reset offer letter.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspendApplication = async () => {
    if (!window.confirm("Suspend this student's application? They will lose active cohort access but historical data is preserved.")) return;
    
    setSubmitting(true);
    try {
      await apiClient.patch(API_ENDPOINTS.APPLICATIONS.BY_ID(id), { status: "SUSPENDED" });
      alert("Application suspended successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to suspend application.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReactivateApplication = async (newStatus) => {
    if (!window.confirm(`Reactivate this application to ${newStatus}?`)) return;
    
    setSubmitting(true);
    try {
      await apiClient.patch(API_ENDPOINTS.APPLICATIONS.BY_ID(id), { status: newStatus });
      alert(`Application reactivated to ${newStatus}.`);
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reactivate application.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspendCohort = async () => {
    if (!window.confirm("Suspend this student's access to this cohort?\n\nTheir account, profile, historical attendance, submissions, examination records, and other historical data will be preserved. Only access to this cohort's active resources will be revoked.")) return;
    setSubmitting(true);
    try {
      await applicationService.suspendCohort(id);
      alert("Cohort access suspended successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to suspend cohort.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnsuspendCohort = async () => {
    if (!window.confirm("Restore this student's access to this cohort?")) return;
    setSubmitting(true);
    try {
      await applicationService.unsuspendCohort(id);
      alert("Cohort access restored successfully.");
      loadApplication();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to restore cohort access.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className={styles.pageContainer}><SkeletonLoader variant="detail" rows={10} /></div>;
  if (error) return <div className={styles.pageContainer}><p style={{ color: "var(--danger-color)" }}>{error}</p></div>;
  if (!application) return <div className={styles.pageContainer}><p>No application found.</p></div>;

  const studentDetails = application.student_details || {};
  const fullName = studentDetails.name || "Unknown";
  const studentCode = studentDetails.student_code || "No Code";
  const courseId = application.course?.id || application.course;
  const courseObj = courses.find(c => c.id === courseId) || {};
  const courseName = courseObj.name || courseId || "N/A";
  
  const currentCohortId = application.assigned_cohort?.id || application.assigned_cohort;
  const currentCohortObj = cohorts.find(c => c.id === currentCohortId) || {};
  const currentCohortName = currentCohortObj.name || currentCohortId || "Unassigned";

  return (
    <div className={styles.pageContainer}>
      <div className={styles.header}>
        <h1>Application Control Panel</h1>
        <Link to="/admin/applications" className="premium-btn premium-btn-secondary">Back to List</Link>
      </div>

      <div className={styles.panelsContainer}>
        
        {/* PANEL A: Overview */}
        <div className={styles.panel} data-expanded={expanded.overview}>
          <div className={styles.panelHeader} onClick={() => togglePanel('overview')}>
            <div className={styles.panelTitle}><FiFileText /> A. Application Overview</div>
            {expanded.overview ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.overview && (
            <div className={styles.panelContent}>
              <div className={styles.grid}>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Application #</span>
                  <span className={styles.value}>{application.application_number}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Student</span>
                  <span className={styles.value}>{fullName} ({studentCode})</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Course</span>
                  <span className={styles.value}>{courseName}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Applied On</span>
                  <span className={styles.value}>{application.applied_at ? new Date(application.applied_at).toLocaleDateString() : "N/A"}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Workflow Status</span>
                  <span className={`${styles.statusBadge} ${application.status === 'REJECTED' ? 'premium-badge-danger' : 'premium-badge-primary'}`}>
                    {application.status}
                  </span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Exam Result</span>
                  <span className={styles.value}>
                    {application.qualified === true ? <span style={{color:"var(--success-color)"}}>Passed</span> : application.qualified === false ? <span style={{color:"var(--danger-color)"}}>Failed</span> : "Pending"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PANEL B: Screening & Exam Result */}
        <div className={styles.panel} data-expanded={expanded.screening}>
          <div className={styles.panelHeader} onClick={() => togglePanel('screening')}>
            <div className={styles.panelTitle}><FiClock /> B. Screening & Exam Result</div>
            {expanded.screening ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.screening && (
            <div className={styles.panelContent}>
              {application.pre_screening ? (
                <form onSubmit={handleUpdateScreening}>
                  <div className={styles.grid} style={{ marginBottom: "20px" }}>
                    <div className={styles.gridItem}>
                      <span className={styles.label}>Current Status</span>
                      <span className={styles.value}>{application.pre_screening.status}</span>
                    </div>
                    <div className={styles.gridItem}>
                      <span className={styles.label}>Exam Level</span>
                      <span className={styles.value}>{application.pre_screening.level || "N/A"}</span>
                    </div>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Update Status</label>
                    <select name="status" className="premium-input" defaultValue={application.pre_screening.status} required>
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="EVALUATED">Evaluated</option>
                      <option value="PASSED">Passed</option>
                      <option value="FAILED">Failed</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Admin Remarks</label>
                    <textarea name="remarks" className="premium-input" rows={2} defaultValue={application.pre_screening.remarks}></textarea>
                  </div>
                  <div className={styles.actionRow} style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-color)" }}>
                    <button type="submit" className="premium-btn premium-btn-primary" disabled={submitting}>Save Screening</button>
                    <Link to="/admin/exams" className="premium-btn premium-btn-secondary">View Exam Dashboard</Link>
                  </div>
                </form>
              ) : (
                <div style={{ padding: "20px", background: "var(--bg-secondary)", borderRadius: "8px", textAlign: "center" }}>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>No pre-screening exam record exists for this application yet.</p>
                  <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                    <Link to={`/admin/add-exam?appId=${application.id}`} className="premium-btn premium-btn-primary">
                      Assign Exam Now
                    </Link>
                    <Link to="/admin/exams" className="premium-btn premium-btn-secondary">
                      Go to Exams Tab
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PANEL C: Candidate Interview */}
        <div className={styles.panel} data-expanded={expanded.interview}>
          <div className={styles.panelHeader} onClick={() => togglePanel('interview')}>
            <div className={styles.panelTitle}><FiVideo /> C. Candidate Interview</div>
            {expanded.interview ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.interview && (
            <div className={styles.panelContent}>
              {application.pre_screening_interview ? (
                <form onSubmit={handleUpdateInterview}>
                  <div className={styles.grid} style={{ marginBottom: "20px" }}>
                    <div className={styles.gridItem}>
                      <span className={styles.label}>Current Status</span>
                      <span className={styles.value}>{application.pre_screening_interview.status}</span>
                    </div>
                    <div className={styles.gridItem}>
                      <span className={styles.label}>Score</span>
                      <span className={styles.value}>{application.pre_screening_interview.score || "N/A"}</span>
                    </div>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Update Status</label>
                    <select name="status" className="premium-input" defaultValue={application.pre_screening_interview.status} required>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="PASSED">Passed</option>
                      <option value="FAILED">Failed</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Interview Score (0-100)</label>
                    <input type="number" name="score" className="premium-input" defaultValue={application.pre_screening_interview.score} min="0" max="100" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Interview Feedback</label>
                    <textarea name="feedback" className="premium-input" rows={2} defaultValue={application.pre_screening_interview.feedback}></textarea>
                  </div>
                  <div className={styles.actionRow}>
                    <button type="submit" className="premium-btn premium-btn-primary" disabled={submitting}>Save Interview</button>
                  </div>
                </form>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>No interview record generated for this application.</p>
              )}
            </div>
          )}
        </div>

        {/* PANEL E: Cohort Management */}
        <div className={styles.panel} data-expanded={expanded.cohort}>
          <div className={styles.panelHeader} onClick={() => togglePanel('cohort')}>
            <div className={styles.panelTitle}><FiUsers /> E. Cohort Assignment</div>
            {expanded.cohort ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.cohort && (
            <div className={styles.panelContent}>
              <div className={styles.grid} style={{ marginBottom: "20px" }}>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Current Cohort</span>
                  <span className={styles.value}>{currentCohortName}</span>
                </div>
              </div>
              
              <form onSubmit={handleAssignCohort}>
                <div className={styles.formGroup}>
                  <label>Assign to Cohort</label>
                  <select name="cohort" className="premium-input" required disabled={cohorts.length === 0}>
                    <option value="">Select a Cohort...</option>
                    {cohorts.map(c => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                  {cohorts.length === 0 && <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>No cohorts available for this course.</span>}
                </div>
                <div className={styles.actionRow}>
                  <button type="submit" className="premium-btn premium-btn-primary" disabled={submitting || cohorts.length === 0}>Assign Cohort</button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* PANEL F: Course Completion */}
        <div className={styles.panel} data-expanded={expanded.completion}>
          <div className={styles.panelHeader} onClick={() => togglePanel('completion')}>
            <div className={styles.panelTitle}><FiAward /> F. Course Completion</div>
            {expanded.completion ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.completion && (
            <div className={styles.panelContent}>
              <div className={styles.grid} style={{ marginBottom: "20px" }}>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Completed</span>
                  <span className={styles.value}>{application.completed_course ? "Yes" : "No"}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Final Score</span>
                  <span className={styles.value}>{application.final_score || "N/A"}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Completion Date</span>
                  <span className={styles.value}>{application.completed_at ? new Date(application.completed_at).toLocaleDateString() : "N/A"}</span>
                </div>
              </div>

              <div className={styles.actionRow} style={{ justifyContent: "flex-start" }}>
                <button onClick={handleCheckCompletion} className="premium-btn premium-btn-secondary" disabled={submitting || application.completed_course}>
                  Trigger Completion Check
                </button>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", alignSelf: "center", margin: 0 }}>
                  This will evaluate attendance and assignments to trigger final completion.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* PANEL G: General Updates / Offer Letter */}
        <div className={styles.panel} data-expanded={expanded.update}>
          <div className={styles.panelHeader} onClick={() => togglePanel('update')}>
            <div className={styles.panelTitle}><FiShield /> G. General Updates & Manual Status</div>
            {expanded.update ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.update && (
            <div className={styles.panelContent}>
              <form onSubmit={handleGeneralUpdate}>
                <div className={styles.formGroup}>
                  <label>Override Status (Use carefully!)</label>
                  <select name="status" className="premium-input" defaultValue={application.status} required>
                    <option value="APPLIED">Applied</option>
                    <option value="PRE_SCREENING_PENDING">Pre-Screening Pending</option>
                    <option value="EXAM_PENDING">Exam Pending</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="WAITLISTED">Waitlisted</option>
                    <option value="COHORT_ASSIGNED">Cohort Assigned</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="DROPPED">Dropped</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Remarks</label>
                  <textarea name="remarks" className="premium-input" rows={2} defaultValue={application.remarks}></textarea>
                </div>
                <div className={styles.actionRow}>
                  <button type="submit" className="premium-btn premium-btn-danger" disabled={submitting}>Force Update Application</button>
                </div>
              </form>
              
              <div style={{ marginTop: "30px", paddingTop: "20px", borderTop: "1px solid var(--border-color)" }}>
                <h4 style={{ marginBottom: "10px", color: "var(--text-primary)" }}>Core Application Status Management</h4>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "15px" }}>
                  Use these buttons to quickly change the core application status (e.g., if a student drops out or needs to be reinstated).
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {application.status === "SUSPENDED" ? (
                    <>
                      <button onClick={() => handleReactivateApplication("IN_PROGRESS")} className="premium-btn premium-btn-primary" disabled={submitting}>
                        Reactivate (In Progress)
                      </button>
                      <button onClick={() => handleReactivateApplication("COHORT_ASSIGNED")} className="premium-btn premium-btn-secondary" disabled={submitting}>
                        Reactivate (Cohort Assigned)
                      </button>
                    </>
                  ) : (
                    <button onClick={handleSuspendApplication} className="premium-btn premium-btn-danger" disabled={submitting || application.status === "DROPPED" || application.status === "CANCELLED" || application.status === "REJECTED"}>
                      Suspend Application
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PANEL H: Offer Letter */}
        <div className={styles.panel} data-expanded={expanded.offerLetter}>
          <div className={styles.panelHeader} onClick={() => togglePanel('offerLetter')}>
            <div className={styles.panelTitle}><FiFile /> H. Offer Letter Management</div>
            {expanded.offerLetter ? <FiChevronUp /> : <FiChevronDown />}
          </div>
          {expanded.offerLetter && (
            <div className={styles.panelContent}>
              <div className={styles.grid} style={{ marginBottom: "20px" }}>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Offer Letter Status</span>
                  <span className={styles.value}>{application.offer_letter_issued ? "Generated" : "Not Generated"}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Student Request</span>
                  <span className={styles.value}>{application.offer_letter_request_status || "Not Requested"}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.label}>Eligibility Date</span>
                  <span className={styles.value}>
                    {application.assigned_cohort?.start_date ? (() => {
                        const start = new Date(application.assigned_cohort.start_date);
                        const eligible = new Date(start);
                        eligible.setMonth(eligible.getMonth() + 1);
                        if (new Date() >= eligible) {
                          return <span style={{color:"var(--success-color)", fontWeight: "bold"}}>Eligible</span>;
                        }
                        return <span style={{color:"var(--warning-color)", fontWeight: "bold"}}>Eligible after {eligible.toLocaleDateString()}</span>;
                      })() : "N/A"}
                  </span>
                </div>
              </div>

              <div className={styles.actionRow} style={{ justifyContent: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                {!application.offer_letter_issued || application.offer_letter_request_status === "NOT_REQUESTED" ? (
                  <button onClick={handleGenerateOfferLetter} className="premium-btn premium-btn-primary" disabled={submitting}>
                    Issue Offer Letter
                  </button>
                ) : application.offer_letter_request_status === "REVOKED" ? (
                  <>
                    <button onClick={handleRestoreOfferLetter} className="premium-btn premium-btn-secondary" disabled={submitting}>
                      Restore / Reaccess
                    </button>
                    <button onClick={handleResetOfferLetter} className="premium-btn premium-btn-danger" disabled={submitting}>
                      Reset Offer Letter
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleGenerateOfferLetter} className="premium-btn premium-btn-secondary" disabled={submitting}>
                      Regenerate Offer Letter
                    </button>
                    <button onClick={handleDownloadOfferLetter} className="premium-btn premium-btn-primary" disabled={submitting}>
                      View / Download
                    </button>
                    <button onClick={handleRevokeOfferLetter} className="premium-btn premium-btn-danger" disabled={submitting || application.offer_letter_status === 'REVOKED'}>
                      Revoke Offer Letter
                    </button>
                    <button onClick={handleResetOfferLetter} className="premium-btn premium-btn-danger" disabled={submitting}>
                      Reset Offer Letter
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default ApplicationDetails;