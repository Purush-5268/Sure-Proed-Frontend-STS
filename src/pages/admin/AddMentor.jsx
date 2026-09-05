import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddMentor.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AddMentor() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    gender: "",
    date_of_birth: "",
    password: "",
    domain: "",
    role: "MENTOR",
    is_active: true,
    company_name: "",
    designation: "",
    expertise: "",
    years_of_experience: "",
    linkedin_url: "",
    bio: "",
  });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAllPages(API_ENDPOINTS.COURSES.BASE).then(res => {
      setCourses(res || []);
    }).catch(err => console.error(err));
  }, []);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Please provide the mentor's first name, last name, email, and a password.");
      return;
    }

    if (form.password.length < 8) {
      setError("The password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim() || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        password: form.password,
        role: "MENTOR",
        is_active: form.is_active,

        // Auto-handled by backend mapping to MentorProfile
        course: form.domain || null,
        company_name: form.company_name.trim() || null,
        designation: form.designation.trim() || null,
        expertise: form.expertise.trim() || null,
        years_of_experience: form.years_of_experience ? Number(form.years_of_experience) : null,
        linkedin_url: form.linkedin_url.trim() || null,
        bio: form.bio.trim() || null,
      };

      await apiClient.post(API_ENDPOINTS.USERS.BASE, payload);

      setSuccess("Mentor account created successfully. Share the email and password with the mentor.");
      setTimeout(() => navigate("/admin/mentors"), 2000);
    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Unable to create the mentor account.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add New Mentor</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Register a new mentor and assign their specific training domain.</p>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }} style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Mentors</a>
      </div>

      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        {error ? <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div> : null}
        {success ? <div style={{ color: "#166534", backgroundColor: "var(--bg-nested)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div> : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>First Name *</label>
            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} placeholder="e.g. Jane" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Last Name *</label>
            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} placeholder="e.g. Smith" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Email Address *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="mentor@example.com" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Phone Number</label>
            <input type="tel" name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="+91 9876543210" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="">Select Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Date of Birth</label>
            <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Assigned Course</label>
            <select name="domain" value={form.domain} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="">-- Select Course (Optional) --</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Temporary Password *</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="At least 8 characters" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-color)", margin: "1rem 0" }}></div>

          <div style={{ gridColumn: "1 / -1", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.2rem" }}>Professional Details (Optional)</h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Company Name</label>
            <input type="text" name="company_name" value={form.company_name} onChange={handleChange} placeholder="e.g. Google" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Designation</label>
            <input type="text" name="designation" value={form.designation} onChange={handleChange} placeholder="e.g. Senior Engineer" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Expertise (Skills/Domains)</label>
            <input type="text" name="expertise" value={form.expertise} onChange={handleChange} placeholder="e.g. React, Python" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Years of Experience</label>
            <input type="number" name="years_of_experience" value={form.years_of_experience} onChange={handleChange} placeholder="e.g. 5" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>LinkedIn URL</label>
            <input type="url" name="linkedin_url" value={form.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/..." style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Bio</label>
            <textarea name="bio" value={form.bio} onChange={handleChange} placeholder="Short professional biography..." rows={3} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", gridColumn: "1 / -1", marginTop: "1rem" }}>
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} style={{ width: "18px", height: "18px" }} />
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Account is Active</label>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Saving..." : "Save Mentor"}
            </button>
            <Link to="/admin/mentors" style={{ padding: "12px 24px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddMentor;