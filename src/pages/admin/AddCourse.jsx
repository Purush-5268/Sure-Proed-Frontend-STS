import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddCourse.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AddCourse() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    code: "",
    name: "",
    domain: "",
    subject: "",
    description: "",
    prerequisites: "",
    duration_weeks: 4,
    difficulty: "BEGINNER",
    status: "DRAFT",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.USERS.ME);
        setCurrentUser(response.data);
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    };

    loadCurrentUser();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.code.trim() || !form.name.trim() || !form.domain.trim() || !form.description.trim()) {
      setError("Please provide the course code, name, domain, and description.");
      return;
    }

    if (!currentUser?.id) {
      setError("Your current user profile could not be loaded. Please refresh and try again.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        domain: form.domain.trim(),
        subject: form.subject.trim() || null,
        description: form.description.trim(),
        prerequisites: form.prerequisites.trim() || null,
        duration_weeks: Number(form.duration_weeks) || 4,
        difficulty: form.difficulty,
        status: form.status,
        created_by: currentUser.id,
      };

      await apiClient.post(API_ENDPOINTS.COURSES.BASE, payload);
      setSuccess("Course created successfully.");
      navigate("/admin/courses");
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to create the course right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add New Course</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Create a new training domain or course module.</p>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }}  style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Courses</a>
      </div>

      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        {error ? <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div> : null}
        {success ? <div style={{ color: "#166534", backgroundColor: "var(--bg-nested)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div> : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Course Code *</label>
            <input type="text" name="code" value={form.code} onChange={handleChange} placeholder="e.g. JAVA-01" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Course Name *</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter course name" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Domain *</label>
            <input type="text" name="domain" value={form.domain} onChange={handleChange} placeholder="e.g. Software Development" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Subject</label>
            <input type="text" name="subject" value={form.subject} onChange={handleChange} placeholder="Optional subject" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Duration (Weeks) *</label>
            <input type="number" name="duration_weeks" value={form.duration_weeks} onChange={handleChange} min="1" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Difficulty</label>
            <select name="difficulty" value={form.difficulty} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Description *</label>
            <textarea name="description" rows="4" value={form.description} onChange={handleChange} placeholder="Enter course description" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Prerequisites</label>
            <textarea name="prerequisites" rows="2" value={form.prerequisites} onChange={handleChange} placeholder="Optional prerequisites" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical" }} />
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Saving..." : "Save Course"}
            </button>
            <Link to="/admin/courses" style={{ padding: "12px 24px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddCourse;