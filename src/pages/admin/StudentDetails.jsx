import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { studentService } from "../../services/studentService";
import styles from "./StudentDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiArrowLeft, FiMail, FiPhone, FiMapPin, FiBook, FiCalendar, FiGithub, FiLinkedin, FiGlobe, FiCheckCircle, FiXCircle, FiClock, FiShield, FiEdit } from "react-icons/fi";

function StudentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStudent = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.STUDENTS.BY_ID(id));
        setStudent(response.data || null);
      } catch (err) {
        console.error("Failed to load student:", err);
        setError("Unable to load student details.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadStudent();
    }
  }, [id]);

  if (loading) return <div className={styles.page}><div className="premium-card"><h1>Student Details</h1><SkeletonLoader variant="detail" /></div></div>;
  if (error) return <div className={styles.page}><div className="premium-card"><h1>Student Details</h1><p style={{ color: "#b91c1c" }}>{error}</p></div></div>;
  if (!student) return <div className={styles.page}><div className="premium-card"><h1>Student Details</h1><p>No student found.</p></div></div>;

  const user = student.user || {};
  const fullName = `${user.first_name || student.first_name || ""} ${user.last_name || student.last_name || ""}`.trim() || user.email || "Unknown";
  const email = user.email || student.email || "N/A";
  const phone = user.phone_number || student.phone_number || "N/A";

  // Application data from the serializer
  const app = student.current_application;
  const activeCohort = student.active_cohort;
  const courseName = activeCohort?.course_name || app?.course?.name || "No Course";
  const cohortCode = activeCohort?.cohort_code || app?.assigned_cohort?.code || "Not Assigned";

  const formatStatus = (s) => {
    if (!s) return "N/A";
    return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  // Exam status
  let examStatusLabel = "No Application";
  let examStatusColor = "#9ca3af";
  if (student.qualified === true) {
    examStatusLabel = "Passed";
    examStatusColor = "#059669";
  } else if (student.qualified === false) {
    examStatusLabel = "Not Passed";
    examStatusColor = "#dc2626";
  } else if (student.application_status) {
    examStatusLabel = "Pending";
    examStatusColor = "#d97706";
  }

  // Account type
  let accountType = "Candidate";
  let accountColor = "#6b7280";
  let accountBg = "#f3f4f6";
  if (student.is_official_student) {
    accountType = "Official Student";
    accountColor = "#059669";
    accountBg = "#d1fae5";
  } else {
    const neverLoggedIn = student.last_login === null || student.last_login === undefined;
    const emailNotVerified = student.is_email_verified === false;
    if (neverLoggedIn && emailNotVerified && !student.application_status) {
      accountType = "🌱 Seeded Account";
      accountColor = "#6d28d9";
      accountBg = "#ede9fe";
    }
  }

  return (
    <div className={styles.page}>
      <div className="premium-card" style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem" }}>
        {/* Back Button */}
        <button
          onClick={() => navigate("/admin/students")}
          style={{ background: "transparent", border: "none", display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "14px", marginBottom: "1.5rem", padding: 0 }}
        >
          <FiArrowLeft /> Back to Students
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "2rem" }}>
          <div className={styles.avatar}>{fullName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: "0 0 4px 0", color: "var(--text-primary)" }}>{fullName}</h2>
            <p style={{ margin: "0 0 8px 0", color: "var(--text-muted)", fontSize: "14px" }}>
              {email} · {student.student_code || "No Code"}
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ display: "inline-block", fontWeight: "600", color: accountColor, backgroundColor: accountBg, padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                {accountType}
              </span>
              <span style={{ display: "inline-block", fontWeight: "600", color: examStatusColor, backgroundColor: examStatusColor + "15", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                Exam: {examStatusLabel}
              </span>
            </div>
          </div>
          <Link to={`/admin/edit-student/${student.id}`} className="premium-btn premium-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", height: "auto" }}>
            <FiEdit /> Edit
          </Link>
        </div>

        {/* Contact & Location */}
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>Contact & Location</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FiMail style={{ color: "var(--primary-color)" }} /> <span><strong>Email:</strong> {email}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FiPhone style={{ color: "var(--primary-color)" }} /> <span><strong>Phone:</strong> {phone}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FiMapPin style={{ color: "var(--primary-color)" }} /> <span><strong>Location:</strong> {student.city ? `${student.city}${student.state ? `, ${student.state}` : ""}${student.country ? `, ${student.country}` : ""}` : "N/A"}</span></div>
          </div>
        </div>

        {/* Academic Details */}
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>Academic Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
            <div style={{ gridColumn: "1 / -1" }}><strong>College:</strong> {student.college || "N/A"}</div>
            <div><strong>Degree:</strong> {student.degree || "N/A"}</div>
            <div><strong>Specialization:</strong> {student.specialization || "N/A"}</div>
            <div><strong>Graduation Year:</strong> {student.graduation_year || "N/A"}</div>
            <div><strong>Education Level:</strong> {student.education_level || "N/A"}</div>
          </div>
        </div>

        {/* Course & Cohort (from serializer data) */}
        <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
            <FiBook style={{ marginRight: "8px" }} />Course & Enrollment
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
            <div><strong>Course:</strong> {courseName}</div>
            <div><strong>Batch/Cohort:</strong> {cohortCode}</div>
            <div><strong>Application Status:</strong> {formatStatus(student.application_status)}</div>
            <div><strong>Exam Result:</strong> <span style={{ color: examStatusColor, fontWeight: "600" }}>{examStatusLabel}</span></div>
            {app && (
              <>
                <div><strong>Application #:</strong> {app.application_number || "N/A"}</div>
                <div>
                  <Link
                    to={`/admin/application-details/${app.id}`}
                    style={{ color: "var(--primary-color)", fontWeight: "600", textDecoration: "underline" }}
                  >
                    View Full Application →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Skills & Bio */}
        {(student.skills?.length > 0 || student.tagline || student.bio) && (
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>Skills & Profile</h3>
            <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              {student.tagline && <div style={{ marginBottom: "8px" }}><strong>Tagline:</strong> {student.tagline}</div>}
              {student.bio && <div style={{ marginBottom: "8px" }}><strong>Bio:</strong> {student.bio}</div>}
              {student.skills?.length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <strong>Skills:</strong>{" "}
                  {(Array.isArray(student.skills) ? student.skills : [student.skills]).map((skill, i) => (
                    <span key={i} style={{ display: "inline-block", backgroundColor: "var(--bg-nested)", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", marginRight: "4px", marginBottom: "4px" }}>{skill}</span>
                  ))}
                </div>
              )}
              {student.hobbies?.length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <strong>Hobbies:</strong> {Array.isArray(student.hobbies) ? student.hobbies.join(", ") : student.hobbies}
                </div>
              )}
              {student.languages?.length > 0 && (
                <div>
                  <strong>Languages:</strong> {Array.isArray(student.languages) ? student.languages.join(", ") : student.languages}
                </div>
              )}
            </div>
          </div>
        )}

        {/* External Profiles */}
        {(student.linkedin_url || student.github_url || student.github_username || student.portfolio_url) && (
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>External Profiles</h3>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "14px" }}>
              {student.linkedin_url && (
                <a href={student.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#0077b5", textDecoration: "none" }}>
                  <FiLinkedin /> LinkedIn {student.is_linkedin_connected && <FiCheckCircle style={{ color: "#059669", fontSize: "12px" }} />}
                </a>
              )}
              {(student.github_url || student.github_username) && (
                <a href={student.github_url || `https://github.com/${student.github_username}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#333", textDecoration: "none" }}>
                  <FiGithub /> GitHub: {student.github_username || "Profile"} {student.is_github_connected && <FiCheckCircle style={{ color: "#059669", fontSize: "12px" }} />}
                </a>
              )}
              {student.portfolio_url && (
                <a href={student.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color)", textDecoration: "none" }}>
                  <FiGlobe /> Portfolio
                </a>
              )}
            </div>
          </div>
        )}

        {/* Completed Cohorts History */}
        {student.completed_cohorts?.length > 0 && (
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>Completed Courses</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {student.completed_cohorts.map((cc, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "var(--bg-nested)", borderRadius: "8px", fontSize: "13px" }}>
                  <div>
                    <strong>{cc.course_name}</strong> · {cc.cohort_code || "N/A"}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    {cc.completed_at ? new Date(cc.completed_at).toLocaleDateString() : "N/A"} · Score: {cc.final_score ?? "N/A"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certificates */}
        {student.certificates?.length > 0 && (
          <div style={{ backgroundColor: "var(--bg-surface)", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem", border: "1px solid var(--border-color)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>Certificates</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {student.certificates.map((cert, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "var(--bg-nested)", borderRadius: "8px", fontSize: "13px" }}>
                  <div>
                    <strong>{cert.course_name || cert.certificate_number}</strong>
                    {cert.verification_code && <span style={{ marginLeft: "8px", color: "var(--text-muted)" }}>#{cert.verification_code}</span>}
                  </div>
                  <span style={{ color: cert.status === "ISSUED" ? "#059669" : "#d97706", fontWeight: "600", fontSize: "12px" }}>
                    {cert.status || "N/A"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin Actions */}
        {student.status === "PENDING_ADMIN_REVIEW" && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button
              onClick={async () => {
                try {
                  await studentService.verifyStudent(student.id, "APPROVE");
                  setStudent(prev => ({ ...prev, status: "ADMIN_APPROVED" }));
                } catch (e) { alert("Failed to approve: " + (e.response?.data?.detail || e.message)); }
              }}
              style={{ flex: 1, padding: "10px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
            >
              Approve Manually
            </button>
            <button
              onClick={async () => {
                const reason = window.prompt("Enter rejection reason:");
                if (reason !== null) {
                  try {
                    await studentService.verifyStudent(student.id, "REJECT", reason);
                    setStudent(prev => ({ ...prev, status: "ADMIN_REJECTED", rejection_reason: reason }));
                  } catch (e) { alert("Failed to reject: " + (e.response?.data?.detail || e.message)); }
                }
              }}
              style={{ flex: 1, padding: "10px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
            >
              Reject Manually
            </button>
          </div>
        )}

        <div className={styles.buttons} style={{ marginTop: "2rem" }}>
          <Link to={`/admin/edit-student/${student.id}`} className={styles.edit}>Edit Student</Link>
          <Link to="/admin/students" className={styles.back}>Back to Students</Link>
        </div>
      </div>
    </div>
  );
}

export default StudentDetails;
