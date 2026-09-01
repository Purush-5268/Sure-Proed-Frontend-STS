// import { useEffect, useState } from "react";
// import { Link } from "react-router-dom";
// import { applicationService } from "../../services/applicationService";
// import styles from "./MyApplications.module.css";
// import SkeletonLoader from "../../components/common/SkeletonLoader";

// function MyApplications() {
//   const [applications, setApplications] = useState([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     let isMounted = true;

//     const loadApplications = async () => {
//       try {
//         const apps = await applicationService.getApplications();
//         if (isMounted) setApplications(apps);
//       } catch (err) {
//         console.error("Failed to load applications:", err);
//         if (isMounted) setApplications([]);
//       } finally {
//         if (isMounted) setLoading(false);
//       }
//     };

//     loadApplications();
//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const formatDate = (value) => {
//     if (!value) return "N/A";
//     return new Date(value).toLocaleDateString("en-IN", {
//       year: "numeric",
//       month: "short",
//       day: "numeric",
//     });
//   };

//   return (
//     <div className={styles.page}>
//       <div className={styles.container}>
//         <div className={styles.header}>
//           <h1>My Applications</h1>

//           <p>Track your internship applications and current application status.</p>
//         </div>

//         {loading ? (
//           <SkeletonLoader variant="table" rows={4} />
//         ) : applications.length === 0 ? (
//           <p>No applications have been submitted yet.</p>
//         ) : (
//           applications.map((app) => (
//             <div key={app.id} className="premium-card">
//               <div className={styles.row}>
//                 <strong>Application Number</strong>
//                 <span>{app.application_number || app.id}</span>
//               </div>

//               <div className={styles.row}>
//                 <strong>Course</strong>
//                 <span>{app.course?.name || "N/A"}</span>
//               </div>

//               <div className={styles.row}>
//                 <strong>Status</strong>
//                 <span className={styles.status}>{app.status || "PENDING"}</span>
//               </div>

//               <div className={styles.row}>
//                 <strong>Applied On</strong>
//                 <span>{formatDate(app.applied_at)}</span>
//               </div>

//               <Link to="/student/application-status" state={{ application: app }} className={styles.button}>
//                 View Status
//               </Link>
//             </div>
//           ))
//         )}
//       </div>
//     </div>
//   );
// }

// export default MyApplications;
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import styles from "./MyApplications.module.css";

