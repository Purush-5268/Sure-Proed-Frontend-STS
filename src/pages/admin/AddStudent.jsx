import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";

function AddStudent() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    password: "",
    domain: "",
    course_batch: "",
    is_active: true,
  });

  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [coursesRes, cohortsRes] = await Promise.all([
          courseService.getCourses(),
          cohortService.getCohorts(),
        ]);
        setCourses(normalizeListResponse(coursesRes));
        setCohorts(normalizeListResponse(cohortsRes));
      } catch (err) {
        console.error("Failed to load dropdown data", err);
      }
    }
    loadData();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const newForm = { ...prev, [name]: type === "checkbox" ? checked : value };
      // If domain changes, reset cohort
      if (name === "domain") {
        newForm.course_batch = "";
      }
      return newForm;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Please provide first name, last name, email, and a temporary password.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create User
      const userPayload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim() || null,
        password: form.password,
        role: "STUDENT",
        is_active: form.is_active,
      };

      const userRes = await apiClient.post(API_ENDPOINTS.USERS.BASE, userPayload);
      const newUserId = userRes.data.id || userRes.data.user?.id;

      // 2. Update Student Profile if Domain or Cohort is selected
      if (form.domain || form.course_batch) {
        // Backend creates StudentProfile via signal. We need to find its ID to PATCH it.
        const studentsRes = await apiClient.get(API_ENDPOINTS.STUDENTS.BASE);
        const studentsList = normalizeListResponse(studentsRes.data?.results || studentsRes.data);
        const studentProfile = studentsList.find(s => s.user?.id === newUserId || s.user === newUserId);

        if (studentProfile) {
          await apiClient.patch(API_ENDPOINTS.STUDENTS.BY_ID(studentProfile.id), {
            domain: form.domain || null,
            course_batch: form.course_batch || null
          });
        } else {
          console.warn("Created student profile not found in recent list. Domain/Cohort not assigned.");
        }
      }

      setSuccess("Student created successfully. Ensure you securely share their temporary password.");
      setTimeout(() => navigate("/admin/students"), 2500);

    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Failed to create the student account.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="premium-page-container">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-title">Add New Student</h1>
          <p className="premium-subtitle">Create a student account and assign them to a domain and cohort.</p>
        </div>
        <Link to="/admin/students" className="premium-btn" style={{ background: "var(--bg-nested)", color: "var(--text-secondary)" }}>
          <FiArrowLeft /> Back to Students
        </Link>
      </div>

      <div className="premium-card">
        {error && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>
            <FiAlertCircle size={20} /> {error}
          </div>
        )}
        {success && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#166534", backgroundColor: "#ecfdf5", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>
            <FiCheckCircle size={20} /> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="premium-grid-2">
          {/* User Fields */}
          <div className="premium-form-group">
            <label className="premium-label">First Name *</label>
            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} placeholder="e.g. John" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Last Name *</label>
            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} placeholder="e.g. Doe" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Email Address *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="student@example.com" className="premium-input" />
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Phone Number</label>
            <input type="tel" name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="+91 9876543210" className="premium-input" />
          </div>

          {/* Profile Fields */}
          <div className="premium-form-group">
            <label className="premium-label">Domain (Optional)</label>
            <select name="domain" value={form.domain} onChange={handleChange} className="premium-input">
              <option value="">-- Select Domain --</option>
              {courses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <div className="premium-form-group">
            <label className="premium-label">Cohort / Batch (Optional)</label>
            <select 
              name="course_batch" 
              value={form.course_batch} 
              onChange={handleChange} 
              disabled={!form.domain}
              className="premium-input"
              style={{ backgroundColor: !form.domain ? "var(--bg-nested)" : "var(--bg-surface)" }}
            >
              <option value="">-- Select Batch --</option>
              {cohorts.filter(c => {
                 const courseMatched = courses.find(course => course.name === form.domain);
                 if (!courseMatched) return false;
                 return c.course?.id === courseMatched.id || c.course === courseMatched.id || c.course?.name === form.domain;
              }).map(coh => (
                <option key={coh.id} value={coh.name}>{coh.name}</option>
              ))}
            </select>
          </div>

          <div className="premium-form-group" style={{ gridColumn: "1 / -1", maxWidth: "50%" }}>
            <label className="premium-label">Temporary Password *</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="At least 8 characters" className="premium-input" />
          </div>

          <div className="premium-form-group" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", marginTop: "0.5rem" }}>
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} style={{ width: "18px", height: "18px", cursor: "pointer" }} />
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }} onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}>
              Account is Active
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} className="premium-btn premium-btn-primary" style={{ cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Creating Student..." : "Create Student"}
            </button>
            <Link to="/admin/students" className="premium-btn" style={{ background: "var(--bg-nested)", color: "var(--text-secondary)" }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddStudent;