import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
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
    lst_batch: "",
  });

  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const fetchAll = async (url) => {
          let results = [];
          let currentUrl = url;
          while (currentUrl) {
            const res = await apiClient.get(currentUrl);
            if (res.data && res.data.results) {
              results = [...results, ...res.data.results];
              currentUrl = res.data.next ? res.data.next.replace(apiClient.defaults.baseURL, '') : null;
            } else if (Array.isArray(res.data)) {
              results = [...results, ...res.data];
              currentUrl = null;
            } else {
              break;
            }
          }
          return results;
        };

        const [coursesData, userResponse] = await Promise.all([
          fetchAll(API_ENDPOINTS.COURSES.BASE),
          apiClient.get(API_ENDPOINTS.USERS.ME),
        ]);
        
        setCourses(coursesData);
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

    if (!form.code.trim() || !form.course || !form.start_date || !form.end_date) {
      setError("Please provide the cohort code, course, and both dates.");
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
        name: form.name.trim() || undefined,
        course: form.course,
        start_date: form.start_date,
        end_date: form.end_date,
        max_students: Number(form.max_students) || 30,
        status: form.status,
        meeting_link: form.meeting_link.trim() || null,
        lst_batch: form.lst_batch || null,
        created_by: currentUser.id,
      };

      await apiClient.post(API_ENDPOINTS.COHORTS.BASE, payload);
      setSuccess("Cohort created successfully.");
      setTimeout(() => navigate("/admin/cohorts"), 1000);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to create the cohort right now. Check backend validation.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Add New Batch / Cohort</h1>
          <p className="text-secondary">Create a new training group and assign it to a Domain.</p>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }}  className={styles.backBtn}>← Back to Batches</a>
      </div>

      <div className={styles.card}>
        {error && <div className={styles.errorAlert}>{error}</div>}
        {success && <div className={styles.successAlert}>{success}</div>}

        {loadingCourses ? (
          <SkeletonLoader variant="form" rows={1} />
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.group}>
              <label>Group / Cohort Code *</label>
              <input type="text" name="code" value={form.code} onChange={handleChange} placeholder="e.g. G15" required />
            </div>

            <div className={styles.group}>
              <label>Group / Cohort Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter batch name (Optional)" />
            </div>

            <div className={styles.group}>
              <label>Assign Course / Domain *</label>
              <select name="course" value={form.course} onChange={handleChange} required>
                <option value="">-- Select a Domain --</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name || course.title || course.code}</option>
                ))}
              </select>
            </div>

            <div className={styles.group}>
              <label>Maximum Students *</label>
              <input type="number" name="max_students" value={form.max_students} onChange={handleChange} min="1" required />
            </div>

            <div className={styles.group}>
              <label>Start Date *</label>
              <input type="date" name="start_date" value={form.start_date} onChange={handleChange} required />
            </div>

            <div className={styles.group}>
              <label>End Date *</label>
              <input type="date" name="end_date" value={form.end_date} onChange={handleChange} required />
            </div>

            <div className={styles.group}>
              <label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open for Applications</option>
                <option value="ACTIVE">Active (In Progress)</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div className={styles.group}>
              <label>LST Batch Assignment (Optional)</label>
              <select name="lst_batch" value={form.lst_batch} onChange={handleChange}>
                <option value="">-- No LST Batch --</option>
                <option value="BATCH_1">Batch 1</option>
                <option value="BATCH_2">Batch 2</option>
              </select>
            </div>

            <div className={styles.full}>
              <div className={styles.group}>
                <label>Temporary Meeting Link (Optional)</label>
                <input type="url" name="meeting_link" value={form.meeting_link} onChange={handleChange} placeholder="https://meet.google.com/..." />
              </div>
            </div>

            <div className={styles.full} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="submit" disabled={loading} className={styles.submitBtn}>
                  {loading ? "Creating..." : "Create Batch"}
                </button>
                <Link to="/admin/cohorts" className={styles.cancelBtn}>Cancel</Link>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default AddCohort;