function MyApplications() {
  const navigate = useNavigate();
  const [activeApplications, setActiveApplications] = useState([]);
  const [pastApplications, setPastApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [requestingOfferLetterId, setRequestingOfferLetterId] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedAppModal, setSelectedAppModal] = useState(null);

  // Tab State: 'ACTIVE' (default) vs 'PAST'
  const [viewMode, setViewMode] = useState("ACTIVE");

  const loadApplications = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE).catch(() => null);
      const apps = Array.isArray(res?.data) ? res.data : (res?.data?.results || []);

      // If backend API call succeeded, sync live DB applications directly and purge stale storage
      if (res && res.data != null) {
        localStorage.setItem("sure_student_applications", JSON.stringify(apps));
        const validCourseIds = apps.map((a) => a.course?.id || a.course_id).filter(Boolean);
        localStorage.setItem("sure_applied_course_ids", JSON.stringify(validCourseIds));

        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sure_exam_disqualified_")) {
            const cId = key.replace("sure_exam_disqualified_", "");
            if (!validCourseIds.includes(cId)) {
              localStorage.removeItem(key);
            }
          }
        });
      }

      const masterAppsList = [...apps];
      // Sort newest first
      masterAppsList.sort((x, y) => new Date(y.created_at || y.applied_at || 0) - new Date(x.created_at || x.applied_at || 0));

      const activeList = [];
      const pastList = [];

      masterAppsList.forEach((app) => {
        const st = (app.status || "").toUpperCase();
        const isQualified = st === "QUALIFIED" || st === "COHORT_ASSIGNED" || ["ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS"].includes(st) || app.qualified === true;
        const isDisqualified = !isQualified && ((app.cheat_count && app.cheat_count >= 5) || app.qualified === false || st === "REJECTED" || st === "DISQUALIFIED");

        if (isQualified) {
          activeList.push(app);
        } else if (isDisqualified || ["REJECTED", "EXAM_FAILED", "COMPLETED"].includes(st)) {
          pastList.push(app);
        } else {
          activeList.push(app);
        }
      });

      setActiveApplications(activeList);
      setPastApplications(pastList);
    } catch (err) {
      console.error("Failed to load applications:", err);
      setActiveApplications([]);
      setPastApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  // Handle Cancel / Delete Application
  const handleDeleteApplication = async (appId, courseId) => {
    if (!window.confirm("Are you sure you want to cancel and delete this application? You will be free to apply for a different course track immediately.")) {
      return;
    }

    try {
      setDeletingId(appId);

      // Call API Delete endpoint
      await apiClient.delete(`${API_ENDPOINTS.APPLICATIONS.BASE}${appId}/`).catch(() => null);

      // Clean LocalStorage
      const localApps = JSON.parse(localStorage.getItem("sure_student_applications") || "[]");
      const updatedLocalApps = localApps.filter((a) => a.id !== appId);
      localStorage.setItem("sure_student_applications", JSON.stringify(updatedLocalApps));

      if (courseId) {
        const appliedCourseIds = new Set(JSON.parse(localStorage.getItem("sure_applied_course_ids") || "[]"));
        appliedCourseIds.delete(courseId);
        localStorage.setItem("sure_applied_course_ids", JSON.stringify(Array.from(appliedCourseIds)));
      }

      setMessage("✅ Application cancelled and deleted successfully. You can now choose a new course track!");
      await loadApplications();
    } catch (err) {
      console.error("Failed to delete application:", err);
      alert("Could not delete application. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRequestOfferLetter = async (appId) => {
    try {
      setRequestingOfferLetterId(appId);
      await apiClient.post(`${API_ENDPOINTS.APPLICATIONS.BASE}${appId}/request-offer-letter/`);
      setMessage("✅ Offer Letter requested successfully.");
      await loadApplications();
    } catch (err) {
      console.error("Failed to request offer letter:", err);
      alert(err.response?.data?.detail || "Could not request offer letter. Please try again.");
    } finally {
      setRequestingOfferLetterId(null);
    }
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1>My Applications</h1>
          <p>Loading your active and previous applications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>My Internship Applications</h1>
          <p>Track your active applications, exam screening status, and course history.</p>
        </div>

        {/* View Mode Toggle Controls */}
        <div style={{ marginTop: "1rem", display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setViewMode("ACTIVE")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              backgroundColor: viewMode === "ACTIVE" ? "var(--primary-color)" : "var(--student-surface-2, var(--bg-nested))",
              color: viewMode === "ACTIVE" ? "var(--text-inverse)" : "var(--text-secondary)",
              border: "1px solid",
              borderColor: viewMode === "ACTIVE" ? "var(--primary-color)" : "var(--border-color)",
            }}
          >
            🟢 Active Applications ({activeApplications.length})
          </button>

          <button
            type="button"
            onClick={() => setViewMode("PAST")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: "14px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              backgroundColor: viewMode === "PAST" ? "var(--primary-color)" : "var(--student-surface-2, var(--bg-nested))",
              color: viewMode === "PAST" ? "var(--text-inverse)" : "var(--text-secondary)",
              border: "1px solid",
              borderColor: viewMode === "PAST" ? "var(--primary-color)" : "var(--border-color)",
            }}
          >
            📁 Previous / Past Courses ({pastApplications.length})
          </button>
        </div>
      </div>

      {message && (
        <div style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>
          {message}
        </div>
      )}

      <div className={styles.list}>
        {viewMode === "ACTIVE" ? (
          /* 🟢 ACTIVE APPLICATIONS MODE 🟢 */
          activeApplications.length === 0 ? (
            <div style={{ backgroundColor: "var(--status-pending-bg, rgba(251,191,36,0.1))", border: "1px solid var(--status-pending-text, #f59e0b)", padding: "2.5rem", borderRadius: "12px", textAlign: "center" }}>
              <h2 style={{ color: "#92400e", margin: "0 0 8px 0" }}>No Pending Exam or Active Application</h2>
              <p style={{ color: "#b45309", fontSize: "15px", marginBottom: "1.5rem" }}>
                You currently do not have an active pending application. Browse our course catalog to apply!
              </p>
              <Link to="/student/apply-course" style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "15px" }}>
                Browse & Apply for Courses →
              </Link>
            </div>
          ) : (
            activeApplications.map((activeApp) => {
              const isQualified = ["QUALIFIED", "COHORT_ASSIGNED", "ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS"].includes((activeApp.status || "").toUpperCase()) || activeApp.qualified === true;
              const isExamTaken = activeApp.exam_taken || isQualified || ["EXAM_COMPLETED", "EVALUATED", "REJECTED", "EXAM_GIVEN"].includes((activeApp.status || "").toUpperCase()) || activeApp.qualification_score != null || activeApp.score != null;

              const scoreVal = activeApp.qualification_score != null ? activeApp.qualification_score : (activeApp.score != null ? activeApp.score : (activeApp.percentage != null ? activeApp.percentage : null));
              const formattedScoreStr = scoreVal != null ? `${scoreVal}% Marks` : "EVALUATED";

              return (
                <div key={activeApp.id} className={styles.applicationCard} style={{ borderLeft: isQualified ? "4px solid var(--status-active-text, #10b981)" : "4px solid var(--primary-color)" }}>
                  
                  <div className={styles.infoGrid}>
                    <div className={styles.infoBox}>
                      <strong>Application Number</strong>
                      <span>{activeApp.application_number || activeApp.id}</span>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Course Track</strong>
                      <span style={{ color: "var(--primary-color)" }}>{activeApp.course_display || activeApp.course_name || activeApp.course?.name || "Course Track"}</span>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Status</strong>
                      <div>
                        <span
                          style={{
                            backgroundColor: isQualified ? "var(--status-active-bg, #dcfce7)" : (isExamTaken ? "var(--status-pending-bg, #fef3c7)" : "var(--status-inactive-bg, #dbeafe)"),
                            color: isQualified ? "var(--status-active-text, #166534)" : (isExamTaken ? "var(--status-pending-text, #92400e)" : "var(--status-inactive-text, #1e40af)"),
                            fontWeight: "bold",
                            padding: "6px 12px",
                            borderRadius: "var(--radius-full)",
                            fontSize: "12px",
                            display: "inline-block"
                          }}
                        >
                          {isQualified ? `🏆 QUALIFIED (${formattedScoreStr})` : (isExamTaken ? `EXAM GIVEN (${formattedScoreStr})` : "📋 EXAM PENDING")}
                        </span>
                      </div>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Applied On</strong>
                      <span>{formatDate(activeApp.applied_at || activeApp.created_at)}</span>
                    </div>
                  </div>

                  {isQualified && activeApp.assigned_cohort && (
                    <div className={styles.offerCard}>
                      <strong style={{ display: "block", marginBottom: "12px", color: "var(--text-primary)" }}>Offer Letter Status</strong>
                      {activeApp.offer_letter_issued && activeApp.offer_letter_file ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "var(--status-active-text, #10b981)", fontWeight: "bold" }}>✅ Offer Letter Issued</span>
                          <button 
                            onClick={() => applicationService.downloadPrivateFile(activeApp.offer_letter_file, `Offer_Letter_${activeApp.application_number || activeApp.id}.pdf`)}
                            className={`${styles.premiumBtn} ${styles.btnPrimary}`}
                            style={{ flex: "none", padding: "8px 16px", fontSize: "13px" }}
                          >
                            View / Download
                          </button>
                        </div>
                      ) : activeApp.offer_letter_request_status === "PENDING" ? (
                        <span style={{ color: "var(--status-pending-text, #d97706)", fontWeight: "bold", display: "block" }}>⏳ Offer Letter Request Pending<br/><small style={{color: "var(--text-muted)", fontWeight: "normal"}}>Your request has been submitted to the administration.</small></span>
                      ) : activeApp.offer_letter_request_status === "IN_PROGRESS" ? (
                        <span style={{ color: "var(--primary-color)", fontWeight: "bold" }}>🔄 Request Being Processed</span>
                      ) : activeApp.offer_letter_request_status === "RESOLVED" ? (
                        <span style={{ color: "var(--status-active-text, #10b981)", fontWeight: "bold", display: "block" }}>✓ Request Approved<br/><small style={{color: "var(--text-muted)", fontWeight: "normal"}}>Your offer letter is being prepared.</small></span>
                      ) : (
                        <div>
                          <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                            Your Offer Letter will be automatically issued after one calendar month.
                          </p>
                          <button
                            onClick={() => handleRequestOfferLetter(activeApp.id)}
                            disabled={requestingOfferLetterId === activeApp.id}
                            className={`${styles.premiumBtn} ${styles.btnDisabled}`}
                            style={{ flex: "none", padding: "8px 16px", fontSize: "13px", cursor: requestingOfferLetterId === activeApp.id ? "not-allowed" : "pointer", opacity: requestingOfferLetterId === activeApp.id ? 0.7 : 1 }}
                          >
                            {requestingOfferLetterId === activeApp.id ? "Requesting..." : "Request Offer Letter Manually"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.actionRow}>
                    <button
                      type="button"
                      onClick={() => setSelectedAppModal(activeApp)}
                      className={`${styles.premiumBtn} ${styles.btnPrimary}`}
                    >
                      View Status & Marks 📊
                    </button>

                    {isQualified ? (
                      <Link
                        to="/student/cohort"
                        className={`${styles.premiumBtn} ${styles.btnSuccess}`}
                      >
                        Go to My Cohort 🚀
                      </Link>
                    ) : isExamTaken ? (
                      <button
                        type="button"
                        onClick={() => setSelectedAppModal(activeApp)}
                        className={`${styles.premiumBtn} ${styles.btnWarning}`}
                      >
                        Exam Already Given ✓
                      </button>
                    ) : (
                      <Link
                        to="/student/exam-instructions"
                        className={`${styles.premiumBtn} ${styles.btnSuccess}`}
                      >
                        Take Screening Exam →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* 📁 PAST APPLICATIONS (INACTIVE) MODE 📁 */
          pastApplications.length === 0 ? (
            <div style={{ backgroundColor: "var(--bg-nested)", padding: "2rem", borderRadius: "12px", textAlign: "center", color: "var(--text-muted, #64748b)" }}>
              No previous courses or past attempt records found.
            </div>
          ) : (
            pastApplications.map((app) => {
              const isRejected = ["REJECTED", "DISQUALIFIED", "EXAM_FAILED"].includes((app.status || "").toUpperCase());

              return (
                <div key={app.id} className={styles.applicationCard} style={{ borderLeft: isRejected ? "4px solid var(--status-inactive-text, #ef4444)" : "4px solid var(--text-muted, #64748b)", opacity: 0.9 }}>
                  
                  <div className={styles.infoGrid}>
                    <div className={styles.infoBox}>
                      <strong>Application Number</strong>
                      <span>{app.application_number || app.id}</span>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Course Track</strong>
                      <span style={{ fontWeight: "bold" }}>{app.course_display || app.course_name || app.course?.name || "Course Track"}</span>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Status</strong>
                      <div>
                        <span
                          style={{
                            backgroundColor: isRejected ? "var(--status-inactive-bg, #fee2e2)" : "var(--student-surface-2, #f1f5f9)",
                            color: isRejected ? "var(--status-inactive-text, #991b1b)" : "var(--text-secondary, #475569)",
                            padding: "6px 12px",
                            borderRadius: "var(--radius-full)",
                            fontWeight: "bold",
                            fontSize: "12px",
                            display: "inline-block"
                          }}
                        >
                          {isRejected ? `REJECTED (15-Day Cooldown Active)` : app.status}
                        </span>
                      </div>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Applied / Attempted On</strong>
                      <span>{formatDate(app.applied_at || app.created_at)}</span>
                    </div>
                  </div>

                  <div className={styles.actionRow}>
                    <button
                      type="button"
                      onClick={() => setSelectedAppModal(app)}
                      className={`${styles.premiumBtn} ${styles.btnDisabled}`}
                      style={{ cursor: "pointer", background: "var(--student-surface-3)" }}
                    >
                      View Result Marks & Info 📊
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* 📊 APPLICATION STATUS & MARKS MODAL 📊 */}
      {selectedAppModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ backgroundColor: "white", padding: "2rem", borderRadius: "16px", maxWidth: "500px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
            <h2 style={{ margin: "0 0 1rem 0", color: "#1e3a8a", borderBottom: "2px solid #e2e8f0", paddingBottom: "0.5rem" }}>
              Application Details & Result Info
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px" }}>
              {(() => {
                const mScore = selectedAppModal.qualification_score != null ? selectedAppModal.qualification_score : (selectedAppModal.score != null ? selectedAppModal.score : (selectedAppModal.percentage != null ? selectedAppModal.percentage : null));
                const stUpper = (selectedAppModal.status || "").toUpperCase();
                const isQual = selectedAppModal.qualified === true || ["QUALIFIED", "COHORT_ASSIGNED", "ACTIVE", "TRAINING", "INTERNSHIP", "SOFT_SKILLS"].includes(stUpper) || (mScore != null && Number(mScore) >= 40.0);
                const isRej = !isQual && (selectedAppModal.qualified === false || ["REJECTED", "EXAM_FAILED", "DISQUALIFIED"].includes(stUpper));

                const statusText = isQual ? "QUALIFIED" : (isRej ? "REJECTED" : (selectedAppModal.status || "APPLIED"));
                const scoreText = mScore != null ? `${mScore}% Marks` + (selectedAppModal.marks_obtained != null && selectedAppModal.total_marks ? ` (${selectedAppModal.marks_obtained} / ${selectedAppModal.total_marks})` : "") : (isQual ? "Passed Exam" : "Exam Pending / Submitted");
                const qualText = isQual ? "🏆 QUALIFIED" : (isRej ? "❌ NOT QUALIFIED (15-Day Cooldown)" : "PENDING EVALUATION");

                return (
                  <>
                    <div><strong>Application No:</strong> {selectedAppModal.application_number || selectedAppModal.id}</div>
                    <div><strong>Course Track:</strong> <span style={{ color: "#2563eb", fontWeight: "bold" }}>{selectedAppModal.course_display || selectedAppModal.course_name || selectedAppModal.course?.name || "General Track"}</span></div>
                    <div><strong>Current Status:</strong> <span style={{ fontWeight: "bold", color: isQual ? "#166534" : (isRej ? "#991b1b" : "#d97706") }}>{statusText}</span></div>
                    <div><strong>Marks Score:</strong> <span style={{ fontWeight: "bold", color: "#1e293b" }}>{scoreText}</span></div>
                    <div><strong>Qualification:</strong> <span style={{ fontWeight: "bold", color: isQual ? "#166534" : (isRej ? "#991b1b" : "#d97706") }}>{qualText}</span></div>
                    <div><strong>Anti-Cheat Violations:</strong> {selectedAppModal.cheat_count || 0} / 5 Security Violations</div>
                    <div><strong>Applied Date:</strong> {formatDate(selectedAppModal.applied_at || selectedAppModal.created_at)}</div>
                  </>
                );
              })()}
            </div>

            <div style={{ marginTop: "1.5rem", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setSelectedAppModal(null)}
                style={{ padding: "10px 20px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyApplications;