import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddCertificate.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AddCertificate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    certificate_number: "",
    verification_code: "",
    student: "",
    application: "",
    certificate_type: "COURSE",
    issued_at: "",
    status: "ACTIVE",
  });
  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [studentsResponse, applicationsResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.STUDENTS.BASE),
          apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE),
        ]);

        if (isMounted) {
          setStudents(Array.isArray(studentsResponse.data) ? studentsResponse.data : []);
          setApplications(Array.isArray(applicationsResponse.data) ? applicationsResponse.data : []);
        }
      } catch (err) {
        console.error("Failed to load certificate form data:", err);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.certificate_number.trim() || !form.verification_code.trim() || !form.student || !form.application || !form.issued_at) {
      setError("Please fill in the certificate number, verification code, student, application, and issue date.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        certificate_number: form.certificate_number.trim(),
        verification_code: form.verification_code.trim(),
        student: form.student,
        application: form.application,
        certificate_type: form.certificate_type,
        issued_at: new Date(form.issued_at).toISOString(),
        status: form.status,
      };

      await apiClient.post(API_ENDPOINTS.CERTIFICATES.BASE, payload);
      setSuccess("Certificate created successfully.");
      navigate("/admin/certificates");
    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.message || err?.response?.data?.non_field_errors?.[0] || "Unable to create the certificate.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.header}>
          <h1>Add Certificate</h1>
          <Link to="/admin/certificates">Back</Link>
        </div>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {success ? <p style={{ color: "#166534" }}>{success}</p> : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.group}>
            <label>Student</label>
            <select name="student" value={form.student} onChange={handleChange} required>
              <option value="">Select a student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {`${student.user?.first_name || ""} ${student.user?.last_name || ""}`.trim() || student.user?.email || student.student_code}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.group}>
            <label>Application</label>
            <select name="application" value={form.application} onChange={handleChange} required>
              <option value="">Select an application</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.application_number || application.id} - {application.course?.name || application.course || "Unknown course"}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.group}>
            <label>Certificate Number</label>
            <input type="text" name="certificate_number" value={form.certificate_number} onChange={handleChange} placeholder="CERT-2026-001" required />
          </div>

          <div className={styles.group}>
            <label>Verification Code</label>
            <input type="text" name="verification_code" value={form.verification_code} onChange={handleChange} placeholder="VERIFY-001" required />
          </div>

          <div className={styles.group}>
            <label>Certificate Type</label>
            <select name="certificate_type" value={form.certificate_type} onChange={handleChange}>
              <option value="COURSE">Course</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="PARTICIPATION">Participation</option>
            </select>
          </div>

          <div className={styles.group}>
            <label>Issued At</label>
            <input type="datetime-local" name="issued_at" value={form.issued_at} onChange={handleChange} required />
          </div>

          <div className={styles.group}>
            <label>Status</label>
            <select name="status" value={form.status} onChange={handleChange}>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Certificate"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddCertificate;