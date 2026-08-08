import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./EditStudent.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditStudent() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    college: "",
    degree: "",
    specialization: "",
    status: "AVAILABLE",
  });
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadStudent = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.STUDENTS.BY_ID(id));
        const student = response.data || {};
        const user = student.user || {};

        setForm({
          first_name: user.first_name || "",
          last_name: user.last_name || "",
          email: user.email || "",
          phone_number: user.phone_number || "",
          college: student.college || "",
          degree: student.degree || "",
          specialization: student.specialization || "",
          status: student.status || "AVAILABLE",
        });
      } catch (err) {
        console.error("Failed to load student for editing:", err);
        setError("Unable to load student data.");
      } finally {
        setLoadingData(false);
      }
    };

    if (id) {
      loadStudent();
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
        college: form.college.trim(),
        degree: form.degree.trim(),
        specialization: form.specialization.trim(),
        status: form.status,
      };

      await apiClient.patch(API_ENDPOINTS.STUDENTS.BY_ID(id), payload);
      await apiClient.patch(API_ENDPOINTS.USERS.BY_ID((await apiClient.get(API_ENDPOINTS.USERS.ME)).data.id), {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim() || null,
      });
      navigate("/admin/students");
    } catch (err) {
      const message = err?.response?.data?.detail || "Unable to update the student.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Edit Student</h1>

        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

        {loadingData ? (
          <SkeletonLoader variant="form" rows={5} />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <input type="text" name="first_name" value={form.first_name} onChange={handleChange} placeholder="First Name" />
            <input type="text" name="last_name" value={form.last_name} onChange={handleChange} placeholder="Last Name" />
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Email Address" />
            <input type="text" name="phone_number" value={form.phone_number} onChange={handleChange} placeholder="Phone Number" />
            <input type="text" name="college" value={form.college} onChange={handleChange} placeholder="College" />
            <input type="text" name="degree" value={form.degree} onChange={handleChange} placeholder="Degree" />
            <input type="text" name="specialization" value={form.specialization} onChange={handleChange} placeholder="Specialization" />

            <select name="status" value={form.status} onChange={handleChange}>
              <option value="AVAILABLE">Available</option>
              <option value="BUSY">Busy</option>
              <option value="NOT_AVAILABLE">Not Available</option>
            </select>

            <div className={styles.buttons}>
              <button type="submit" disabled={loading}>{loading ? "Updating..." : "Update Student"}</button>
              <Link to="/admin/students">Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditStudent;