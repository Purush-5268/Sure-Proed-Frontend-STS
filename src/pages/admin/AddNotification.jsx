import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { courseService } from "../../services/courseService";
import { cohortService } from "../../services/cohortService";
import { normalizeListResponse } from "../../services/apiClient";
import SkeletonLoader from "../../components/common/SkeletonLoader";
// Assuming you have a notificationService, if not you can replace with apiClient logic
import styles from "./AddNotification.module.css";

function AddNotification() {
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [form, setForm] = useState({
    title: "",
    audience: "All Users",
    publishDate: "",
    status: "Published",
    message: ""
  });

  useEffect(() => {
    async function loadAudiences() {
      try {
        const [courseRes, cohortRes] = await Promise.all([
          courseService.getCourses(),
          cohortService.getCohorts()
        ]);
        setCourses(normalizeListResponse(courseRes));
        setCohorts(normalizeListResponse(cohortRes));
      } catch (err) {
        console.error("Failed to load domains and batches", err);
      }
    }
    loadAudiences();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    alert(`Notification created for ${form.audience}`);
    // Add real API call here later
  };

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add Notification</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Broadcast announcements to specific domains, batches, or everyone.</p>
        </div>
        <Link to="/admin/notifications" style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Notifications</Link>
      </div>

      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Notification Title *</label>
            <input type="text" name="title" value={form.title} onChange={handleChange} required placeholder="Enter notification title" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Target Audience</label>
            <select name="audience" value={form.audience} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <optgroup label="Global">
                <option value="All Users">All Users</option>
                <option value="All Students">All Students</option>
                <option value="All Mentors">All Mentors</option>
                <option value="All Companies">All Companies</option>
              </optgroup>
              <optgroup label="Domains / Courses">
                {courses.map(c => <option key={`course-${c.id}`} value={`Course: ${c.id}`}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Specific Batches">
                {cohorts.map(c => <option key={`cohort-${c.id}`} value={`Cohort: ${c.id}`}>{c.name}</option>)}
              </optgroup>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Publish Date</label>
            <input type="date" name="publishDate" value={form.publishDate} onChange={handleChange} required style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="Published">Published (Send Now)</option>
              <option value="Draft">Draft (Save for Later)</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Message *</label>
            <textarea name="message" rows="6" value={form.message} onChange={handleChange} required placeholder="Enter notification message" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical" }}></textarea>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem" }}>
            <button type="submit" style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer" }}>
              Save Notification
            </button>
            <Link to="/admin/notifications" style={{ padding: "12px 24px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddNotification;