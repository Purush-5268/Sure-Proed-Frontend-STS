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
    student: "",
    application: "",
    certificate_type: "COURSE",
    title: "",
    issued_at: new Date().toISOString().slice(0, 16),
    status: "ACTIVE",
  });

  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setDataLoading(true);
      try {
        const [studentsData, applicationsData] = await Promise.all([
          fetchAllPages(API_ENDPOINTS.STUDENTS.BASE).catch(() => []),
          fetchAllPages(API_ENDPOINTS.APPLICATIONS.BASE).catch(() => []),
        ]);

        if (isMounted) {
          setStudents(Array.isArray(studentsData) ? studentsData : []);
          setApplications(Array.isArray(applicationsData) ? applicationsData : []);
        }
      } catch (err) {
        console.error("Failed to load certificate form data:", err);
        if (isMounted) {
          setError("Failed to load students and applications. Please check your backend connection.");
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

  // Filter applications belonging to the selected student
  const availableApplications = useMemo(() => {
    if (!form.student) return applications;
    return applications.filter((app) => {
      const appStudentId = app.student?.id || app.student || app.student_details?.id;
      return String(appStudentId) === String(form.student);
    });
  }, [applications, form.student]);

  const handleStudentChange = (event) => {
    const studentId = event.target.value;
    setForm((prev) => {
      // Check if current application still belongs to this newly selected student
      const appMatches = applications.find(
        (app) =>
          String(app.id) === String(prev.application) &&
          String(app.student?.id || app.student || app.student_details?.id) === String(studentId)
      );
      return {
        ...prev,
        student: studentId,
        application: appMatches ? prev.application : "",
      };
    });
  };

  const handleApplicationChange = (event) => {
    const appId = event.target.value;
    const selectedApp = applications.find((app) => String(app.id) === String(appId));
    setForm((prev) => {
      const nextStudent = selectedApp ? (selectedApp.student?.id || selectedApp.student || selectedApp.student_details?.id || prev.student) : prev.student;
      return {
        ...prev,
        application: appId,
        student: nextStudent || prev.student,
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
            <div className={styles.group}>
              <label>Student *</label>
              <select name="student" value={form.student} onChange={handleStudentChange} required>
                <option value="">Select a student ({students.length} available)</option>
                {students.map((student) => {
                  const studentName = `${student.user?.first_name || ""} ${student.user?.last_name || ""}`.trim() || student.user?.email || student.student_code;
                  return (
                    <option key={student.id} value={student.id}>
                      {studentName} {student.student_code ? `(${student.student_code})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

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

            <div className={styles.group}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ margin: 0 }}>Certificate Number *</label>
                <button
                  type="button"
                  onClick={handleRegenerateCodes}
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "12px", padding: 0, fontWeight: 600 }}
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

            <div className={styles.group}>
              <label>Certificate Title (Optional)</label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. VLSI Design & Verification"
              />
            </div>

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

            <div className={styles.group}>
              <label>Status *</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="ACTIVE">Active</option>
                <option value="REVOKED">Revoked</option>
              </select>
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