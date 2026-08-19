import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./EditCohort.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditCohort() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    course: "",
    start_date: "",
    end_date: "",
    max_students: "",
    status: "",
    meeting_link: "",
    lst_batch: "",
  });
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [cohortResponse, coursesResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id)),
          apiClient.get(API_ENDPOINTS.COURSES.BASE),
        ]);

        const data = cohortResponse.data || {};
        setCourses(normalizeListResponse(coursesResponse.data));
        setForm({
          code: data.code || "",
          name: data.name || "",
          course: data.course?.id || data.course || "",
          start_date: data.start_date || "",
          end_date: data.end_date || "",
          max_students: data.max_students || "",
          status: data.status || "DRAFT",
          meeting_link: data.meeting_link || "",
          lst_batch: data.lst_batch || "",
        });
      } catch (err) {
        console.error("Failed to load cohort data:", err);
        setError("Unable to load cohort details.");
      } finally {
        setLoadingData(false);
      }
    };

    if (id) {
      loadData();
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
        course: form.course,
        start_date: form.start_date,
        end_date: form.end_date,
        max_students: Number(form.max_students) || 30,
        status: form.status,
        meeting_link: form.meeting_link.trim() || null,
        lst_batch: form.lst_batch || null,
      };

      await apiClient.patch(API_ENDPOINTS.COHORTS.BY_ID(id), payload);
      navigate("/admin/cohorts");
    } catch (err) {
      const message = err?.response?.data?.detail || "Unable to update the cohort.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.header}>
          <h1>Edit Cohort</h1>
          <Link to="/admin/cohorts">Back</Link>
        </div>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

        {loadingData ? (
          <SkeletonLoader variant="form" rows={4} />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.group}>
              <label>Cohort Code</label>
              <input type="text" name="code" value={form.code} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Cohort Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Course</label>
              <select name="course" value={form.course} onChange={handleChange}>
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.group}>
              <label>Start Date</label>
              <input type="date" name="start_date" value={form.start_date} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>End Date</label>
              <input type="date" name="end_date" value={form.end_date} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Maximum Students</label>
              <input type="number" name="max_students" value={form.max_students} onChange={handleChange} min="1" />
            </div>

            <div className={styles.group}>
              <label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
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

            <div className={styles.group}>
              <label>Meeting Link</label>
              <input type="url" name="meeting_link" value={form.meeting_link} onChange={handleChange} placeholder="Optional meeting link" />
            </div>

            <button type="submit" disabled={loading}>{loading ? "Updating..." : "Update Cohort"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditCohort;