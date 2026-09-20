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
    status: "DRAFT",
    start_date: "",
    end_date: "",
    application_end_date: "",
    max_students: 30,
    whatsapp_group_link: "",
    lst_batch: "",
    rules_and_regulations: "",
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
      setError("Please provide the cohort code, course, and both start/end dates.");
      return;
    }

    if (new Date(form.start_date) > new Date(form.end_date)) {
        setError("Start Date cannot be after End Date.");
        return;
    }

    if (form.application_end_date && new Date(form.application_end_date) > new Date(form.start_date)) {
        // Just a warning or strict validation? 
        // Some programs might allow applications after it starts, but usually it's before.
        // We'll let backend decide if it's strict, or we can just pass it.
    }

    if (!currentUser?.id) {
      setError("Your current user profile could not be loaded. Please refresh and try again.");
      return;
    }

    setLoading(true);

    try {
      // Backend expects proper ISO string or null for datetime
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
        whatsapp_group_link: form.whatsapp_group_link.trim() || null,
        rules_and_regulations: form.rules_and_regulations.trim() || null,
        lst_batch: form.lst_batch || null,
        created_by: currentUser.id,
      };

      await apiClient.post(API_ENDPOINTS.COHORTS.BASE, payload);
      setSuccess("Cohort created successfully.");
      setTimeout(() => navigate("/admin/cohorts"), 1000);
    } catch (err) {
      // handle specific DRF field errors
      if (err?.response?.data && typeof err.response.data === 'object' && !err.response.data.detail) {
        const errors = Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(" | ");
        setError(errors || "Unable to create the cohort. Check backend validation.");
      } else {
        const message =
            err?.response?.data?.detail ||
            err?.response?.data?.message ||
            "Unable to create the cohort right now. Check backend validation.";
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
          <h1>Add New Batch / Cohort</h1>
          <p className="text-secondary">Create a new training group and configure its settings.</p>
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
                    {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.name || course.title || course.code}</option>
                    ))}
                </select>
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
                  {loading ? "Creating..." : "Create Cohort"}
                </button>
                <Link to="/admin/cohorts" className={styles.cancelBtn}>Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default AddCohort;
