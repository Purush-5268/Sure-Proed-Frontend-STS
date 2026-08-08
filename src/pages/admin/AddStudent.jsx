import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddStudent.module.css";

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
    role: "STUDENT",
  });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch courses for the Domain dropdown
  useState(() => {
    apiClient.get(API_ENDPOINTS.COURSES.BASE).then(res => {
      setCourses(res.data?.results || res.data || []);
    }).catch(err => console.error("Failed to load courses", err));
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Please provide the student's first name, last name, email, and password.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      await apiClient.post(API_ENDPOINTS.USERS.BASE, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim() || null,
        password: form.password,
        domain: form.domain.trim() || null,
        course_batch: form.course_batch.trim() || null,
        role: "STUDENT",
      });

      setSuccess("Student account created successfully.");
      navigate("/admin/students");
    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Unable to create the student account.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add New Student</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Register a new student and assign their domain and batch.</p>
        </div>
        <Link to="/admin/students" style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Students</Link>
      </div>

      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        {error ? <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div> : null}
        {success ? <div style={{ color: "#166534", backgroundColor: "var(--bg-nested)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div> : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>First Name *</label>
            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} placeholder="e.g. John" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Last Name *</label>
            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} placeholder="e.g. Doe" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Email Address *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="student@example.com" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Phone Number</label>
            <input type="text" name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="+91 9876543210" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Assign Domain</label>
            <select name="domain" value={form.domain} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="">-- Select Domain (Optional) --</option>
              {courses.map(c => <option key={c.id} value={c.name || c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Group / Batch Number</label>
            <input type="text" name="course_batch" value={form.course_batch} onChange={handleChange} placeholder="e.g. G15" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", textTransform: "uppercase" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Temporary Password *</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="At least 8 characters" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Saving..." : "Save Student"}
            </button>
            <Link to="/admin/students" style={{ padding: "12px 24px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddStudent;