import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./EditMentor.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditMentor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadMentor = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.USERS.BY_ID(id));
        const mentor = response.data || {};
        setForm({
          first_name: mentor.first_name || "",
          last_name: mentor.last_name || "",
          email: mentor.email || "",
          phone_number: mentor.phone_number || "",
          is_active: mentor.is_active !== false,
        });
      } catch (err) {
        console.error("Failed to load mentor for editing:", err);
        setError("Unable to load mentor data.");
      } finally {
        setLoadingData(false);
      }
    };

    if (id) {
      loadMentor();
    }
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim() || null,
        is_active: form.is_active,
      };

      await apiClient.put(API_ENDPOINTS.USERS.BY_ID(id), payload);
      navigate("/admin/mentors");
    } catch (err) {
      const message = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Unable to update the mentor.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Edit Mentor</h1>
        <p className={styles.subtitle}>Update mentor information.</p>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

        {loadingData ? (
          <SkeletonLoader variant="form" rows={4} />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.group}>
              <label>First Name</label>
              <input type="text" name="first_name" value={form.first_name} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Last Name</label>
              <input type="text" name="last_name" value={form.last_name} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Phone Number</label>
              <input type="tel" name="phone_number" value={form.phone_number} onChange={handleChange} />
            </div>

            <div className={styles.group}>
              <label>Active</label>
              <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
            </div>

            <div className={styles.buttons}>
              <button type="submit" className={styles.updateBtn} disabled={loading}>
                {loading ? "Saving..." : "Update Mentor"}
              </button>
              <Link to="/admin/mentors" className={styles.cancelBtn}>Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditMentor;
