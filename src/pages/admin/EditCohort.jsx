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
    status: "DRAFT",
    start_date: "",
    end_date: "",
    application_end_date: "",
    max_students: 30,
    whatsapp_group_link: "",
    lst_batch: "",
    rules_and_regulations: "",
    meeting_link: "",
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

        const [cohortResponse, coursesData] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id)),
          fetchAll(API_ENDPOINTS.COURSES.BASE),
        ]);

        const data = cohortResponse.data || {};
        setCourses(coursesData);
        setForm({
          code: data.code || "",
          name: data.name || "",
          course: data.course?.id || data.course || "",
          status: data.status || "DRAFT",
          start_date: data.start_date || "",
          end_date: data.end_date || "",
          application_end_date: data.application_end_date 
            ? (() => {
                const d = new Date(data.application_end_date);
                return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
              })() 
            : "",
          max_students: data.max_students || 30,
          whatsapp_group_link: data.whatsapp_group_link || "",
          lst_batch: data.lst_batch || "",
          rules_and_regulations: data.rules_and_regulations || "",
          meeting_link: data.meeting_link || "",
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
    setSuccess("");
    setLoading(true);

    try {
      let appEndDate = form.application_end_date;
      if (appEndDate) {
        const dateObj = new Date(appEndDate);
        appEndDate = dateObj.toISOString();
      } else {
        appEndDate = null;
      }

      const payload = {
        code: form.code.trim(),
        name: form.name.trim() || undefined,
        course: form.course,
        start_date: form.start_date,
        end_date: form.end_date,
        application_end_date: appEndDate,
        max_students: Number(form.max_students) || 30,
        status: form.status,
        whatsapp_group_link: form.whatsapp_group_link ? form.whatsapp_group_link.trim() : null,
        meeting_link: form.meeting_link ? form.meeting_link.trim() : null,
        rules_and_regulations: form.rules_and_regulations ? form.rules_and_regulations.trim() : null,
        lst_batch: form.lst_batch || null,
      };

      await apiClient.patch(API_ENDPOINTS.COHORTS.BY_ID(id), payload);
      setSuccess("Cohort updated successfully.");
      setTimeout(() => navigate("/admin/cohorts"), 1000);
    } catch (err) {
      if (err?.response?.data && typeof err.response.data === 'object' && !err.response.data.detail) {
        const errors = Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(" | ");
        setError(errors || "Unable to update the cohort. Check backend validation.");
      } else {
        const message = err?.response?.data?.detail || "Unable to update the cohort.";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Edit Cohort</h1>
          <p className="text-secondary">Update the training group's settings.</p>
        </div>
        <Link to="/admin/cohorts" className={styles.backBtn}>← Back to Batches</Link>
      </div>

      <div className={styles.card}>
        {error && <div className={styles.errorAlert}>{error}</div>}
        {success && <div className={styles.successAlert}>{success}</div>}

        {loadingData ? (
          <SkeletonLoader variant="form" rows={4} />
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* SECTION 1: Basic Information */}
            <h3 className={styles.sectionTitle}>1. Basic Information</h3>
            <div className={styles.formGrid}>
              <div className={styles.group}>
                <label>Cohort Code *</label>
                <input type="text" name="code" value={form.code} onChange={handleChange} placeholder="e.g. G18" required />
              </div>

              <div className={styles.group}>
                <label>Cohort Name (Optional)</label>
                <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter cohort name" />
              </div>

              <div className={styles.group}>
                <label>Assign Course / Domain *</label>
                <select name="course" value={form.course} onChange={handleChange} required>
                  <option value="">-- Select a Domain --</option>
                  {courses.slice().sort((a,b) => (a.name || a.title || a.code || "").localeCompare(b.name || b.title || b.code || "")).map((course) => (
                    <option key={course.id} value={course.id}>{course.name || course.title || course.code}</option>
                  ))}
                </select>
              </div>

              <div className={styles.group}>
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">Open</option>
                  <option value="ACTIVE">Active</option>
                  <option value="TRAINING">Training</option>
                  <option value="INTERNSHIP">Internship</option>
                  <option value="SOFT_SKILLS">Soft Skills</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            {/* SECTION 2: Schedule & Applications */}
            <h3 className={styles.sectionTitle}>2. Schedule & Applications</h3>
            <div className={styles.formGrid}>
              <div className={styles.group}>
                <label>Start Date *</label>
                <input type="date" name="start_date" value={form.start_date} onChange={handleChange} required />
              </div>

              <div className={styles.group}>
                <label>End Date *</label>
                <input type="date" name="end_date" value={form.end_date} onChange={handleChange} required />
              </div>

              <div className={styles.group}>
                <label>Application Closing Date (Optional)</label>
                <input type="datetime-local" name="application_end_date" value={form.application_end_date} onChange={handleChange} />
                <span className={styles.helperText}>Deadline for new applications.</span>
              </div>
            </div>

            {/* SECTION 3: Eligibility */}
            <h3 className={styles.sectionTitle}>3. Eligibility</h3>
            <div className={styles.formGrid}>
              <div className={styles.group}>
                <label>Maximum Students *</label>
                <input type="number" name="max_students" value={form.max_students} onChange={handleChange} min="1" required />
              </div>
            </div>

            {/* SECTION 4: Student Access & Communication */}
            <h3 className={styles.sectionTitle}>4. Student Access & Communication</h3>
            <div className={styles.formGrid}>
              <div className={styles.group}>
                <label>WhatsApp Group Link (Optional)</label>
                <input type="url" name="whatsapp_group_link" value={form.whatsapp_group_link} onChange={handleChange} placeholder="https://chat.whatsapp.com/..." />
                <span className={styles.helperText}>Shown to enrolled students/mentors on the portal.</span>
              </div>
              
              <div className={styles.group}>
                <label>Meeting Link (Optional)</label>
                <input type="url" name="meeting_link" value={form.meeting_link} onChange={handleChange} placeholder="https://meet.google.com/..." />
              </div>

              <div className={styles.group}>
                <label>LST Batch Assignment (Optional)</label>
                <select name="lst_batch" value={form.lst_batch} onChange={handleChange}>
                  <option value="">-- No LST Batch --</option>
                  <option value="BATCH_1">Batch 1</option>
                  <option value="BATCH_2">Batch 2</option>
                </select>
              </div>
            </div>

            {/* SECTION 5: Rules & Regulations */}
            <h3 className={styles.sectionTitle}>5. Rules & Regulations</h3>
            <div className={styles.fullGroup}>
              <label>Cohort-Specific Rules (Optional)</label>
              <textarea 
                name="rules_and_regulations" 
                value={form.rules_and_regulations} 
                onChange={handleChange} 
                placeholder="Enter any specific rules or terms for this cohort..."
                rows={4}
              />
            </div>

            <div className={styles.actions}>
              <button type="submit" disabled={loading} className={styles.submitBtn}>
                {loading ? "Updating..." : "Update Cohort"}
              </button>
              <Link to="/admin/cohorts" className={styles.cancelBtn}>Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditCohort;