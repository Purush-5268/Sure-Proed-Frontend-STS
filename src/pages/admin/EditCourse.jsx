import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./EditCourse.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditCourse() {
  const navigate = useNavigate();
  const { id } = useParams();
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
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.COURSES.BY_ID(id));
        const course = response.data || {};
        setForm({
          code: course.code || "",
          name: course.name || "",
          domain: course.domain || "",
          subject: course.subject || "",
          description: course.description || "",
          prerequisites: course.prerequisites || "",
          duration_weeks: course.duration_weeks || 4,
          difficulty: course.difficulty || "BEGINNER",
          status: course.status || "DRAFT",
        });
      } catch (err) {
        console.error("Failed to load course:", err);
        setError("Unable to load course data.");
      } finally {
        setLoadingData(false);
      }
    };

    if (id) {
      loadCourse();
    }
  }, [id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        domain: form.domain.trim(),
        subject: form.subject.trim(),
        description: form.description.trim(),
        prerequisites: form.prerequisites.trim(),
        duration_weeks: Number(form.duration_weeks) || 4,
        difficulty: form.difficulty,
        status: form.status,
      };

      await apiClient.patch(API_ENDPOINTS.COURSES.BY_ID(id), payload);
      navigate("/admin/courses");
    } catch (err) {
      const message = err?.response?.data?.detail || "Unable to update the course.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Edit Course</h1>
        <p className={styles.subtitle}>Update the course information.</p>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

        {loadingData ? (
          <SkeletonLoader variant="form" rows={5} />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.group}>
              <label>Course Code</label>
              <input type="text" name="code" value={form.code} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Course Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Domain</label>
              <input type="text" name="domain" value={form.domain} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Subject</label>
              <input type="text" name="subject" value={form.subject} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Duration Weeks</label>
              <input type="number" name="duration_weeks" value={form.duration_weeks} onChange={handleChange} min="1" />
            </div>

            <div className={styles.group}>
              <label>Difficulty</label>
              <select name="difficulty" value={form.difficulty} onChange={handleChange}>
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </div>

            <div className={styles.group}>
              <label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <div className={styles.groupFull}>
              <label>Prerequisites</label>
              <textarea rows="3" name="prerequisites" value={form.prerequisites} onChange={handleChange} />
            </div>

            <div className={styles.groupFull}>
              <label>Description</label>
              <textarea rows="5" name="description" value={form.description} onChange={handleChange} />
            </div>

            <div className={styles.buttons}>
              <button type="submit" className={styles.updateBtn} disabled={loading}>{loading ? "Updating..." : "Update Course"}</button>
              <Link to="/admin/courses" className={styles.cancelBtn}>Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditCourse;