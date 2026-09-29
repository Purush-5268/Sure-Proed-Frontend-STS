import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./AddMentor.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiCheck, FiBookOpen, FiInfo, FiLayers, FiX } from "react-icons/fi";

function AddMentor() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mapped_email: "",
    phone_number: "",
    gender: "",
    date_of_birth: "",
    password: "",
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
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [courseSearch, setCourseSearch] = useState("");
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

  const toggleCourse = (courseId) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const selectAllCourses = () => {
    setSelectedCourses(courses.map((c) => c.id));
  };

  const clearAllCourses = () => {
    setSelectedCourses([]);
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
        mapped_email: form.mapped_email ? form.mapped_email.trim() : null,
        phone_number: form.phone_number.trim() || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        password: form.password,
        role: "MENTOR",
        is_active: form.is_active,

        // Optional Multi-Course Qualifications (mentor can teach these courses once assigned to a cohort)
        course_ids: selectedCourses,
        courses: selectedCourses,

        company_name: form.company_name.trim() || null,
        designation: form.designation.trim() || null,
        expertise: form.expertise.trim() || null,
        years_of_experience: form.years_of_experience ? Number(form.years_of_experience) : null,
        linkedin_url: form.linkedin_url.trim() || null,
        bio: form.bio.trim() || null,
      };

      await apiClient.post(API_ENDPOINTS.USERS.BASE, payload);

      setSuccess("Mentor account created successfully. Share the email and password with the mentor.");
      setTimeout(() => navigate("/admin/mentors"), 1800);
    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Unable to create the mentor account.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = courses.filter((c) => {
    if (!courseSearch.trim()) return true;
    const q = courseSearch.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text-primary)", fontSize: "2rem" }}>Add New Mentor</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0" }}>Register a new mentor and configure their qualified teaching courses.</p>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }} style={{ padding: "10px 20px", backgroundColor: "var(--bg-nested)", color: "var(--text-secondary)", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>← Back to Mentors</a>
      </div>

      <div style={{ backgroundColor: "var(--bg-surface)", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        {error ? <div style={{ color: "#b91c1c", backgroundColor: "#fee2e2", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div> : null}
        {success ? <div style={{ color: "#166534", backgroundColor: "rgba(22, 163, 74, 0.1)", border: "1px solid rgba(22, 163, 74, 0.3)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div> : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>First Name *</label>
            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} placeholder="e.g. Jane" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Last Name *</label>
            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} placeholder="e.g. Smith" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Email Address *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="mentor@example.com" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Mapped Email</label>
            <input type="email" name="mapped_email" value={form.mapped_email} onChange={handleChange} placeholder="e.g. personal@gmail.com" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Phone Number</label>
            <input type="tel" name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="Phone Number" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}>
              <option value="">Select Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Date of Birth</label>
            <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>


          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Assigned Course</label>
            <select name="domain" value={form.domain} onChange={handleChange} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
              <option value="">-- Select Course --</option>
              {courses.slice().sort((a, b) => (a.name || a.title || a.code || "").localeCompare(b.name || b.title || b.code || "")).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Temporary Password *</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="At least 8 characters" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          {/* Qualified Courses Section - Allows 1 or more courses, or leave optional (unassigned) */}
          <div
            style={{
              gridColumn: "1 / -1",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid var(--primary-color)",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.08)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, width: "4px", height: "100%", backgroundColor: "var(--primary-color)" }}></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <FiBookOpen style={{ color: "var(--primary-color)", fontSize: "18px" }} />
                  <label style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "15px" }}>
                    Qualified Courses to Teach ({selectedCourses.length} Selected)
                  </label>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", background: "rgba(100, 116, 139, 0.12)", padding: "2px 8px", borderRadius: "4px" }}>
                    Optional
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                  You can select more than 1 course. The mentor will be qualified to teach these courses when assigned to their cohorts. If no course is selected, the mentor will remain unassigned.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={selectAllCourses}
                  style={{
                    background: "none",
                    border: "1px solid var(--border-color)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--primary-color)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <FiCheck style={{ marginRight: '4px' }} /> Select All
                </button>
                <button
                  type="button"
                  onClick={clearAllCourses}
                  style={{
                    background: "none",
                    border: "1px solid var(--border-color)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {/* Search Courses */}
            {courses.length > 6 && (
              <div style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  placeholder="Filter courses by name or code..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: "340px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    fontSize: "12.5px",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            )}

            {/* Course Checkbox Pills Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "10px",
                maxHeight: "240px",
                overflowY: "auto",
                padding: "2px",
              }}
            >
              {filteredCourses.map((c) => {
                const isSelected = selectedCourses.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleCourse(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #2563eb" : "1px solid var(--border-color)",
                      backgroundColor: isSelected ? "rgba(37, 99, 235, 0.08)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      userSelect: "none",
                    }}
                  >
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "4px",
                        border: isSelected ? "2px solid #2563eb" : "1.5px solid var(--border-color)",
                        backgroundColor: isSelected ? "#2563eb" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && <FiCheck style={{ color: "#ffffff", fontSize: "12px" }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      {c.code && (
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          {c.code}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {courses.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "16px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                  Loading courses...
                </div>
              )}
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-color)", margin: "0.5rem 0" }}></div>

          <div style={{ gridColumn: "1 / -1", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.2rem" }}>Professional Details (Optional)</h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Company Name</label>
            <input type="text" name="company_name" value={form.company_name} onChange={handleChange} placeholder="e.g. Google" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Designation</label>
            <input type="text" name="designation" value={form.designation} onChange={handleChange} placeholder="e.g. Senior Engineer" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Expertise (Skills/Domains)</label>
            <input type="text" name="expertise" value={form.expertise} onChange={handleChange} placeholder="e.g. React, Python" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Years of Experience</label>
            <input type="number" name="years_of_experience" value={form.years_of_experience} onChange={handleChange} placeholder="e.g. 5" style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>LinkedIn URL</label>
            <input type="url" name="linkedin_url" value={form.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/..." style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1" }}>
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px" }}>Bio</label>
            <textarea name="bio" value={form.bio} onChange={handleChange} placeholder="Short professional biography..." rows={3} style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", gridColumn: "1 / -1", marginTop: "1rem" }}>
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} style={{ width: "18px", height: "18px" }} />
            <label style={{ fontWeight: "bold", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Account is Active</label>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
            <button type="submit" disabled={loading} style={{ padding: "12px 24px", backgroundColor: "var(--primary-color)", color: "white", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" }}>
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