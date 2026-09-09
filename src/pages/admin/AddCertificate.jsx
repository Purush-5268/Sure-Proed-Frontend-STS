import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddCertificate.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function generateUniqueCodes() {
  const year = new Date().getFullYear();
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const randAlpha = Math.random().toString(36).substring(2, 8).toUpperCase();
  return {
    certificate_number: `CERT-${year}-${randNum}`,
    verification_code: `VERIFY-${randAlpha}`,
  };
}

function AddCertificate() {
  const navigate = useNavigate();
  const initialCodes = useMemo(() => generateUniqueCodes(), []);

  const [form, setForm] = useState({
    certificate_number: initialCodes.certificate_number,
    verification_code: initialCodes.verification_code,
    cohort: "",
    student: "",
    application: "",
    certificate_type: "COURSE",
    title: "",
    issued_at: new Date().toISOString().slice(0, 16),
    status: "ACTIVE",
  });

  const [cohorts, setCohorts] = useState([]);
  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filter toggle: completed only (both cohort and students)
  const [onlyCompleted, setOnlyCompleted] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setDataLoading(true);
      try {
        const [cohortsData, studentsData, applicationsData] = await Promise.all([
          fetchAllPages(API_ENDPOINTS.COHORTS.BASE).catch(() => []),
          fetchAllPages(API_ENDPOINTS.STUDENTS.BASE).catch(() => []),
          fetchAllPages(API_ENDPOINTS.APPLICATIONS.BASE).catch(() => []),
        ]);

        if (isMounted) {
          setCohorts(Array.isArray(cohortsData) ? cohortsData : []);
          setStudents(Array.isArray(studentsData) ? studentsData : []);
          setApplications(Array.isArray(applicationsData) ? applicationsData : []);
        }
      } catch (err) {
        console.error("Failed to load certificate form data:", err);
        if (isMounted) {
          setError("Failed to load cohorts, students, and applications. Please check your backend connection.");
        }
      } finally {
        if (isMounted) setDataLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Helper to test if an application is completed
  const isAppCompleted = (app) => {
    return (
      app.status?.toUpperCase() === "COMPLETED" ||
      app.completed_course === true
    );
  };

  // Helper to test if a cohort is completed or has completed applications
  const isCohortCompleted = (cohort) => {
    if (cohort.status?.toUpperCase() === "COMPLETED") return true;
    return applications.some((app) => {
      const appCohortId = app.assigned_cohort?.id || app.assigned_cohort || app.cohort?.id || app.cohort;
      return String(appCohortId) === String(cohort.id) && isAppCompleted(app);
    });
  };

  // Filtered cohorts for the dropdown
  const displayCohorts = useMemo(() => {
    if (!onlyCompleted) return cohorts;
    const completed = cohorts.filter(isCohortCompleted);
    // If no cohorts in the database have COMPLETED status yet, fall back to all cohorts so the admin is never blocked
    return completed.length > 0 ? completed : cohorts;
  }, [cohorts, onlyCompleted, applications]);

  // Filtered students based on selected cohort and completion filter
  const availableStudents = useMemo(() => {
    if (!form.cohort) {
      if (onlyCompleted) {
        const completedStudentIds = new Set(
          applications
            .filter(isAppCompleted)
            .map((app) => String(app.student?.id || app.student || app.student_details?.id))
        );
        const filtered = students.filter((s) => completedStudentIds.has(String(s.id)));
        return filtered.length > 0 ? filtered : students;
      }
      return students;
    }

    // Cohort is selected: find all applications belonging to this cohort
    const cohortApps = applications.filter((app) => {
      const appCohortId = app.assigned_cohort?.id || app.assigned_cohort || app.cohort?.id || app.cohort;
      const matchesCohort = String(appCohortId) === String(form.cohort);
      if (!matchesCohort) return false;
      if (onlyCompleted) {
        return isAppCompleted(app);
      }
      return true;
    });

    const validStudentIds = new Set(
      cohortApps.map((app) => String(app.student?.id || app.student || app.student_details?.id))
    );

    return students.filter((s) => validStudentIds.has(String(s.id)));
  }, [students, applications, form.cohort, onlyCompleted]);

  // Filtered applications belonging to selected student and cohort
  const availableApplications = useMemo(() => {
    return applications.filter((app) => {
      const appStudentId = app.student?.id || app.student || app.student_details?.id;
      if (form.student && String(appStudentId) !== String(form.student)) {
        return false;
      }

      const appCohortId = app.assigned_cohort?.id || app.assigned_cohort || app.cohort?.id || app.cohort;
      if (form.cohort && String(appCohortId) !== String(form.cohort)) {
        return false;
      }

      if (onlyCompleted) {
        return isAppCompleted(app);
      }

      return true;
    });
  }, [applications, form.student, form.cohort, onlyCompleted]);

  const handleCohortChange = (event) => {
    const cohortId = event.target.value;
    const selectedCohort = cohorts.find((c) => String(c.id) === String(cohortId));

    setForm((prev) => {
      return {
        ...prev,
        cohort: cohortId,
        student: "",
        application: "",
        title: selectedCohort
          ? selectedCohort.name || selectedCohort.course?.name || prev.title
          : prev.title,
      };
    });
  };

  const handleStudentChange = (event) => {
    const studentId = event.target.value;

    // Find applications for this student in this cohort
    const matchingApps = applications.filter((app) => {
      const appStudentId = app.student?.id || app.student || app.student_details?.id;
      if (String(appStudentId) !== String(studentId)) return false;
      if (form.cohort) {
        const appCohortId = app.assigned_cohort?.id || app.assigned_cohort || app.cohort?.id || app.cohort;
        if (String(appCohortId) !== String(form.cohort)) return false;
      }
      if (onlyCompleted) {
        return isAppCompleted(app);
      }
      return true;
    });

    const singleApp = matchingApps.length === 1 ? matchingApps[0] : null;

    setForm((prev) => {
      return {
        ...prev,
        student: studentId,
        application: singleApp ? singleApp.id : "",
        title: singleApp
          ? singleApp.course_title || singleApp.course_name || singleApp.course?.name || prev.title
          : prev.title,
      };
    });
  };

  const handleApplicationChange = (event) => {
    const appId = event.target.value;
    const selectedApp = applications.find((app) => String(app.id) === String(appId));
    setForm((prev) => {
      const nextStudent = selectedApp
        ? selectedApp.student?.id || selectedApp.student || selectedApp.student_details?.id || prev.student
        : prev.student;
      const nextCohort = selectedApp
        ? selectedApp.assigned_cohort?.id || selectedApp.assigned_cohort || selectedApp.cohort?.id || selectedApp.cohort || prev.cohort
        : prev.cohort;
      return {
        ...prev,
        application: appId,
        student: nextStudent || prev.student,
        cohort: nextCohort || prev.cohort,
        title: prev.title || selectedApp?.course_title || selectedApp?.course_name || selectedApp?.course?.name || "",
      };
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegenerateCodes = () => {
    const newCodes = generateUniqueCodes();
    setForm((prev) => ({
      ...prev,
      certificate_number: newCodes.certificate_number,
      verification_code: newCodes.verification_code,
    }));
  };

  const parseErrorMessage = (err) => {
    const data = err?.response?.data;
    if (!data) return "Unable to create the certificate. Please verify your connection.";
    if (typeof data === "string") return data;
    if (data.detail) return data.detail;
    if (data.message) return data.message;
    if (data.error) return data.error;

    const messages = [];
    for (const [key, val] of Object.entries(data)) {
      const field = key === "non_field_errors" ? "" : `${key}: `;
      const text = Array.isArray(val) ? val.join(" ") : String(val);
      messages.push(`${field}${text}`);
    }
    return messages.join(" | ") || "Unable to create the certificate.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.certificate_number.trim() || !form.verification_code.trim() || !form.student || !form.application || !form.issued_at) {
      setError("Please fill in certificate number, verification code, student, application, and issue date.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        certificate_number: form.certificate_number.trim(),
        verification_code: form.verification_code.trim(),
        student: form.student,
        application: form.application,
        certificate_type: form.certificate_type,
        title: form.title.trim() || undefined,
        issued_at: new Date(form.issued_at).toISOString(),
        status: form.status,
      };

      await apiClient.post(API_ENDPOINTS.CERTIFICATES.BASE, payload);
      setSuccess("Certificate created and issued successfully!");
      setTimeout(() => {
        navigate("/admin/certificates");
      }, 1200);
    } catch (err) {
      console.error("Certificate creation error:", err);
      setError(parseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.header}>
          <div>
            <h1>Add Certificate</h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
              Issue a verified course or internship completion certificate
            </p>
          </div>
          <Link to="/admin/certificates">Back to List</Link>
        </div>

        {error ? (
          <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "8px", color: "#b91c1c", marginBottom: "20px", fontSize: "14px" }}>
            ❌ {error}
          </div>
        ) : null}
        {success ? (
          <div style={{ padding: "12px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", color: "#166534", marginBottom: "20px", fontSize: "14px" }}>
            ✅ {success}
          </div>
        ) : null}

        {dataLoading ? (
          <SkeletonLoader variant="table" rows={4} />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {/* Filter Toggle Banner */}
            <div className={styles.filterRow}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                <input
                  type="checkbox"
                  checked={onlyCompleted}
                  onChange={(e) => setOnlyCompleted(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }}
                />
                <span>Filter by Completed Status Only (Cohorts & Students)</span>
              </label>

              {onlyCompleted ? (
                <span style={{ fontSize: "12px", background: "rgba(34, 197, 94, 0.15)", color: "#16a34a", padding: "4px 10px", borderRadius: "12px", fontWeight: 600 }}>
                  ✓ Showing only completed cohorts & students
                </span>
              ) : (
                <span style={{ fontSize: "12px", background: "rgba(100, 116, 139, 0.15)", color: "var(--text-secondary)", padding: "4px 10px", borderRadius: "12px", fontWeight: 500 }}>
                  Showing all cohorts & students
                </span>
              )}
            </div>

            {/* Select Cohort */}
            <div className={styles.group}>
              <label>Select Cohort *</label>
              <select name="cohort" value={form.cohort} onChange={handleCohortChange}>
                <option value="">
                  {displayCohorts.length > 0 ? `Select a cohort (${displayCohorts.length} available)` : "No cohorts available"}
                </option>
                {displayCohorts.map((cohort) => {
                  const isComp = cohort.status?.toUpperCase() === "COMPLETED";
                  const label = `${cohort.name || cohort.code} (${cohort.status || "ACTIVE"})${isComp ? " - Completed" : ""}`;
                  return (
                    <option key={cohort.id} value={cohort.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Select Student */}
            <div className={styles.group}>
              <label>
                Student * {form.cohort ? `(${availableStudents.length} in cohort)` : `(${availableStudents.length} available)`}
              </label>
              <select name="student" value={form.student} onChange={handleStudentChange} required>
                <option value="">
                  {availableStudents.length > 0
                    ? `Select a student (${availableStudents.length} ${onlyCompleted ? "completed" : "available"})`
                    : form.cohort
                    ? "No completed students in selected cohort"
                    : "Select a student"}
                </option>
                {availableStudents.map((student) => {
                  const studentName = `${student.user?.first_name || ""} ${student.user?.last_name || ""}`.trim() || student.user?.email || student.student_code;
                  return (
                    <option key={student.id} value={student.id}>
                      {studentName} {student.student_code ? `(${student.student_code})` : ""}
                    </option>
                  );
                })}
              </select>
              {form.cohort && availableStudents.length === 0 && (
                <span style={{ fontSize: "12px", color: "#eab308", marginTop: "4px" }}>
                  ⚠️ No completed students in this cohort. Uncheck "Filter by Completed Status" above to view all enrolled students.
                </span>
              )}
            </div>

            {/* Course Application */}
            <div className={styles.group}>
              <label>Course Application *</label>
              <select name="application" value={form.application} onChange={handleApplicationChange} required>
                <option value="">
                  {form.student ? `Select an application (${availableApplications.length} found)` : "Select an application"}
                </option>
                {availableApplications.map((app) => {
                  const courseName = app.course_title || app.course_name || app.course?.name || "Internship Course";
                  const appNum = app.application_number || (typeof app.id === "string" ? app.id.slice(0, 8) : app.id);
                  return (
                    <option key={app.id} value={app.id}>
                      {appNum} - {courseName} ({app.status || "APPLIED"})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Certificate Type */}
            <div className={styles.group}>
              <label>Certificate Type *</label>
              <select name="certificate_type" value={form.certificate_type} onChange={handleChange}>
                <option value="COURSE">Course Completion</option>
                <option value="INTERNSHIP">Internship Completion</option>
                <option value="MERIT">Certificate of Merit</option>
                <option value="PARTICIPATION">Participation</option>
                <option value="VOLUNTEER">Volunteer Appreciation</option>
                <option value="MENTOR">Mentor Appreciation</option>
              </select>
            </div>

            {/* Certificate Number */}
            <div className={styles.group}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ margin: 0 }}>Certificate Number *</label>
                <button
                  type="button"
                  onClick={handleRegenerateCodes}
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "12px", padding: 0, fontWeight: 600, gridColumn: "auto" }}
                >
                  ⚡ Regenerate IDs
                </button>
              </div>
              <input
                type="text"
                name="certificate_number"
                value={form.certificate_number}
                onChange={handleChange}
                placeholder="e.g. CERT-2026-1042"
                required
              />
            </div>

            {/* Verification Code */}
            <div className={styles.group}>
              <label>Verification Code *</label>
              <input
                type="text"
                name="verification_code"
                value={form.verification_code}
                onChange={handleChange}
                placeholder="e.g. VERIFY-9F2A1B"
                required
              />
            </div>

            {/* Issued At */}
            <div className={styles.group}>
              <label>Issued At *</label>
              <input
                type="datetime-local"
                name="issued_at"
                value={form.issued_at}
                onChange={handleChange}
                required
              />
            </div>

            {/* Status */}
            <div className={styles.group}>
              <label>Status *</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="ACTIVE">Active</option>
                <option value="REVOKED">Revoked</option>
              </select>
            </div>

            {/* Certificate Title */}
            <div className={styles.full}>
              <label>Certificate Title (Optional)</label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. VLSI Design & Verification"
              />
            </div>

            <button type="submit" disabled={submitting || dataLoading}>
              {submitting ? "Issuing Certificate..." : "Issue Certificate"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default AddCertificate;