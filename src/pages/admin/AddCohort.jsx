import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddCohort.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AddCohort() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    course: "",
    start_date: "",
    end_date: "",
    max_students: 30,
    status: "DRAFT",
    meeting_link: "",
    batch_type: "",
  });
  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [coursesResponse, userResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COURSES.BASE),
          apiClient.get(API_ENDPOINTS.USERS.ME),
        ]);
        setCourses(normalizeListResponse(coursesResponse.data));
        setCurrentUser(userResponse.data);
      } catch (err) {
        console.error("Failed to load cohort form data:", err);
      } finally {
        setLoadingCourses(false);
      }
    };

    loadData();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.code.trim() || !form.name.trim() || !form.course || !form.start_date || !form.end_date) {
      setError("Please provide the cohort code, name, course, and both dates.");
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
        course: form.course,
        start_date: form.start_date,
        end_date: form.end_date,
        max_students: Number(form.max_students) || 30,
        status: form.status,
        meeting_link: form.meeting_link.trim() || null,
        batch_type: form.batch_type || null,
        created_by: currentUser.id,
      };

      await apiClient.post(API_ENDPOINTS.COHORTS.BASE, payload);
      setSuccess("Cohort created successfully.");
      navigate("/admin/cohorts");
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to create the cohort right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add New Batch / Cohort</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Create a new training group and assign it to a Domain.</p>
        </div>
        <Link to="/admin/cohorts" style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Batches</Link>
      </div>

      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        {error ? <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div> : null}
        {success ? <div style={{ color: "#166534", backgroundColor: "var(--bg-nested)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div> : null}

        {loadingCourses ? (
          <SkeletonLoader variant="form" rows={1} />
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Group / Cohort Code *</label>
              <input type="text" name="code" value={form.code} onChange={handleChange} placeholder="e.g. G15" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Group / Cohort Name *</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter batch name" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Assign Course / Domain *</label>
              <select name="course" value={form.course} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
                <option value="">-- Select a Domain --</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Maximum Students *</label>
              <input type="number" name="max_students" value={form.max_students} onChange={handleChange} min="1" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Start Date *</label>
              <input type="date" name="start_date" value={form.start_date} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>End Date *</label>
              <input type="date" name="end_date" value={form.end_date} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Status</label>
              <select name="status" value={form.status} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open for Applications</option>
                <option value="ACTIVE">Active (In Progress)</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>LST Batch Assignment (Optional)</label>
              <select name="batch_type" value={form.batch_type} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
                <option value="">-- No LST Batch --</option>
                <option value="BATCH_1">Batch 1</option>
                <option value="BATCH_2">Batch 2</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
              <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Temporary Meeting Link (Optional)</label>
              <input type="url" name="meeting_link" value={form.meeting_link} onChange={handleChange} placeholder="https://meet.google.com/..." style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem" }}>
              <button type="submit" disabled={loading} style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Creating..." : "Create Batch"}
              </button>
              <Link to="/admin/cohorts" style={{ padding: "12px 24px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default AddCohort;