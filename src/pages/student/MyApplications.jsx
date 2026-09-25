
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { applicationService } from "../../services/applicationService";
import { courseService } from "../../services/courseService";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./MyApplications.module.css";
import { formatDisplayDate } from "../../utils/dateUtils";

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
      const [res, coursesRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE).catch(() => null),
        courseService.getCourses().catch(() => [])
      ]);
      const rawApps = Array.isArray(res?.data) ? res.data : (res?.data?.results || []);
      const coursesArray = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || coursesRes?.data || []);

      // Map course names to apps if they are just UUIDs
      const apps = rawApps.map(app => {
        if (!app.course_display && !app.course_name && typeof app.course === 'string') {
          const matchedCourse = coursesArray.find(c => c.id === app.course);
          if (matchedCourse) {
            app.course_display = matchedCourse.name;
            app.course = matchedCourse;
          }
        }
        return app;
      });
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

  const handleJoinWhatsApp = async (appId, link) => {
    try {
      await apiClient.post(`${API_ENDPOINTS.APPLICATIONS.BASE}${appId}/confirm-whatsapp-join/`);
      setActiveApplications(prev => prev.map(app => 
        app.id === appId ? { ...app, whatsapp_joined: true } : app
      ));
      const localApps = JSON.parse(localStorage.getItem("sure_student_applications") || "[]");
      const updatedLocalApps = localApps.map(app => 
        app.id === appId ? { ...app, whatsapp_joined: true } : app
      );
      localStorage.setItem("sure_student_applications", JSON.stringify(updatedLocalApps));
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error("Failed to confirm WhatsApp join:", err);
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };



  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1>My Applications</h1>
          <p>Loading your active and previous applications...</p>
        </div>
        <SkeletonLoader variant="cards" count={2} />
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
              <h2 style={{ color: "#92400e", margin: "0 0 8px 0" }}>No Active Application</h2>
              <p style={{ color: "#b45309", fontSize: "15px", marginBottom: "1.5rem" }}>
                You currently do not have an active application. Browse our course catalog to apply for an internship track!
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
                <div key={activeApp.id} className={styles.applicationCard} style={{ borderLeft: isQualified ? "4px solid var(--primary-color)" : "4px solid var(--primary-color)" }}>
                  
                  <div className={styles.infoGrid}>
                    <div className={styles.infoBox}>
                      <strong>Application Number</strong>
                      <span>{activeApp.application_number || activeApp.id}</span>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Course Name</strong>
                      <span style={{ color: "var(--primary-color)" }}>{activeApp.course_display || activeApp.course_name || activeApp.course?.name || "Unknown Course"}</span>
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
                          {isQualified
                            ? `🏆 ENROLLED (${formattedScoreStr})`
                            : isExamTaken
                            ? `EXAM GIVEN (${formattedScoreStr})`
                            : (activeApp.status === "APPLIED" && !activeApp.pre_screening?.scheduled_at)
                            ? "📝 APPLIED"
                            : "📋 PRE-SCREENING"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Meeting Start Time</strong>
                      {activeApp.pre_screening?.scheduled_at ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ color: "#2563eb", fontWeight: "600" }}>
                            📅 {new Date(activeApp.pre_screening.scheduled_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })} at {new Date(activeApp.pre_screening.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {activeApp.pre_screening?.meeting_link && (
                            <a
                              href={activeApp.pre_screening.meeting_link}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#059669", fontSize: "12px", fontWeight: "600", textDecoration: "underline" }}
                            >
                              📹 Join Google Meet
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                          ⏳ Not scheduled yet
                        </span>
                      )}
                    </div>

                    <div className={styles.infoBox}>
                      <strong>Applied On</strong>
                      <span>{formatDisplayDate(activeApp.applied_at || activeApp.created_at)}</span>
                    </div>
                  </div>

                  {isQualified && activeApp.assigned_cohort && (
                    <div className={styles.offerCard}>
                      <strong style={{ display: "block", marginBottom: "12px", color: "var(--text-primary)" }}>Offer Letter Status</strong>
                      {activeApp.offer_letter_issued && activeApp.offer_letter_file ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "var(--primary-color)", fontWeight: "bold" }}>✅ Offer Letter Issued</span>
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
                        <span style={{ color: "var(--primary-color)", fontWeight: "bold", display: "block" }}>✓ Request Approved<br/><small style={{color: "var(--text-muted)", fontWeight: "normal"}}>Your offer letter is being prepared.</small></span>
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

                  {activeApp.whatsapp_group_link && (
                    <div style={{ margin: '1.5rem 0', padding: '1.5rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                      {!activeApp.whatsapp_joined ? (
                        <>
                          <h4 style={{ color: '#166534', margin: '0 0 0.5rem 0' }}>Cohort onboarding</h4>
                          <h3 style={{ color: '#15803d', margin: '0 0 1rem 0' }}>WhatsApp Group</h3>
                          <p style={{ color: '#166534', marginBottom: '1rem' }}>Join the official cohort community</p>
                          <button
                            onClick={() => handleJoinWhatsApp(activeApp.id, activeApp.whatsapp_group_link)}
                            style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            Join WhatsApp Group
                          </button>
                        </>
                      ) : (
                        <>
                          <h3 style={{ color: '#15803d', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            WHATSAPP JOINED ✓
                          </h3>
                          <p style={{ color: '#166534', margin: 0 }}>You're connected with your cohort.</p>
                        </>
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
                      (() => {
                        const isScheduled = Boolean(activeApp.pre_screening?.scheduled_at || activeApp.scheduled_at || activeApp.status === "SCREENING_SCHEDULED");

                        if (!isScheduled) {
                          return (
                            <button className={`${styles.premiumBtn} ${styles.btnDisabled}`} disabled style={{ cursor: "not-allowed", backgroundColor: "var(--bg-surface)", color: "var(--text-muted)" }}>
                              No Exam Scheduled
                            </button>
                          );
                        }

                        return (
                          <Link
                            to="/student/exam-instructions"
                            className={`${styles.premiumBtn} ${styles.btnSuccess}`}
                          >
                            Take Screening Exam →
                          </Link>
                        );
                      })()
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
                      <strong>Course Name</strong>
                      <span style={{ fontWeight: "bold" }}>{app.course_display || app.course_name || app.course?.name || "Unknown Course"}</span>
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
                      <span>{formatDisplayDate(app.applied_at || app.created_at)}</span>
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
          <div style={{ backgroundColor: "var(--bg-card)", padding: "2rem", borderRadius: "16px", maxWidth: "500px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
            <h2 style={{ margin: "0 0 1rem 0", color: "var(--primary-color)", borderBottom: "2px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              Application Details & Result Info
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px", color: "var(--text-primary)" }}>
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
                    <div><strong>Course Name:</strong> <span style={{ color: "var(--primary-color)", fontWeight: "bold" }}>{selectedAppModal.course_display || selectedAppModal.course_name || selectedAppModal.course?.name || "Unknown Course"}</span></div>
                    <div><strong>Current Status:</strong> <span style={{ fontWeight: "bold", color: isQual ? "#16a34a" : (isRej ? "#dc2626" : "#d97706") }}>{statusText}</span></div>
                    <div><strong>Marks Score:</strong> <span style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{scoreText}</span></div>
                    <div><strong>Qualification:</strong> <span style={{ fontWeight: "bold", color: isQual ? "#16a34a" : (isRej ? "#dc2626" : "#d97706") }}>{qualText}</span></div>
                    <div><strong>Anti-Cheat Violations:</strong> {selectedAppModal.cheat_count || 0} / 5 Security Violations</div>
                    <div><strong>Applied Date:</strong> {formatDisplayDate(selectedAppModal.applied_at || selectedAppModal.created_at)}</div>
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